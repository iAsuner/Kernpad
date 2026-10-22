function recordDisplayName(r){
 if(r.name?.trim())return r.name;
 if(r.type==='note'&&!isProtected(r))for(const block of r.blocks||[]){
  if(!['text','heading','quote','check','list'].includes(block.type))continue;
  const line=(block.text||(block.items||[]).join(' ')).split(/\r?\n/).map(s=>richPlainText(s).trim()).find(Boolean);
  if(line)return Array.from(line).slice(0,80).join('');
 }
 return tr('未命名便签');
}
function makeBlock(id){const block=makeNativeBlock(id);if(locale==='en'){if(block.title)block.title=tr(block.title);if(block.text)block.text=tr(block.text);}return block;}
function schemaRecord(template,data={},options={}){
 if(template.documentTemplate){const r=schemaNativeBase({...template,fields:template.fields.filter(f=>!f.target),blocks:[]},data,options);r.templateID=template.id;r.type=templateArea(template)==='notes'?'note':template.id;r.protected=templateArea(template)==='vault';r.blocks=templateInstanceBlocks(template);r.documentOptions=structuredClone(template.documentTemplate.documentOptions);applyTemplateValues(r,template,data);applyTemplateListRoles(r,template);syncRecordMetadata(r);ensureComponentIDs(r);return r;}
 const r=schemaNativeBase(options.lightweight?makeStarterTemplate(template,originalTemplates[template.id]):template,data,options);
 if(locale==='en'){
  if(r.name.startsWith('未命名'))r.name='Untitled '+tr(template.name).toLowerCase();
  if(r.name===template.name)r.name=tr(r.name);r.tag=tr(r.tag);
  for(const b of r.blocks){if(b.text)b.text=tr(b.text);if(b.title)b.title=tr(b.title);if(b.rows)b.rows=b.rows.map(row=>row.map(tr));}
 }
 ensureComponentIDs(r);return r;
}
function createPlainNote(options={}){const r=schemaRecord(options.template||defaultDocumentTemplate('notes')||getTemplate('note'),{},{name:tr('未命名便签'),lightweight:true});r.name='';if(!r.templateID)r.documentOptions={title:false,summary:false};r.protected=false;r.tag=tr('便签');if(options.expiresAt)r.expiresAt=options.expiresAt;records.unshift(r);openRecord(r.id);docMode='edit';render();scheduleSave();requestAnimationFrame(()=>{const title=$('.mj-doc-title');if(title&&!title.hidden)title.focus();else $('[data-rich-block]')?.focus();});return r;}
// Empty libraries offer a clear first action instead of showing demo credentials.
function renderEmptyNotes(){
 if(state.area!=='notes'||filtered().length)return;
 const favorites=state.category==='favorites';
 $('.mj-note-grid')?.insertAdjacentHTML('afterend',`<div class="mj-empty"><p>${favorites?ui('还没有收藏的便签。右键便签即可收藏。','No favorite notes yet. Right-click a note to add it.'):ui('记下想法、待办或常用信息。','Capture ideas, tasks or useful information.')}</p><button class="mj-primary" ${favorites?'data-category="all"':'data-action="new"'}>${icon(favorites?'files':'plus')}${favorites?ui('查看全部便签','Show all notes'):ui('新建便签','New note')}</button></div>`);icons();
}
new MutationObserver(()=>{if(state.area==='notes'&&state.view==='table'&&$('.mj-note-grid')&&!$('.mj-empty'))renderEmptyNotes();}).observe($('#mj-workspace'),{childList:true});
