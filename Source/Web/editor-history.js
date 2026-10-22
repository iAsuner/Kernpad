// One document-scoped history for text, fields, media and layout. Clear it on
// record/session changes so leaving a protected detail never retains its body.
let documentHistory={key:'',undo:[],redo:[],typing:null},applyingHistory=false;
function clearEditorHistory(){documentHistory={key:'',undo:[],redo:[],typing:null};editorUndo=null;}
function syncEditorHistory(){
 const key=state.view==='document'&&selected()?privacyEpoch+':'+selected().id:'';
 if(key!==documentHistory.key){clearEditorHistory();documentHistory.key=key;}
}
function captureHistoryEntry(){
 const r=selected();if(!r)return null;rememberSelection();
 // The destruction deadline is committed separately from document edits.
 const value=cloneDocumentValue(r);delete value.expiresAt;return {id:r.id,record:value,blocks:value.blocks,fields:value.fields,bookmark:richSelectionBookmark(),focus:captureEditorFocus(document.activeElement),viewport:captureDocumentViewport()};
}
function boundEditorHistory(stack){
 while(stack.length>50)stack.shift();
 while(stack.length>2&&documentValueBytes(stack.map(item=>item.record))>32*1024*1024)stack.shift();
}
function snapshotEditor(){
 if(applyingHistory||!selected())return;syncEditorHistory();const entry=captureHistoryEntry();
 if(!equalDocumentValues(documentHistory.undo.at(-1)?.record,entry.record)){documentHistory.undo.push(entry);boundEditorHistory(documentHistory.undo);}
 documentHistory.redo=[];documentHistory.typing=null;editorUndo=documentHistory.undo.at(-1)||null;
}
function runDocumentHistory(action){
 if(!isEditing()||state.view!=='document'||!selected()||!$('#mj-overlay').hidden||document.activeElement?.matches('#mj-search'))return false;
 if(isProtected(selected())&&!vaultUnlocked)return false;
 syncEditorHistory();const from=action==='redo'?documentHistory.redo:documentHistory.undo,to=action==='redo'?documentHistory.undo:documentHistory.redo,current=captureHistoryEntry();
 while(equalDocumentValues(from.at(-1)?.record,current.record))from.pop();
 const entry=from.pop();if(!entry)return false;
 to.push(current);boundEditorHistory(to);applyingHistory=true;
 try{
  const r=selected(),protectedBefore=isProtected(r),expiration=r.expiresAt;for(const key of Object.keys(r))delete r[key];Object.assign(r,cloneDocumentValue(entry.record));if(protectedBefore)r.protected=true;if(expiration&&!isProtected(r))r.expiresAt=expiration;syncRecordMetadata(r);
  state.area=isProtected(r)?'vault':'notes';richSelection=null;render();restoreDocumentViewport(entry.viewport);restoreRichBookmark(entry.bookmark);
  const field=findEditorFocus(root,entry.focus);if(field?.closest('.mj-paper')){field.focus({preventScroll:true});restoreEditorCaret(field,entry.focus);}
  if(richSelection?.el.isConnected){richSelection.el.focus({preventScroll:true});const selection=window.getSelection();selection.removeAllRanges();selection.addRange(richSelection.range);}
  documentHistory.typing=null;editorUndo=documentHistory.undo.at(-1)||null;remember();return true;
 }finally{applyingHistory=false;}
}
function undoEditor(){if(!runDocumentHistory('undo'))toast(ui('暂无可撤销的操作','Nothing to undo'));}
function redoEditor(){if(!runDocumentHistory('redo'))toast(ui('暂无可重做的操作','Nothing to redo'));}
function indentCodeSelection(input,outdent=false){
 snapshotEditor();const start=input.selectionStart,end=input.selectionEnd,top=input.scrollTop,lineStart=input.value.lastIndexOf('\n',start-1)+1;
 if(!outdent&&start===end)input.setRangeText('  ',start,end,'end');
 else{
  const finish=end>start&&input.value[end-1]==='\n'?end-1:end,part=input.value.slice(lineStart,finish);
  const changed=outdent?part.replace(/^( {1,2}|\t)/gm,''):part.replace(/^/gm,'  ');
  input.setRangeText(changed,lineStart,finish,'select');
  if(start===end)input.setSelectionRange(Math.max(lineStart,start+changed.length-part.length),Math.max(lineStart,start+changed.length-part.length));
 }
 input.scrollTop=top;selected().blocks[Number(input.dataset.codeText)].text=input.value;remember();
}
window.addEventListener('beforeinput',event=>{
 if(!isEditing()||!event.target.closest?.('.mj-paper')||applyingHistory)return;
 if(['historyUndo','historyRedo'].includes(event.inputType)){event.preventDefault();event.stopImmediatePropagation();runDocumentHistory(event.inputType==='historyUndo'?'undo':'redo');return;}
 const prior=documentHistory.typing,now=Date.now(),group=event.inputType?.startsWith('insertText')?'typing':event.inputType?.startsWith('deleteContent')?'deleting':null;
 if(!group||prior?.target!==event.target||prior?.group!==group||now-prior.time>800)snapshotEditor();
 documentHistory.typing={target:event.target,group,time:now};
},true);
window.addEventListener('keydown',event=>{
 const primary=globalThis.kernpadPlatform==='windows'?event.ctrlKey&&!event.metaKey:event.metaKey&&!event.ctrlKey,key=event.key.toLowerCase();
 if(!primary||event.altKey||event.isComposing||!isEditing()||!$('#mj-overlay').hidden||event.target.closest?.('.mj-search')||event.target.matches?.('input,textarea')&&!event.target.closest('.mj-paper'))return;
 const action=key==='z'?(event.shiftKey?'redo':'undo'):globalThis.kernpadPlatform==='windows'&&key==='y'?'redo':null;
 if(!action)return;event.preventDefault();event.stopImmediatePropagation();action==='undo'?undoEditor():redoEditor();
},true);
root.addEventListener('click',event=>{if(!event.target.closest('[data-editor-redo]'))return;event.preventDefault();event.stopImmediatePropagation();redoEditor();},true);
function polishHistoryControls(){
 syncEditorHistory();if(!isEditing()||state.view!=='document')return;
 const undo=$('[data-v4="undo"]');if(undo){undo.title=ui('撤销','Undo')+' ('+shortcutLabel('primary+z')+')';if(!$('[data-editor-redo]'))undo.insertAdjacentHTML('afterend',`<button data-editor-redo title="${ui('重做','Redo')} (${shortcutLabel('primary+shift+z')})">${icon('redo-2')}${ui('重做','Redo')}</button>`);}
 const bar=$('.mj-docbar');if(bar&&!$('[data-document-save]'))bar.insertAdjacentHTML('beforeend',`<button class="mj-button" data-document-save title="${escape(shortcutLabel(currentShortcuts().save))}">${icon('save')}${ui('保存','Save')}</button>`);
 const read=bar?.querySelector('[data-v4="view"]');if(read)bar.append(read);
}
window.nativeApp.editorHistory=action=>{
 if(!$('#mj-overlay').hidden||document.activeElement?.matches('input,textarea')&&!document.activeElement.closest('.mj-paper'))return false;
 if(!isEditing()||state.view!=='document')return false;runDocumentHistory(action);return true;
};
