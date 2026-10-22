let customPlatforms={},platformDraft=null,platformReturn=null,contextRecordID=null,pendingTrashPurge=null,relationDraft=null;
function allPlatforms(){return [...platformCatalog.filter(p=>p.id!=='custom'),...Object.values(customPlatforms),platformCatalog.find(p=>p.id==='custom')];}
function closeRecordMenu(){root.querySelector('.mj-record-menu')?.remove();contextRecordID=null;}
function clearExperience(){customPlatforms={};platformDraft=null;platformReturn=null;pendingTrashPurge=null;relationDraft=null;closeRecordMenu();}
function platformLogo(r){
 const p=platformFor(r),upload=safePlatformLogo(p?.logo);
 if(upload)return `<span class="mj-platform-logo"><img src="${upload}" alt="" draggable="false"></span>`;
 const bundled=p&&bundledPlatformIcons[p.id];
 if(bundled)return `<span class="mj-platform-logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="#${bundled.hex}" stroke="none">${bundled.paths.map(path=>`<path d="${path}"></path>`).join('')}</svg></span>`;
 if(p?.id==='microsoft')return '<span class="mj-platform-logo" aria-hidden="true"><svg viewBox="0 0 24 24" stroke="none"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M13 1h10v10H13z"/><path fill="#00a4ef" d="M1 13h10v10H1z"/><path fill="#ffb900" d="M13 13h10v10H13z"/></svg></span>';
 return `<span class="mj-platform-logo mj-platform-default" aria-hidden="true">${icon(p?.family==='server'||type(r).group==='infra'?'server':p?.family==='finance'||type(r).group==='finance'?'credit-card':r.type==='email'?'mail':r.type==='note'?'sticky-note':'globe-2')}</span>`;
}
function titleCell(r){return `<button class="mj-titlecell" data-open="${escape(r.id)}">${platformLogo(r)}<span><strong class="mj-user-content">${escape(recordDisplayName(r))}</strong><small>${escape(platformFor(r)?.name||tr(type(r).name))}</small></span></button>`;}
function quickValue(r,value,key,secret=false){
 if(r._sealed){const p=listPreview(r);if(!p&&state.view==='document')return `<span class="mj-quiet">${ui('打开关联记录查看','Open linked record to view')}</span>`;if(!p)return previewError?`<button class="mj-text-button" data-preview-retry>${ui('重试','Retry')}</button>`:'<span class="mj-quiet">…</span>';value=key==='password'?(p.hasPassword?'••••••••':''):p.account;}
 if(value===''||value===null||value===undefined)return '<span class="mj-quiet">—</span>';
 const field=key==='account'?listAccountField(r):null;secret=secret||!!field?.secret||['secret','otp'].includes(field?.kind);
 return `<button class="mj-copyvalue ${secret?'mj-mono mj-masked-value':''}" data-qcopy="${escape(r.id)}" data-qkey="${key}" aria-label="${escape(ui('复制 '+r.name+' 的'+(key==='password'?'密码':'账号'),'Copy '+r.name+' '+(key==='password'?'password':'account')))}"><span class="mj-user-content">${escape(visibleValue(value,secret)||'—')}</span>${icon('copy')}</button>`;
}
function previewCodeCell(r,code){
 const valid=code&&/^\d{6}$/.test(code.code),value=valid?code.code.slice(0,3)+' '+code.code.slice(3):code?ui('密钥格式待检查','Check key format'):'••• •••',seconds=30-Math.floor(Date.now()/1000)%30;
 return `<div class="mj-otp-cell"><div class="mj-otp-line"><strong class="mj-mono" data-preview-code-value="${escape(r.id)}" data-index="${code?.index??-1}">${escape(value)}</strong><button class="mj-icon" data-preview-code="${escape(r.id)}" data-index="${code?.index??-1}" aria-label="${escape(ui('复制 '+r.name+' 的验证码','Copy verification code for '+r.name))}" ${valid?'':'disabled'}>${icon('copy')}</button></div><small><i class="mj-otp-progress" aria-hidden="true"></i><span class="mj-otp-time">${seconds}s</span></small></div>`;
}
function rowOTP(r){
 if(r._sealed)return r.hasCodes?previewCodeCell(r,listCodes(r)[0]):'<span class="mj-quiet">—</span>';
 if(!r.totp)return '<span class="mj-quiet">—</span>';
 const code=otpValues.get(r.id)||'••• •••',seconds=30-Math.floor(Date.now()/1000)%30;
 return `<div class="mj-otp-cell"><div class="mj-otp-line"><strong class="mj-mono" data-code-record="${escape(r.id)}">${escape(code)}</strong><button class="mj-icon" data-qcopy="${escape(r.id)}" data-qkey="otp" aria-label="${escape(ui('复制 '+r.name+' 的验证码','Copy verification code for '+r.name))}">${icon('copy')}</button></div><small><i class="mj-otp-progress" aria-hidden="true"></i><span class="mj-otp-time">${seconds}s</span></small></div>`;
}
function shortRecordURL(r){return safeURL((r._sealed?listPreview(r)?.url:linksOf(r)[0]?.[1])||platformFor(r)?.url||'');}
function tableURL(r){
 const url=shortRecordURL(r);if(!url)return '';
 let label=url;try{const u=new URL(url);label=u.host+(u.pathname==='/'?'':u.pathname)+u.search;}catch{}
 return `<div class="mj-url-line"><a href="${escape(url)}" data-shortcut="${escape(recordDisplayName(r))}" title="${escape(url)}"><span class="mj-user-content">${escape(label)}</span>${icon('arrow-up-right')}</a><button class="mj-icon" data-exp="copy-url" data-id="${escape(r.id)}" aria-label="${escape(ui('复制 '+r.name+' 的网址','Copy website for '+r.name))}">${icon('copy')}</button></div>`;
}
function associatedCell(r){
 const refs=r.refs.map(record).filter(Boolean);if(!refs.length)return '<span class="mj-quiet">—</span>';
 const first=refs.find(other=>other.type==='email')||refs[0];
 return `<div class="mj-associated"><div><button class="mj-reflink" data-open="${escape(first.id)}">${escape(first.name)}</button>${listAccountOf(first)?`<button class="mj-icon" data-qcopy="${escape(first.id)}" data-qkey="account" aria-label="${escape(ui('复制关联账号','Copy linked account'))}">${icon('user-round')}</button>`:''}${listHasPassword(first)?`<button class="mj-icon" data-qcopy="${escape(first.id)}" data-qkey="password" aria-label="${escape(ui('复制关联密码','Copy linked password'))}">${icon('key-round')}</button>`:''}</div><small class="mj-user-content">${escape(visibleValue(listAccountOf(first),!!listAccountField(first)?.secret||['secret','otp'].includes(listAccountField(first)?.kind)||['card','bank'].includes(first.type)))}</small>${refs.length>1?`<button class="mj-text-button" data-exp="related-records" data-id="${escape(r.id)}">${ui('共 '+refs.length+' 条关联',refs.length+' linked records')}</button>`:''}</div>`;
}
function paginationControls(page,pages){
 if(pages<=1)return '';
 return `<nav class="mj-pagination" aria-label="${ui('记录分页','Record pages')}"><span class="mj-spacer"></span><button class="mj-button" data-action="prev-page" aria-label="${tr('上一页')}" ${page===0?'disabled':''}>${icon('chevron-left')}</button><label><span class="mj-sr-only">${ui('前往页码','Go to page')}</span><span class="mj-page-jump"><input type="number" min="1" max="${pages}" value="${page+1}" data-exp-page aria-label="${ui('前往页码','Go to page')}"><span>/ ${pages}</span></span></label><button class="mj-button" data-action="next-page" aria-label="${tr('下一页')}" ${page+1>=pages?'disabled':''}>${icon('chevron-right')}</button></nav>`;
}
function renderVaultTable(){
 const all=filtered().map(r=>nativeInfo.recordProtocol&&isProtected(r)?sealedSummary(r):r),size=tableCapacity($('#mj-workspace').clientHeight);
 state.page=resizedPage(state.page||0,state.pageSize||size,size,all.length);state.pageSize=size;
 const rows=all.slice(state.page*size,(state.page+1)*size),pages=Math.max(1,Math.ceil(all.length/size));
 $('#mj-workspace').innerHTML=`<div class="mj-page mj-records-page"><div class="mj-pagehead"><div><h1>${escape(groupName())}</h1><small>${all.length} ${tr('条记录')}</small></div></div><div class="mj-viewtools"><div class="mj-spacer"></div><button class="mj-text-button" data-exp="platforms">${ui('管理平台…','Manage platforms…')}</button></div><div class="mj-table-wrap"><table class="mj-table mj-fulltable"><thead><tr><th>${tr('记录')}</th><th>${tr('账号')}</th><th>${tr('密码 / 凭据')}</th><th>${tr('动态验证码')}</th><th>${tr('关联资料')}</th><th><span class="mj-sr-only">${ui('操作','Actions')}</span></th></tr></thead><tbody>${rows.map(r=>{
 const af=r.fields.findIndex(f=>f.value===listAccountOf(r));
 return `<tr data-record-id="${escape(r.id)}"><td>${titleCell(r)}${tableURL(r)}</td><td>${quickValue(r,listAccountOf(r),'account',(r.fields[af]?.secret||['card','bank'].includes(r.type)))}</td><td>${r._sealed||listHasPassword(r)?quickValue(r,secretOf(r),'password',true):'<span class="mj-quiet">—</span>'}</td><td>${rowOTP(r)}</td><td>${associatedCell(r)}</td><td class="mj-row-actions"></td></tr>`;
 }).join('')}</tbody></table></div>${rows.length?'':`<div class="mj-empty">${tr('没有匹配的记录')}</div>`}${paginationControls(state.page,pages)}</div>`;
 tick();
}
function codeCardHeading(r,label=''){
 const account=listAccountOf(r),field=r.fields.find(f=>f.value===account),display=account&&account!=='—'?visibleValue(account,!!field?.secret):r.name;
 return `<button class="mj-code-identity" data-open="${escape(r.id)}">${platformLogo(r)}<span><strong class="mj-user-content">${escape(display)}</strong><small class="mj-user-content">${escape(r.name+((label||platformFor(r)?.name)?ui('（',' (')+(label||platformFor(r)?.name)+ui('）',')'):''))}</small></span>${icon('chevron-right')}</button>`;
}
function relationCandidates(current,query='',matchedIDs=new Set()){
 const text=query.trim().toLocaleLowerCase();
 return records.filter(r=>r.id!==current.id&&(!isProtected(r)||vaultUnlocked)&&(!text||matchedIDs.has(r.id)||recordSearchParts(r).join(' ').toLocaleLowerCase().includes(text)))
  .sort((a,b)=>Number(current.refs.includes(b.id))-Number(current.refs.includes(a.id)));
}
function renderRelationResults(query=''){
 const current=selected(),list=$('#mj-relation-results');if(!current||!list)return;
 const matches=relationCandidates(current,query,relationDraft?.search?.query===query?relationDraft.search.ids:new Set());
 list.innerHTML=matches.map(r=>`<label class="mj-relation-option">${platformLogo(r)}<span><strong class="mj-user-content">${escape(recordDisplayName(r))}</strong><small class="mj-user-content">${escape([platformFor(r)?.name||tr(type(r).name),visibleValue(listAccountOf(r),fieldIsSecret(listAccountField(r)||{}))].filter(value=>value&&value!=='—').join(ui('，',', ')))}</small></span><input type="checkbox" data-relation-choice="${escape(r.id)}" aria-label="${escape(ui('关联 '+recordDisplayName(r),'Link '+recordDisplayName(r)))}" ${relationDraft?.refs.has(r.id)?'checked':''}></label>`).join('')||`<div class="mj-empty">${ui('没有找到匹配记录','No matching records')}</div>`;
 icons();
 const status=$('#mj-relation-status'),search=relationDraft?.search;if(status)status.textContent=search?.pending?ui('正在本机搜索…','Searching locally…'):search?.error?ui('搜索失败，请重新输入关键词。','Search failed. Enter your query again.'):search?.truncated?ui('最多显示 100 条密码库匹配，请缩小关键词。','Showing up to 100 vault matches. Refine your query.'):'';
}
function searchRelationRecords(query){
 const draft=relationDraft;if(!draft)return;clearTimeout(draft.search?.timer);
 const search={query,ids:new Set(),pending:!!(query.trim()&&nativeInfo.recordProtocol&&vaultUnlocked&&records.some(r=>r._sealed)),error:false,truncated:false};draft.search=search;renderRelationResults(query);
 if(!search.pending)return;
 const current=()=>relationDraft===draft&&draft.search===search&&draft.epoch===privacyEpoch&&vaultUnlocked&&state.modal==='relations'&&selected()?.id===draft.id;
 search.timer=setTimeout(async()=>{
  try{
   if(!current())return;const reply=await nativeCall('searchRecords',{query:query.trim(),session:nativeInfo.session});if(!current())return;
   if(!Array.isArray(reply.ids)||reply.ids.length>100||reply.ids.some(id=>typeof id!=='string'))throw Error('Invalid search response');
   search.ids=new Set(reply.ids);search.truncated=!!reply.truncated;
  }catch{if(current())search.error=true;}
  finally{if(current()){search.pending=false;renderRelationResults(query);}}
 },180);
}
function showRelations(){
 const current=selected();if(!current||current._sealed||templateDesign||isProtected(current)&&!vaultUnlocked)return;state.modal='relations';
 relationDraft={id:current.id,epoch:privacyEpoch,refs:new Set(current.refs)};
 modal(ui('关联其他记录','Link records'),ui('选择已有邮箱或账号。关联只引用原记录，不会复制密码；取消不会更改当前关联。','Choose existing email or account records. Links reference the originals without duplicating passwords. Cancel leaves links unchanged.'),`<label class="mj-relation-search">${icon('search')}<input type="search" class="mj-field-input" data-relation-search aria-label="${ui('搜索关联记录','Search records to link')}" placeholder="${ui('搜索名称、账号或平台','Search by name, account or platform')}"></label><p id="mj-relation-status" class="mj-settings-note" role="status"></p><div id="mj-relation-results" class="mj-relation-results"></div>`,`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-action="finish-relations">${ui('应用关联','Apply links')}</button>`);
 renderRelationResults();
}
function updateRecordRelations(current,refs){
 if(!current||current!==selected()||current._sealed||templateDesign||isProtected(current)&&!vaultUnlocked)return false;
 const next=[...new Set(refs)].filter(id=>id!==current.id);
 if(next.length===current.refs.length&&next.every(id=>current.refs.includes(id)))return false;
 snapshotEditor();current.refs=next;
 // Manual-save users need the normal Save action after editing links in Read mode.
 if(!autoSaveEnabled())docMode='edit';
 return true;
}
function renderCodes(){
 const all=filtered().map(r=>nativeInfo.recordProtocol&&isProtected(r)?sealedSummary(r):r),seconds=30-Math.floor(Date.now()/1000)%30,size=tableCapacity($('#mj-workspace').clientHeight);
 state.page=resizedPage(state.page||0,state.pageSize||size,size,all.length);state.pageSize=size;
 const rows=all.slice(state.page*size,(state.page+1)*size),pages=Math.max(1,Math.ceil(all.length/size));
 $('#mj-workspace').innerHTML=`<div class="mj-page"><div class="mj-pagehead"><div><h1>${tr('动态验证码')}</h1><small>${ui('按账号查看验证码','Verification codes by account')}</small></div></div><div class="mj-otpgrid">${rows.map(r=>{
  if(r._sealed){const codes=listCodes(r);return (codes.length?codes:[null]).map(code=>`<section class="mj-otpcard" data-preview-record="${escape(r.id)}">${codeCardHeading(r,code?.title)}${previewCodeCell(r,code)}${!listPreview(r)&&previewError?`<button class="mj-text-button" data-preview-retry>${ui('重试','Retry')}</button>`:''}</section>`).join('');}
  return [r.totp?`<section class="mj-otpcard">${codeCardHeading(r)}${rowOTP(r)}</section>`:'',...r.blocks.map((b,index)=>{if(b.type!=='otp'||!b.seed)return '';const key=r.id+':'+index,code=blockCodes.get(key);return `<section class="mj-otpcard">${codeCardHeading(r,b.title)}<div class="mj-otp-cell"><div class="mj-otp-line"><strong class="mj-mono" data-component-code="${key}">${code?code.slice(0,3)+' '+code.slice(3):'••• •••'}</strong><button class="mj-icon" data-v3-editor="copy-block-otp" data-record="${escape(r.id)}" data-index="${index}" aria-label="${ui('复制验证码','Copy code')}">${icon('copy')}</button></div><small><i class="mj-otp-progress" aria-hidden="true"></i><span class="mj-otp-time">${seconds}s</span></small></div></section>`;})].join('');
 }).join('')||`<div class="mj-empty">${ui('尚未添加验证码','No verification codes yet')}</div>`}</div>${paginationControls(state.page,pages)}</div>`;tick();
}
function polishExperience(){
 if(state.view==='document'&&selected()){const r=selected(),area=tr(isProtected(r)?'密码库':'便签');$('#mj-breadcrumb').textContent=area+(r.name.trim()?' / '+r.name:'');}
 $$('.mj-note-card').forEach(card=>{const r=record(card.dataset.open),title=card.querySelector('strong');if(r&&title&&!r.name.trim())title.textContent=recordDisplayName(r);});
 $$('.mj-note-nav').forEach(button=>{const r=record(button.dataset.open);if(r&&!r.name.trim())button.querySelector('span').textContent=recordDisplayName(r);});
 $$('.mj-note-card').forEach(card=>{const r=record(card.dataset.open),preview=card.querySelector('p');if(r&&preview)preview.textContent=r.summary||richPlainText(r.blocks.find(b=>b.text)?.text||'')||tr('空白便签');});
 closeRecordMenu();
 updateFieldCopyButtons();
 if(state.view==='document'&&selected()&&!templateDesign){
  const current=selected(),heading=$('.mj-document-kind');
  if(heading&&!heading.querySelector('[data-action="relations"]'))heading.insertAdjacentHTML('beforeend',`<button class="mj-text-button mj-record-relations" data-action="relations" aria-haspopup="dialog">${icon('link-2')}${ui('关联记录','Linked records')}${current.refs.length?` <span>(${current.refs.length})</span>`:''}</button>`);
 }
 if(state.view==='document'&&selected()&&isEditing()){
  const section=$('.mj-doc-section h2');if(section&&!section.querySelector('[data-exp="extra-fields"]'))section.insertAdjacentHTML('beforeend',`<button class="mj-text-button" data-exp="extra-fields">${ui('添加预设字段…','Add preset fields…')}</button>`);
 }
 if(state.view==='document'&&selected()&&!isEditing()){const r=selected();[...document.querySelectorAll('.mj-property')].forEach((row,index)=>{const field=r.fields[index],value=row.querySelector('.mj-readvalue');if(field?.kind==='url'&&!fieldIsSecret(field)&&safeURL(field.value)&&value){value.classList.add('mj-url-value');value.innerHTML=`<a href="${escape(safeURL(field.value))}" data-shortcut="${escape(field.label)}" title="${escape(field.value)}"><span class="mj-user-content">${escape(field.value)}</span>${icon('arrow-up-right')}</a>`;}});}
 const picker=$('.mj-platform-row');if(picker&&selected()?.type==='note'&&!isProtected(selected()))picker.remove();else if(picker&&isEditing()&&!picker.querySelector('[data-exp="platforms"]'))picker.insertAdjacentHTML('beforeend',`<button class="mj-text-button" data-exp="platforms">${ui('管理…','Manage…')}</button>`);
}
function updateFieldCopyButtons(){
 if(state.view!=='document'||!selected())return;
 document.querySelectorAll('.mj-property [data-copy]').forEach(button=>{button.hidden=!selected().fields[Number(button.dataset.copy)]?.value;});
}
function polishTemplateBuilder(){
 importRuleDesigner();
 const table=$('.mj-field-table');if(!table||!builder)return;
 if(!templateOriginalKeys.has(builder))templateOriginalKeys.set(builder,new Set(builder.fields.map(field=>field.key)));
 for(const row of table.querySelectorAll('tr'))if(row.children.length>=2)row.insertBefore(row.children[1],row.children[0]);
 table.querySelector('th').textContent=ui('字段名称（可编辑）','Field name (editable)');table.querySelector('th:nth-child(2)').textContent=ui('导入标识','Import key');
 table.querySelectorAll('[data-def-label]').forEach(input=>{input.placeholder=ui('填写字段名称','Enter field name');input.maxLength=120;});
 [...table.querySelectorAll('tbody tr')].forEach((row,index)=>{
  const field=builder.fields[index],cell=row.children[1];
  if(!builder.builtin||!templateOriginalKeys.get(builder).has(field.key))cell.innerHTML=`<input data-def-key="${index}" value="${escape(field.key)}" maxlength="80" aria-label="${ui('导入标识','Import key')}" placeholder="custom.project_id">`;
  else cell.title=ui('已有字段的稳定标识；新添加的字段可直接编辑标识。','Stable key for an existing field. Newly added field keys can be edited.');
 });
 table.querySelector('thead tr').insertAdjacentHTML('beforeend',`<th><span class="mj-sr-only">${tr('移除')}</span></th>`);
 [...table.querySelectorAll('tbody tr')].forEach((row,index)=>row.insertAdjacentHTML('beforeend',`<td><button class="mj-icon mj-danger" data-exp="remove-template-field" data-index="${index}" aria-label="${escape(ui('移除字段 '+builder.fields[index].label,'Remove field '+builder.fields[index].label))}">${icon('minus-circle')}</button></td>`));
 const actions=$('.mj-template-actions');if(actions&&builder.builtin)actions.insertAdjacentHTML('beforeend',`<button class="mj-text-button" data-exp="simplify-template">${ui('精简为常用字段','Use essential fields')}</button>`);
}
function showExtraFields(){
 const r=selected(),template=recordTemplate(r),fields=(template?.fields||[]).filter(field=>!field.key.startsWith('email.')&&!r.fields.some(current=>current.key===field.key));
 modal(ui('添加预设字段','Add preset fields'),'',`<div class="mj-preset-fields">${fields.map(field=>`<button class="mj-button" data-exp="add-preset-field" data-key="${escape(field.key)}">${icon('plus')}${escape(tr(field.label))}</button>`).join('')||`<p>${ui('所有预设字段已添加。可通过组件菜单添加自定义字段。','All preset fields are present. Use the block menu for a custom field.')}</p>`}</div>${isProtected(r)&&vaultUnlocked?`<button class="mj-button" data-preset-new>${icon('plus')}${ui('自定义预设字段…','Custom preset field…')}</button>`:''}`,`<button class="mj-primary" data-action="close-modal">${tr('完成')}</button>`);
}
function requestEmptyTrash(){
 const items=trashedRecords.filter(r=>state.area==='notes'?!isProtected(r):vaultUnlocked&&isProtected(r));if(!items.length)return;
 pendingTrashPurge={area:state.area,ids:items.map(r=>r.id)};
 modal(state.area==='vault'?ui('清空密码库回收站？','Empty Vault Trash?'):ui('清空便签回收站？','Empty Notes Trash?'),ui('将永久删除 '+items.length+' 条记录。此操作无法撤销，已有备份不受影响。','Permanently delete '+items.length+' records. This cannot be undone. Existing backups are preserved.'),'',`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-button mj-danger" data-exp="confirm-empty-trash">${ui('永久删除全部','Delete all permanently')}</button>`);
}
function purgeTrashSelection(selection){
 if(!selection||selection.area==='vault'&&!vaultUnlocked)return 0;
 const ids=new Set(selection.ids),before=trashedRecords.length;
 trashedRecords.filter(r=>ids.has(r.id)&&(selection.area==='notes'?!isProtected(r):isProtected(r))).forEach(queueRecordDeletion);
 trashedRecords=trashedRecords.filter(r=>!ids.has(r.id)||(selection.area==='notes'?isProtected(r):!isProtected(r)));
 return before-trashedRecords.length;
}
function showPlatformManager(returnTo){
 if(!vaultUnlocked){requestVaultUnlock(()=>showPlatformManager(returnTo));return;}
 if(returnTo)platformReturn=returnTo;
 const items=Object.values(customPlatforms);
 modal(ui('自定义平台','Custom platforms'),ui('平台与 Logo 随密码库加密保存。','Platforms and logos are encrypted with your vault.'),`<div class="mj-platform-list">${items.map(p=>`<div>${platformLogo({type:p.template,platform:p.id,fields:[],refs:[],links:[]})}<span class="mj-user-content">${escape(p.name)}</span><button class="mj-button" data-exp="edit-platform" data-id="${escape(p.id)}">${tr('编辑')}</button></div>`).join('')||`<p class="mj-quiet">${ui('尚未添加自定义平台','No custom platforms yet')}</p>`}</div>`,`<button class="mj-button" data-exp="new-platform">${icon('plus')}${ui('添加平台','Add platform')}</button><button class="mj-primary" data-exp="finish-platforms">${tr('完成')}</button>`);
}
function editPlatform(id,supplied){
 platformDraft=supplied?structuredClone(supplied):id?structuredClone(customPlatforms[id]):{id:'platform-'+crypto.randomUUID(),name:'',url:'',family:newChooser.family||'account',logo:''};
 const d=platformDraft,editing=!!customPlatforms[platformDraft.id];
 modal(ui(editing?'编辑平台':'添加平台',editing?'Edit platform':'Add platform'),'',`<div class="mj-platform-preview">${safePlatformLogo(d.logo)?`<img src="${d.logo}" alt="">`:icon('globe-2')}<button class="mj-button" data-exp="choose-platform-logo">${ui('选择 Logo…','Choose logo…')}</button>${d.logo?`<button class="mj-text-button" data-exp="remove-platform-logo">${tr('移除')}</button>`:''}</div><label class="mj-form-label">${ui('平台名称','Platform name')}<input class="mj-field-input" data-platform-draft="name" value="${escape(d.name)}" maxlength="80"></label><label class="mj-form-label">${ui('网址','Website')}<input class="mj-field-input" data-platform-draft="url" value="${escape(d.url)}" placeholder="https://…"></label><label class="mj-form-label">${ui('资料类型','Record type')}<select data-platform-draft="family">${templateFamilies.map(f=>`<option value="${f.id}" ${f.id===d.family?'selected':''}>${tr(f.name)}</option>`).join('')}</select></label><p class="mj-settings-note">${ui('不添加图片时使用默认图标。支持 PNG 和 JPEG。','Uses a default icon without an image. Supports PNG and JPEG.')}</p>`,`<button class="mj-button" data-exp="back-platforms">${tr('取消')}</button><button class="mj-primary" data-exp="save-platform">${tr('保存')}</button>`);
}
function showRecordMenu(r,x,y,trash=false){
 closeRecordMenu();if(!r||isProtected(r)&&!vaultUnlocked)return;
 contextRecordID=r.id;const url=shortRecordURL(r),items=trash?[['restore',ui('恢复','Restore'),'rotate-ccw']]:[
 ['edit',ui('编辑','Edit'),'square-pen'],['rename',ui('重命名','Rename'),'pencil'],...(listAccountOf(r)?[['copy-account',ui('复制账号','Copy account'),'user-round']]:[]),...(listHasPassword(r)?[['copy-password',ui('复制密码','Copy password'),'key-round']]:[]),...(r.totp||r._sealed&&r.hasCodes?[['copy-otp',ui('复制验证码','Copy code'),'timer']]:[]),...(url?[['open-url',ui('打开网址','Open website'),'arrow-up-right'],['copy-url',ui('复制网址','Copy website'),'link']]:[]),['favorite',tr(r.favorite?'取消收藏':'收藏'),'star'],['trash',ui('移入回收站','Move to Trash'),'trash-2']];
 const menu=document.createElement('div');menu.className='mj-record-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',ui('记录操作','Record actions'));
 menu.innerHTML=items.map(([action,label,glyph])=>`<button role="menuitem" data-record-menu="${action}" class="${action==='trash'?'mj-danger':''}">${icon(glyph)}${escape(label)}</button>`).join('');root.append(menu);icons();
 const bounds=root.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x-bounds.left,bounds.width-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y-bounds.top,bounds.height-menu.offsetHeight-8))+'px';menu.querySelector('button')?.focus({preventScroll:true});
}
window.addEventListener('contextmenu',event=>{
 if(!$('#mj-overlay').hidden||event.target.closest('input,textarea,[contenteditable=true]'))return;
 const row=event.target.closest('[data-record-id]'),open=event.target.closest('[data-open]'),trash=event.target.closest('.mj-trash-row');
 const id=row?.dataset.recordId||open?.dataset.open||trash?.querySelector('[data-refine="restore-record"]')?.dataset.id;
 const r=record(id)||trashedRecords.find(item=>item.id===id);if(!r)return;
 event.preventDefault();event.stopImmediatePropagation();showRecordMenu(r,event.clientX,event.clientY,!!trash);
},true);
window.addEventListener('pointerdown',event=>{if(!event.target.closest('.mj-record-menu'))closeRecordMenu();},true);
window.addEventListener('keydown',event=>{
 const menu=$('.mj-record-menu');if(!menu)return;
 if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();closeRecordMenu();return;}
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}
},true);
window.addEventListener('click',async event=>{
 if(event.target.closest('[data-action="finish-relations"]')){
  event.preventDefault();event.stopImmediatePropagation();const draft=relationDraft,current=selected();
  if(!draft||draft.epoch!==privacyEpoch||draft.id!==current?.id)return;
  const refs=[...draft.refs].filter(id=>current.refs.includes(id)||relationCandidates(current).some(r=>r.id===id));
  const changed=updateRecordRelations(current,refs);closeModal();render();if(changed)remember();return;
 }
 const command=event.target.closest('[data-record-menu]');
 if(command){event.preventDefault();event.stopImmediatePropagation();const r=record(contextRecordID)||trashedRecords.find(item=>item.id===contextRecordID),action=command.dataset.recordMenu;closeRecordMenu();if(!r||isProtected(r)&&!vaultUnlocked)return;
  if(action==='restore')restoreRecord(r.id);
  if(action==='edit'){if(r._sealed)await openSealedRecord(r.id,true);else{openRecord(r.id);docMode='edit';render();}}
  if(action==='favorite'){r.favorite=!r.favorite;render();remember();}
  if(action==='trash')confirmRecordTrash(r.id);
  if(action==='rename')await beginRecordRename(r.id);
  if(action==='copy-account')copyListedValue(r,'account');
  if(action==='copy-password')copyListedValue(r,'password');
  if(action==='copy-otp')copyListedValue(r,'otp',r._sealed?listCodes(r)[0]?.index??-1:-1);
  if(action==='copy-url')copyText(shortRecordURL(r));
  if(action==='open-url')nativeCall('openURL',{url:shortRecordURL(r)}).catch(error=>toast(String(error)));
  return;
 }
 const button=event.target.closest('[data-exp]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.exp;
 try{
  if(action==='copy-url'){const r=record(button.dataset.id);if(r&&(!isProtected(r)||vaultUnlocked))await copyText(shortRecordURL(r));}
  if(action==='format-json'){const r=selected();if(!r||isProtected(r)&&!vaultUnlocked)return;const b=r.blocks[Number(button.dataset.index)],formatted=formatJSONText(b.text);snapshotEditor();b.text=formatted;b.language='json';repaintBlocks();remember();toast(ui('JSON 已格式化，可撤销','JSON formatted. Undo is available.'));}
  if(action==='remove-template-field'&&builder){removeTemplateFieldRow(Number(button.dataset.index));}
  if(action==='simplify-template'&&builder){const keys=essentialFieldKeys[builder.id];if(keys){builder.fields=builder.fields.filter(field=>keys.includes(field.key));builder.pattern=builder.fields.map(field=>'{$'+field.key+'}').join('|');renderBuilder();}}
  if(action==='extra-fields')showExtraFields();
  if(action==='add-preset-field'){const r=selected(),field=recordTemplate(r)?.fields.find(f=>f.key===button.dataset.key);if(field&&!r.fields.some(f=>f.key===field.key)&&(!isProtected(r)||vaultUnlocked)){snapshotEditor();r.fields.push({...field,value:field.default||'',secret:['secret','otp'].includes(field.kind)});syncRecordMetadata(r);closeModal();render();remember();}}
  if(action==='empty-trash')requestEmptyTrash();
  if(action==='confirm-empty-trash'){const count=purgeTrashSelection(pendingTrashPurge);pendingTrashPurge=null;closeModal();render();remember();toast(ui('已永久删除 '+count+' 条记录',count+' records permanently deleted'));}
  if(action==='related-records'){const r=record(button.dataset.id);if(r&&(!isProtected(r)||vaultUnlocked))modal(ui('关联记录','Linked records'),'',r.refs.map(record).filter(Boolean).map(item=>relatedCard(item)).join(''));}
  if(action==='platforms'){const previous=state.modal;showPlatformManager(previous==='new-record'?()=>renderNewChooser():()=>{closeModal();render();});}
  if(action==='new-platform')editPlatform();
  if(action==='edit-platform')editPlatform(button.dataset.id);
  if(action==='back-platforms'){platformDraft=null;showPlatformManager();}
  if(action==='remove-platform-logo'){platformDraft.logo='';const draft=platformDraft;editPlatformDraft(draft);}
  if(action==='choose-platform-logo'&&platformDraft&&vaultUnlocked){const revision=modalRevision,result=await nativeCall('choosePlatformLogo');if(revision!==modalRevision||!platformDraft||!vaultUnlocked)return;if(result?.logo){platformDraft.logo=safePlatformLogo(result.logo);editPlatformDraft(platformDraft);}}
  if(action==='save-platform'&&platformDraft&&vaultUnlocked){const platform=normalizedPlatformDraft(platformDraft,platformDraft.id);if(Object.values(customPlatforms).some(p=>p.id!==platform.id&&p.name.toLowerCase()===platform.name.toLowerCase()))throw new Error(ui('已存在同名平台','A platform with this name already exists'));if(!customPlatforms[platform.id]&&Object.keys(customPlatforms).length>=100)throw new Error(ui('最多可保存 100 个自定义平台','You can save up to 100 custom platforms'));customPlatforms[platform.id]=platform;platformDraft=null;newChooser.platform=platform.id;newChooser.family=platform.family;remember();showPlatformManager();}
  if(action==='finish-platforms'){const done=platformReturn;platformReturn=null;platformDraft=null;if(done)done();else{closeModal();render();}}
 }catch(error){toast(action==='format-json'?ui('不是有效的 JSON，原内容已保留。','Invalid JSON. Original content preserved.'):String(error.message||error));}
},true);
function editPlatformDraft(draft){editPlatform(draft.id,draft);}
root.addEventListener('input',event=>{const key=event.target.dataset.platformDraft;if(key&&platformDraft)platformDraft[key]=event.target.value;if(event.target.matches('[data-relation-search]'))searchRelationRecords(event.target.value);if(event.target.matches('[data-field]'))updateFieldCopyButtons();});
root.addEventListener('change',event=>{
 if(event.target.matches('[data-relation-choice]')){const draft=relationDraft;if(!draft||draft.epoch!==privacyEpoch||draft.id!==selected()?.id)return;const id=event.target.dataset.relationChoice;if(!relationCandidates(selected()).some(r=>r.id===id))return;if(event.target.checked)draft.refs.add(id);else draft.refs.delete(id);}
 if(event.target.matches('[data-platform-draft]')&&platformDraft)platformDraft[event.target.dataset.platformDraft]=event.target.value;
 if(event.target.matches('[data-exp-page]')){state.page=Math.max(0,Number(event.target.value)-1);render();}
});
new ResizeObserver(()=>{
 if(nativeReady&&vaultUnlocked&&state.area==='vault'&&state.view==='table'&&state.category!=='trash'&&!state.search&&$('#mj-overlay').hidden&&state.pageSize!==tableCapacity($('#mj-workspace').clientHeight))render();
}).observe($('#mj-workspace'));
