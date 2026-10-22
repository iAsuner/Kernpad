window.__checkInspectorWidth=async(language)=>{
 state.area='notes';createPlainNote();locale=language;selected().blocks=[structuredClone(window.__fixtureMedia.image)];render();selectLayoutBlock(0);
 $$('#mj-layout-inspector [data-layout-section]').forEach(el=>el.open=true);
 await new Promise(resolve=>requestAnimationFrame(resolve));
 const panel=$('#mj-layout-inspector'),bounds=panel.getBoundingClientRect();
 if(panel.scrollWidth>panel.clientWidth+1||bounds.right>window.innerWidth+1)throw new Error('Inspector has horizontal overflow');window.__editorChecks++;
 if(!$('#mj-layout-inspector [data-media-remove]').textContent.includes(language==='en'?'Remove image':'删除图片'))throw new Error('Media controls not localized');window.__editorChecks++;
 const heading=panel.querySelector('.mj-layout-heading'),scheme=document.documentElement.style.colorScheme;
 for(const mode of ['light','dark']){
  document.documentElement.style.colorScheme=mode;
  if([panel,heading].some(el=>/transparent|rgba\([^)]*,\s*0\)|\/\s*0\s*\)/.test(getComputedStyle(el).backgroundColor)))throw new Error('Inspector background is transparent in '+mode);window.__editorChecks++;
 }
 document.documentElement.style.colorScheme=scheme;
 panel.scrollTop=180;await new Promise(resolve=>requestAnimationFrame(resolve));
 const pinned=heading.getBoundingClientRect(),toolbar=$('.mj-formatbar').getBoundingClientRect();
 if(Math.abs(pinned.top-bounds.top)>2||pinned.left>bounds.left+2||pinned.right<bounds.left+panel.clientWidth-2||bounds.top<toolbar.bottom-1)throw new Error('Inspector heading overlaps controls or leaves exposed content');window.__editorChecks++;
 panel.scrollTop=0;
 $$('#mj-layout-inspector [data-layout-section]').forEach(el=>el.open=false);layoutSections.clear();
 await openPDFPreview();const viewport=$('#mj-pdf-viewport'),controls=$('.mj-pdf-modal .mj-modal-head');
 if(!viewport||viewport.scrollWidth>viewport.clientWidth+1||controls.scrollWidth>controls.clientWidth+1||viewport.clientHeight<window.innerHeight-160)throw new Error('PDF preview is clipped at the supported window width');window.__editorChecks++;
 closeModal();
 return true;
};
window.__runDocumentLayoutChecks=async()=>{
 const check=(name,ok)=>{if(!ok)throw new Error(name);window.__editorChecks++;};
 state.area='notes';createPlainNote();const r=selected();r.name='Synthetic layout acceptance';r.documentOptions={title:false,summary:false};
 r.blocks=splitColumnPreset();render();
 const rects=$$('#mj-blocks>[data-component]').map(el=>el.getBoundingClientRect());
 check('spanning left aligns with two right cells',Math.abs(rects[0].top-rects[1].top)<1&&Math.abs(rects[0].bottom-rects[2].bottom)<1&&rects[2].left===rects[1].left);
 selectLayoutBlock(0);$('[data-layout-action="split-columns"]').click();
 check('layout preset inserts three editable cells through the inspector',r.blocks.length===6&&r.blocks[1].layout.rowSpan===2);
 undoEditor();check('layout preset can be undone',selected().blocks.length===3);
 // Exercise writing, content editing and keyboard workflows on the actual DOM.
 const key=async(el,name,options={})=>{el.focus();el.dispatchEvent(new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...options}));await new Promise(resolve=>setTimeout(resolve,15));};
 const caret=(el,offset=0)=>{el.focus();const range=document.createRange();range.selectNodeContents(el);if(el.firstChild?.nodeType===3)range.setStart(el.firstChild,offset);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);};
 r.blocks=[{type:'list',items:['First','','Last'],ordered:false}];render();let empty=$('[data-rich-item="1"]');caret(empty);await key(empty,'Backspace');
 check('Backspace removes a middle empty list item',JSON.stringify(r.blocks[0].items)===JSON.stringify(['First','Last']));
 r.blocks=[{type:'text',text:'AlphaBeta',layout:{span:6}},{type:'text',text:'Neighbor',layout:{span:6}}];render();let paragraph=$('[data-rich-block="0"]');caret(paragraph,5);await key(paragraph,'Enter');
 check('Enter splits at the caret and keeps the neighboring column',r.blocks.length===3&&r.blocks[0].text==='Alpha'&&r.blocks[1].text==='Neighbor'&&r.blocks[2].text==='Beta'&&layoutPlacements(r.blocks)[1].row===0&&layoutPlacements(r.blocks)[2].start===1);
 paragraph=$('[data-rich-block="2"]');caret(paragraph,2);await key(paragraph,'Enter',{shiftKey:true});
 check('Shift Enter inserts a line break inside the same block',r.blocks.length===3&&r.blocks[2].text.includes('Be\n'));
 paragraph=$('[data-rich-block="2"]');caret(paragraph);await key(paragraph,'Enter',{metaKey:true});
 check('Command Enter starts a new full-width row',r.blocks.at(-1).layout.span===12);
 paragraph=$('[data-rich-block="3"]');caret(paragraph);await key(paragraph,'Backspace');
 check('Backspace removes a blank paragraph without erasing neighbors',r.blocks.length===3&&r.blocks[1].text==='Neighbor');
 r.blocks=[{type:'text',text:'Short',layout:{span:6},surface:{background:'#fff1df'}},{type:'text',text:'Long\nLine two\nLine three',layout:{span:6},surface:{background:'#edf3ff'}}];render();selectLayoutBlock(0);setBlockLayout('heightMode','row');
 let heights=$$('#mj-blocks>[data-component]').map(el=>el.getBoundingClientRect().height);
 check('row height option aligns backgrounds of unequal text blocks',Math.abs(heights[0]-heights[1])<1&&r.blocks.every(b=>b.layout.heightMode==='row'));
 setBlockLayout('heightMode','content');heights=$$('#mj-blocks>[data-component]').map(el=>el.getBoundingClientRect().height);
 check('content height option restores independent background sizes',heights[1]>heights[0]+10);
 r.blocks=[{type:'text',text:'Text'},{type:'date',title:'Date',value:'2026-10-20'},{type:'table',rows:[['A','B'],['C','D']]},{type:'code',text:'{}',language:'json'}];render();
 const dateInput=$('[data-component-value="1"]');dateInput.focus();check('date focus selects its own block: '+JSON.stringify({indices:currentRichIndices(),active:document.activeElement?.outerHTML.slice(0,240),editing:isEditing()}),currentRichIndices()[0]===1);setBlockLayout('span',6);
 check('focusing a date updates the layout target',r.blocks[1].layout.span===6&&!r.blocks[0].layout);
 const cell=$('[data-cell="2,0,0"]');cell.focus();check('table focus selects its own block and has no heavy outline',currentRichIndices()[0]===2&&getComputedStyle(cell).outlineStyle==='none');
 $('[data-code-text="3"]').focus();check('code editor focus selects its own block',currentRichIndices()[0]===3);
 $('[data-layout-gap="0"]').click();$('.mj-component-option[data-type="text"]').click();
 check('the inline plus inserts at an interior position',r.blocks[1].type==='text'&&r.blocks[2].type==='date');
 r.blocks=splitColumnPreset();render();
 const toFile=(block,name)=>new File([Uint8Array.from(atob(block.data.split(',')[1]),c=>c.charCodeAt(0))],name);
 const image=toFile(window.__fixtureMedia.image,'synthetic.png'),video=toFile(window.__fixtureMedia.video,'synthetic.mp4');
 await insertDroppedMedia([image],{index:0});
 check('image fills the left slot while retaining its row span',selected().blocks[0].type==='image'&&selected().blocks[0].layout.rowSpan===2&&selected().blocks.length===3);
 await insertDroppedMedia([video],{index:1});
 check('video fills the top right slot without disturbing other cells',selected().blocks[1].type==='video'&&selected().blocks[1].layout.start===7&&selected().blocks[2].type==='text');
 const before=JSON.stringify(selected().blocks),calls=window.__commands.length;
 await insertDroppedMedia([new File(['unsafe'],'unsafe.html')],{index:2});
 check('unsupported dropped files cannot modify the note or reach native import',JSON.stringify(selected().blocks)===before&&!window.__commands.slice(calls).some(c=>c.command==='importMedia'));
 await insertDroppedMedia([image,new File(['unsafe'],'unsafe.html')],{index:2});
 check('a mixed invalid drop is atomic',JSON.stringify(selected().blocks)===before);
 window.__duringMediaImport=()=>{privacyEpoch++;};
 await insertDroppedMedia([image],{index:2});
 check('a session change during import discards delayed media',JSON.stringify(selected().blocks)===before);
 window.__duringMediaImport=null;
 selected().blocks[2].text='Existing content';
 await insertDroppedMedia([image],{index:2});
 check('dropping onto occupied text keeps the original content',selected().blocks.some(b=>b.text==='Existing content')&&selected().blocks.length===4);
 undoEditor();check('media import is undoable without removing existing content',selected().blocks.length===3&&selected().blocks[2].text==='Existing content');
 r.blocks=[{type:'text',text:'Left',layout:{span:6}},{type:'text',text:'Right',layout:{span:6}}];render();
 const transfer=new DataTransfer();transfer.items.add(image);
 const dropTarget=$('[data-component="0"]');
 dropTarget.dispatchEvent(new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true}));
 check('a real file drag highlights the target column',dropTarget.classList.contains('mj-media-drop-target'));
 dropTarget.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
 for(let attempt=0;mediaImporting&&attempt<200;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
 let placed=layoutPlacements(r.blocks);
 check('a DOM file drop preserves the adjacent column and original text',!mediaImporting&&r.blocks[0].text==='Left'&&r.blocks[1].text==='Right'&&r.blocks[2].type==='image'&&placed[1].row===0&&placed[2].start===1);
 r.blocks=splitColumnPreset();render();await insertDroppedMedia([image,video],{index:0});placed=layoutPlacements(r.blocks);
 check('multiple dropped media preserve both right-hand cells',r.blocks.length===4&&r.blocks[0].type==='image'&&r.blocks[3].type==='video'&&placed[1].row===0&&placed[2].row===1&&placed[3].start===1&&placed[3].row===2);
 r.blocks=splitColumnPreset();render();activeRichIndex=1;await insertMedia('image');
 check('the media picker fills the selected slot using the same column rules',r.blocks[1].type==='image'&&r.blocks[1].layout.start===7&&r.blocks.length===3);
 const language=locale;locale='en';
 check('new headings are empty and English metadata stays localized',makeV3Block('heading2').text===''&&makeV3Block('date').title==='Date'&&makeV3Block('table').rows[0][0]==='Name');locale=language;
 // Media removal is discoverable, scoped to one block and reversible.
 r.blocks=[{...structuredClone(window.__fixtureMedia.image),layout:{span:6}}, {...structuredClone(window.__fixtureMedia.video),layout:{span:6}}, {type:'text',text:'Keep this neighbor'}];render();selectLayoutBlock(0);
 const mediaBefore=JSON.stringify(r.blocks),mediaButton=$('[data-component="0"] [data-media-remove]');
 check('image and video have visible inline removal buttons',mediaButton.getBoundingClientRect().width>30&&getComputedStyle(mediaButton.closest('.mj-media-tools')).display!=='none'&&$('[data-component="1"] [data-media-remove]').textContent.includes('视频'));
 check('selected media has a second removal control in the inspector',$('#mj-layout-inspector [data-media-remove="0"]')?.getBoundingClientRect().height>20);
 mediaButton.click();check('removing an image keeps the video bytes and neighboring text',r.blocks.length===2&&r.blocks[0].data===window.__fixtureMedia.video.data&&r.blocks[1].text==='Keep this neighbor');
 undoEditor();check('undo restores exact media data and column settings',JSON.stringify(r.blocks)===mediaBefore);
 selectLayoutBlock(1);$('#mj-layout-inspector [data-media-remove="1"]').click();check('inspector removal targets only the selected video',r.blocks.length===2&&r.blocks[0].type==='image'&&r.blocks[1].text==='Keep this neighbor');
 undoEditor();check('video removal can be undone',JSON.stringify(r.blocks)===mediaBefore);
 docMode='view';render();check('reading view has no media removal controls',!$('[data-media-remove]'));removeMediaBlock(0);check('media removal refuses reading mode',JSON.stringify(r.blocks)===mediaBefore);
 docMode='edit';r.blocks=[structuredClone(window.__fixtureMedia.video)];render();$('[data-component="0"] [data-media-remove]').click();
 check('removing the last media leaves an editable blank paragraph',r.blocks.length===1&&r.blocks[0].type==='text'&&!!$('[data-rich-block="0"]'));undoEditor();
 check('undo after last-media removal restores the video',r.blocks.length===1&&r.blocks[0].data===window.__fixtureMedia.video.data);
 // Keep inspector context and disclosures while changing selections.
 r.blocks=[{type:'text',text:'First'},{type:'date',title:'Date',value:'2026-10-20'}];render();selectLayoutBlock(0);
 $('[data-layout-section="spacing"]').open=true;syncLayoutInspector(true);selectLayoutBlock(1);
 check('inspector follows the actual selected component',$('.mj-layout-target strong').textContent==='日期'&&$('.mj-layout-target small').textContent.includes('2'));
 check('inspector preserves expanded sections across edits and selections',$('[data-layout-section="spacing"]').open);
 const oldLocale=locale;locale='en';syncLayoutInspector(true);
 check('English inspector labels are English',$('.mj-layout-target strong').textContent==='Date'&&$('[data-layout-section="grid"]>summary').textContent==='Precise columns');
 const sidebar=$('#mj-layout-inspector');check('English inspector fits its available width',sidebar.scrollWidth<=sidebar.clientWidth+1);
 locale=oldLocale;syncLayoutInspector(true);
 // All whole-record deletion entry points require confirmation, default to
 // Cancel, preserve edits when cancelled, and retain identity when restored.
 r.name='Synthetic deletion <title>';r.blocks=[{type:'text',text:'Unsaved synthetic draft'},structuredClone(window.__fixtureMedia.image)];render();
 const recordBefore=JSON.stringify(r),id=r.id,trashBefore=trashedRecords.length;
 $('.mj-docbar [data-refine="delete-record"]').focus();$('.mj-docbar [data-refine="delete-record"]').click();await Promise.resolve();
 check('document deletion asks before mutating data',!!$('[data-refine="confirm-trash"]')&&record(id)===r&&trashedRecords.length===trashBefore&&$('#mj-dialog-description').textContent===r.name);
 check('trash confirmation focuses the safe cancel action',document.activeElement===$('[data-trash-cancel]'));
 $('[data-trash-cancel]').click();check('cancelling retains content, editing mode and original focus',JSON.stringify(r)===recordBefore&&state.selected===id&&isEditing()&&document.activeElement===$('.mj-docbar [data-refine="delete-record"]'));
 $('.mj-docbar [data-refine="delete-record"]').click();await key($('[data-trash-cancel]'),'Escape');check('Escape cancels deletion without changing records',record(id)===r&&$('#mj-overlay').hidden);
 state.view='table';render();const listDelete=$('[data-refine="delete-record"][data-id="'+id+'"]');listDelete.click();check('list delete also requires confirmation',!!$('[data-refine="confirm-trash"]')&&record(id)===r);$('[data-trash-cancel]').click();
 showRecordMenu(r,400,300);$('[data-record-menu="trash"]').click();check('context-menu deletion uses the same confirmation',!!$('[data-refine="confirm-trash"]')&&record(id)===r);
 $('[data-refine="confirm-trash"]').click();check('confirm moves the complete document into Trash once',!record(id)&&trashedRecords.filter(item=>item.id===id).length===1&&JSON.stringify(trashedRecords.find(item=>item.id===id).blocks)===JSON.stringify(r.blocks));
 restoreRecord(id);check('restore retains document identity and media',record(id)===r&&JSON.stringify(r)===recordBefore);openRecord(id);docMode='edit';render();
 r.blocks=[
 ...['COLONE','COLTWO','COLTHREE'].map((text,i)=>({type:'heading',level:2,text,layout:{span:4,padding:12},textStyle:{fontSize:28,color:'#203e37'},surface:{background:['#e4f3ed','#fff1df','#edf3ff'][i],radius:8}})),
 {type:'text',text:'TALLLEFT\n'+('A tall card with text and room to breathe.\n').repeat(5),layout:{span:6,rowSpan:2,padding:18,breakBefore:true},textStyle:{fontSize:18,color:'#ffffff'},surface:{background:'#203e37',radius:10}},
 {type:'heading',text:'STACKTOP',level:2,layout:{span:6,padding:16},textStyle:{fontSize:22,color:'#b85e40'},surface:{background:'#fff1df',radius:10}},
 {type:'text',text:'STACKBOTTOM\nTwo cards beside one tall card.',layout:{span:6,padding:16},textStyle:{fontSize:18},surface:{background:'#edf3ff',radius:10}},
 {...structuredClone(window.__fixtureMedia.image),layout:{span:6,breakBefore:true}},
 {...structuredClone(window.__fixtureMedia.video),layout:{span:6,breakAfter:true}},
 ...Array.from({length:18},(_,i)=>({type:'text',text:'PAGE '+i+'。合成分页验收。 '+('Text retains its original wrapping and column proportions. ').repeat(6)+(i===0?'ROWENDZERO':'')}))
 ];
 r.blocks.push({type:'text',text:('LONG PARAGRAPH。合成长文。 '.repeat(700))+' END-OF-LONG-BLOCK'});
 docMode='view';render();await new Promise(resolve=>setTimeout(resolve,60));
 const previewPacket=await captureDocumentPrint(r,{preview:true}),html=previewPacket.html,box=$('#mj-blocks'),width=box.getBoundingClientRect().width;
 const markers=[['COLONE',0],['COLTWO',1],['COLTHREE',2],['TALLLEFT',3],['STACKTOP',4],['STACKBOTTOM',5],['PAGE 0',8],['ROWENDZERO',8],['PAGE 1',9]].map(([text,i])=>{
  const el=$('[data-rich-block="'+i+'"]'),range=document.createRange(),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode())if(node.textContent.includes(text)){const at=node.textContent.indexOf(text);range.setStart(node,at);range.setEnd(node,at+text.length);break;}
  const rawRects=[...range.getClientRects()],visibleRects=rawRects.filter(part=>part.width>0&&part.height>0);
  // Safari on macOS 14 can include a zero-width caret at the previous line's
  // right edge. Measure painted glyphs, not that invisible range boundary.
  if(!visibleRects.length)throw new Error('Missing screen glyphs: '+text);
  const x=Math.min(...visibleRects.map(part=>part.left)),y=Math.min(...visibleRects.map(part=>part.top));
  const right=Math.max(...visibleRects.map(part=>part.right)),origin=box.getBoundingClientRect();
  return {text,x:x-origin.x,y:y-origin.y,width:right-x,lineRects:rawRects.map(part=>({x:part.x-origin.x,y:part.y-origin.y,width:part.width,height:part.height}))};
 });
 check('PDF carries actual widths, computed fonts and row tracks',html.includes('grid-template-rows:')&&html.includes('font-size: 28px')&&html.includes('folio-print-canvas'));
 check('PDF strips UI controls and playable video',!html.includes('<button')&&!html.includes('<video')&&!html.includes('contenteditable')&&!html.includes(window.__fixtureMedia.video.data));
 check('PDF retains the local video poster',html.includes(window.__fixtureMedia.video.poster));
 const testForm=document.createElement('div');testForm.innerHTML='<p onclick="bad()">safe<script>bad()</script><img src="https://example.invalid/remote.png"><input type="password" value="NeverExportThisSecret"></p>';
 document.body.append(testForm);const inert=inertPrintNode(testForm).outerHTML;testForm.remove();
 check('print copying removes handlers, remote images, script and visible passwords',!inert.match(/onclick|https:|<script|NeverExportThisSecret/));
 const rect=box.getBoundingClientRect();
 return {html,width,markers,previewPageCount:previewPacket.pages,count:window.__editorChecks,rect:{x:rect.x,y:rect.y,width:rect.width,height:Math.min(720,rect.height)}};
};
