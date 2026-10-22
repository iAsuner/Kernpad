let trashedRecords=[],templateManager={editing:false,family:null,context:'new',trash:false};
const templateFamilies=[
 {id:'account',name:'账号',icon:'contact',hint:'邮箱、社交、网站和管理台',primary:['login','email','social','console','panel-xui','panel-bt','whatsapp','telegram'],extra:['api','license','identity','wifi']},
 {id:'server',name:'服务器',icon:'server',hint:'主机连接、数据库和密钥',primary:['server'],extra:['database','ssh','cloud','domain']},
 {id:'finance',name:'银行卡与账户',icon:'credit-card',hint:'银行卡、银行账户',primary:['card','bank'],extra:[]},
 {id:'note',name:'便签',icon:'sticky-note',hint:'笔记与待办',primary:['note'],extra:[]}
];
function allTemplates(includeArchived=false){return [...Object.values(templateRegistry),...Object.values(customTemplates)].filter(t=>includeArchived||!t.archived);}
function templateFamily(t){return templateFamilies.find(f=>f.id===t.family)||templateFamilies.find(f=>[...f.primary,...f.extra].includes(t.id))||templateFamilies.find(f=>f.id===({infra:'server',finance:'finance'}[t.group]||'account'));}
function templateName(t){return t.id==='login'&&t.name==='网站账号'?'通用账号':t.id==='note'&&t.name==='普通便签'?'自由便签':t.name;}
function moveRecordToTrash(id){
 const r=record(id);if(!r||isProtected(r)&&!vaultUnlocked)return false;
 r.deletedAt=new Date().toISOString();records=records.filter(x=>x.id!==id);trashedRecords.unshift(r);
 if(editorUndo?.id===id)editorUndo=null;
 state.selected=null;state.history=[];state.view='table';state.category='all';pasteEditor=null;richSelection=null;closeModal();closeComponentMenu();render();remember();toast('已移入回收站，可从左侧恢复');return true;
}
function restoreRecord(id){
 const r=trashedRecords.find(x=>x.id===id);if(!r||isProtected(r)&&!vaultUnlocked)return false;
 delete r.deletedAt;trashedRecords=trashedRecords.filter(x=>x.id!==id);records.unshift(r);render();remember();toast('记录已恢复，原有关联保持不变');return true;
}
function trashTemplates(){return allTemplates(true).filter(t=>t.archived);}
function archiveTemplate(id){const t=getTemplate(id);if(!t)return false;t.archived=true;t.userConfigured=true;remember();return true;}
function restoreTemplate(id){const t=getTemplate(id);if(!t)return false;delete t.archived;t.userConfigured=true;remember();return true;}
function visibleTrash(){return trashedRecords.filter(r=>(state.area==='notes'?!isProtected(r):vaultUnlocked&&isProtected(r))&&(!state.search||r.name.toLowerCase().includes(state.search.toLowerCase())));}
function renderTrash(){
 root.classList.remove('mj-in-document','mj-document-edit');$('.mj-toolbar [data-v5="templates"]')?.remove();$('#mj-breadcrumb').textContent=tr('回收站');const rows=visibleTrash();
 $('#mj-workspace').innerHTML=`<div class="mj-page"><div class="mj-pagehead"><div><h1>${tr('回收站')}</h1><small>${tr('删除后保留在这里；恢复会保留原有关联。')}</small></div><button class="mj-button mj-danger" data-exp="empty-trash" ${rows.length?'':'disabled'}>${tr('清空回收站…')}</button></div><div class="mj-trash-list">${rows.length?rows.map(r=>`<div class="mj-trash-row"><span class="mj-type-icon">${icon(type(r).icon)}</span><div><strong class="mj-user-content">${escape(recordDisplayName(r))}</strong><small>${escape(tr(type(r).name))}，${escape(new Date(r.deletedAt).toLocaleDateString(locale==='en'?'en-US':'zh-CN'))}</small></div><span class="mj-spacer"></span><button class="mj-button" data-refine="restore-record" data-id="${r.id}">${icon('rotate-ccw')}${tr('恢复')}</button><button class="mj-icon mj-danger" data-refine="purge-record" data-id="${r.id}" aria-label="永久删除">${icon('trash-2')}</button></div>`).join(''):`<div class="mj-empty">${tr('回收站是空的')}</div>`}</div></div>`;
}
function renderNav(){
 renderNavigationBase();
 $$('.mj-note-nav').forEach(button=>{const r=record(button.dataset.open);if(r&&!r.name.trim())button.querySelector('span').textContent=recordDisplayName(r);});
 const search=$('#mj-search');search.placeholder=ui('搜索全部资料、平台…','Search all records, platforms…');search.disabled=false;
 if(state.area==='notes'||vaultUnlocked){const count=trashedRecords.filter(r=>state.area==='notes'?!isProtected(r):isProtected(r)).length;$('#mj-nav').insertAdjacentHTML('beforeend',`<div class="mj-nav-label"></div><button class="mj-nav-item ${state.category==='trash'?'active':''}" data-refine="trash"><i data-lucide="trash-2"></i><span>${tr('回收站')}</span><em>${count}</em></button>`);}
 $('.mj-brand strong').textContent='Kernpad';$('.mj-brand small').textContent=tr('在本机保存便签与密码');
}
function renderRefinements(){
 if(state.category==='trash'&&state.view==='table'&&(state.area==='notes'||vaultUnlocked))renderTrash();
 if(state.view==='document'&&selected()){
  $('.mj-docbar .mj-spacer')?.insertAdjacentHTML('afterend',`<button class="mj-icon" data-refine="delete-record" data-id="${selected().id}" aria-label="删除记录" title="删除记录">${icon('trash-2')}</button>`);
  const missing=selected().refs.filter(id=>!record(id));if(missing.length)$('.mj-inspector')?.insertAdjacentHTML('afterbegin',`<p class="mj-reference-missing">${tr('部分关联记录已删除或尚未解锁。恢复或解锁后会重新显示。')}</p>`);
 }
 icons();
}
function showTemplates(){templateManager={editing:false,family:null,context:'new',trash:false};renderTemplateCenter();}
function showRecordTemplates(){templateManager={editing:false,family:null,context:'switch',trash:false};renderTemplateCenter();}
function renderTemplateCenter(){
 state.modal='templates';entryDraft=null;entryPreview=null;const tm=templateManager, family=templateFamilies.find(f=>f.id===tm.family),available=allTemplates();
 let content='';
 if(tm.trash){content=`<p class="mj-parser-hint">${tr('模板删除不影响已有记录；可以在这里恢复。')}</p><div class="mj-templates">${trashTemplates().map(t=>`<div class="mj-template"><strong class="mj-user-content">${escape(tr(templateName(t)))}</strong><button class="mj-button" data-refine="restore-template" data-id="${escape(t.id)}">${icon('rotate-ccw')}${tr('恢复模板')}</button></div>`).join('')||`<p class="mj-empty">${tr('没有已删除的模板')}</p>`}</div>`;}
 else if(!family){content=`<div class="mj-family-grid">${templateFamilies.map(f=>`<button class="mj-family" data-refine="family" data-family="${f.id}">${icon(f.icon)}<strong>${tr(f.name)}</strong><span>${tr(f.hint)}</span><small>${tr('选择预设')}${icon('chevron-right')}</small></button>`).join('')}</div><p class="mj-parser-hint">${ui('可直接编辑模板名称、字段和粘贴规则；这些结构信息在本机明文保存。文档模板还会保存经过确认的普通样例内容；凭据值会清空。旧版模板的加密默认值与正文保留兼容。','Edit template names, fields and paste rules directly; this structure is stored locally as plain text. Document templates also keep reviewed ordinary sample content; credential values are cleared. Legacy encrypted defaults and bodies remain compatible.')}</p>`;}
 else{
  const order=[...family.primary,...family.extra];const templates=available.filter(t=>templateFamily(t).id===family.id).sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):999)-(order.includes(b.id)?order.indexOf(b.id):999)),main=templates.filter(t=>!family.extra.includes(t.id)),extra=templates.filter(t=>family.extra.includes(t.id));
  const cards=items=>items.map(t=>`<div class="mj-template-wrap"><button class="mj-template" data-refine="${tm.editing?'configure-template':'use-template'}" data-id="${escape(t.id)}">${icon(types[t.id]?.icon||'layout-template')}<strong class="mj-user-content">${escape(tr(templateName(t)))}</strong><small>${tm.editing?tr('编辑字段与解析规则'):escape(tr(types[t.id]?.hint||'自定义模板'))}</small></button>${tm.editing?`<button class="mj-icon mj-template-delete mj-danger" data-refine="delete-template" data-id="${escape(t.id)}" aria-label="${escape(tr('删除模板'))} ${escape(tr(templateName(t)))}">${icon('trash-2')}</button>`:''}</div>`).join('');
  content=`<div class="mj-template-crumb"><button class="mj-button" data-refine="families">${icon('arrow-left')}${tr('全部分类')}</button><strong>${tr(family.name)}</strong><span class="mj-spacer"></span>${tm.editing?`<button class="mj-button" data-refine="new-template">${icon('plus')}${tr('自定义模板')}</button>`:''}</div><div class="mj-templates">${cards(main)}</div>${extra.length?`<details class="mj-more-presets" ${tm.editing?'open':''}><summary>${tr('更多预设')}</summary><div class="mj-templates">${cards(extra)}</div></details>`:''}${templates.length?'':`<p class="mj-empty">${tr('此分类暂无模板，可在编辑模式中添加。')}</p>`}`;
 }
 const title=tm.trash?'模板回收站':tm.context==='switch'?'切换模板':'模板';
 modal(tr(title),tr(tm.editing?'调整字段和导入规则，已有记录不受影响。':'选择模板开始记录。'),content,tm.context==='switch'&&!tm.editing&&!tm.trash?`<button class="mj-button" data-v5="protected-note">${icon('lock-keyhole')}${tr('设为加锁便签')}</button>`:'');
 const head=$('.mj-modal-head');head.querySelector('[data-action="close-modal"]').insertAdjacentHTML('beforebegin',`<div class="mj-template-head-actions">${tm.editing?`<button class="mj-icon" data-refine="template-trash" aria-label="模板回收站">${icon('archive')}</button>`:''}<button class="${tm.editing?'mj-primary':'mj-button'}" data-refine="edit-templates">${icon(tm.editing?'check':'square-pen')}${tr(tm.editing?'完成':'编辑')}</button></div>`);$('.mj-modal').classList.add('mj-wide-modal');icons();localize();
}
function renderBuilder(){
 renderBuilderBase();polishTemplateBuilder();
 const group=$('#mj-tgroup');group.removeAttribute('data-draft');group.dataset.templateFamily='true';group.innerHTML=templateFamilies.map(f=>`<option value="${f.id}" ${templateFamily(builder).id===f.id?'selected':''}>${tr(f.name)}</option>`).join('');
 if(templateManager.context==='record'){$('.mj-modal-footer').innerHTML=`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-primary" data-record-template-save>${icon('check')}${ui('保存并返回记录','Save & Return to Record')}</button>`;icons();localize();return;}
 if(templateManager.editing){$('.mj-modal-footer').innerHTML=`<button class="mj-button" data-refine="back-to-templates">${tr('取消')}</button><button class="mj-primary" data-refine="save-template">${icon('check')}${tr('保存模板')}</button>`;icons();localize();}
}
function showTemplateEditor(id){
 showBuilder(id);
 if(!id&&templateManager.family){const family=templateFamilies.find(f=>f.id===templateManager.family);builder={...structuredClone(getTemplate(family.primary[0])),id:null,builtin:false,archived:false,family:family.id,name:tr('自定义模板')};renderBuilder();}
}
function confirmRecordPurge(id){
 const r=trashedRecords.find(x=>x.id===id);if(!r||isProtected(r)&&!vaultUnlocked)return;
 modal(tr('永久删除记录？'),escape(recordDisplayName(r)),`<p>${tr('此操作无法撤销。其他记录的关联将显示为不可用，已有备份不会被删除。')}</p>`,`<button class="mj-button" data-action="close-modal">${tr('取消')}</button><button class="mj-button mj-danger" data-refine="confirm-purge" data-id="${id}">${tr('永久删除')}</button>`);
}
root.addEventListener('change',e=>{if(e.target.matches('[data-template-family]')&&builder){builder.family=e.target.value;builder.group=({server:'infra',finance:'finance',note:'other'})[builder.family]||'social';}},true);
root.addEventListener('click',async e=>{
 if(e.target.closest('[data-v4="configure-current"]'))templateManager.editing=false;
 const button=e.target.closest('[data-refine]');if(!button)return;const action=button.dataset.refine,id=button.dataset.id;if(button.tagName==='SELECT'&&(action==='new-family'||action==='new-platform'||action==='platform-scope'||button.hasAttribute('data-platform-filter')))return;e.preventDefault();e.stopImmediatePropagation();
 if(action==='delete-record'){confirmRecordTrash(id);return;}
 if(action==='restore-record'){restoreRecord(id);return;}
 if(action==='trash'){state.category='trash';state.view='table';state.search='';$('#mj-search').value='';render();return;}
 if(action==='purge-record'){confirmRecordPurge(id);return;}
 if(action==='confirm-purge'){const r=trashedRecords.find(x=>x.id===id);if(r&&(!isProtected(r)||vaultUnlocked)){queueRecordDeletion(r);trashedRecords=trashedRecords.filter(x=>x.id!==id);closeModal();render();remember();toast('记录已永久删除');}return;}
 if(action==='confirm-trash'){moveRecordToTrash(id);return;}
 if(action==='unlink'){confirmUnlink(selected()?.id,id);return;}
 if(action==='confirm-unlink'){const source=record(button.dataset.source),target=button.dataset.target;if(source&&target){source.refs=source.refs.filter(ref=>ref!==target);closeModal();render();remember();toast(tr('关联已解除'));}return;}
 if(action==='search-scope'){state.searchScope=button.dataset.scope||'all';render();return;}
 if(action==='clear-platform'){state.platformFilter='all';state.page=0;render();return;}
 if(action==='new-family'){newChooser.family=button.value||button.dataset.family||'account';newChooser.platform='custom';renderNewChooser();return;}
 if(action==='new-platform'){newChooser.platform=button.value||button.dataset.platform||'custom';renderNewChooser();return;}
 if(action==='new-create'){let platform=allPlatforms().find(p=>p.id===newChooser.platform)||{id:'custom',name:'自定义平台',family:newChooser.family,template:templateFamilies.find(f=>f.id===newChooser.family)?.primary?.[0]||'note'};if(platform.id==='custom'){const name=$('#mj-new-platform-name')?.value.trim();if(name){platform=normalizedPlatformDraft({name,family:newChooser.family},'platform-'+crypto.randomUUID());customPlatforms[platform.id]=platform;}else platform={...platform,id:'none',name:'',family:newChooser.family,template:templateFamilies.find(f=>f.id===newChooser.family)?.primary?.[0]||'note'};}pendingCreatePlatform=platform;closeModal();showNew(platform.template||templateFamilies.find(f=>f.id===newChooser.family)?.primary?.[0]||'note');return;}
 if(action==='edit-templates'){templateManager.editing=!templateManager.editing;templateManager.trash=false;renderTemplateCenter();return;}
 if(action==='family'){templateManager.family=button.dataset.family;renderTemplateCenter();return;}
 if(action==='families'){templateManager.family=null;templateManager.trash=false;renderTemplateCenter();return;}
 if(action==='use-template'){const t=getTemplate(id);if(!t||t.archived)return;if(templateManager.context==='switch')switchTemplate(id);else showNew(id);return;}
 if(action==='configure-template'){showTemplateEditor(id);return;}
 if(action==='new-template'){showTemplateEditor();return;}
 if(action==='delete-template'){if(archiveTemplate(id)){renderTemplateCenter();toast('模板已移入回收站，已有记录保留');}return;}
 if(action==='restore-template'){if(restoreTemplate(id)){renderTemplateCenter();toast('模板已恢复');}return;}
 if(action==='template-trash'){templateManager.trash=!templateManager.trash;renderTemplateCenter();return;}
 if(action==='back-to-templates'){renderTemplateCenter();return;}
 if(action==='save-template'){try{saveTemplate(true);await persist();renderTemplateCenter();toast('模板已保存');}catch(error){$('#mj-template-error').textContent=error.message;}return;}
},true);

