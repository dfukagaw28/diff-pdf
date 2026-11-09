"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { alignSeq, alignPages, findBands, compareImages } = require("../visual.js");

test("alignPages：挿入・削除されたページを片方のみとして対応付ける", () => {
  // B の 3 ページ目が挿入、A の 5 ページ目が削除
  const w = new Map([["1,1", 10], ["2,2", 8], ["3,4", 9], ["4,5", 7], ["6,6", 5]]);
  assert.deepEqual(alignPages(6, 6, w), [
    { a: 1, b: 1 }, { a: 2, b: 2 }, { a: null, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: null }, { a: 6, b: 6 },
  ]);
  // 手がかりがなければ先頭から順に組にする（従来と同じ）
  assert.deepEqual(alignPages(2, 3, new Map()), [{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: null, b: 3 }]);
});

test("alignSeq：対応しない要素は前後の対応の間で組にする", () => {
  const eq = (a, b) => (i, j) => (a[i] === b[j] ? 1 : 0);
  const a = ["x", "p", "y"], b = ["x", "q", "y"];
  assert.deepEqual(alignSeq(3, 3, eq(a, b)), [{ a: 0, b: 0 }, { a: 1, b: 1 }, { a: 2, b: 2 }]);
});

// 白地に黒い横縞（「行」）を描いた画像
function page(w, h, lines) {
  const P = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [y, x0, x1] of lines)
    for (let yy = y; yy < y + 6; yy++)
      for (let x = x0; x < x1; x++) { const i = (yy * w + x) * 4; P[i] = P[i + 1] = P[i + 2] = 0; }
  return P;
}

test("findBands：インクのある行のまとまりを返す", () => {
  const P = page(100, 60, [[5, 10, 50], [20, 0, 100]]);
  assert.deepEqual(findBands(P, 100, 60), [{ y0: 5, y1: 11 }, { y0: 20, y1: 26 }]);
});

test("compareImages：行が 1 つ挿入されてずれても、補正すれば挿入された行だけが差分になる", () => {
  const w = 200, h = 200;
  // 行ごとに長さを変えて見分けられるようにする
  const body = Array.from({ length: 10 }, (_, i) => [0, 10, 60 + i * 12]);
  const A = page(w, h, body.map(([, x0, x1], i) => [10 + i * 15, x0, x1]));
  const B = page(w, h, [[10, 10, 190], ...body.map(([, x0, x1], i) => [25 + i * 15, x0, x1])]); // 先頭に 1 行挿入
  const plain = compareImages(A, B, w, h, 32);
  const shifted = compareImages(A, B, w, h, 32, { shift: true, draw: true });
  assert.equal(shifted.diff, 180 * 6); // 挿入された行のピクセルだけ
  assert.ok(plain.diff > 2 * shifted.diff, `補正なし ${plain.diff} / 補正あり ${shifted.diff}`);
  // 挿入された行（と前後の余白）の分だけ高くなる
  assert.ok(shifted.out.h >= h + 15 && shifted.out.h <= h + 16, `${shifted.out.h}`);
  // 同じ画像なら差分 0
  assert.equal(compareImages(A, A, w, h, 32, { shift: true }).diff, 0);
});

test("compareImages：変更された行は対応する行どうしで比べる", () => {
  const w = 200, h = 100;
  const A = page(w, h, [[10, 10, 100], [30, 10, 120], [50, 10, 140]]);
  const B = page(w, h, [[10, 10, 100], [30, 10, 180], [50, 10, 140]]); // 2 行目が長くなった
  assert.equal(compareImages(A, B, w, h, 32, { shift: true }).diff, 60 * 6);
});
