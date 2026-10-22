let nativeInfo={exists:false,settings:{locale:'zh'}},nativeReady=false,nativeBusy=false,nativeLocked=false;
let saveTimer,saveChain=Promise.resolve(),lastSaved='',activityStamp=0,privacyEpoch=0,lastSaveMessage='',lastSaveError=false;
let authAttempt=0,authPending=false,authMessage='';
let lockPromise=null,authResumeRequested=false,appActive=true;
let deletedRecordIDs=new Set(),detailEpoch=0,detailNavigation='',redactionPending=null;
const originalTemplates=structuredClone(templateRegistry),originalTypes=structuredClone(types);
const nativeCall=(command,payload={})=>window.webkit.messageHandlers.native.postMessage({command,payload});
function isProtected(r){if(typeof templateDesign!=='undefined'&&templateDesign?.record===r)return false;return !!r&&(r.type!=='note'||r.protected===true||r.totp===true||!!r.otpSecret||(r.fields||[]).some(f=>f.secret||['secret','otp'].includes(f.kind))||(r.blocks||[]).some(b=>b.type==='form'||b.type==='otp'&&!plainNoteOTP(r,b)));}
function snapshot(){return {recordProtocol:1,session:nativeInfo.session||null,deletedIDs:[...deletedRecordIDs],activeID:state.view==='document'&&isProtected(selected())?state.selected:null,records:cloneDocumentValue([...records,...trashedRecords]),templateSchemas:templateSchemaSnapshot(),templates:vaultUnlocked?{builtin:structuredClone(templateRegistry),custom:structuredClone(customTemplates),platforms:structuredClone(customPlatforms)}:{}};}
async function snapshotDigest(model){
 const bytes=new TextEncoder().encode(JSON.stringify(model));
 try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
 finally{bytes.fill(0);}
}
const recordMetadataKeys=['id','type','name','protected','favorite','deletedAt','refs','platform','platformName','tag','totp'];
function sealedSummary(r){
 const summary=Object.fromEntries(recordMetadataKeys.filter(key=>Object.hasOwn(r,key)).map(key=>[key,structuredClone(r[key])]));
 return {...summary,_sealed:true,protected:true,hasCodes:r.hasCodes??hasCodes(r),fields:[],blocks:[],links:[]};
}
function queueRecordDeletion(r){if(isProtected(r))deletedRecordIDs.add(r.id);}
function clearRecordCaches(){
 clearNativeSearch();
 templateFieldDraft=null;
 clearRecordPreviews();
 clearRichState();otpVersion++;blockCodeVersion++;otpValues.clear();blockCodes.clear();blockCodeStamp='';otpStep=-1;state.otp='';editorUndo=null;
 fieldTarget=null;pasteEditor=null;entryDraft=null;entryPreview=null;richSelection=null;insertContext=null;markdownDraft='';
}
function updateRecordResidency(){
 if(!nativeInfo.recordProtocol||!vaultUnlocked)return;
 const navigation=JSON.stringify([state.area,state.view,state.selected,state.category,state.search]);
 if(navigation!==detailNavigation){detailNavigation=navigation;detailEpoch++;}
 const keep=state.view==='document'&&!state.search?state.selected:null;
 const departing=[...records,...trashedRecords].filter(r=>isProtected(r)&&!r._sealed&&r.id!==keep);
 if(!departing.length||redactionPending)return;
 const epoch=privacyEpoch;clearRecordCaches();
 // Retain the departing editor until its save is acknowledged. On disk failure
 // it remains available for retry rather than losing the user's last edits.
 redactionPending=persist().then(()=>{
  if(epoch!==privacyEpoch)return;
  const current=state.view==='document'&&!state.search?state.selected:null;
  const redact=r=>departing.includes(r)&&r.id!==current?sealedSummary(r):r;
  records=records.map(redact);trashedRecords=trashedRecords.map(redact);
  if(state.view!=='document'||state.search)render();
 }).finally(()=>{redactionPending=null;});
 redactionPending.catch(()=>{});
}
async function openSealedRecord(id,edit=false,historyOverride=null){
 if(!vaultUnlocked)return;
 if(typeof confirmManualNavigation==='function'&&manualDocumentDirty()&&id!==manualDocument.id&&!await confirmManualNavigation())return;
 const previous=state.view==='document'?state.selected:null;
 const history=historyOverride||[...state.history,...(previous&&previous!==id?[previous]:[])];
 state.view='table';closeModal();render();
 const attempt=++detailEpoch,epoch=privacyEpoch,session=nativeInfo.session;
 try{
  if(redactionPending)await redactionPending;
  await persist();
  if(attempt!==detailEpoch||epoch!==privacyEpoch||!vaultUnlocked)return;
  const detail=await nativeCall('openRecord',{id,session});
  if(attempt!==detailEpoch||epoch!==privacyEpoch||!vaultUnlocked||session!==nativeInfo.session)return;
  if(detail.id!==id||detail._sealed)throw new Error('记录身份不匹配');
  records=records.map(r=>r.id===id?detail:r);clearRecordCaches();
  state.history=history;openRecord(id);if(edit){docMode='edit';render();}
 }catch(error){toast(String(error));}
}
function saveStatus(text,error=false){if(!error&&text==='已保存'&&typeof manualDocumentDirty==='function'&&manualDocumentDirty())text=ui('未保存的修改','Unsaved changes');lastSaveMessage=text;lastSaveError=error;if(typeof syncDocumentSaveControl==='function')syncDocumentSaveControl();else{const el=$('#mj-status-text');if(el){el.textContent=tr(text);el.style.color=error?'var(--mj-red)':'';}}}
function persist(options={}){
 clearTimeout(saveTimer);saveTimer=null;if(!nativeReady||nativeLocked)return saveChain;
 const model=typeof prepareManualSave==='function'?prepareManualSave(snapshot(),options.documentSave):snapshot(),epoch=privacyEpoch;
 const indicator=typeof documentSaveQueued==='function'?documentSaveQueued(model):null;let committed=false;
 saveStatus('正在保存…');
 saveChain=saveChain.catch(()=>{}).then(async()=>{const digest=await snapshotDigest(model);if(digest===lastSaved){if(typeof manualSaveSucceeded==='function'&&epoch===privacyEpoch)await manualSaveSucceeded(model,options.documentSave);committed=epoch===privacyEpoch;saveStatus('已保存');return;}await nativeCall('save',model);if(epoch===privacyEpoch){lastSaved=digest;if(typeof manualSaveSucceeded==='function')await manualSaveSucceeded(model,options.documentSave);committed=true;}saveStatus('已保存');}).catch(error=>{saveStatus('保存失败，请勿关闭应用',true);toast(String(error));throw error;}).finally(()=>{if(indicator)documentSaveFinished(indicator,committed);});
 return saveChain;
}
function scheduleSave(){if(templateDesign){syncDocumentSaveControl();return;}if(!nativeReady||nativeLocked)return;if(typeof syncDocumentSaveControl==='function')syncDocumentSaveControl();clearTimeout(saveTimer);saveTimer=null;if(nativeInfo.settings?.autoSave===false&&typeof manualDocumentDirty==='function'&&manualDocumentDirty()){saveStatus(ui('未保存的修改','Unsaved changes'));return;}saveTimer=setTimeout(()=>persist().catch(()=>{}),250);}
function remember(){scheduleSave();}
function resetTemplates(){clearExperience();for(const k of Object.keys(customTemplates))delete customTemplates[k];for(const k of Object.keys(templateRegistry))delete templateRegistry[k];Object.assign(templateRegistry,structuredClone(originalTemplates));for(const k of Object.keys(types))delete types[k];Object.assign(types,structuredClone(originalTypes));applyTemplateSchemas();}
function acceptNative(info,replaceNotes=false){
 if(replaceNotes&&typeof resetDocumentSaveIndicators==='function')resetDocumentSaveIndicators(true);
 if(typeof manualAcceptNative==='function')manualAcceptNative(info);
 if(info.unlocked&&info.private===undefined&&!replaceNotes&&vaultUnlocked){
  const renewed=info.session&&info.session!==nativeInfo.session;
  Object.assign(nativeInfo,{exists:info.exists,passwordless:info.passwordless,settings:info.settings,profile:info.profile,systemUnlockAvailable:info.systemUnlockAvailable,systemUnlockConfigured:info.systemUnlockConfigured});
  if(info.session)nativeInfo.session=info.session;
  if(info.recordProtocol)nativeInfo.recordProtocol=info.recordProtocol;
  Object.assign(security,info.settings);nativeBusy=false;
  if(renewed){
   if(typeof resetDocumentSaveIndicators==='function')resetDocumentSaveIndicators();
   // nativeAction committed the editor before reauthentication. The old detail
   // lease has ended; drop its plaintext and use the renewed ticket for saves.
   clearRecordCaches();records=records.map(r=>isProtected(r)?sealedSummary(r):r);trashedRecords=trashedRecords.map(r=>isProtected(r)?sealedSummary(r):r);
   state.view='table';state.history=[];detailEpoch++;lastSaved='';render();
  }
  return;
 }
 detailEpoch++;deletedRecordIDs.clear();
 if(typeof resetDocumentSaveIndicators==='function')resetDocumentSaveIndicators();
 templateSchemas=structuredClone(info.templateSchemas||{builtin:{},custom:{}});
 clearRecordPreviews();
 nativeInfo={exists:info.exists,passwordless:info.passwordless,settings:info.settings,unlocked:info.unlocked,profile:info.profile,systemUnlockAvailable:info.systemUnlockAvailable,systemUnlockConfigured:info.systemUnlockConfigured,recordProtocol:info.private?.recordProtocol||info.recordProtocol,session:info.private?.session||info.session,draftIDs:info.draftIDs||[]};vaultUnlocked=!!info.unlocked;nativeLocked=false;
 locale=info.settings.locale||'zh';Object.assign(security,info.settings,{platform:globalThis.kernpadPlatform==='windows'?'win':'mac',showFull:false});
 if(replaceNotes){records=info.notes||[];trashedRecords=[];}else{records=records.filter(r=>!isProtected(r));trashedRecords=trashedRecords.filter(r=>!isProtected(r));}
 resetTemplates();
 if(vaultUnlocked&&info.private){
  records.push(...(info.private.records||[]));
  const templates=info.private.templates||{};Object.assign(templateRegistry,templates.builtin||{});Object.assign(customTemplates,templates.custom||{});Object.assign(customPlatforms,templates.platforms||{});
  for(const t of allTemplates(true))types[t.id]={...types[t.id],name:t.name,group:t.group,icon:types[t.id]?.icon||'layout-template',hint:types[t.id]?.hint||'自定义模板'};
 }
 applyTemplateSchemas();
 // A committed encrypted copy wins if a crash interrupted the subsequent public-note update.
 const combined=[...new Map([...trashedRecords,...records].map(r=>[r.id,r])).values()];records=combined.filter(r=>!r.deletedAt);trashedRecords=combined.filter(r=>r.deletedAt);
 lastActivity=unlockedAt=Date.now();lastSaved='';nativeReady=true;nativeBusy=false;
 if(!record(state.selected))state.view='table';
 render();
 saveStatus('已保存');
}
async function boot(){
 try{
  const info=await nativeCall('bootstrap');acceptNative(info,true);
  if(info.starterDocuments&&!records.length&&!trashedRecords.length){
   try{await addExampleDocuments(exampleCatalog().map(e=>e.key));}catch(error){saveStatus('保存失败，请勿关闭应用',true);toast(String(error));}
  }
  applyStartupPage();
 }catch(error){nativeReady=false;$('#mj-workspace').innerHTML=`<div class="mj-empty">${escape(tr('无法加载本地资料。原文件保留，请重新打开应用。'))}<p>${escape(String(error))}</p></div>`;}
}
function render(){if(typeof guardTemplateRender==='function'&&guardTemplateRender())return;if(typeof guardManualRender==='function'&&guardManualRender())return;syncDocumentMediaResources();root.classList.toggle('mj-template-workspace',state.view==='templates');if(state.view==='templates'){updateRecordResidency();renderNav();renderTemplateWorkspace();return;}const viewport=captureDocumentViewport();if(!state.search.trim()||!vaultUnlocked)clearNativeSearch();updateRecordResidency();if(state.view==='document'&&!selected())state.view='table';renderNativeBase();renderRefinements();$('.mj-appname').textContent='Kernpad';$('.mj-brand strong').textContent='Kernpad';$('.mj-brand small').textContent=tr('在本机保存便签与密码');$('.mj-local').innerHTML='<span></span>'+tr('资料保存在本机，无需云端账户');const lang=$('[data-native="language"]');if(lang)lang.textContent=locale==='zh'?'EN':'中文';polishMacOS();polishExperience();renderLayoutEditor();polishExamples();polishCredentialTools();polishEditorUX();if(typeof polishDocumentTemplates==='function')polishDocumentTemplates();localize();restoreDocumentViewport(viewport);saveStatus(lastSaveMessage,lastSaveError);refreshListPreviews();if(authPending)requestAnimationFrame(positionAuthentication);}
function purgePrivate(){
 if(typeof resetDocumentSaveIndicators==='function')resetDocumentSaveIndicators();
 const publicManual=typeof retainPublicManualDocument==='function'?retainPublicManualDocument():null;
 if(typeof clearManualState==='function')clearManualState();
 clearNativeSearch();
 clearRecordPreviews();
 clearRichState();
 records=records.filter(r=>!isProtected(r));trashedRecords=trashedRecords.filter(r=>!isProtected(r));templateManager={editing:false,family:null,context:'new',trash:false};resetTemplates();vaultUnlocked=false;pendingPrivateAction=null;
 privacyEpoch++;if(publicManual){manualDocument=publicManual;manualDocument.epoch=privacyEpoch;}detailEpoch++;deletedRecordIDs.clear();nativeInfo.session=null;nativeInfo.private=null;nativeInfo.unlocked=false;lastSaved='';fieldTarget=null;
 otpVersion++;blockCodeVersion++;otpValues.clear();blockCodes.clear();blockCodeStamp='';otpStep=-1;state.otp='';editorUndo=null;builder=null;importPreview=null;pasteEditor=null;entryDraft=null;entryPreview=null;
 richSelection=null;insertContext=null;markdownDraft='';state.search='';state.platformFilter='all';state.history=[];$('#mj-search').value='';closeModal();closeComponentMenu();
 if(state.area==='vault')state.view='table';render();
}
function lock(reason='密码库已锁定'){
 cancelInlineAuthentication();
 if(lockPromise)return lockPromise;
 if(!nativeReady||nativeLocked||!vaultUnlocked)return Promise.resolve();
 clearTimeout(saveTimer);const model=typeof manualLockSnapshot==='function'?manualLockSnapshot(snapshot()):snapshot();nativeLocked=true;purgePrivate();saveStatus('正在加密并锁定…');
 authResumeRequested=state.area==='vault';
 lockPromise=(async()=>{
  try{await saveChain.catch(()=>{});await nativeCall('saveLock',model);lastSaved=await snapshotDigest(snapshot());saveStatus('密码库已锁定');toast(reason);}
  catch(error){saveStatus('最后一次保存失败，请检查磁盘',true);toast(String(error));}
  finally{nativeLocked=false;nativeInfo.unlocked=false;nativeInfo.private=null;scheduleSave();}
 })().finally(()=>{lockPromise=null;resumeAuthenticationIfNeeded();});
 return lockPromise;
}
function checkLock(){
 if(!vaultUnlocked){$('#mj-lock-clock').textContent=tr('密码库已锁定');return;}
 const now=Date.now(),remaining=Math.ceil(Math.min(security.idle-(now-lastActivity)/1000,security.maximum?security.maximum-(now-unlockedAt)/1000:Infinity));
 if(remaining<=0){lock('已自动锁定密码库');return;}
 $('#mj-lock-clock').textContent=locale==='en'?`Locks in ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`:`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} 后锁定`;
}
function updateActivity(){if(!vaultUnlocked)return;lastActivity=Date.now();if(lastActivity-activityStamp>2000){activityStamp=lastActivity;nativeCall('activity').catch(()=>{});}}
function renderVaultGate(){
 root.classList.remove('mj-in-document','mj-document-edit');root.classList.add('mj-document-view');$('.mj-toolbar [data-v5="templates"]')?.remove();$('#mj-breadcrumb').textContent=tr('密码库');
 const title=!nativeInfo.exists?'创建密码库':'此密码库已锁定。';
 const windowsUnavailable=globalThis.kernpadPlatform==='windows'&&!nativeInfo.systemUnlockAvailable;
 const recoveryOnly=nativeInfo.exists&&nativeInfo.passwordless&&!nativeInfo.systemUnlockConfigured;
 const detail=authMessage||(windowsUnavailable?ui('Windows Hello 或 TPM 尚未就绪。请先在系统设置中配置；已有资料库可使用恢复密钥。','Windows Hello or TPM is not ready. Configure it in Windows Settings; an existing vault can use its recovery key.'):!nativeInfo.exists?'使用 Touch ID 创建密码库，无需设置资料库密码。':recoveryOnly?ui('尚未配置本机验证，请使用恢复密钥解锁。','System authentication is not configured. Unlock with your recovery key.'):'使用 Touch ID 或 Mac 登录密码查看此密码库。');
 const lockArt='<svg viewBox="0 0 112 140" aria-hidden="true"><path d="M31 70V39a25 25 0 0 1 50 0v31" fill="none" stroke="currentColor" stroke-width="11"/><rect x="12" y="64" width="88" height="75" rx="15" fill="currentColor" stroke="none"/></svg>';
 $('#mj-workspace').innerHTML=`<div class="mj-vault-gate mj-native-gate"><div class="mj-native-lock">${lockArt}<div id="mj-auth-slot" class="mj-auth-slot ${authPending?'auth-active':''}">${icon('fingerprint')}</div></div><h1>${escape(tr(title))}</h1><p aria-live="polite">${escape(tr(detail))}</p>${!recoveryOnly?`<button class="mj-button" data-native-auth="systemPassword">${escape(tr('使用密码…'))}</button>`:''}<div class="mj-auth-alternatives">${!authPending&&!recoveryOnly?`<button class="mj-link-button" data-native-auth="biometric">${escape(tr('重试 Touch ID'))}</button>`:''}${nativeInfo.exists?`<button class="${recoveryOnly?'mj-primary':'mj-link-button'}" data-native-auth="recovery">${escape(tr('使用恢复密钥'))}</button>`:''}</div></div>`;
}
async function positionAuthentication(){
 const slot=document.querySelector('#mj-overlay #mj-auth-slot')||document.querySelector('#mj-auth-slot');if(!slot)return;
 const r=slot.getBoundingClientRect();await nativeCall('authLayout',{x:r.x,y:r.y,width:r.width,height:r.height});
}
function cancelInlineAuthentication(){
 if(!authPending)return;authAttempt++;authPending=false;nativeBusy=false;pendingPrivateAction=null;authMessage='';nativeCall('cancelAuth').catch(()=>{});
}
function resumeAuthenticationIfNeeded(){
 if(!authResumeRequested)return;
 if(state.area!=='vault'||vaultUnlocked||state.view==='templates'||typeof templateDesign!=='undefined'&&templateDesign){authResumeRequested=false;return;}
 if(!$('#mj-overlay').hidden)return;
 if(appActive&&nativeReady&&!nativeBusy&&!nativeLocked){authResumeRequested=false;requestVaultUnlock();}
}
function authenticationCancelledByHost(message=''){
 authAttempt++;authPending=false;nativeBusy=false;pendingPrivateAction=null;
 authMessage=String(message||'');if(vaultUnlocked)purgePrivate();else if(state.area==='vault')render();
}
async function showAuthDemo(mode='biometric'){
 if(nativeBusy)return;nativeBusy=true;authPending=true;authMessage='';const attempt=++authAttempt;
 try{
  if(lockPromise)await lockPromise;
  await persist();
  if(attempt!==authAttempt)return;
  closeModal();changeArea('vault');
  // Reading the slot bounds forces layout; authentication must not depend on
  // animation frames, which WebKit can suspend during window/menu transitions.
  await positionAuthentication();
  const command=nativeInfo.exists?'unlock':'create';
  const info=await nativeCall(command,{mode});
  if(attempt!==authAttempt)return;
  if(info?.cancelled){pendingPrivateAction=null;authMessage='验证已取消，可重试 Touch ID 或使用恢复密钥。';return;}
  if(info?.requiresRecovery){pendingPrivateAction=null;authMessage='请先用恢复密钥解锁，再重新配置本机验证。';return;}
  acceptNative(info,command==='create');const pending=pendingPrivateAction;pendingPrivateAction=null;
  if(pending)pending();else changeArea('vault');render();scheduleSave();
 }catch(error){if(attempt===authAttempt){pendingPrivateAction=null;authMessage=String(error);toast(String(error));}}
 finally{if(attempt===authAttempt){authPending=false;nativeBusy=false;if(!vaultUnlocked&&state.area==='vault')render();resumeAuthenticationIfNeeded();}}
}
function requestVaultUnlock(action){if(vaultUnlocked){action?.();return;}pendingPrivateAction=action||null;showAuthDemo();}
function unlockDemo(){requestVaultUnlock();}
async function copyText(value){try{await nativeCall('copy',{text:String(value)});toast('已复制，30 秒后自动清除');}catch(error){toast(String(error));}}
function showSettings(){
 modal('设置与备份','所有资料留在此 Mac；备份文件由你选择保存位置。',`
 <label class="mj-setting"><span>语言 / Language</span><select data-native-setting="locale"><option value="zh" ${locale==='zh'?'selected':''}>简体中文</option><option value="en" ${locale==='en'?'selected':''}>English</option></select></label>
 <label class="mj-setting"><span>无操作后自动锁定</span><select data-native-setting="idle">${[[60,'1 分钟'],[300,'5 分钟'],[900,'15 分钟'],[1800,'30 分钟']].map(([v,n])=>`<option value="${v}" ${security.idle===v?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="mj-setting"><span>每次解锁的最长时长</span><select data-native-setting="maximum">${[[0,'不限制'],[900,'15 分钟'],[1800,'30 分钟'],[3600,'1 小时']].map(([v,n])=>`<option value="${v}" ${security.maximum===v?'selected':''}>${n}</option>`).join('')}</select></label>
 <label class="mj-setting"><span>转入后台时锁定</span><input type="checkbox" data-native-setting="background" ${security.background?'checked':''}></label>
 <div class="mj-setting"><span>锁屏、睡眠与退出<small>始终锁定密码库；普通便签继续可用。</small></span>${icon('lock-keyhole')}</div>
 <div class="mj-setting mj-auth-setting"><span>Touch ID / 系统验证<small>${!nativeInfo.exists?'点击密码库即可设置。':nativeInfo.passwordless&&nativeInfo.systemUnlockConfigured?'已启用，进入密码库即可使用指纹。':'解锁后可配置本机系统验证。'}</small></span>${nativeInfo.exists?`<button class="mj-button" data-native="system" ${!nativeInfo.systemUnlockAvailable?'disabled':''}>重新配置</button>`:''}</div>
 <div class="mj-setting"><span>恢复密钥<small>系统验证后查看；请单独保存，用于资料库和备份恢复。</small></span><button class="mj-button" data-native="recovery">查看</button></div>
 <div class="mj-setting"><span>加密备份<small>使用恢复密钥保护，无需另设备份密码。</small></span><button class="mj-button" data-native="backup">导出备份</button></div>
 <div class="mj-setting"><span>跨设备迁移<small>恢复为新的本地资料库，原资料库保留。</small></span><button class="mj-button" data-native="import">导入备份</button></div>
 <div class="mj-setting"><span>本地资料库</span><button class="mj-button" data-native="switch">切换资料库</button></div>
 <p class="mj-parser-hint">普通便签免解锁、明文保存在此 Mac。密码记录、模板默认值与正文使用 AES-256-GCM 加密；模板名称、字段和粘贴规则在本机明文保存。</p>
 `,`<button class="mj-primary" data-action="close-modal">完成</button>`);localize();
}
function showBackupDesign(){showSettings();}
async function nativeAction(action){
 if(['switch','import','recovery','system'].includes(action)&&typeof confirmManualNavigation==='function'&&!await confirmManualNavigation())return;
 if(action==='language'){cancelInlineAuthentication();locale=locale==='zh'?'en':'zh';await nativeCall('settings',{locale});nativeInfo.settings.locale=locale;closeModal();render();return;}
 if(nativeBusy)return;
 if(['backup','recovery','system'].includes(action)&&!vaultUnlocked){requestVaultUnlock(()=>action==='system'?showSettings():nativeAction(action));return;}
 nativeBusy=true;prepareActionAuthentication(action);
 const presentation=typeof modalRevision==='number'?modalRevision:0;let actionStarted=false;
 try{
  await persist();
  await positionAuthentication();
  actionStarted=true;
  const info=await nativeCall(action,{});
  if(info?.cancelled){if(info.locked&&vaultUnlocked)purgePrivate();return;}
  const samePresentation=presentation===(typeof modalRevision==='number'?modalRevision:0);
  // Authentication/profile changes must be adopted even when the user closed
  // Settings while the native operation was pending.
  if(info?.notes){if(['switch','import'].includes(action)){closeModal();state.view='table';state.area='vault';state.category='all';acceptNative(info,true);}else{acceptNative(info);if(samePresentation){closeModal();showSettings();}}}
 }catch(error){if(actionStarted&&['switch','recovery','system','import'].includes(action)){purgePrivate();acceptNative(await nativeCall('bootstrap'),true);}toast(String(error));}
 finally{document.querySelectorAll('.mj-setting-auth-prompt').forEach(view=>view.remove());nativeBusy=false;if(action==='switch'&&state.area==='vault'&&!vaultUnlocked)authResumeRequested=true;resumeAuthenticationIfNeeded();}
}
window.addEventListener('click',e=>{
 const back=e.target.closest('[data-action="back"]');if(back&&state.history.length&&nativeInfo.recordProtocol){e.preventDefault();e.stopImmediatePropagation();const id=state.history.pop();if(record(id)?._sealed)openSealedRecord(id,false,[...state.history]);else openRecord(id);return;}
 const auth=e.target.closest('[data-native-auth]');if(auth){e.preventDefault();e.stopImmediatePropagation();cancelInlineAuthentication();showAuthDemo(auth.dataset.nativeAuth);return;}
 const area=e.target.closest('[data-v5="area"]');if(area){if(area.dataset.area==='vault'){e.preventDefault();e.stopImmediatePropagation();if(authPending)return;changeArea('vault');if(!vaultUnlocked)requestVaultUnlock();return;}cancelInlineAuthentication();authResumeRequested=false;}
 if(authPending&&e.target.closest('[data-action="settings"],[data-v5="templates"],[data-action="templates"],[data-action="back"],[data-open]'))cancelInlineAuthentication();
 const b=e.target.closest('[data-native]');if(b){e.preventDefault();e.stopImmediatePropagation();nativeAction(b.dataset.native);return;}
 const a=e.target.closest('a[href]');if(a){e.preventDefault();e.stopImmediatePropagation();const url=safeURL(a.getAttribute('href'));if(url)nativeCall('openURL',{url}).catch(error=>toast(String(error)));return;}
},true);
root.addEventListener('change',async e=>{
 const key=e.target.dataset.nativeSetting;if(!key)return;
 const value=key==='background'?e.target.checked:['locale','startupPage'].includes(key)?e.target.value:Number(e.target.value);
 try{await nativeCall('settings',{[key]:value});nativeInfo.settings[key]=value;if(key==='locale'){locale=value;const notice=$('#mj-toast');if(notice)notice.hidden=true;render();showSettings();}else security[key]=value;}
 catch(error){toast(String(error));}
});
['input','change','click','keydown','focusout'].forEach(name=>root.addEventListener(name,()=>queueMicrotask(scheduleSave),true));
window.nativeApp={lock,flush:persist,newNote:()=>{cancelInlineAuthentication();createPlainNote();},action:nativeAction,ready:()=>nativeReady,authenticationCancelled:authenticationCancelledByHost,setApplicationActive:active=>{appActive=active;root.classList.toggle('mj-window-inactive',!active);if(active){authResumeRequested=true;resumeAuthenticationIfNeeded();}}};
new ResizeObserver(()=>{if(authPending)positionAuthentication().catch(()=>{});}).observe(root);
// The native host owns session locking too; browser timers are only the visible countdown.
boot();
