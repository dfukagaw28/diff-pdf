/* テキストの行の組み立て（DOM 非依存）。ブラウザではグローバル関数として、Node ではモジュールとして使う。
 *
 * 入力は PDF.js の textContent.items を次の形に変換したもの（PDF 座標系、y は上向き）：
 *   { s: 文字列, x, y: ベースラインの位置, w: 幅, h: PDF.js の height（0 のこともある）,
 *     fs: 変換行列から求めた文字サイズ, eol: hasEOL }
 */
"use strict";

// 内容ストリームの順に連結し、y が変わったところで改行する（段組みを考慮しない従来の方法）
function streamLines(items){
  const out=[];let cur="",lastY=null;
  const flush=()=>{if(cur.trim()!=="")out.push(cur.replace(/\s+$/,""));cur=""};
  for(const it of items){
    if(lastY!==null&&Math.abs(it.y-lastY)>Math.max(2,(it.h||10)*0.5)&&cur!=="")flush();
    cur+=it.s;lastY=it.y;
    if(it.eol)flush();
  }
  flush();
  return out;
}

const sizeOf=it=>it.h||it.fs||10;
const minOf=(a,f)=>a.reduce((m,x)=>Math.min(m,f(x)),Infinity);
const maxOf=(a,f)=>a.reduce((m,x)=>Math.max(m,f(x)),-Infinity);

// ベースラインの近い項目をまとめて「行」にする（上から順）
function rowsOf(items){
  const its=items.filter(it=>it.s.trim()!=="").sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const it of its){
    const r=rows[rows.length-1];
    if(r&&r.y-it.y<=0.5*Math.max(r.h,sizeOf(it)))r.items.push(it);
    else rows.push({y:it.y,h:sizeOf(it),items:[it]});
  }
  return rows;
}

// 行の中を、文字サイズの GAP 倍より広い隙間（段の間、表のセルの間）で「断片」に分ける
const GAP=1.5;
function segmentsOf(rows){
  const segs=[];
  rows.forEach((r,li)=>{
    r.items.sort((a,b)=>a.x-b.x);
    let seg=null;
    for(const it of r.items){
      const h=sizeOf(it),x1=it.x+it.w;
      if(seg&&it.x-seg.x1<=GAP*Math.max(h,seg.h)){
        const gap=it.x-seg.x1;
        seg.t+=(gap>0.15*h&&!/\s$/.test(seg.t)&&!/^\s/.test(it.s)?" ":"")+it.s;
        seg.x1=Math.max(seg.x1,x1);seg.h=Math.max(seg.h,h);
        seg.y0=Math.min(seg.y0,it.y-0.2*h);seg.y1=Math.max(seg.y1,it.y+0.8*h);
      }else{
        seg={li,t:it.s,x0:it.x,x1,h,y0:it.y-0.2*h,y1:it.y+0.8*h};
        segs.push(seg);
      }
    }
  });
  return segs;
}

// 区間の集まりの隙間（minGap より広いもの）を小さい順に返す
function gapsOf(iv,minGap){
  iv.sort((p,q)=>p[0]-q[0]);
  const g=[];let end=iv[0][1];
  for(let i=1;i<iv.length;i++){
    const[a,b]=iv[i];
    if(a-end>minGap)g.push({lo:end,hi:a,size:a-end});
    if(b>end)end=b;
  }
  return g;
}

// XY-cut：縦の切れ目（段の間）があれば左右に、なければ横の切れ目で上下に分け、再帰的に並べる
function xycut(segs,mh){
  if(segs.length<=1)return segs;
  const X0=minOf(segs,s=>s.x0),X1=maxOf(segs,s=>s.x1),W=X1-X0;
  // 縦の切れ目：幅が文字サイズ以上。分けた各段の幅が全体の 25% 未満になる切れ目は使わない
  // （表の列や行番号・ページ番号の列で分けてしまうのを避ける）
  const vg=gapsOf(segs.map(s=>[s.x0,s.x1]),mh);
  while(vg.length){
    const ext=i=>(i<vg.length?vg[i].lo:X1)-(i?vg[i-1].hi:X0);
    let narrow=-1;
    for(let i=0;i<=vg.length;i++)if(ext(i)<0.25*W&&(narrow<0||ext(i)<ext(narrow)))narrow=i;
    if(narrow<0)break;
    if(narrow===0)vg.shift();
    else if(narrow===vg.length)vg.pop();
    else vg.splice(vg[narrow-1].size<vg[narrow].size?narrow-1:narrow,1);
  }
  // 横の切れ目：最大の隙間の半分以上のものだけで切る
  // （段どうしで行の高さが揃っていると、行間も全幅の隙間になるため。見出しと本文の間などを優先する）
  const hg=gapsOf(segs.map(s=>[s.y0,s.y1]),0);
  const maxH=hg.length?maxOf(hg,g=>g.size):0;
  // 両方あれば広いほうで切る（段の間より広い余白の上にある見出しを、先に本文から切り離す）
  if(vg.length&&maxOf(vg,g=>g.size)>=maxH){
    const cuts=vg.map(g=>(g.lo+g.hi)/2);
    const groups=cuts.map(()=>[]).concat([[]]);
    for(const s of segs)groups[cuts.filter(c=>c<s.x0).length].push(s);
    return groups.flatMap(g=>xycut(g,mh));
  }
  if(hg.length){
    const max=maxH;
    const cuts=hg.filter(g=>g.size>=0.5*max).map(g=>(g.lo+g.hi)/2);
    const groups=cuts.map(()=>[]).concat([[]]);
    for(const s of segs)groups[cuts.filter(c=>c>(s.y0+s.y1)/2).length].push(s);
    return groups.flatMap(g=>xycut(g,mh));
  }
  return segs.slice().sort((a,b)=>a.li-b.li||a.x0-b.x0);
}

// 位置から読み順を推定して行を組み立てる（段組みを考慮）
function layoutLines(items){
  const rows=rowsOf(items);
  if(!rows.length)return[];
  const segs=segmentsOf(rows);
  const hs=segs.map(s=>s.h).sort((a,b)=>a-b),mh=hs[hs.length>>1];
  const out=[];let prev=null;
  for(const s of xycut(segs,mh)){
    // 同じ行の断片が並んだら 1 行に戻す（目次の「見出し …… ページ番号」など）
    if(prev&&prev.li===s.li&&s.x0>=prev.x1)out[out.length-1]+=" "+s.t;
    else out.push(s.t);
    prev=s;
  }
  return out.map(t=>t.trim()).filter(Boolean);
}

// columns が真なら段組みを考慮する。縦書き・回転した文字を含むページは従来の方法で並べる
function pageLines(items,columns){
  return columns&&!items.some(it=>it.vert)?layoutLines(items):streamLines(items);
}

if(typeof module!=="undefined")module.exports={streamLines,layoutLines,pageLines};
