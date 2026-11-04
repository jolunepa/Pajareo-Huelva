/* Reconocimiento de aves por foto (WingCLIP-0.3 + prior de presencia). Todo local. */
(function(G){
const EMB=768,OCC_SCALE=2.5,MONTH_BITS=4,POOLED=12;
const GX=-17226000,GY=8343000,CELL=27000,COLS=1276,ROWS=618;
const OCC_FLOOR=Math.log(3e-5),KB=0.3;
const CAL={T:0.007435,beta:1.1634,bias:1.7004907607405835,pa:1.248338657716024,pb:2.1821600341974303,thr:0.3736373465};
const MEAN=[0.48145466,0.4578275,0.40821073],STD=[0.26862954,0.26130258,0.27577711];

function lonLatToEqualEarth(lon,lat){
  const A1=1.340264,A2=-0.081106,A3=0.000893,A4=0.003796,a=6378137.0,f=1/298.257223563;
  const b=a*(1-f),e2=1-(b*b)/(a*a),e=Math.sqrt(e2);
  const R=a*Math.sqrt(0.5*(1+((1-e2)/(2*e))*Math.log((1+e)/(1-e))));
  const qp=1+((1-e2)/(2*e))*Math.log((1+e)/(1-e));
  const lam=lon*Math.PI/180,phi=lat*Math.PI/180,sp=Math.sin(phi),es=e*sp;
  const q=(1-e2)*(sp/(1-e2*sp*sp)-(1/(2*e))*Math.log((1-es)/(1+es)));
  const beta=Math.asin(q/qp),theta=Math.asin((Math.sqrt(3)/2)*Math.sin(beta));
  const t=theta,t2=t*t,t6=t2*t2*t2,den=3*(A1+3*A2*t2+t6*(7*A3+9*A4*t2));
  return{x:R*((2*Math.sqrt(3)*lam*Math.cos(t))/den),y:R*t*(A1+A2*t2+t6*(A3+A4*t2))};
}
function xyToCell(x,y){const col=Math.floor((x-GX)/CELL),row=Math.floor((GY-y)/CELL);return(row<0||row>=ROWS||col<0||col>=COLS)?null:{row,col}}

/* ---- prior de presencia ---- */
function parseOcc(raw){
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
  const magic=String.fromCharCode(raw[0],raw[1],raw[2],raw[3]);
  if(magic!=="WDOP")throw new Error("prior: formato no reconocido");
  const version=raw[4],hashLen=version>=2?8:0;
  const nCells=view.getUint32(8+hashLen,true),idxStart=12+hashLen;
  const totalsStart=idxStart+(nCells+1)*8,payloadStart=totalsStart+(version>=4?nCells*4:0);
  if(payloadStart>raw.length)throw new Error("prior: archivo incompleto");
  return{raw,view,nCells,idxStart,totalsStart,payloadStart,version};
}
function findSlot(o,want){let lo=0,hi=o.nCells-1;while(lo<=hi){const mid=(lo+hi)>>1,key=o.view.getUint32(o.idxStart+mid*8,true);if(key===want)return mid;if(key<want)lo=mid+1;else hi=mid-1}return-1}
function decodeSlot(o,slot){
  const start=o.view.getUint32(o.idxStart+slot*8+4,true),end=o.view.getUint32(o.idxStart+(slot+1)*8+4,true);
  const out=new Map();let p=o.payloadStart+start;const stop=o.payloadStart+end;
  if(start>end||stop>o.raw.length)return null;
  let cur=0;
  while(p<stop){let shift=0,v=0,b=0;do{if(p>=stop)return out;b=o.raw[p++];v|=(b&0x7f)<<shift;shift+=7}while(b&0x80);cur+=v;if(p>=stop)return out;out.set(cur,-o.raw[p++]/OCC_SCALE)}
  return out;
}
const okMonth=m=>Number.isInteger(m)&&m>=1&&m<=12;
function occCell(o,r,c,m){if(!okMonth(m))return null;const s=findSlot(o,((r*COLS+c)<<MONTH_BITS)|(m-1));return s<0?null:decodeSlot(o,s)}
function occPooled(o,r,c){const s=findSlot(o,((r*COLS+c)<<MONTH_BITS)|POOLED);return s<0?null:decodeSlot(o,s)}
function occTotal(o,r,c,m){if(!okMonth(m))return null;const s=findSlot(o,((r*COLS+c)<<MONTH_BITS)|(m-1));return s<0?null:o.view.getUint32(o.totalsStart+s*4,true)}

function rank(cands,occ,loc,month){
  let cp=null,pooled=null,nCM=null;
  if(occ&&loc){const xy=lonLatToEqualEarth(loc.lon,loc.lat),cell=xyToCell(xy.x,xy.y);
    if(cell){cp=occCell(occ,cell.row,cell.col,month);if(occ.version>=4&&cp){pooled=occPooled(occ,cell.row,cell.col);nCM=occTotal(occ,cell.row,cell.col,month)}}}
  const back=pooled!==null&&nCM!==null;
  const out=cands.map(c=>{
    const lp=cp?cp.get(c.idx):undefined;let logP;
    if(back){const n=lp===undefined?0:Math.exp(lp)*nCM,pp=pooled.get(c.idx),pv=pp===undefined?0:Math.exp(pp),num=n+KB*pv;logP=num>0?Math.log(num/(nCM+KB)):OCC_FLOOR}
    else logP=cp?(lp===undefined?OCC_FLOOR:lp):null;
    if(logP!==null&&logP<OCC_FLOOR)logP=OCC_FLOOR;
    return{idx:c.idx,sim:c.sim,logP,score:c.sim/CAL.T+(logP===null?0:CAL.beta*logP)};
  });
  out.sort((a,b)=>b.score-a.score);return out;
}
function softmax(sc){let mx=-Infinity;for(const s of sc)if(s.score>mx)mx=s.score;const ex=sc.map(s=>Math.exp(s.score-mx)),sum=ex.reduce((a,b)=>a+b,0);return ex.map(e=>e/sum)}

/* ---- preprocesado CLIP (bicúbico estilo PIL) ---- */
function cubic(x){const a=-0.5,ax=Math.abs(x);if(ax<1)return((a+2)*ax-(a+3))*ax*ax+1;if(ax<2)return((ax-5)*ax+8)*ax*a-4*a;return 0}
function resampleAxis(src,sw,sh,dl,hor,sc){
  const sl=hor?sw:sh,scale=sl/dl,fs=Math.max(scale,1),sup=2*fs,dw=hor?dl:sw,dh=hor?sh:dl,out=new Float64Array(dw*dh*3);
  for(let d=0;d<dl;d++){
    const ce=(d+0.5)*scale;let lo=Math.floor(ce-sup+0.5),hi=Math.ceil(ce+sup-0.5);if(lo<0)lo=0;if(hi>sl)hi=sl;
    const n=hi-lo;if(n<=0)continue;const w=new Float64Array(n);let ws=0;
    for(let k=0;k<n;k++){const v=cubic((lo+k+0.5-ce)/fs);w[k]=v;ws+=v}
    if(ws!==0)for(let k=0;k<n;k++)w[k]/=ws;
    if(hor){for(let y=0;y<sh;y++)for(let c=0;c<3;c++){let a=0;for(let k=0;k<n;k++)a+=w[k]*src[(y*sw+lo+k)*sc+c];out[(y*dw+d)*3+c]=a}}
    else{for(let x=0;x<sw;x++)for(let c=0;c<3;c++){let a=0;for(let k=0;k<n;k++)a+=w[k]*src[((lo+k)*sw+x)*3+c];out[(d*dw+x)*3+c]=a}}
  }
  return out;
}
function bround(x){const f=Math.floor(x),d=x-f;if(d>0.5)return f+1;if(d<0.5)return f;return f%2===0?f:f+1}
function preprocess(rgba,w,h){
  const R=248,C=224;let nw,nh;
  if(w<=h){nw=R;nh=Math.floor(R*h/w)}else{nh=R;nw=Math.floor(R*w/h)}
  const hp=resampleAxis(rgba,w,h,nw,true,4),vp=resampleAxis(hp,nw,h,nh,false,3);
  const left=bround((nw-C)/2),top=bround((nh-C)/2),out=new Float32Array(3*C*C);
  for(let y=0;y<C;y++)for(let x=0;x<C;x++)for(let c=0;c<3;c++){
    let v=Math.round(vp[((top+y)*nw+left+x)*3+c]);if(v<0)v=0;if(v>255)v=255;
    out[c*C*C+y*C+x]=(v/255-MEAN[c])/STD[c];
  }
  return out;
}
const sigm=x=>1/(1+Math.exp(-x)),logit=p=>{const e=1e-7,c=p<e?e:p>1-e?1-e:p;return Math.log(c/(1-c))};
function decodeInt8(buf){
  const n=Math.floor(buf.length/(EMB+4));if(n<1||n*(EMB+4)!==buf.length)throw new Error("clasificador: tamaño inesperado");
  const q=new Int8Array(buf.buffer,buf.byteOffset,n*EMB),sc=new Float32Array(buf.buffer.slice(buf.byteOffset+n*EMB,buf.byteOffset+n*EMB+n*4)),out=new Float32Array(n*EMB);
  for(let s=0;s<n;s++){const k=sc[s],b=s*EMB;for(let i=0;i<EMB;i++)out[b+i]=q[b+i]*k}
  return out;
}
async function gunzip(buf){
  if(buf[0]!==0x1f||buf[1]!==0x8b)return buf;
  const ds=new DecompressionStream("gzip"),w=ds.writable.getWriter();w.write(buf);w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

const F={ready:false,loading:false,err:"",prog:0,tax:null};
/* deps: {ort, get(url)->Promise<ArrayBuffer>, base, onprog(p 0..100)} */
F.init=async function(d){
  if(F.ready||F.loading)return;F.loading=true;F.err="";
  try{
    const ort=d.ort,b=d.base,pr=p=>{F.prog=p;d.onprog&&d.onprog(p)};
    pr(1);
    F.tax=JSON.parse(new TextDecoder().decode(new Uint8Array(await d.get(b+"taxo.json"))));
    pr(5);
    const model=new Uint8Array(await d.get(b+"wingclip_visual_int8.onnx"));pr(12);
    const data=new Uint8Array(await d.get(b+"wingclip_visual_int8.data"));pr(35);
    const text=new Uint8Array(await d.get(b+"text_classifier_int8.bin"));pr(45);
    const occ=new Uint8Array(await d.get(b+"occurrence.bin.gz"));pr(75);
    F.sess=await ort.InferenceSession.create(model,{executionProviders:["wasm"],externalData:[{path:"wingclip_visual_int8.data",data}]});pr(85);
    const rows=decodeInt8(text),nr=rows.length/EMB;
    F.n=nr-1;if(F.n!==F.tax.length)throw new Error("lista de especies no coincide ("+F.n+" / "+F.tax.length+")");
    F.text=rows.subarray(0,F.n*EMB);F.probe=rows.subarray(F.n*EMB);
    F.occ=parseOcc(await gunzip(occ));F.ort=ort;pr(100);F.ready=true;
  }catch(e){F.err=String(e&&e.message||e)}
  F.loading=false;
};
/* rgba: Uint8ClampedArray w*h*4. loc {lat,lon}|null, month 1-12|undefined */
F.identify=async function(rgba,w,h,loc,month,topK){
  const px=preprocess(rgba,w,h);
  const out=await F.sess.run({[F.sess.inputNames[0]]:new F.ort.Tensor("float32",px,[1,3,224,224])});
  const emb=out[F.sess.outputNames[0]].data;let norm=0;for(let i=0;i<EMB;i++)norm+=emb[i]*emb[i];norm=Math.sqrt(norm)||1;
  let dot=0;for(let i=0;i<EMB;i++)dot+=F.probe[i]*emb[i];
  const pBird=sigm(CAL.pa*logit(sigm(dot/norm+CAL.bias))+CAL.pb);
  const sims=new Float32Array(F.n),t=F.text;
  for(let s=0;s<F.n;s++){const b=s*EMB;let a=0,c=0,d2=0,e=0;for(let i=0;i<EMB;i+=4){a+=t[b+i]*emb[i];c+=t[b+i+1]*emb[i+1];d2+=t[b+i+2]*emb[i+2];e+=t[b+i+3]*emb[i+3]}sims[s]=(a+c+d2+e)/norm}
  const K=25,bi=[],bv=[];let worst=-Infinity;
  for(let s=0;s<F.n;s++){const v=sims[s];if(bi.length===K&&v<=worst)continue;let p=bi.length;while(p>0&&bv[p-1]<v)p--;bi.splice(p,0,s);bv.splice(p,0,v);if(bi.length>K){bi.pop();bv.pop()}worst=bv[bv.length-1]}
  const sc=rank(bi.map((i,k)=>({idx:i,sim:bv[k]})),F.occ,loc,month),pr=softmax(sc);
  return{pBird,esAve:pBird>=CAL.thr,res:sc.slice(0,topK||5).map((s,i)=>({idx:s.idx,conf:pBird*pr[i],logP:s.logP}))};
};
F.nombre=i=>{const x=F.tax[i];return{en:x[0],sci:x[1],es:x[2]||""}};
F._t={preprocess,rank,parseOcc,lonLatToEqualEarth,xyToCell};
G.FOTO=F;
})(typeof window!=="undefined"?window:globalThis);
