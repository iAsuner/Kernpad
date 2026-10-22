// Stable component identities belong to documents; templateComponentID links a
// fresh instance to its reusable definition without sharing instance IDs.
var templateDesign=null;
const templateBlockKeys=['type','text','title','language','checked','items','levels','ordered','rows','fields','seed','storage','value','values','name','data','poster','width','layout','textStyle','surface','accent','listRole'];
function ensureComponentIDs(record){
 const seen=new Set(),sources=new Set();
 for(const item of [...record.fields||[],...(record.blocks||[]).flatMap(b=>[b,...b.fields||[]])]){
  if(!/^c_[A-Za-z0-9_-]+$/.test(item.componentID||'')||seen.has(item.componentID))item.componentID='c_'+crypto.randomUUID();
  seen.add(item.componentID);
  if(item.templateComponentID){if(sources.has(item.templateComponentID))delete item.templateComponentID;else sources.add(item.templateComponentID);}
 }
 return record;
}
function templateCleanBlocks(blocks){
 return blocks.map(source=>{
  const b=Object.fromEntries(templateBlockKeys.filter(k=>Object.hasOwn(source,k)).map(k=>[k,structuredClone(source[k])]));
  b.componentID=source.templateComponentID||source.componentID;
  if(b.type==='otp')b.seed='';
  if(b.type==='form')b.fields=(source.fields||[]).map(f=>({componentID:f.templateComponentID||f.componentID,key:f.key||'custom.field',label:f.label,kind:f.kind||'text',secret:!!f.secret||['secret','otp'].includes(f.kind),value:'',...(f.listRole?{listRole:f.listRole}:{})}));
  if(b.type==='check')b.checked=false;
  return b;
 });
}
function templateArea(t){return t?.documentTemplate?.area||(templateFamily(t).id==='note'?'notes':'vault');}
function recordTemplate(r){return getTemplate(r?.templateID||r?.type);}
function templateFromDocument(r,previous=null){
 ensureComponentIDs(r);
 const prior=previous?.fields||[],fields=(r.fields||[]).map(f=>{
  const old=prior.find(x=>!x.target&&x.key===f.key);
  return {key:f.key||'custom.field_'+f.componentID.slice(2,10),label:f.label,kind:f.kind||'text',required:!!f.required,section:f.section||'',...(f.listRole?{listRole:f.listRole}:{}),...old};
 });
 const blocks=templateCleanBlocks(r.blocks||[]);
 const add=(b,property,label,kind='text')=>{
  const target=b.componentID+':'+property,old=prior.find(f=>f.target===target);
  let number=fields.length+1,key;do{key='custom.'+(b.type||'field')+'_'+number++;}while(fields.some(f=>f.key===key));
  fields.push(old?structuredClone(old):{key,label:label.slice(0,120),kind,required:false,target});
 };
 for(const [index,b] of blocks.entries()){
  const label=b.title||layoutBlockName(b)+' '+(index+1);
  if(['text','heading','quote','callout','code','check'].includes(b.type))add(b,'text',label,b.type==='code'?'multiline':'text');
  if(['date','link'].includes(b.type))add(b,'value',label,b.type==='date'?'date':'url');
  if(b.type==='otp')add(b,'seed',label,'otp');
  if(b.type==='list')add(b,'items',label,'multiline');
  if(b.type==='tags')add(b,'values',label,'multiline');
  if(b.type==='table')add(b,'rows',label,'multiline');
  if(['image','video'].includes(b.type))add(b,'name',label);
  if(b.type==='form')for(const f of b.fields)add(f,'value',f.label,f.kind);
 }
 if(fields.length>256)throw new Error(ui('规则字段超过 256 个，请减少组件或拆分模板。','More than 256 rule fields. Reduce the components or split the template.'));
 const available=new Set(fields.map(f=>f.key));let pattern='';
 if(previous){if(previous.pattern){const spec=parsePattern(previous.pattern);pattern=spec.keys.filter(k=>available.has(k)).map(k=>'{$'+k+'}').join(spec.delimiter);}}
 else pattern=fields.slice(0,24).map(f=>'{$'+f.key+'}').join('----');
 return {id:previous?.id||'custom-'+crypto.randomUUID(),name:previous?.name||r.name||ui('自定义模板','Custom template'),group:previous?.group||'other',family:previous?.family||(isProtected(r)?'account':'note'),builtin:false,userConfigured:true,pattern,relations:[],fields,blocks:[],documentTemplate:{version:1,area:previous?.documentTemplate?.area||(isProtected(r)?'vault':'notes'),blocks,documentOptions:structuredClone(r.documentOptions||{title:false,summary:false})}};
}
function templateInstanceBlocks(t){
 const blocks=structuredClone(t.documentTemplate.blocks);
 for(const item of blocks.flatMap(b=>[b,...b.fields||[]])){item.templateComponentID=item.componentID;item.componentID='c_'+crypto.randomUUID();}
 return blocks;
}
function applyTemplateValues(r,t,data){
 const components=(r.blocks||[]).flatMap(b=>[b,...b.fields||[]]);
 for(const field of t.fields||[]){
  if(!field.target||!Object.hasOwn(data,field.key))continue;
  const [id,property]=field.target.split(':'),b=components.find(b=>b.templateComponentID===id)||(!r.templateID&&components.find(b=>b.componentID===id));if(!b)continue;
  const value=String(data[field.key]??'');
  if(property==='items'||property==='values'){b[property]=value.split(/\r?\n/);if(property==='items')delete b.levels;}
  else if(property==='rows'){const rows=value.split(/\r?\n/).map(line=>line.split('\t'));const width=Math.max(...rows.map(row=>row.length));b.rows=rows.map(row=>[...row,...Array(width-row.length).fill('')]);}
  else if(['text','value','seed','name'].includes(property))b[property]=value;
 }
}

function templateListComponents(r){return [...r.fields||[],...(r.blocks||[]).flatMap(b=>b.type==='form'?b.fields||[]:b.type==='otp'?[b]:[])];}
function applyTemplateListRoles(r,t){
 const components=templateListComponents(r);for(const c of components)delete c.listRole;
 for(const f of t.fields||[]){const target=f.target?.split(':')[0],c=target?(components.find(c=>c.templateComponentID===target)||(!r.templateID&&components.find(c=>c.componentID===target))):r.fields?.find(c=>c.key===f.key);if(!c)continue;if(f.listRole)c.listRole=f.listRole;if(target&&c.type==='otp')c.title=f.label;else if(target&&!c.type){c.label=f.label;c.kind=f.kind;c.secret=['secret','otp'].includes(f.kind);}}
}
