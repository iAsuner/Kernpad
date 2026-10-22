// Expiration is enforced by native storage as well as the visible workspace.
// It is independent of document autosave and never applies to vault records.
let temporaryTimer=null,temporaryPruning=null,temporaryGeneration=0,temporaryCreation=null;
let temporaryDefaultSave=Promise.resolve(),temporaryDefaultRevision=0;
function temporaryDefaultSettings(){
 const minutes=nativeInfo.settings?.temporaryNoteMinutes||1440,unit=minutes%1440===0?1440:minutes%60===0?60:1;
 return `<div class="mj-setting mj-temporary-default-setting"><span>${ui('临时便签默认有效期','Default temporary note lifetime')}<small>${ui('新建时直接使用此时长，不再询问。到期删除正文、附件和草稿，不进入回收站或备份。','New temporary notes use this duration immediately. Expiration removes content, attachments and drafts without Trash or backups.')}</small></span><div class="mj-setting-duration" data-temporary-default><input type="number" min="1" max="525600" step="1" value="${minutes/unit}" data-temporary-default-value aria-label="${ui('默认有效期数值','Default lifetime value')}"><select data-temporary-default-unit aria-label="${ui('默认有效期单位','Default lifetime unit')}">${[[1,ui('分钟','Minutes')],[60,ui('小时','Hours')],[1440,ui('天','Days')]].map(([v,label])=>`<option value="${v}" ${v===unit?'selected':''}>${label}</option>`).join('')}</select><small data-temporary-default-status role="status"></small></div></div>`;
}
function saveTemporaryDefault(control){
 const editor=control.closest('[data-temporary-default]'),value=Number(editor.querySelector('input').value),minutes=value*Number(editor.querySelector('select').value),status=editor.querySelector('[role=status]');
 const revision=++temporaryDefaultRevision,profile=nativeInfo.profile;
 if(!Number.isInteger(value)||value<1||minutes>525600){status.textContent=ui('请输入 1 分钟至 365 天','Use 1 minute to 365 days');status.dataset.error='true';return;}
 status.textContent=ui('正在保存…','Saving…');delete status.dataset.error;
 temporaryDefaultSave=temporaryDefaultSave.catch(()=>{}).then(async()=>{
  if(profile!==nativeInfo.profile)return;
  await nativeCall('settings',{temporaryNoteMinutes:minutes});
  if(profile!==nativeInfo.profile)return;nativeInfo.settings.temporaryNoteMinutes=minutes;
  if(revision===temporaryDefaultRevision&&status.isConnected)status.textContent=ui('已保存','Saved');
 }).catch(error=>{if(revision!==temporaryDefaultRevision)return;if(status.isConnected){status.textContent=ui('保存失败，请重新修改以重试','Save failed. Edit again to retry.');status.dataset.error='true';}else toast(String(error));});
}
root.addEventListener('change',event=>{if(!event.target.matches('[data-temporary-default-value],[data-temporary-default-unit]'))return;event.stopImmediatePropagation();saveTemporaryDefault(event.target);},true);
function durationLabel(minutes){return minutes%1440===0?ui(minutes/1440+' 天',minutes/1440+' day'+(minutes===1440?'':'s')):minutes%60===0?ui(minutes/60+' 小时',minutes/60+' hour'+(minutes===60?'':'s')):ui(minutes+' 分钟',minutes+' minute'+(minutes===1?'':'s'));}
function temporaryDeadline(r){return !isProtected(r)&&r.expiresAt?Date.parse(r.expiresAt):null;}
function expirationLabel(r){return ui('临时便签：','Temporary note: ')+new Date(r.expiresAt).toLocaleString(locale==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+ui(' 到期',' expires');}
function applyStartupPage(){
 changeArea(nativeInfo.settings?.startupPage==='vault'?'vault':'notes');
 if(state.area==='vault')requestVaultUnlock();
 scheduleTemporaryCleanup();
}
function polishTemporaryNotes(){
 // Moving a note into protected storage cancels its disposable lifetime.
 for(const r of records)if(r.expiresAt&&isProtected(r)){delete r.expiresAt;toast(ui('已转为长期保留的密码库记录','Now a permanent vault record'));}
 const head=$('.mj-selection-actions');
 if(head&&state.area==='notes'&&!head.querySelector('[data-new-temporary]'))head.insertAdjacentHTML('afterbegin',`<button class="mj-button" data-new-temporary>${icon('timer')}${ui('临时便签','Temporary note')}</button>`);
 for(const {el,id} of selectableRecords()){const r=record(id);if(!r?.expiresAt||isProtected(r))continue;const tag=el.querySelector('small');if(tag){tag.textContent=expirationLabel(r);tag.title=ui('到期永久删除，包括附件与草稿','Permanently removed on expiry, including attachments and drafts');}}
 const r=selected(),paper=$('.mj-paper');
 if(state.view==='document'&&r?.expiresAt&&!isProtected(r)&&paper&&!paper.querySelector('[data-note-expiration]'))paper.insertAdjacentHTML('afterbegin',`<div class="mj-note-expiration"><button class="mj-button" data-note-expiration title="${ui('调整有效期或转为普通便签','Change lifetime or keep as a regular note')}">${icon('timer')}${escape(expirationLabel(r))}${icon('chevron-down')}</button><small>${ui('到期自动删除，不进入回收站或备份。','Automatically removed on expiry, without Trash or backups.')}</small></div>`);
 scheduleTemporaryCleanup();
}
function scheduleTemporaryCleanup(){
 clearTimeout(temporaryTimer);if(!nativeReady)return;
 const dates=[...records,...trashedRecords].map(temporaryDeadline).filter(n=>Number.isFinite(n));
 if(!dates.length)return;
 temporaryTimer=setTimeout(pruneTemporaryNotes,Math.max(0,Math.min(60000,Math.min(...dates)-Date.now())));
}
function pruneTemporaryNotes(){
 if(temporaryPruning)return temporaryPruning;if(!nativeReady)return Promise.resolve();
 temporaryPruning=(async()=>{
 const profile=nativeInfo.profile,generation=++temporaryGeneration;
 try{
  await saveChain.catch(()=>{});
  const result=await nativeCall('expireNotes');
  if(profile!==nativeInfo.profile||generation!==temporaryGeneration)return;
  const ids=new Set([...(result?.ids||[]),...[...records,...trashedRecords].filter(r=>temporaryDeadline(r)!==null&&temporaryDeadline(r)<=Date.now()).map(r=>r.id)]);
  const removed=[...records,...trashedRecords].some(r=>ids.has(r.id));
  if(!removed)return;
  const current=ids.has(state.selected);if(current){clearTimeout(saveTimer);clearManualState();clearRichState();closeModal();state.selected=null;state.view='table';state.history=[];docMode='view';}
  records=records.filter(r=>!ids.has(r.id));trashedRecords=trashedRecords.filter(r=>!ids.has(r.id));
  nativeInfo.draftIDs=(nativeInfo.draftIDs||[]).filter(id=>!ids.has(id));lastSaved='';render();
  toast(current?ui('当前临时便签已到期并删除','This temporary note expired and was removed'):ui('已清理到期的临时便签','Expired temporary notes removed'));
 }catch(error){saveStatus(ui('临时便签清理失败，请重试','Temporary note cleanup failed. Please retry.'),true);}
 finally{clearTimeout(temporaryTimer);temporaryTimer=setTimeout(scheduleTemporaryCleanup,1000);}
 })().finally(()=>{temporaryPruning=null;});return temporaryPruning;
}
function createTemporaryNote(){
 if(temporaryCreation)return temporaryCreation;
 const profile=nativeInfo.profile;
 temporaryCreation=(async()=>{
  await temporaryDefaultSave;
  if(profile!==nativeInfo.profile||!await confirmManualNavigation())return;
  const minutes=nativeInfo.settings?.temporaryNoteMinutes||1440;
  const r=await createPlainNote({expiresAt:new Date(Date.now()+minutes*60000).toISOString()});
  if(!r)return;
  await persist();scheduleTemporaryCleanup();return r;
 })().finally(()=>{temporaryCreation=null;});
 return temporaryCreation;
}
function showTemporaryDuration(kind,id=null){
 if(kind==='new')return createTemporaryNote();
 if(kind==='default'){showSettings('general');return;}
 const r=record(id);if(!r||isProtected(r)||!r.expiresAt)return;
 const minutes=Math.max(1,Math.ceil((Date.parse(r.expiresAt)-Date.now())/60000)),unit=minutes%1440===0?1440:minutes%60===0?60:1;
 modal(ui('临时便签有效期','Temporary note lifetime'),ui('调整当前便签的期限，不改变新便签的默认设置。','Change this note’s deadline without changing the default for new notes.'),
 `<p class="mj-quiet">${escape(expirationLabel(r))}</p><div class="mj-setting mj-temporary-duration"><span>${ui('从现在起保留','Keep from now')}<small>${ui('修改并保存后重新计时；取消则保留原期限。','Changing and saving restarts the timer. Cancel keeps the existing deadline.')}</small></span><div class="mj-setting-duration"><input type="number" data-temporary-value aria-label="${ui('保留时长','Lifetime value')}" min="1" max="525600" step="1" value="${minutes/unit}"><select data-temporary-unit aria-label="${ui('时间单位','Time unit')}">${[[1,ui('分钟','Minutes')],[60,ui('小时','Hours')],[1440,ui('天','Days')]].map(([v,label])=>`<option value="${v}" ${v===unit?'selected':''}>${label}</option>`).join('')}</select></div></div><p class="mj-settings-note">${ui('到期永久删除正文、附件和本机草稿，不进入回收站或备份。应用关闭期间到期，下次启动清理。','Expiration permanently removes content, attachments and local drafts without Trash or backups. If the app is closed, cleanup runs on its next launch.')}</p><p data-temporary-error role="alert"></p>`,
 `<button class="mj-button" data-temporary-keep>${ui('转为普通便签','Keep as a regular note')}</button><span class="mj-spacer"></span><button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-temporary-confirm>${tr('保存')}</button>`);
 const profile=nativeInfo.profile,dialog=$('.mj-modal'),valueInput=$('[data-temporary-value]'),unitInput=$('[data-temporary-unit]'),button=$('[data-temporary-confirm]'),keepButton=$('[data-temporary-keep]');
 const initialValue=valueInput.value,initialUnit=unitInput.value;
 const unchanged=()=>valueInput.value===initialValue&&unitInput.value===initialUnit;
 const update=()=>{button.disabled=unchanged();};update();valueInput.addEventListener('input',update);unitInput.addEventListener('change',update);
 let saving=false;
 async function apply(keep=false){
  if(saving||!keep&&unchanged())return;
  const value=Number(valueInput.value),minutes=value*Number(unitInput.value),error=dialog.querySelector('[data-temporary-error]');
  if(!keep&&(!Number.isInteger(value)||value<1||minutes>525600)){error.textContent=ui('请输入 1 分钟至 365 天的整数时长。','Enter a whole-number duration between 1 minute and 365 days.');return;}
  if(nativeInfo.profile!==profile)return;
  saving=true;button.disabled=true;keepButton.disabled=true;const oldExpiration=r.expiresAt;
  try{
   await pruneTemporaryNotes();if(profile!==nativeInfo.profile||!record(r.id))return;
   if(keep)delete r.expiresAt;else r.expiresAt=new Date(Date.now()+minutes*60000).toISOString();
   await persist();if(dialog.isConnected)closeModal();render();
  }catch(e){if(profile!==nativeInfo.profile)return;r.expiresAt=oldExpiration;if(error.isConnected){error.textContent=String(e);saving=false;keepButton.disabled=false;update();}else toast(String(e));}
 }
 button.addEventListener('click',()=>apply());keepButton.addEventListener('click',()=>apply(true));
}
window.addEventListener('click',event=>{
 const button=event.target.closest('[data-new-temporary],[data-note-expiration]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(button.hasAttribute('data-note-expiration'))showTemporaryDuration('edit',selected()?.id);
 else{button.disabled=true;createTemporaryNote().catch(error=>toast(String(error))).finally(()=>{if(button.isConnected)button.disabled=false;});}
},true);
window.addEventListener('focus',()=>{if(nativeReady)pruneTemporaryNotes();});
