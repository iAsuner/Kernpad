// Preview and export use one immutable, masked print snapshot. Preview content
// is inert markup in a style-isolated shadow tree, with no frame or native bridge.
let pdfPreview=null,pdfPreviewGeneration=0;
function clearPDFPreview(){
 pdfPreviewGeneration++;const previous=pdfPreview;pdfPreview=null;previous?.observer?.disconnect();
 $('#mj-pdf-preview-pages')?.remove();
 if(!previous)return null;
 return ()=>{
  if(previous.epoch!==privacyEpoch||selected()?.id!==previous.id||state.view!=='document')return;
  restoreDocumentViewport(previous.viewport);restoreRichBookmark(previous.bookmark);
  if(previous.mode==='edit'&&richSelection?.el.isConnected){richSelection.el.focus({preventScroll:true});const selection=window.getSelection();selection.removeAllRanges();selection.addRange(richSelection.range);}
 };
}
function sizePDFPreview(){
 const preview=pdfPreview,viewport=$('#mj-pdf-viewport'),space=$('#mj-pdf-space'),pages=$('#mj-pdf-preview-pages');if(!preview||!viewport||!space||!pages)return;
 const width=210/25.4*96,height=preview.pages*(297/25.4*96+24)-24;
 const fit=(viewport.clientWidth-24)/width;
 const scale=['fit','page'].includes(preview.zoom)?Math.min(1.5,Math.max(.2,preview.zoom==='page'?Math.min(fit,(viewport.clientHeight-24)/(297/25.4*96)):fit)):Number(preview.zoom);
 space.style.width=width*scale+'px';space.style.height=height*scale+'px';pages.style.transform='scale('+scale+')';
}
async function openPDFPreview(){
 const r=selected();if(!r||state.view!=='document'){toast(ui('先打开要预览的便签或记录','Open a note or record to preview'));return;}
 if(pdfExporting||pdfPreview||isProtected(r)&&!vaultUnlocked)return;
 const epoch=privacyEpoch,mode=docMode,viewport=captureDocumentViewport(),bookmark=richSelectionBookmark(),generation=++pdfPreviewGeneration;
 const valid=()=>generation===pdfPreviewGeneration&&epoch===privacyEpoch&&selected()===r&&(!isProtected(r)||vaultUnlocked);
 pdfExporting=true;
 modal(ui('PDF 预览','PDF Preview'),'',`<p role="status">${ui('正在准备分页预览…','Preparing page preview…')}</p>`);
 $('.mj-modal').classList.add('mj-pdf-modal');
 pdfPreview={id:r.id,epoch,mode,viewport,bookmark,zoom:'fit'};
 try{
  // Preview current content after pending writes settle. An unchanged, known
  // document does not need another whole-library serialization and hash.
  await (saveTimer||!manualKnownIDs.has(r.id)||lastSaveError?persist():saveChain);if(!valid())return;
  // Read mode removes editor chrome. Restore the original canvas before showing
  // the preview, so closing it never changes the user's mode or scroll position.
  if(docMode!=='view'){docMode='view';render();}
  const packet=await captureDocumentPrint(r,{preview:true});if(!valid())return;
  if(docMode!==mode){docMode=mode;render();}restoreDocumentViewport(viewport);restoreRichBookmark(bookmark);
  // Keep the export wrapper lazy; opening a preview need not allocate another
  // full HTML document. The immutable content is shared with the print packet.
  Object.defineProperties(pdfPreview,Object.getOwnPropertyDescriptors(packet));pdfPreview.title=recordDisplayName(r);
  modal(ui('PDF 预览','PDF Preview'),'',`<div class="mj-pdf-controls"><span>${ui('A4，共 '+packet.pages+' 页','A4, '+packet.pages+(packet.pages===1?' page':' pages'))}</span><label>${ui('缩放','Zoom')} <select data-pdf-zoom aria-label="${ui('PDF 缩放','PDF zoom')}"><option value="fit">${ui('适合窗口','Fit window')}</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select></label></div><div id="mj-pdf-viewport" tabindex="0" aria-label="${ui('PDF 分页预览','PDF page preview')}"><div id="mj-pdf-space"><div id="mj-pdf-preview-pages"></div></div></div>`,`<button class="mj-button" data-action="close-modal">${ui('返回文档','Back to document')}</button><span class="mj-spacer"></span><button class="mj-primary" data-pdf-save>${ui('保存 PDF…','Save PDF…')}</button>`);
  $('.mj-modal').classList.add('mj-pdf-modal');
  // Keep preview controls in one compact header, leaving the full remaining
  // height for paper. Export and close remain available without a second footer.
  const head=$('.mj-pdf-modal .mj-modal-head'),close=head.lastElementChild;
  $('[data-pdf-zoom] option[value="fit"]').textContent=ui('适合宽度','Fit width');
  $('[data-pdf-zoom]').insertAdjacentHTML('beforeend',`<option value="page">${ui('整页','Fit page')}</option>`);
  head.insertBefore($('.mj-pdf-controls'),close);head.insertBefore($('[data-pdf-save]'),close);
  close.setAttribute('aria-label',ui('返回文档','Back to document'));close.title=ui('返回文档','Back to document');
  $('.mj-pdf-modal .mj-modal-footer').remove();
  const shadow=$('#mj-pdf-preview-pages').attachShadow({mode:'open'});
  shadow.innerHTML='<style>:host{display:block;width:210mm;color:#222;font-family:-apple-system,BlinkMacSystemFont,sans-serif}*{box-sizing:border-box}.print-sheet{width:210mm;height:297mm;padding:18mm;background:white;position:relative;overflow:hidden;margin:0 0 24px;box-shadow:0 2px 8px #0002}.print-sheet:last-child{margin-bottom:0}main{margin:0}dl{margin:12px 0}dt{color:#666;font-size:12px}dd{margin:3px 0 10px}a{pointer-events:none}</style>'+packet.sheets;
  shadow.querySelectorAll('a').forEach(link=>link.removeAttribute('href'));
  pdfPreview.sheets='';
  pdfPreview.observer=new ResizeObserver(sizePDFPreview);pdfPreview.observer.observe($('#mj-pdf-viewport'));sizePDFPreview();
  $('#mj-pdf-viewport').focus({preventScroll:true});
 }catch(error){if(valid()){closeModal();toast(String(error));}}
 finally{
  if(epoch===privacyEpoch&&selected()===r&&docMode!==mode){docMode=mode;render();restoreDocumentViewport(viewport);restoreRichBookmark(bookmark);}
  pdfExporting=false;
 }
}
async function savePDFPreview(){
 const preview=pdfPreview,r=selected();if(pdfExporting||!preview?.html||preview.epoch!==privacyEpoch||preview.id!==r?.id||isProtected(r)&&!vaultUnlocked)return;
 pdfExporting=true;const button=$('[data-pdf-save]');if(button)button.disabled=true;
 try{const result=await nativeCall('exportPDF',{id:preview.id,title:preview.title,html:preview.html});if(pdfPreview===preview&&!result.cancelled)toast(ui('PDF 已导出','PDF exported'));}
 catch(error){if(pdfPreview===preview)toast(String(error));}
 finally{pdfExporting=false;if(button?.isConnected)button.disabled=false;}
}
root.addEventListener('click',event=>{if(!event.target.closest('[data-pdf-save]'))return;event.preventDefault();event.stopImmediatePropagation();savePDFPreview();},true);
root.addEventListener('change',event=>{if(!event.target.matches('[data-pdf-zoom]')||!pdfPreview)return;pdfPreview.zoom=event.target.value;sizePDFPreview();});
