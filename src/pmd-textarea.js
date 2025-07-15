import { markdownToOutput } from 'shahneshan';

class PMdTextArea extends HTMLElement {
  // Private fields
  #pendingValue = null;
  #isConnected = false;
  #defaultDirection = 'rtl';
  #lastRowIndex = null;
  #currentSpan = null;
  #currentSpans   = [];
  _suppressSelectionChange = false;

  constructor() {
    super();
    // Bind handlers
    this._onCut = this._onCut.bind(this);
    this._onCopy = this._onCopy.bind(this);
    this._onPaste = this._onPaste.bind(this);
    this._onInput    = this._onInput.bind(this);
    this._onKeyDown  = this._onKeyDown.bind(this);
    this._onFocusIn  = this._onFocusIn.bind(this);
    this._onFocusOut = this._onFocusOut.bind(this);
    this._onSelectAll = this._onSelectAll.bind(this);
    this._onSelectionChange = this._onSelectionChange.bind(this);
  }

  static get observedAttributes() {
    return ['placeholder', 'value', 'default-direction'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    switch (name) {
      case 'placeholder':
        this._updatePlaceholder();
        break;
      case 'value':
        this.value = newVal;
        break;
      case 'default-direction':
        this.#defaultDirection = newVal === 'ltr' ? 'ltr' : 'rtl';
        this._updateParagraphDirs();
        break;
    }
  }

  connectedCallback() {
    if (this.#isConnected) return;
    this.#isConnected = true;

    const shadow = this.attachShadow({ mode: 'open' });

    
    shadow.innerHTML = PMdTextArea.template;


    if (!this._shahneshanCloned) {
      // find the <style> in <head> that was injected by style-loader
      const globalStyle = Array.from(document.head.querySelectorAll('style'))
        .find(el => el.textContent.includes('This file is part of Shahneshan'));
      
      if (globalStyle) {
        // clone it into this component’s shadowRoot
        this.shadowRoot.appendChild(globalStyle.cloneNode(true));
      }

      this._shahneshanCloned = true;
    }

    this.editable = shadow.querySelector('.editable');
    this.editable.innerHTML = '<span><p>\u200B</p></span>';

    // Event listeners
    this.editable.addEventListener('input', this._onInput);
    this.editable.addEventListener('keydown', this._onKeyDown);
    this.editable.addEventListener('focusin', this._onFocusIn);
    this.editable.addEventListener('focusout', this._onFocusOut);
    this.editable.addEventListener('paste', this._onPaste.bind(this));
    document.addEventListener('selectionchange', this._onSelectionChange);


    this._updatePlaceholder();
    this._updatePlaceholderState();

    // Apply any pre-set value
    if (this._hasPendingValue) {
      this.value = this.#pendingValue;
      this.#pendingValue = null;
    } else if (this.hasAttribute('value')) {
      this.value = this.getAttribute('value');
    }
  }


  disconnectedCallback() {
    // clean up when the element is removed
    document.removeEventListener('selectionchange', this._onSelectionChange);
  }


  splitSpanAtCursor() {
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);

    // 1) find the two boundary spans under start/end of the selection
    const findSpan = (container, offset) => {
      let node = container.nodeType === Node.TEXT_NODE
        ? container
        : (container.childNodes[offset] || container);
      return node.nodeType === Node.TEXT_NODE
        ? node.parentNode.closest('span')
        : node.closest('span');
    };

    const firstSpan = findSpan(range.startContainer, range.startOffset);
    const lastSpan  = findSpan(range.endContainer,   range.endOffset);
    if (!firstSpan || !lastSpan) return null;

    // 2) helper to compute char offset within raw markdown
    const computeOffset = (span, container, offsetInNode) => {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null, false);
      let idx = 0, node;
      while ((node = walker.nextNode())) {
        if (node === container) {
          return idx + offsetInNode;
        }
        idx += node.textContent.length;
      }
      return 0;
    };

    // 3) slice out before/after exactly at those offsets
    const rawFirst = firstSpan.getAttribute('data-original') || '';
    const rawLast  = lastSpan .getAttribute('data-original') || '';
    const offFirst = computeOffset(firstSpan, range.startContainer, range.startOffset);
    const offLast  = computeOffset(lastSpan,  range.endContainer,   range.endOffset);

    const before = rawFirst.slice(0, offFirst);
    const after  = rawLast .slice(offLast);

    // 4) always return, even if before==='' && after===''
    return { before, after, firstSpan, lastSpan };
  }




