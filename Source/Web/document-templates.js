function defaultDocumentTemplate(area){
 const id=nativeInfo.settings?.[area==='notes'?'defaultNoteTemplate':'defaultVaultTemplate'];
 const t=id&&getTemplate(id);return t&&!t.archived&&templateArea(t)===area?t:null;
}
function defaultTemplateSettings(){
 return ['notes','vault'].map(area=>{const key=area==='notes'?'defaultNoteTemplate':'defaultVaultTemplate',current=nativeInfo.settings?.[key]||'';return `<label class="mj-setting"><span>${area==='notes'?ui('新便签默认模板','Default note template'):ui('新密码记录默认模板','Default vault template')}<small>${ui('只影响之后新建的内容。','Applies only to new documents.')}</small></span><select data-default-template="${key}"><option value="">${area==='notes'?ui('空白便签','Blank note'):ui('每次选择类型和平台','Choose type and platform each time')}</option>${allTemplates().filter(t=>templateArea(t)===area).map(t=>`<option value="${escape(t.id)}" ${t.id===current?'selected':''}>${escape(tr(templateName(t)))}</option>`).join('')}</select></label>`;}).join('');
}
const templateRenderBlocks=renderBlocks;
renderBlocks=function(r){ensureComponentIDs(r);return templateRenderBlocks(r);};
const templateRepaintBlocks=repaintBlocks;
repaintBlocks=function(...args){const result=templateRepaintBlocks(...args);if(templateDesign)polishDocumentTemplates();return result;};
const templateSnapshot=snapshot;
snapshot=function(){for(const r of [...records,...trashedRecords])if(!r._sealed)ensureComponentIDs(r);return templateSnapshot();};
function polishDocumentTemplates(){
 const r=selected();root.classList.toggle('mj-template-design',!!templateDesign);
 if(state.view!=='document'||!r)return;
 const bar=$('.mj-docbar');
 if(templateDesign){
  const kind=$('.mj-document-kind');if(kind)kind.textContent=templateDesign.template.documentTemplate.area==='notes'?ui('便签模板设计','Note template design'):ui('密码库模板设计','Vault template design');
  bar?.querySelector('[data-refine="delete-record"]')?.remove();
  for(const button of $$('[data-v4="configure-current"],[data-v5="templates"],[data-credential-template],[data-credential-paste],[data-v4="paste-entry"],[data-temporary-action]'))button.hidden=true;
  if(!$('[data-template-configure]'))bar?.querySelector('.mj-spacer')?.insertAdjacentHTML('beforebegin',`<button class="mj-button" data-template-configure>${icon('sliders-horizontal')}${ui('模板设置','Template Settings')}</button>`);
  if(!$('[data-template-exit]'))bar?.insertAdjacentHTML('afterbegin',`<button class="mj-button" data-template-exit>${icon('arrow-left')}${ui('结束设计','Finish designing')}</button>`);
  for(const input of $$('[data-field],[data-form-value],[data-component-seed]'))if(input.tagName==='INPUT'||input.tagName==='TEXTAREA'){input.value='';input.disabled=true;input.placeholder=ui('模板中不保存凭据','Credentials are cleared in templates');}
 }else if(!$('[data-save-as-template]'))bar?.querySelector('.mj-spacer')?.insertAdjacentHTML('beforebegin',`<button class="mj-button" data-save-as-template>${icon('layout-template')}${ui('存为模板','Save as Template')}</button>`);
 icons();
}
function showSaveAsTemplate(){
 const r=selected();if(!r||r._sealed)return;
 try{builder=templateFromDocument(r);templateManager={editing:true,context:'document-template',family:null,trash:false};renderBuilder();}catch(error){toast(String(error.message||error));}
}
const documentTemplateBuilder=renderBuilder;
function containTemplateSettings(){
 const dialog=$('.mj-modal');dialog.classList.add('mj-template-settings-modal');
 const body=document.createElement('div');body.className='mj-template-settings-body';
 for(const node of [...dialog.children])if(!node.matches('.mj-modal-head,.mj-modal-footer'))body.append(node);
 dialog.querySelector('.mj-modal-footer').before(body);
}
renderBuilder=function(){
 documentTemplateBuilder();if(!builder)return;
 $('#mj-tname').value=tr(templateName(builder));
 $('.mj-modal-head h2').textContent=ui('模板设置','Template Settings');
 renderTemplateListSettings();
 if(!builder.documentTemplate){containTemplateSettings();return;}
 const draft=builder;
 $('.mj-modal').classList.add('mj-document-template-builder');
 $('.mj-modal-head h2').textContent=ui('模板设置','Template Settings');
 const description=$('#mj-dialog-description');if(description)description.textContent=ui('保留排版和普通文字，清空凭据。请在保存前检查示例内容；模板在本机明文保存。','Keeps layout and ordinary text, and clears credentials. Review sample content before saving; templates are stored locally as plain text.');
 $('.mj-builder-grid').insertAdjacentHTML('afterend',`<div class="mj-template-design-actions"><label>${ui('所属板块','Destination')} <select data-template-area><option value="notes" ${draft.documentTemplate.area==='notes'?'selected':''}>${ui('便签','Notes')}</option><option value="vault" ${draft.documentTemplate.area==='vault'?'selected':''}>${ui('密码库','Vault')}</option></select></label><button class="mj-button" data-template-layout>${icon('panels-top-left')}${ui('编辑模板排版','Edit template layout')}</button><span>${ui('勾选需要快捷粘贴的字段；字段名和导入标识可直接修改。','Select fields for Quick Paste. Edit names and import keys in place.')}</span></div>`);
 const keys=new Set(draft.pattern?parsePattern(draft.pattern).keys:[]);
 $('.mj-field-table thead tr').insertAdjacentHTML('afterbegin',`<th>${ui('导入','Import')}</th>`);
 $$('.mj-field-table tbody tr').forEach((row,i)=>{row.insertAdjacentHTML('afterbegin',`<td><input type="checkbox" data-template-include="${i}" ${keys.has(draft.fields[i].key)?'checked':''} aria-label="${escape(ui('快捷粘贴包含 ','Include in Quick Paste: ')+draft.fields[i].label)}"></td>`);});
 $('.mj-modal-footer').innerHTML=`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><span class="mj-spacer"></span><button class="mj-primary" data-template-publish>${ui('保存模板','Save template')}</button>`;
 containTemplateSettings();icons();
};
function showBlankTemplate(){
 const r={id:'template-draft-'+crypto.randomUUID(),type:'note',name:ui('自定义模板','Custom template'),summary:'',fields:[],blocks:[{type:'text',text:''}],refs:[],links:[],documentOptions:{title:false,summary:false}};
 const t=templateFromDocument(r);t.documentTemplate.area=state.area==='vault'?'vault':'notes';t.family=t.documentTemplate.area==='vault'?'account':'note';startTemplateDesign(t);
}
function templateDraftRecord(t){
 const r=schemaRecord(t,{},{name:t.name});r.id='template-draft-'+crypto.randomUUID();r.type='note';r.protected=false;return r;
}
async function startTemplateDesign(t){
 if(!templateDesign&&!await confirmManualNavigation())return;
 const prior=templateDesign?.returnState||structuredClone(state),mode=templateDesign?.returnMode||docMode;
 closeModal();clearManualState();
 const copy=structuredClone(t),r=templateDraftRecord(copy);templateDesign={template:copy,record:r,returnState:prior,returnMode:mode,view:null,baseline:null,prompt:null};
 state.view='document';state.selected=r.id;state.search='';$('#mj-search').value='';state.area='notes';docMode='edit';
 templateDesign.view=structuredClone(state);templateDesign.baseline=templateDesignDigest();clearEditorHistory();render();
}
function templateDesignDigest(){return [manualValues(templateDesign.record),cloneDocumentValue(templateDesign.template)];}
function currentDesignedTemplate(){
 const t=templateFromDocument(templateDesign.record,templateDesign.template);t.name=templateDesign.record.name;t.documentTemplate.area=templateDesign.template.documentTemplate.area;return t;
}
function configureDesignedTemplate(){
 builder=currentDesignedTemplate();templateManager={editing:true,context:'document-template',family:null,trash:false};renderBuilder();
}
function syncTemplateDesignControl(){
 const button=$('[data-document-save]');if(!button)return;
 const saved=!!customTemplates[templateDesign.template.id]&&equalDocumentValues(templateDesignDigest(),templateDesign.baseline);
 const status=$('#mj-status-text');if(status){status.hidden=false;status.textContent=ui(saved?'模板已保存':'模板设计尚未保存',saved?'Template saved':'Template design has unsaved changes');}button.hidden=false;button.disabled=saved;button.dataset.saveState=saved?'saved':'dirty';delete button.dataset.savePresentation;button.innerHTML=icon(saved?'check':'save')+ui(saved?'已保存':'保存模板',saved?'Saved':'Save template');icons();
}
async function publishDocumentTemplate(t){
 const candidate=structuredClone(t);candidate.name=candidate.name.trim();
 if(!candidate.name)throw new Error(ui('请填写模板名称','Enter a template name'));
 if(candidate.fields.some(f=>!f.label.trim()))throw new Error(ui('请填写字段名称，或移除空白行。','Name each field, or remove blank rows.'));
 for(const field of candidate.fields)parsePattern('{$'+field.key+'}');
 if(new Set(candidate.fields.map(f=>f.key)).size!==candidate.fields.length)throw new Error(ui('导入标识不能重复。','Import keys must be unique.'));
 if(candidate.pattern){const keys=parsePattern(candidate.pattern).keys;if(keys.some(k=>!candidate.fields.some(f=>f.key===k)))throw new Error(ui('规则包含不存在的字段。','The rule refers to a missing field.'));}
 const privateBlocks=candidate.documentTemplate.blocks.some(b=>b.type==='form'||b.type==='otp'&&b.storage!=='public');
 if(candidate.documentTemplate.area==='notes'&&(privateBlocks||candidate.fields.some(f=>f.key.startsWith('email.')||!f.target&&['secret','otp'].includes(f.kind))))throw new Error(ui('此模板含凭据组件，请选择用于密码库，或移除凭据组件。','This template includes credential components. Choose Vault, or remove those components.'));
 candidate.family=candidate.documentTemplate.area==='notes'?'note':candidate.family==='note'?'account':candidate.family;
 // Strip defaults and record values again at the persistence boundary.
 candidate.fields=candidate.fields.map(f=>Object.fromEntries(schemaFieldKeys.filter(k=>Object.hasOwn(f,k)).map(k=>[k,f[k]])));
 applyTemplateListRoles({fields:[],blocks:candidate.documentTemplate.blocks},candidate);
 candidate.blocks=[];candidate.documentTemplate.blocks=templateCleanBlocks(candidate.documentTemplate.blocks);
 const old=customTemplates[candidate.id],oldType=types[candidate.id],epoch=privacyEpoch,profile=nativeInfo.profile;
 customTemplates[candidate.id]=candidate;types[candidate.id]={name:candidate.name,group:candidate.group,icon:'layout-template',hint:ui('自定义排版与导入字段','Custom layout and import fields')};
 try{await persist();}catch(error){if(profile===nativeInfo.profile){if(old)customTemplates[candidate.id]=old;else delete customTemplates[candidate.id];if(oldType)types[candidate.id]=oldType;else delete types[candidate.id];}throw error;}
 if(profile!==nativeInfo.profile||epoch!==privacyEpoch)return false;
 if(templateDesign?.template.id===candidate.id){templateDesign.template=structuredClone(candidate);templateDesign.record.name=candidate.name;templateDesign.record.fields=candidate.fields.filter(f=>!f.target&&!f.key.startsWith('email.')).map(f=>({...f,value:'',secret:['secret','otp'].includes(f.kind)}));applyTemplateListRoles(templateDesign.record,candidate);ensureComponentIDs(templateDesign.record);templateDesign.baseline=templateDesignDigest();}
 return true;
}
let templateLeavePromise=null;
async function confirmTemplateNavigation(){
 if(!templateDesign)return true;
 if(equalDocumentValues(templateDesign.baseline,templateDesignDigest())&&customTemplates[templateDesign.template.id])return true;
 if(templateLeavePromise)return templateLeavePromise;
 const draft=templateDesign;
 templateLeavePromise=new Promise(resolve=>{
  modal(ui('保存模板设计？','Save template design?'),'',`<p>${ui('保存后可作为默认模板使用；放弃将丢弃本次模板设计。','Save to reuse this template or choose it as a default. Discard abandons this design.')}</p>`,`<button class="mj-button" data-template-choice="cancel">${tr('取消')}</button><button class="mj-button" data-template-choice="discard">${ui('放弃','Discard')}</button><button class="mj-primary" data-template-choice="save">${tr('保存')}</button>`);
  draft.prompt=resolve;
 });
 const result=await templateLeavePromise;templateLeavePromise=null;return result;
}
function finishTemplateDesign(){
 if(!templateDesign)return;const draft=templateDesign;templateDesign=null;clearEditorHistory();clearManualState();Object.assign(state,draft.returnState);docMode=draft.returnMode;if(state.view==='document'&&(!record(state.selected)||record(state.selected)?._sealed))state.view='table';$('#mj-search').value=state.search||'';render();
}
function guardTemplateRender(){
 if(!templateDesign||state.view==='document'&&state.selected===templateDesign.record.id&&!state.search)return false;
 const target=structuredClone(state);Object.assign(state,templateDesign.view);$('#mj-search').value='';
 confirmTemplateNavigation().then(ok=>{if(ok){finishTemplateDesign();Object.assign(state,target);render();}});return true;
}
const templateSaveEditing=saveWhileEditing;
async function publishOpenTemplate(){
 for(const input of $$('[data-def-key]'))if(!commitTemplateKey(input))return false;
 const button=$('[data-template-publish]');if(button?.disabled)return false;
 if(button)button.disabled=true;
 try{if(await publishDocumentTemplate(builder)){closeModal();render();toast(ui('模板已保存，可在通用设置中设为默认。','Template saved. Choose it as a default in General settings.'));return true;}}
 catch(error){const box=$('#mj-template-error');if(box)box.textContent=String(error.message||error);else toast(String(error.message||error));}
 finally{if(button?.isConnected)button.disabled=false;}
 return false;
}
saveWhileEditing=async function(){if(!$('#mj-overlay').hidden){if(builder?.documentTemplate&&$('[data-template-publish]'))return publishOpenTemplate();return;}if(templateDesign){configureDesignedTemplate();return;}return templateSaveEditing();};window.nativeApp.save=saveWhileEditing;
const documentTemplateAddBlock=addBlock;
addBlock=function(kind){if(!templateDesign)return documentTemplateAddBlock(kind);if(['form','otp','preset-login','preset-server','preset-contact'].includes(kind))templateDesign.template.documentTemplate.area='vault';addBlockV4(kind);render();};
const templatePrepareClose=window.nativeApp.prepareToClose;
window.nativeApp.prepareToClose=async()=>{if(templateDesign){if(!await confirmTemplateNavigation())return false;finishTemplateDesign();}return templatePrepareClose();};
const templateCloseModal=closeModal;
closeModal=function(...args){const resolve=templateDesign?.prompt;if(resolve){templateDesign.prompt=null;resolve(false);}return templateCloseModal(...args);};
for(const [get,set] of [[()=>openRecord,f=>openRecord=f],[()=>createPlainNote,f=>createPlainNote=f],[()=>changeArea,f=>changeArea=f],[()=>setCategory,f=>setCategory=f],[()=>showNew,f=>showNew=f],[()=>showNewChooser,f=>showNewChooser=f]]){const original=get();set(function(...args){if(templateDesign)return confirmTemplateNavigation().then(ok=>{if(ok){finishTemplateDesign();return original(...args);}});return original(...args);});}
window.nativeApp.navigate=async area=>{await changeArea(area);if(state.area===area&&area==='vault'&&!vaultUnlocked&&!templateDesign)requestVaultUnlock();};
root.addEventListener('input',event=>{if(templateDesign&&builder===templateDesign.template&&event.target.matches('[data-draft="name"]'))templateDesign.record.name=event.target.value;},true);
const documentTemplateCenter=renderTemplateCenter;
renderTemplateCenter=function(){documentTemplateCenter();if(!templateManager.trash){if(!$('.mj-modal-footer'))$('.mj-modal').insertAdjacentHTML('beforeend','<div class="mj-modal-footer"></div>');$('.mj-modal-footer').insertAdjacentHTML('afterbegin',`<button class="mj-button" data-template-blank>${icon('plus')}${ui('设计自定义模板','Design a custom template')}</button>`);}icons();};
root.addEventListener('change',async event=>{
 const input=event.target;
 if(input.matches('[data-default-template]')){const key=input.dataset.defaultTemplate,old=nativeInfo.settings[key]||'',value=input.value;input.disabled=true;try{await nativeCall('settings',{[key]:value});nativeInfo.settings[key]=value;toast(ui('默认模板已保存','Default template saved'));}catch(error){input.value=old;toast(String(error));}finally{input.disabled=false;}return;}
 if(!builder?.documentTemplate)return;
 if(input.matches('[data-template-area]'))builder.documentTemplate.area=input.value;
 if(input.matches('[data-template-include]')){const delimiter=builder.pattern?parsePattern(builder.pattern).delimiter:'----',keys=$$('[data-template-include]').filter(el=>el.checked).map(el=>builder.fields[Number(el.dataset.templateInclude)]?.key).filter(Boolean);if(keys.length>24){input.checked=false;toast(ui('一次快捷粘贴最多选择 24 个字段，其他组件仍会保留。','Quick Paste supports 24 selected fields at a time. Other components are retained.'));return;}builder.pattern=keys.map(k=>'{$'+k+'}').join(delimiter);$('#mj-pattern').value=builder.pattern;importRuleDesigner();}
},true);
// Window capture precedes legacy handlers, keeping the existing template
// builder's field controls while making publication transactional.
window.addEventListener('click',async event=>{
 if(templateDesign){
  const area=event.target.closest('[data-v5="area"]');if(area){event.preventDefault();event.stopImmediatePropagation();await window.nativeApp.navigate(area.dataset.area);return;}
  const field=event.target.closest('[data-v3-editor="save-field"]');
  if(field){event.preventDefault();event.stopImmediatePropagation();const label=$('#mj-component-label').value.trim(),kind=$('#mj-component-kind').value;if(!label)return;const f={key:'custom.field_'+crypto.randomUUID().slice(0,8),label,kind,value:'',secret:kind==='secret'};if(fieldTarget===null)templateDesign.record.fields.push(f);else templateDesign.record.blocks[fieldTarget].fields.push(f);if(kind==='secret')templateDesign.template.documentTemplate.area='vault';fieldTarget=null;closeModal();render();return;}
 }
 const button=event.target.closest('[data-save-as-template],[data-template-blank],[data-template-layout],[data-template-publish],[data-template-configure],[data-template-exit],[data-template-choice]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  if(button.hasAttribute('data-save-as-template'))showSaveAsTemplate();
  else if(button.hasAttribute('data-template-blank'))showBlankTemplate();
  else if(button.hasAttribute('data-template-layout'))await startTemplateDesign(builder);
  else if(button.hasAttribute('data-template-configure'))configureDesignedTemplate();
  else if(button.hasAttribute('data-template-exit')){if(await confirmTemplateNavigation())finishTemplateDesign();}
  else if(button.hasAttribute('data-template-publish')){
   await publishOpenTemplate();
  }else{
   const choice=button.dataset.templateChoice,resolve=templateDesign?.prompt;if(!resolve)return;
   if(choice==='save'){button.disabled=true;if(!await publishDocumentTemplate(currentDesignedTemplate()))return;}
   templateDesign.prompt=null;closeModal();resolve(choice!=='cancel');
  }
 }catch(error){const box=$('#mj-template-error');if(box)box.textContent=String(error.message||error);else toast(String(error.message||error));}finally{if(button.isConnected)button.disabled=false;}
},true);
