// Schema metadata and reviewed document-template examples are public.
// Credential values and legacy template defaults remain encrypted.
let templateSchemas={builtin:{},custom:{}};
const schemaKeys=['id','name','group','family','builtin','archived','userConfigured','pattern','relations','documentTemplate'];
const schemaFieldKeys=['key','label','kind','section','required','derived','shortcut','target','listRole'];
function templateSchemaProjection(definitions){
 const result={};for(const [id,t] of Object.entries(definitions))result[id]={...Object.fromEntries(schemaKeys.filter(key=>Object.hasOwn(t,key)).map(key=>[key,structuredClone(t[key])])),fields:t.fields.map(field=>Object.fromEntries(schemaFieldKeys.filter(key=>Object.hasOwn(field,key)).map(key=>[key,structuredClone(field[key])])))};return result;
}
function templateSchemaSnapshot(){
 // A locked first launch must not turn untouched bundled defaults into
 // overrides of older encrypted customizations that have not been read yet.
 const builtin=Object.fromEntries(Object.entries(templateRegistry).filter(([id,t])=>vaultUnlocked||t.userConfigured||t.archived||Object.hasOwn(templateSchemas.builtin||{},id)));
 templateSchemas={builtin:templateSchemaProjection(builtin),custom:templateSchemaProjection(customTemplates)};return structuredClone(templateSchemas);
}
function applyTemplateSchemas(){
 for(const [category,target] of [['builtin',templateRegistry],['custom',customTemplates]])for(const [id,schema] of Object.entries(templateSchemas[category]||{})){
  const old=target[id]||{blocks:[],relations:[]};
  target[id]={...old,...structuredClone(schema),...(schema.documentTemplate?{blocks:[]}:{}),fields:schema.fields.map(field=>({...(!schema.documentTemplate&&old.fields?.find(item=>item.key===field.key)),...structuredClone(field)}))};
  types[id]={...types[id],name:schema.name,group:schema.group,icon:types[id]?.icon||'layout-template',hint:types[id]?.hint||'自定义模板'};
 }
}
let templateFieldDraft=null;
let recordFieldNameDraft=null;
const templateOriginalKeys=new WeakMap();
function commitTemplateKey(input){
 const field=builder?.fields[Number(input.dataset.defKey)];if(!field)return false;
 const key=input.value.trim(),error=$('#mj-template-error');
 if(!/^(?:custom\.)?[A-Za-z][A-Za-z0-9_.]{0,100}$/.test(key)||key.split('.').some(part=>['__proto__','prototype','constructor'].includes(part))||builder.fields.some(other=>other!==field&&other.key===key)){
  input.setAttribute('aria-invalid','true');if(error)error.textContent=ui('导入标识以英文字母开头，可含数字、下划线和点，且不能重复。','Use a unique key starting with a letter, followed by letters, digits, underscores or dots.');return false;
 }
 const old=field.key;field.key=key;builder.pattern=builder.pattern.split('{$'+old+'}').join('{$'+key+'}');const patternInput=$('#mj-pattern');if(patternInput)patternInput.value=builder.pattern;input.removeAttribute('aria-invalid');if(error)error.textContent='';importRuleDesigner();return true;
}
root.addEventListener('change',event=>{if(event.target.matches('[data-def-key]'))commitTemplateKey(event.target);},true);
root.addEventListener('click',async event=>{
 const button=event.target.closest('[data-field-rename],[data-field-name-save]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();
 const r=selected();if(!r||isProtected(r)&&!vaultUnlocked)return;
 if(button.hasAttribute('data-field-rename')){
  const index=Number(button.dataset.fieldRename),field=r.fields[index];if(!field)return;recordFieldNameDraft={id:r.id,index};
  modal(ui('修改字段名称','Rename field'),ui('只修改这条记录中的显示名称，字段内容不变。','Rename this field in the current record; its value stays unchanged.'),`<label class="mj-field-label" for="mj-record-field-name">${ui('字段名称','Field name')}</label><input class="mj-field-input" id="mj-record-field-name" value="${escape(field.label)}" maxlength="120"><p id="mj-field-name-error" role="alert"></p>`,`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-field-name-save>${tr('保存')}</button>`);return;
 }
 try{
  const draft=recordFieldNameDraft,label=$('#mj-record-field-name').value.trim();if(!draft||draft.id!==r.id||!label||label.length>120)throw new Error(ui('请填写字段名称','Enter a field name'));
  const epoch=privacyEpoch;snapshotEditor();r.fields[draft.index].label=label;await persist();if(epoch!==privacyEpoch)return;recordFieldNameDraft=null;closeModal();render();
 }catch(error){const box=$('#mj-field-name-error');if(box)box.textContent=String(error.message||error);}
},true);
// Add a row in the existing editor. Names, types and required flags are edited
// in place; no nested dialog interrupts the template draft.
function revealTemplateField(input){
 if(!input)return;input.focus({preventScroll:true});
 const panel=$('.mj-template-settings-body')||$('.mj-modal'),fieldBox=input.getBoundingClientRect(),panelBox=panel.getBoundingClientRect();
 panel.scrollTop+=fieldBox.top-panelBox.top-(panel.clientHeight-fieldBox.height)/2;
}
root.addEventListener('click',event=>{
 const button=event.target.closest('[data-v3="template-add-field"]');if(!button||!builder)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(builder.fields.length>=256){toast(ui('每个模板最多 256 个字段','A template supports up to 256 fields'));return;}
 const index=builder.fields.length;
 builder.fields.push({key:'custom.field_'+crypto.randomUUID().slice(0,8),label:'',kind:'text',section:ui('自定义字段','Custom fields'),required:false});
 renderBuilder();const layoutRevision=++modalLayoutRevision;
 queueMicrotask(()=>{if(layoutRevision!==modalLayoutRevision)return;revealTemplateField($(`[data-def-label="${index}"]`));});
},true);
function removeTemplateFieldRow(index){
 const dialog=$('.mj-template-settings-body')||$('.mj-modal'),rows=$$('.mj-field-table tbody tr'),row=rows[index],top=dialog.scrollTop;
 if(!row||!removeTemplateField(builder,index))return;
 modalLayoutRevision++;
 // Keep other fields and their native selection alive. Replacing the complete
 // focused form triggers delayed reveal scrolling on older macOS WebKit.
 if(row.contains(document.activeElement))(rows[index+1]?.querySelector('input')||rows[index-1]?.querySelector('input')||$('[data-v3="template-add-field"]'))?.focus({preventScroll:true});
 row.remove();
 $$('.mj-field-table tbody tr').forEach((row,i)=>{for(const el of row.querySelectorAll('[data-def-label],[data-def-key],[data-def-kind],[data-def-required],[data-template-include],[data-exp="remove-template-field"]'))for(const key of ['defLabel','defKey','defKind','defRequired','templateInclude','index'])if(el.dataset[key]!==undefined)el.dataset[key]=String(i);});
 $('#mj-pattern').value=builder.pattern;importRuleDesigner();if(typeof refreshTemplateListOptions==='function')refreshTemplateListOptions();invalidatePreview();dialog.scrollTop=top;
}
const saveTemplateSchemaBase=saveTemplate;
saveTemplate=function(silent=false){
 for(const input of $$('[data-def-key]'))if(!commitTemplateKey(input)){input.focus({preventScroll:true});throw new Error(ui('请先修正导入标识','Correct the import key first'));}
 const invalid=builder?.fields.findIndex(field=>!field.label?.trim()||field.label.trim().length>120);
 if(invalid>=0){revealTemplateField($(`[data-def-label="${invalid}"]`));throw new Error(ui('请为每个字段填写名称（1–120 个字），或移除空白行','Name each field (1–120 characters), or remove the empty row'));}
 return saveTemplateSchemaBase(silent);
};
