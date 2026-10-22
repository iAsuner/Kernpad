// Saved fingerprints contain no document body. Only a successful native save
// advances the baseline, including when newer edits arrive during that save.
let documentSaveEntries=new Map(),documentSaveProbe=0,documentMediaDigests=new WeakMap();
// Presentation only: acknowledgements and saved fingerprints still update immediately.
let saveFeedback={epoch:-1,pending:0,timer:0,started:0,visibleSince:0};
function currentSaveFeedback(){
 if(saveFeedback.epoch!==privacyEpoch){clearTimeout(saveFeedback.timer);saveFeedback={epoch:privacyEpoch,pending:0,timer:0,started:0,visibleSince:0};}
 return saveFeedback;
}
function renderSaveFeedback(){
 const feedback=currentSaveFeedback(),el=$('#mj-status-text');
 clearTimeout(feedback.timer);feedback.timer=0;
 const quiet=autoSaveEnabled()&&!templateDesign&&!lastSaveError&&['已保存','正在保存…',''].includes(lastSaveMessage);
 let text=lastSaveMessage;
 if(quiet){
  const now=performance.now();
  if(feedback.pending){
   if(!feedback.started)feedback.started=now;
   if(!feedback.visibleSince&&now-feedback.started>=800)feedback.visibleSince=now;
  }else feedback.started=0;
  // Slow writes get a stable progress message. Fast writes never flash a success label.
  if(feedback.visibleSince&&(feedback.pending||now-feedback.visibleSince<600))text='正在保存…';
  else{feedback.visibleSince=0;text='';}
  const delay=feedback.pending&&!feedback.visibleSince?800-(now-feedback.started):!feedback.pending&&feedback.visibleSince?600-(now-feedback.visibleSince):0;
  if(delay>0)feedback.timer=setTimeout(()=>{if(feedback===saveFeedback&&feedback.epoch===privacyEpoch)renderSaveFeedback();},delay);
 }else{feedback.started=0;feedback.visibleSince=0;}
 if(el){el.hidden=!text;el.textContent=tr(text);el.style.color=lastSaveError?'var(--mj-red)':'';}
}
function documentContentDigest(r){
 // Media payloads are immutable strings. Hash them once per block revision so
 // typing alongside a large video does not clone and encode that video again.
 const values=Object.fromEntries(manualRecordKeys.filter(key=>key!=='blocks'&&Object.hasOwn(r,key)).map(key=>[key,structuredClone(r[key])]));
 const blocks=(r.blocks||[]).map(block=>{
  if(!['image','video'].includes(block.type))return Promise.resolve([structuredClone(block),null]);
  const {data,poster,...metadata}=block;let cached=documentMediaDigests.get(block);
  if(!cached||cached.data!==data||cached.poster!==poster){cached={data,poster,digest:snapshotDigest({data,poster})};documentMediaDigests.set(block,cached);}
  const copy=structuredClone(metadata);return cached.digest.then(digest=>[copy,digest]);
 });
 return Promise.all(blocks).then(blocks=>snapshotDigest({values,blocks,hasBlocks:Object.hasOwn(r,'blocks')})).catch(()=>null);
}
function resetDocumentSaveIndicators(all=false){
 documentSaveProbe++;documentMediaDigests=new WeakMap();
 for(const [id,entry] of documentSaveEntries)if(all||entry.protected)documentSaveEntries.delete(id);
}
function documentSaveEntry(r){
 let entry=documentSaveEntries.get(r.id);
 if(!entry){
  const baseline=manualDocument?.id===r.id?manualDocument.values:r;
  entry={saved:manualKnownIDs.has(r.id)?documentContentDigest(baseline):Promise.resolve(null),pending:0,failed:false,protected:isProtected(r)};
  documentSaveEntries.set(r.id,entry);
 }
 entry.protected=isProtected(r);return entry;
}
function syncDocumentSaveControl(){
 renderSaveFeedback();
 if(templateDesign){syncTemplateDesignControl();return;}
 const probe=++documentSaveProbe,r=selected(),button=$('[data-document-save]');
 for(const id of documentSaveEntries.keys())if(!record(id))documentSaveEntries.delete(id);
 if(!button||state.view!=='document'||!r||r._sealed)return;
 const entry=documentSaveEntry(r),current=documentContentDigest(r),epoch=privacyEpoch,automatic=autoSaveEnabled();
 button.hidden=automatic&&!entry.failed;
 Promise.all([entry.saved,current]).then(([saved,value])=>{
  if(probe!==documentSaveProbe||epoch!==privacyEpoch||selected()!==r||!button.isConnected||documentSaveEntries.get(r.id)!==entry)return;
  const status=entry.pending?'saving':!entry.failed&&saved&&value===saved?'saved':'dirty';
  button.disabled=status!=='dirty';button.setAttribute('aria-busy',String(status==='saving'));
  button.title=status==='saved'?ui('所有修改已保存','All changes saved'):status==='saving'?ui('正在保存…','Saving…'):ui(entry.failed?'保存失败，点击重试':'有未保存的修改，点击保存',entry.failed?'Save failed. Click to retry.':'Unsaved changes. Click to save.');
  const presentation=automatic?(entry.failed?'retry':'quiet'):status;
  button.dataset.saveState=status;
  if(button.dataset.savePresentation!==presentation){button.dataset.savePresentation=presentation;button.innerHTML=icon(presentation==='saved'?'check':'save')+ui(presentation==='saved'?'已保存':presentation==='saving'?'保存中…':presentation==='retry'?'重试保存':'保存',presentation==='saved'?'Saved':presentation==='saving'?'Saving…':presentation==='retry'?'Retry Save':'Save');icons();}
 });
}
function documentSaveQueued(model){
 const r=selected();if(state.view==='document'&&r&&!r._sealed)documentSaveEntry(r);
 const tokens=[];
 tokens.feedback=currentSaveFeedback();tokens.feedback.pending++;
 for(const saved of model.records){const entry=documentSaveEntries.get(saved.id);if(entry&&!saved._sealed){entry.pending++;tokens.push({id:saved.id,entry,record:saved});}}
 syncDocumentSaveControl();return tokens;
}
function documentSaveFinished(tokens,success){
 if(tokens.feedback)tokens.feedback.pending=Math.max(0,tokens.feedback.pending-1);
 for(const {id,entry,record:saved} of tokens){if(documentSaveEntries.get(id)!==entry)continue;entry.pending=Math.max(0,entry.pending-1);entry.failed=!success;if(success)entry.saved=documentContentDigest(saved);}
 syncDocumentSaveControl();
}
