"use strict";
const $=s=>document.querySelector(s);
const b64=s=>{const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u};

/* ---------- PDF.js の資源 ----------
 * 単一HTML版（build.mjs の出力）では、ワーカー（#pdfjs-worker）・CMap・標準フォント（CMAPS / FONTS）が
 * ページに埋め込まれている。分割版では vendor/pdfjs/ から同一オリジンで読み込む。 */
const VENDOR="vendor/pdfjs/";
const INLINE=typeof CMAPS!=="undefined";
async function vendorFile(path){
  const r=await fetch(VENDOR+path);
  if(!r.ok)throw new Error(`${path} の読み込みに失敗 (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
class CMapF{async fetch({name}){
  if(INLINE){if(!CMAPS[name])throw new Error("CMap missing: "+name);return{cMapData:b64(CMAPS[name]),compressionType:1}}
  return{cMapData:await vendorFile(`cmaps/${name}.bcmap`),compressionType:1};
}}
class FontF{async fetch({filename}){
  if(INLINE){if(!FONTS[filename])throw new Error("Font missing: "+filename);return b64(FONTS[filename])}
  return vendorFile("standard_fonts/"+filename);
}}
const inlineWorker=$("#pdfjs-worker");
const WORKER_URL=inlineWorker?URL.createObjectURL(new Blob([inlineWorker.textContent],{type:"text/javascript"})):VENDOR+"pdf.worker.min.js";
pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER_URL;
const pdfWorker=new pdfjsLib.PDFWorker({port:new Worker(WORKER_URL)}); // 共有ワーカー（doc.destroyで破棄されない）
const loadSeq={A:0,B:0};

const docs={A:null,B:null}, names={A:"",B:""};
let pages={A:null,B:null}; // ページごとのテキスト項目（layout.js の形式）
let pageAlign=null;        // テキスト差分から求めたページの対応 [{a,b}]（片方のみは null）
const status=t=>$("#status").textContent=t;

/* ---------- file input ---------- */
for(const k of ["A","B"]){
  const box=$("#drop"+k), inp=box.querySelector("input");
  box.onclick=()=>inp.click();
  inp.onchange=()=>{inp.files[0]&&load(k,inp.files[0]);inp.value=""};
  box.ondragover=e=>{e.preventDefault();box.classList.add("over")};
  box.ondragleave=()=>box.classList.remove("over");
  box.ondrop=e=>{e.preventDefault();e.stopPropagation();box.classList.remove("over");const f=e.dataTransfer.files[0];f&&load(k,f)};
}
document.addEventListener("dragover",e=>e.preventDefault());
document.addEventListener("drop",e=>{e.preventDefault();const fs=[...e.dataTransfer.files].filter(f=>/pdf$/i.test(f.name));
  if(fs.length>=2){load("A",fs[0]);load("B",fs[1])}});

async function load(k,file){
  const box=$("#drop"+k);box.querySelector("span").textContent=file.name+"（読み込み中…）";
  scanToken++;vToken++;$("#pageList").innerHTML="";$("#vinfo").textContent=""; // 進行中の走査・描画を打ち切る
  try{
    const seq=++loadSeq[k];
    const data=new Uint8Array(await file.arrayBuffer());
    const old=docs[k];docs[k]=null;pages[k]=null;pageAlign=null;
    if(old)await old.destroy().catch(()=>{});
    const doc=await pdfjsLib.getDocument({worker:pdfWorker,data,CMapReaderFactory:CMapF,StandardFontDataFactory:FontF,useWorkerFetch:false,cMapPacked:true,isEvalSupported:false}).promise;
    if(seq!==loadSeq[k]){doc.destroy();return}
    docs[k]=doc;names[k]=file.name;
    box.querySelector("span").textContent=`${file.name}（${docs[k].numPages}ページ）`;box.classList.add("loaded");
    const ex=await extract(doc,k);
    if(seq!==loadSeq[k])return;
    pages[k]=ex;
    if(docs.A&&docs.B){$("#pgA").value=$("#pgB").value=1;runText();renderVisual();$("#pageList").innerHTML=""}
    else status("もう一方のPDFを選んでください");
  }catch(e){box.querySelector("span").textContent="読み込み失敗: "+e.message;console.error(e)}
}

/* ---------- text extraction ---------- */
async function extract(doc,k){
  const out=[];
  for(let p=1;p<=doc.numPages;p++){
    status(`${k}: テキスト抽出中 ${p}/${doc.numPages}`);
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    const items=[];
    for(const it of tc.items){
      if(it.str===undefined)continue;
      const t=it.transform;
      items.push({s:it.str,x:t[4],y:t[5],w:it.width,h:it.height,fs:Math.hypot(t[2],t[3]),eol:it.hasEOL,
        // 縦書き・回転した文字（このページは段組みの解析をしない）
        vert:!!(tc.styles[it.fontName]&&tc.styles[it.fontName].vertical)||t[0]<=0||Math.abs(t[1])>0.01*Math.abs(t[0])});
    }
    out.push(items);page.cleanup();
  }
  return out;
}
// 比較する行の一覧 [{t, p: ページ番号}]
function linesOf(k){
  const cols=$("#optCols").checked;
  return pages[k].flatMap((items,i)=>pageLines(items,cols).map(t=>({t,p:i+1})));
}

/* ---------- text diff ---------- */
function norm(s){
  return normalize(s,{nfkc:$("#optNfkc").checked,ws:$("#optWs").checked,ci:$("#optCase").checked});
}
function prep(L){
  if(!$("#optJoin").checked)return L;
  // 句点・ピリオドで文単位に組み直す（改行位置の違いを吸収）
  const out=[];let cur="",p=null;
  for(const l of L){if(p===null)p=l.p;cur+=(cur&&/[A-Za-z0-9]$/.test(cur)&&/^[A-Za-z0-9]/.test(l.t)?" ":"")+l.t;
    const parts=cur.split(/(?<=[。．！？!?]|\.\s)/);cur=parts.pop();
    for(const s of parts)if(s.trim()){out.push({t:s.trim(),p});p=l.p}
    if(!cur)p=null;}
  if(cur.trim())out.push({t:cur.trim(),p:p||1});
  return out;
}
const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

function inline(a,b){
  const ca=[...a],cb=[...b];
  if(ca.length*cb.length>4e6)return[`<del>${esc(a)}</del>`,`<ins>${esc(b)}</ins>`];
  const key=c=>norm(c)||"\u0000"+c; // whitespace chars keyed separately
  const ops=myers(ca.map(key),cb.map(key));
  let ra="",rb="",bufA="",bufB="";
  const fl=()=>{if(bufA)ra+=`<del>${esc(bufA)}</del>`;if(bufB)rb+=`<ins>${esc(bufB)}</ins>`;bufA=bufB=""};
  for(const[o,i,j]of ops){
    if(o===0){fl();ra+=esc(ca[i]);rb+=esc(cb[j])}
    else if(o<0)bufA+=ca[i];else bufB+=cb[j];
  }
  fl();return[ra,rb];
}

let changeRows=[],curChange=-1;
function runText(){
  if(!pages.A||!pages.B)return;
  status("差分計算中…");
  setTimeout(()=>{
    if(!pages.A||!pages.B)return; // 待機中にPDFが読み直された
    const LA=prep(linesOf("A")),LB=prep(linesOf("B"));
    const ids=new Map(),id=s=>{s=norm(s);if(!ids.has(s))ids.set(s,ids.size);return ids.get(s)};
    const ops=diffLines(LA.map(l=>id(l.t)),LB.map(l=>id(l.t)));
    // 一致した行の数でページを対応付ける（見た目の差分で使う）
    const w=new Map();
    for(const[o,i,j]of ops)if(o===0){const key=`${LA[i].p},${LB[j].p}`;w.set(key,(w.get(key)||0)+1)}
    pageAlign=alignPages(pages.A.length,pages.B.length,w);
    // build rows
    const rows=[];let dels=[],adds=[];
    const flushH=()=>{
      const n=Math.max(dels.length,adds.length);
      for(let i=0;i<n;i++){
        const a=dels[i],b=adds[i];
        if(a&&b){const[ha,hb]=inline(a.t,b.t);rows.push({k:"m",a,b,ha,hb})}
        else rows.push({k:a?"d":"a",a,b,ha:a&&esc(a.t),hb:b&&esc(b.t)});
      }
      dels=[];adds=[];
    };
    for(const[o,i,j]of ops){
      if(o===0){flushH();rows.push({k:"e",a:LA[i],b:LB[j],ha:esc(LA[i].t),hb:esc(LB[j].t),ai:i+1,bi:j+1})}
      else if(o<0)dels.push(LA[i]);else adds.push(LB[j]);
    }
    flushH();
    renderRows(rows,ops.approx);
  },10);
}

function renderRows(rows,approx){
  const only=$("#optOnly").checked,CTX=2;
  const show=rows.map(()=>!only);
  let nd=0,na=0,nm=0;
  rows.forEach((r,i)=>{if(r.k!=="e"){if(r.k==="d")nd++;else if(r.k==="a")na++;else nm++;
    if(only)for(let j=Math.max(0,i-CTX);j<=Math.min(rows.length-1,i+CTX);j++)show[j]=true}});
  const cell=(l,h,cls)=>l?`<td class="n">${l.p?`<i>p${l.p}</i>`:""}</td><td class="${cls}">${h}</td>`:`<td class="n"></td><td class="empty"></td>`;
  let html="",i=0,blocks=0;const hidden=[];
  while(i<rows.length){
    if(!show[i]){let j=i;while(j<rows.length&&!show[j])j++;hidden.push(rows.slice(i,j));
      html+=`<tr class="fold" data-h="${hidden.length-1}"><td colspan="4">… 同一 ${j-i} 行（クリックで展開）…</td></tr>`;i=j;continue}
    html+=rowHtml(rows[i]);if(rows[i].k!=="e")blocks++;i++;
  }
  function rowHtml(r){
    if(r.k==="e")return`<tr>${cell(r.a,r.ha,"")}${cell(r.b,r.hb,"")}</tr>`;
    return`<tr class="ch">${cell(r.a,r.ha,r.a?"del":"")}${cell(r.b,r.hb,r.b?"add":"")}</tr>`;
  }
  const total=nd+na+nm;
  const v=$("#v-text");
  v.innerHTML=`<p class="sum">${esc(names.A)} → ${esc(names.B)}：${total?`<span class="d">削除 ${nd}</span> / <span class="a">追加 ${na}</span> / 変更 ${nm} 行`:"テキストの差分はありません"}${approx?"（差分が大きすぎるため、一部は行の対応付けを省略して表示）":""}</p>`+
    `<table class="diff"><colgroup><col style="width:64px"><col><col style="width:64px"><col></colgroup>${html}</table>`;
  v.querySelectorAll("tr.fold").forEach(tr=>tr.onclick=()=>{tr.outerHTML=hidden[+tr.dataset.h].map(rowHtml).join("");collect()});
  collect();
  status(total?`${total} 行に差分`:"差分なし");
  function collect(){changeRows=[...v.querySelectorAll("tr.ch")];curChange=-1}
}
function jump(d){
  if(!changeRows.length)return;
  // jump to change block starts
  const starts=changeRows.filter(r=>!(r.previousElementSibling&&r.previousElementSibling.classList.contains("ch")));
  curChange=(curChange+d+starts.length)%starts.length;
  changeRows.forEach(r=>r.classList.remove("cur"));
  let r=starts[curChange];while(r&&r.classList.contains("ch")){r.classList.add("cur");r=r.nextElementSibling}
  const y=starts[curChange].getBoundingClientRect().top+scrollY-$("header").offsetHeight-20;scrollTo({top:y,behavior:"smooth"});
  status(`変更ブロック ${curChange+1}/${starts.length}`);
}
$("#next").onclick=()=>jump(1);$("#prev").onclick=()=>jump(-1);
document.addEventListener("keydown",e=>{if(e.target.tagName==="INPUT"&&e.target.type!=="checkbox")return;if(e.key==="n"||e.key==="j")jump(1);if(e.key==="p"||e.key==="k")jump(-1)});
for(const id of["optWs","optNfkc","optCase","optJoin","optOnly","optCols"])$("#"+id).onchange=runText;

/* ---------- tabs ---------- */
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+b.dataset.v));
  $("#textOpts").style.display=b.dataset.v==="text"?"":"none";
  if(b.dataset.v==="visual")renderVisual();
});

/* ---------- visual diff ---------- */
async function rasterize(doc,n,scale){
  const page=await doc.getPage(n),vp=page.getViewport({scale});
  const c=document.createElement("canvas");c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
  const ctx=c.getContext("2d",{willReadFrequently:true});ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
  await page.render({canvasContext:ctx,viewport:vp}).promise;page.cleanup();return c;
}
// 2 枚のキャンバスを同じ大きさの RGBA にそろえて比べる（visual.js）。null（そのページがない）は白紙として扱う
function diffCanvases(ca,cb,thr,out){
  const w=Math.max(ca?ca.width:1,cb?cb.width:1),h=Math.max(ca?ca.height:1,cb?cb.height:1);
  const get=c=>{const t=document.createElement("canvas");t.width=w;t.height=h;const x=t.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,w,h);if(c)x.drawImage(c,0,0);return x.getImageData(0,0,w,h).data};
  const r=compareImages(get(ca),get(cb),w,h,thr,{shift:$("#optShift").checked,draw:!!out});
  if(out){out.width=w;out.height=r.out.h;out.getContext("2d").putImageData(new ImageData(r.out.data,w,r.out.h),0,0)}
  return r.ratio;
}
// ページ番号の入力欄。空欄は「そのページなし」（片方にしかないページを見るとき）
const pgOf=(id,n)=>{const v=$(id).value.trim();return v===""?null:Math.min(Math.max(1,Math.round(+v)||1),n)};
// 自動対応が有効なら、テキスト差分から求めたページの組を使う
const autoPairs=()=>$("#optAuto").checked&&pageAlign||null;
let vToken=0,scanToken=0;
async function renderVisual(){
  const A=docs.A,B=docs.B;
  if(!A||!B||!$("#v-visual").classList.contains("on"))return;
  const tok=++vToken,alive=()=>tok===vToken&&docs.A===A&&docs.B===B;
  const pa=pgOf("#pgA",A.numPages),pb=pgOf("#pgB",B.numPages);
  $("#pgA").max=A.numPages;$("#pgB").max=B.numPages;$("#pgA").value=pa??"";$("#pgB").value=pb??"";
  if(pa===null&&pb===null){$("#vinfo").textContent="ページ番号を入力してください";return}
  $("#vinfo").textContent="描画中…";
  try{
    const scale=Math.min(2.5,Math.max(1.2,devicePixelRatio*1.2));
    const [ca,cb]=await Promise.all([pa&&rasterize(A,pa,scale),pb&&rasterize(B,pb,scale)]);
    if(!alive())return;
    for(const[src,dst]of[[ca,"#cA"],[cb,"#cB"]]){
      const d=$(dst),o=src||ca||cb,x=d.getContext("2d");d.width=o.width;d.height=o.height;
      if(src)x.drawImage(src,0,0);else{x.fillStyle="#fff";x.fillRect(0,0,d.width,d.height)}
    }
    const r=diffCanvases(ca,cb,+$("#thr").value,$("#cD"));
    const side=(k,p,n)=>p?`${k} p${p}/${n}`:`${k} なし`;
    $("#vinfo").textContent=`${side("A",pa,A.numPages)} ⇔ ${side("B",pb,B.numPages)}：差分ピクセル ${(r*100).toFixed(2)}%`;
  }catch(e){
    if(!alive())return; // 読み直し・再描画で打ち切られた
    $("#vinfo").textContent="描画失敗: "+(e&&e.message||e);console.error(e);
  }
}
const vm=()=>{const one=$("#vmode").value==="1";$("#canv").classList.toggle("one",one);$("#cA").parentNode.style.display=$("#cB").parentNode.style.display=one?"none":""};
$("#vmode").onchange=vm;
const setView=(a,b)=>{$("#pgA").value=a??"";$("#pgB").value=b??"";renderVisual()};
$("#pgA").onchange=()=>{
  const P=autoPairs(),a=+$("#pgA").value,e=P&&P.find(e=>e.a===a);
  if(e)$("#pgB").value=e.b??"";
  renderVisual();
};
$("#pgB").onchange=$("#thr").onchange=$("#optShift").onchange=renderVisual;
const step=d=>{
  const a=$("#pgA").value===""?null:+$("#pgA").value,b=$("#pgB").value===""?null:+$("#pgB").value;
  const P=autoPairs();
  if(!P){setView((a??1)+d,(b??1)+d);return}
  let i=P.findIndex(e=>e.a===a&&e.b===b);
  if(i>=0)i=Math.min(Math.max(0,i+d),P.length-1);
  else{i=P.findIndex(e=>a!==null?e.a!==null&&e.a>=a:e.b!==null&&e.b>=b);if(i<0)i=P.length-1}
  setView(P[i].a,P[i].b);
};
$("#pgPrev").onclick=()=>step(-1);$("#pgNext").onclick=()=>step(1);
$("#optAuto").onchange=()=>{$("#pageList").innerHTML="";scanToken++};
$("#scanAll").onclick=async()=>{
  const A=docs.A,B=docs.B;
  if(!A||!B)return;
  // 再クリックやPDFの読み直しで scanToken／docs が変わったら、この走査は打ち切る
  const tok=++scanToken,alive=()=>tok===scanToken&&docs.A===A&&docs.B===B;
  const P=autoPairs()||Array.from({length:Math.max(A.numPages,B.numPages)},(_,i)=>({a:i<A.numPages?i+1:null,b:i<B.numPages?i+1:null}));
  const list=$("#pageList");list.innerHTML="";let changed=0;
  try{
    for(const[i,{a,b}]of P.entries()){
      $("#vinfo").textContent=`走査中 ${i+1}/${P.length}`;
      const btn=document.createElement("button");btn.className="btn";
      const label=a===b?`p${a}`:a&&b?`A${a}⇔B${b}`:a?`A${a}のみ`:`B${b}のみ`;
      if(!a||!b){btn.textContent=label;btn.classList.add("ch");changed++}
      else{const[ca,cb]=await Promise.all([rasterize(A,a,.6),rasterize(B,b,.6)]);
        if(!alive())return;
        const r=diffCanvases(ca,cb,+$("#thr").value,null);
        btn.textContent=r>0?`${label} ${(r*100).toFixed(1)}%`:`${label} ✓`;if(r>0){btn.classList.add("ch");changed++}}
      btn.onclick=()=>setView(a,b);
      list.appendChild(btn);
    }
    $("#vinfo").textContent=`${P.length}ページ中 ${changed}ページに差分`;
  }catch(e){
    if(!alive())return;
    $("#vinfo").textContent=`走査失敗（${list.children.length+1}件目）: `+(e&&e.message||e);console.error(e);
  }
};
