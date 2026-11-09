# diff-pdf

PDF ファイルを 2 つドラッグ＆ドロップすると、差分を表示する Web アプリ。

## 特徴

- **ファイルはアップロードされない**：読み込みと比較はすべてブラウザ内で行う。
  Content-Security-Policy で外部への通信も禁止している（単一HTML版は `connect-src 'none'`、分割版は同一オリジンのみ）。
  ライブラリ（[PDF.js](https://mozilla.github.io/pdf.js/)）と日本語表示に必要な CMap・標準フォントも
  `vendor/` に同梱しており、CDN からは読み込まない。
- **テキスト差分**：各ページからテキストを抽出し、行単位（Myers のアルゴリズム）で比較する。
  変更された行は文字単位の差分も強調表示する。
  - 空白の違いを無視（英数字の単語の間の空白は区切りとして残す。`a b` と `ab` は別物）／全角・半角を同一視／大文字・小文字を無視
  - 段組みを考慮：文字の位置から段組みを判定し（XY-cut）、段ごとに上から読む。縦書きのページは内容の順のまま
  - 行を連結し文単位で比較（改行位置の違いを吸収）
  - 変更箇所のみ表示（前後 2 行の文脈つき）
  - 変更ブロック間の移動（`n` / `j` で次、`p` / `k` で前）
- **見た目の差分**：ページを画像化してピクセル単位で比較し、A のみ・B のみの部分を色分けして表示する。
  - ページを自動対応：テキスト差分の結果から A と B のページを対応付ける。ページの挿入・削除があっても以降のページがずれない
  - ずれを補正：ページを行の帯に分けて A と B の帯を対応付けてから比べるので、行の挿入・削除で以降が下にずれても、変わった行だけが差分になる
    （帯はページの全幅で区切るため、段組みの片方の段だけがずれた場合は補正しきれない）
  - A と B で別々のページ番号を指定できる（空欄は「そのページなし」）
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
node --test test/*.test.js  # 差分計算・段組み・画像比較のテスト
```

`main` に push すると GitHub Actions がテスト・ビルドを行い、分割版と `diff-pdf.html` を Pages に公開する。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 画面 |
| `app.js` | PDF の読み込み、テキスト抽出、差分表示 |
| `diff.js` | テキストの差分計算と正規化（DOM 非依存） |
| `layout.js` | テキスト項目から行を組み立てる（段組みの判定、DOM 非依存） |
| `visual.js` | ページの対応付けと画像の比較（ずれの補正、DOM 非依存） |
| `style.css` | スタイル |
| `build.mjs` | 単一HTML版のビルド |
| `test/` | `diff.js`・`layout.js`・`visual.js` のテスト |
| `vendor/pdfjs/` | PDF.js 3.11.174（`pdfjs-dist` の `build/pdf.min.js`・`build/pdf.worker.min.js`・`cmaps/`・`standard_fonts/`、Apache-2.0 ほか各 LICENSE 参照） |

## ライセンス

[MIT License](LICENSE)。ただし `vendor/pdfjs/` の PDF.js は Apache License 2.0（`vendor/pdfjs/LICENSE`）、
同梱の CMap・標準フォントはそれぞれのディレクトリ内の LICENSE ファイルに従う。
