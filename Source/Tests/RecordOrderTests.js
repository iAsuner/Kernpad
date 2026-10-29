window.__runRecordOrderChecks=async()=>{
 const check=(name,value)=>{if(!value)throw new Error('Record order: '+name);window.__editorChecks=(window.__editorChecks||0)+1;},settle=()=>new Promise(r=>setTimeout(r,30));
 const prior={locale,records,trashedRecords,state:{...state},mode:docMode,info:{...nativeInfo,settings:{...nativeInfo.settings}},unlocked:vaultUnlocked,epoch:privacyEpoch,reducedMotion:recordOrderReducedMotion};
 const ids=()=>selectableRecords().map(item=>item.id),finish=async()=>{await settle();await saveChain.catch(()=>{});await settle();};
 function drag(id,targetID,{cancel=false,release=true}={}){
  const handle=$('[data-record-drag="'+id+'"]'),target=selectableRecords().find(item=>item.id===targetID).el,from=handle.getBoundingClientRect(),to=target.getBoundingClientRect(),init={bubbles:true,cancelable:true,pointerId:73,button:0,pointerType:'mouse',buttons:1};
  handle.dispatchEvent(new PointerEvent('pointerdown',{...init,clientX:from.left+4,clientY:from.top+4}));window.dispatchEvent(new PointerEvent('pointermove',{...init,clientX:to.left+4,clientY:to.top+4}));
  if(release)window.dispatchEvent(new PointerEvent(cancel?'pointercancel':'pointerup',{...init,buttons:0,clientX:to.left+4,clientY:to.top+4}));
 }
 try{
  clearManualState();closeModal();recordSelection.clear();recordSelectionMode=false;nativeInfo.settings.autoSave=false;nativeInfo.recordProtocol=1;nativeInfo.session='synthetic-order-ticket';vaultUnlocked=true;trashedRecords=[];docMode='view';recordOrderReducedMotion=()=>false;
  for(const language of ['zh','en'])for(const area of ['notes','vault']){
   locale=language;
   const fixtures=['a','b','c','d'].map(suffix=>{const r=schemaRecord(getTemplate(area==='notes'?'note':'login'),{account:'synthetic@example.invalid'},{name:'Synthetic '+area+' '+suffix,id:'order-'+area+'-'+suffix});r.protected=area==='vault';return area==='vault'?sealedSummary(r):r;});
   const [a,b,c,d]=fixtures;records=fixtures;Object.assign(state,{area,view:'table',selected:null,category:'all',search:'',page:0,platformFilter:'all'});render();await settle();
   check(language+' '+area+' shows pin and drag controls',!!$('[data-record-pin="'+a.id+'"]')&&$$('[data-record-drag]').length===4);
   check(language+' '+area+' ordering tools fit their container',$$('.mj-record-order-tools').every(el=>{const box=el.getBoundingClientRect(),host=el.parentElement.getBoundingClientRect();return box.left>=host.left-1&&box.right<=host.right+1&&box.top>=host.top-1&&box.bottom<=host.bottom+1;}));
   await finish();const originalOrder=records.map(r=>r.id).join(','),originalVisible=ids().join(','),saveCount=window.__commands.filter(c=>c.command==='save').length;
   drag(d.id,a.id,{release:false});
   check(area+' peers make room before drop while data remains unchanged',ids()[0]===d.id&&records.map(r=>r.id).join(',')===originalOrder&&window.__commands.filter(c=>c.command==='save').length===saveCount);
   check(area+' a lifted visual clone has no live record selectors',record(undefined)===undefined&&!!$('.mj-record-drag-label')&&!$('.mj-record-drag-label [data-open],.mj-record-drag-label [data-record-id],.mj-record-drag-label [data-record-pin]')&&$('.mj-record-drag-label').inert);
   const peer=recordOrderPointer.items.find(item=>item.id===a.id),motion=recordOrderMotions.get(peer.node)?.animation;
   if(motion){motion.pause();motion.currentTime=80;}
   check(area+' displaced peers have an actual interpolated transform',!!motion&&getComputedStyle(peer.node).transform!=='none');
   const stable=ids().join(',');for(let i=0;i<5;i++)updateRecordOrderDrag();check(area+' a stationary pointer does not oscillate the preview',ids().join(',')===stable);
   window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
   check(area+' cancelling restores DOM and stored order without saving',ids().join(',')===originalVisible&&records.map(r=>r.id).join(',')===originalOrder&&window.__commands.filter(c=>c.command==='save').length===saveCount&&!$('.mj-record-drag-label'));
   await new Promise(resolve=>setTimeout(resolve,recordOrderMotionDuration+20));recordOrderReducedMotion=()=>true;drag(d.id,a.id,{release:false});check(area+' reduced motion still previews order without animations',ids()[0]===d.id&&recordOrderMotions.size===0);cancelRecordOrderDrag();recordOrderReducedMotion=()=>false;await settle();
   const pin=$('[data-record-pin="'+c.id+'"]');pin.click();await finish();
   check(area+' pin persists and moves to the pinned group',record(c.id).pinned===true&&ids()[0]===c.id&&$('[data-record-pin="'+c.id+'"]').getAttribute('aria-pressed')==='true');
   const created=schemaRecord(getTemplate(area==='notes'?'note':'login'),{},{name:'New synthetic record',id:'order-'+area+'-new'});created.protected=area==='vault';records.unshift(area==='vault'?sealedSummary(created):created);render();await persist();
   check(area+' new records lead the ordinary group below pins',ids()[0]===c.id&&ids()[1]===created.id);
   drag(d.id,a.id);await finish();check(area+' pointer drag changes the manual order',ids().indexOf(d.id)<ids().indexOf(a.id)&&!recordOrderPointer&&!recordMarquee&&!recordSelection.size&&state.view==='table');
   const beforeCross=ids().join(',');drag(a.id,c.id);await finish();check(area+' dragging cannot displace the pinned group',ids().join(',')===beforeCross);
   const beforeCancel=ids().join(',');drag(a.id,d.id,{cancel:true});await finish();check(area+' cancelling drag preserves order',ids().join(',')===beforeCancel&&!$('.mj-record-drag-label'));
   const handle=$('[data-record-drag="'+b.id+'"]');handle.focus();handle.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));await finish();check(area+' keyboard moves a record without opening it',ids().indexOf(b.id)<ids().indexOf(a.id)&&state.view==='table');check(area+' preview refresh retains the sorting handle focus',document.activeElement?.dataset.recordDrag===b.id);
   showRecordMenu(record(c.id),200,200);$('[data-record-menu="pin"]').click();await finish();check(area+' context menu can unpin a record',record(c.id).pinned===false&&!$('.mj-record-menu'));
   await toggleRecordPin(c.id);await toggleRecordPin(b.id);drag(c.id,b.id);await finish();check(area+' pinned records can be dragged within their group',ids()[0]===c.id&&ids()[1]===b.id);await toggleRecordPin(c.id);await toggleRecordPin(b.id);
   const snapshotBefore=records.map(r=>[r.id,r.pinned]),priorOrder=records.map(r=>r.id).join(',');window.__failSave=true;const result=await toggleRecordPin(a.id);await finish();
   check(area+' failed pin save rolls back position and state '+JSON.stringify({result,ids:records.map(r=>r.id),priorOrder,pins:records.map(r=>[r.id,r.pinned]),snapshotBefore,saving:recordOrderSaving,fail:window.__failSave}),result===false&&records.map(r=>r.id).join(',')===priorOrder&&JSON.stringify(records.map(r=>[r.id,r.pinned]))===JSON.stringify(snapshotBefore)&&!recordOrderSaving);
   const saved=window.__commands.filter(item=>item.command==='save').at(-1).payload;
   check(area+' saves order as explicit IDs',Array.isArray(saved.recordOrder)&&saved.recordOrder.length===records.length&&saved.recordOrder.every(id=>typeof id==='string'));
   if(area==='vault')check('account pin and drag use summaries with no plaintext bodies',records.every(r=>r._sealed&&r.blocks.length===0)&&window.__commands.filter(item=>item.command==='save').slice(-4).every(item=>item.payload.records.every(r=>!isProtected(r)||r._sealed)));
   record(a.id).favorite=true;record(d.id).favorite=true;const hiddenBefore=records.filter(r=>r.id!==a.id&&r.id!==d.id).map(r=>r.id).join(',');state.category='favorites';render();await moveRecordTo(a.id,d.id);await finish();check(area+' filtered sorting preserves hidden records and their relative order',ids()[0]===a.id&&records.filter(r=>r.id!==a.id&&r.id!==d.id).map(r=>r.id).join(',')===hiddenBefore);record(a.id).favorite=false;record(d.id).favorite=false;state.category='all';render();
   state.search='Synthetic';render();await settle();check(area+' search results do not expose drag controls',!$('[data-record-drag]'));state.search='';clearNativeSearch();render();
   recordSelection=new Set([a.id]);recordSelectionMode=true;polishEditorUX();check(area+' multi-selection disables sorting handles',$$('[data-record-drag]').every(el=>el.disabled));recordSelection.clear();recordSelectionMode=false;polishEditorUX();
   drag(b.id,a.id,{release:false});check(area+' drag begins with a visible position cue',recordOrderPointer?.active&&!!$('.mj-record-drag-label'));privacyEpoch++;render();check(area+' session changes cancel pending drags',!recordOrderPointer&&!$('.mj-record-drag-label'));privacyEpoch=prior.epoch;
   drag(b.id,a.id,{release:false});records=records.filter(r=>r.id!==b.id);render();check(area+' a removed or expired record cancels its drag',!recordOrderPointer);
  }
  const transient=schemaRecord(getTemplate('login'),{account:'synthetic@example.invalid'},{name:'Departing detail',id:'order-transient'});transient.protected=true;records=[transient];Object.assign(state,{area:'vault',view:'table',selected:null,category:'all',search:''});
  redactionPending=Promise.resolve().then(()=>{records=records.map(r=>sealedSummary(r));});
  await toggleRecordPin(transient.id);redactionPending=null;check('pinning waits for a departing detail to become a summary',records.length===1&&records[0]._sealed&&records[0].pinned===true&&window.__commands.filter(item=>item.command==='save').at(-1).payload.records.every(r=>r._sealed));
  // Pins are list metadata and must survive a document-only undo.
  const note=schemaRecord(getTemplate('note'),{},{name:'Undo pin fixture'});note.protected=false;note.blocks=[{type:'text',text:'Before'}];records=[note];Object.assign(state,{area:'notes',view:'document',selected:note.id,category:'all',search:''});docMode='edit';clearManualState();manualKnownIDs.add(note.id);render();snapshotEditor();note.blocks[0].text='After';note.pinned=true;undoEditor();check('document undo retains the current pinned state',note.pinned===true&&note.blocks[0].text==='Before');
 }finally{
  cancelRecordOrderDrag({animate:false});stopRecordOrderMotions();clearTimeout(recordOrderPreviewTimer);recordOrderReducedMotion=prior.reducedMotion;clearTimeout(saveTimer);clearNativeSearch();clearManualState();recordSelection.clear();recordSelectionMode=false;recordOrderSaving=false;window.__failSave=false;await saveChain.catch(()=>{});
  locale=prior.locale;records=prior.records;trashedRecords=prior.trashedRecords;Object.assign(state,prior.state);nativeInfo=prior.info;vaultUnlocked=prior.unlocked;privacyEpoch=prior.epoch;docMode=prior.mode;clearEditorHistory();render();
 }
 return window.__editorChecks;
};

