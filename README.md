# diff-pdf

PDF ファイルを 2 つドラッグ＆ドロップすると、差分を表示する Web アプリ。

## 特徴

- **ファイルはアップロードされない**：読み込みと比較はすべてブラウザ内で行う。
  Content-Security-Policy で外部への通信も禁止している（単一HTML版は `connect-src 'none'`、分割版は同一オリジンのみ）。
  ライブラリ（[PDF.js](https://mozilla.github.io/pdf.js/)）と日本語表示に必要な CMap・標準フォントも
  `vendor/` に同梱しており、CDN からは読み込まない。
- **テキスト差分**：各ページからテキストを抽出し、行単位（Myers のアルゴリズム）で比較する。
  変更された行は文字単位の差分も強調表示する。
  - 空白を無視／全角・半角を同一視／大文字・小文字を無視
  - 行を連結し文単位で比較（改行位置の違いを吸収）
  - 変更箇所のみ表示（前後 2 行の文脈つき）
  - 変更ブロック間の移動（`n` / `j` で次、`p` / `k` で前）
- **見た目の差分**：ページを画像化してピクセル単位で比較し、A のみ・B のみの部分を色分けして表示する。
  - A と B で別々のページ番号を指定できる
  - 感度の調整
  - 全ページを走査し、差分のあるページを一覧表示

## 使い方

https://dfukagaw28.github.io/diff-pdf/ を開いてファイルをドロップする。

### オフラインで使う（単一HTML版）

ページ上部の「単一HTML版をダウンロード」から `diff-pdf.html` を保存し、ダブルクリックで開く。
すべて 1 ファイルに埋め込まれているので、サーバもネットワークも不要。

### ローカルで開発する

分割版はワーカーや CMap を `fetch` で読み込むため、`file://` では動かない。ローカルサーバで開く。

```sh
python3 -m http.server
# http://localhost:8000/ を開く
```

単一HTML版のビルドとテスト（Node.js 18 以降、依存パッケージなし）：

```sh
node build.mjs              # → dist/diff-pdf.html
node --test test/*.test.js  # 差分計算のテスト
```

`main` に push すると GitHub Actions がテスト・ビルドを行い、分割版と `diff-pdf.html` を Pages に公開する。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 画面 |
| `app.js` | PDF の読み込み、テキスト抽出、差分表示 |
| `diff.js` | 差分計算（DOM 非依存） |
| `style.css` | スタイル |
| `build.mjs` | 単一HTML版のビルド |
| `test/` | `diff.js` のテスト |
| `vendor/pdfjs/` | PDF.js 3.11.174（`pdfjs-dist` の `build/pdf.min.js`・`build/pdf.worker.min.js`・`cmaps/`・`standard_fonts/`、Apache-2.0 ほか各 LICENSE 参照） |
