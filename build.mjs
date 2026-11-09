// 分割版（index.html + style.css + *.js + vendor/）から、ダブルクリックで開ける単一HTML版を作る。
//   node build.mjs            → dist/diff-pdf.html
// 依存パッケージなし（Node.js 18 以降）。
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const VENDOR = "vendor/pdfjs";

// インライン化する JS / CSS に "</script" や "</style" があると HTML が壊れるので確認する
function guard(name, text, tag) {
  if (text.toLowerCase().includes(`</${tag}`)) throw new Error(`${name} に </${tag} が含まれている`);
  return text;
}
// 置換文字列中の "$&" などを解釈させないよう、関数で置換する
function replaceOnce(html, pattern, make) {
  let n = 0;
  const out = html.replace(pattern, (...m) => { n++; return make(...m); });
  if (n !== 1) throw new Error(`${pattern} の一致が ${n} 件（1 件のはず）`);
  return out;
}
const b64dir = (dir, filter) =>
  Object.fromEntries(
    readdirSync(join(root, dir))
      .filter(filter)
      .sort()
      .map((f) => [f, readFileSync(join(root, dir, f)).toString("base64")])
  );

const cmaps = Object.fromEntries(
  Object.entries(b64dir(`${VENDOR}/cmaps`, (f) => f.endsWith(".bcmap"))).map(([f, v]) => [f.replace(/\.bcmap$/, ""), v])
);
const fonts = b64dir(`${VENDOR}/standard_fonts`, (f) => /\.(pfb|ttf)$/.test(f));

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "worker-src blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data: blob:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

let html = read("index.html");
html = replaceOnce(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*">/, () =>
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
html = replaceOnce(html, /<!-- 分割版の CSP。[^\n]*-->\n/, () => "");
html = replaceOnce(html, /<link rel="stylesheet" href="style\.css">/, () =>
  `<style>\n${guard("style.css", read("style.css"), "style")}</style>`);
html = replaceOnce(html, /<a [^>]*data-build="remove"[^>]*>.*?<\/a>/, () => "");
html = replaceOnce(html, /<script src="vendor\/pdfjs\/pdf\.min\.js"><\/script>/, () =>
  `<script type="text/plain" id="pdfjs-worker">${guard("pdf.worker.min.js", read(`${VENDOR}/pdf.worker.min.js`), "script")}</script>\n` +
  `<script>${guard("pdf.min.js", read(`${VENDOR}/pdf.min.js`), "script")}</script>\n` +
  `<script>const CMAPS=${JSON.stringify(cmaps)};\nconst FONTS=${JSON.stringify(fonts)};</script>`);
// 残りの <script src="*.js">（diff.js・layout.js・visual.js・app.js など）を順にインライン化
html = html.replace(/<script src="([\w.-]+\.js)"><\/script>/g, (_, f) =>
  `<script>\n${guard(f, read(f), "script")}</script>`);
if (/<(script|link)[^>]+(src|href)=/.test(html)) throw new Error("インライン化されていない外部参照が残っている");

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/diff-pdf.html"), html);
console.log(`dist/diff-pdf.html (${(html.length / 1024 / 1024).toFixed(1)} MB, CMap ${Object.keys(cmaps).length}, フォント ${Object.keys(fonts).length})`);