window.__showRecordOrderPreview=area=>{
 clearManualState();closeModal();nativeInfo.recordProtocol=1;vaultUnlocked=true;recordSelection.clear();recordSelectionMode=false;state.search='';trashedRecords=[];window.__sealedRecords=window.__sealedRecords||{};$('#mj-toast').hidden=true;
 records=Array.from({length:4},(_,i)=>{const r=schemaRecord(getTemplate(area==='vault'?'login':'note'),{account:'synthetic@example.invalid'},{name:['产品规划','运营记录','合成测试资料','新的想法'][i]});r.pinned=i===0;r.protected=area==='vault';if(area==='vault')window.__sealedRecords[r.id]=structuredClone(r);return area==='vault'?sealedSummary(r):r;});
 Object.assign(state,{area,view:'table',selected:null,category:'all',page:0,platformFilter:'all'});docMode='view';locale='zh';render();$('[data-record-drag]')?.focus({preventScroll:true});
};
window.__showRecordOrderMotionPreview=async area=>{
 window.__showRecordOrderPreview(area);await new Promise(resolve=>setTimeout(resolve,80));stopRecordOrderMotions();
 const items=selectableRecords(),source=items.at(-1),target=items[1],handle=$('[data-record-drag="'+source.id+'"]'),from=handle.getBoundingClientRect(),to=target.el.getBoundingClientRect(),init={bubbles:true,cancelable:true,pointerId:91,button:0,pointerType:'mouse',buttons:1};
 handle.dispatchEvent(new PointerEvent('pointerdown',{...init,clientX:from.left+4,clientY:from.top+4}));
 window.dispatchEvent(new PointerEvent('pointermove',{...init,clientX:area==='vault'?from.left+4:to.left+to.width*.3,clientY:to.top+to.height*.3}));
 for(const {animation} of recordOrderMotions.values()){animation.pause();animation.currentTime=80;}
};
