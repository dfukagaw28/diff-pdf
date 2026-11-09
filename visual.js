/* 見た目の差分の計算（DOM 非依存）。ブラウザではグローバル関数として、Node ではモジュールとして使う。
 * 画像は幅 w・高さ h の RGBA（Uint8ClampedArray など）。 */
"use strict";

/* ---------- 列の対応付け ----------
 * 0..n-1 と 0..m-1 を、順序を保ったまま重み weight(i,j)（>0 のみ対応可）の合計が最大になるよう対応付ける。
 * 対応しなかった要素は、前後の対応の間で順に組にし、余りは片方のみ（-1）とする。
 * n*m が maxCells を超えるときは重みを使わず先頭から順に組にする。 */
function alignSeq(n,m,weight,maxCells=4e6){
  const anchors=[];
  if(n&&m&&(n+1)*(m+1)<=maxCells){
    const W=m+1,dp=new Float64Array((n+1)*W),wt=new Float64Array((n+1)*W);
    for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
      const w=weight(i-1,j-1);wt[i*W+j]=w;
      let v=Math.max(dp[(i-1)*W+j],dp[i*W+j-1]);
      if(w>0)v=Math.max(v,dp[(i-1)*W+j-1]+w);
      dp[i*W+j]=v;
    }
    let i=n,j=m;
    while(i>0&&j>0){
      const w=wt[i*W+j];
      if(w>0&&dp[i*W+j]===dp[(i-1)*W+j-1]+w){anchors.push([i-1,j-1]);i--;j--}
      else if(dp[(i-1)*W+j]>=dp[i*W+j-1])i--;
      else j--;
    }
    anchors.reverse();
  }
  const out=[];let pa=0,pb=0;
  const fill=(ea,eb)=>{
    while(pa<ea&&pb<eb)out.push({a:pa++,b:pb++});
    while(pa<ea)out.push({a:pa++,b:-1});
    while(pb<eb)out.push({a:-1,b:pb++});
  };
  for(const[a,b]of anchors){fill(a,b);out.push({a,b});pa=a+1;pb=b+1}
  fill(n,m);
  return out;
}

// ページの対応付け。weights: Map(`${a},${b}` → 一致した行数)、ページ番号は 1 始まり。片方のみは null。
function alignPages(nA,nB,weights){
  return alignSeq(nA,nB,(i,j)=>weights.get(`${i+1},${j+1}`)||0)
    .map(({a,b})=>({a:a<0?null:a+1,b:b<0?null:b+1}));
}

/* ---------- ページ内のずれの補正 ----------
 * インクのある行（ピクセル行）が続く範囲を「帯」（≒ テキストの 1 行）とし、A と B の帯を対応付けてから比べる。 */
const INK=235; // 輝度がこれ未満のピクセルをインクとみなす
const luma=(d,i)=>(d[i]*299+d[i+1]*587+d[i+2]*114)/1000;

function findBands(P,w,h){
  const bands=[];let y0=-1;
  for(let y=0;y<h;y++){
    let ink=false;
    for(let i=y*w*4,e=i+w*4;i<e;i+=4)if(luma(P,i)<INK){ink=true;break}
    if(ink){if(y0<0)y0=y}
    else if(y0>=0){bands.push({y0,y1:y});y0=-1}
  }
  if(y0>=0)bands.push({y0,y1:h});
  return bands;
}

// 帯の横方向の濃さの分布（縦方向に合計）。上下に少しずれて描画されても値はほぼ変わらない
const BUCKETS=256;
function profile(P,w,b){
  const p=new Float32Array(BUCKETS);
  for(let y=b.y0;y<b.y1;y++)
    for(let x=0,i=y*w*4;x<w;x++,i+=4)p[(x*BUCKETS/w)|0]+=255-luma(P,i);
  let s=0;for(const v of p)s+=v;
  p.sum=s;
  return p;
}
function similarBand(a,b,pa,pb){
  const ha=a.y1-a.y0,hb=b.y1-b.y0;
  if(Math.abs(ha-hb)>Math.max(2,0.1*Math.max(ha,hb)))return false;
  let d=0;for(let k=0;k<BUCKETS;k++)d+=Math.abs(pa[k]-pb[k]);
  return d<=0.06*Math.max(1,pa.sum+pb.sum);
}

