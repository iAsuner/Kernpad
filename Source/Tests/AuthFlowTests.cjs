const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../Web/native.js'),'utf8');
const commands=[],requests=[],listeners=[];let count=0;
const ctx={Date,Promise,setTimeout,clearTimeout,queueMicrotask,requestAnimationFrame:()=>{},
 window:{addEventListener:(event,fn,capture)=>{if(event==='click')listeners.push({fn,capture});}},
 nativeCall:(command,payload)=>{commands.push(command);if(['unlock','create','saveLock','system','recovery'].includes(command))return new Promise((resolve,reject)=>requests.push({command,resolve,reject}));return Promise.resolve(true);}};
vm.createContext(ctx);const run=text=>vm.runInContext(text,ctx);
run(`let nativeInfo={exists:true,passwordless:true,settings:{}},nativeReady=true,nativeBusy=false,nativeLocked=false;
let authAttempt=0,authPending=false,authMessage='',lockPromise=null,authResumeRequested=false,appActive=true;
let vaultUnlocked=false,pendingPrivateAction=null,saveChain=Promise.resolve(),lastSaved='',saveTimer;
let state={area:'notes'},accepted=0,rendered=0,replaceNotesApplied=false;
let modalRevision=0,presentedAction='',shownSettings=0;const document={querySelectorAll:()=>[]};
let overlayHidden=true;function $(){return {hidden:overlayHidden};}
function persist(){return Promise.resolve();}function snapshot(){return {records:[]};}
async function snapshotDigest(){return 'synthetic-digest';}
function purgePrivate(){vaultUnlocked=false;}function saveStatus(){}function toast(){}function scheduleSave(){}
function render(){rendered++;}function closeModal(){}function changeArea(area){state.area=area;render();}
function positionAuthentication(){return Promise.resolve();}function acceptNative(info,replaceNotes=false){accepted++;replaceNotesApplied=replaceNotes;vaultUnlocked=!!info.unlocked;nativeInfo=info;}
function safeURL(){return null;}function showSettings(){shownSettings++;}function showTemplates(){}function showBuilder(){}
function prepareActionAuthentication(action){presentedAction=action;}
`);
run(source.slice(source.indexOf('function lock('),source.indexOf('function checkLock(')));
run(source.slice(source.indexOf('function cancelInlineAuthentication('),source.indexOf('function unlockDemo(')));
run(source.slice(source.indexOf("window.addEventListener('click'"),source.indexOf("root.addEventListener('change'")));
run(source.slice(source.indexOf('async function nativeAction('),source.indexOf("window.addEventListener('click'")));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const check=(name,fn)=>{fn();count++;};
function clickArea(area){
 const button={dataset:{area}};let stopped=false;
 const event={target:{closest:selector=>selector==='[data-v5="area"]'?button:null},preventDefault(){},stopImmediatePropagation(){stopped=true;}};
 listeners[0].fn(event);
 // The existing prototype delegates at the root, after the window capture.
 if(!stopped)ctx.changeArea(area);
}
const next=command=>{const index=requests.findIndex(request=>request.command===command);assert.notEqual(index,-1);return requests.splice(index,1)[0];};
const status=()=>({exists:true,passwordless:true,settings:{},unlocked:true});
(async()=>{
 check('vault navigation is handled before legacy root handlers',()=>assert.equal(listeners[0].capture,true));
 clickArea('vault');await tick();
 check('one click starts authentication even with animation frames suspended',()=>assert.equal(commands.filter(x=>x==='unlock').length,1));
 clickArea('vault');await tick();
 check('repeat clicks preserve the active authentication',()=>assert.equal(commands.filter(x=>x==='unlock').length,1));
 const stale=next('unlock');clickArea('notes');stale.resolve(status());await tick();
 check('late success after leaving cannot expose private data',()=>{assert.equal(run('accepted'),0);assert.equal(run('vaultUnlocked'),false);assert.equal(run('state.area'),'notes');});
 clickArea('vault');await tick();next('unlock').resolve(status());await tick();
 check('re-entering starts a fresh usable request',()=>{assert.equal(run('accepted'),1);assert.equal(run('vaultUnlocked'),true);});
 const locks=ctx.lock();await tick();const unlockedBefore=commands.filter(x=>x==='unlock').length;
 clickArea('vault');await tick();
 check('authentication waits for the encrypted lock commit',()=>assert.equal(commands.filter(x=>x==='unlock').length,unlockedBefore));
 next('saveLock').resolve(true);await locks;await tick();
 check('lock followed by immediate re-entry resumes once',()=>assert.equal(commands.filter(x=>x==='unlock').length,unlockedBefore+1));
 next('unlock').resolve(status());await tick();
 check('repeated lock cycle can unlock again',()=>assert.equal(run('vaultUnlocked'),true));
 run('appActive=false');const inactiveLock=ctx.lock();await tick();next('saveLock').resolve(true);await inactiveLock;await tick();
 const inactiveCount=commands.filter(x=>x==='unlock').length;
 check('background window does not start authentication',()=>assert.equal(run('authPending'),false));
 run('appActive=true;authResumeRequested=true;resumeAuthenticationIfNeeded()');await tick();
 check('returning to the app starts authentication',()=>assert.equal(commands.filter(x=>x==='unlock').length,inactiveCount+1));
 next('unlock').reject(new Error('Synthetic cancellation'));await tick();
 check('failed authentication releases the UI for retry',()=>{assert.equal(run('nativeBusy'),false);assert.equal(run('vaultUnlocked'),false);});
 ctx.requestVaultUnlock();await tick();next('unlock').resolve(status());await tick();
 check('retry succeeds after an error',()=>assert.equal(run('vaultUnlocked'),true));
 run('appActive=false');const modalLock=ctx.lock();await tick();next('saveLock').resolve(true);await modalLock;await tick();
 const beforeModal=commands.filter(x=>x==='unlock').length;
 run('overlayHidden=false;appActive=true;authResumeRequested=true;resumeAuthenticationIfNeeded()');await tick();
 check('foregrounding preserves an open settings dialog',()=>assert.equal(commands.filter(x=>x==='unlock').length,beforeModal));
 run('overlayHidden=true;resumeAuthenticationIfNeeded()');await tick();
 check('closing the dialog resumes pending authentication once',()=>assert.equal(commands.filter(x=>x==='unlock').length,beforeModal+1));
 next('unlock').resolve(status());await tick();
 const systemAction=ctx.nativeAction('system');await tick();
 check('settings authentication is prepared for the requested action',()=>assert.equal(run('presentedAction'),'system'));
 next('system').resolve({cancelled:true,locked:true});await systemAction;
 check('cancelling a settings authentication purges private UI data',()=>assert.equal(run('vaultUnlocked'),false));
 run('vaultUnlocked=true');const recoveryAction=ctx.nativeAction('recovery');await tick();run('modalRevision++');
 next('recovery').resolve({cancelled:true,locked:true});await recoveryAction;
 check('late cancellation still purges data after the settings dialog closes',()=>assert.equal(run('vaultUnlocked'),false));
 run('nativeInfo={exists:true,passwordless:true,settings:{}};vaultUnlocked=true');
 const failedSystem=ctx.nativeAction('system');await tick();next('system').reject(new Error('Synthetic hardware failure'));await failedSystem;
 check('failed settings reauthentication purges private UI data',()=>assert.equal(run('vaultUnlocked'),false));
 run("vaultUnlocked=true;state.area='vault'");clickArea('notes');await tick();
 check('navigation within the app keeps an authenticated session',()=>assert.equal(run('vaultUnlocked'),true));
 ctx.lock();await tick();next('saveLock').resolve(true);await run('lockPromise');await tick();
 check('leaving the vault does not restart authentication in notes',()=>assert.equal(run('state.area'),'notes'));
 run('nativeInfo={exists:false,settings:{}}');ctx.requestVaultUnlock();await tick();next('create').resolve(status());await tick();
 check('creating a vault accepts public notes returned by native storage',()=>assert.equal(run('replaceNotesApplied'),true));
 run("vaultUnlocked=true;nativeInfo={exists:true,session:'old'}");const acceptedBefore=run('accepted'),shownBefore=run('shownSettings');
 const lateSuccess=ctx.nativeAction('recovery');await tick();run('modalRevision++');
 next('recovery').resolve({exists:true,unlocked:true,session:'renewed',notes:[],settings:{}});await lateSuccess;
 check('late authentication success still adopts its renewed session',()=>{assert.equal(run('accepted'),acceptedBefore+1);assert.equal(run('nativeInfo.session'),'renewed');});
 check('late success does not reopen dismissed settings',()=>assert.equal(run('shownSettings'),shownBefore));
 run("vaultUnlocked=false;nativeInfo={exists:true,passwordless:true,settings:{}};state.area='vault'");const failedRecovery=ctx.showAuthDemo('recovery');await tick();const failureReply=next('unlock');ctx.authenticationCancelledByHost('Synthetic wrong recovery key');failureReply.reject(new Error('Synthetic wrong recovery key'));await failedRecovery;
 check('native locked-error notification preserves its message despite a late promise rejection',()=>{assert.equal(run('authMessage'),'Synthetic wrong recovery key');assert.equal(run('vaultUnlocked'),false);assert.equal(run('nativeBusy'),false);});
 console.log(`${count} authentication / lock / navigation checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
