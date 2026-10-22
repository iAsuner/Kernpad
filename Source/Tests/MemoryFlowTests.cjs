// Search IDs carry no plaintext and are cleared with record residency.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {webcrypto}=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../Web/native.js'),'utf8');
let count=0,fail=false;const saves=[];
const ctx={crypto:webcrypto,TextEncoder,Uint8Array,structuredClone,clearTimeout,Promise,
 nativeCall:async(command,model)=>{if(fail){fail=false;throw new Error('Synthetic disk failure');}saves.push({command,model:structuredClone(model)});return true;}};
vm.createContext(ctx);vm.runInContext('function clearNativeSearch(){}',ctx);const run=text=>vm.runInContext(text,ctx);
run(fs.readFileSync(path.join(__dirname,'../Web/document-values.js'),'utf8'));
run(`let nativeInfo={exists:true,settings:{}},nativeReady=true,nativeLocked=false,nativeBusy=false,vaultUnlocked=true;
let deletedRecordIDs=new Set(),detailEpoch=0,detailNavigation='',redactionPending=null;
let saveTimer,saveChain=Promise.resolve(),lastSaved='',privacyEpoch=0,lockPromise=null,authResumeRequested=false;
let records=[{id:'private-record',type:'login',fields:[{kind:'secret',value:'Synthetic-memory-secret'}]}],trashedRecords=[];
let templateRegistry={},customTemplates={},customPlatforms={},security={},state={area:'notes'},lastStatus='';
function saveStatus(text){lastStatus=text;}function toast(){}function cancelInlineAuthentication(){}function resumeAuthenticationIfNeeded(){}function scheduleSave(){}
function clearRecordPreviews(){}
function purgePrivate(){records=[];vaultUnlocked=false;privacyEpoch++;lastSaved='';}
`);
run(source.slice(source.indexOf('function isProtected('),source.indexOf('function snapshot(')));
const catalog=fs.readFileSync(path.join(__dirname,'../Web/template-catalog.js'),'utf8');run(catalog.slice(0,catalog.indexOf('let templateFieldDraft=')));
run(source.slice(source.indexOf('function snapshot('),source.indexOf('function saveStatus(')));
run(source.slice(source.indexOf('function persist('),source.indexOf('function scheduleSave(')));
run(source.slice(source.indexOf('function acceptNative('),source.indexOf('async function boot(')));
run(source.slice(source.indexOf('function lock('),source.indexOf('function checkLock(')));
const check=(label,value)=>{assert.ok(value,label);count++;};
(async()=>{
 await ctx.persist();
 check('lastSaved contains only a SHA256 digest',/^[a-f0-9]{64}$/.test(run('lastSaved')));
 check('successful save retains all original secret values',saves[0].model.records[0].fields[0].value==='Synthetic-memory-secret');
 await ctx.persist();check('unchanged model is not rewritten',saves.length===1);
 check('unchanged preview saves finish with a saved indicator',run('lastStatus')==='已保存');
 run("records[0].fields[0].value='Changed synthetic secret'");
 fail=true;await assert.rejects(ctx.persist());count++;
 await ctx.persist();check('retry saves unsaved changes without dropping secrets',saves.at(-1).model.records[0].fields[0].value==='Changed synthetic secret');
 const previous=run('lastSaved');
 ctx.acceptNative({exists:true,passwordless:true,unlocked:true,settings:{idle:60},profile:'same-profile'});
 check('lightweight status preserves the active editor model',run('records[0].fields[0].value')==='Changed synthetic secret');
 check('lightweight status does not create another whole-model snapshot',run('lastSaved')===previous);
 const first=ctx.persist();run("records[0].fields[0].value='Latest synthetic edit'");const second=ctx.persist();await Promise.all([first,second]);
 check('queued edits preserve the latest value',saves.at(-1).model.records[0].fields[0].value==='Latest synthetic edit');
 await ctx.lock();
 check('leaving session removes protected models',run('records.length')===0&&!run('vaultUnlocked'));
 check('lock commits the final edited model',saves.at(-1).command==='saveLock'&&saves.at(-1).model.records[0].fields[0].value==='Latest synthetic edit');
 check('saved-state cache contains no plaintext model after lock',/^[a-f0-9]{64}$/.test(run('lastSaved')));
 run("nativeInfo.session='old-session';state.view='document';state.selected='private-record';vaultUnlocked=true;records=[{id:'private-record',type:'login',fields:[{kind:'secret',value:'already-saved'}],blocks:[]}];function clearRecordCaches(){}function render(){}function hasCodes(r){return r.totp||r.blocks.some(b=>b.type==='otp');}");
 ctx.acceptNative({exists:true,passwordless:true,unlocked:true,session:'renewed-session',recordProtocol:1,settings:{},profile:'same-profile'});
 check('reauthentication adopts the renewed save ticket',run('nativeInfo.session')==='renewed-session');
 check('reauthentication releases the old detail lease and model',run("state.view==='table'&&records[0]._sealed&&!JSON.stringify(records).includes('already-saved')"));
 check('renewed session invalidates the old saved-state digest',run('lastSaved')==='');
 console.log(`${count} plaintext cache / save ordering / lightweight status checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
