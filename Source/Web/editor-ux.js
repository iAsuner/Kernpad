// Editing context survives property clicks and local rerenders. No credentials
// or document bodies are copied into this UI-only state.
let editorPropertyPointer=false,editingEmptySummary=null,recordRenameDraft=null;
function captureEditorFocus(el){
 if(!el)return null;const attrs=[...el.attributes||[]].filter(a=>a.name==='id'||a.name.startsWith('data-')).map(a=>[a.name,a.value]);
 return attrs.length?{tag:el.tagName,attrs,start:el.selectionStart,end:el.selectionEnd}:null;
}
function findEditorFocus(scope,saved){return saved?[...scope.querySelectorAll(saved.tag)].find(el=>saved.attrs.every(([key,value])=>el.getAttribute(key)===value)):null;}
function restoreEditorCaret(el,saved){if(el&&Number.isInteger(saved?.start)&&typeof el.setSelectionRange==='function')try{el.setSelectionRange(saved.start,saved.end);}catch{}}
function captureDocumentViewport(){const body=$('.mj-docbody');return body?{id:body.dataset.recordId,top:body.scrollTop,left:body.scrollLeft}:null;}
function restoreDocumentViewport(saved){
 const body=$('.mj-docbody');if(!saved||!body||saved.id!==selected()?.id||state.view!=='document')return;
 const restore=()=>{if(body.isConnected&&selected()?.id===saved.id){body.scrollTop=saved.top;body.scrollLeft=saved.left;}};restore();requestAnimationFrame(restore);
}
function richSelectionBookmark(){
 const stored=richSelection;if(!stored||!stored.el.isConnected||!stored.el.contains(stored.range.commonAncestorContainer))return null;
 const before=stored.range.cloneRange();before.selectNodeContents(stored.el);before.setEnd(stored.range.startContainer,stored.range.startOffset);
 return {index:Number(stored.el.dataset.richBlock),item:stored.el.dataset.richItem,start:before.toString().length,length:stored.range.toString().length};
}
function restoreRichBookmark(saved){
 if(!saved)return;const el=saved.item===undefined?$('[data-rich-block="'+saved.index+'"]'):$('[data-rich-block="'+saved.index+'"][data-rich-item="'+saved.item+'"]');if(!el)return;
 const locate=offset=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while(node=walker.nextNode()){last=node;if(offset<=node.length)return [node,offset];offset-=node.length;}return last?[last,last.length]:[el,0];};
 const range=document.createRange();range.setStart(...locate(saved.start));range.setEnd(...locate(saved.start+saved.length));richSelection={el,range};showRetainedSelection();
}
function showRetainedSelection(){
 $$('.mj-retained-selection').forEach(el=>el.remove());
 if(!isEditing()||!richSelection?.el.isConnected||richSelection.range.collapsed)return;
 const block=richSelection.el.closest('[data-component]');if(!block)return;const bounds=block.getBoundingClientRect();
 for(const rect of richSelection.range.getClientRects()){if(rect.width<1||rect.height<1)continue;const mark=document.createElement('span');mark.className='mj-retained-selection';mark.setAttribute('aria-hidden','true');mark.style.cssText=`left:${rect.left-bounds.left}px;top:${rect.top-bounds.top}px;width:${rect.width}px;height:${rect.height}px`;block.append(mark);}
}
root.addEventListener('pointerdown',event=>{
 if(event.target.closest('#mj-layout-inspector,.mj-formatbar,.mj-color-menu')){editorPropertyPointer=true;rememberSelection();showRetainedSelection();}
 else{$$('.mj-retained-selection').forEach(el=>el.remove());}
},true);
window.addEventListener('pointerup',()=>{setTimeout(()=>{editorPropertyPointer=false;},0);},true);
window.addEventListener('pointercancel',()=>{editorPropertyPointer=false;},true);
window.addEventListener('blur',()=>{editorPropertyPointer=false;});
function polishEditorUX(){
 const r=selected(),body=$('.mj-docbody');if(body&&r){body.dataset.recordId=r.id;const crumb=$('#mj-breadcrumb');crumb.innerHTML=`<button class="mj-document-name" data-document-rename title="${ui('重命名文档','Rename document')}" aria-label="${escape(ui('重命名：','Rename: ')+recordDisplayName(r))}"><span class="mj-user-content">${escape(recordDisplayName(r))}</span>${icon('pencil')}</button>`;}
 polishRecordSelection();if(typeof polishTemporaryNotes==='function')polishTemporaryNotes();if(typeof manualObserveDocument==='function')manualObserveDocument();if(typeof polishHistoryControls==='function')polishHistoryControls();icons();
}
async function beginRecordRename(id){
 let r=record(id);if(!r||isProtected(r)&&!vaultUnlocked)return;
 if(r._sealed){await openSealedRecord(id);r=record(id);if(!r||r._sealed||selected()?.id!==id)return;}
 else if(state.view!=='document'||selected()?.id!==id){await openRecord(id);if(state.view!=='document'||selected()?.id!==id)return;}
 const crumb=$('#mj-breadcrumb');recordRenameDraft={id,epoch:privacyEpoch};crumb.innerHTML=`<input class="mj-document-name-input" data-document-name maxlength="200" value="${escape(r.name||'')}" aria-label="${ui('文档标题','Document title')}" placeholder="${ui('输入标题','Enter a title')}">`;
 const input=$('[data-document-name]');input.focus({preventScroll:true});input.select();
}
async function commitRecordRename(input,cancel=false){
 const draft=recordRenameDraft;if(!draft)return;const r=record(draft.id);if(!r||draft.epoch!==privacyEpoch||isProtected(r)&&!vaultUnlocked){recordRenameDraft=null;return;}
 if(cancel){recordRenameDraft=null;polishEditorUX();icons();return;}
 const name=input.value.trim();if(name.length>200)return;
 if(name===r.name){recordRenameDraft=null;polishEditorUX();return;}
 const old=r.name,oldOptions=r.documentOptions,titleVisible=documentHeaderVisible(r,'title');
 snapshotEditor();r.documentOptions={...r.documentOptions,title:titleVisible};r.name=name;input.disabled=true;
 try{if(autoSaveEnabled())await persist({documentSave:true});else remember();if(draft.epoch!==privacyEpoch)return;recordRenameDraft=null;renderNav();const title=$('.mj-doc-title');if(title)title.textContent=name;polishEditorUX();applyDocumentOptions();icons();}
 catch(error){r.name=old;if(oldOptions===undefined)delete r.documentOptions;else r.documentOptions=oldOptions;input.disabled=false;input.focus({preventScroll:true});toast(String(error));}
}
root.addEventListener('click',event=>{if(event.target.closest('[data-document-rename]')){event.preventDefault();event.stopImmediatePropagation();beginRecordRename(selected().id);}},true);
root.addEventListener('keydown',event=>{if(!event.target.matches('[data-document-name]')||event.isComposing)return;if(['Enter','Escape'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();commitRecordRename(event.target,event.key==='Escape');}},true);
root.addEventListener('focusout',event=>{if(event.target.matches('[data-document-name]')&&!event.target.disabled)commitRecordRename(event.target);if(event.target.matches('.mj-docdesc')&&!event.target.textContent.trim()){editingEmptySummary=null;applyDocumentOptions();}},true);
root.addEventListener('click',event=>{
 if(!event.target.closest('[data-delete-selected-blocks]'))return;event.preventDefault();event.stopImmediatePropagation();const r=selected(),indices=currentRichIndices();if(!isEditing()||!r||isProtected(r)&&!vaultUnlocked||!indices.length)return;
 snapshotEditor();r.blocks=r.blocks.filter((_,i)=>!indices.includes(i));if(!r.blocks.length)r.blocks=[{type:'text',text:''}];richSelection=null;activeRichIndex=Math.min(Math.min(...indices),r.blocks.length-1);richBlockSelection={id:r.id,indices:[activeRichIndex]};repaintBlocks();syncLayoutInspector(true);remember();toast(ui('所选内容已删除，可撤销','Selected blocks removed. You can undo this.'));
},true);
// Bulk selection is explicit and limited to visible records; changing the list
// scope or locking clears it so hidden records cannot be deleted by accident.
let recordSelection=new Set(),recordSelectionMode=false,recordSelectionScope='',recordSelectionAnchor=null;
function canSelectRecords(){return state.view==='table'&&state.category!=='trash'&&!state.search&&!(state.area==='vault'&&!vaultUnlocked)&&$('#mj-overlay').hidden;}
function selectAllRecords(){
 if(!canSelectRecords()||document.activeElement?.closest('input:not([data-select-record]),textarea,[contenteditable]'))return false;
 recordSelection=new Set(selectableRecords().map(({id})=>id));recordSelectionMode=!!recordSelection.size;polishRecordSelection();return true;
}
window.nativeApp.selectAllRecords=selectAllRecords;
window.nativeApp.selectAll=()=>{
 const field=document.activeElement;
 if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement){try{field.select();return true;}catch{}}
 return selectAllRecords();
};
function selectableRecords(){return $$('.mj-note-card[data-open],.mj-table tbody tr[data-record-id]').map(el=>({el,id:el.dataset.open||el.dataset.recordId})).filter(({id})=>record(id));}
function polishRecordSelection(){
 if(recordMarquee&&!recordMarquee.scroll.isConnected)stopRecordMarquee(false);
 const scope=[state.area,state.category,state.search,state.platformFilter,state.page,privacyEpoch].join('|');
 if(state.view!=='table'||state.category==='trash'||scope!==recordSelectionScope){recordSelection.clear();recordSelectionMode=false;recordSelectionAnchor=null;if(typeof stopRecordMarquee==='function')stopRecordMarquee(false);}recordSelectionScope=scope;
 if(state.view!=='table'||state.category==='trash'||state.search||state.area==='vault'&&!vaultUnlocked)return;
 const items=selectableRecords(),valid=new Set(items.map(({id})=>id));recordSelection=new Set([...recordSelection].filter(id=>valid.has(id)));
 const head=$('.mj-pagehead');if(!head)return;let bar=$('.mj-selection-actions');if(!bar){bar=document.createElement('div');bar.className='mj-selection-actions';head.append(bar);}
 const examples=[...head.querySelectorAll('[data-new-temporary],[data-example-gallery],[data-credential-examples]')];
 bar.innerHTML=recordSelectionMode?`<button class="mj-button" data-record-select-all>${ui('选择本页','Select page')}</button><button class="mj-button mj-danger" data-record-delete-selected ${recordSelection.size?'':'disabled'}>${ui('删除所选','Delete selected')} (${recordSelection.size})</button><button class="mj-button" data-record-select-mode>${tr('取消')}</button>`:'';
 bar.prepend(...examples);
 for(const {el,id} of items){
  const table=el.tagName==='TR';el.classList.toggle('mj-record-picked',recordSelection.has(id));el.classList.toggle('mj-record-selectable',recordSelectionMode);
  let host=table?el.cells[0]:el.parentElement;
  if(!table&&!host.classList.contains('mj-record-frame')){host=document.createElement('div');host.className='mj-record-frame';el.before(host);host.append(el);}
  host.classList.toggle('mj-selecting-records',recordSelectionMode);
  let mark=host.querySelector('.mj-record-select-mark');if(!mark){mark=document.createElement('input');mark.type='checkbox';mark.className='mj-record-select-mark';host.append(mark);}
  mark.dataset.selectRecord=id;mark.checked=recordSelection.has(id);mark.setAttribute('aria-label',ui('选择：','Select: ')+recordDisplayName(record(id)));mark.title=ui('勾选；Shift 点击连续多选','Select; Shift-click for a range');
 }
 const grid=$('.mj-note-grid')||$('.mj-table-wrap');if(grid){grid.tabIndex=0;grid.setAttribute('aria-label',ui('记录列表；从空白处拖动框选，Command 或 Ctrl 点击多选，Shift 点击连续选择，Escape 取消','Records. Drag from empty space to select. Command or Control-click toggles; Shift-click selects a range; Escape clears selection.'));grid.title=ui('从空白处拖动框选。⌘ 或 Ctrl 点击多选，Shift 点击连续选择。','Drag from empty space to select. Command or Control-click toggles; Shift-click selects a range.');}
}
function confirmSelectedRecords(){
 const ids=[...recordSelection].filter(id=>record(id)&&(!isProtected(record(id))||vaultUnlocked));if(!ids.length)return;
 modal(ui('将所选记录移入回收站？','Move selected records to Trash?'),ui('共 '+ids.length+' 条，可从回收站恢复。',ids.length+' records. You can restore them from Trash.'),`<ul class="mj-trash-confirm-list">${ids.map(id=>'<li>'+escape(recordDisplayName(record(id)))+'</li>').join('')}</ul>`,`<button class="mj-button" data-action="close-modal" data-trash-cancel>${tr('取消')}</button><button class="mj-button mj-danger" data-record-confirm-selection>${ui('移入回收站','Move to Trash')}</button>`);
 const epoch=privacyEpoch;$('#mj-overlay [data-record-confirm-selection]').addEventListener('click',()=>{if(epoch!==privacyEpoch)return;for(const id of ids){const r=record(id);if(!r||isProtected(r)&&!vaultUnlocked)continue;r.deletedAt=new Date().toISOString();records=records.filter(item=>item.id!==id);trashedRecords.unshift(r);}recordSelection.clear();recordSelectionMode=false;closeModal();render();remember();toast(ui('所选记录已移入回收站','Selected records moved to Trash'));});queueMicrotask(()=>$('[data-trash-cancel]')?.focus({preventScroll:true}));
}
window.addEventListener('click',event=>{
 if(!canSelectRecords())return;
 if(recordMarqueeSuppressClick){recordMarqueeSuppressClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
 const mode=event.target.closest('[data-record-select-mode]'),all=event.target.closest('[data-record-select-all]'),remove=event.target.closest('[data-record-delete-selected]'),mark=event.target.closest('[data-select-record]'),item=recordSelectionMode||layoutPrimary(event)||event.shiftKey?event.target.closest('.mj-note-card[data-open],.mj-table tbody tr[data-record-id]'):null;
 if(!mode&&!all&&!remove&&!mark&&!item)return;if(!mark)event.preventDefault();event.stopImmediatePropagation();
 if(mode){recordSelection.clear();recordSelectionAnchor=null;}else if(all){recordSelection=new Set(selectableRecords().map(({id})=>id));}else if(remove){confirmSelectedRecords();return;}else{
  const id=mark?.dataset.selectRecord||item.dataset.open||item.dataset.recordId,ids=selectableRecords().map(r=>r.id);
  if(event.shiftKey&&ids.includes(recordSelectionAnchor)){const a=ids.indexOf(recordSelectionAnchor),b=ids.indexOf(id);ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(id=>recordSelection.add(id));}
  else{recordSelection.has(id)?recordSelection.delete(id):recordSelection.add(id);recordSelectionAnchor=id;}
 }
 recordSelectionMode=recordSelection.size>0;polishRecordSelection();
},true);

// Finder-style marquee starts only on list whitespace; ordinary card clicks,
// links, fields, text selection, document block dragging and scrollbars keep
// their normal behaviour. Pointer capture also handles release outside the app.
let recordMarquee=null,recordMarqueeFrame=0,recordMarqueeSuppressClick=false;
function recordScrollContainer(el){for(let p=el;p&&p!==root.parentElement;p=p.parentElement){const style=getComputedStyle(p);if(/auto|scroll/.test(style.overflowY)&&p.scrollHeight>p.clientHeight)return p;}return $('#mj-workspace');}
function stopRecordMarquee(restore=false){
 const drag=recordMarquee;if(!drag)return;recordMarquee=null;cancelAnimationFrame(recordMarqueeFrame);drag.box?.remove();root.classList.remove('mj-record-drag-selecting');
 try{root.releasePointerCapture(drag.pointer);}catch{}
 if(restore){recordSelection=new Set(drag.original);recordSelectionMode=recordSelection.size>0;polishRecordSelection();}
 if(drag.active){recordMarqueeSuppressClick=true;setTimeout(()=>{recordMarqueeSuppressClick=false;},0);}
}
function updateRecordMarquee(){
 const d=recordMarquee;if(!d?.active||!canSelectRecords())return;
 const clip=d.scroll.getBoundingClientRect(),dx=d.scroll.scrollLeft-d.scrollLeft,dy=d.scroll.scrollTop-d.scrollTop;
 const x=Math.max(clip.left,Math.min(clip.right,d.x)),y=Math.max(clip.top,Math.min(clip.bottom,d.y));
 const left=Math.max(clip.left,Math.min(d.startX-dx,x)),top=Math.max(clip.top,Math.min(d.startY-dy,y)),right=Math.min(clip.right,Math.max(d.startX-dx,x)),bottom=Math.min(clip.bottom,Math.max(d.startY-dy,y));
 d.box.style.cssText=`left:${left}px;top:${top}px;width:${Math.max(0,right-left)}px;height:${Math.max(0,bottom-top)}px`;
 // Use content coordinates for hit tests, including cards scrolled out of view.
 const a={left:Math.min(d.startX,d.x+dx),right:Math.max(d.startX,d.x+dx),top:Math.min(d.startY,d.y+dy),bottom:Math.max(d.startY,d.y+dy)};
 const hits=selectableRecords().filter(({el})=>{const b=el.getBoundingClientRect();return b.left+dx<a.right&&b.right+dx>a.left&&b.top+dy<a.bottom&&b.bottom+dy>a.top;}).map(({id})=>id);
 const next=new Set(d.additive?d.original:[]);for(const id of hits)next.add(id);
 if([...next].join('|')!==[...recordSelection].join('|')){recordSelection=next;recordSelectionMode=next.size>0;if(hits.length&&!recordSelectionAnchor)recordSelectionAnchor=hits[0];polishRecordSelection();}
}
function animateRecordMarquee(){
 const d=recordMarquee;if(!d?.active)return;
 const bounds=d.scroll.getBoundingClientRect(),edge=32;
 const speed=d.y<bounds.top+edge?-Math.min(18,(bounds.top+edge-d.y)/2):d.y>bounds.bottom-edge?Math.min(18,(d.y-bounds.bottom+edge)/2):0;
 if(speed){d.scroll.scrollTop+=speed;updateRecordMarquee();}
 recordMarqueeFrame=requestAnimationFrame(animateRecordMarquee);
}
root.addEventListener('pointerdown',event=>{
 if(!canSelectRecords()||event.button!==0||event.pointerType==='touch'||event.ctrlKey&&globalThis.kernpadPlatform!=='windows'||event.target.closest('button,a,input,textarea,select,[contenteditable],.mj-pagehead,.mj-viewtools,.mj-pagination,thead'))return;
 const page=event.target.closest('.mj-page');if(!page||!selectableRecords().length)return;
 const scroll=recordScrollContainer(page),bounds=scroll.getBoundingClientRect();if(event.clientX>=bounds.left+scroll.clientWidth||event.clientY>=bounds.top+scroll.clientHeight)return;
 recordMarquee={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,scroll,scrollTop:scroll.scrollTop,scrollLeft:scroll.scrollLeft,original:new Set(recordSelection),additive:layoutPrimary(event)||event.shiftKey,active:false};
 try{root.setPointerCapture(event.pointerId);}catch{}
},true);
window.addEventListener('pointermove',event=>{
 const d=recordMarquee;if(!d||d.pointer!==event.pointerId)return;d.x=event.clientX;d.y=event.clientY;
 if(!d.active&&Math.hypot(d.x-d.startX,d.y-d.startY)>=6){d.active=true;d.box=document.createElement('div');d.box.className='mj-record-marquee';d.box.setAttribute('aria-hidden','true');root.append(d.box);root.classList.add('mj-record-drag-selecting');window.getSelection()?.removeAllRanges();animateRecordMarquee();}
 if(d.active){event.preventDefault();updateRecordMarquee();}
},true);
window.addEventListener('pointerup',event=>{const d=recordMarquee;if(!d||d.pointer!==event.pointerId)return;if(d.active)updateRecordMarquee();else if(!d.additive){recordSelection.clear();recordSelectionMode=false;recordSelectionAnchor=null;polishRecordSelection();}stopRecordMarquee();},true);
window.addEventListener('pointercancel',()=>stopRecordMarquee(true),true);
window.addEventListener('blur',()=>stopRecordMarquee(true));
window.addEventListener('keydown',event=>{
 if(!canSelectRecords()||event.target.closest?.('input:not([data-select-record]),textarea,[contenteditable]'))return;
 const primary=globalThis.kernpadPlatform==='windows'?event.ctrlKey:event.metaKey;
 if(event.key==='Escape'&&(recordMarquee||recordSelection.size)){event.preventDefault();event.stopImmediatePropagation();if(recordMarquee)stopRecordMarquee(true);else{recordSelection.clear();recordSelectionMode=false;recordSelectionAnchor=null;polishRecordSelection();}}
 else if(primary&&event.key.toLowerCase()==='a'&&selectAllRecords()){event.preventDefault();event.stopImmediatePropagation();}
},true);

function syncDocumentName(){const r=selected();if(!r||recordRenameDraft)return;const title=$('.mj-document-name');if(title){title.querySelector('span').textContent=recordDisplayName(r);title.setAttribute('aria-label',ui('重命名：','Rename: ')+recordDisplayName(r));}}
root.addEventListener('input',event=>{if(event.target.closest('.mj-doc-title'))syncDocumentName();});