  // HTML + CSS template
  static get template() {
    return `
      <div class="editable" contenteditable="true"></div>
      <style>
        :host {
          display: block;
          border: 1px solid #ccc;
          height: 100%;
        }
        .editable {
          outline: none;
          padding: 10px;
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          min-width: 90px;
          min-height: 150px;
          white-space: pre-wrap;
          position: relative;
        }
        .editable[data-empty="true"]::before {
          content: attr(data-placeholder);
          color: #aaa;
          position: absolute;
          top: 10px;
          left: 10px;
          pointer-events: none;
          white-space: pre-wrap;
        }
        .editable span {
          display: block;
          margin-bottom: 10px;
        }
        .editable span:last-child {
          margin-bottom: 0;
        }
                  .editable[data-empty="true"]::before {
          content: attr(data-placeholder);
          color: #aaa;
          pointer-events: none;
          display: block;
          white-space: pre-wrap;
          position: absolute;
        }
        .editable span p {
          margin: 0 0 10px;
        }

        .editable ul, 
        .editable ol,
        .editable li p{
          margin: 0;
        }

        .editable blockquote{
          margin: 0 40px;
        }
      </style>
    `;
  }

  // ----- Event Handlers -----

  // NEW: Select entire editor content, restoring raw text for copy
  _onSelectAll() {
    const sel   = this.shadowRoot.getSelection();
    sel.removeAllRanges();

    // restore raw markdown text as before
    this.editable.querySelectorAll('span').forEach(span => {
      span.textContent = span.getAttribute('data-original') || '';
    });

    // now select the actual <span> elements
    const range = document.createRange();
    range.selectNodeContents(this.editable);
    sel.addRange(range);
  }

  // Copy raw markdown
  _onCopy(e) {
    e.preventDefault();
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return;
    const saved = this._saveSelection();
    if (!saved) return;
    const raw = this.value.slice(saved.start, saved.end);
    e.clipboardData.setData('text/plain', raw);
  }

  // Cut raw markdown
  _onCut(e) {
    e.preventDefault();
    this._onCopy(e);
    // delete selected contents
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    this._updatePlaceholderState();
    this._updateParagraphDirs();
    this.dispatchEvent(new Event('input'));
  }

  _onInput(e) {
    const sel = this.shadowRoot.getSelection();
    if (sel.rangeCount) {
      let node = sel.anchorNode;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const span = node.closest('span');
      if (span) span.setAttribute('data-original', span.textContent);
    }
    this._updatePlaceholderState();
    this._updateParagraphDirs();
    this.dispatchEvent(new Event('input'));
  }

