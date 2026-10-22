const manualRecordKeys=['name','templateID','summary','fields','blocks','links','refs','type','protected','verification','documentOptions','otpSecret','totp'];
let manualDocument=null,manualPrompt=null,manualNavigation=false,manualKnownIDs=new Set(),manualProfile=null,manualRecovery=0;
function manualValues(r){return Object.fromEntries(manualRecordKeys.filter(key=>Object.hasOwn(r,key)).map(key=>[key,cloneDocumentValue(r[key])]));}
function replaceManualValues(r,values){for(const key of manualRecordKeys)delete r[key];Object.assign(r,cloneDocumentValue(values));}
function autoSaveEnabled(){return nativeInfo.settings?.autoSave!==false;}
function manualDocumentDirty(){
 const r=manualDocument&&record(manualDocument.id);
 return !autoSaveEnabled()&&manualDocument?.epoch===privacyEpoch&&r&&!r._sealed&&!manualRecordKeys.every(key=>Object.hasOwn(r,key)===Object.hasOwn(manualDocument.values,key)&&equalDocumentValues(r[key],manualDocument.values[key]));
}
function manualAcceptNative(info){
 if(info.profile&&info.profile!==manualProfile){manualProfile=info.profile;manualKnownIDs.clear();clearManualState();if(typeof resetDocumentSaveIndicators==='function')resetDocumentSaveIndicators(true);}
 for(const r of [...info.notes||[],...info.private?.records||[]])manualKnownIDs.add(r.id);
 if(info.draftIDs)nativeInfo.draftIDs=info.draftIDs;
}
function clearManualState(){manualDocument=null;manualRecovery++;}
function manualObserveDocument(){
 const r=selected();if(templateDesign?.record===r){clearManualState();return;}if(autoSaveEnabled()||state.view!=='document'||!r||r._sealed){clearManualState();return;}
 if(manualDocument?.id!==r.id||manualDocument.epoch!==privacyEpoch){
  const values=manualValues(r);manualDocument={id:r.id,epoch:privacyEpoch,values,view:structuredClone(state),mode:docMode};
  if(!manualKnownIDs.has(r.id))queueMicrotask(()=>{if(manualDocument?.id===r.id)persist({documentSave:true}).catch(()=>{});});
  else if(nativeInfo.draftIDs?.includes(r.id))queueMicrotask(()=>recoverManualDraft(r.id));
 }else{
  manualDocument.view=structuredClone(state);manualDocument.mode=docMode;
  // A move into the vault is a privacy boundary, even in manual-save mode.
  // Commit only the prior document under encryption; new edits remain a draft.
  if(!isProtected({...manualDocument.values})&&isProtected(r)){
   manualDocument.values.protected=true;
   queueMicrotask(()=>persist().catch(()=>{}));
  }
 }
 const bar=$('.mj-docbar');if(isEditing()&&bar&&!$('[data-document-save]'))bar.insertAdjacentHTML('beforeend',`<button class="mj-button" data-document-save title="${escape(shortcutLabel(currentShortcuts().save))}">${icon('save')}${ui('保存','Save')}</button>`);
}
function prepareManualSave(model,explicit=false){
 if(autoSaveEnabled()||explicit||!manualDocument||manualDocument.epoch!==privacyEpoch)return model;
 const r=model.records.find(r=>r.id===manualDocument.id);
 if(r&&!r._sealed)replaceManualValues(r,manualDocument.values);
 return model;
}
async function manualSaveSucceeded(model,explicit=false){
 for(const r of model.records)manualKnownIDs.add(r.id);
 if(!explicit||!manualDocument||manualDocument.epoch!==privacyEpoch)return;
 const saved=model.records.find(r=>r.id===manualDocument.id);if(!saved||saved._sealed)return;
 manualDocument.values=manualValues(saved);
 if(nativeInfo.draftIDs?.includes(saved.id)){await nativeCall('clearDraft',{id:saved.id,session:nativeInfo.session||''});nativeInfo.draftIDs=nativeInfo.draftIDs.filter(id=>id!==saved.id);}
}
function manualLockSnapshot(model){
 if(manualDocumentDirty()){model.draft=cloneDocumentValue(record(manualDocument.id));nativeInfo.draftIDs=[...new Set([...nativeInfo.draftIDs||[],manualDocument.id])];}
 return prepareManualSave(model);
}
function retainPublicManualDocument(){
 if(!manualDocumentDirty())return null;
 const r=record(manualDocument.id);if(isProtected(r))return null;
 // Public notes stay editable when the vault locks. Keep their baseline so the
 // remaining unsaved body is never mistaken for a newly saved version.
 return manualDocument;
}
function cancelManualPrompt(){const pending=manualPrompt;manualPrompt=null;pending?.resolve(false);}
function confirmManualNavigation(){
 if(!manualDocumentDirty())return Promise.resolve(true);
 if(manualPrompt)return manualPrompt.promise;
 const id=manualDocument.id,epoch=privacyEpoch;
 let resolve;const promise=new Promise(done=>resolve=done);
 modal(ui('保存更改？','Save changes?'),escape(recordDisplayName(record(id))),`<p>${ui('自动保存已关闭。保存后继续，或放弃这次未保存的修改。','Auto-save is off. Save to continue, or discard these unsaved changes.')}</p>`,`<button class="mj-button" data-manual-choice="cancel">${tr('取消')}</button><button class="mj-button mj-danger" data-manual-choice="discard">${ui('放弃修改','Discard changes')}</button><span class="mj-spacer"></span><button class="mj-primary" data-manual-choice="save">${ui('保存并继续','Save & Continue')}</button>`);
 manualPrompt={id,epoch,promise,resolve};queueMicrotask(()=>$('[data-manual-choice="cancel"]')?.focus({preventScroll:true}));return promise;
}
async function chooseManualNavigation(choice){
 const pending=manualPrompt;if(!pending)return;
 if(choice==='cancel'){closeModal();return;}
 const buttons=$$('[data-manual-choice]');buttons.forEach(b=>b.disabled=true);
 try{
  if(choice==='save')await persist({documentSave:true});
  else{
   if(nativeInfo.draftIDs?.includes(pending.id)){await nativeCall('clearDraft',{id:pending.id,session:nativeInfo.session||''});nativeInfo.draftIDs=nativeInfo.draftIDs.filter(id=>id!==pending.id);}
   if(pending.epoch!==privacyEpoch||manualDocument?.id!==pending.id)return;
   replaceManualValues(record(pending.id),manualDocument.values);clearEditorHistory();
  }
  if(pending!==manualPrompt||pending.epoch!==privacyEpoch)return;
  manualPrompt=null;closeModal();render();pending.resolve(true);
 }catch(error){buttons.forEach(b=>b.disabled=false);toast(String(error));}
}
function guardManualRender(){
 if(manualNavigation||!manualDocumentDirty()||state.view==='document'&&state.selected===manualDocument.id&&!state.search)return false;
 const desired=structuredClone(state),mode=docMode;
 Object.assign(state,structuredClone(manualDocument.view));docMode=manualDocument.mode;$('#mj-search').value=state.search||'';
 if(!manualPrompt)confirmManualNavigation().then(ok=>{if(ok){manualNavigation=true;try{Object.assign(state,desired);docMode=mode;$('#mj-search').value=state.search||'';clearManualState();render();}finally{manualNavigation=false;}}});
 return true;
}
async function recoverManualDraft(id){
 if(manualDocument?.id!==id||selected()?.id!==id||autoSaveEnabled())return;
 const attempt=++manualRecovery,epoch=privacyEpoch;
 try{
  const result=await nativeCall('readDraft',{id,session:nativeInfo.session||''});
  if(attempt!==manualRecovery||epoch!==privacyEpoch||selected()?.id!==id||manualDocument?.id!==id||manualDocumentDirty()||!result.draft)return;
  const apply=()=>{if(epoch!==privacyEpoch||selected()?.id!==id)return;replaceManualValues(record(id),manualValues(result.draft));docMode='edit';render();saveStatus(ui('已恢复草稿，尚未保存','Draft restored — not saved'));};
  if(result.baseMatches)apply();
  else{
   modal(ui('发现未保存草稿','Unsaved draft found'),'',`<p>${ui('已保存版本后来有变动。你可以恢复草稿继续编辑，再决定是否保存。','The saved version has changed. You can restore the draft for review before deciding whether to save it.')}</p>`,`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-restore-manual-draft>${ui('恢复草稿','Restore draft')}</button>`);
   $('[data-restore-manual-draft]').onclick=()=>{closeModal();apply();};
  }
 }catch(error){toast(String(error));}
}
// Guard programmatic navigation before it changes records or starts a native
// editing lease. The render guard covers the remaining list/back/search paths.
const manualOriginalOpen=openRecord,manualOriginalCreate=createPlainNote,manualOriginalArea=changeArea,manualOriginalCategory=setCategory,manualOriginalNew=showNew,manualOriginalChooser=showNewChooser,manualOriginalTrash=confirmRecordTrash;
openRecord=function(id){if(!manualNavigation&&manualDocumentDirty()&&id!==manualDocument.id)return confirmManualNavigation().then(ok=>{if(ok)openRecord(id);});return manualOriginalOpen(id);};
createPlainNote=function(options={}){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)return createPlainNote(options);});return manualOriginalCreate(options);};
changeArea=function(area){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)changeArea(area);});return manualOriginalArea(area);};
setCategory=function(category){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)setCategory(category);});return manualOriginalCategory(category);};
showNew=function(...args){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)showNew(...args);});return manualOriginalNew(...args);};
showNewChooser=function(){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)showNewChooser();});return manualOriginalChooser();};
confirmRecordTrash=function(id){if(manualDocumentDirty())return confirmManualNavigation().then(ok=>{if(ok)confirmRecordTrash(id);});return manualOriginalTrash(id);};
root.addEventListener('click',event=>{
 const choice=event.target.closest('[data-manual-choice]'),save=event.target.closest('[data-document-save]');if(!choice&&!save)return;
 event.preventDefault();event.stopImmediatePropagation();if(choice)chooseManualNavigation(choice.dataset.manualChoice);else saveWhileEditing();
},true);
root.addEventListener('change',async event=>{
 if(!event.target.matches('[data-auto-save]'))return;
 event.preventDefault();event.stopImmediatePropagation();const checkbox=event.target,value=checkbox.checked;checkbox.disabled=true;
 try{
  if(value&&manualDocumentDirty()){checkbox.checked=false;if(!await confirmManualNavigation())return;}
  if(!value)await persist({documentSave:true});
  await nativeCall('settings',{autoSave:value});nativeInfo.settings.autoSave=value;clearManualState();clearTimeout(saveTimer);render();showSettings('general');
 }catch(error){checkbox.checked=!value;toast(String(error));}finally{if(checkbox.isConnected)checkbox.disabled=false;}
},true);
window.nativeApp.prepareToClose=async()=>{if(!await confirmManualNavigation())return false;await persist();await lock();return true;};
