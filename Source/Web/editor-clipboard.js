// Clipboard content is untrusted data. Rebuild supported blocks explicitly;
// never restore record identities, template bindings, arbitrary HTML or URLs.
const documentClipboardType='application/x-kernpad-blocks+json',documentClipboardLimit=20*1024*1024;
let tableCellSelection=null,tableCellAnchor=null;
function clipboardLiteral(text){return String(text).replace(/([\\`*_\[\]~=<])/g,'\\$1');}
function clipboardPlain(source){const box=document.createElement('div');box.innerHTML=mdInline(source||'');box.querySelectorAll('br').forEach(el=>el.replaceWith('\n'));return box.textContent;}
function clipboardRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw new Error(ui('表格最多 1,000 行、100 列','Tables support up to 1,000 rows and 100 columns'));
 const width=Math.max(...rows.map(row=>Array.isArray(row)?row.length:0));
 if(!width||width>100||rows.some(row=>!Array.isArray(row)||row.some(v=>typeof v!=='string')))throw new Error(ui('表格内容无效','Invalid table contents'));
 return rows.map(row=>Array.from({length:width},(_,i)=>row[i]||''));
}
function parseClipboardTSV(source){
 const text=String(source).replace(/\r\n?/g,'\n'),rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'&&(quoted||!value)){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c==='\t'||c==='\n')){row.push(clipboardLiteral(value));value='';if(c==='\n'){rows.push(row);row=[];if(rows.length>1000)throw new Error(ui('表格最多 1,000 行、100 列','Tables support up to 1,000 rows and 100 columns'));}}
  else value+=c;
 }
 if(quoted)throw new Error(ui('粘贴内容的引号未闭合','Unclosed quote in pasted table'));
 // Spreadsheet exporters append one record terminator; it is not an extra row.
 if(value||row.length||!rows.length||!text.endsWith('\n')){row.push(clipboardLiteral(value));rows.push(row);}
 return clipboardRows(rows);
}
function clipboardTSV(rows){return rows.map(row=>row.map(source=>{const text=clipboardPlain(source);return /[\t\n\r"]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;}).join('\t')).join('\n');}
function clipboardTableHTML(rows){return '<table><tbody>'+rows.map(row=>'<tr>'+row.map(source=>'<td>'+mdInline(source)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function cleanClipboardBlocks(source){
 if(!Array.isArray(source)||!source.length||source.length>200)throw new Error(ui('单次最多插入 200 个内容块','Insert up to 200 blocks at a time'));
 const str=(v,fallback='')=>typeof v==='string'?v:fallback;
 return source.map(raw=>{
  if(!raw||typeof raw!=='object'||!['text','heading','quote','callout','check','code','list','table','form','otp','date','tags','link','divider','image','video'].includes(raw.type))throw new Error(ui('剪贴板组件无效','Invalid clipboard block'));
  const b={type:raw.type,componentID:'c_'+crypto.randomUUID()};
  if(raw.layout&&typeof raw.layout==='object')b.layout=blockLayout(raw.layout);
  if(raw.textStyle&&typeof raw.textStyle==='object')b.textStyle=richStyle(raw.textStyle);
  if(raw.surface&&typeof raw.surface==='object')b.surface=blockSurface(raw.surface);
  if(raw.accent===true)b.accent=true;
  if(['text','heading','quote','callout','check','code'].includes(b.type))b.text=str(raw.text);
  if(b.type==='heading')b.level=Number.isInteger(raw.level)?Math.max(1,Math.min(6,raw.level)):2;
  if(b.type==='check')b.checked=raw.checked===true;
  if(b.type==='code')b.language=str(raw.language,'text');
  if(b.type==='list'){
   if(!Array.isArray(raw.items)||raw.items.some(v=>typeof v!=='string'))throw new Error(ui('列表内容无效','Invalid list contents'));
   b.items=[...raw.items];b.ordered=raw.ordered===true;b.levels=listLevels(raw);
  }
  if(b.type==='table')b.rows=clipboardRows(raw.rows);
  if(['form','otp','date','tags','link'].includes(b.type))b.title=str(raw.title);
  if(['date','link'].includes(b.type))b.value=str(raw.value);
  if(b.type==='otp'){b.seed=str(raw.seed);if(raw.storage==='public')b.storage='public';}
  if(b.type==='tags'){if(!Array.isArray(raw.values)||raw.values.some(v=>typeof v!=='string'))throw new Error(ui('标签内容无效','Invalid tags'));b.values=[...raw.values];}
  if(b.type==='form'){
   if(!Array.isArray(raw.fields)||raw.fields.length>256)throw new Error(ui('表单内容无效','Invalid form contents'));
   b.fields=raw.fields.map(f=>{
    if(!f||typeof f!=='object')throw new Error(ui('表单内容无效','Invalid form contents'));
    const kind=['text','secret','otp','url','email','date','tags','number','multiline'].includes(f.kind)?f.kind:'text';
    return {componentID:'c_'+crypto.randomUUID(),key:'custom.pasted_'+crypto.randomUUID().replaceAll('-','_'),label:str(f.label).slice(0,120),kind,secret:f.secret===true||['secret','otp'].includes(kind),value:str(f.value)};
   });
  }
  if(['image','video'].includes(b.type)){
   b.data=safeMediaData(raw.data,b.type);if(!b.data)throw new Error(ui('剪贴板媒体无效','Invalid clipboard media'));
   b.name=str(raw.name).slice(0,200);b.width=Number.isInteger(raw.width)?Math.max(25,Math.min(100,raw.width)):100;
   if(raw.poster){b.poster=safeMediaData(raw.poster);if(!b.poster)throw new Error(ui('剪贴板媒体无效','Invalid clipboard media'));}
  }
  return b;
 });
}
function clipboardCell(node){return (node?.nodeType===1?node:node?.parentElement)?.closest('[data-cell]');}
function clipboardRangeSource(el,selection,plain=false){
 if(!selection.intersectsNode(el))return null;
 const bounds=document.createRange();bounds.selectNodeContents(el);const range=selection.cloneRange();
 if(range.compareBoundaryPoints(Range.START_TO_START,bounds)<0)range.setStart(bounds.startContainer,bounds.startOffset);
 if(range.compareBoundaryPoints(Range.END_TO_END,bounds)>0)range.setEnd(bounds.endContainer,bounds.endOffset);
 if(range.collapsed)return null;if(plain)return range.toString();const box=document.createElement('div');box.append(range.cloneContents());return richSource(box);
}
function clipboardBlocksInTextRange(){
 const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null,component=node=>(node?.nodeType===1?node:node?.parentElement)?.closest('#mj-blocks>[data-component]');
 if(!range||range.collapsed)return null;
 const start=component(range.startContainer),end=component(range.endContainer);if(!start||!end||start===end)return null;
 const blocks=[],first=Number(start.dataset.component),last=Number(end.dataset.component);
 for(let index=first;index<=last;index++){
  const b=selected().blocks[index],el=$('[data-component="'+index+'"]');if(!b||!el)continue;const copy=cloneDocumentValue(b);
  if(b.type==='table'){
   const cells=[...el.querySelectorAll('[data-cell]')].map(cell=>({cell,source:clipboardRangeSource(cell,range),parts:cell.dataset.cell.split(',').map(Number)})).filter(c=>c.source!==null);
   if(!cells.length)continue;const top=Math.min(...cells.map(c=>c.parts[1])),bottom=Math.max(...cells.map(c=>c.parts[1])),left=Math.min(...cells.map(c=>c.parts[2])),right=Math.max(...cells.map(c=>c.parts[2]));
   copy.rows=Array.from({length:bottom-top+1},()=>Array(right-left+1).fill(''));for(const c of cells)copy.rows[c.parts[1]-top][c.parts[2]-left]=c.source;
  }else if(b.type==='list'){
   const parts=[...el.querySelectorAll('[data-rich-item]')].map(item=>({source:clipboardRangeSource(item,range),index:Number(item.dataset.richItem)})).filter(p=>p.source!==null);
   if(!parts.length)continue;copy.items=parts.map(p=>p.source);const levels=listLevels(b),base=levels[parts[0].index];copy.levels=listLevels({items:copy.items,levels:parts.map(p=>Math.max(0,levels[p.index]-base))});
  }else if(['text','heading','quote','callout','check'].includes(b.type)){
   const text=el.querySelector('[data-rich-block]'),source=text?clipboardRangeSource(text,range):null;if(source===null)continue;copy.text=source;
  }else if(b.type==='code'){
   const pre=el.querySelector('pre');if(!pre)continue;const source=clipboardRangeSource(pre,range,true);if(source===null)continue;copy.text=source;
  }else if(['form','otp'].includes(b.type)){
   // Text selection never implies copying hidden form values or OTP seeds.
   const box=document.createElement('div');box.innerHTML=richPrintBlock(b);blocks.push({type:'text',text:clipboardLiteral(box.textContent)});continue;
  }else if(['image','video'].includes(b.type)){
   const media=el.querySelector('img,video');if(!media||![...range.cloneContents().querySelectorAll('img,video')].some(n=>n.getAttribute('src')===media.getAttribute('src')))continue;
  }
  blocks.push(copy);
 }
 return blocks.length?blocks:null;
}
function tableClipboardRange(target){
 const r=selected();if(!r)return null;
 const picked=tableCellSelection;
 if(picked?.id===r.id&&picked.epoch===privacyEpoch&&r.blocks[picked.index]?.type==='table'&&target.closest('[data-component]')?.dataset.component===String(picked.index))return picked;
 const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
 const start=clipboardCell(range?.startContainer),end=clipboardCell(range?.endContainer);
 if(range&&!range.collapsed&&(!start||!end||start.closest('[data-component]')!==end.closest('[data-component]')))return null;
 if(start&&end&&start!==end){
  const [index,row,col]=start.dataset.cell.split(',').map(Number),[last,er,ec]=end.dataset.cell.split(',').map(Number);
  if(index===last&&root.contains(start)&&root.contains(end))return {id:r.id,epoch:privacyEpoch,index,top:Math.min(row,er),left:Math.min(col,ec),bottom:Math.max(row,er),right:Math.max(col,ec)};
 }
 const cell=target.closest('[data-cell]');if(!cell||range&&!range.collapsed&&cell.contains(range.commonAncestorContainer))return null;
 const [index,row,col]=cell.dataset.cell.split(',').map(Number);return {id:r.id,epoch:privacyEpoch,index,top:row,left:col,bottom:row,right:col};
}
function paintTableSelection(){
 const s=tableCellSelection;for(const cell of $$('[data-cell]')){const [index,row,col]=cell.dataset.cell.split(',').map(Number);cell.classList.toggle('mj-cell-selected',!!s&&s.id===selected()?.id&&s.epoch===privacyEpoch&&s.index===index&&row>=s.top&&row<=s.bottom&&col>=s.left&&col<=s.right);}
}
function focusTableCell(index,row,col){
 const cell=$('[data-cell="'+[index,row,col].join(',')+'"]');if(!cell)return;
 cell.focus({preventScroll:true});const range=document.createRange();range.selectNodeContents(cell);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);cell.scrollIntoView({block:'nearest',inline:'nearest'});
}
function selectTableRectangle(anchor,row,col){tableCellSelection={...anchor,top:Math.min(anchor.row,row),left:Math.min(anchor.col,col),bottom:Math.max(anchor.row,row),right:Math.max(anchor.col,col),row,col};paintTableSelection();}
root.addEventListener('pointerdown',event=>{
 const cell=event.target.closest('[data-cell]');
 if(!cell||!isEditing()){tableCellSelection=null;tableCellAnchor=null;paintTableSelection();return;}
 const [index,row,col]=cell.dataset.cell.split(',').map(Number),r=selected();
 if(event.shiftKey&&tableCellAnchor?.id===r.id&&tableCellAnchor.epoch===privacyEpoch&&tableCellAnchor.index===index){event.preventDefault();selectTableRectangle(tableCellAnchor,row,col);}
 else{tableCellSelection=null;tableCellAnchor={id:r.id,epoch:privacyEpoch,index,row,col};paintTableSelection();}
},true);
root.addEventListener('focusin',event=>{
 const cell=event.target.closest('[data-cell]');if(!cell||!isEditing())return;
 const [index,row,col]=cell.dataset.cell.split(',').map(Number),b=selected().blocks[index];b.selectedRow=row;b.selectedCol=col;
 for(const axis of ['row','col']){const control=$('[data-table-select="'+index+'"][data-axis="'+axis+'"]');if(control)control.value=String(axis==='row'?row:col);}
 if(!tableCellSelection)tableCellAnchor={id:selected().id,epoch:privacyEpoch,index,row,col};
});
// The original plain-text handler runs on root. Capture first to keep rich cell
// data synchronized without exposing generated HTML to the document model.
window.addEventListener('input',event=>{const cell=event.target.closest?.('[data-cell]');if(!cell||!isEditing())return;const [index,row,col]=cell.dataset.cell.split(',').map(Number);selected().blocks[index].rows[row][col]=richSource(cell);event.stopImmediatePropagation();remember();},true);
root.addEventListener('keydown',event=>{
 const cell=event.target.closest('[data-cell]');if(!cell||!isEditing()||event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return;
 const [index,row,col]=cell.dataset.cell.split(',').map(Number),b=selected().blocks[index];
 if(event.key==='Escape'){tableCellSelection=null;paintTableSelection();return;}
 if(event.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();const s=tableCellSelection,anchor=tableCellAnchor||{id:selected().id,epoch:privacyEpoch,index,row,col};tableCellAnchor=anchor;
  const rr=Math.max(0,Math.min(b.rows.length-1,(s?.row??row)+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0))),cc=Math.max(0,Math.min(b.rows[0].length-1,(s?.col??col)+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0)));selectTableRectangle(anchor,rr,cc);return;
 }
 if(event.key==='Tab'){
  event.preventDefault();event.stopImmediatePropagation();tableCellSelection=null;paintTableSelection();const width=b.rows[0].length,next=row*width+col+(event.shiftKey?-1:1);
  if(next<0)return;if(next>=b.rows.length*width){if(b.rows.length>=1000)return;snapshotEditor();b.rows.push(Array(width).fill(''));richSelection=null;repaintBlocks();remember();}
  focusTableCell(index,Math.floor(next/width),next%width);
 }
},true);
function writeBlockClipboard(event,blocks,{protectedSource=false}={}){
 const data=JSON.stringify({version:1,protected:protectedSource,blocks});if(new TextEncoder().encode(data).length>documentClipboardLimit)throw new Error(ui('复制内容超过 20 MB','Copy is limited to 20 MB'));
 const token=crypto.randomUUID(),html=blocks.map(b=>b.type==='table'?clipboardTableHTML(b.rows):richPrintBlock(b)).join('');
 event.clipboardData.setData(documentClipboardType,data);
 // HTML is also a portable fallback for platforms that drop custom MIME types.
 event.clipboardData.setData('text/html','<div data-kernpad-copy="'+token+'" data-kernpad-clipboard="'+escape(data)+'">'+html+'</div>');
 event.clipboardData.setData('text/plain',blocks.map(b=>b.type==='table'?clipboardTSV(b.rows):b.type==='code'?b.text:b.type==='list'?b.items.map(clipboardPlain).join('\n'):clipboardPlain(b.text||b.value||b.title||b.name||'')).join('\n\n'));
 event.preventDefault();event.stopImmediatePropagation();
 // Track only this marked clipboard write. A later copy has a different token
 // and must never be erased by this write's expiry or by a delayed bridge call.
 if(event.isTrusted)nativeCall('trackDocumentClipboard',{token}).catch(()=>{});
}
function copyDocumentSelection(event){
 const target=event.target;if(state.view!=='document'||!selected()||isProtected(selected())&&!vaultUnlocked||!$('#mj-overlay').hidden||!event.clipboardData||!target.closest?.('.mj-paper'))return;
 if(target.closest('input,textarea,select'))return;
 const ranged=event.type==='copy'?clipboardBlocksInTextRange():null;
 if(ranged){writeBlockClipboard(event,ranged,{protectedSource:isProtected(selected())});return;}
 const rect=tableClipboardRange(target),cut=event.type==='cut';
 if(rect){
  const b=selected().blocks[rect.index],rows=b.rows.slice(rect.top,rect.bottom+1).map(row=>row.slice(rect.left,rect.right+1));
  writeBlockClipboard(event,[{type:'table',rows}],{protectedSource:isProtected(selected())});
  if(cut&&isEditing()){snapshotEditor();for(let row=rect.top;row<=rect.bottom;row++)for(let col=rect.left;col<=rect.right;col++)b.rows[row][col]='';richSelection=null;repaintBlocks();focusTableCell(rect.index,rect.top,rect.left);remember();}return;
 }
 // A handle selection copies whole components. Text selections keep the native
 // copy/cut behaviour, including partial selections within a single cell.
 if(!isEditing()||target.closest('[contenteditable="true"]')||!target.closest('[data-layout-block],#mj-blocks'))return;
 const indices=currentRichIndices().sort((a,b)=>a-b);if(!indices.length)return;
 writeBlockClipboard(event,indices.map(i=>selected().blocks[i]),{protectedSource:isProtected(selected())});
 if(cut){snapshotEditor();selected().blocks=selected().blocks.filter((_,i)=>!indices.includes(i));if(!selected().blocks.length)selected().blocks=[{type:'text',text:''}];richSelection=null;activeRichIndex=Math.min(indices[0],selected().blocks.length-1);richBlockSelection={id:selected().id,indices:[activeRichIndex]};repaintBlocks();focusRich(activeRichIndex);remember();}
}
for(const type of ['copy','cut'])window.addEventListener(type,event=>{try{copyDocumentSelection(event);}catch(error){event.preventDefault();event.stopImmediatePropagation();toast(error.message);}},true);
function readBlockClipboard(data,html){
 let source=data.getData(documentClipboardType);
 if(!source&&html&&html.length<=documentClipboardLimit*6){const doc=new DOMParser().parseFromString(html,'text/html');source=doc.querySelector('[data-kernpad-clipboard]')?.getAttribute('data-kernpad-clipboard')||'';}
 if(!source)return null;
 if(new TextEncoder().encode(source).length>documentClipboardLimit)throw new Error(ui('粘贴内容超过 20 MB','Paste is limited to 20 MB'));
 const payload=JSON.parse(source);if(payload?.version!==1||typeof payload.protected!=='boolean')throw new Error(ui('剪贴板组件版本无效','Invalid clipboard block version'));
 return {protected:payload.protected,blocks:cleanClipboardBlocks(payload.blocks)};
}
function pasteTableRows(cell,rows){
 const picked=tableCellSelection;
 if(picked?.id===selected()?.id&&picked.epoch===privacyEpoch&&String(picked.index)===cell.closest('[data-component]')?.dataset.component)cell=$('[data-cell="'+[picked.index,picked.top,picked.left].join(',')+'"]')||cell;
 rows=clipboardRows(rows);const [index,row,col]=cell.dataset.cell.split(',').map(Number),b=selected().blocks[index];
 const height=Math.max(b.rows.length,row+rows.length),width=Math.max(b.rows[0].length,col+rows[0].length);
 if(height>1000||width>100)throw new Error(ui('表格最多 1,000 行、100 列','Tables support up to 1,000 rows and 100 columns'));
 const next=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>b.rows[r]?.[c]||''));
 for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++)next[row+r][col+c]=rows[r][c];
 if(new TextEncoder().encode(JSON.stringify(next)).length>documentClipboardLimit)throw new Error(ui('粘贴内容超过 20 MB','Paste is limited to 20 MB'));
 snapshotEditor();b.rows=next;richSelection=null;tableCellSelection=null;repaintBlocks();focusTableCell(index,row,col);remember();
}
function pasteClipboardInline(el,source,{plain=false}={}){
 const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
 if(!range||!el.contains(range.startContainer)||!el.contains(range.endContainer))return;
 snapshotEditor();range.deleteContents();const fragment=document.createDocumentFragment();
 if(plain)fragment.append(document.createTextNode(source));else{const box=document.createElement('div');box.innerHTML=mdInline(source);fragment.append(...box.childNodes);}
 const last=fragment.lastChild;range.insertNode(fragment);if(last)range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
 if(el.dataset.cell!==undefined){const [index,row,col]=el.dataset.cell.split(',').map(Number);selected().blocks[index].rows[row][col]=richSource(el);}else readRich(el);remember();
}
function importClipboardHTML(html){
 if(!html||html.length>500000)return null;
 try{return richImportHTML(html);}catch{return null;}
}
function clipboardInlineSource(b){
 const style=richStyle(b.textStyle);let source=b.text;
 if(style.color||style.fontSize)source='<span'+(style.color?' data-rt-color="'+style.color+'"':'')+(style.fontSize?' data-rt-size="'+style.fontSize+'"':'')+'>'+source+'</span>';
 return source;
}
function pasteDocumentBlocks(blocks,el,{preserveLayout=false}={}){
 const r=selected(),index=Number(el?.dataset.richBlock??el?.closest('[data-component]')?.dataset.component??activeRichIndex??r.blocks.length-1),current=r.blocks[index];
 const replace=current?.type==='text'&&!current.text.trim();let at=replace?index:index+1,remove=replace?1:0,tail=null;
 const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
 if(el?.matches('[data-rich-block]')&&current.type==='text'&&range&&el.contains(range.startContainer)&&el.contains(range.endContainer)&&!replace){
  const head=range.cloneRange(),end=range.cloneRange();head.selectNodeContents(el);head.setEnd(range.startContainer,range.startOffset);end.selectNodeContents(el);end.setStart(range.endContainer,range.endOffset);
  const a=document.createElement('div'),b=document.createElement('div');a.append(head.cloneContents());b.append(end.cloneContents());
  const prefix=richSource(a),suffix=richSource(b);tail={prefix,suffix};if(!prefix){at=index;remove=1;}
 }
 if(r.blocks.length-remove+blocks.length+(tail?.suffix?1:0)>5000)throw new Error(ui('文档组件数量超过上限','Too many document blocks'));
 const added=cleanClipboardBlocks(blocks);
 if(!preserveLayout)for(const b of added)b.layout={...blockLayout(current?.layout),rowSpan:1,before:0,after:0};
 const suffix=tail?.suffix?{...cloneDocumentValue(current),componentID:'c_'+crypto.randomUUID(),text:tail.suffix}:null;if(suffix)delete suffix.templateComponentID;
 const draft=[...r.blocks];draft.splice(at,remove,...added,...(suffix?[suffix]:[]));
 if(new TextEncoder().encode(JSON.stringify(draft)).length>documentClipboardLimit)throw new Error(ui('粘贴内容超过当前文档容量','Pasted content exceeds this document’s capacity'));
 snapshotEditor();if(tail?.prefix)current.text=tail.prefix;
 r.blocks=draft;richSelection=null;activeRichIndex=at;richBlockSelection={id:r.id,indices:added.map((_,i)=>at+i)};repaintBlocks();
 // Keep an explicit component selection after paste so repeated copy/paste can
 // include non-text blocks and a later paste cannot reuse a stale text range.
 window.getSelection()?.removeAllRanges();$('[data-layout-block="'+at+'"]')?.focus({preventScroll:true});remember();
}
window.addEventListener('paste',event=>{
 const target=event.target,el=target.closest?.('[data-rich-block],[data-cell],[data-layout-block],#mj-blocks');
 if(!el||target.closest('input,textarea,select')||!isEditing()||state.view!=='document'||!selected()||isProtected(selected())&&!vaultUnlocked||!$('#mj-overlay').hidden||!event.clipboardData)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  const data=event.clipboardData,text=data.getData('text/plain'),html=data.getData('text/html'),packet=readBlockClipboard(data,html),cell=target.closest('[data-cell]');
  if(packet?.protected&&!isProtected(selected()))throw new Error(ui('受保护组件请粘贴到密码库文档','Paste protected blocks into a vault document'));
  if(packet&&isProtected({...selected(),blocks:packet.blocks})&&!isProtected(selected()))throw new Error(ui('受保护组件请粘贴到密码库文档','Paste protected blocks into a vault document'));
  if(cell){
   const imported=importClipboardHTML(html);
   let rows=packet?.blocks.length===1&&packet.blocks[0].type==='table'?packet.blocks[0].rows:null;
   if(packet&&!rows){pasteDocumentBlocks(packet.blocks,cell,{preserveLayout:true});return;}
   if(!rows&&imported?.length===1&&imported[0].type==='table')rows=imported[0].rows;
   if(rows||/[\t\r\n]/.test(text)){pasteTableRows(cell,rows||parseClipboardTSV(text));return;}
   const picked=tableCellSelection,inline=imported?.length===1&&imported[0].type==='text'?clipboardInlineSource(imported[0]):null;
   if(picked?.id===selected().id&&picked.epoch===privacyEpoch&&String(picked.index)===cell.closest('[data-component]')?.dataset.component){pasteTableRows(cell,Array.from({length:picked.bottom-picked.top+1},()=>Array(picked.right-picked.left+1).fill(inline??clipboardLiteral(text))));return;}
   if(inline!==null){pasteClipboardInline(cell,inline);return;}
   pasteClipboardInline(cell,text,{plain:true});return;
  }
  if(packet){pasteDocumentBlocks(packet.blocks,el,{preserveLayout:true});return;}
  let blocks=importClipboardHTML(html);
  if(text.includes('\t')&&!blocks?.some(b=>b.type==='table'))blocks=[{type:'table',rows:parseClipboardTSV(text)}];
  else if(!blocks&&text.includes('\n')&&el.matches('[data-rich-block]')&&selected().blocks[Number(el.dataset.richBlock)].type==='text')blocks=parseMarkdown(text);
  if(blocks?.length){
   if(blocks.length===1&&blocks[0].type==='text'&&!text.includes('\n')&&el.matches('[data-rich-block]')){
    pasteClipboardInline(el,clipboardInlineSource(blocks[0]));return;
   }
   pasteDocumentBlocks(blocks,el);return;
  }
  if(!el.matches('[data-rich-block]')){if(text)pasteDocumentBlocks([{type:'text',text:clipboardLiteral(text)}],el);return;}
  pasteClipboardInline(el,text,{plain:true});
 }catch(error){toast(error.message);}
},true);
