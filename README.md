# persian-markdown-textarea

A custom `<pmd-textarea>` web component for live, bi-directional (RTL/LTR) Markdown editing — with full support for Persian, Arabic, and Latin text.  
Built on [ShahNeshan](https://github.com/shahrooz/shahneshan) for fast and accurate Markdown rendering.

---

## 📦 CDN Installation

Load directly from JSDelivr:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/ShahroozD/pmd-textarea/index.js"></script>
````

---

## 🚀 Usage

Add to your HTML:

```html
<pmd-textarea
  id="myEditor"
  placeholder="Type your message..."
  default-direction="rtl">
</pmd-textarea>
```

Set/get the value with JavaScript:

```js
const el = document.getElementById('myEditor');
el.value = "# درود بر شما\nHello World\n**Bold**";
el.setSelectionRange(6); // Place caret at position 6
```

---

## ⚙️ API

| Attribute           | Description                                 | Example             |
| ------------------- | ------------------------------------------- | ------------------- |
| `placeholder`       | Placeholder text                            | `placeholder="..."` |
| `value`             | Initial Markdown value                      | `value="**Bold!**"` |
| `default-direction` | Default text direction if not auto-detected | `rtl` or `ltr`      |

**Properties:**

* `el.value` — Get/set the raw Markdown
* `el.setSelectionRange(start, end = start)` — Set caret/selection

**Events:**

* `input` — Fires on every content change

---

## 📄 License

GPLv3
