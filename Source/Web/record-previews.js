// Page-scoped display values stay separate from editable records and save patches.
let recordPreviews=new Map(),previewEpoch=0,previewContext='',previewStep=-1,previewPending=null,previewError='';
function clearRecordPreviews(){
 previewEpoch++;recordPreviews.clear();previewContext='';previewStep=-1;previewPending=null;previewError='';
}
function listPreview(r){return r?._sealed?recordPreviews.get(r.id):null;}
function listAccountField(r){const p=listPreview(r);return r._sealed?(p?{value:p.account,secret:p.accountSecret}:null):accountField(r);}
function listAccountOf(r){return listAccountField(r)?.value||'';}
function listHasPassword(r){return r._sealed?!!listPreview(r)?.hasPassword:!!passwordField(r)?.value;}
function listCodes(r){const p=listPreview(r);return p?.step===Math.floor(Date.now()/30000)?p.codes:[];}
function refreshListPreviews(force=false){
 if(!nativeInfo.recordProtocol||!vaultUnlocked||state.area!=='vault'||state.view!=='table'||state.search||state.category==='trash'){
  if(previewContext)clearRecordPreviews();return;
 }
 const rows=[...document.querySelectorAll('[data-record-id],[data-preview-record]')].map(el=>record(el.dataset.recordId||el.dataset.previewRecord)).filter(Boolean);
 const related=state.category==='codes'?[]:rows.map(r=>r.refs.map(record).find(r=>r?.type==='email')||r.refs.map(record).find(Boolean)).filter(Boolean);
 const ids=[...new Set([...rows,...related].filter(r=>r._sealed).map(r=>r.id))];
 if(!ids.length){if(previewContext)clearRecordPreviews();return;}
 const context=JSON.stringify([privacyEpoch,nativeInfo.session,state.category,state.platformFilter,state.page,ids]);
 if(context!==previewContext){clearRecordPreviews();previewContext=context;}
 const step=Math.floor(Date.now()/30000);
 document.querySelectorAll('[data-preview-code-value]').forEach(el=>{
  if(recordPreviews.get(el.dataset.previewCodeValue)?.step===step)return;
  el.textContent='••• •••';const button=el.parentElement.querySelector('[data-preview-code]');if(button)button.disabled=true;
 });
 if(previewPending||!force&&(previewStep===step||previewError))return;
 const epoch=previewEpoch,session=nativeInfo.session;
 const current=()=>epoch===previewEpoch&&session===nativeInfo.session&&vaultUnlocked&&state.area==='vault'&&state.view==='table'&&!state.search;
 const task=(async()=>{
  try{
   if(redactionPending)await redactionPending;
   await persist();if(!current())return;
   const next=new Map();let responseStep=step;
   for(let offset=0;offset<ids.length;offset+=40){
    const batch=ids.slice(offset,offset+40),reply=await nativeCall('recordPreviews',{ids:batch,session});
    if(!current())return;
    if(!Array.isArray(reply.previews)||reply.previews.length!==batch.length||reply.previews.some((p,index)=>p.id!==batch[index]))throw new Error(ui('列表回复无效，请重试','Invalid list response. Please retry.'));
    responseStep=reply.step;for(const p of reply.previews)next.set(p.id,p);
   }
   if(!current()||responseStep!==Math.floor(Date.now()/30000)||[...next.values()].some(p=>p.step!==responseStep))return;
   recordPreviews=next;previewStep=responseStep;previewError='';render();
  }catch(error){if(current()){previewError=String(error);toast(previewError);render();}}
  finally{if(epoch===previewEpoch)previewPending=null;}
 })();
 previewPending=task;return task;
}
async function copyListedValue(r,key,index=-1){
 if(!r||isProtected(r)&&!vaultUnlocked)return;
 try{
  if(r._sealed){await nativeCall('copyRecordValue',{id:r.id,key,index,session:nativeInfo.session});toast('已复制，30 秒后自动清除');}
  else{const value=key==='account'?accountOf(r):key==='password'?secretOf(r):otpValues.get(r.id)?.replace(/ /g,'');if(value)await copyText(value);}
 }catch(error){toast(String(error));}
}
window.addEventListener('click',event=>{
 const retry=event.target.closest('[data-preview-retry]');
 if(retry){event.preventDefault();event.stopImmediatePropagation();previewError='';refreshListPreviews(true);return;}
 const button=event.target.closest('[data-qcopy],[data-preview-code]');if(!button)return;
 const r=record(button.dataset.qcopy||button.dataset.previewCode);if(!r?._sealed)return;
 event.preventDefault();event.stopImmediatePropagation();updateActivity();
 const key=button.dataset.qkey||'otp',index=button.dataset.index!==undefined?Number(button.dataset.index):listCodes(r)[0]?.index??-1;
 copyListedValue(r,key,index);
},true);
