/* 差分計算（DOM 非依存）。ブラウザではグローバル関数として、Node ではモジュールとして使う。 */
"use strict";

/* ---------- Myers diff ---------- */
// 編集距離の上限。経路の記録に ~MAX_D^2 個の Int32（3000 で約 36MB）を使うため、
// これを超えたら残りを「すべて削除＋すべて追加」とみなして打ち切る（ops.approx=true）。
const MAX_D=3000;
function myers(a,b){
  const n=a.length,m=b.length;let s=0;
  while(s<n&&s<m&&a[s]===b[s])s++;
  let e=0;while(e<n-s&&e<m-s&&a[n-1-e]===b[m-1-e])e++;
  const A=a.slice(s,n-e),B=b.slice(s,m-e),N=A.length,M=B.length,max=N+M,off=max+1;
  const ops=[];for(let i=0;i<s;i++)ops.push([0,i,i]);
  const mid=[];let approx=false;
  const allDelAdd=()=>{for(let i=0;i<N;i++)mid.push([-1,i,-1]);for(let j=0;j<M;j++)mid.push([1,-1,j])};
  if(N===0||M===0)allDelAdd();
  else{
    const v=new Int32Array(2*max+3),trace=[];let done=false;
    for(let d=0;d<=max&&!done;d++){
      if(d>MAX_D){approx=true;break}
      trace.push(v.slice(off-d,off+d+1));
      for(let k=-d;k<=d;k+=2){
        let x=(k===-d||(k!==d&&v[off+k-1]<v[off+k+1]))?v[off+k+1]:v[off+k-1]+1,y=x-k;
        while(x<N&&y<M&&A[x]===B[y]){x++;y++}
        v[off+k]=x;if(x>=N&&y>=M){done=true;break}
      }
    }
    if(approx)allDelAdd();
    else{
    let x=N,y=M;
    for(let d=trace.length-1;d>=0;d--){
      const t=trace[d],k=x-y;
      const pk=(k===-d||(k!==d&&t[k-1+d]<t[k+1+d]))?k+1:k-1;
      const px=d===0?0:t[pk+d],py=px-pk;
      while(x>px&&y>py){mid.push([0,x-1,y-1]);x--;y--}
      if(d>0){if(x===px)mid.push([1,-1,y-1]);else mid.push([-1,x-1,-1])}
      x=px;y=py;
    }
    mid.reverse();
    }
  }
  for(const o of mid)ops.push([o[0],o[1]<0?-1:o[1]+s,o[2]<0?-1:o[2]+s]);
  for(let i=e;i>0;i--)ops.push([0,n-i,m-i]);
  ops.approx=approx;
  return ops;
}
// 行単位の差分。片方にしか現れない行は決して一致しないので、取り除いてから myers にかけ、
// 結果に削除／追加として戻す（LCS は変わらないまま、大きく異なる文書でも編集距離が小さくなる）。
function diffLines(a,b){
  const inA=new Set(a),inB=new Set(b);
  const ia=[],ib=[];
  a.forEach((x,i)=>{if(inB.has(x))ia.push(i)});
  b.forEach((x,j)=>{if(inA.has(x))ib.push(j)});
  const sub=myers(ia.map(i=>a[i]),ib.map(j=>b[j]));
  const ops=[];let pa=0,pb=0;
  const upA=i=>{while(pa<i)ops.push([-1,pa++,-1])},upB=j=>{while(pb<j)ops.push([1,-1,pb++])};
  for(const[o,i,j]of sub){
    const oi=o<=0?ia[i]:-1,oj=o>=0?ib[j]:-1;
    if(o<=0)upA(oi);
    if(o>=0)upB(oj);
    ops.push([o,oi,oj]);
    if(o<=0)pa++;
    if(o>=0)pb++;
  }
  upA(a.length);upB(b.length);
  ops.approx=sub.approx;
  return ops;
}

/* ---------- 比較用の正規化 ----------
 * o.nfkc: 全角/半角を同一視、o.ci: 大小文字を無視、
 * o.ws: 空白の違いを無視。ただし英数字の単語の間の空白は 1 つの区切りとして残す
 *       （"a b" と "ab" は別物。日本語の文字の間や記号の前後の空白は無視する）。 */
const WORDCH=/[\p{L}\p{N}]/u, CJK=/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}]/u;
const isWordCh=c=>c!==undefined&&WORDCH.test(c)&&!CJK.test(c);
function normalize(s,o){
  if(o.nfkc)s=s.normalize("NFKC");
  if(o.ws)s=s.replace(/\s+/g," ").trim().replace(/ /g,(m,i,str)=>isWordCh(str[i-1])&&isWordCh(str[i+1])?" ":"");
  if(o.ci)s=s.toLowerCase();
  return s;
}

if(typeof module!=="undefined")module.exports={myers,diffLines,MAX_D,normalize};
