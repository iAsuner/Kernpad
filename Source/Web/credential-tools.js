// Visible entry points for the existing bounded, quoted-delimiter importer.
let pastePreviewTimer=null;
async function addCredentialExamples(){
 if(!vaultUnlocked)return;const epoch=privacyEpoch,session=nativeInfo.session;await persist();if(!vaultUnlocked||epoch!==privacyEpoch||session!==nativeInfo.session)return;
 const zh=locale!=='en',t=(a,b)=>zh?a:b,templateID='example-workspace';
 const defs=[{key:'account',label:t('登录账号','Account'),kind:'text'},{key:'password',label:t('登录密码','Password'),kind:'secret'},{key:'custom.project_id',label:t('项目编号','Project ID'),kind:'text'},{key:'url',label:t('登录地址','Sign-in URL'),kind:'url',shortcut:t('打开入口','Open URL')},{key:'email.account',label:t('关联邮箱','Linked email'),kind:'email'},{key:'email.password',label:t('邮箱密码','Email password'),kind:'secret'}];
 if(!customTemplates[templateID])customTemplates[templateID]={id:templateID,name:t('工作空间账号示例模板','Example workspace account template'),builtin:false,userConfigured:true,family:'account',group:'social',pattern:'{$account}----{$password}----{$custom.project_id}----{$email.account}',fields:defs,relations:['email'],blocks:[{type:'text',text:t('合成示例，不能用于登录真实服务。通过“模板设置”修改分隔符及字段对应关系；通过“添加预设字段”保存自己的常用字段。','Synthetic example, never use for a real service. Use Template Settings to change the delimiter and mapping; Add preset fields saves reusable fields.')} ]};
 types[templateID]={name:customTemplates[templateID].name,group:'social',icon:'contact',hint:t('自定义分隔符与预设字段','Custom delimiter and preset fields')};
 const email=schemaRecord(getTemplate('email'),{account:'studio@example.invalid',password:'Example-Mail-Only!'},{id:'example-private-email',name:t('创作邮箱合成示例','Synthetic studio email')});
 const account=schemaRecord(customTemplates[templateID],{account:'creator@example.invalid',password:'Example-Only-Do-Not-Use!','custom.project_id':'STUDIO-1042',url:'https://example.invalid/studio'},{id:'example-private-workspace',name:t('创作工作空间合成示例','Synthetic creative workspace'),refs:[email.id]});
 account.platform='github';account.totp=true;account.otpSecret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const platformID='platform-example-studio';if(!customPlatforms[platformID])customPlatforms[platformID]=normalizedPlatformDraft({name:'Example Studio Cloud',url:'https://example.invalid/cloud',family:'server'},platformID);
 const server=schemaRecord(getTemplate('server'),{host:'192.0.2.10',account:'demo',password:'Example-Server-Only!',port:'22'},{id:'example-private-server',name:t('创作服务器合成示例','Synthetic studio server'),refs:[email.id]});server.platform=platformID;
 const existing=new Set([...records,...trashedRecords].map(r=>r.id));for(const r of [email,account,server])if(!existing.has(r.id))records.push(r);
 await persist();if(!vaultUnlocked||epoch!==privacyEpoch||session!==nativeInfo.session)return;
 // The first save creates records without granting an editing lease. Reopen the
 // committed entry through the native single-record path before showing it.
 clearRecordCaches();records=records.map(r=>isProtected(r)?sealedSummary(r):r);trashedRecords=trashedRecords.map(r=>isProtected(r)?sealedSummary(r):r);
 state.area='vault';state.category='all';closeModal();if(record(account.id))await openSealedRecord(account.id);else{state.view='table';render();}
}
function openQuickPaste(){
 const r=selected();if(!r||isProtected(r)&&!vaultUnlocked||!isProtected(r)&&!r.templateID)return;
 docMode='edit';render();pasteEditor={recordId:r.id,text:'',preview:null};renderEditorPaste();
 $('#mj-editor-paste-text').focus();polishPastePanel();
}
function polishPastePanel(){
 const panel=$('#mj-editor-paste');if(!panel)return;
 panel.querySelector('[data-v4="configure-current"]').textContent=ui('配置分隔符与字段','Configure delimiter & fields');
 const note=panel.querySelector('.mj-paste-note');if(note)note.textContent=ui('粘贴后自动识别，确认后填入；未指定的字段保留原值。','Pasting previews automatically. Confirm to fill; unspecified fields stay unchanged.');
}
function showCurrentRecordTemplate(){
 const r=selected();if(!r||isProtected(r)&&!vaultUnlocked||!isProtected(r)&&!r.templateID)return;
 templateManager={editing:false,family:null,context:'record',trash:false};showBuilder(r.templateID||r.type);
}
// The Quick Paste entry and the toolbar must use the same return context.
window.addEventListener('click',event=>{if(!event.target.closest('[data-v4="configure-current"]'))return;event.preventDefault();event.stopImmediatePropagation();showCurrentRecordTemplate();},true);
function polishCredentialTools(){
 if(state.view==='document'&&selected()&&isEditing())document.querySelector('.mj-properties')?.querySelectorAll(':scope > .mj-property > label').forEach((label,index)=>{const field=selected().fields[index];if(field)label.insertAdjacentHTML('afterend',`<button class="mj-icon mj-field-rename" data-field-rename="${index}" aria-label="${escape(ui('修改 '+field.label+' 的字段名称','Rename '+field.label))}">${icon('square-pen')}</button>`);});
 if(state.area==='vault'&&state.view==='table'&&vaultUnlocked&&state.category==='all'&&!state.search){$('.mj-pagehead')?.insertAdjacentHTML('beforeend',`<button class="mj-button" data-credential-examples>${icon('book-open')}${ui('体验示例账号','Try Example Accounts')}</button>`);return;}
 const r=selected();if(state.view!=='document'||!r||isProtected(r)&&!vaultUnlocked||!isProtected(r)&&!r.templateID)return;
 const bar=$('.mj-docbar'),paste=bar?.querySelector('[data-v4="paste-entry"]');
 if(paste){paste.innerHTML=icon('clipboard-paste')+ui('快捷粘贴','Quick Paste');paste.title=ui('按模板分隔符识别账号、密码及自定义字段','Parse account, password and custom fields using this template');}
 else bar?.querySelector('.mj-spacer')?.insertAdjacentHTML('afterend',`<button class="mj-button" data-credential-paste>${icon('clipboard-paste')}${ui('快捷粘贴','Quick Paste')}</button>`);
 bar?.querySelector('.mj-spacer')?.insertAdjacentHTML('afterend',`<button class="mj-button" data-credential-template>${icon('sliders-horizontal')}${ui('模板设置','Template Settings')}</button>`);
 polishPastePanel();
}
function importRuleDesigner(){
 if(!builder)return;const wasExpanded=$('.mj-rule-editor')?.open;for(const input of $$('[data-template-include]'))input.checked=builder.pattern.includes('{$'+builder.fields[Number(input.dataset.templateInclude)]?.key+'}');$('#mj-rule-designer')?.remove();const input=$('#mj-pattern');if(!input)return;
 let spec;try{spec=parsePattern(builder.pattern);}catch{return;}
 const options=builder.fields.filter(f=>!f.derived),presets=[['|','|'],[',',ui('逗号 ,','Comma ,')],['\t','Tab'],['----','----']],custom=!presets.some(([d])=>d===spec.delimiter);
 const box=document.createElement('section');box.id='mj-rule-designer';box.className='mj-rule-designer';
 box.innerHTML=`<details class="mj-rule-editor" ${(wasExpanded??spec.keys.length<=4)?'open':''}><summary>${ui('快捷粘贴列设置','Quick Paste columns')} <small>${spec.keys.length}</small></summary><label>${ui('分隔符','Delimiter')}<select data-rule-delimiter aria-label="${ui('分隔符','Delimiter')}">${presets.map(([d,label])=>`<option value="${escape(d)}" ${d===spec.delimiter?'selected':''}>${label}</option>`).join('')}<option value="custom" ${custom?'selected':''}>${ui('自定义','Custom')}</option></select><input data-rule-custom aria-label="${ui('自定义分隔符','Custom delimiter')}" value="${escape(custom?spec.delimiter:'')}" maxlength="12" placeholder="----" ${custom?'':'hidden'}></label><div class="mj-rule-columns">${spec.keys.map((key,index)=>`<div><span>${index+1}</span><select data-rule-key="${index}" aria-label="${escape(ui('第 '+(index+1)+' 列字段','Column '+(index+1)+' field'))}">${[...new Set([key,...options.map(f=>f.key)])].map(value=>`<option value="${escape(value)}" ${value===key?'selected':''}>${escape(tr(options.find(f=>f.key===value)?.label||value))} (${escape(value)})</option>`).join('')}</select><button class="mj-icon" data-rule-move="${index}" data-rule-direction="-1" aria-label="${ui('上移列','Move column up')}" ${index===0?'disabled':''}>${icon('arrow-up')}</button><button class="mj-icon" data-rule-move="${index}" data-rule-direction="1" aria-label="${ui('下移列','Move column down')}" ${index===spec.keys.length-1?'disabled':''}>${icon('arrow-down')}</button><button class="mj-icon mj-danger" data-rule-remove="${index}" aria-label="${ui('移除列','Remove column')}" ${spec.keys.length===1?'disabled':''}>${icon('minus')}</button></div>`).join('')}</div><button class="mj-button" data-rule-add>${icon('plus')}${ui('添加导入列','Add import column')}</button><p class="mj-settings-note">${ui('每行一条记录。值中包含分隔符时，用双引号包住整列；关联邮箱可选 email.account、email.password、email.totp。预览会遮挡密码与密钥，不会自动覆盖已有账号。','One record per line. Quote a whole column when it contains the delimiter. Use email.account, email.password and email.totp for linked email. Previews mask secrets and never silently overwrite an existing account.')}</p><p role="alert" id="mj-rule-error"></p></details>`;
 input.before(box);icons();
}
function applyRuleDraft(keys,delimiter){
 const pattern=keys.map(key=>'{$'+key+'}').join(delimiter);parsePattern(pattern);builder.pattern=pattern;$('#mj-pattern').value=pattern;importRuleDesigner();
}
function showPresetFieldCreator(){
 const r=selected();if(!r||isProtected(r)&&!vaultUnlocked||!isProtected(r)&&!r.templateID)return;
 modal(ui('自定义预设字段','Custom preset field'),ui('加入当前记录，并保存到这个模板；之后可重复添加或用于快捷粘贴。','Add it to this record and save it in this template for reuse and Quick Paste.'),`<label class="mj-field-label" for="mj-preset-label">${ui('显示名称','Display name')}</label><input id="mj-preset-label" class="mj-field-input" maxlength="80" placeholder="${ui('例如：客户编号','e.g. Customer ID')}"><label class="mj-field-label" for="mj-preset-key">${ui('字段标识','Field key')}</label><input id="mj-preset-key" class="mj-field-input mj-mono" value="custom.field_${crypto.randomUUID().slice(0,8)}" maxlength="80"><p class="mj-settings-note">${ui('快捷粘贴使用此标识，例如 {$custom.customer_id}；只含英文、数字、下划线与点。','Quick Paste uses this key, e.g. {$custom.customer_id}. Use letters, digits, underscores and dots.')}</p><label class="mj-field-label" for="mj-preset-kind">${ui('字段类型','Field type')}</label><select id="mj-preset-kind" class="mj-field-input">${fieldKinds.filter(([key])=>key!=='otp').map(([key,label])=>`<option value="${key}">${tr(label)}</option>`).join('')}</select><p role="alert" id="mj-preset-error"></p>`,`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-preset-create>${ui('添加并保存预设','Add & Save Preset')}</button>`);
}
root.addEventListener('click',async event=>{
 const button=event.target.closest('[data-credential-examples],[data-credential-paste],[data-credential-template],[data-record-template-save],[data-preset-new],[data-preset-create],[data-rule-add],[data-rule-remove],[data-rule-move]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  if(button.hasAttribute('data-credential-examples')){requestVaultUnlock(()=>addCredentialExamples().catch(error=>toast(String(error))));return;}
  if(button.hasAttribute('data-credential-paste')){openQuickPaste();return;}
  if(button.hasAttribute('data-credential-template')){showCurrentRecordTemplate();return;}
  if(button.hasAttribute('data-record-template-save')){
   const r=selected(),epoch=privacyEpoch,revision=modalRevision;if(!r||!vaultUnlocked||builder?.id!==r.type)return;
   saveTemplate(true);button.disabled=true;await persist();if(epoch!==privacyEpoch||revision!==modalRevision)return;
   if(pasteEditor)pasteEditor.preview=null;closeModal();render();if(pasteEditor?.text)previewEditorPaste();toast(ui('模板已保存，已有字段内容保持不变','Template saved. Existing field values are preserved.'));return;
  }
  if(button.hasAttribute('data-preset-new')){showPresetFieldCreator();return;}
  if(button.hasAttribute('data-preset-create')){
   const r=selected(),key=$('#mj-preset-key').value.trim(),label=$('#mj-preset-label').value.trim(),kind=$('#mj-preset-kind').value,t=recordTemplate(r);
   if(!vaultUnlocked||!isProtected(r)||!t)return;
   if(!label||label.length>80)throw new Error(ui('请填写字段名称','Enter a field name'));
   parsePattern('{$'+key+'}');if(key.length>80||key.startsWith('email.')||t.fields.some(f=>f.key===key)||r.fields.some(f=>f.key===key))throw new Error(ui('字段标识重复或被保留，请换一个标识','The field key is reserved or already used'));
   const field={key,label,kind,section:'自定义字段',required:false,...(kind==='url'?{shortcut:label}:{})},template={...structuredClone(t),userConfigured:true,fields:[...structuredClone(t.fields),field]};
   const epoch=privacyEpoch,revision=modalRevision;button.disabled=true;
   snapshotEditor();if(t.builtin)templateRegistry[t.id]=template;else customTemplates[t.id]=template;
   r.fields.push({...field,value:'',secret:kind==='secret'});await persist();if(epoch!==privacyEpoch||revision!==modalRevision)return;closeModal();docMode='edit';render();toast(ui('预设字段已保存，可在模板里配置导入列','Preset saved. Configure its import column in Template Settings.'));return;
  }
  const spec=parsePattern(builder.pattern),keys=[...spec.keys];
  if(button.hasAttribute('data-rule-add')){const next=builder.fields.find(f=>!f.derived&&!keys.includes(f.key));if(!next)throw new Error(ui('所有字段均已加入；先添加一个模板字段','All fields are included. Add a template field first.'));keys.push(next.key);}
  if(button.hasAttribute('data-rule-remove'))keys.splice(Number(button.dataset.ruleRemove),1);
  if(button.hasAttribute('data-rule-move')){const index=Number(button.dataset.ruleMove),to=index+Number(button.dataset.ruleDirection);if(to>=0&&to<keys.length)[keys[index],keys[to]]=[keys[to],keys[index]];}
  applyRuleDraft(keys,spec.delimiter);
 }catch(error){const target=$('#mj-template-error')||$('#mj-preset-error')||$('#mj-rule-error');if(target)target.textContent=String(error.message||error);else toast(String(error));button.disabled=false;}
},true);
root.addEventListener('change',event=>{
 const target=event.target;if(!target.matches('[data-rule-delimiter],[data-rule-custom],[data-rule-key]'))return;
 try{const spec=parsePattern(builder.pattern),keys=[...spec.keys];let delimiter=spec.delimiter;
  if(target.hasAttribute('data-rule-key'))keys[Number(target.dataset.ruleKey)]=target.value;
  else if(target.hasAttribute('data-rule-custom'))delimiter=target.value;
  else if(target.value==='custom'){$('[data-rule-custom]').hidden=false;$('[data-rule-custom]').focus();return;}else delimiter=target.value;
  applyRuleDraft(keys,delimiter);
 }catch(error){$('#mj-rule-error').textContent=String(error.message||error);}
},true);
root.addEventListener('input',event=>{
 if(event.target.id==='mj-pattern')queueMicrotask(importRuleDesigner);
 if(event.target.id!=='mj-editor-paste-text'||!pasteEditor)return;
 clearTimeout(pastePreviewTimer);const id=selected()?.id,epoch=privacyEpoch;
 pastePreviewTimer=setTimeout(()=>{if(epoch===privacyEpoch&&pasteEditor?.recordId===id&&state.selected===id&&isEditing()&&vaultUnlocked&&$('#mj-editor-paste-text')){previewEditorPaste();polishPastePanel();}},180);
},true);
