"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { myers, diffLines, MAX_D } = require("../diff.js");

// 編集スクリプトが a を b に正しく変換するか（添字が順に 1 回ずつ現れ、一致箇所は値が等しい）
function check(a, b, ops) {
  let i = 0, j = 0, eq = 0;
  for (const [o, x, y] of ops) {
    if (o <= 0) assert.equal(x, i++);
    else assert.equal(x, -1);
    if (o >= 0) assert.equal(y, j++);
    else assert.equal(y, -1);
    if (o === 0) { assert.equal(a[x], b[y]); eq++; }
  }
  assert.equal(i, a.length);
  assert.equal(j, b.length);
  return eq;
}
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
}

test("myers / diffLines は最短の編集スクリプトを返す（ランダム入力）", () => {
  const r = rng(1);
  for (let t = 0; t < 500; t++) {
    const alpha = 1 + Math.floor(r() * 8);
    const gen = () => Array.from({ length: Math.floor(r() * 40) }, () => Math.floor(r() * alpha));
    const a = gen(), b = gen(), best = lcs(a, b);
    for (const f of [myers, diffLines]) {
      const ops = f(a, b);
      assert.equal(ops.approx, false);
      assert.equal(check(a, b, ops), best, `${f.name} ${JSON.stringify([a, b])}`);
    }
  }
});

test("空の入力", () => {
  for (const f of [myers, diffLines]) {
    check([], [], f([], []));
    check([1, 2], [], f([1, 2], []));
    check([], [1, 2], f([], [1, 2]));
  }
});

test("まったく異なる大きな文書でも一瞬で終わる（片方にしかない行を除外）", () => {
  const n = 50000;
  const a = Array.from({ length: n }, (_, i) => i);
  const b = Array.from({ length: n }, (_, i) => n + i);
  const t0 = Date.now();
  const ops = diffLines(a, b);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(ops.approx, false);
  assert.equal(check(a, b, ops), 0);
});

test("共通行が多く編集距離が上限を超える場合は打ち切る（正しい編集スクリプトのまま）", () => {
  // 同じ行の集合を逆順に並べると LCS は 1、編集距離は ~2n
  const n = 20000;
  const a = Array.from({ length: n }, (_, i) => i);
  const b = a.slice().reverse();
  const t0 = Date.now();
  const ops = diffLines(a, b);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
  assert.equal(ops.approx, true);
  check(a, b, ops);
  assert.ok(2 * n > MAX_D);
});
