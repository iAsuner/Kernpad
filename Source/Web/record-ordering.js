let recordOrderSaving=false,recordOrderPointer=null,recordOrderFrame=0,recordOrderSuppressClick=false,recordOrderPreviewTimer=0;
const recordOrderMotions=new Map(),recordOrderMotionDuration=200;
function recordOrderReducedMotion(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
function recordOrderItems(){return selectableRecords().map(item=>({...item,node:item.el.tagName==='TR'?item.el:item.el.parentElement}));}
function recordOrderRects(items=recordOrderItems()){return new Map(items.filter(item=>item.node.isConnected).map(item=>[item.id,item.node.getBoundingClientRect()]));}
function stopRecordOrderMotions(){for(const [node,entry] of recordOrderMotions){entry.animation.cancel();node.classList.remove('mj-record-order-moving');}recordOrderMotions.clear();}
function animateRecordOrderRects(before,{skip=null,items=recordOrderItems()}={}){
 if(recordOrderReducedMotion())return;
 for(const {id,node} of items){
  const old=before.get(id);if(!old||id===skip||!node.isConnected)continue;
  const now=node.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
  if(Math.abs(dx)<.5&&Math.abs(dy)<.5)continue;
  const entry=recordOrderMotions.get(node);if(entry)entry.animation.cancel();
  const animation=node.animate([{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:recordOrderMotionDuration,easing:'cubic-bezier(.2,.8,.2,1)'});
  node.classList.add('mj-record-order-moving');recordOrderMotions.set(node,{animation,epoch:privacyEpoch});
  const finish=()=>{if(recordOrderMotions.get(node)?.animation===animation){recordOrderMotions.delete(node);node.classList.remove('mj-record-order-moving');}};
  animation.onfinish=finish;animation.oncancel=finish;
 }
}
function recordOrderScrollOffset(node){let left=0,top=0;for(let parent=node.parentElement;parent;parent=parent.parentElement){left+=parent.scrollLeft;top+=parent.scrollTop;}return {left,top};}
function captureRecordOrderLayout(d){d.rects=recordOrderRects(d.items);d.scroll=recordOrderScrollOffset(d.parent);}
function recordOrderLogicalRect(d,id){const rect=d.rects.get(id),scroll=recordOrderScrollOffset(d.parent);if(!rect)return null;const dx=d.scroll.left-scroll.left,dy=d.scroll.top-scroll.top;return {left:rect.left+dx,right:rect.right+dx,top:rect.top+dy,bottom:rect.bottom+dy,width:rect.width,height:rect.height};}
function previewRecordOrder(d,targetID,after){
 const next=targetID?moveRecordRelative(d.preview,d.id,targetID,after):d.items;
 if(next.every((item,i)=>item===d.preview[i]))return;
 const before=recordOrderRects(d.items);stopRecordOrderMotions();
 if(targetID){const source=d.items.find(item=>item.id===d.id).node,target=d.items.find(item=>item.id===targetID).node;d.parent.insertBefore(source,after?target.nextSibling:target);}
 else d.parent.append(...d.items.map(item=>item.node));
 d.preview=[...next];captureRecordOrderLayout(d);animateRecordOrderRects(before,{skip:d.id,items:d.items});
}
function makeRecordOrderGhost(item,rect){
 const ghost=document.createElement('div'),clone=item.el.cloneNode(true);ghost.className='mj-record-drag-label '+(item.el.tagName==='TR'?'mj-record-drag-row':'mj-record-drag-card');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
 clone.classList.remove('mj-record-order-source','mj-record-order-moving');clone.querySelectorAll('.mj-record-order-tools,.mj-card-delete,.mj-row-delete,.mj-record-select-mark').forEach(el=>el.remove());
 // Only clone already-visible list content, with no live controls or duplicate
 // data selectors. Account bodies are never opened to build a drag preview.
 for(const el of [clone,...clone.querySelectorAll('*')])for(const attr of [...el.attributes])if(attr.name==='id'||attr.name.startsWith('data-')||attr.name==='draggable')el.removeAttribute(attr.name);
 if(item.el.tagName==='TR'){
  const table=document.createElement('table'),body=document.createElement('tbody');table.className=item.el.closest('table').className;
  [...clone.children].forEach((cell,i)=>{const width=item.el.children[i].getBoundingClientRect().width;cell.style.width=width+'px';cell.style.minWidth=width+'px';cell.style.maxWidth=width+'px';});
  body.append(clone);table.append(body);ghost.append(table);
 }else ghost.append(clone);
 ghost.style.width=rect.width+'px';root.append(ghost);return ghost;
}
function recordOrderScope(){return JSON.stringify([privacyEpoch,state.area,state.view,state.category,state.search,state.platformFilter,state.page]);}
function canReorderRecords(){return state.view==='table'&&state.category!=='trash'&&!state.search&&!recordSelectionMode&&!recordOrderSaving&&$('#mj-overlay').hidden&&(state.area==='notes'||vaultUnlocked);}
function recordOrderGroup(r){return [isProtected(r),r.pinned===true].join(':');}
function captureRecordOrderFocus(){const el=document.activeElement?.closest('[data-record-pin],[data-record-drag]');return el?{id:el.dataset.recordPin||el.dataset.recordDrag,kind:el.dataset.recordPin?'pin':'drag'}:null;}
function restoreRecordOrderFocus(saved){if(saved)$('[data-record-'+saved.kind+'="'+saved.id+'"]')?.focus({preventScroll:true});}
async function commitRecordOrder(change,{dropFrom=null,dropID=null}={}){
 if(recordOrderSaving||!$('#mj-overlay').hidden)return false;
 const epoch=privacyEpoch,profile=nativeInfo.profile,focus=captureRecordOrderFocus();let previous=null;recordOrderSaving=true;polishRecordOrdering();
 try{
  // Navigation commits and seals a departing detail first. Capture the latest
  // summaries only after that save has released its editing lease.
  if(redactionPending)await redactionPending;
  if(epoch!==privacyEpoch||profile!==nativeInfo.profile)return false;
  previous={ids:records.map(r=>r.id),pins:new Map(records.map(r=>[r.id,r.pinned]))};
  const before=recordOrderRects();if(dropFrom&&dropID)before.set(dropID,dropFrom);
  if(!change())return false;stopRecordOrderMotions();render();animateRecordOrderRects(before);await persist();return epoch===privacyEpoch&&profile===nativeInfo.profile;
 }
 catch(error){
  if(previous&&epoch===privacyEpoch&&profile===nativeInfo.profile){records=restoreRecordOrder(records,previous.ids);for(const r of records)if(previous.pins.has(r.id)){const value=previous.pins.get(r.id);if(value===undefined)delete r.pinned;else r.pinned=value;}render();toast(ui('排序保存失败，已恢复原顺序，请重试。','Could not save order. The previous order was restored. Try again.'));}
  return false;
 }finally{recordOrderSaving=false;polishRecordOrdering();if(epoch===privacyEpoch&&profile===nativeInfo.profile)restoreRecordOrderFocus(focus);refreshListPreviews();}
}
function toggleRecordPin(id){
 const r=record(id);if(!r||isProtected(r)&&!vaultUnlocked)return Promise.resolve(false);
 return commitRecordOrder(()=>{const current=record(id);if(!current||isProtected(current)&&!vaultUnlocked)return false;current.pinned=!current.pinned;records=[current,...records.filter(item=>item!==current)];return true;});
}
function moveRecordTo(id,targetID,after=false,motion={}){
 const source=record(id),target=record(targetID);
 if(!source||!target||source===target||recordOrderGroup(source)!==recordOrderGroup(target)||isProtected(source)&&!vaultUnlocked)return Promise.resolve(false);
 return commitRecordOrder(()=>{const next=moveRecordRelative(records,id,targetID,after);if(next.every((r,i)=>r===records[i]))return false;records=next;return true;},motion);
}
function moveRecordByStep(id,direction){
 const r=record(id);if(!r||recordOrderSaving)return Promise.resolve(false);
 const list=(state.view==='table'&&!state.search?filtered():orderedRecords(records)).filter(item=>recordOrderGroup(item)===recordOrderGroup(r)),index=list.indexOf(r),target=list[index+direction];
 return target?moveRecordTo(id,target.id,direction>0):Promise.resolve(false);
}
function polishRecordOrdering(){
 for(const [node,entry] of recordOrderMotions)if(!node.isConnected||entry.epoch!==privacyEpoch){entry.animation.cancel();recordOrderMotions.delete(node);}
 if(recordOrderPointer&&(recordOrderPointer.scope!==recordOrderScope()||!record(recordOrderPointer.id)||recordOrderPointer.active&&!recordOrderPointer.parent?.isConnected))cancelRecordOrderDrag({animate:false});
 if(state.view!=='table'||state.category==='trash'||state.search)return;
 const available=state.area==='notes'||vaultUnlocked;
 for(const {el,id} of selectableRecords()){
  const r=record(id),table=el.tagName==='TR',host=table?el.querySelector('.mj-row-actions'):el.parentElement;if(!r||!host)continue;
  let tools=host.querySelector('.mj-record-order-tools');if(!tools){tools=document.createElement('div');tools.className='mj-record-order-tools';host.prepend(tools);}
  const pinLabel=ui(r.pinned?'取消置顶':'置顶',r.pinned?'Unpin':'Pin to top'),dragLabel=ui('拖动排序；方向键上移或下移','Drag to reorder; use arrow keys to move');
  tools.innerHTML=`<button class="mj-icon" data-record-pin="${escape(id)}" aria-label="${escape(pinLabel+' '+recordDisplayName(r))}" title="${pinLabel}" aria-pressed="${r.pinned===true}" ${!available||recordOrderSaving?'disabled':''}>${icon('pin')}</button><button class="mj-icon" data-record-drag="${escape(id)}" aria-label="${escape(dragLabel+' '+recordDisplayName(r))}" title="${dragLabel}" ${!available||recordSelectionMode||recordOrderSaving?'disabled':''}>${icon('grip-vertical')}</button>`;
  el.classList.toggle('mj-record-pinned',r.pinned===true);
 }
 let help=$('[data-record-order-help]');if(!help&&available&&selectableRecords().length){help=document.createElement('p');help.dataset.recordOrderHelp='';help.className='mj-record-order-help';help.textContent=ui('置顶项在前，拖动手柄调整组内顺序','Pinned first. Drag handles to reorder within each group.');const toolbar=$('.mj-viewtools');if(toolbar)toolbar.prepend(help);else $('.mj-pagehead')?.after(help);}
 icons();
}
function cancelRecordOrderDrag({restore=true,animate=true}={}){
 const drag=recordOrderPointer,sameScope=drag?.scope===recordOrderScope();recordOrderPointer=null;cancelAnimationFrame(recordOrderFrame);root.classList.remove('mj-record-reordering');$('.mj-record-drag-label')?.remove();
 if(drag?.active&&drag.parent?.isConnected){const before=restore?recordOrderRects(drag.items):null;if(restore){stopRecordOrderMotions();drag.parent.append(...drag.items.map(item=>item.node));}drag.items.forEach(item=>item.node.classList.remove('mj-record-order-source'));if(restore&&animate&&sameScope)animateRecordOrderRects(before);}
 if(drag){try{root.releasePointerCapture(drag.pointer);}catch{}if(drag.active){recordOrderSuppressClick=true;setTimeout(()=>{recordOrderSuppressClick=false;},0);}}
 clearTimeout(recordOrderPreviewTimer);const epoch=privacyEpoch;recordOrderPreviewTimer=setTimeout(()=>{if(epoch===privacyEpoch&&!recordOrderPointer&&typeof flushDeferredRecordPreviews==='function')flushDeferredRecordPreviews();},recordOrderMotionDuration);
}
function updateRecordOrderDrag(){
 const d=recordOrderPointer;if(!d?.active)return;
 if(d.scope!==recordOrderScope()||!canReorderRecords()||!record(d.id)||!d.parent.isConnected){cancelRecordOrderDrag({animate:false});return;}
 const ghost=$('.mj-record-drag-label');if(ghost)ghost.style.transform=`translate3d(${d.x-d.offsetX}px,${d.y-d.offsetY}px,0)`;
 const scroll=recordOrderScrollOffset(d.parent),point=[d.x,d.y,scroll.left,scroll.top].join(':');if(point===d.hitPoint)return;d.hitPoint=point;
 const bounds=d.parent.getBoundingClientRect(),clip=$('#mj-workspace').getBoundingClientRect();
 if(d.x<Math.max(bounds.left-12,clip.left)||d.x>Math.min(bounds.right+12,clip.right)||d.y<Math.max(bounds.top-16,clip.top)||d.y>Math.min(bounds.bottom+16,clip.bottom)){d.target=null;previewRecordOrder(d);return;}
 let target=null,distance=Infinity;
 for(const item of d.preview){const rect=recordOrderLogicalRect(d,item.id);if(!rect)continue;const dx=Math.max(rect.left-d.x,0,d.x-rect.right),dy=Math.max(rect.top-d.y,0,d.y-rect.bottom),n=dx*dx+dy*dy;if(n<distance){target={item,rect};distance=n;}}
 if(!target)return;if(target.item.id===d.id)return;
 if(recordOrderGroup(record(target.item.id))!==recordOrderGroup(record(d.id))){d.target=null;previewRecordOrder(d);return;}
 const after=d.table?d.y>target.rect.top+target.rect.height/2:d.x>target.rect.left+target.rect.width/2;
 d.target={id:target.item.id,after};previewRecordOrder(d,d.target.id,after);
}
function animateRecordOrderDrag(){
 const d=recordOrderPointer;if(!d?.active)return;
 const scroll=$('#mj-workspace'),box=scroll.getBoundingClientRect(),edge=36;
 if(d.y<box.top+edge)scroll.scrollTop-=12;else if(d.y>box.bottom-edge)scroll.scrollTop+=12;
 updateRecordOrderDrag();if(recordOrderPointer)recordOrderFrame=requestAnimationFrame(animateRecordOrderDrag);
}
window.addEventListener('pointerdown',event=>{
 const handle=event.target.closest('[data-record-drag]');if(!handle||event.button!==0||!canReorderRecords())return;
 event.preventDefault();event.stopImmediatePropagation();closeRecordMenu();
 clearTimeout(recordOrderPreviewTimer);
 recordOrderPointer={id:handle.dataset.recordDrag,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,scope:recordOrderScope(),active:false,target:null};
 handle.focus({preventScroll:true});if(event.isTrusted)try{root.setPointerCapture(event.pointerId);}catch{}
},true);
window.addEventListener('pointermove',event=>{
 const d=recordOrderPointer;if(!d||d.pointer!==event.pointerId)return;
 event.preventDefault();event.stopImmediatePropagation();d.x=event.clientX;d.y=event.clientY;
 if(!d.active&&Math.hypot(d.x-d.startX,d.y-d.startY)>=6){
  d.items=recordOrderItems();const before=recordOrderRects(d.items);stopRecordOrderMotions();d.preview=[...d.items];const source=d.items.find(item=>item.id===d.id);if(!source){cancelRecordOrderDrag();return;}
  const rect=before.get(d.id);d.parent=source.node.parentElement;d.table=source.el.tagName==='TR';d.offsetX=d.startX-rect.left;d.offsetY=d.startY-rect.top;d.active=true;d.rects=before;d.scroll=recordOrderScrollOffset(d.parent);
  root.classList.add('mj-record-reordering');makeRecordOrderGhost(source,rect);source.node.classList.add('mj-record-order-source');animateRecordOrderRects(before,{skip:d.id,items:d.items});window.getSelection()?.removeAllRanges();animateRecordOrderDrag();
 }
 if(d.active)updateRecordOrderDrag();
},true);
window.addEventListener('pointerup',event=>{
 const d=recordOrderPointer;if(!d||d.pointer!==event.pointerId)return;
 event.preventDefault();event.stopImmediatePropagation();d.x=event.clientX;d.y=event.clientY;if(d.active)updateRecordOrderDrag();
 const target=d.target,valid=d.scope===recordOrderScope()&&d.preview?.some((item,i)=>item!==d.items[i]),dropFrom=$('.mj-record-drag-label')?.getBoundingClientRect();
 cancelRecordOrderDrag({restore:!valid||!target,animate:!valid||!target});if(valid&&target)moveRecordTo(d.id,target.id,target.after,{dropFrom,dropID:d.id});
},true);
window.addEventListener('pointercancel',cancelRecordOrderDrag,true);window.addEventListener('blur',cancelRecordOrderDrag);
window.addEventListener('resize',()=>cancelRecordOrderDrag({animate:false}));
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&recordOrderPointer){event.preventDefault();event.stopImmediatePropagation();cancelRecordOrderDrag();return;}
 const handle=event.target.closest?.('[data-record-drag]');if(!handle||!canReorderRecords()||!['ArrowUp','ArrowDown'].includes(event.key))return;
 event.preventDefault();event.stopImmediatePropagation();const id=handle.dataset.recordDrag;moveRecordByStep(id,event.key==='ArrowUp'?-1:1).then(changed=>{if(changed)$('[data-record-drag="'+id+'"]')?.focus({preventScroll:true});});
},true);
window.addEventListener('click',event=>{
 if(recordOrderSuppressClick){event.preventDefault();event.stopImmediatePropagation();recordOrderSuppressClick=false;return;}
 const button=event.target.closest('[data-record-pin],[data-record-drag]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();if(button.dataset.recordPin)toggleRecordPin(button.dataset.recordPin);
},true);