// 比べる行の組 [A の y, B の y, …]（-1 は空白）。shift が偽なら同じ高さどうし
function rowPairs(A,B,w,h,shift){
  const rows=[];
  if(!shift){for(let y=0;y<h;y++)rows.push(y,y);return{rows,bands:null}}
  const bA=findBands(A,w,h),bB=findBands(B,w,h);
  const pA=bA.map(b=>profile(A,w,b)),pB=bB.map(b=>profile(B,w,b));
  const ent=alignSeq(bA.length,bB.length,(i,j)=>similarBand(bA[i],bB[j],pA[i],pB[j])?1:0,1e6);
  let ya=0,yb=0;
  const pair=(a0,a1,b0,b1)=>{
    for(let r=0,n=Math.max(a1-a0,b1-b0);r<n;r++)rows.push(a0+r<a1?a0+r:-1,b0+r<b1?b0+r:-1);
  };
  for(const e of ent){
    const a=e.a>=0?bA[e.a]:null,b=e.b>=0?bB[e.b]:null;
    pair(ya,a?a.y0:ya,yb,b?b.y0:yb); // 直前の余白
    pair(a?a.y0:0,a?a.y1:0,b?b.y0:0,b?b.y1:0);
    if(a)ya=a.y1;
    if(b)yb=b.y1;
  }
  pair(ya,h,yb,h);
  return{rows,bands:{a:bA.length,b:bB.length,matched:ent.filter(e=>e.a>=0&&e.b>=0).length}};
}

/* A と B を比べる。thr は感度（色の差の閾値）。
 * draw が真なら差分画像（A のみ＝赤、B のみ＝緑、共通部分は薄く）を返す。ずれを補正すると高さは h と異なりうる。
 * ratio は差分ピクセルの割合（ページの面積 w*h に対する）。 */
function compareImages(A,B,w,h,thr,{shift=false,draw=false}={}){
  const{rows}=rowPairs(A,B,w,h,shift);
  const H=rows.length>>1,D=draw?new Uint8ClampedArray(w*H*4):null,T=thr*1.5;
  let diff=0;
  for(let r=0;r<H;r++){
    const ya=rows[2*r],yb=rows[2*r+1],od=r*w*4;
    for(let x=0;x<w;x++){
      const ia=ya*w*4+x*4,ib=yb*w*4+x*4,id=od+x*4;
      const ar=ya<0?255:A[ia],ag=ya<0?255:A[ia+1],ab=ya<0?255:A[ia+2];
      const br=yb<0?255:B[ib],bg=yb<0?255:B[ib+1],bb=yb<0?255:B[ib+2];
      const la=(ar*299+ag*587+ab*114)/1000,lb=(br*299+bg*587+bb*114)/1000;
      const dc=Math.abs(ar-br)+Math.abs(ag-bg)+Math.abs(ab-bb);
      if(dc>T){
        diff++;
        if(D){if(la<lb){D[id]=220;D[id+1]=50;D[id+2]=50}else{D[id]=40;D[id+1]=160;D[id+2]=80}D[id+3]=255}
      }else if(D){
        const g=235+(Math.min(la,lb)/255)*20;
        D[id]=D[id+1]=D[id+2]=Math.min(255,la<250?200+la*0.2:g);D[id+3]=255;
      }
    }
  }
  return{diff,ratio:diff/(w*h),out:D&&{data:D,w,h:H}};
}

if(typeof module!=="undefined")module.exports={alignSeq,alignPages,findBands,compareImages};
