function insertDocumentAfter(blocks,index,added,{fullRow=false}={}){
 const placements=layoutPlacements(blocks),p=placements[index];
 if(!p||fullRow){
  const at=p?Math.max(index,...placements.filter(q=>q.row<p.row+p.rowSpan).map(q=>q.index))+1:blocks.length;
  added.forEach(b=>b.layout={...blockLayout(b.layout),span:12,start:1,breakBefore:true,breakAfter:true});
  blocks.splice(at,0,...added);return at;
 }
 // Insert into this column after its current row, keeping the other columns in place.
 const row=p.row+p.rowSpan,at=Math.max(index,...placements.filter(q=>q.row<row).map(q=>q.index))+1;
 for(const q of placements)if(q.index!==index&&q.row<row&&q.row+q.rowSpan>=row&&q.rowSpan+added.length<=12){
  blocks[q.index].layout={...blockLayout(blocks[q.index].layout),rowSpan:q.rowSpan+added.length};
 }
 for(const b of added)b.layout={...blockLayout(blocks[index].layout),span:p.span,start:p.start,rowSpan:1,before:0,after:0,breakBefore:true,breakAfter:true};
 blocks.splice(at,0,...added);return at;
}
function handleDocumentKey(e,el,index,block){
 if(e.isComposing||!['Enter','Backspace','Delete'].includes(e.key))return false;
 const selection=window.getSelection();if(!selection?.rangeCount)return false;
 const range=selection.getRangeAt(0);if(!el.contains(range.startContainer)||!el.contains(range.endContainer))return false;
 const stop=()=>{e.preventDefault();e.stopImmediatePropagation();snapshotEditor();};
 if(e.key==='Enter'&&!e.metaKey&&(e.shiftKey&&!e.ctrlKey||e.ctrlKey&&!e.shiftKey&&globalThis.kernpadPlatform!=='windows')){
  stop();document.execCommand('insertLineBreak');readRich(el);remember();return true;
 }
 if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){
  stop();readRich(el);const at=insertDocumentAfter(selected().blocks,index,[{type:'text',text:''}],{fullRow:true});repaintBlocks();focusRich(at);remember();return true;
 }
 if(block.type==='list')return false;
 if((e.key==='Backspace'||e.key==='Delete')&&range.collapsed&&!el.textContent.trim()){
  stop();const blocks=selected().blocks;
  if(blocks.length>1){blocks.splice(index,1);repaintBlocks();focusRich(e.key==='Delete'?Math.min(index,blocks.length-1):Math.max(0,index-1));remember();}
  return true;
 }
 if(e.key!=='Enter'||e.shiftKey||block.type==='text'&&/^(?:```[\w.+-]*|---|\*\*\*)$/.test(block.text))return false;
 stop();
 const before=range.cloneRange(),after=range.cloneRange();before.selectNodeContents(el);before.setEnd(range.startContainer,range.startOffset);after.selectNodeContents(el);after.setStart(range.endContainer,range.endOffset);
 const head=document.createElement('div'),tail=document.createElement('div');head.append(before.cloneContents());tail.append(after.cloneContents());block.text=richSource(head);
 const next={type:'text',text:richSource(tail),...(block.textStyle?{textStyle:structuredClone(block.textStyle)}:{}),...(block.accent?{accent:true}:{})};
 const at=insertDocumentAfter(selected().blocks,index,[next]);repaintBlocks();focusRich(at);remember();return true;
}
root.addEventListener('click',event=>{
 const button=event.target.closest('[data-layout-gap]');if(!button||!isEditing())return;
 event.preventDefault();event.stopImmediatePropagation();showComponentMenu(Number(button.dataset.layoutGap),button);insertContext.column=true;
},true);
