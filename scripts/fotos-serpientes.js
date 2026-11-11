// Descarga fotos LIBRES de Wikimedia Commons para la guia de serpientes.
// Solo acepta: dominio publico, CC0, CC BY y CC BY-SA. Descarta NC/ND y fotos sin autor.
// Guarda las imagenes en www/img/serpientes y los creditos en www/serpientes.json.
// Nunca falla la compilacion: si algo no funciona, la app muestra la ficha sin foto.
const fs=require("fs"),path=require("path");
const UA="PajareoHuelva/1.0 (app gratuita sin animo de lucro; https://github.com/jolunepa/Pajareo-Huelva)";
const API="https://commons.wikimedia.org/w/api.php";
const SP={
 "esculapio":["Zamenis longissimus","Elaphe longissima"]
};
const MAX=3;
const BADCAT=/protein|molecul|structur|\bPDB\b|toxin|enzyme|chemi|biochem|diagram|drawing|illustrat|painting|engrav|lithograph|stamp|coin|\bmaps?\b|skeleton|skull|museum|specimen|taxiderm|fossil|scientific plate|book plate|logo|icon/i;
const BAD=/protein|toxin|enzyme|molecul|structure|PDB|crystal|phospholipase|metalloprot|disintegrin|plate|lithograph|engraving|painting|stamp|brehm|skull|cr[aá]neo|map|mapa|distribution|range|egg|huevo|sloughed|exuvia|shed|track|diagram|svg|drawing|illustration|museum|preserved|dead|road kill|atropell|jar|specimen/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,bin){
  for(let i=0;i<4;i++){
    try{
      const r=await fetch(url,{headers:{"User-Agent":UA}});
      if(r.status===429||r.status>=500){await sleep(2500*(i+1));continue}
      if(!r.ok)throw new Error("http "+r.status);
      return bin?Buffer.from(await r.arrayBuffer()):await r.json();
    }catch(e){if(i===3)throw e;await sleep(1500*(i+1))}
  }
}
const txt=h=>String(h||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
const libre=l=>{l=String(l||"").trim();if(!l)return false;if(/-NC|-ND|\bNC\b|\bND\b/.test(l))return false;return /^(CC0|Public domain|PD\b|CC BY(-SA)?\b)/i.test(l)};
function filtra(pages,tag){
  const out=[],rz={tipo:0,titulo:0,cats:0,lic:0};
  for(const p of Object.values(pages||{})){
    const ii=p.imageinfo&&p.imageinfo[0];if(!ii)continue;
    if(ii.mime!=="image/jpeg"){rz.tipo++;continue}
    if(BAD.test(p.title)){rz.titulo++;continue}
    const m=ii.extmetadata||{};
    const cats=txt(m.Categories&&m.Categories.value);
    if(BADCAT.test(cats)){rz.cats++;continue}
    const lic=txt(m.LicenseShortName&&m.LicenseShortName.value);
    const aut=txt(m.Artist&&m.Artist.value).slice(0,110);
    if(!libre(lic)||!aut){rz.lic++;continue}
    out.push({t:p.title,thumb:ii.thumburl,aut,lic,url:ii.descriptionurl});
  }
  console.log("  ",tag,"-> validas",out.length,"rechazadas",JSON.stringify(rz));
  return out;
}
const IIP="&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=640";
async function categoria(cat){
  const u=API+"?action=query&format=json&generator=categorymembers&gcmtitle="+encodeURIComponent("Category:"+cat)+"&gcmtype=file&gcmlimit=60"+IIP;
  const j=await get(u);return filtra(j.query&&j.query.pages,"cat "+cat);
}
async function subcats(cat){
  const u=API+"?action=query&format=json&list=categorymembers&cmtitle="+encodeURIComponent("Category:"+cat)+"&cmtype=subcat&cmlimit=30";
  const j=await get(u);return((j.query&&j.query.categorymembers)||[]).map(x=>x.title.replace(/^Category:/,""));
}
async function busca(txtq){
  const u=API+"?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch="+encodeURIComponent(txtq+" filetype:bitmap")+IIP;
  const j=await get(u);return filtra(j.query&&j.query.pages,"busqueda "+txtq);
}
(async()=>{
  const res={};
  const dir="www/img/serpientes";fs.mkdirSync(dir,{recursive:true});
  for(const [id,cats] of Object.entries(SP)){
    res[id]=[];
    try{
      for(const c of cats){
        let l=[];try{l=await categoria(c)}catch(e){console.log("  fallo categoria",c,e.message)}
        await sleep(800);
        if(l.length<3){try{
          for(const sc of (await subcats(c)).filter(x=>!BADCAT.test(x)).slice(0,10)){
            await sleep(700);try{l=l.concat(await categoria(sc))}catch(e){console.log("  fallo subcat",sc,e.message)}
            if(l.length>=8)break}
        }catch(e){console.log("  fallo subcats",c,e.message)}}
        if(!l.length){try{l=await busca(c)}catch(e){console.log("  fallo busqueda",c,e.message)}await sleep(800)}
        const vistos=new Set();
        for(const f of l){
          if(res[id].length>=MAX)break;
          if(vistos.has(f.t))continue;vistos.add(f.t);
          try{
            const b=await get(f.thumb,true);
            if(b.length<5000)continue;
            const n=id+"-"+(res[id].length+1)+".jpg";
            fs.writeFileSync(path.join(dir,n),b);
            res[id].push({f:"img/serpientes/"+n,a:f.aut,l:f.lic,u:f.url});
            await sleep(600);
          }catch(e){console.log("  fallo imagen",f.t,e.message)}
        }
        if(res[id].length)break;
      }
    }catch(e){console.log("  fallo",id,e.message)}
    console.log(id,res[id].length,"fotos");
  }
  fs.writeFileSync("www/serpientes.json",JSON.stringify(res));
  console.log("TOTAL",Object.values(res).reduce((a,b)=>a+b.length,0),"fotos");
})().catch(e=>{console.log("ERROR general",e.message);try{fs.writeFileSync("www/serpientes.json","{}")}catch(_){}});
