window.__runInteractionChecks=async()=>{
 const check=(name,ok)=>{if(!ok)throw new Error(name);window.__editorChecks++;},settle=()=>new Promise(resolve=>setTimeout(resolve,35));
 state.area='notes';createPlainNote();const r=selected();r.name='Synthetic interaction review';r.blocks=[{type:'text',text:'Alpha Bravo Charlie'},{type:'text',text:'Neighbor'}];render();
 r.name='';readRich($('[data-rich-block="0"]'));check('untitled top name follows edited or pasted first line',$('.mj-document-name').textContent.includes('Alpha Bravo Charlie'));r.name='Synthetic interaction review';syncDocumentName();
 check('precise columns opens by default',layoutSections.has('grid')&&$('[data-layout-section="grid"]').open);
 const paragraph=$('[data-rich-block="0"]');paragraph.focus();const range=document.createRange();range.setStart(paragraph.firstChild,0);range.setEnd(paragraph.firstChild,5);window.getSelection().removeAllRanges();window.getSelection().addRange(range);rememberSelection();rememberRichBlocks();
 const spacing=$('[data-layout-section="spacing"]>summary');
 spacing.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));paragraph.blur();await settle();
 check('first inspector press survives blur and selection events',spacing.isConnected);spacing.click();window.dispatchEvent(new PointerEvent('pointerup'));await settle();
 check('inspector disclosure keeps selected text',richSelection?.range.toString()==='Alpha');
 check('a single click opens the requested group',$('[data-layout-section="spacing"]').open);
 const input=$('[data-layout-control="padding"]');input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));check('property pointer retains text',richSelection?.range.toString()==='Alpha');input.focus();check('property focus retains text',richSelection?.range.toString()==='Alpha');input.value='12';input.dispatchEvent(new Event('change',{bubbles:true}));check('property repaint retains text',richSelection?.range.toString()==='Alpha');window.dispatchEvent(new PointerEvent('pointerup'));await settle();
 check('property editing keeps the original selected text '+JSON.stringify({text:richSelection?.range.toString(),layout:r.blocks[0].layout,indices:currentRichIndices()}),richSelection?.range.toString()==='Alpha'&&r.blocks[0].layout.padding===12&&!r.blocks[1].layout);
 check('selected text remains visibly marked while properties have focus',!!$('.mj-retained-selection'));
 selectLayoutBlock(0);selectLayoutBlock(1,true);$('[data-delete-selected-blocks]').click();check('selected blocks can be deleted together and leave a writable body',r.blocks.length===1&&r.blocks[0].text==='');undoEditor();check('bulk block undo restores both original blocks',r.blocks.length===2&&r.blocks[0].text==='Alpha Bravo Charlie');
 for(const type of ['heading2','check','callout']){insertContext={index:r.blocks.length-1};addBlockV4(type);await settle();check('insert '+type+' has empty editable content',r.blocks.at(-1).text==='');}
 r.blocks=[...Array.from({length:25},(_,i)=>({type:'text',text:('Synthetic long text '+i+' ').repeat(25)})),{type:'code',language:'json',text:'{"ok":true,"items":[1,2]}'},{type:'text',text:'End'}];render();$('.mj-docbody').scrollTop=900;const top=$('.mj-docbody').scrollTop;
 $('[data-exp="format-json"]').click();await settle();check('format JSON retains document scroll position',Math.abs($('.mj-docbody').scrollTop-top)<2&&r.blocks[25].text.includes('\n'));
 undoEditor();await settle();check('undo retains document scroll position',Math.abs($('.mj-docbody').scrollTop-top)<2&&r.blocks[25].text==='{"ok":true,"items":[1,2]}');
 await beginRecordRename(r.id);let title=$('[data-document-name]');title.value='Renamed synthetic note';await commitRecordRename(title);check('top title can rename a document with its page title hidden',r.name==='Renamed synthetic note'&&$('.mj-document-name').textContent.includes(r.name)&&$('.mj-doc-title').hidden);
 await beginRecordRename(r.id);title=$('[data-document-name]');title.value='Do not save';await commitRecordRename(title,true);check('Escape-style rename cancellation keeps the saved title',r.name==='Renamed synthetic note');
 // Older records infer title visibility from their name until it is explicit.
 const renameLocale=locale,renameUnlocked=vaultUnlocked;
 for(const language of ['zh','en'])for(const protectedRecord of [false,true]){
  locale=language;r.protected=protectedRecord;r.name=language==='en'?'Untitled record':'未命名记录';delete r.documentOptions;vaultUnlocked=true;render();
  check(language+' old unnamed record starts with hidden page title',$('.mj-doc-title').hidden);
  await beginRecordRename(r.id);title=$('[data-document-name]');title.value='Stable record name';await commitRecordRename(title);
  check(language+' rename preserves implicit hidden page title and editing context',r.name==='Stable record name'&&r.documentOptions.title===false&&$('.mj-doc-title').hidden&&isEditing()&&$('.mj-document-name'));
  const show=$('[data-document-option="title"]');show.click();$('[data-layout-header-remove="title"]').click();
  check(language+' page title cross preserves public or protected record identity',r.name==='Stable record name'&&$('.mj-doc-title').hidden&&$('.mj-document-name').textContent.includes(r.name)&&isEditing());
  undoEditor();check(language+' undo restores page title without renaming',r.name==='Stable record name'&&!$('.mj-doc-title').hidden);
  redoEditor();check(language+' redo only hides page title',r.name==='Stable record name'&&$('.mj-doc-title').hidden);
  await beginRecordRename(r.id);title=$('[data-document-name]');title.value='Cancelled name';await commitRecordRename(title,true);
  check(language+' cancelling rename retains the top name button',$('.mj-document-name').textContent.includes('Stable record name')&&r.name==='Stable record name');
 }
 locale=renameLocale;vaultUnlocked=renameUnlocked;r.protected=false;r.name='Renamed synthetic note';render();
 r.summary='';r.documentOptions.summary=true;render();check('empty descriptions stay hidden even on old documents',$('.mj-docdesc').hidden);
 docMode='view';render();check('normal reading fills the available width instead of capping at A4',$('.mj-paper').getBoundingClientRect().width>794&&Math.abs($('.mj-paper').getBoundingClientRect().width-$('.mj-docbody').clientWidth)<2);
 docMode='edit';render();$('.mj-docbody').scrollTop=900;const previewTop=$('.mj-docbody').scrollTop,previewBody=JSON.stringify(r.blocks);
 const previewText=$('[data-rich-block="0"]');previewText.focus({preventScroll:true});const previewRange=document.createRange();previewRange.setStart(previewText.firstChild,0);previewRange.setEnd(previewText.firstChild,9);richSelection={el:previewText,range:previewRange};const previewWord=previewRange.toString();
 await openPDFPreview();await settle();
 check('PDF preview opens without sending an export command',!!pdfPreview?.html&&!$('#mj-overlay').hidden&&!window.__commands.some(item=>item.command==='exportPDF'));
 check('PDF preview has multiple actual paginated sheets',pdfPreview.pages>1&&$('#mj-pdf-preview-pages').shadowRoot.querySelectorAll('.print-sheet').length===pdfPreview.pages);
 check('PDF paper gets at least 88 percent of the preview height',$('#mj-pdf-viewport').clientHeight>$('.mj-pdf-modal').clientHeight*.88&&!$('.mj-pdf-modal .mj-modal-footer'));
 check('preview leaves document mode and content unchanged',docMode==='edit'&&JSON.stringify(r.blocks)===previewBody);
 check('preview prevents accidental edits underneath',$('.mj-shell').inert);
 const previewSheet=$('#mj-pdf-preview-pages').shadowRoot.querySelector('.print-sheet'),sheetStyle=getComputedStyle(previewSheet);
 check('preview sheets use A4 dimensions and export margins',Math.abs(parseFloat(sheetStyle.width)-210/25.4*96)<.1&&Math.abs(parseFloat(sheetStyle.height)-297/25.4*96)<.1&&Math.abs(parseFloat(sheetStyle.paddingLeft)-18/25.4*96)<.1);
 const printSnapshot=pdfPreview.html,fitTransform=$('#mj-pdf-preview-pages').style.transform;
 $('[data-pdf-zoom]').value='0.5';$('[data-pdf-zoom]').dispatchEvent(new Event('change',{bubbles:true}));
 check('preview zoom changes only viewing scale',$('#mj-pdf-preview-pages').style.transform==='scale(0.5)'&&fitTransform!=='scale(0.5)'&&pdfPreview.html===printSnapshot);
 check('preview markup has no editable controls, frames or scripts',!$('#mj-pdf-preview-pages').shadowRoot.querySelector('input,textarea,button,script,iframe,[contenteditable]'));
 await savePDFPreview();check('save exports the exact preview snapshot',window.__commands.filter(item=>item.command==='exportPDF').at(-1)?.payload.html===printSnapshot);
 closeModal();await settle();check('closing preview releases cached document and shadow content',pdfPreview===null&&!$('#mj-pdf-preview-pages')&&$('#mj-overlay').hidden);
 check('closing preview restores editing position and selected text',docMode==='edit'&&Math.abs($('.mj-docbody').scrollTop-previewTop)<2&&richSelection?.range.toString()===previewWord);
 const pendingPreview=openPDFPreview();closeModal();await pendingPreview;check('cancel during preparation cannot reopen a late preview',pdfPreview===null&&$('#mj-overlay').hidden);
 await openPDFPreview();showSettings('general');check('opening a different dialog discards the PDF snapshot',pdfPreview===null&&!$('.mj-modal').classList.contains('mj-pdf-modal'));closeModal();
 await openPDFPreview();const oldPrivacyEpoch=privacyEpoch;privacyEpoch++;closeModal();check('session changes discard all preview pages',pdfPreview===null&&!$('#mj-pdf-preview-pages'));privacyEpoch=oldPrivacyEpoch;
 // The template editor must preserve its viewport and accept a custom import key.
 state.area='notes';showBuilder('login');await settle();const beforeCount=builder.fields.length;
 $('[data-v3="template-add-field"]').click();await settle();let key=$('[data-def-key="'+beforeCount+'"]');check('new template fields expose an editable import key',!!key);
 const label=$('[data-def-label="'+beforeCount+'"]');label.value='Project';label.dispatchEvent(new InputEvent('input',{bubbles:true}));const oldKey=builder.fields[beforeCount].key;builder.pattern+='|{$'+oldKey+'}';key.value='custom.project_id';key.dispatchEvent(new Event('change',{bubbles:true}));
 check('renaming a new import key updates its paste-rule reference',builder.fields[beforeCount].key==='custom.project_id'&&builder.pattern.includes('{$custom.project_id}')&&!builder.pattern.includes(oldKey));
 key.value='password';key.dispatchEvent(new Event('change',{bubbles:true}));check('invalid reserved import keys are rejected without changing the field',key.getAttribute('aria-invalid')==='true'&&builder.fields[beforeCount].key==='custom.project_id');key.value='custom.project_id';key.dispatchEvent(new Event('change',{bubbles:true}));
 for(let i=0;i<18;i++)builder.fields.push({key:'custom.synthetic_'+i,label:'Synthetic '+i,kind:'text'});renderBuilder();await settle();let modalBox=$('.mj-template-settings-body');modalBox.scrollTop=450;const modalTop=modalBox.scrollTop;const remove=$('[data-exp="remove-template-field"][data-index="'+(builder.fields.length-1)+'"]');remove.focus({preventScroll:true});remove.click();await settle();
 check('removing a template field retains modal scroll',modalTop>0&&Math.abs($('.mj-template-settings-body').scrollTop-modalTop)<2);
 const previousLocale=locale;locale='en';localize();$('.mj-template-settings-body').scrollTop=450;const englishTop=$('.mj-template-settings-body').scrollTop;renderBuilder();await settle();
 check('localized template rerenders also retain modal scroll',englishTop>0&&Math.abs($('.mj-template-settings-body').scrollTop-englishTop)<2);locale=previousLocale;
 templateManager.editing=true;$('[data-v3="template-add-field"]').click();await settle();const endTop=$('.mj-template-settings-body').scrollTop;
 check('adding a template field scrolls only its content panel',$('.mj-modal').getBoundingClientRect().top>=0&&$('.mj-modal-footer').getBoundingClientRect().bottom<=innerHeight&&endTop>0);
 $('[data-exp="remove-template-field"][data-index="'+(builder.fields.length-1)+'"]').click();await settle();
 check('deleting the focused new row keeps the modal near its end '+JSON.stringify({before:endTop,after:$('.mj-template-settings-body').scrollTop,height:$('.mj-template-settings-body').scrollHeight,client:$('.mj-template-settings-body').clientHeight}),$('.mj-template-settings-body').scrollTop>=Math.min(endTop,$('.mj-template-settings-body').scrollHeight-$('.mj-template-settings-body').clientHeight)-2);templateManager.editing=false;
 closeModal();state.area='notes';state.view='table';state.category='all';render();
 const second=schemaRecord(getTemplate('note'),{},{name:'Second synthetic selection'});second.protected=false;second.refs=[r.id];records.push(second);render();
 check('round selectors replace the mode button and gallery stays grouped',!$('[data-record-select-mode]')&&$$('[data-select-record]').length>=2&&!!$('.mj-selection-actions [data-example-gallery]'));
 const firstCard=$('[data-open="'+r.id+'"].mj-note-card'),beforeCard=firstCard.getBoundingClientRect(),beforeTitle=firstCard.querySelector('strong').getBoundingClientRect();
 check('unselected cards have hidden selectors and their original padding',getComputedStyle($('[data-select-record="'+r.id+'"]')).opacity==='0'&&parseFloat(getComputedStyle(firstCard).paddingLeft)===16);
 const grid=$('.mj-note-grid'),page=$('.mj-page'),box=selectableRecords()[0].el.getBoundingClientRect(),gridBox=grid.getBoundingClientRect();
 page.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:51,button:0,clientX:gridBox.left-4,clientY:box.top-3}));
 window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:51,clientX:gridBox.left-2,clientY:box.top-2}));
 check('minor pointer movement does not accidentally enter multi-select',!recordMarquee.active&&!recordSelection.size);
 window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:51,clientX:box.right-1,clientY:box.bottom-1}));
 check('dragging from whitespace selects intersected cards',recordMarquee.active&&recordSelection.has(selectableRecords()[0].id)&&!!$('.mj-record-marquee'));
 root.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}));await settle();
 check('Escape cancels an in-progress marquee and restores previous selection',!recordMarquee&&!recordSelection.size&&!$('.mj-record-marquee'));
 firstCard.dispatchEvent(new MouseEvent('click',{bubbles:true,metaKey:true}));$('[data-select-record="'+second.id+'"]').click();
 check('list selection does not open either document',state.view==='table'&&recordSelection.size===2);
 await settle();check('round checkboxes visibly retain their checked state',$('[data-select-record="'+r.id+'"]').checked&&$('[data-select-record="'+second.id+'"]').checked);
 check('entering selection leaves card and title geometry unchanged',Math.abs(firstCard.getBoundingClientRect().width-beforeCard.width)<1&&Math.abs(firstCard.querySelector('strong').getBoundingClientRect().left-beforeTitle.left)<1&&getComputedStyle($('[data-select-record="'+r.id+'"]')).opacity==='1');
 grid.focus();check('native Select All selects the current record list',window.nativeApp.selectAllRecords()&&recordSelection.size===selectableRecords().length);
 $('#mj-search').focus();check('native Select All falls back to text editing in the search field',!window.nativeApp.selectAllRecords());grid.focus();recordSelection=new Set([r.id,second.id]);polishRecordSelection();
 $('[data-record-delete-selected]').click();await settle();check('bulk deletion names all selected records and defaults to cancel',$('.mj-trash-confirm-list').textContent.includes(r.name)&&document.activeElement===$('[data-trash-cancel]'));
 $('[data-trash-cancel]').click();check('cancelling bulk deletion retains records and selection',recordSelection.size===2&&!!record(r.id)&&!!record(second.id));
 $('[data-record-delete-selected]').click();$('[data-record-confirm-selection]').click();check('bulk confirmation removes exactly the selected records',!record(r.id)&&!record(second.id)&&trashedRecords.some(item=>item.id===r.id));restoreRecord(r.id);restoreRecord(second.id);check('bulk-deleted records restore their original links',record(second.id).refs[0]===r.id);
 // Table input styling must never stretch a selection marker across a row.
 const selectionState={records,locale,platform:document.documentElement.dataset.nativePlatform,unlocked:vaultUnlocked,state:{...state}};
 const selectionFixtures=['First','Second','Third'].map(name=>schemaRecord(getTemplate('login'),{account:name.toLowerCase()+'@example.invalid'},{name:name+' synthetic account'}));
 window.__sealedRecords=window.__sealedRecords||{};
 for(const item of selectionFixtures)window.__sealedRecords[item.id]=structuredClone(item);
 try{
  for(const language of ['zh','en'])for(const platform of ['macos','windows'])for(const area of ['notes','vault']){
   locale=language;document.documentElement.dataset.nativePlatform=platform;vaultUnlocked=true;
   records=area==='vault'?selectionFixtures:[r,second];Object.assign(state,{area,view:'table',category:'all',search:'',selected:null,page:0,platformFilter:'all',editing:false});render();await settle();
   const items=selectableRecords(),marks=$$('[data-select-record]'),label=area+'/'+language+'/'+platform;
   check(label+' selectors are hidden until selection',marks.length>=2&&marks.every(mark=>getComputedStyle(mark).opacity==='0'));
   const textBoxes=items.map(({el})=>el.querySelector('strong').getBoundingClientRect()),rowColors=items.map(({el})=>getComputedStyle(el.tagName==='TR'?el.cells[0]:el).backgroundColor);
   recordSelection=new Set(items.map(({id})=>id));recordSelectionMode=true;polishRecordSelection();await new Promise(resolve=>setTimeout(resolve,160));
   check(label+' selected markers stay compact circles',marks.every(mark=>{const box=mark.getBoundingClientRect(),style=getComputedStyle(mark);return box.width>=14&&box.width<=20&&Math.abs(box.width-box.height)<.5&&style.borderRadius==='50%'&&parseFloat(style.padding)===0&&mark.checked;}));
   const colorProbe=document.createElement('span');colorProbe.style.background='var(--mj-accent)';root.append(colorProbe);const accent=getComputedStyle(colorProbe).backgroundColor;colorProbe.remove();
   check(label+' checked circles consistently use the application accent '+JSON.stringify(marks.map(mark=>({background:getComputedStyle(mark).backgroundColor,color:getComputedStyle(mark).color}))),marks.every(mark=>getComputedStyle(mark).backgroundColor===accent&&getComputedStyle(mark).color==='rgb(255, 255, 255)'));
   check(label+' selection does not cover or move record names',items.every(({el},index)=>{const host=el.tagName==='TR'?el.cells[0]:el.parentElement,mark=host.querySelector('[data-select-record]').getBoundingClientRect(),text=el.querySelector('strong').getBoundingClientRect(),before=textBoxes[index];return (mark.right<=text.left||mark.bottom<=text.top||mark.left>=text.right||mark.top>=text.bottom)&&Math.abs(text.left-before.left)<.5&&Math.abs(text.top-before.top)<.5;}));
   if(area==='vault'){
    check(label+' table markers remain vertically centered',marks.every(mark=>{const box=mark.getBoundingClientRect(),cell=mark.closest('td').getBoundingClientRect();return Math.abs(box.top+box.height/2-cell.top-cell.height/2)<1;}));
    check(label+' platform logos do not show through selection circles',items.every(({el})=>getComputedStyle(el.querySelector('.mj-platform-logo')).visibility==='hidden'));
    check(label+' selected rows have a visible tint',items.every(({el},index)=>getComputedStyle(el.cells[0]).backgroundColor!==rowColors[index]));
   }
   root.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}));await settle();
   check(label+' Escape clears selection and hides the markers',!recordSelection.size&&marks.every(mark=>getComputedStyle(mark).opacity==='0'));
   if(area==='vault')check(label+' cancelling selection restores platform logos',items.every(({el})=>getComputedStyle(el.querySelector('.mj-platform-logo')).visibility==='visible'));
  }
 }finally{
  records=selectionState.records;locale=selectionState.locale;vaultUnlocked=selectionState.unlocked;Object.assign(state,selectionState.state);
  if(selectionState.platform===undefined)delete document.documentElement.dataset.nativePlatform;else document.documentElement.dataset.nativePlatform=selectionState.platform;
  for(const item of selectionFixtures)delete window.__sealedRecords[item.id];recordSelection.clear();recordSelectionMode=false;render();
 }
 showSettings('shortcuts');const calls=window.__commands.filter(c=>c.command==='settings').length;$('[data-shortcut-defaults]').click();check('restoring shortcut defaults is a draft until Save and Done',window.__commands.filter(c=>c.command==='settings').length===calls&&$$('.mj-modal-footer .mj-primary').length===1);closeModal();
 return window.__editorChecks;
};
