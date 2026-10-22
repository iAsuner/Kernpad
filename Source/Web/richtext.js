let richBlockSelection=null,pdfExporting=false,mediaImporting=false;
componentTypes.push(['image','image','图片','插入本地图片'],['video','video','视频','插入本地视频，最多 8 MB']);
function richToolbar(){
 return `<div class="mj-formatbar mj-rich-toolbar" aria-label="${ui('富文本格式','Rich text formatting')}">
 <select data-rich-control="block" aria-label="${ui('段落样式','Paragraph style')}">${[['text',ui('正文','Body')],['heading1',ui('大标题','Title')],['heading2',ui('标题','Heading')],['heading3',ui('小标题','Subheading')],['quote',ui('引用','Quote')]].map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select>
 <label class="mj-rich-size"><input type="number" min="10" max="72" step="1" data-rich-control="size" aria-label="${ui('字号','Font size')}" placeholder="14"><span>px</span></label>
 ${[['strong','bold','加粗','Bold'],['em','italic','斜体','Italic'],['del','strikethrough','删除线','Strikethrough'],['mark','highlighter','高亮','Highlight'],['code','code','行内代码','Inline code']].map(([format,ico,zh,en])=>`<button class="mj-icon" data-v4-format="${format}" aria-label="${ui(zh,en)}" title="${ui(zh,en)}">${icon(ico)}</button>`).join('')}
 <button class="mj-icon mj-rich-color" data-rich-action="colors" aria-haspopup="dialog" aria-expanded="false" aria-label="${ui('文字颜色','Text color')}" title="${ui('文字颜色','Text color')}">${icon('baseline')}</button>
 <button class="mj-icon" data-rich-action="reset-style" aria-label="${ui('恢复段落字号和颜色','Reset paragraph size and color')}" title="${ui('恢复段落字号和颜色','Reset paragraph size and color')}">${icon('remove-formatting')}</button>
 <span class="mj-format-divider"></span>
 ${[['left','align-left','左对齐','Align left'],['center','align-center','居中','Align center'],['right','align-right','右对齐','Align right'],['justify','align-justify','两端对齐','Justify']].map(([align,ico,zh,en])=>`<button class="mj-icon" data-rich-align="${align}" aria-label="${ui(zh,en)}" title="${ui(zh,en)}" aria-pressed="false">${icon(ico)}</button>`).join('')}
 <button class="mj-icon" data-rich-action="accent" aria-label="${ui('引用竖线','Quote border')}" title="${ui('给选中的段落添加或移除竖线','Toggle border on selected paragraphs')}" aria-pressed="false">${icon('panel-left')}</button>
 <button class="mj-icon" data-rich-action="divider" aria-label="${ui('插入分割线','Insert divider')}" title="${ui('插入分割线','Insert divider')}">${icon('minus')}</button>
 <span class="mj-format-divider"></span><button class="mj-button" data-v4="insert-menu">${icon('plus')}${ui('内容','Insert')}</button>
 <button class="mj-icon" data-rich-action="image" aria-label="${ui('插入图片','Insert image')}" title="${ui('插入图片','Insert image')}">${icon('image')}</button><button class="mj-icon" data-rich-action="video" aria-label="${ui('插入视频','Insert video')}" title="${ui('插入视频','Insert video')}">${icon('video')}</button><button class="mj-button" data-rich-action="import">${icon('file-code-2')}${ui('导入文本…','Import text…')}</button></div>`;
}
function polishRichBlocks(container,r){
 syncDocumentMediaResources();
 for(const el of container.querySelectorAll('[data-component]')){el.querySelector('.mj-heading-row>select')?.remove();const b=r.blocks[Number(el.dataset.component)];if(!b)continue;
  if(['image','video'].includes(b.type))el.innerHTML=richMediaMarkup(b,Number(el.dataset.component));
  const target=el.querySelector('.mj-list-block,.mj-table-wrap,.mj-source-surface')||el.querySelector('[data-rich-block]')||el;
  const css=richStyleCSS(b.textStyle);if(css)target.setAttribute('style',(target.getAttribute('style')||'')+';'+css);
  if(b.accent&&b.type!=='quote')el.classList.add('mj-rich-accent');
 }
 polishLayoutBlocks(container,r);
}
function rememberRichBlocks(){
 if(!isEditing()||state.view!=='document'||layoutPointer||layoutDrag||document.activeElement?.closest('.mj-block-handle,#mj-layout-inspector,.mj-color-menu,#mj-blocks input,#mj-blocks textarea,#mj-blocks select,#mj-blocks [data-cell]'))return;
 const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0),indexFor=node=>(node.nodeType===1?node:node.parentElement)?.closest('[data-component]')?.dataset.component;
 const start=indexFor(range.startContainer),end=indexFor(range.endContainer);if(start===undefined||end===undefined)return;
 const low=Math.min(Number(start),Number(end)),high=Math.max(Number(start),Number(end));richBlockSelection={id:selected().id,indices:Array.from({length:high-low+1},(_,i)=>low+i)};activeRichIndex=Number(start);syncRichToolbar();syncLayoutSelection();syncLayoutInspector();
}
function currentRichIndices(){const r=selected();if(!r)return [];if(richBlockSelection?.id===r.id)return richBlockSelection.indices.filter(i=>r.blocks[i]);return activeRichIndex!==null&&r.blocks[activeRichIndex]?[activeRichIndex]:[];}
function syncRichToolbar(){
 if(!isEditing())return;const indices=currentRichIndices(),r=selected(),b=r?.blocks[indices[0]];if(!b)return;
 const toolbar=$('.mj-rich-toolbar');if(!toolbar)return;
 const set=(key,value)=>{const control=toolbar.querySelector('[data-rich-control="'+key+'"]');if(control&&document.activeElement!==control)control.value=value;};
 set('block',b.type==='heading'?'heading'+Math.min(3,b.level||2):b.type==='quote'?'quote':'text');set('size',b.textStyle?.fontSize||'');setRichColorIndicator();
 toolbar.querySelectorAll('[data-rich-align]').forEach(n=>n.setAttribute('aria-pressed',String((b.textStyle?.align||'left')===n.dataset.richAlign)));toolbar.querySelector('[data-rich-action="accent"]')?.setAttribute('aria-pressed',String(!!b.accent||b.type==='quote'));
}
function setRichFormat(key,value){
 const r=selected();if(!r||!isEditing()||isProtected(r)&&!vaultUnlocked)return;
 const indices=currentRichIndices();if(!indices.length){toast(ui('先点击正文或选中段落','Click text or select paragraphs first'));return;}
 if(key==='fontSize'&&!richSize(value)){toast(ui('字号范围为 10–72 px','Font size must be 10–72 px'));return;}
 if(key==='color'&&!richColor(value))return;
 snapshotEditor();const stored=richSelection;
 if(['fontSize','color'].includes(key)&&indices.length===1&&stored&&root.contains(stored.el)&&Number(stored.el.dataset.richBlock)===indices[0]&&!stored.range.collapsed){
  const {range,el}=stored,clearProperty=n=>{if(key==='color'){n.removeAttribute('data-rt-color');n.removeAttribute('data-color');n.style.removeProperty('color');}else{n.removeAttribute('data-rt-size');n.style.removeProperty('font-size');}};
  let ancestor=(range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement);while(ancestor&&ancestor!==el){if(ancestor.tagName==='SPAN'&&ancestor.textContent===range.toString())clearProperty(ancestor);ancestor=ancestor.parentElement;}
  const fragment=range.extractContents();fragment.querySelectorAll('span').forEach(clearProperty);
  if(key==='reset'){fragment.querySelectorAll('span').forEach(n=>{n.removeAttribute('data-rt-size');n.removeAttribute('data-rt-color');n.removeAttribute('data-color');n.removeAttribute('style');});}
  const wrapper=document.createElement('span');if(key==='fontSize'){wrapper.dataset.rtSize=richSize(value);wrapper.style.fontSize=richSize(value)+'px';}if(key==='color'){wrapper.dataset.rtColor=richColor(value);wrapper.style.color=richColor(value);}wrapper.append(fragment);range.insertNode(wrapper);range.selectNodeContents(wrapper);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);readRich(el);rememberSelection();
 }else{
  const accentValue=!indices.every(i=>r.blocks[i].accent||r.blocks[i].type==='quote');
  for(const i of indices){const b=r.blocks[i];if(key==='accent'){b.accent=accentValue;if(!accentValue&&b.type==='quote')b.type='text';continue;}
   if(key==='block'){if(!['text','heading','quote'].includes(b.type))continue;if(value.startsWith('heading')){b.type='heading';b.level=Number(value.slice(-1));}else{b.type=value;delete b.level;}continue;}
   b.textStyle=richStyle(b.textStyle);if(key==='reset'){delete b.textStyle.fontSize;delete b.textStyle.color;const box=document.createElement('div');box.innerHTML=mdInline(b.text||'');box.querySelectorAll('span').forEach(n=>n.replaceWith(...n.childNodes));if('text'in b)b.text=richSource(box);if(b.items)b.items=b.items.map(text=>{box.innerHTML=mdInline(text);box.querySelectorAll('span').forEach(n=>n.replaceWith(...n.childNodes));return richSource(box);});}else b.textStyle[key]=value;
  }
  repaintBlocks();richSelection=null;
 }
 remember();syncRichToolbar();
}
let richImportMode='html';
function showRichImport(mode='html'){
 richImportMode=mode;state.modal='rich-import';modal(ui('导入文本','Import text'),mode==='html'?ui('HTML 转为可编辑内容，保留支持的文字样式和结构。','Convert HTML into editable text with supported styles and structure.'):ui('将 Markdown 转为标题、正文、列表和其他内容。','Convert Markdown into headings, text, lists and other blocks.'),`<div class="mj-segmented mj-rich-import-tabs"><button data-rich-import-mode="html" aria-pressed="${mode==='html'}">HTML</button><button data-rich-import-mode="markdown" aria-pressed="${mode==='markdown'}">Markdown</button></div><textarea id="mj-rich-import-source" class="mj-field-input mj-mono" rows="12" aria-label="${mode==='html'?'HTML':'Markdown'}" placeholder="${mode==='html'?'&lt;h2 style=&quot;color: #245db0&quot;&gt;标题&lt;/h2&gt;':'## 标题'}"></textarea><p class="mj-parser-hint">${ui('插入到当前段落之后。可在编辑后撤销导入。','Insert after the current paragraph. You can undo the import.')}</p><p id="mj-rich-import-error" role="alert"></p>`,`<button class="mj-button" data-action="close-modal">${ui('取消','Cancel')}</button><button class="mj-primary" data-rich-action="import-confirm">${ui('插入','Insert')}</button>`);$('#mj-overlay .mj-modal').classList.add('mj-wide-modal');
}
function insertRichContent(source,mode){
 const r=selected();if(!isEditing()||!r||isProtected(r)&&!vaultUnlocked)return;
 const blocks=mode==='html'?richImportHTML(source):parseMarkdown(source);if(!blocks.length)throw new Error(ui('没有可插入的内容','No content to insert'));snapshotEditor();const i=activeRichIndex===null?r.blocks.length:Math.min(r.blocks.length,activeRichIndex+1);r.blocks.splice(i,0,...blocks);closeModal();richBlockSelection=null;richSelection=null;repaintBlocks();focusRich(i);remember();toast(ui('内容已插入','Content inserted'));
}
async function insertMedia(kind){
 const r=selected(),epoch=privacyEpoch,index=insertContext?.index??activeRichIndex??r?.blocks.length-1;insertContext=null;closeComponentMenu();
 if(!r||!isEditing()||mediaImporting||isProtected(r)&&!vaultUnlocked)return;
 const anchor=r.blocks[index],original=anchor?JSON.stringify(anchor):null;
 mediaImporting=true;try{await persist();const result=await nativeCall('chooseMedia',{kind});if(result.cancelled||epoch!==privacyEpoch||record(r.id)!==r||selected()!==r||!isEditing()||isProtected(r)&&!vaultUnlocked)return;
  const block=result.block;if(!block||!safeMediaData(block.data,kind))throw new Error(ui('无法插入媒体文件','Could not insert media'));
  const target=anchor?r.blocks.indexOf(anchor):index;if(anchor&&(target<0||JSON.stringify(anchor)!==original))throw new Error(ui('目标栏已改变，请重新插入。','The target cell changed. Insert the file again.'));
  const next=snapshot(),draft=next.records.find(item=>item.id===r.id),indices=placeDroppedMedia(draft.blocks,target,[block]);
  if(draft.blocks.length>5000||new TextEncoder().encode(JSON.stringify(next)).length>20*1024*1024)throw new Error(ui('附件总量超过当前资料库容量，请移除一些附件后重试。','The library is full. Remove some attachments and try again.'));
  snapshotEditor();r.blocks=draft.blocks;richSelection=null;richBlockSelection={id:r.id,indices};repaintBlocks();requestAnimationFrame(()=>$('[data-component="'+indices[0]+'"]')?.scrollIntoView({block:'nearest'}));remember();toast(ui('媒体已插入','Media inserted'));
 }catch(error){toast(String(error));}finally{mediaImporting=false;}
}
async function exportDocumentPDF(){
 return openPDFPreview();
}
root.addEventListener('pointerdown',e=>{if(e.target.closest('[data-rich-action],[data-rich-align],[data-rich-control]')){editorPropertyPointer=true;rememberSelection();if(e.target.closest('button'))e.preventDefault();}},true);
document.addEventListener('selectionchange',rememberRichBlocks);
root.addEventListener('focusin',e=>{const el=e.target.closest('[data-rich-block]');if(el){activeRichIndex=Number(el.dataset.richBlock);richBlockSelection={id:selected().id,indices:[activeRichIndex]};syncRichToolbar();}});
root.addEventListener('click',e=>{
 const align=e.target.closest('[data-rich-align]'),mode=e.target.closest('[data-rich-import-mode]'),button=e.target.closest('[data-rich-action]');if(!align&&!mode&&!button)return;e.preventDefault();e.stopImmediatePropagation();if(align){setRichFormat('align',align.dataset.richAlign);return;}if(mode){const draft=$('#mj-rich-import-source')?.value||'';showRichImport(mode.dataset.richImportMode);$('#mj-rich-import-source').value=draft;return;}
 const action=button.dataset.richAction;try{if(action==='colors')showRichColorPicker(button);if(['image','video'].includes(action))insertMedia(action);if(action==='accent')setRichFormat('accent');if(action==='reset-style')setRichFormat('reset');if(action==='divider'){insertContext={index:activeRichIndex??selected().blocks.length-1};addBlockV4('divider');remember();}if(action==='import')showRichImport();if(action==='import-confirm')insertRichContent($('#mj-rich-import-source').value,richImportMode);if(action==='export-pdf')exportDocumentPDF();}catch(error){const box=$('#mj-rich-import-error');if(box)box.textContent=error.message;else toast(error.message);}
},true);
root.addEventListener('change',e=>{if(e.target.dataset.richMediaWidth!==undefined){const b=selected()?.blocks[Number(e.target.dataset.richMediaWidth)];if(b&&isEditing()){snapshotEditor();b.width=Number(e.target.value);repaintBlocks();remember();}return;}const key=e.target.dataset.richControl;if(!key)return;if(key==='size')setRichFormat('fontSize',Number(e.target.value));if(key==='color')setRichFormat('color',e.target.value);if(key==='block')setRichFormat('block',e.target.value);},true);
window.nativeApp.exportPDF=exportDocumentPDF;

function clearRichState(){
 clearDocumentMediaResources();
 if(typeof clearEditorHistory==='function')clearEditorHistory();
 richBlockSelection=null;closeRichColorPicker();cancelLayoutDrag();
 if(isProtected(selected()))root.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();});
}
