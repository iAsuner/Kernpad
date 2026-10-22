// Search IDs carry no plaintext and are cleared with record residency.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {webcrypto}=require('crypto');
const native=fs.readFileSync(path.join(__dirname,'../Web/native.js'),'utf8'),refine=fs.readFileSync(path.join(__dirname,'../Web/refinements.js'),'utf8');
const saves=[],opens=[];let deferred=null,delay=false,fail=false,count=0;
const full=id=>({id,type:'login',name:id,refs:[],links:[],fields:[{label:'Password',kind:'secret',value:'synthetic-'+id}],blocks:[{type:'text',text:'private-body-'+id}],totp:true,otpSecret:'SYNTHETICSEED'});
const ctx={crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,clearTimeout,Promise,Set,JSON,
 nativeCall:async(command,payload)=>{
  if(command==='openRecord'){opens.push(payload.id);if(delay)return new Promise(resolve=>deferred={resolve,id:payload.id});return structuredClone(full(payload.id));}
  if(command==='save'){if(fail){fail=false;throw new Error('Synthetic disk failure');}saves.push(structuredClone(payload));return {saved:true};}
  throw new Error('Unexpected command '+command);
 }};
vm.createContext(ctx);vm.runInContext('function clearNativeSearch(){}',ctx);const run=code=>vm.runInContext(code,ctx),tick=()=>new Promise(resolve=>setImmediate(resolve));
run(fs.readFileSync(path.join(__dirname,'../Web/document-values.js'),'utf8'));
run(`let nativeInfo={recordProtocol:1,session:'synthetic-ticket'},nativeReady=true,nativeLocked=false,vaultUnlocked=true,nativeBusy=false;
let deletedRecordIDs=new Set(),detailEpoch=0,detailNavigation='',redactionPending=null,saveTimer,saveChain=Promise.resolve(),lastSaved='',privacyEpoch=0;
let records=[],trashedRecords=[],state={area:'vault',view:'table',selected:null,history:[],category:'all',search:''};
let templateRegistry={},customTemplates={},customPlatforms={},otpValues=new Map(),blockCodes=new Map(),otpVersion=0,blockCodeVersion=0,blockCodeStamp='',otpStep=-1;
let editorUndo=null,fieldTarget=null,pasteEditor=null,entryDraft=null,entryPreview=null,richSelection=null,insertContext=null,markdownDraft='',activeRichIndex=null,docMode='view';
function record(id){return records.find(r=>r.id===id);}function selected(){return record(state.selected);}function hasCodes(r){return r.totp||r.blocks.some(b=>b.type==='otp');}
function clearRichState(){}function closeModal(){}function saveStatus(){}function toast(){}function remember(){}function $(){return {value:''};}
function clearRecordPreviews(){}
function render(){updateRecordResidency();}function lock(){vaultUnlocked=false;privacyEpoch++;detailEpoch++;records=[];}
function requestVaultUnlock(){}function requestAnimationFrame(){}
`);
run(native.slice(native.indexOf('function isProtected('),native.indexOf('function saveStatus(')));
const catalog=fs.readFileSync(path.join(__dirname,'../Web/template-catalog.js'),'utf8');run(catalog.slice(0,catalog.indexOf('let templateFieldDraft=')));run('let templateFieldDraft=null;');
run(native.slice(native.indexOf('function persist('),native.indexOf('function scheduleSave(')));
run(refine.slice(refine.indexOf('function openRecord('),refine.indexOf('function renderDocument(')));
ctx.full=full;run("records=['a','b'].map(id=>sealedSummary(full(id)))");
async function until(test){const end=Date.now()+3000;while(!test()){if(Date.now()>end)throw new Error('Timed out waiting for bridge request');await tick();}}
const check=(label,value)=>{assert.ok(value,label);count++;};
(async()=>{
 check('index never holds bodies or seeds',!JSON.stringify(run('records')).includes('synthetic-')&&!JSON.stringify(run('records')).includes('SYNTHETICSEED'));
 await ctx.openSealedRecord('a');
 check('first view requests only A',opens.join(',')==='a');
 check('one detail model after opening',run('records.filter(r=>!r._sealed).length')===1&&run("record('b')._sealed"));
 run("record('a').fields[0].value='edited-A'");
 await ctx.openSealedRecord('b');
 check('switch commits previous edit',saves.some(model=>model.records.some(r=>r.id==='a'&&r.fields[0]?.value==='edited-A')));
 check('switch drops A plaintext',run("record('a')._sealed")&&!JSON.stringify(run("record('a')")).includes('edited-A'));
 check('only B is decrypted after switch',run('records.filter(r=>!r._sealed).length')===1&&run("record('b').fields[0].value")==='synthetic-b');
 run("editorUndo={secret:'old-body'};otpValues.set('b','123456');blockCodes.set('b:0','123456');state.area='notes';state.view='table';state.selected=null;render()");
 await run('redactionPending');
 check('table residency contains only summaries',run('records.every(r=>r._sealed)'));
 check('leaving clears undo and OTP caches',run('editorUndo===null&&otpValues.size===0&&blockCodes.size===0'));
 check('switching to Notes retains the existing unlock ticket after saving and sealing',run("vaultUnlocked&&nativeInfo.session==='synthetic-ticket'&&snapshot().activeID===null"));
 run("state.area='vault';render()");
 await ctx.openSealedRecord('b');
 check('returning to Vault opens one detail with the existing session',run("vaultUnlocked&&nativeInfo.session==='synthetic-ticket'&&records.filter(r=>!r._sealed).length===1&&selected().id==='b'"));
 run("records.push({id:'public-note',type:'note',name:'Synthetic note',fields:[],refs:[],links:[],blocks:[{type:'text',text:'Public text'}]});openRecord('public-note')");
 await run('redactionPending');
 check('opening an actual public note keeps the authenticated ticket',run("vaultUnlocked&&nativeInfo.session==='synthetic-ticket'&&selected().id==='public-note'&&state.area==='notes'"));
 check('public note navigation seals the departed password body',run("record('b')._sealed&&snapshot().activeID===null"));
 await ctx.openSealedRecord('b');
 check('return from a public note opens the original password with the same session',run("vaultUnlocked&&selected().id==='b'&&selected().fields[0].value==='synthetic-b'&&nativeInfo.session==='synthetic-ticket'"));
 run("records=records.filter(r=>r.id!=='public-note')");
 delay=true;deferred=null;const stale=ctx.openSealedRecord('a');await until(()=>deferred);
 run("state.category='favorites';render()");deferred.resolve(full('a'));await stale;
 check('late detail after navigation is discarded',run('records.every(r=>r._sealed)'));
 deferred=null;const locked=ctx.openSealedRecord('b');await until(()=>deferred);run('lock()');deferred.resolve(full('b'));await locked;
 check('late detail after locking is discarded',run('records.length===0&&!vaultUnlocked'));
 delay=false;run("vaultUnlocked=true;nativeInfo.session='fresh';records=['a','b'].map(id=>sealedSummary(full(id)));state.category='all';state.view='table';state.selected=null");
 await ctx.openSealedRecord('a');run("record('a').fields[0].value='unsaved-after-failure'");
 fail=true;run("state.view='table';render()");await assert.rejects(run('redactionPending'));count++;
 check('failed save retains last edits for retry',run("record('a').fields[0].value")==='unsaved-after-failure');
 run('render()');await run('redactionPending');
 check('retry commits before redaction',run("record('a')._sealed")&&saves.at(-1).records.some(r=>r.fields[0]?.value==='unsaved-after-failure'));
 run("queueRecordDeletion(record('b'));records=records.filter(r=>r.id!=='b')");
 const snapshot=ctx.snapshot();check('permanent deletion has an explicit tombstone',snapshot.deletedIDs.join(',')==='b');
 check('patch carries session and record protocol',snapshot.recordProtocol===1&&snapshot.session==='fresh');
 console.log(`${count} record residency / edit ordering / late response / failed save checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
