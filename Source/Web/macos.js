let modalReturnFocus=null,modalRevision=0,modalLayoutRevision=0,settingsPane='general';
root.addEventListener('pointerdown',event=>{if(event.target.closest('.mj-modal'))modalLayoutRevision++;},true);
root.addEventListener('wheel',event=>{if(event.target.closest('.mj-modal'))modalLayoutRevision++;},{capture:true,passive:true});
function polishMacOS(){
 const toolbar=$('.mj-toolbar'),chrome=$('.mj-chrome');
 if(!toolbar.querySelector('.mj-toolbar-security')){
  const controls=document.createElement('div');controls.className='mj-toolbar-security';
  const clock=$('#mj-lock-clock'),lockButton=chrome.querySelector('[data-action="lock"]');
  if(clock)controls.append(clock);if(lockButton)controls.append(lockButton);toolbar.append(controls);
 }
 const lockButton=toolbar.querySelector('[data-action="lock"]');
 if(lockButton){lockButton.disabled=!vaultUnlocked;lockButton.title=ui('锁定密码库','Lock Vault')+' ('+shortcutLabel(currentShortcuts().lock)+')';}
 const back=toolbar.querySelector('[data-action="back"]');if(back){back.hidden=state.view!=='document'&&!state.search;const label=state.history.length?ui('返回上一条记录','Back to Previous Record'):ui('返回总览','Back to List');back.setAttribute('aria-label',label);back.title=label;}
 const newButton=toolbar.querySelector('[data-action="new"]');
 if(newButton){newButton.innerHTML=icon('plus')+tr('新建');newButton.disabled=state.area==='vault'&&!vaultUnlocked;newButton.title=ui('新建','New')+' ('+shortcutLabel(currentShortcuts().new)+')';}
 const settingsButton=$('[data-action="settings"] span');if(settingsButton)settingsButton.textContent=tr('设置');
 const templatesButton=$('[data-action="templates"] span');if(templatesButton)templatesButton.textContent=tr('模板');
 const shortcut=$('.mj-search kbd');if(shortcut)shortcut.textContent=shortcutLabel(currentShortcuts().find);
 const documentBack=$('.mj-docbar [data-action="table"]');if(documentBack)documentBack.hidden=true;
 const viewLabel=$('.mj-view-label');if(viewLabel)viewLabel.hidden=true;
 const editButton=$('[data-v4="edit"]');if(editButton)editButton.innerHTML=icon('square-pen')+ui('编辑','Edit');
 const doneButton=$('[data-v4="view"]');if(doneButton)doneButton.innerHTML=icon('check')+tr('完成');
 if(state.view==='document'&&selected()){
  const r=selected(),inspector=$('.mj-inspector'),sections=inspector?[...inspector.children]:[];
  const tag=$('.mj-document-kind .mj-chip');if(tag&&['新记录','New record','未分类','Uncategorized'].includes(tag.textContent.trim()))tag.remove();
  if(!linksOf(r).length)sections[0]?.remove();
  if(!records.some(other=>other.id!==r.id&&other.refs.includes(r.id)))sections[2]?.remove();
  inspector?.querySelector('.mj-docmeta')?.remove();
  if(!isEditing()&&!r.refs.length&&!inspector?.querySelector('a,.mj-related')){inspector?.remove();const body=$('.mj-docbody');if(body)body.style.gridTemplateColumns='1fr';}
 }
 icons();
}
function closeModal(cancelPending=false){
 if(typeof cancelManualPrompt==='function')cancelManualPrompt();
 const restorePDF=typeof clearPDFPreview==='function'?clearPDFPreview():null;
 templateFieldDraft=null;
 const overlay=$('#mj-overlay');entryDraft=null;entryPreview=null;builder=null;if(overlay.hidden)return;
 if(cancelPending&&nativeBusy){cancelInlineAuthentication();nativeCall('cancelAuth').then(info=>{if(info?.locked&&vaultUnlocked)purgePrivate();}).catch(()=>{});}
 modalRevision++;state.modal='';overlay.hidden=true;overlay.replaceChildren();delete overlay.dataset.presenting;
 entryDraft=null;entryPreview=null;builder=null;root.querySelector('.mj-window').style.minHeight='';
 $('.mj-shell').inert=false;$('.mj-status').inert=false;
 const previous=modalReturnFocus;modalReturnFocus=null;if(previous?.isConnected)previous.focus({preventScroll:true});
 restorePDF?.();
 if(cancelPending&&state.area==='vault'&&!vaultUnlocked){render();authResumeRequested=true;queueMicrotask(resumeAuthenticationIfNeeded);}
}
function modal(title,subtitle,content,footer=''){
 const layoutRevision=++modalLayoutRevision;
 if(authPending&&!vaultUnlocked)cancelInlineAuthentication();
 const overlay=$('#mj-overlay'),opening=overlay.hidden,previousModal=overlay.querySelector('.mj-modal'),sameDialog=!opening&&previousModal?.dataset.dialogKey===title,modalTop=(previousModal?.querySelector('.mj-template-settings-body')||previousModal)?.scrollTop||0,focusState=sameDialog?captureEditorFocus(document.activeElement):null;
 if(!sameDialog&&previousModal?.classList.contains('mj-pdf-modal')){clearPDFPreview();previousModal.classList.remove('mj-pdf-modal');}
 if(opening)modalReturnFocus=document.activeElement;
 const markup=`<section class="mj-modal" role="dialog" aria-modal="true" aria-labelledby="mj-dialog-title" ${subtitle?'aria-describedby="mj-dialog-description"':''}><div class="mj-modal-head"><h2 id="mj-dialog-title">${escape(title)}</h2><button class="mj-icon" data-action="close-modal" aria-label="${escape(tr('关闭'))}" title="${escape(tr('关闭'))}">${icon('x')}</button></div>${subtitle?`<div class="mj-modal-sub" id="mj-dialog-description">${subtitle}</div>`:''}${content}${footer?`<div class="mj-modal-footer">${footer}</div>`:''}</section>`;
 if(sameDialog){
  // Keep the scroll container itself alive. Replacing it makes WebKit's native
  // focus/selection cleanup scroll to the top after the JavaScript handler ends.
  // Relocate focus before removing its node: older WebKit otherwise performs a
  // delayed scroll-to-top when a focused final template row disappears.
  if(previousModal.contains(document.activeElement)){previousModal.tabIndex=-1;previousModal.focus({preventScroll:true});}
  const template=document.createElement('template');template.innerHTML=markup;
  const fresh=template.content.firstElementChild;previousModal.replaceChildren(...fresh.childNodes);
  if(subtitle)previousModal.setAttribute('aria-describedby','mj-dialog-description');else previousModal.removeAttribute('aria-describedby');
 }else overlay.innerHTML=markup;
 overlay.querySelector('.mj-modal').dataset.dialogKey=title;
 overlay.hidden=false;overlay.dataset.presenting=String(opening);$('.mj-shell').inert=true;$('.mj-status').inert=true;
 icons();
 queueMicrotask(()=>{
  if(layoutRevision!==modalLayoutRevision)return;
  const field=overlay.querySelector('input:not([type=checkbox]),textarea,select');
  const primary=overlay.querySelector('.mj-modal-footer .mj-primary:not(.mj-danger)');
  const focus=sameDialog?findEditorFocus(overlay,focusState):null;
  (focus||(!sameDialog&&(field||primary||overlay.querySelector('button'))))?.focus({preventScroll:true});
  if(sameDialog){
   const dialog=overlay.querySelector('.mj-modal'),restore=()=>{if(layoutRevision===modalLayoutRevision&&dialog.isConnected&&!overlay.hidden)(dialog.querySelector('.mj-template-settings-body')||dialog).scrollTop=modalTop;};
   restore();restoreEditorCaret(focus,focusState);requestAnimationFrame(restore);
  }
 });
}
function showSettings(pane=settingsPane){
 settingsPane=pane;state.modal='settings';let content='';
 if(pane==='general')content=`
  <label class="mj-setting"><span>${tr('语言')}</span><select data-native-setting="locale"><option value="zh" ${locale==='zh'?'selected':''}>简体中文</option><option value="en" ${locale==='en'?'selected':''}>English</option></select></label>
  <label class="mj-setting"><span>${ui('启动时打开','Open on launch')}<small>${ui('下次启动生效；密码库仍需正常解锁。','Applies on the next launch. The vault still requires authentication.')}</small></span><select data-native-setting="startupPage"><option value="notes" ${nativeInfo.settings?.startupPage!=='vault'?'selected':''}>${ui('便签','Notes')}</option><option value="vault" ${nativeInfo.settings?.startupPage==='vault'?'selected':''}>${ui('密码库','Vault')}</option></select></label>
  ${defaultTemplateSettings()}
  ${temporaryDefaultSettings()}
  <label class="mj-setting"><span>${ui('自动保存文档','Auto-save documents')}<small>${ui('开启时静默保存，失败时提示重试。关闭后使用保存按钮或 ','When on, saving is quiet; failures show a retry action. When off, use Save or ')}${escape(shortcutLabel(currentShortcuts().save))}${ui('；离开时询问保存。安全锁定会暂存草稿，密码库草稿保持加密。','. Leaving asks you to save. Security locking preserves drafts; vault drafts remain encrypted.')}</small></span><input type="checkbox" data-auto-save ${nativeInfo.settings?.autoSave!==false?'checked':''}></label>
  <label class="mj-setting"><span>${tr('无操作后锁定')}<small>${ui('从最近一次应用内操作开始计时，打开便签不会立即锁定。','Measured from your last interaction in the app. Opening a note does not lock the vault.')}</small></span><select data-native-setting="idle">${[[60,'1 分钟'],[300,'5 分钟'],[900,'15 分钟'],[1800,'30 分钟']].map(([v,n])=>`<option value="${v}" ${security.idle===v?'selected':''}>${tr(n)}</option>`).join('')}</select></label>
  <label class="mj-setting"><span>${tr('最长解锁时间')}</span><select data-native-setting="maximum">${[[0,'不限制'],[900,'15 分钟'],[1800,'30 分钟'],[3600,'1 小时']].map(([v,n])=>`<option value="${v}" ${security.maximum===v?'selected':''}>${tr(n)}</option>`).join('')}</select></label>
  <label class="mj-setting"><span>${tr('切到其他应用时锁定')}</span><input type="checkbox" data-native-setting="background" ${security.background?'checked':''}></label>
  <p class="mj-settings-note">${tr('锁屏、睡眠和退出时始终锁定密码库。')}</p>`;
 if(pane==='security')content=`
  <div class="mj-setting"><span>Touch ID<small>${tr(!nativeInfo.exists?'点击密码库即可设置。':nativeInfo.passwordless&&nativeInfo.systemUnlockConfigured?'进入密码库即可使用指纹解锁。':'解锁后可设置本机验证。')}</small></span>${nativeInfo.exists?`<button class="mj-button" data-native="system" ${!nativeInfo.systemUnlockAvailable?'disabled':''}>${tr('重新设置…')}</button>`:''}</div>
  <div class="mj-setting"><span>${tr('恢复密钥')}<small>${tr('Mac 丢失或重置后，用它恢复资料库和备份。')}</small></span><button class="mj-button" data-native="recovery">${tr('查看…')}</button></div>
  <p class="mj-settings-note">${tr('普通便签未加密。私密内容请存入密码库。')}</p>`;
 if(pane==='backup')content=`
  <div class="mj-setting"><span>${tr('导出备份')}<small>${ui('保存便签、密码记录和模板。本机原库可用系统验证恢复，跨设备使用恢复密钥。','Save notes, vault records and templates. Restore with system authentication while the original library is on this device, or use its recovery key on another device.')}</small></span><button class="mj-button" data-native="backup">${tr('导出…')}</button></div>
  <div class="mj-setting"><span>${tr('导入备份')}<small>${tr('恢复为新资料库，保留现有资料。')}</small></span><button class="mj-button" data-native="import">${tr('导入…')}</button></div>
  <div class="mj-setting"><span>${tr('本地资料库')}</span><button class="mj-button" data-native="switch">${tr('切换…')}</button></div>`;
 if(pane==='shortcuts')content=shortcutSettingsContent();
 const tabs=`<div class="mj-settings-tabs" role="tablist" aria-label="${escape(tr('设置'))}">${[['general','通用'],['security','安全'],['backup','备份'],['shortcuts','快捷键']].map(([id,label])=>`<button role="tab" data-macos-pane="${id}" aria-selected="${pane===id}" class="${pane===id?'active':''}">${tr(label)}</button>`).join('')}</div>`;
 modal(tr('设置'),'',tabs+`<div class="mj-settings-content" role="tabpanel">${content}</div>`,pane==='shortcuts'?`<button class="mj-button" data-shortcut-defaults>${ui('恢复默认','Restore Defaults')}</button><span class="mj-spacer"></span><button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-shortcut-save>${ui('保存并完成','Save & Done')}</button>`:`<button class="mj-primary" data-action="close-modal">${tr('完成')}</button>`);$('.mj-modal').classList.add('mj-settings-modal');localize();
}
function prepareActionAuthentication(action){
 if(!['system','recovery','import'].includes(action))return;
 showSettings(action==='import'?'backup':'security');
 const row=document.querySelector(`[data-native="${action}"]`)?.closest('.mj-setting');if(!row)return;
 row.insertAdjacentHTML('afterend',`<div class="mj-setting-auth-prompt"><div id="mj-auth-slot" class="mj-auth-slot auth-active"></div><span role="status">${ui(action==='import'?'选择备份。本机原库可用系统验证恢复，其他设备使用恢复密钥。':'请使用 Touch ID 验证身份。',action==='import'?'Choose a backup. Use system authentication for this device’s original library, or its recovery key on another device.':'Use Touch ID to verify your identity.')}</span></div>`);
}
function focusSearch(){closeModal(true);const input=$('#mj-search');input.focus();input.select();}
function newMacRecord(){cancelInlineAuthentication();closeModal(true);if(state.area==='vault'){requestVaultUnlock(()=>showNewChooser());}else createPlainNote();}
window.addEventListener('click',event=>{
 const tab=event.target.closest('[data-macos-pane]');if(tab){event.preventDefault();event.stopImmediatePropagation();if(!nativeBusy)showSettings(tab.dataset.macosPane);return;}
 const close=event.target.closest('[data-action="close-modal"]');if(close){event.preventDefault();event.stopImmediatePropagation();closeModal(true);return;}
 if(event.target===$('#mj-overlay')){event.preventDefault();event.stopImmediatePropagation();}
},true);
window.addEventListener('keydown',event=>{
 const overlay=$('#mj-overlay');if(overlay.hidden)return;
 const selectedTab=event.target.closest('[role=tab]');
 if(selectedTab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
  event.preventDefault();event.stopImmediatePropagation();if(nativeBusy)return;
  const panes=['general','security','backup','shortcuts'],index=panes.indexOf(settingsPane);
  const next=event.key==='Home'?0:event.key==='End'?panes.length-1:(index+(event.key==='ArrowRight'?1:panes.length-1))%panes.length;
  showSettings(panes[next]);requestAnimationFrame(()=>document.querySelector(`[data-macos-pane="${panes[next]}"]`)?.focus());return;
 }
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeModal(true);return;}
 if(event.key==='Enter'&&!event.isComposing&&event.target.matches('[data-temporary-default-value]')){event.preventDefault();event.stopImmediatePropagation();saveTemporaryDefault(event.target);return;}
 if(event.key==='Tab'){
  const items=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!items.length)return;const first=items[0],last=items.at(-1);
  if(event.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
 }
 if(event.key==='Enter'&&!event.isComposing&&!event.metaKey&&!event.ctrlKey&&!event.target.closest('textarea,[contenteditable=true],button,select')){
  const action=overlay.querySelector('.mj-modal-footer .mj-primary:not(.mj-danger):not(:disabled)');
  if(action){event.preventDefault();event.stopImmediatePropagation();action.click();}
 }
},true);
Object.assign(window.nativeApp,{showSettings,focusSearch,newNote:newMacRecord,navigate:area=>{cancelInlineAuthentication();closeModal(true);changeArea(area);if(area==='vault'&&!vaultUnlocked)requestVaultUnlock();}});
