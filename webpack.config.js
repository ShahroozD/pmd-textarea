const path = require('path');
// only if you extract to a separate CSS file
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: './src/pmd-textarea.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pmd-textarea.umd.js',
    library: 'PMdTextArea',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      },
      {
        test: /\.css$/,
        // if you want <style> tags injected:
        use: [
          'style-loader',
          'css-loader'
        ]
        // OR, to extract into a .css file instead:
        // use: [
        //   MiniCssExtractPlugin.loader,
        //   'css-loader'
        // ]
      }
    ]
  },
  plugins: [
    // only if you use MiniCssExtractPlugin.loader above:
    new MiniCssExtractPlugin({
      filename: 'pmd-textarea.css'
    })
  ]
};