// Industry polish layer: a global, non-secret search index; platform metadata;
// reversible list actions; and a visible setup path for new records.
const platformCatalog=[
 {id:'facebook',name:'Facebook',family:'account',template:'social',url:'https://www.facebook.com/'},
 {id:'google',name:'Google',family:'account',template:'login',url:'https://accounts.google.com/'},
 {id:'microsoft',name:'Microsoft',family:'account',template:'login',url:'https://account.microsoft.com/'},
 {id:'apple',name:'Apple',family:'account',template:'login',url:'https://account.apple.com/'},
 {id:'github',name:'GitHub',family:'account',template:'login',url:'https://github.com/'},
 {id:'gitlab',name:'GitLab',family:'account',template:'login',url:'https://gitlab.com/'},
 {id:'x',name:'X / Twitter',family:'account',template:'social',url:'https://x.com/'},
 {id:'instagram',name:'Instagram',family:'account',template:'social',url:'https://www.instagram.com/'},
 {id:'whatsapp',name:'WhatsApp',family:'account',template:'whatsapp',url:'https://web.whatsapp.com/'},
 {id:'telegram',name:'Telegram',family:'account',template:'telegram',url:'https://web.telegram.org/'},
 {id:'discord',name:'Discord',family:'account',template:'login',url:'https://discord.com/app'},
 {id:'slack',name:'Slack',family:'account',template:'login',url:'https://app.slack.com/'},
 {id:'aws',name:'AWS',family:'server',template:'cloud',url:'https://console.aws.amazon.com/'},
 {id:'azure',name:'Microsoft Azure',family:'server',template:'cloud',url:'https://portal.azure.com/'},
 {id:'gcp',name:'Google Cloud',family:'server',template:'cloud',url:'https://console.cloud.google.com/'},
 {id:'cloudflare',name:'Cloudflare',family:'server',template:'cloud',url:'https://dash.cloudflare.com/'},
 {id:'aliyun',name:'阿里云',family:'server',template:'cloud',url:'https://home.console.aliyun.com/'},
 {id:'tencent-cloud',name:'腾讯云',family:'server',template:'cloud',url:'https://console.cloud.tencent.com/'},
 {id:'digitalocean',name:'DigitalOcean',family:'server',template:'cloud',url:'https://cloud.digitalocean.com/'},
 {id:'3x-ui',name:'3x-ui',family:'account',template:'panel-xui',url:''},
 {id:'baota',name:'宝塔面板',family:'account',template:'panel-bt',url:''},
 {id:'custom',name:'自定义平台',family:'account',template:'login',url:''}
];
let newChooser={family:'account',platform:'facebook'},pendingCreatePlatform=null;
const ui=(zh,en)=>locale==='en'?en:zh;
const platformAliases={facebook:['fb'],google:['gmail','谷歌'],microsoft:['outlook','hotmail','微软'],apple:['icloud','苹果'],x:['twitter','推特'],whatsapp:['wa'],telegram:['tg','电报'],gcp:['gcloud'],aliyun:['alibaba cloud'], 'tencent-cloud':['tencent cloud'], '3x-ui':['3xui','x-ui'],baota:['bt','宝塔']};
const platformDomains={facebook:['facebook.com','fb.com'],google:['google.com','gmail.com'],microsoft:['microsoft.com','live.com','outlook.com','hotmail.com'],apple:['apple.com','icloud.com'],x:['x.com','twitter.com'],whatsapp:['whatsapp.com'],telegram:['telegram.org','t.me'],aws:['aws.amazon.com'],azure:['azure.com'],gcp:['cloud.google.com'],cloudflare:['cloudflare.com'],aliyun:['aliyun.com'], 'tencent-cloud':['cloud.tencent.com'],digitalocean:['digitalocean.com']};
function platformTerms(p){return [p.name,p.id,...(platformAliases[p.id]||[])];}
function platformTokenMatch(text,term){
 const value=term.toLowerCase(),index=text.indexOf(value);if(index<0)return false;
 if(/[^\x00-\x7f]/.test(value))return true;
 return text.split(value).some((part,i,parts)=>i<parts.length-1&&(!part||!/\p{L}|\p{N}/u.test(part.at(-1)))&&(!parts[i+1]||!/\p{L}|\p{N}/u.test(parts[i+1][0])));
}
function platformFor(r){
 if(!r)return null;
 if(r.platform==='none')return null;
 if(r.platform==='custom')return Object.values(customPlatforms).find(p=>p.name===r.platformName)||{id:'custom',name:r.platformName?.trim()||ui('自定义平台','Custom platform')};
 if(r.platform){const saved=allPlatforms().find(p=>p.id===r.platform||p.name.toLowerCase()===r.platform.toLowerCase());return saved||{id:'custom',name:r.platformName||r.platform};}
 const preset={'panel-xui':'3x-ui','panel-bt':'baota',whatsapp:'whatsapp',telegram:'telegram'}[r.type];if(preset)return allPlatforms().find(p=>p.id===preset);
 // Legacy records may lack metadata. Match URL hostnames and whole title tokens,
 // never passwords, email addresses or arbitrary substrings such as the x in example.
 const urls=[...(r.links||[]).map(l=>l[1]),...(r.fields||[]).filter(f=>!f.secret&&!['secret','otp'].includes(f.kind)&&/^https?:\/\//i.test(f.value||'')).map(f=>f.value)];
 const hosts=urls.flatMap(value=>{try{return [new URL(value).hostname.toLowerCase()];}catch{return [];}});
 const matches=[];
 for(const p of allPlatforms().filter(p=>p.id!=='custom')){
  let domains=platformDomains[p.id];if(!domains){try{domains=[new URL(p.url).hostname.replace(/^www\./,'')];}catch{domains=[];}}
  for(const domain of domains)if(hosts.some(host=>host===domain||host.endsWith('.'+domain)))matches.push({p,length:domain.length});
 }
 if(matches.length)return matches.sort((a,b)=>b.length-a.length)[0].p;
 const title=(r.name||'').toLowerCase();
 return allPlatforms().filter(p=>p.id!=='custom').flatMap(p=>platformTerms(p).map(term=>({p,term}))).sort((a,b)=>b.term.length-a.term.length).find(({term})=>platformTokenMatch(title,term))?.p||null;
}
function platformName(r){return platformFor(r)?.name||ui('未设置平台','No platform');}
function platformKey(r){const p=platformFor(r);return p?.id==='custom'?'custom:'+p.name.toLowerCase():p?.id||'none';}
function matchesPlatform(r,key=state.platformFilter||'all'){return key==='all'||platformKey(r)===key;}
function filtered(){return filteredBase().filter(r=>matchesPlatform(r));}
function platformFilterControl(global=false){
 const rows=global?records.filter(r=>(!isProtected(r)||vaultUnlocked)&&((state.searchScope||'all')==='all'||state.searchScope==='notes'&&!isProtected(r)||state.searchScope==='vault'&&isProtected(r))):filteredBase();
 const entries=new Map();for(const r of rows){const key=platformKey(r),p=entries.get(key)||{id:key,name:platformName(r),count:0};p.count++;entries.set(key,p);}
 const active=state.platformFilter||'all';
 if(active==='all'&&entries.size<=1)return '';
 if(active!=='all'&&!entries.has(active))entries.set(active,{id:active,name:active.startsWith('custom:')?active.slice(7):allPlatforms().find(p=>p.id===active)?.name||ui('未设置平台','No platform'),count:0});
 const options=[{id:'all',name:ui('所有平台','All platforms'),count:rows.length},...[...entries.values()].sort((a,b)=>a.name.localeCompare(b.name,locale==='en'?'en':'zh-CN'))];
 return `<div class="mj-search-platform-filter"><label for="mj-platform-filter">${icon('globe-2')}${ui('平台','Platform')}</label><select id="mj-platform-filter" class="mj-search-platform" data-platform-filter aria-label="${ui('按平台筛选','Filter by platform')}">${options.map(p=>`<option value="${escape(p.id)}" ${active===p.id?'selected':''}>${escape(p.name)} (${p.count})</option>`).join('')}</select>${active!=='all'?`<button class="mj-icon" data-refine="clear-platform" aria-label="${ui('清除平台筛选','Clear platform filter')}">${icon('x')}</button>`:''}</div>`;
}
function recordSearchParts(r){
 const p=platformFor(r),parts=[r.name||'',r.summary||'',r.tag||'',type(r)?.name||'',...(p?platformTerms(p):[])];
 (r.fields||[]).forEach(f=>{parts.push(f.label||'',f.key||'');if(!f.secret&&f.kind!=='secret'&&f.kind!=='otp')parts.push(f.value||'');});
 linksOf(r).forEach(l=>parts.push(l[0]||'',l[1]||''));
 (r.blocks||[]).forEach(b=>{parts.push(b.text||'',b.title||'',b.language||'');if(b.rows)for(const row of b.rows)parts.push(...row);if(b.items)parts.push(...b.items);});
 return parts.filter(Boolean);
}
function searchHit(r,query){
 const q=query.toLowerCase();
 const candidates=[];
 const platform=platformFor(r);if(platform&&platformTerms(platform).some(value=>value.toLowerCase().includes(q)))candidates.push([ui('平台','Platform'),platform.name]);
 if((r.name||'').toLowerCase().includes(q))candidates.push([ui('记录名称','Title'),r.name]);
 if((r.summary||'').toLowerCase().includes(q))candidates.push([ui('说明','Summary'),r.summary]);
 if((r.tag||'').toLowerCase().includes(q))candidates.push([ui('标签','Tag'),r.tag]);
 (r.fields||[]).forEach(f=>{if((f.label||'').toLowerCase().includes(q))candidates.push([f.label,ui('字段','Field')]);else if(!f.secret&&f.kind!=='secret'&&f.kind!=='otp'&&(f.value||'').toLowerCase().includes(q))candidates.push([f.label,f.value]);});
 linksOf(r).forEach(l=>{if((l[0]+' '+l[1]).toLowerCase().includes(q))candidates.push([ui('快捷入口','Shortcut'),l[1]]);});
 (r.blocks||[]).forEach((b,i)=>{const text=[b.text,b.title,b.language,...(b.items||[]),...(b.rows||[]).flat()].filter(Boolean).join(' ');if(text.toLowerCase().includes(q))candidates.push([ui(`正文块 ${i+1}`,`Block ${i+1}`),text]);});
 return candidates[0]||[ui('记录','Record'),r.name];
}
function globalSearchHits(query){
 const q=query.trim().toLowerCase(),scope=state.searchScope||'all';
 return records.filter(r=>(!isProtected(r)||vaultUnlocked)&&(scope==='all'||scope==='notes'&&!isProtected(r)||scope==='vault'&&isProtected(r))&&matchesPlatform(r)).filter(r=>!q||(typeof nativeInfo!=='undefined'&&nativeInfo.recordProtocol&&isProtected(r)?nativeSearchMatch(r,q):recordSearchParts(r).join(' ').toLowerCase().includes(q))).map(r=>({record:r,hit:q&&typeof nativeInfo!=='undefined'&&nativeInfo.recordProtocol&&isProtected(r)?[ui('受保护内容匹配','Protected content match'),ui('打开记录查看','Open record to view')]:q?searchHit(r,q):[ui('平台','Platform'),platformName(r)]}));
}
function renderGlobalSearch(){
 refreshNativeSearch();const q=state.search.trim(),hits=globalSearchHits(q),scope=state.searchScope||'all';
 root.classList.remove('mj-in-document','mj-document-edit');$('.mj-toolbar [data-v5="templates"]')?.remove();
 $('#mj-breadcrumb').textContent=ui('全局搜索','Global search');
 const scopes=[['all',ui('全部','All')],['notes',ui('便签','Notes')],['vault',ui('密码库','Vault')]];
 $('#mj-workspace').innerHTML=`<div class="mj-page mj-global-search-page"><div class="mj-pagehead"><div><h1>${escape(ui('搜索资料','Search'))}</h1><small>${hits.length?ui(`找到 ${hits.length} 条匹配记录`,`Found ${hits.length} matching records`):ui('搜索标题、平台、地址、账号、标签、正文和表格','Search titles, platforms, URLs, accounts, tags, blocks and tables')}</small></div></div><div class="mj-search-scopes">${scopes.map(([id,label])=>`<button class="mj-chip ${scope===id?'active':''}" data-refine="search-scope" data-scope="${id}">${label}</button>`).join('')}</div>${platformFilterControl(true)}${hits.length?`<div class="mj-search-results">${hits.map(({record:r,hit})=>`<button class="mj-search-result cursor-interaction" data-open="${escape(r.id)}"><span class="mj-search-result-icon">${icon(type(r).icon)}</span><span class="mj-search-result-copy"><strong>${escape(recordDisplayName(r))}</strong><small>${escape(platformName(r))}，${escape(tr(type(r).name))}，${escape(hit[0])}</small><em>${escape(String(hit[1]||'').slice(0,150))}</em></span><span class="mj-search-result-state">${isProtected(r)?icon('lock-keyhole'):icon('file-text')}${icon('chevron-right')}</span></button>`).join('')}</div>`:`<div class="mj-empty mj-search-empty">${icon('search')}<p>${q?ui('没有找到匹配资料','No matching records'):ui('输入关键词开始全局搜索','Type a keyword to search all accessible records')}</p><small>${ui('受保护资料只在解锁后参与检索，秘密字段不会进入明文索引。','Protected records are searchable after unlock; secret values never enter a plaintext index.')}</small></div>`}</div>`;
 decorateNativeSearch();
}
function confirmRecordTrash(id){
 const r=record(id);if(!r||isProtected(r)&&!vaultUnlocked)return;
 const active=document.activeElement?.closest('[data-rich-block]');if(active&&state.selected===id&&isEditing())readRich(active);
 modal(r.type==='note'?ui('将这篇文档移入回收站？','Move this document to Trash?'):ui('将这条记录移入回收站？','Move this record to Trash?'),escape(recordDisplayName(r)),`<p>${ui('内容及其中的图片、视频会一起移入回收站。你可以在回收站恢复，原有关联会保留。','All content, including images and videos, will move to Trash. You can restore it there with its existing links.')}</p>`,`<button class="mj-button" data-action="close-modal" data-trash-cancel>${tr('取消')}</button><button class="mj-button mj-danger" data-refine="confirm-trash" data-id="${escape(id)}">${ui('移入回收站','Move to Trash')}</button>`);
 queueMicrotask(()=>$('#mj-overlay [data-trash-cancel]')?.focus({preventScroll:true}));
}
function confirmUnlink(sourceId,targetId){
 const source=record(sourceId),target=record(targetId);if(!source||!target||isProtected(source)&&!vaultUnlocked)return;
 source.refs=source.refs.filter(id=>id!==targetId);render();remember();toast(tr('关联已解除'));
}
function platformPicker(r){
 const current=platformFor(r)?.id||'none';
 if(!isEditing())return `<div class="mj-platform-row"><span class="mj-platform-label">${icon('globe-2')}${ui('平台','Platform')}</span><span class="mj-user-content">${escape(platformName(r))}</span></div>`;
 const options=[{id:'none',name:ui('未设置平台','No platform')},...allPlatforms()];
 return `<div class="mj-platform-row"><span class="mj-platform-label">${icon('globe-2')}<span>${ui('平台','Platform')}</span></span><select class="mj-platform-select" data-platform-record="${escape(r.id)}" aria-label="${ui('选择平台','Choose platform')}">${options.map(p=>`<option value="${p.id}" ${current===p.id?'selected':''}>${escape(p.id==='custom'?ui('自定义平台','Custom platform'):p.name)}</option>`).join('')}</select>${current==='custom'?`<input class="mj-platform-select mj-user-content" data-platform-name="${escape(r.id)}" value="${escape(r.platformName||'')}" aria-label="${ui('自定义平台名称','Custom platform name')}" placeholder="${ui('平台名称','Platform name')}">`:''}<span class="mj-platform-hint"></span></div>`;
}
function decorateRelations(){
 const r=selected();if(!r||state.view!=='document')return;
 $$('.mj-related').forEach(card=>{const open=card.querySelector('[data-open]');if(!open||!r.refs.includes(open.dataset.open)||card.querySelector('[data-refine="unlink"]'))return;card.insertAdjacentHTML('beforeend',`<button class="mj-unlink" data-refine="unlink" data-id="${escape(open.dataset.open)}" aria-label="${ui('解除与 '+(record(open.dataset.open)?.name||'记录')+' 的关联','Remove link to '+(record(open.dataset.open)?.name||'record'))}">${icon('unlink-2')}${ui('解除关联','Unlink')}</button>`);});
}
function decorateListActions(){
 if(state.view!=='table'||state.category==='trash')return;
 const list=state.area==='vault'?filtered().slice((state.page||0)*(state.pageSize||1),((state.page||0)+1)*(state.pageSize||1)):filtered();
 $$('.mj-table tbody tr').forEach((row,i)=>{const r=list[i];if(!r||row.querySelector('[data-refine="delete-record"]'))return;row.dataset.recordId=r.id;row.lastElementChild?.insertAdjacentHTML('beforeend',`<button class="mj-row-delete" data-refine="delete-record" data-id="${escape(r.id)}" aria-label="${ui('删除 '+r.name,'Delete '+r.name)}" title="${ui('移入回收站','Move to Trash')}">${icon('trash-2')}</button>`);});
 $$('.mj-note-card').forEach(card=>{const id=card.dataset.open;if(!id||card.querySelector('[data-refine="delete-record"]'))return;card.insertAdjacentHTML('beforeend',`<span class="mj-card-delete" role="button" tabindex="0" data-refine="delete-record" data-id="${escape(id)}" aria-label="${ui('删除 '+(record(id)?.name||'便签'),'Delete note')}">${icon('trash-2')}</span>`);});
}
function renderRefinements(){
 if(state.search.trim()){renderGlobalSearch();icons();return;}
 if(state.category==='trash'&&state.view==='table'&&(state.area==='notes'||vaultUnlocked)){renderTrash();icons();return;}
 if(state.view==='document'&&selected()){
  if(!$('.mj-docbar [data-refine="delete-record"]'))$('.mj-docbar .mj-spacer')?.insertAdjacentHTML('afterend',`<button class="mj-icon mj-doc-delete" data-refine="delete-record" data-id="${escape(selected().id)}" aria-label="${ui('删除记录','Delete record')}" title="${ui('移入回收站','Move to Trash')}">${icon('trash-2')}</button>`);
  decorateRelations();
 }
 if(state.view==='table'&&(state.area==='notes'||vaultUnlocked)){
  const toolbar=$('.mj-viewtools');if(toolbar)toolbar.insertAdjacentHTML('afterbegin',platformFilterControl());else $('.mj-pagehead')?.insertAdjacentHTML('afterend',platformFilterControl());
  if(!filtered().length&&state.platformFilter&&state.platformFilter!=='all')$('.mj-table-wrap,.mj-note-grid,.mj-otpgrid')?.insertAdjacentHTML('afterend',`<div class="mj-empty">${ui('此平台下没有匹配记录','No matching records for this platform')}<br><button class="mj-button" data-refine="clear-platform">${ui('清除平台筛选','Clear platform filter')}</button></div>`);
 }
 decorateListActions();icons();
}
function renderNewChooser(){
 state.modal='new-record';
 const family=templateFamilies.find(f=>f.id===newChooser.family)||templateFamilies[0],platforms=allPlatforms().filter(p=>p.family===family.id||p.id==='custom');
 modal(ui('新建记录','New record'),ui('选择类型和平台，稍后可继续编辑。','Choose a type and platform. You can edit the details later.'),`
 <div class="mj-new-flow">
 <label class="mj-form-label">${ui('资料类型','Record type')}<select class="mj-field-input" data-refine="new-family">${templateFamilies.map(f=>`<option value="${f.id}" ${f.id===family.id?'selected':''}>${escape(tr(f.name))}</option>`).join('')}</select></label>
 <label class="mj-form-label">${ui('平台','Platform')}<select class="mj-field-input" data-refine="new-platform">${platforms.map(p=>`<option value="${p.id}" ${p.id===newChooser.platform?'selected':''}>${escape(p.id==='custom'?ui('其他平台','Other platform'):p.name)}</option>`).join('')}</select></label>
 <button class="mj-text-button mj-manage-platforms" data-exp="platforms">${ui('管理平台与 Logo…','Manage platforms and logos…')}</button>${newChooser.platform==='custom'?`<label class="mj-form-label">${ui('平台名称','Platform name')}<input id="mj-new-platform-name" class="mj-field-input" placeholder="${ui('可选','Optional')}"></label>`:''}
 </div>`,`<button class="mj-button" data-action="close-modal">${ui('取消','Cancel')}</button><button class="mj-primary" data-refine="new-create">${ui('创建','Create')}</button>`);localize();icons();
}
function showNewChooser(){const preferred=defaultDocumentTemplate('vault');if(preferred){showNew(preferred.id);return;}newChooser={family:'account',platform:'custom'};renderNewChooser();}
function showNew(id){
 const t=getTemplate(id)||getTemplate('login');if(!t)return;
 const selectedPlatform=pendingCreatePlatform;pendingCreatePlatform=null;
 if(templateArea(t)==='notes'){createPlainNote({template:t});return;}
 const create=()=>{const r=schemaRecord(t,{}, {lightweight:true,name:selectedPlatform?.id!=='custom'&&selectedPlatform?.id!=='none'&&selectedPlatform?.name?selectedPlatform.name:ui('未命名记录','Untitled record')});r.protected=true;if(selectedPlatform){r.platform=selectedPlatform.id;r.platformName=selectedPlatform.name;if(selectedPlatform.url)r.links=[[`打开 ${selectedPlatform.name}`,selectedPlatform.url]];}records.unshift(r);closeModal();openRecord(r.id);docMode='edit';render();remember();};
 requestVaultUnlock(create);
}
function openRecord(id){
 const r=record(id);if(!r)return;
 if(r._sealed){openSealedRecord(id);return;}
 if(isProtected(r)&&!vaultUnlocked){requestVaultUnlock(()=>openRecord(id));return;}
 // Internal navigation preserves the authenticated session. render() still
 // commits and seals the departing protected detail through record residency.
 state.search='';const search=$('#mj-search');if(search)search.value='';state.area=isProtected(r)?'vault':'notes';if(state.view==='document'&&state.selected!==id)state.history.push(state.selected);state.selected=id;state.view='document';docMode='view';pasteEditor=null;richSelection=null;activeRichIndex=null;insertContext=null;closeModal();render();remember();
}
function renderDocument(){
 renderDocumentV4();const r=selected();if(!r)return;
 $('#mj-breadcrumb').textContent=(isProtected(r)?ui('密码库','Vault'):ui('便签','Notes'))+' / '+r.name;
 if(r.type==='note'&&!r.fields.length)$('.mj-doc-section')?.remove();
 if(!isProtected(r))$('[data-v4="paste-entry"]')?.remove();
 if(!isProtected(r)&&!r.refs.length&&!linksOf(r).length&&!records.some(other=>other.refs.includes(r.id))){$('.mj-inspector')?.remove();$('.mj-docbody').style.gridTemplateColumns='1fr';}
 if(!isProtected(r))$('.mj-document-kind').innerHTML=`${icon('sticky-note')}${ui('便签','Note')}<span class="mj-chip">${escape(r.tag)}</span>`;
 else $('.mj-document-kind').insertAdjacentHTML('beforeend',`<span class="mj-protection-chip">${icon('lock-keyhole')}${ui('密码库保护','Vault protected')}</span>`);
 if(isProtected(r)||isEditing()||platformFor(r))$('.mj-document-kind').insertAdjacentHTML('afterend',platformPicker(r));
 $('.mj-toolbar [data-v5="templates"]')?.remove();const newButton=$('.mj-toolbar [data-action="new"]');if(newButton&&isEditing())newButton.insertAdjacentHTML('beforebegin',`<button class="mj-button mj-template-switch mj-template-switch-prominent cursor-interaction" data-v5="templates">${icon('layout-template')}<span>${r.id.startsWith('new-')?ui('选择模板','Choose template'):ui('切换模板','Switch template')}</span>${icon('chevron-down')}</button>`);
}
root.addEventListener('change',e=>{
 const platformScope=e.target.closest('[data-platform-filter]');if(platformScope){state.platformFilter=platformScope.value||'all';state.page=0;render();$('#mj-platform-filter')?.focus();return;}
 const name=e.target.closest('[data-platform-name]');if(name){const r=record(name.dataset.platformName);if(r){r.platformName=name.value.trim();remember();}return;}
 const platform=e.target.closest('[data-platform-record]');if(platform){const r=record(platform.dataset.platformRecord),p=allPlatforms().find(x=>x.id===platform.value);if(r){r.platform=p?.id||platform.value;r.platformName=p?.id==='custom'?'':p?.name||'';if(p?.url&&!linksOf(r).length)r.links=[[`打开 ${p.name}`,p.url]];syncRecordMetadata(r);remember();render();toast(ui('平台已更新','Platform updated'));}return;}
 const newFamily=e.target.closest('[data-refine="new-family"]'),newPlatform=e.target.closest('[data-refine="new-platform"]');if(newFamily){newChooser.family=newFamily.value;newChooser.platform='custom';renderNewChooser();}else if(newPlatform){newChooser.platform=newPlatform.value;renderNewChooser();}
},true);
root.addEventListener('keydown',e=>{const action=e.target.closest?.('[data-refine="delete-record"]');if(action&&(e.key==='Enter'||e.key===' ')){e.preventDefault();confirmRecordTrash(action.dataset.id);}},true);
