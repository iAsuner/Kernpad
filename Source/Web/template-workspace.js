let templateWorkspaceReturn=null,templateQuery='',templateFilter='basic';
function templateListFieldAllowed(f,role){
  if(f.key.startsWith('email.'))return false;
  if(role==='otp')return f.kind==='otp'&&(!f.target||f.target.endsWith(':seed')||f.target.endsWith(':value'));
  if(f.target&&!f.target.endsWith(':value'))return false;
  if(role==='password')return f.kind==='secret';
  if(role==='url')return f.kind==='url';
  return !['otp','multiline','tags'].includes(f.kind);
}
function templateListOptions(t,role){
 const fields=t.fields.filter(f=>templateListFieldAllowed(f,role));
 return `<option value="">${ui('自动识别','Automatic')}</option>`+fields.map(f=>`<option value="${escape(f.key)}" ${f.listRole===role?'selected':''}>${escape(tr(f.label))}</option>`).join('');
}
function refreshTemplateListOptions(){
 if(!builder||!$('.mj-template-list-settings'))return;
 for(const field of builder.fields)if(field.listRole&&!templateListFieldAllowed(field,field.listRole))delete field.listRole;
 for(const select of $$('[data-template-list-role]'))select.innerHTML=templateListOptions(builder,select.dataset.templateListRole);
}
function templateListDetectionHelp(){
 const rules=[
  ['账号','Account','先查找导入标识 account，再匹配内置账号名称（如登录账号、邮箱地址、用户名），最后取第一个非秘密字段。','Looks for the import key account, then built-in account labels such as Sign-in account, Email address or Username, then the first non-secret field.'],
  ['密码','Password','先查找导入标识 password，再匹配名称含“密码”或“两步验证凭据”的字段，最后取一个秘密字段，排除入口、私钥、卡号与银行账号。','Looks for the import key password, then stored labels containing 密码 (password) or 两步验证凭据 (two-step credential), then a secret field, excluding entry addresses, private keys, card numbers and bank accounts.'],
  ['网址','URL','按字段顺序取第一个有效的公开 HTTP 或 HTTPS 网址。优先检查网址类型或设有快捷入口的字段；没有这类字段时才检查记录链接。秘密字段和带账号密码的网址不显示。','Uses the first valid public HTTP or HTTPS address in field order. Checks URL fields and shortcut fields first; record links are considered only when no such fields exist. Secret values and URLs containing login credentials are excluded.'],
  ['验证码','Verification code','使用记录已有的验证器和验证码组件，可显示多个验证码。手动指定后，只使用指定的字段或组件，不显示密钥。','Uses the record’s existing authenticator and code components, which may produce several codes. A manual choice limits this to the selected field or component. Seeds are never displayed.']
 ];
 return `<details class="mj-template-detection-help"><summary>${ui('自动识别如何工作','How automatic matching works')}</summary><p>${ui('使用本机固定规则。账号和密码按以下顺序匹配，同级取字段顺序中的第一项；先检查基本字段，再检查表单字段。','Matching uses fixed local rules. Account and password use the following priority, choosing the first field at each level. Basic fields are checked before form fields.')}</p><dl>${rules.map(([zh,en,zhText,enText])=>`<dt>${ui(zh,en)}</dt><dd>${ui(zhText,enText)}</dd>`).join('')}</dl><p>${ui('手动指定优先。账号或密码命中后，即使内容为空也不会跳到下一个字段；找不到时留空。使用自定义名称或英文名称时，建议直接指定字段。修改模板只影响之后新建的记录。','Manual choices take priority. An account or password match stays selected even when empty; no match leaves it blank. For custom or English field names, choose the field explicitly. Template changes apply to future records.')}</p></details>`;
}
function renderTemplateListSettings(){
 const t=builder,roles=[['account','账号','Account'],['password','密码','Password'],['url','网址','URL'],['otp','验证码','Verification code']];
 $('.mj-template-list-settings')?.remove();
 const box=document.createElement('section');box.className='mj-template-list-settings';
 box.innerHTML=`<h3>${ui('密码库列表展示','Vault list display')}</h3><p>${ui('记录名称使用文档标题。选择账号、密码、网址与验证码对应的字段，保存后用于新记录。密码保持遮挡并由原生层复制，验证码不会显示密钥。','The record name uses the document title. Choose the primary list fields. Passwords remain masked and are copied natively; codes never reveal their seeds. Applies to newly created records.')}</p><div>${roles.map(([role,zh,en])=>`<label>${ui(zh,en)}<select data-template-list-role="${role}" aria-label="${ui('列表','List ')+ui(zh,en)}">${templateListOptions(t,role)}</select></label>`).join('')}</div>${templateListDetectionHelp()}`;
 $('.mj-builder-grid').after(box);box.hidden=templateArea(t)!=='vault';
}
// IDs remain an internal binding mechanism. Only human-editable import keys
// belong in the inspector; never expose UUIDs in labels or tooltips.
function templateInspectorKeys(r,blocks){
 if(!r||blocks.length!==1)return '';
 let t;try{t=templateDesign?currentDesignedTemplate():recordTemplate(r);}catch{return '';}
 const block=blocks[0],components=[block,...block.fields||[]],ids=new Set(components.map(c=>c.templateComponentID||c.componentID));
 const fields=(t?.fields||[]).filter(f=>f.target?ids.has(f.target.split(':')[0]):block.type==='form'&&block.fields.some(c=>c.key===f.key));
 if(!fields.length)return '';
 return `<div class="mj-layout-import-keys"><small>${ui('导入标识','Import key')}</small>${fields.map(f=>`<code title="${escape(f.label+': '+f.key)}">${escape(f.key)}</code>`).join('')}</div>`;
}
const basicTemplateIDs=new Set(['note','login','email','server','api','card']);
let templatePreferenceQueue=Promise.resolve();
function toggleTemplateFavorite(id){
 const profile=nativeInfo.profile;
 const operation=templatePreferenceQueue.catch(()=>{}).then(async()=>{
  if(profile!==nativeInfo.profile)return;
  const items=new Set(nativeInfo.settings.templateFavorites||[]);if(items.has(id))items.delete(id);else items.add(id);
  await saveTemplatePreference('templateFavorites',[...items].slice(-50));
  if(profile===nativeInfo.profile&&state.view==='templates')renderTemplateCards();
 });
 templatePreferenceQueue=operation;return operation;
}
async function openTemplateWorkspace(context='new'){
 if(templateDesign){if(!await confirmTemplateNavigation())return;finishTemplateDesign();}
 if(!await confirmManualNavigation())return;
 if(state.view!=='templates')templateWorkspaceReturn={state:structuredClone(state),mode:docMode};
 await persist();cancelInlineAuthentication();closeModal();templateManager={editing:false,family:null,context,trash:false};templateQuery='';templateFilter='basic';state.search='';$('#mj-search').value='';state.view='templates';render();
}
showTemplates=()=>openTemplateWorkspace('new');showRecordTemplates=()=>openTemplateWorkspace('switch');
renderTemplateCenter=function(){closeModal();state.view='templates';render();};
function renderTemplateWorkspace(){
 root.classList.remove('mj-in-document','mj-document-edit','mj-document-view');root.classList.add('mj-template-workspace');$('#mj-breadcrumb').textContent=ui('模板','Templates');
 $('#mj-workspace').innerHTML=`<section class="mj-template-library"><header><div><h1>${ui('模板','Templates')}</h1><p>${ui('搜索并直接使用模板，或调整排版、字段和列表展示。','Find a template and use it directly, or customize its layout, fields and list display.')}</p></div><button class="mj-button" data-template-library-back>${ui('返回','Back')}</button><button class="mj-primary" data-template-blank>${icon('plus')}${ui('设计模板','Design template')}</button></header><div class="mj-template-library-filters"><input class="mj-field-input" type="search" data-template-search aria-label="${ui('搜索模板','Search templates')}" placeholder="${ui('搜索名称、字段或导入标识','Search names, fields or import keys')}" value="${escape(templateQuery)}"><select data-template-filter aria-label="${ui('模板范围','Template scope')}">${[['basic','基础与自定义','Basics & custom'],['all','全部模板','All templates'],['notes','便签','Notes'],['vault','密码库','Vault'],['custom','自定义','Custom'],['trash','回收站','Trash']].map(([id,zh,en])=>`<option value="${id}" ${templateFilter===id?'selected':''}>${ui(zh,en)}</option>`).join('')}</select></div><div id="mj-template-sections"></div></section>`;
 renderTemplateCards();icons();
}
function renderTemplateCards(){
 const favorites=new Set(nativeInfo.settings.templateFavorites||[]),recent=nativeInfo.settings.templateRecent||[],counts=new Map();recent.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
 const all=(templateFilter==='trash'?trashTemplates():allTemplates()).filter(t=>(!['notes','vault'].includes(templateFilter)||templateArea(t)===templateFilter)&&(templateFilter!=='custom'||!t.builtin)&&(!templateQuery||[templateName(t),tr(templateName(t)),...t.fields.flatMap(f=>[f.label,f.key])].join(' ').toLocaleLowerCase().includes(templateQuery.toLocaleLowerCase())));
 const listed=templateFilter==='basic'&&!templateQuery?all.filter(t=>!t.builtin||basicTemplateIDs.has(t.id)):all;
 const star=t=>`<button class="mj-icon" data-template-favorite="${escape(t.id)}" aria-label="${escape(ui(favorites.has(t.id)?'取消收藏：':'收藏：',favorites.has(t.id)?'Unfavorite: ':'Favorite: ')+tr(templateName(t)))}" aria-pressed="${favorites.has(t.id)}" title="${ui(favorites.has(t.id)?'取消收藏':'收藏模板',favorites.has(t.id)?'Remove from favorites':'Add to favorites')}">${icon('star')}</button>`;
 const cards=items=>`<div class="mj-template-library-grid">${items.map(t=>`<article><button class="mj-template-library-use" data-template-use="${escape(t.id)}" ${templateFilter==='trash'?'disabled':''}>${icon(types[t.id]?.icon||'layout-template')}<strong>${escape(tr(templateName(t)))}</strong><small>${templateArea(t)==='notes'?ui('便签','Notes'):ui('密码库','Vault')}</small><span>${escape(t.fields.slice(0,3).map(f=>tr(f.label)).join(locale==='en'?', ':'、'))}</span></button><footer>${templateFilter==='trash'?`<button class="mj-button" data-refine="restore-template" data-id="${escape(t.id)}">${ui('恢复','Restore')}</button>`:`${star(t)}<button class="mj-button" data-template-edit="${escape(t.id)}">${ui('模板设置','Template Settings')}</button><button class="mj-icon mj-danger" data-refine="delete-template" data-id="${escape(t.id)}" aria-label="${escape(ui('删除模板：','Delete template: ')+tr(templateName(t)))}">${icon('trash-2')}</button>`}</footer></article>`).join('')}</div>`;
 const quickCards=items=>`<div class="mj-template-quick-list">${items.map(t=>`<div class="mj-template-quick-item"><button data-template-use="${escape(t.id)}">${icon(types[t.id]?.icon||'layout-template')}<strong>${escape(tr(templateName(t)))}</strong><small>${templateArea(t)==='notes'?ui('便签','Notes'):ui('密码库','Vault')}</small>${icon('arrow-up-right')}</button>${star(t)}</div>`).join('')}</div>`;
 const sections=[];if(templateFilter!=='trash'&&!templateQuery){const starred=all.filter(t=>favorites.has(t.id)),frequent=all.filter(t=>counts.has(t.id)).sort((a,b)=>counts.get(b.id)-counts.get(a.id)||recent.lastIndexOf(b.id)-recent.lastIndexOf(a.id)).slice(0,6);sections.push(`<div class="mj-template-quick-sections"><section><h2>${ui('收藏模板','Favorite templates')}</h2>${starred.length?quickCards(starred):`<p class="mj-template-empty">${ui('点击模板上的星标，将它放在这里。','Star a template to keep it here.')}</p>`}</section><section><h2>${ui('常用模板','Frequently used')}</h2>${frequent.length?quickCards(frequent):`<p class="mj-template-empty">${ui('使用模板后，会按使用次数显示在这里。','Templates appear here as you use them.')}</p>`}</section></div>`);}
 sections.push(`<section><h2>${ui(templateQuery?'搜索结果':templateFilter==='trash'?'模板回收站':templateFilter==='basic'?'基础与自定义':'全部模板',templateQuery?'Search results':templateFilter==='trash'?'Template trash':templateFilter==='basic'?'Basics & custom':'All templates')} <small>${listed.length}</small></h2>${listed.length?cards(listed):`<p class="mj-template-empty">${ui('没有匹配的模板','No matching templates')}</p>`}</section>`);const container=$('#mj-template-sections'),workspace=$('#mj-workspace'),top=workspace.scrollTop,focused=document.activeElement?.closest('[data-template-favorite]'),focusID=focused?.dataset.templateFavorite,wasQuick=!!focused?.closest('.mj-template-quick-list'),anchor=focused?.getBoundingClientRect().top;container.innerHTML=sections.join('');icons();if(focusID){const matches=[...container.querySelectorAll('[data-template-favorite]')].filter(b=>b.dataset.templateFavorite===focusID),replacement=matches.find(b=>!!b.closest('.mj-template-quick-list')===wasQuick)||matches[0];replacement?.focus({preventScroll:true});workspace.scrollTop=top+(replacement?replacement.getBoundingClientRect().top-anchor:0);}else workspace.scrollTop=top;
}
async function saveTemplatePreference(key,value){const profile=nativeInfo.profile;await nativeCall('settings',{[key]:value});if(profile===nativeInfo.profile)nativeInfo.settings[key]=value;}
async function returnFromTemplateWorkspace(){
 const previous=templateWorkspaceReturn;templateWorkspaceReturn=null;if(previous){Object.assign(state,previous.state);docMode=previous.mode;if(state.view==='document'&&record(state.selected)?._sealed){state.view='table';await openRecord(state.selected);return;}}else state.view='table';render();
}
root.addEventListener('input',event=>{if(event.target.matches('[data-template-search]')){templateQuery=event.target.value;renderTemplateCards();}},true);
for(const eventName of ['input','change'])root.addEventListener(eventName,event=>{if(event.target.matches('[data-def-label],[data-def-key],[data-def-kind]'))queueMicrotask(refreshTemplateListOptions);},true);
root.addEventListener('change',event=>{
 const input=event.target;if(input.matches('[data-template-filter]')){templateFilter=input.value;renderTemplateCards();}
 if(input.matches('[data-template-area],[data-template-family]')){const box=$('.mj-template-list-settings');if(box)box.hidden=templateArea(builder)!=='vault';}
 if(input.matches('[data-template-list-role]')){const role=input.dataset.templateListRole;for(const f of builder.fields)if(f.listRole===role)delete f.listRole;const f=builder.fields.find(f=>f.key===input.value);if(f)f.listRole=role;for(const select of $$('[data-template-list-role]'))select.innerHTML=templateListOptions(builder,select.dataset.templateListRole);}
},true);
window.addEventListener('click',async event=>{
 const button=event.target.closest('[data-template-use],[data-template-edit],[data-template-favorite],[data-template-library-back]');if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  if(button.hasAttribute('data-template-library-back')){await returnFromTemplateWorkspace();return;}
  if(button.dataset.templateFavorite){button.disabled=true;await toggleTemplateFavorite(button.dataset.templateFavorite);return;}
  if(button.dataset.templateEdit){templateManager.editing=true;templateManager.context='library';showTemplateEditor(button.dataset.templateEdit);return;}
  const id=button.dataset.templateUse,t=getTemplate(id);if(!t||t.archived)return;
  await saveTemplatePreference('templateRecent',[...(nativeInfo.settings.templateRecent||[]),id].slice(-50));
  if(templateManager.context==='switch'){await returnFromTemplateWorkspace();switchTemplate(id);}else{state.view='table';render();showNew(id);}
 }catch(error){toast(String(error.message||error));}finally{if(button.isConnected)button.disabled=false;}
},true);

const templateFocusSearch=focusSearch;focusSearch=function(){if(state.view==='templates'){const input=$('[data-template-search]');input?.focus();input?.select();return;}return templateFocusSearch();};window.nativeApp.focusSearch=focusSearch;
