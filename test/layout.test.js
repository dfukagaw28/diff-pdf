"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { streamLines, layoutLines, pageLines } = require("../layout.js");
const { normalize } = require("../diff.js");

// 文字幅を 0.5em とした項目
const item = (s, x, y, size = 10) => ({ s, x, y, w: s.length * size * 0.5, h: size, fs: size, eol: false });

test("2 段組み：内容ストリームが左右の行を交互に書いていても段ごとに読む", () => {
  const items = [item("Title of the paper", 200, 800, 16)];
  for (let i = 0; i < 5; i++) {
    items.push(item(`left line ${i} with some words`, 50, 760 - i * 12));
    items.push(item(`right line ${i} with more words`, 320, 760 - i * 12));
  }
  const want = ["Title of the paper", ...[0, 1, 2, 3, 4].map((i) => `left line ${i} with some words`),
    ...[0, 1, 2, 3, 4].map((i) => `right line ${i} with more words`)];
  assert.deepEqual(layoutLines(items), want);
  // 従来の方法では同じ高さの左右の行がつながってしまう
  assert.equal(streamLines(items)[1], "left line 0 with some wordsright line 0 with more words");
});

test("1 段組み：単語ごとの項目を行にまとめ、離れた単語の間には空白を補う", () => {
  const items = [item("Hello", 50, 700), item("world", 82, 700), item("next", 50, 688), item("line", 75, 688)];
  assert.deepEqual(layoutLines(items), ["Hello world", "next line"]);
  // 日本語のように隙間なく並ぶ項目は空白なしで連結
  assert.deepEqual(layoutLines([item("日本", 50, 700), item("語", 60, 700)]), ["日本語"]);
});

test("目次（右端のページ番号）や細い列は段とみなさず、行のまま読む", () => {
  const items = [];
  for (let i = 0; i < 6; i++) {
    items.push(item(`Chapter ${i} introduction`, 50, 700 - i * 14));
    items.push(item(String(i * 10 + 1), 500, 700 - i * 14));
  }
  assert.deepEqual(layoutLines(items), [0, 1, 2, 3, 4, 5].map((i) => `Chapter ${i} introduction ${i * 10 + 1}`));
});

test("見出しの下が 2 段、その下に全幅の段落があるページ", () => {
  const items = [item("Heading", 50, 800, 14)];
  for (let i = 0; i < 3; i++) {
    items.push(item(`L${i} aaaa bbbb cccc dddd`, 50, 770 - i * 12));
    items.push(item(`R${i} eeee ffff gggg hhhh`, 320, 770 - i * 12));
  }
  items.push(item("Footer paragraph spanning the whole width of the page here", 50, 700));
  assert.deepEqual(layoutLines(items), ["Heading", "L0 aaaa bbbb cccc dddd", "L1 aaaa bbbb cccc dddd", "L2 aaaa bbbb cccc dddd",
    "R0 eeee ffff gggg hhhh", "R1 eeee ffff gggg hhhh", "R2 eeee ffff gggg hhhh",
    "Footer paragraph spanning the whole width of the page here"]);
});

test("縦書き・回転を含むページ、または columns=false なら従来の方法", () => {
  const items = [item("a", 50, 700), item("b", 320, 700)];
  assert.deepEqual(pageLines(items, false), ["ab"]);
  assert.deepEqual(pageLines(items.map((x) => ({ ...x, vert: true })), true), ["ab"]);
  assert.deepEqual(pageLines([], true), []);
});

test("空白の違いを無視：英数字の単語の区切りは残す", () => {
  const o = { ws: true };
  assert.equal(normalize("a b", o), "a b");
  assert.notEqual(normalize("a b", o), normalize("ab", o));
  assert.equal(normalize("  a \t  b  ", o), normalize("a b", o));
  assert.equal(normalize("日 本　語", o), "日本語");
  assert.equal(normalize("第 1 章", o), "第1章");
  assert.equal(normalize("foo ( bar )", o), "foo(bar)");
  assert.equal(normalize("ＡＢ Ｃ", { ws: true, nfkc: true }), "AB C");
  assert.equal(normalize("a b", {}), "a b");
});
