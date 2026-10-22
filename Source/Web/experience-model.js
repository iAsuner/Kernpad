// Pure helpers shared by the offline interface and regression tests.
function formatJSONText(text){
 JSON.parse(text); // Validate without reserializing numbers, strings or key order.
 const tokens=text.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)||[];
 let result='',depth=0;const newline=()=>{result+='\n'+'  '.repeat(depth);};
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i],previous=tokens[i-1],next=tokens[i+1];
  if(token==='{'||token==='['){result+=token;if(next!=='}'&&next!==']'){depth++;newline();}}
  else if(token==='}'||token===']'){if(previous!=='{'&&previous!=='['){depth--;newline();}result+=token;}
  else if(token===','){result+=token;newline();}
  else if(token===':')result+=': ';
  else result+=token;
 }
 return result;
}
function tableCapacity(height){return Math.max(1,Math.min(40,Math.floor((height-212)/84)));}
function resizedPage(page,oldSize,newSize,total){return Math.min(Math.floor(Math.max(0,page)*oldSize/newSize),Math.max(0,Math.ceil(total/newSize)-1));}
function fieldIsSecret(field){return !!field&&(!!field.secret||['secret','otp'].includes(field.kind));}
function publicRecordLinks(record){
 const fields=record.fields||[],hidden=new Set(fields.filter(fieldIsSecret).map(field=>field.value).filter(Boolean));
 const links=fields.some(field=>field.shortcut)?fields.filter(field=>field.shortcut&&!fieldIsSecret(field)).map(field=>[field.shortcut,field.value]):record.links||[];
 return links.filter(link=>!hidden.has(link[1])).map(link=>[link[0],safeURL(link[1])]).filter(link=>link[1]);
}
const essentialFieldKeys={
 email:['account','password','url'],social:['account','password','url'],login:['account','password','url'],
 server:['host','port','account','password'],database:['engine','host','port','database','account','password'],ssh:['private_key','public_key','password'],
 console:['account','password','url'],cloud:['account','password','url'],card:['holder','number','expiry','cvv'],bank:['bank','holder','number','account','password'],
 api:['url','token','access_id','access_secret'],domain:['domain','registrar','expiry','url'],wifi:['network','password','security'],
 license:['product','license','expiry'],identity:['document_type','name','number','expiry'],note:[],
 'panel-xui':['url','account','password'],'panel-bt':['url','account','password'],whatsapp:['phone','password'],telegram:['phone','account','password']
};
function stableJSON(value){return JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function makeStarterTemplate(template,standard){
 if(!template?.builtin||template.userConfigured||!standard||stableJSON(template.fields)!==stableJSON(standard.fields)||template.pattern!==standard.pattern)return template;
 const keys=essentialFieldKeys[template.id];if(!keys)return template;
 const fields=template.fields.filter(field=>keys.includes(field.key));
 return {...template,fields,pattern:fields.map(field=>'{$'+field.key+'}').join('|'),blocks:[{type:'text',text:''}]};
}
function removeTemplateField(template,index){
 if(!Number.isInteger(index)||index<0||index>=template.fields.length)return false;
 const key=template.fields[index].key;
 let pattern=template.pattern;
 if(pattern){const parsed=parsePattern(pattern);pattern=parsed.keys.filter(value=>value!==key).map(value=>'{$'+value+'}').join(parsed.delimiter);}
 template.fields.splice(index,1);template.pattern=pattern;return true;
}
function safePlatformLogo(value){return typeof value==='string'&&value.length<=180000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';}
function normalizedPlatformDraft(draft,id){
 const name=String(draft.name||'').trim(),url=String(draft.url||'').trim(),family=draft.family||'account';
 if(!name||name.length>80)throw new Error('请填写 1–80 个字的平台名称');
 if(!['account','server','finance','note'].includes(family))throw new Error('平台分类无效');
 if(url){const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||url.length>2048)throw new Error('请填写不含账号密码的 HTTP / HTTPS 地址');}
 if(!/^platform-[A-Za-z0-9_-]+$/.test(id))throw new Error('平台编号无效');
 return {id,name,url,family,template:({account:'login',server:'server',finance:'card',note:'note'})[family],logo:safePlatformLogo(draft.logo)};
}
