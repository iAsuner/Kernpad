// Drag previews contain layout metadata only. The document changes once, on
// release, so autosave and undo never capture an intermediate arrangement.
let layoutDragFrame=0;
const layoutMotions=new Map(),layoutMotionDuration=200;
function layoutReducedMotion(){return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
function stopLayoutMotions(){for(const [node,animation] of layoutMotions){animation.cancel();node.classList.remove('mj-layout-shifting');}layoutMotions.clear();}
function layoutBlockRects(nodes){return new Map(nodes.filter(node=>node.isConnected).map(node=>[Number(node.dataset.component),node.getBoundingClientRect()]));}
function animateLayoutRects(before,nodes,{skip=[]}={}){
 if(layoutReducedMotion())return;
 for(const node of nodes){
  const index=Number(node.dataset.component),old=before.get(index);if(!old||skip.includes(index)||!node.isConnected)continue;
  const now=node.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;if(Math.abs(dx)<.5&&Math.abs(dy)<.5)continue;
  layoutMotions.get(node)?.cancel();const animation=node.animate([{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:layoutMotionDuration,easing:'cubic-bezier(.2,.8,.2,1)'});
  node.classList.add('mj-layout-shifting');layoutMotions.set(node,animation);
  const finish=()=>{if(layoutMotions.get(node)===animation){layoutMotions.delete(node);node.classList.remove('mj-layout-shifting');}};animation.onfinish=finish;animation.oncancel=finish;
 }
}
function layoutDragValid(d=layoutDrag){return !!d&&d.epoch===privacyEpoch&&state.view==='document'&&isEditing()&&selected()===d.record&&(!isProtected(d.record)||vaultUnlocked)&&d.box.isConnected&&d.nodes.every((node,i)=>node.isConnected&&d.record.blocks[i]===d.blocks[i])&&d.record.blocks.length===d.blocks.length;}
function layoutScrollOffset(node){let x=0,y=0;for(let parent=node.parentElement;parent;parent=parent.parentElement){x+=parent.scrollLeft;y+=parent.scrollTop;}return {x,y};}
function captureLayoutDragRects(d){d.rects=layoutBlockRects(d.nodes);d.scroll=layoutScrollOffset(d.box);}
function logicalLayoutDragRects(d){const scroll=layoutScrollOffset(d.box),dx=d.scroll.x-scroll.x,dy=d.scroll.y-scroll.y;return d.preview.map(item=>{const r=d.rects.get(item.source);return {left:r.left+dx,right:r.right+dx,top:r.top+dy,bottom:r.bottom+dy,width:r.width,height:r.height};});}
function cloneLayoutPreview(items){return items.map(item=>({source:item.source,...(item.layout?{layout:{...item.layout}}:{})}));}
function layoutPreviewKey(items){return JSON.stringify(items);}
function applyLayoutDragPreview(d,next){
 if(layoutPreviewKey(next)===layoutPreviewKey(d.preview))return;
 const before=layoutBlockRects(d.nodes);stopLayoutMotions();
 for(const p of layoutPlacements(next)){const node=d.nodes[next[p.index].source];node.style.gridColumn=p.start+' / span '+p.span;node.style.gridRow=(p.row+1)+' / span '+p.rowSpan;}
 d.preview=next;captureLayoutDragRects(d);animateLayoutRects(before,d.nodes,{skip:d.indices});
}
function makeLayoutDragGhost(d,index,rect){
 const clone=d.nodes[index].cloneNode(true);clone.classList.remove('mj-layout-selected','mj-layout-shifting');clone.classList.add('mj-layout-drag-ghost');clone.inert=true;clone.setAttribute('aria-hidden','true');
 clone.querySelectorAll('.mj-block-handle,.mj-block-tools,.mj-layout-gap,.mj-line-plus,.mj-media-tools,.mj-table-controls,.mj-retained-selection').forEach(el=>el.remove());
 for(const video of clone.querySelectorAll('video')){const poster=video.getAttribute('poster'),image=document.createElement('img');if(poster)image.src=poster;image.alt='';image.style.cssText=video.style.cssText;video.replaceWith(image);}
 for(const el of [clone,...clone.querySelectorAll('*')])for(const attr of [...el.attributes])if(attr.name==='id'||attr.name.startsWith('data-')||['contenteditable','draggable','autofocus','for'].includes(attr.name))el.removeAttribute(attr.name);
 clone.style.width=rect.width+'px';clone.style.height=Math.min(rect.height,Math.max(80,d.body.clientHeight*.6))+'px';clone.style.margin='0';
 if(d.indices.length>1){const count=document.createElement('span');count.className='mj-layout-drag-count';count.textContent=ui(d.indices.length+' 个组件',d.indices.length+' blocks');clone.append(count);}
 d.box.append(clone);return clone;
}
function positionLayoutDragGhost(d){
 const box=d.box.getBoundingClientRect(),body=d.body.getBoundingClientRect(),ghost=d.ghost,w=ghost.offsetWidth,h=ghost.offsetHeight;
 // Keep the lifted preview inside the scrollport; an absolute preview must not
 // extend the document's scroll range and trigger endless edge scrolling.
 const left=Math.max(box.left,Math.min(d.x-d.offsetX,Math.min(body.right,box.right)-w)),top=Math.max(box.top,Math.min(d.y-d.offsetY,Math.min(body.bottom,box.bottom)-h));
 ghost.style.transform=`translate3d(${left-box.left}px,${top-box.top}px,0)`;
}
function clearLayoutDrop(){layoutDrop=null;$('#mj-layout-drop-preview')?.remove();}
function updateLayoutDrop(x,y){
 const d=layoutDrag;if(!d)return;if(!layoutDragValid(d)){cancelLayoutDrag({animate:false});return;}
 d.x=x;d.y=y;positionLayoutDragGhost(d);const scroll=layoutScrollOffset(d.box),point=[x,y,scroll.x,scroll.y].join(':');if(point===d.hitPoint)return;d.hitPoint=point;
 const grid=d.box.getBoundingClientRect(),body=d.body.getBoundingClientRect();
 if(x<Math.max(grid.left-28,body.left)||x>Math.min(grid.right,body.right)||y<Math.max(grid.top-25,body.top)||y>Math.min(grid.bottom+25,body.bottom)){
  clearLayoutDrop();applyLayoutDragPreview(d,cloneLayoutPreview(d.initial));return;
 }
 const indices=d.preview.flatMap((item,i)=>d.indices.includes(item.source)?[i]:[]),intent=documentDropIntent(d.preview,indices,logicalLayoutDragRects(d),grid,x,y);if(!intent)return;
 const next=cloneLayoutPreview(d.preview);if(!dropDocumentBlocks(next,indices,intent).length)return;
 layoutDrop=intent;applyLayoutDragPreview(d,next);
}
function animateLayoutDrag(){
 const d=layoutDrag;if(!d)return;if(!layoutDragValid(d)){cancelLayoutDrag({animate:false});return;}
 const rect=d.body.getBoundingClientRect();if(d.y<rect.top+32)d.body.scrollTop-=12;else if(d.y>rect.bottom-32)d.body.scrollTop+=12;
 updateLayoutDrop(d.x,d.y);if(layoutDrag)layoutDragFrame=requestAnimationFrame(animateLayoutDrag);
}
function beginLayoutDrag(x,y){
 const box=$('#mj-blocks'),body=$('.mj-docbody'),r=selected(),nodes=$$('#mj-blocks>[data-component]'),indices=[...currentRichIndices()].sort((a,b)=>a-b);if(!box||!body||!r||!indices.length)return false;
 const before=layoutBlockRects(nodes);stopLayoutMotions();const initial=r.blocks.map((b,source)=>({source,...(b.layout?{layout:{...b.layout}}:{})}));
 const index=layoutPointer.index,rect=before.get(index);if(!rect)return false;
 const d=layoutDrag={id:r.id,record:r,blocks:[...r.blocks],epoch:privacyEpoch,box,body,nodes,indices,initial,preview:cloneLayoutPreview(initial),x,y,offsetX:layoutPointer.x-rect.left,offsetY:layoutPointer.y-rect.top,minHeight:box.style.minHeight};
 box.style.minHeight=box.getBoundingClientRect().height+'px';d.ghost=makeLayoutDragGhost(d,index,rect);root.classList.add('mj-layout-moving');indices.forEach(i=>nodes[i].classList.add('mj-layout-dragging'));captureLayoutDragRects(d);animateLayoutRects(before,nodes,{skip:indices});return true;
}
function cancelLayoutDrag({animate=true,restore=true}={}){
 const d=layoutDrag,pointer=layoutPointer,same=layoutDragValid(d);layoutPointer=null;layoutDrag=null;cancelAnimationFrame(layoutDragFrame);clearLayoutDrop();root.classList.remove('mj-layout-moving');
 if(d){
  const before=animate&&same?layoutBlockRects(d.nodes):null;if(before&&d.ghost?.isConnected)before.set(pointer.index,d.ghost.getBoundingClientRect());stopLayoutMotions();d.ghost?.remove();
  if(restore&&d.box.isConnected)for(const p of layoutPlacements(d.initial)){d.nodes[p.index].style.gridColumn=p.start+' / span '+p.span;d.nodes[p.index].style.gridRow=(p.row+1)+' / span '+p.rowSpan;}
  d.nodes.forEach(node=>node.classList.remove('mj-layout-dragging'));d.box.style.minHeight=d.minHeight;if(before&&restore)animateLayoutRects(before,d.nodes);
 }
 if(pointer&&root.hasPointerCapture?.(pointer.id))root.releasePointerCapture(pointer.id);
}
function commitLayoutDrop(){
 const d=layoutDrag;if(!layoutDragValid(d)||!layoutDrop||layoutPreviewKey(d.preview)===layoutPreviewKey(d.initial))return false;
 const before=layoutBlockRects(d.nodes),ghost=d.ghost.getBoundingClientRect(),anchor=layoutPointer.index,next=cloneLayoutPreview(d.preview);before.set(anchor,ghost);
 snapshotEditor();cancelLayoutDrag({animate:false,restore:false});
 d.record.blocks=next.map(item=>{const block=d.blocks[item.source];if(item.layout)block.layout={...item.layout};return block;});
 const moved=next.flatMap((item,i)=>d.indices.includes(item.source)?[i]:[]);richSelection=null;richBlockSelection={id:d.id,indices:moved};activeRichIndex=moved[0];
 repaintBlocks();const mapped=new Map(next.map((item,i)=>[i,before.get(item.source)]));animateLayoutRects(mapped,$$('#mj-blocks>[data-component]'));syncLayoutSelection();syncLayoutInspector(true);remember();return true;
}
root.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('[data-layout-block],[data-layout-media-index]');if(!handle||!isEditing()||e.button!==0||isProtected(selected())&&!vaultUnlocked)return;
 cancelLayoutDrag({animate:false});closeRecordMenu();e.preventDefault();const index=Number(handle.dataset.layoutBlock??handle.dataset.layoutMediaIndex);layoutPointer={id:e.pointerId,index,x:e.clientX,y:e.clientY};
 if(e.shiftKey||layoutPrimary(e)||!currentRichIndices().includes(index))selectLayoutBlock(index,layoutPrimary(e),e.shiftKey);window.getSelection()?.removeAllRanges();$('[data-layout-block="'+index+'"]')?.focus({preventScroll:true});if(e.isTrusted)root.setPointerCapture?.(e.pointerId);
},true);
root.addEventListener('pointermove',e=>{
 if(!layoutPointer||layoutPointer.id!==e.pointerId)return;if(!layoutDrag&&Math.hypot(e.clientX-layoutPointer.x,e.clientY-layoutPointer.y)<5)return;e.preventDefault();
 if(!layoutDrag){if(!beginLayoutDrag(e.clientX,e.clientY))return;animateLayoutDrag();}else updateLayoutDrop(e.clientX,e.clientY);
},true);
root.addEventListener('pointerup',e=>{
 if(!layoutPointer||layoutPointer.id!==e.pointerId)return;e.preventDefault();if(layoutDrag){updateLayoutDrop(e.clientX,e.clientY);commitLayoutDrop();}
 layoutIgnoreClick=true;setTimeout(()=>{layoutIgnoreClick=false;},0);cancelLayoutDrag();
},true);
root.addEventListener('pointercancel',cancelLayoutDrag,true);root.addEventListener('lostpointercapture',()=>{if(layoutPointer)cancelLayoutDrag();});
window.addEventListener('blur',cancelLayoutDrag);window.addEventListener('resize',()=>cancelLayoutDrag({animate:false}));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&layoutPointer){e.preventDefault();e.stopImmediatePropagation();cancelLayoutDrag();}},true);
