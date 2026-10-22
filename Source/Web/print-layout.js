// Copy only inert document content and allowlisted computed styles. No live DOM,
// event handlers, credentials, remote URLs, editor controls or scripts leave here.
const printStyleProperties=[
 'display','box-sizing','width','min-width','max-width','padding-top','padding-right','padding-bottom','padding-left',
 'margin-top','margin-right','margin-bottom','margin-left','font-family','font-size','font-weight','font-style',
 'font-optical-sizing','font-kerning','font-feature-settings','font-variation-settings','line-height','letter-spacing','color','background-color','text-align','text-decoration','white-space','word-break',
 'overflow-wrap','border-top','border-right','border-bottom','border-left','border-radius','border-collapse','border-spacing',
 'table-layout','vertical-align','list-style-type','flex-direction','flex-grow','flex-shrink','flex-basis','align-items',
 'align-self','justify-content','gap','object-fit'
];
function inertPrintNode(node,preview=false){
 if(node.nodeType===3)return document.createTextNode(node.textContent);
 if(node.nodeType!==1)return null;
 if(node.matches('button,select,svg,script,style,iframe,object,embed,details,.mj-block-tools,.mj-line-plus,.mj-media-tools,.mj-table-controls,.mj-list-hint,.mj-retained-selection'))return null;
 const tag=node.tagName.toLowerCase(),allowed=new Set(['div','span','p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','b','em','i','s','del','mark','code','pre','br','hr','a','figure','figcaption','img','video','table','thead','tbody','tr','th','td','label','input','textarea']);
 if(!allowed.has(tag))return null;
 const result=document.createElement(tag==='video'?'img':tag==='input'||tag==='label'?'span':tag==='textarea'?'pre':tag);
 const style=getComputedStyle(node);
 for(const key of printStyleProperties)result.style.setProperty(key,style.getPropertyValue(key));
 if(tag==='img'||tag==='video'){
  const original=tag==='video'?node.poster:node.getAttribute('src'),data=documentMediaData(original);
  const src=data?(preview?documentMediaResources.byData.get(data)||data:data):'';
  if(!src)return null;result.setAttribute('src',src);result.setAttribute('alt',node.getAttribute('alt')||'');
  result.style.height=node.getBoundingClientRect().height+'px';
 }else if(tag==='input')result.textContent=node.type==='checkbox'?(node.checked?'☑':'☐'):node.type==='password'?'••••••••':node.value;
 else if(tag==='textarea')result.textContent=node.value;
 else for(const child of node.childNodes){const copy=inertPrintNode(child,preview);if(copy)result.append(copy);}
 if(tag==='a'){const href=safeURL(node.getAttribute('href'));if(href)result.setAttribute('href',href);}
 if(tag==='td'||tag==='th')for(const key of ['colspan','rowspan'])if(/^[1-9]\d?$/.test(node.getAttribute(key)||''))result.setAttribute(key,node.getAttribute(key));
 return result;
}
function paginatePrintCanvas(page,grid,scale){
 // Measure the inert copy at the original canvas width before scaling. Split at
 // block or text-line boundaries so a printed sheet never cuts a glyph in half.
 page.style.cssText+=';position:fixed;left:-100000px;top:0;visibility:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
 document.body.append(page);
 try{
  const origin=page.getBoundingClientRect().top;
  const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top-origin,bottom:r.bottom-origin};};
  const blocks=[...grid.children].map(bounds),lines=[],walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   if(!node.textContent.trim())continue;
   const range=document.createRange();range.selectNodeContents(node);
   for(const rect of range.getClientRects())if(rect.height)lines.push({top:rect.top-origin,bottom:rect.bottom-origin});
  }
  const total=Math.max(page.getBoundingClientRect().height,...blocks.map(b=>b.bottom));
  const capacity=(260.8/25.4*96)/scale,cuts=[0];
  while(cuts.at(-1)<total-.1){
   const start=cuts.at(-1);let end=Math.min(total,start+capacity);
   if(end<total){
    // Keep a normal-sized row group together, including a block spanning rows.
    let changed=true;
    while(changed){
     changed=false;
     for(const b of blocks)if(b.top>start+.5&&b.top<end&&b.bottom>end&&b.bottom-b.top<=capacity){
      end=b.top;changed=true;
     }
    }
    for(let attempt=0;attempt<100;attempt++){
     const crossing=lines.filter(line=>line.top<end-.1&&line.bottom>end+.1);
     if(!crossing.length)break;
     const next=Math.min(...crossing.map(line=>line.top));
     if(next<=start+.5)break;end=next;
    }
   }
   if(end<=start+.5)end=Math.min(total,start+capacity);
   cuts.push(end);
   if(cuts.length>201)throw new Error(ui('文档超过 200 页，请分成较短文档后导出。','This document exceeds 200 pages. Split it into shorter documents before exporting.'));
  }
  const children=[...page.children].map(bounds);
  const source=page.cloneNode(false);source.style.position='relative';source.style.left='0';source.style.top='0';source.style.visibility='visible';
  const sheets=cuts.slice(0,-1).map((start,i)=>{
   // Clone only intersecting content. Cloning the entire document for every
   // sheet temporarily multiplied every image and text node by the page count.
   const end=cuts[i+1],copy=page.cloneNode(false),copyGrid=grid.cloneNode(false);
   [...grid.children].forEach((el,j)=>{if(blocks[j].bottom>start&&blocks[j].top<end)copyGrid.append(el.cloneNode(true));});
   [...page.children].slice(0,-1).forEach((original,j)=>{
    if(children[j].bottom<=start||children[j].top>=end)return;
    const el=original.cloneNode(true);copy.append(el);
    el.style.position='absolute';el.style.top=children[j].top+'px';el.style.marginTop='0';
   });
   copy.append(copyGrid);
   // Explicit source coordinates survive removal of content above this page.
   copyGrid.style.position='absolute';copyGrid.style.top=(grid.getBoundingClientRect().top-origin)+'px';copyGrid.style.marginTop='0';
   copy.style.position='absolute';copy.style.visibility='visible';copy.style.left='0';copy.style.top='0';
   copy.style.transformOrigin='top left';copy.style.transform='translateY('+(-start*scale)+'px) scale('+scale+')';
   return '<section class="print-sheet"><div style="position:relative;contain:strict;overflow:hidden;height:'+((end-start)*scale)+'px">'+copy.outerHTML+'</div></section>';
  }).join('');
  // The measured tree is no longer needed. Move it into the export wrapper
  // instead of making a second complete media tree.
  source.append(...page.childNodes);
  return {sheets,source:source.outerHTML,width:parseFloat(page.style.width),height:total,cuts};
 }finally{page.remove();}
}
async function captureDocumentPrint(r,options={}){
 const box=$('#mj-blocks');if(!box||selected()!==r)throw new Error(ui('请先打开文档','Open the document first'));
 // Decode lazy images before measuring. A video exports its local poster.
 await Promise.all([...box.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
 if(selected()!==r)throw new Error(ui('文档已切换，请重新导出','Document changed. Export again.'));
 const width=box.getBoundingClientRect().width;
 if(!Number.isFinite(width)||width<100||width>10000)throw new Error(ui('文档宽度无效','Invalid document width'));
 const page=document.createElement('main'),grid=document.createElement('div'),css=getComputedStyle(box);
 page.style.width=width+'px';
 for(const selector of ['.mj-doc-title','.mj-docdesc']){
  const el=$(selector);if(el&&!el.hidden&&!el.closest('[hidden]')){const copy=inertPrintNode(el,options.preview);if(copy)page.append(copy);}
 }
 if(r.fields?.length){const fields=document.createElement('dl');fields.innerHTML=r.fields.map(f=>'<dt>'+escape(f.label)+'</dt><dd>'+escape(fieldIsSecret(f)?'••••••••':f.value||'—')+'</dd>').join('');page.append(fields);}
 grid.style.cssText='display:grid;width:'+width+'px;grid-template-columns:'+css.gridTemplateColumns+';grid-template-rows:'+css.gridTemplateRows+';gap:'+css.gap+';align-items:start;margin-top:'+css.marginTop;
 for(const el of box.querySelectorAll(':scope>[data-component]')){
  const index=Number(el.dataset.component),b=r.blocks[index];if(!b)continue;
  let copy;
  if(['form','otp'].includes(b.type)){
   copy=document.createElement('div');copy.innerHTML=richPrintBlock(b); // Always mask secrets, even when revealed.
   const l=blockLayout(b.layout);copy.style.cssText='padding:'+l.padding+'px;'+blockSurfaceCSS(b.surface);
  }else copy=inertPrintNode(el,options.preview);
  if(!copy)continue;
  const style=getComputedStyle(el);copy.style.gridColumn=style.gridColumn;copy.style.gridRow=style.gridRow;
  copy.style.minHeight=el.getBoundingClientRect().height+'px';copy.style.breakInside='avoid';
  grid.append(copy);
 }
 page.append(grid);
 const scale=(174/25.4*96)/width;
 const pagination=paginatePrintCanvas(page,grid,scale);
 const content=window.kernpadPlatform==='windows'?pagination.sheets:'<meta name="folio-print-canvas" content="'+[pagination.width,pagination.height,...pagination.cuts].join(',')+'"><template id="folio-print-source">'+pagination.source+'</template>';
 // Preserve an immutable mapping for this print packet. Blob URLs never cross
 // the native export boundary, and unregistered blob URLs are never accepted.
 const media=[...documentMediaResources.byURL].filter(([url])=>content.includes(url));
 const exportContent=()=>media.reduce((html,[url,data])=>html.replaceAll(url,data),content);
 const makeHTML=()=>'<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}html{color-scheme:light}body{margin:0;width:174mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.print-sheet{width:174mm;height:260.8mm;position:relative;break-after:page;overflow:hidden}.print-sheet:last-child{break-after:auto}main{margin:0;break-inside:avoid}dl{margin:12px 0}dt{color:#666;font-size:12px}dd{margin:3px 0 10px}img{break-inside:avoid}</style></head><body>'+exportContent()+'</body></html>';
 return options.preview?{get html(){return makeHTML();},sheets:pagination.sheets,pages:pagination.cuts.length-1,width:pagination.width,cuts:pagination.cuts}:makeHTML();
}
