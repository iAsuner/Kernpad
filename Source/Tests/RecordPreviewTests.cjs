const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
let now=60000,delay=false,deferred=null,fail=false,failSave=false,count=0;const calls=[],listeners=[];
const ctx={structuredClone,Set,Map,Promise,Date:class extends Date{static now(){return now;}},
 window:{addEventListener:(name,fn,capture)=>listeners.push({name,fn,capture})},
 document:{querySelectorAll:selector=>selector==='[data-record-id],[data-preview-record]'?vm.runInContext('visible.map(id=>({dataset:{recordId:id}}))',ctx):[]},
 nativeCall:async(command,payload)=>{
  calls.push({command,payload:structuredClone(payload)});
  if(command==='copyRecordValue')return {copied:true};
  if(command!=='recordPreviews')throw new Error('Unexpected command '+command);
  if(fail){fail=false;throw new Error('Synthetic preview failure');}
  const result={step:Math.floor(now/30000),previews:payload.ids.map(id=>({id,account:id+'@example.invalid',accountSecret:false,hasPassword:true,url:'',step:Math.floor(now/30000),codes:[{index:-1,title:'',code:'123456'}]}))};
  if(delay)return new Promise(resolve=>deferred={resolve,result});return result;
 }};
vm.createContext(ctx);const run=code=>vm.runInContext(code,ctx),tick=()=>new Promise(resolve=>setImmediate(resolve));
ctx.save=async()=>{if(failSave){failSave=false;throw new Error('Synthetic save failure');}};
run(`let nativeInfo={recordProtocol:1,session:'page-ticket'},vaultUnlocked=true,privacyEpoch=0,redactionPending=null;
let state={area:'vault',view:'table',category:'all',page:0,search:'',platformFilter:'all'},visible=['a'],renders=0;
let records=['a','b','c'].map(id=>({id,type:id==='b'?'email':'login',name:id,_sealed:true,fields:[],blocks:[],links:[],refs:id==='a'?['b']:[]}));
function record(id){return records.find(r=>r.id===id);}function isProtected(){return true;}function ui(zh,en){return en;}
function render(){renders++;}function toast(){}function updateActivity(){}function persist(){return save();}
function accountField(r){return r.fields[0];}function passwordField(r){return r.fields[1];}
`);
run(fs.readFileSync(path.join(__dirname,'../Web/record-previews.js'),'utf8'));
const check=(label,ok)=>{assert.ok(ok,label);count++;};
const previewCalls=()=>calls.filter(call=>call.command==='recordPreviews');
async function waiting(){for(let i=0;i<100&&!deferred;i++)await tick();assert.ok(deferred,'bridge request expected');}
(async()=>{
 await ctx.refreshListPreviews();
 check('visible page includes its primary association only',previewCalls()[0].payload.ids.join(',')==='a,b');
 check('previews remain outside editable sealed records',run('records.every(r=>r._sealed&&r.fields.length===0)&&recordPreviews.size===2'));
 check('account is immediately usable without opening detail',run("listAccountOf(record('a'))")==='a@example.invalid');
 check('record and OTP display use current step',run("listCodes(record('a'))[0].code")==='123456');
 const before=previewCalls().length;await ctx.refreshListPreviews();check('same page and time step do not decrypt again',previewCalls().length===before);
 const copyButton={dataset:{qcopy:'a',qkey:'password'}};let stopped=false;
 listeners[0].fn({target:{closest:s=>s==='[data-qcopy],[data-preview-code]'?copyButton:null},preventDefault(){},stopImmediatePropagation(){stopped=true;}});await tick();
 const copy=calls.at(-1);check('one click copies natively without requesting plaintext',stopped&&copy.command==='copyRecordValue'&&copy.payload.id==='a'&&copy.payload.key==='password'&&!JSON.stringify(copy.payload).includes('value'));
 run("visible=['c'];state.page=1");await ctx.refreshListPreviews();
 check('turning page drops previous page accounts and codes',run("recordPreviews.size===1&&!recordPreviews.has('a')&&!recordPreviews.has('b')&&recordPreviews.has('c')"));
 now=90000;check('expired verification code is unavailable immediately',run("listCodes(record('c')).length===0"));await ctx.refreshListPreviews();
 check('new time step refreshes only the current page',previewCalls().at(-1).payload.ids.join(',')==='c'&&run("listCodes(record('c')).length===1"));
 delay=true;deferred=null;run("visible=['a'];state.page=0");const late=ctx.refreshListPreviews();await waiting();
 run("state.view='document'");ctx.refreshListPreviews();deferred.resolve(deferred.result);await late;
 check('late page response cannot refill a detail view',run('recordPreviews.size===0'));
 deferred=null;run("state.view='table'");const locked=ctx.refreshListPreviews();await waiting();run('vaultUnlocked=false;privacyEpoch++');ctx.refreshListPreviews();deferred.resolve(deferred.result);await locked;
 check('locking clears page data and rejects in-flight response',run('recordPreviews.size===0&&previewPending===null'));
 deferred=null;run("vaultUnlocked=true;nativeInfo.session='new-ticket'");const oldSession=ctx.refreshListPreviews();await waiting();run("nativeInfo.session='newer-ticket';clearRecordPreviews()");deferred.resolve(deferred.result);await oldSession;
 check('reauthentication discards the old ticket response',run('recordPreviews.size===0'));
 delay=false;fail=true;await ctx.refreshListPreviews();
 check('failure leaves summaries intact with a retry state',run('previewError.length>0&&records.every(r=>r._sealed)'));
 const failedCount=previewCalls().length;await ctx.refreshListPreviews();check('failure does not create an automatic retry loop',previewCalls().length===failedCount);
 await ctx.refreshListPreviews(true);check('explicit retry restores quick values',run("previewError===''&&listAccountOf(record('a'))==='a@example.invalid'"));
 run('clearRecordPreviews()');failSave=true;const requestsBefore=previewCalls().length;await ctx.refreshListPreviews();
 check('failed save prevents previews from reading stale disk content',previewCalls().length===requestsBefore&&run('recordPreviews.size===0'));
 run("clearRecordPreviews();state.search='private'");await ctx.refreshListPreviews();check('search does not silently load all credentials',previewCalls().length===requestsBefore);
 run("state.search='';state.category='codes';visible=['a']");await ctx.refreshListPreviews();check('code overview reads its page without unrelated associations',previewCalls().at(-1).payload.ids.join(',')==='a');
 run("state.category='all';records=Array.from({length:42},(_,i)=>({id:'many-'+i,type:'login',_sealed:true,fields:[],blocks:[],refs:[],links:[]}));visible=records.map(r=>r.id)");
 const batchStart=previewCalls().length;await ctx.refreshListPreviews();
 check('each native request is capped at forty IDs',previewCalls().slice(batchStart).map(c=>c.payload.ids.length).join(',')==='40,2');
 console.log(`${count} page previews / native copy / OTP refresh / stale response checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
