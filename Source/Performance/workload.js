// Appended inside the app closure by the isolated benchmark builder only.
// The same synthetic fixture and operations run in WKWebView and WebView2.
window.__performanceWorkload={
 async prepare(){
  if(records.some(r=>!r.id.startsWith('example-')))throw new Error('Benchmark requires a fresh synthetic store');
  locale='en';nativeInfo.settings.locale='en';
  records=exampleCatalog().map(example=>makeExampleRecord(example,'en'));trashedRecords=[];
  state.area='notes';state.view='table';state.selected=null;state.search='';render();await persist();
  return {notes:records.length,mediaBytes:records.reduce((n,r)=>n+r.blocks.reduce((n,b)=>n+(b.data?.length||0)+(b.poster?.length||0),0),0)};
 },
 async open(){
  openRecord(records.find(r=>r.id.endsWith('-travel')).id);docMode='edit';render();
  await Promise.all([...document.querySelectorAll('#mj-blocks img')].map(img=>img.decode().catch(()=>{})));
  await persist();nativeInfo.settings.autoSave=false;manualObserveDocument();
  return {width:document.querySelector('#mj-blocks').getBoundingClientRect().width,blocks:selected().blocks.length};
 },
 edit(index){
  const el=document.querySelector('[data-rich-block]');if(!el)throw new Error('Missing editor');
  el.focus({preventScroll:true});
  el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromPaste'}));
  el.textContent='Synthetic performance edit '+index;
  el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));return true;
 },
 async preview(){await openPDFPreview();if(!pdfPreview?.pages)throw new Error('Preview failed');return {pages:pdfPreview.pages};},
 close(){closeModal();return true;},
 async finish(){await persist({documentSave:true});return {undo:documentHistory.undo.length,notes:records.length,previewClosed:pdfPreview===null};}
};
