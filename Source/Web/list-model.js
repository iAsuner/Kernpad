// List text remains compatible with v0.1; an optional parallel array records nesting.
function listLevels(block){
 let previous=0;
 return block.items.map((_,i)=>{const raw=block.levels?.[i];const n=i===0?0:Math.max(0,Math.min(6,previous+1,Number.isInteger(raw)?raw:0));previous=n;return n;});
}
function indentListItem(block,index,direction){
 const levels=listLevels(block),level=levels[index];
 if(level===undefined||direction===1&&(index===0||level>=6||level>=levels[index-1]+1)||direction===-1&&level===0)return false;
 let end=index+1;while(end<levels.length&&levels[end]>level)end++;
 if(direction===1&&levels.slice(index,end).some(n=>n>=6))return false;
 for(let i=index;i<end;i++)levels[i]+=direction;
 block.levels=levels;return true;
}
function splitListItem(block,index,before,after){
 const levels=listLevels(block);block.items.splice(index,1,before,after);levels.splice(index+1,0,levels[index]);block.levels=levels;
}
function listTree(block){
 const levels=listLevels(block),roots=[],stack=[];
 block.items.forEach((text,index)=>{const depth=levels[index],node={text,index,children:[]};if(depth===0)roots.push(node);else stack[depth-1].children.push(node);stack[depth]=node;stack.length=depth+1;});
 return roots;
}
function renderNestedList(block,index){
 const tag=block.ordered?'ol':'ul';
 const renderNodes=nodes=>`<${tag}>${nodes.map(n=>`<li><span class="mj-rich" ${isEditing()?'contenteditable="true" spellcheck="false"':''} data-rich-block="${index}" data-rich-item="${n.index}" aria-label="${escape(tr('列表项目'))} ${n.index+1}" data-placeholder="列表项目">${mdInline(n.text)}</span>${n.children.length?renderNodes(n.children):''}</li>`).join('')}</${tag}>`;
 return `<div class="mj-list-block">${renderNodes(listTree(block))}${isEditing()?blockTools(index):''}</div>${isEditing()?'<small class="mj-list-hint">Tab 缩进，Shift+Tab 退级，空行回车结束列表</small>':''}`;
}
function focusListItem(index,item,offset){
 requestAnimationFrame(()=>{const el=$(`[data-rich-block="${index}"][data-rich-item="${item}"]`);if(!el)return;el.focus();const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,remaining=offset;const range=document.createRange();range.selectNodeContents(el);range.collapse(false);while(n=walk.nextNode()){if(remaining<=n.length){range.setStart(n,remaining);range.collapse(true);break;}remaining-=n.length;}const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);el.scrollIntoView({block:'nearest'});});
}
function handleListKey(e,el,index,block){
 if(!['Tab','Enter','Backspace'].includes(e.key)||e.key==='Enter'&&e.shiftKey)return false;
 const item=Number(el.dataset.richItem),selection=window.getSelection();if(!selection?.rangeCount)return false;
 const range=selection.getRangeAt(0);if(!el.contains(range.startContainer)||!el.contains(range.endContainer))return false;
 const beforeRange=range.cloneRange();beforeRange.selectNodeContents(el);beforeRange.setEnd(range.startContainer,range.startOffset);const offset=beforeRange.toString().length;
 if(e.key==='Backspace'&&(!range.collapsed||offset!==0))return false;
 e.preventDefault();e.stopImmediatePropagation();updateActivity();snapshotEditor();readRich(el);
 if(e.key==='Backspace'&&listLevels(block)[item]===0){
  const levels=listLevels(block);
  if(item>0){
   const previous=block.items[item-1],length=richPlainText(previous).length;
   block.items[item-1]=previous+block.items[item];block.items.splice(item,1);levels.splice(item,1);block.levels=levels;
   repaintBlocks();focusListItem(index,item-1,length);
  }else{
   const first={type:'text',text:block.items[0]};
   for(const key of ['layout','textStyle','surface','accent'])if(block[key]!==undefined)first[key]=structuredClone(block[key]);
   block.items.shift();levels.shift();block.levels=levels;block.levels=listLevels(block);
   selected().blocks.splice(index,1,first,...(block.items.length?[block]:[]));repaintBlocks();focusRich(index);
  }
  remember();return true;
 }
 if(e.key==='Tab'||e.key==='Backspace'){
  if(indentListItem(block,item,e.shiftKey||e.key==='Backspace'?-1:1)){repaintBlocks();focusListItem(index,item,offset);remember();}return true;
 }
 if(!block.items[item].trim()){
  if(listLevels(block)[item]>0){indentListItem(block,item,-1);repaintBlocks();focusRich(index,item);remember();return true;}
  const levels=listLevels(block),tailItems=block.items.slice(item+1),tailLevels=levels.slice(item+1);
  block.items=block.items.slice(0,item);block.levels=levels.slice(0,item);
  const parts=[...(block.items.length?[block]:[]),{type:'text',text:''}];
  if(tailItems.length){const tail={type:'list',ordered:block.ordered,items:tailItems,levels:tailLevels};tail.levels=listLevels(tail);parts.push(tail);}
  selected().blocks.splice(index,1,...parts);repaintBlocks();focusRich(index+(block.items.length?1:0));remember();return true;
 }
 const afterRange=range.cloneRange();afterRange.selectNodeContents(el);afterRange.setStart(range.endContainer,range.endOffset);
 const before=document.createElement('div'),after=document.createElement('div');before.append(beforeRange.cloneContents());after.append(afterRange.cloneContents());
 splitListItem(block,item,richSource(before),richSource(after));repaintBlocks();focusListItem(index,item+1,0);remember();return true;
}
