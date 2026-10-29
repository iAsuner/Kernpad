function showDocumentMenu(index,x,y){
 closeRecordMenu();const r=selected();if(!r?.blocks[index]||!isEditing()||isProtected(r)&&!vaultUnlocked)return;
 if(!currentRichIndices().includes(index))selectLayoutBlock(index);
 const indices=[...currentRichIndices()].sort((a,b)=>a-b);documentMenuContext={id:r.id,epoch:privacyEpoch,indices};
 const items=[['properties',ui('组件属性','Block properties'),'sliders-horizontal'],['copy',ui('复制组件','Copy blocks'),'copy'],['cut',ui('剪切组件','Cut blocks'),'scissors'],['duplicate',ui('创建副本','Duplicate blocks'),'copy-plus'],['before',ui('在前面插入','Insert before'),'plus'],['after',ui('在后面插入','Insert after'),'plus'],['up',ui('上移','Move up'),'arrow-up',indices[0]===0],['down',ui('下移','Move down'),'arrow-down',indices.at(-1)===r.blocks.length-1],['delete',ui('删除组件','Delete blocks'),'trash-2']];
 const menu=document.createElement('div');menu.className='mj-record-menu mj-document-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',ui('组件操作','Block actions'));
 menu.innerHTML=items.map(([action,label,glyph,disabled])=>`<button role="menuitem" data-document-menu="${action}" class="${action==='delete'?'mj-danger':''}" ${disabled?'disabled':''}>${icon(glyph)}${escape(label)}</button>`).join('');root.append(menu);icons();
 const bounds=root.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x-bounds.left,bounds.width-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y-bounds.top,bounds.height-menu.offsetHeight-8))+'px';menu.querySelector('button')?.focus({preventScroll:true});
}
window.addEventListener('click',event=>{
 const button=event.target.closest('[data-document-menu]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
 const context=documentMenuContext,action=button.dataset.documentMenu,r=selected();closeRecordMenu();
 if(!context||context.id!==r?.id||context.epoch!==privacyEpoch||!isEditing()||isProtected(r)&&!vaultUnlocked||context.indices.some(i=>!r.blocks[i]))return;
 richSelection=null;richBlockSelection={id:r.id,indices:context.indices};activeRichIndex=context.indices[0];const handle=$('[data-layout-block="'+activeRichIndex+'"]');
 if(action==='properties'){layoutInspectorOpen=true;renderLayoutEditor();syncLayoutInspector(true);$('#mj-layout-inspector summary')?.focus({preventScroll:true});}
 if(action==='copy'||action==='cut'){window.getSelection()?.removeAllRanges();handle?.focus({preventScroll:true});if(!document.execCommand(action))toast(ui('请使用 '+(globalThis.kernpadPlatform==='windows'?'Ctrl':'⌘')+(action==='copy'?'+C 复制组件':'+X 剪切组件'),'Use '+(globalThis.kernpadPlatform==='windows'?'Ctrl':'Command')+(action==='copy'?'+C to copy blocks':'+X to cut blocks')));}
 if(action==='up'||action==='down')moveSelectedBlocks(action==='up'?-1:1);
 if(action==='before'||action==='after')showComponentMenu(action==='before'?Math.min(...context.indices)-1:Math.max(...context.indices),handle);
 if(action==='duplicate')try{
  if(r.blocks.length+context.indices.length>5000)throw new Error(ui('文档最多 5,000 个组件','Documents support up to 5,000 blocks'));
  const copies=cleanClipboardBlocks(context.indices.map(i=>r.blocks[i])),at=Math.max(...context.indices)+1;snapshotEditor();r.blocks.splice(at,0,...copies);richBlockSelection={id:r.id,indices:copies.map((_,i)=>at+i)};activeRichIndex=at;repaintBlocks();remember();
 }catch(error){toast(error.message);}
 if(action==='delete')deleteSelectedDocumentBlocks();
},true);