  _onKeyDown(e) {

    // INTERCEPT CTRL+A for select-all
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this._onSelectAll();
      return;
    }
    if (e.key === 'Enter') this._onEnter(e);
    else if (e.key === 'Backspace' || e.key === 'Delete') this._onRemove(e);
    else return;
  }

  _onEnter(e){
    e.preventDefault();
    
    // 1) ensure the editable has focus so document.getSelection() is valid
    this.editable.focus();
  
    // 2) grab the real (document-level) selection & range
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
  
    // 3) find the current <span> to inherit its direction
    let container = range.startContainer;
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentNode;
    }
    const currentSpan = container.closest('span');



    const raw = currentSpan?.getAttribute('data-original') ?? currentSpan.textContent;

    // 3) if it’s a code-fence or an ordered-list item, just append “\n” and re-render
    const isFence = /^(```|\.\.\.)/.test(raw.trim());
    const isOrdered = /^[\d\u06F0-\u06F9]+\.\s/.test(raw);
    const isTableRow = /^\s*\|\s*([^|]+\|)+/.test(raw);

    // have we already added one newline?
    const hadNL = raw.endsWith('\n\n');
    if ((isFence || isOrdered || isTableRow)&& !hadNL) {
      const newRaw = raw + '\n\n';
      currentSpan.setAttribute('data-original', newRaw);
      // currentSpan.innerHTML = markdownToOutput(newRaw);
      currentSpan.textContent = newRaw;
      // move caret to end of this span
      const textNode = (() => {
        // descend into the last text node
        let n = currentSpan;
        while (n.lastChild && n.lastChild.nodeType !== Node.TEXT_NODE) {
          n = n.lastChild;
        }
        return (
          n.nodeType === Node.TEXT_NODE
            ? n
            : currentSpan.appendChild(document.createTextNode(''))
        );
      })();

      const newRange = document.createRange();
      newRange.setStart(textNode, textNode.textContent.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      this._updatePlaceholderState();
      this._updateParagraphDirs();
      this.dispatchEvent(new Event('input'));
      return;  // ↪️ skip your split-span logic
    }

    // figure out the char index within the raw string
    // (we count characters up to the range.startOffset in the TEXT node)
    let charIndex = range.startOffset;
    // if you need to handle multiple text nodes, you'd walk them—but
    // assuming your span has a single text node or you're OK approximating:
    
    // 3) split into before & after
    const beforeText = raw.slice(0, charIndex);
    const afterText  = raw.slice(charIndex);


    const rawText = currentSpan?.getAttribute('data-original') ?? container.textContent;
    const dir = this.detectDir(rawText) || this.#defaultDirection;
  

    // 4) update the existing span to show only the “before” part
    
    if(beforeText.trim()) {
      currentSpan.setAttribute('data-original', beforeText);
      currentSpan.innerHTML = markdownToOutput(beforeText)
    }
    else currentSpan.innerHTML =  "<p>\u200B</p>";

    // 4) build the new empty line
    const newSpan = document.createElement('span');
    newSpan.dir = dir;
    newSpan.setAttribute('data-original', afterText); // initialize data-original
    const p = document.createElement('p');
    
    p.innerHTML = afterText || '\u200B';
    newSpan.appendChild(p);
    
    // 5) insert it right after the old span (or at the caret as fallback)
    if (currentSpan && currentSpan.parentNode) {
      currentSpan.parentNode.insertBefore(newSpan, currentSpan.nextSibling);
    } else {
      range.deleteContents();
      range.insertNode(newSpan);
    }
  
    // 6) move the caret into the new <p>
    const newRange = document.createRange();
    let target = p.firstChild;
    if (!target || target.nodeName === 'BR') {
      // ensure there’s a text node to place the cursor inside
      target = document.createTextNode('');
      p.appendChild(target);
    }
    newRange.setStart(target, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  
    // 7) update visuals and notify
    this._updatePlaceholderState();
    this._updateParagraphDirs();
    this.dispatchEvent(new Event('input'));
  }

  _onRemove(e){
    e.preventDefault();
    // console.log("e.key", e.key);

      const sel = this.shadowRoot.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Find the <span> we’re editing
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        const span = node.closest('span');
      if (!span) return;

      // Get raw text and caret offset
      const raw = span.getAttribute('data-original') ?? span.textContent;
      let offset = range.startOffset;
      // console.log(range);
      
      this.editable.focus();

      // CASE A: there's a selection → delete it
      if (!range.collapsed) {
        
        range.deleteContents();

        this.editable.querySelectorAll('span').forEach(span => {
          if (!span.textContent.trim()) span.remove();
        });

        // 2) If that just nuked every span, re-seed one ZWS span:
        const newSpan = document.createElement('span');
        // rebuild raw from DOM (or just strip out the selected substring from `raw`)
        // for simplicity, we’ll re-sync from textContent:
        const updated = newSpan.textContent;
        newSpan.setAttribute('data-original', updated);
        newSpan.innerHTML = updated ? updated : '<p>\u200B</p>';
        range.insertNode(newSpan);
        this._placeCaret(newSpan, offset);
      } else {
        // CASE B: collapsed cursor → single-char remove
        let newRaw;
        
        if (e.key === 'Backspace') {
          if (offset === 0) {
            // at start of this span → merge into previous span
            const prev = span.previousElementSibling;
            console.log("prev", prev);
            
            if (prev) {
              const prevRaw = prev.getAttribute('data-original') ?? prev.textContent;
              const merged = prevRaw + raw;
              prev.setAttribute('data-original', merged);
              prev.innerHTML = `<p>${merged}</p>`;
              span.remove();
              this._placeCaret(prev, prevRaw.length);
            }
            return;
          }


          newRaw = raw.slice(0, offset - 1) + raw.slice(offset);
          offset = offset - 1;
        } else { // Delete key
          if (offset >= raw.length) {
            // at end of span → merge next span
            const next = span.nextElementSibling;
            if (next) {
              const nextRaw = next.getAttribute('data-original') ?? next.textContent;
              const merged = raw + nextRaw;
              span.setAttribute('data-original', merged);
              // console.log("----------------------");
              
              span.innerHTML = merged;
              next.remove();
              this._placeCaret(span, raw.length);
            }
            return;
          }
          
          newRaw = raw.slice(0, offset) + raw.slice(offset + 1);
        }

        // sync span
        span.setAttribute('data-original', newRaw);
        span.innerHTML = newRaw ?? '<p>\u200B</p>';
        this._placeCaret(span, offset);
      }            

      // update visuals + notify
      this._updatePlaceholderState();
      this._updateParagraphDirs();

      // ← ADD THIS BLOCK:
      if (!this.editable.querySelector('span').innerHTML) {
        // nukes everything in the editable
        // this.editable.innerHTML = '<span data-original=" "><p> </p></span>';


        // nukes everything in the editable
        this.editable.innerHTML = '';

        const span = document.createElement('span');
        span.dir = this.#defaultDirection;
        span.setAttribute('data-original', '');
        span.innerHTML = '<p> </p>';

        this.editable.appendChild(span);
        this._placeCaret(span, 0);

      }

      this.dispatchEvent(new Event('input'));


      return;
  }

  _onFocusIn(e) {
    // const span = e.target.closest('span');
    // if (!span || span === this.#currentSpan) return;
    // this.#currentSpan = span;
    // const originData = span.getAttribute('data-original');
    // if(originData) span.textContent = originData;
  }

  _onFocusOut(e) {
    // const span = e.target.closest('span');
    // if (span !== this.#currentSpan) return;
    // this._renderSpan(span);
    // this.#currentSpan = null;
  }

  _onSelectionChange() {
    // 1) if we’re in the middle of a restore, ignore this one call
    if (this._suppressSelectionChange) {
      this._suppressSelectionChange = false;
      return;
    }

    // grab the selection & range
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // const bac_range0 = {startOffset: range.startOffset, endOffset: range.endOffset}
    // const bac_range = this._saveSelection();
    // 2) if the caret isn’t in our editable at all, treat it like "leaving"
    if (
      !this.editable.contains(range.startContainer) &&
      !this.editable.contains(range.endContainer)
    ){
      // if (this.#currentSpan) {
      //   this._renderSpan(this.#currentSpan);
      //   this.#currentSpan = null;
      // }
      if (this.#currentSpan) {
        this.#currentSpans.forEach(span => this._renderSpan(span));
        this.#currentSpans = [];
      }
      return;
    }

    // figure out which span the caret is in
    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    this.#currentSpan = node.closest('span');
    if (!this.#currentSpan) return;

    // Get every span under the editable
    const allSpans = Array.from(this.editable.querySelectorAll('span'));
    const idx = allSpans.indexOf(this.#currentSpan);
    
    // Find spans whose node‐contents intersect the selection
    const newSpans = allSpans.filter(span => {
      const spanRange = document.createRange();
      spanRange.selectNodeContents(span);
      // selection.start < span.end  &&  selection.end > span.start
      return (
        range.compareBoundaryPoints(Range.END_TO_START, spanRange) < 0 &&
        range.compareBoundaryPoints(Range.START_TO_END, spanRange) > 0
      );
    });

    // Render-away any spans we previously “had” but now lost
    this.#currentSpans
      .filter(oldSpan => !newSpans.includes(oldSpan))
      .forEach(span => this._renderSpan(span));

    // For any newly selected spans, restore their raw text
    const saved = this._saveSelection();
    newSpans
      .filter(span => !this.#currentSpans.includes(span))
      .forEach(span => {
        const originData = span.getAttribute('data-original') ?? span.textContent;
        const element = originData?.charAt(0)=='#'? span.children[0]:span;
        if(originData.trim()) element.innerHTML = originData;
    });


    // Replace our “current” list
    this.#currentSpans = newSpans;
// console.log(range); 
// console.log(bac_range);

// range.setStart(bac_range.startOffset);
// range.setEnd(bac_range.endOffset);
    const first_visit = (this.#lastRowIndex != idx)
    // restore the caret right where it was
    this._suppressSelectionChange = true;
    this._restoreSelection(saved, first_visit);
    this.#lastRowIndex = idx;
    // this.editable.focus();
    // this._restoreSelection(saved);
  }


  _onPaste(e) {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text/plain');
    if (!pasteText) return;

    // 1) split selection into before/after + boundary spans
    const split = this.splitSpanAtCursor();
    // console.log(split);
    if (!split) return;
    const { before, after, firstSpan, lastSpan } = split;

    

    const parent = firstSpan.parentNode;

    // 2) break pasted text into lines
    const lines = pasteText.split(/\r\n|\r|\n/);

    // 3) build a fragment of new spans
    const frag = document.createDocumentFragment();

    // 3a) first new span: before + first pasted line
    const firstRaw = before + lines[0];
    const firstNew = document.createElement('span');
    firstNew.dir = this.detectDir(firstRaw);
    firstNew.setAttribute('data-original', firstRaw);
    firstNew.innerHTML = markdownToOutput(firstRaw);
    frag.appendChild(firstNew);

    // 3b) any middle lines
    let pastedLine = "";
    let isBlock = false;


    for (let i = 1; i < lines.length; i++) {
      const rawLine = lines[i];
      // 2) detect “block” paste: code-fence, ordered list or table row
      const blockRaw = rawLine.trim();
      const isFencePaste     = /^(```|\.\.\.)/.test(blockRaw);
      const isOrderedPaste   = /^[\d\u06F0-\u06F9]+\.\s/m.test(blockRaw);
      const isTableRowPaste  = /^\s*\|\s*([^|]+\|)+/.test(blockRaw);


      pastedLine += `${rawLine}\n`;


      if (isOrderedPaste) {
        continue;
      }

      if (isFencePaste || isTableRowPaste || isBlock) {

        if(isFencePaste || isTableRowPaste){
          isBlock = !isBlock;

        }
       
        if(isBlock) continue;
        
      }
      
      
      const sp = document.createElement('span');
      sp.dir = this.detectDir(pastedLine);
      sp.setAttribute('data-original', pastedLine);
      sp.innerHTML = markdownToOutput(pastedLine);
      frag.appendChild(sp);

      pastedLine = "";
    }

    // 3c) append the “after” tail onto the last new span
    const lastNew = frag.lastChild;
    const lastRaw = lastNew.getAttribute('data-original') + after;
    lastNew.setAttribute('data-original', lastRaw);
    lastNew.innerHTML = markdownToOutput(lastRaw);

    // 4) insert the new fragment before the first old span
    parent.insertBefore(frag, firstSpan);

    // 5) remove exactly the old spans from firstSpan through lastSpan
    let node = firstSpan;
    while (node) {
      const next = node.nextSibling;
      parent.removeChild(node);
      if (node === lastSpan) break;
      node = next;
    }

    // 6) place caret at the boundary before “after”
    const caretPos = lastRaw.length - after.length;
    this._placeCaret(lastNew, caretPos);

    // 7) update visuals & fire input
    this._updatePlaceholderState();
    this._updateParagraphDirs();
    this.dispatchEvent(new Event('input'));
  }



  // ----- Helpers -----

  get _hasPendingValue() {
    return this.#pendingValue !== null;
  }

  // helper to position caret at `charIndex` inside the first text node of a span
  _placeCaret(span, charIndex) {
    const sel = this.shadowRoot.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();

    // find (or create) a text node
    let textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      textNode = document.createTextNode(span.textContent);
      span.innerHTML = '';
      span.appendChild(textNode);
    }

    const pos = Math.min(charIndex, textNode.textContent.length);
    range.setStart(textNode, pos);
    range.collapse(true);
    sel.addRange(range);
  }


  _updatePlaceholder() {
    const text = this.getAttribute('placeholder') || '';
    this.editable?.setAttribute('data-placeholder', text);
  }

  _isEmpty() {
    const txt = this.editable.textContent.trim();
    return txt === '' || txt === '\u200B';
  }

  _updatePlaceholderState() {
    this.editable.setAttribute('data-empty', this._isEmpty());
  }
  detectDir(text) {
    const rtlRe = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  
    if (!text) return this.#defaultDirection;
  
    // strip markdown markers…
    const stripped = text.replace(
      /^[\s]*(?:[#>*_\-+~`]+|\d+\.)[\s]*/g,
      ''
    );
    const firstChar = stripped.charAt(0);
    if (!firstChar) return this.#defaultDirection;
  
    // ——— NEW: when default is RTL, but the line
    // starts with a Latin letter or digit, force LTR
    if (this.#defaultDirection === 'rtl') {
      const latinRe = /[A-Za-z0-9]/;
      return (latinRe.test(firstChar)) ? 'ltr':'rtl' ;
      
    }
    
    // otherwise fall back to your normal RTL detection
    return rtlRe.test(firstChar) ? 'rtl' : 'ltr';
  }

  _updateParagraphDirs() {
    this.editable.querySelectorAll('span').forEach(span => {
      const originData = span.getAttribute('data-original');
      span.dir = this.detectDir(originData);
    });
  }

  _renderAllSpans() {
    this.editable.querySelectorAll('span').forEach(span => this._renderSpan(span));
  }

  _renderSpan(span) {
    if (!span) return;
    const raw = span.getAttribute('data-original') || span.textContent;

    if(raw.trim()){
      span.setAttribute('data-original', raw);
      span.innerHTML = markdownToOutput(raw);
      span.dir = this.detectDir(raw);

    }
  }

  // Value property: plain text with newlines
  get value() {
    return Array.from(this.editable.querySelectorAll('span'))
      .map(s => s.getAttribute('data-original') ?? s.textContent)
      .join('\n');
  }

  set value(text) {
    if (!this.editable) {
      this.#pendingValue = text;
      return;
    }
    const lines = String(text || '').split('\n');
    this.editable.innerHTML = lines.map(line => {
      const dir = this.detectDir(line);
      const esc = line.replace(/"/g, '&quot;');
      return `<span dir="${dir}" data-original="${esc}">${markdownToOutput(line)}</span>`;
    }).join('');
    this._updatePlaceholderState();
  }

  // Selection saving/restoring
  _saveSelection() {
    const sel = this.shadowRoot.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const spans = Array.from(this.editable.children);
    let absIdx = 0;

    // Helper walker factory:
    const walkerFor = sp =>
      document.createTreeWalker(sp, NodeFilter.SHOW_TEXT, null, false);

    // Find character offset of a given container/offset:
    const getOffset = (container, offset) => {
      let idx = 0;
      spansLoop:
      for (let sp of spans) {
        const walker = walkerFor(sp);
        let node;
        while (node = walker.nextNode()) {
          if (node === container) {
            return idx + Math.min(Math.max(offset, 0), node.textContent.length);
          }
          idx += node.textContent.length;
        }
        // count the “\n” between spans (but not after the last)
        idx += 1;
      }
      return idx;
    };

    const start = getOffset(range.startContainer, range.startOffset);
    const end   = getOffset(range.endContainer,   range.endOffset);
    return { start, end };
  }
    
  _restoreSelection(saved, first_visit = null) {
    if (!saved) return;
    const { start, end } = saved;
    const sel = this.shadowRoot.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    const spans = Array.from(this.editable.children);

    const walkerFor = sp =>
      document.createTreeWalker(sp, NodeFilter.SHOW_TEXT, null, false);

    let idx = 0, foundStart = false;
    let shift = 0

    for (let i = 0; i < spans.length; i++) {
      const sp = spans[i];
      const walker = walkerFor(sp);
      let node;
      while (node = walker.nextNode()) {
        const len = node.textContent.length;
        
        if (!foundStart && start <= idx + len) {
          const ofs = Math.min(Math.max(start - idx, 0), len);
          range.setStart(node, ofs);
          foundStart = true;
        }
        if (foundStart && end <= idx + len) {
          
          const ofs = Math.min(Math.max(end - idx, 0), len);

          // ===================
          if(first_visit){
            // grab the text from the start of the node up to the selection end
              const slice = node.textContent.slice(0, ofs);
  
              // count each marker separately
              const counts = {
                star:    (slice.match(/\*/g)  || []).length,
                tilde:   (slice.match(/~/g)  || []).length,
                backtick:(slice.match(/`/g)  || []).length
              };
  
              // determine how many of the three counts are even
              const evenTypes = Object.values(counts).filter(c => c % 2 === 0).length;
  
              // // log per‑type and overall result
              if (evenTypes === 3) {
                shift = Object.values(counts).reduce((a,b)=>a+b,0)
              }
          }
          // ===================

          range.setEnd(node, ofs+shift);
          if (shift > 0) {
            range.setStart(node, range.startOffset+shift);
          }
          sel.addRange(range);
          return;
        }
        idx += len;
      }
      if (i < spans.length - 1) idx += 1;
    }

    // fallback
    const last = spans[spans.length - 1];
    this._placeCaret(last, last.textContent.length);
  }

  // Programmatic selection
  setSelectionRange(start, end = start) {
    if (!this.editable) return;
    const range = document.createRange();
    const sel   = this.shadowRoot.getSelection();
    sel.removeAllRanges();

    let pos = 0, startNode = null, endNode = null;
    const walker = document.createTreeWalker(this.editable, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const len  = node.textContent.length;
      if (!startNode && pos + len >= start) {
        startNode = node;
        range.setStart(node, start - pos);
      }
      if (!endNode && pos + len >= end) {
        endNode = node;
        range.setEnd(node, end - pos);
        break;
      }
      pos += len;
    }

    if (!startNode) startNode = this.editable;
    if (!endNode)   endNode   = this.editable;

    sel.addRange(range);
  }
}

customElements.define('pmd-textarea', PMdTextArea);
