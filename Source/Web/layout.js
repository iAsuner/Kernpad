function layoutPrimary(event){return globalThis.kernpadPlatform==='windows'?event.ctrlKey:event.metaKey;}
let layoutInspectorOpen=true,layoutMarkers=false,layoutDrag=null,layoutDrop=null,layoutPointer=null,layoutIgnoreClick=false,blockSelectionRecord=null;
function renderLayoutEditor(){
 $('#mj-workspace').classList.toggle('mj-document',state.view==='document');
 root.classList.toggle('mj-layout-edit',isEditing()&&state.view==='document');root.classList.toggle('mj-layout-markers',layoutMarkers&&isEditing());
 if(isEditing()&&state.view==='document'&&selected()?.blocks.length&&!currentRichIndices().length){activeRichIndex=0;richBlockSelection={id:selected().id,indices:[0]};syncLayoutSelection();}
 if(state.view!=='document'||!selected()){root.classList.remove('mj-layout-inspector-open');return;}
 const bar=$('.mj-docbar');if(isEditing()&&bar&&!bar.querySelector('[data-layout-action="inspector"]'))bar.querySelector('.mj-spacer').insertAdjacentHTML('beforebegin',`<button class="mj-button" data-layout-action="inspector" aria-pressed="${layoutInspectorOpen}">${icon('panel-right')}${ui('排版','Layout')}</button>`);
 applyDocumentOptions();let panel=$('#mj-layout-inspector');if(!isEditing()){panel?.remove();root.classList.remove('mj-layout-inspector-open');return;}
 const viewButton=$('[data-v4="view"]');if(viewButton){viewButton.innerHTML=icon('book-open')+ui('阅读','Read');viewButton.title=ui('切换编辑／阅读','Toggle editing / reading')+' ('+shortcutLabel(currentShortcuts().markers)+')';}
 const editButton=$('[data-v4="edit"]');if(editButton)editButton.title=ui('切换编辑／阅读','Toggle editing / reading')+' ('+shortcutLabel(currentShortcuts().markers)+')';
 applyDocumentOptions();
 if(!panel){panel=document.createElement('aside');panel.id='mj-layout-inspector';panel.className='mj-layout-inspector';panel.setAttribute('aria-label',ui('内容格式与布局','Content format and layout'));$('.mj-document').append(panel);}
 root.classList.toggle('mj-layout-inspector-open',layoutInspectorOpen);panel.hidden=!layoutInspectorOpen;panel.style.top=($('.mj-docbar').offsetHeight+($('.mj-formatbar')?.offsetHeight||0))+'px';syncLayoutInspector();icons();
}
function polishLayoutBlocks(container,r){
 const placements=layoutPlacements(r.blocks);for(const el of container.querySelectorAll('[data-component]')){
  const index=Number(el.dataset.component),b=r.blocks[index],l=blockLayout(b.layout);el.style.gridColumn=placements[index].start+' / span '+l.span;el.style.gridRow=(placements[index].row+1)+' / span '+l.rowSpan;el.style.alignSelf=l.heightMode==='row'?'stretch':'start';el.classList.toggle('mj-layout-slot',b.type==='text'&&!b.text?.trim()&&l.span<12);el.style.padding=l.padding+'px';el.style.marginTop=l.before+'px';el.style.marginBottom=l.after+'px';el.style.setProperty('--block-leading',l.lineHeight);
  const surface=blockSurfaceCSS(b.surface);if(surface)el.style.cssText+=';'+surface;
  if(b.type==='otp')renderNoteAuthenticator(el,r,b,index);
  if(!isEditing())continue;
  el.insertAdjacentHTML('beforeend',`<button class="mj-layout-gap" data-layout-gap="${index}" aria-label="${ui('在第 '+(index+1)+' 块下方插入内容','Insert content below block '+(index+1))}" title="${ui('在此处插入内容','Insert content here')}">${icon('plus')}</button>`);
  el.insertAdjacentHTML('afterbegin',`<button class="mj-block-handle" draggable="false" data-layout-block="${index}" aria-label="${escape(ui('选择或拖动第 '+(index+1)+' 个内容块','Select or drag block '+(index+1)))}" title="${escape(ui('拖动排序；⇧ 点击多选','Drag to reorder; Shift-click to select more'))}">${icon('grip-vertical')}<small>${blockLabel(b)}</small></button>`);
  if(currentRichIndices().includes(index)&&richBlockSelection?.id===r.id)el.classList.add('mj-layout-selected');
 }
}
function selectLayoutBlock(index,multi=false,range=false){
 const r=selected();if(!r?.blocks[index]||!isEditing())return;
 let indices=richBlockSelection?.id===r.id?richBlockSelection.indices:[];
 if(range&&indices.length){const start=Math.min(...indices),end=index;indices=Array.from({length:Math.abs(end-start)+1},(_,i)=>Math.min(start,end)+i);}
 else if(multi)indices=indices.includes(index)?indices.filter(i=>i!==index):[...indices,index];else indices=[index];
 richBlockSelection={id:r.id,indices};richSelection=null;activeRichIndex=index;blockSelectionRecord=r.id;syncLayoutSelection();syncLayoutInspector(true);syncRichToolbar();
}
function syncLayoutSelection(){const indices=currentRichIndices();$$('#mj-blocks>[data-component]').forEach(el=>el.classList.toggle('mj-layout-selected',indices.includes(Number(el.dataset.component))));}
const layoutSections=new Map([['grid',true]]);
function layoutBlockName(block){return ({text:ui('正文','Text'),heading:ui('标题','Heading'),image:ui('图片','Image'),video:ui('视频','Video'),list:ui('列表','List'),table:ui('表格','Table'),code:ui('代码','Code'),date:ui('日期','Date'),quote:ui('引用','Quote'),check:ui('待办','Checklist'),otp:ui('验证器','Authenticator'),divider:ui('分割线','Divider'),form:ui('表单','Form')})[block?.type]||ui('内容块','Block');}
function syncLayoutInspector(force=false){
 const panel=$('#mj-layout-inspector');if(!panel||panel.hidden)return;const r=selected(),indices=currentRichIndices().filter(i=>r.blocks[i]),blocks=indices.map(i=>r.blocks[i]),first=blocks[0],l=blockLayout(first?.layout),mixed=key=>blocks.some(b=>blockLayout(b.layout)[key]!==l[key]);
 if(!force&&panel.children.length&&(editorPropertyPointer||document.activeElement&&panel.contains(document.activeElement)))return;
 const top=panel.scrollTop;panel.querySelectorAll('[data-layout-section]').forEach(el=>layoutSections.set(el.dataset.layoutSection,el.open));
 const details=(key,title,body)=>`<details class="mj-layout-section" data-layout-section="${key}" ${layoutSections.get(key)?'open':''}><summary>${title}</summary><section>${body}</section></details>`;
 const disabled=!first?' disabled':'',upDisabled=!first||Math.min(...indices)===0?' disabled':'',downDisabled=!first||Math.max(...indices)===r.blocks.length-1?' disabled':'',inlineDisabled=indices.length<2?' disabled':'',options=[[12,ui('整行','Full')],[6,ui('半行','Half')],[4,ui('三分','Third')],[3,ui('四分','Quarter')]];
 const number=(key,label,min,max,step=1)=>`<label><span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" data-layout-control="${key}" value="${mixed(key)?'':l[key]}" placeholder="${ui('混合','Mixed')}"${disabled}></label>`;
 const position=first?layoutPlacements(r.blocks)[indices[0]]:null,media=first&&['image','video'].includes(first.type),single=indices.length===1;
 panel.innerHTML=`
 <div class="mj-layout-heading"><strong>${ui('排版','Layout')}</strong><button class="mj-icon" data-layout-action="inspector" aria-label="${ui('隐藏格式栏','Hide format sidebar')}">${icon('x')}</button></div>
 <div class="mj-layout-target"><span class="mj-layout-target-icon">${icon(media?first.type==='image'?'image':'film':'layout-template')}</span><div><strong>${first?single?layoutBlockName(first):ui(indices.length+' 个内容块',indices.length+' blocks'):ui('选择内容','Select content')}</strong><small>${first?single?ui('第 '+(indices[0]+1)+' 个，共 '+r.blocks.length+' 个','Block '+(indices[0]+1)+' of '+r.blocks.length):ui('修改应用于所选内容','Changes apply to this selection'):ui('点击正文、图片或组件','Click text, media or a component')}</small></div>${templateInspectorKeys(r,blocks)}</div>
 ${media&&single?`<section class="mj-layout-media-section"><label class="mj-layout-stacked"><span>${ui('媒体说明','Media caption')}</span><input data-layout-media-name value="${escape(first.name||'')}" maxlength="200"></label><label><span>${ui('栏内宽度','Width within column')}</span><select data-rich-media-width="${indices[0]}">${[25,50,75,100].map(n=>`<option value="${n}" ${(first.width||100)===n?'selected':''}>${n}%</option>`).join('')}</select></label><button class="mj-media-remove" data-media-remove="${indices[0]}">${icon('trash-2')}${first.type==='image'?ui('删除图片','Remove image'):ui('删除视频','Remove video')}</button></section>`:''}
 <section class="mj-layout-primary"><h3>${ui('宽度与位置','Width & Position')}</h3>
 <div class="mj-layout-presets">${options.map(([span,name])=>`<button data-layout-span="${span}" aria-label="${name} (${span}/12)" aria-pressed="${!!first&&!mixed('span')&&l.span===span}"${disabled}><span class="mj-width-symbol" aria-hidden="true"><i style="width:${span/12*100}%"></i></span>${name}</button>`).join('')}</div>
 <div class="mj-layout-grid" role="img" aria-label="${escape(first?ui('占 '+l.span+' 格，起始第 '+position.start+' 格','Spans '+l.span+' columns, starting at '+position.start):ui('未选择内容','No selection'))}">${Array.from({length:12},(_,i)=>`<i class="${first&&!mixed('span')&&i>=position.start-1&&i<position.start-1+l.span?'filled':''}"></i>`).join('')}</div>
 <div class="mj-layout-position" aria-label="${ui('内容位置','Block position')}">${[['left',ui('居左','Left')],['center',ui('居中','Center')],['right',ui('居右','Right')]].map(([key,label])=>`<button class="mj-button" data-layout-position="${key}"${disabled}>${label}</button>`).join('')}</div>
 <div class="mj-layout-order"><button class="mj-button" data-layout-flow="separate"${disabled}>${ui('单独一行','Own row')}</button><button class="mj-button" data-layout-flow="inline"${inlineDisabled}>${ui('并排排列','Side by side')}</button></div>
 <label><span>${ui('背景高度','Background height')}</span><select data-layout-control="heightMode"${disabled}>${mixed('heightMode')?`<option value="" selected disabled>${ui('混合','Mixed')}</option>`:''}<option value="content" ${!mixed('heightMode')&&l.heightMode==='content'?'selected':''}>${ui('随内容','Fit content')}</option><option value="row" ${!mixed('heightMode')&&l.heightMode==='row'?'selected':''}>${ui('同排等高','Match row')}</option></select></label></section>
 ${indices.length>1?`<button class="mj-media-remove mj-selected-remove" data-delete-selected-blocks>${icon('trash-2')}${ui('删除所选 '+indices.length+' 个内容块','Delete '+indices.length+' selected blocks')}</button>`:''}
 ${details('grid',ui('精确分栏','Precise columns'),`<p class="mj-layout-help">${ui('分栏：每行 12 格','Columns: 12 per row')}</p>${number('span',ui('占用格数','Column span'),1,12)}${number('start',ui('起始格','Start column'),0,13-l.span)}<p class="mj-layout-help">${ui('起始格 0 表示自动；允许留白。','0 means automatic placement. Empty columns are allowed.')}</p>${number('rowSpan',ui('纵向跨行数','Rows spanned'),1,12)}<label><span>${ui('从新行开始','Start a new row')}</span><input type="checkbox" data-layout-control="breakBefore" ${l.breakBefore?'checked':''}${disabled}></label>`)}
 ${details('spacing',ui('间距','Spacing'),number('padding',ui('格内留白','Inner padding'),0,40)+number('before',ui('段前间距','Space before'),0,64)+number('after',ui('段后间距','Space after'),0,64)+number('lineHeight',ui('行距倍数','Line height'),1.2,2.4,.05))}
 ${details('surface',ui('色块与边框','Fill & Border'),'<div data-layout-surface-slot></div>')}
 ${details('insert',ui('插入与排序','Insert & Arrange'),`<div class="mj-layout-order"><button class="mj-button" data-layout-insert="before"${disabled}>${ui('在前面插入','Insert before')}</button><button class="mj-button" data-layout-insert="after"${disabled}>${ui('在后面插入','Insert after')}</button></div><div class="mj-layout-order"><button class="mj-button" data-layout-action="up"${upDisabled}>${icon('arrow-up')}${ui('上移','Up')}</button><button class="mj-button" data-layout-action="down"${downDisabled}>${icon('arrow-down')}${ui('下移','Down')}</button></div><button class="mj-layout-split" data-layout-action="split-columns"><span aria-hidden="true"><i></i><i></i><i></i></span><span>${ui('插入左大右双布局','Tall left + stacked right')}</span></button><p class="mj-layout-help">${ui('左栏跨两行，右栏上下排列。空栏可输入文字或拖入媒体。','Insert three empty cells. Type or drop media into each one.')}</p>`)}
 <button class="mj-text-button mj-layout-reset" data-layout-action="reset"${disabled}>${ui('恢复默认排版','Reset layout')}</button>
 ${details('page',ui('整篇文档','Entire document'),`<label><span>${ui('显示标题','Show title')}</span><input type="checkbox" data-document-option="title" ${documentHeaderVisible(r,'title')?'checked':''}></label><label><span>${ui('显示用途说明','Show description')}</span><input type="checkbox" data-document-option="summary" ${documentHeaderVisible(r,'summary')?'checked':''}></label>`)}
 ${details('help',ui('编辑快捷键','Editing shortcuts'),`<p class="mj-layout-help">${ui('Enter：同栏新段落；Shift+Enter'+(globalThis.kernpadPlatform==='windows'?'':' / Control+Enter')+'：段内换行；'+(globalThis.kernpadPlatform==='windows'?'Ctrl':'⌘')+'+Enter：新开整行。列表中 Enter 新增项目，空项目按退格删除。','Enter: new paragraph in this column. Shift+Enter'+(globalThis.kernpadPlatform==='windows'?'':' / Control+Enter')+': line break. '+(globalThis.kernpadPlatform==='windows'?'Ctrl':'⌘')+'+Enter: new full-width row. In lists, Enter adds an item; Backspace removes an empty item.')}</p><p class="mj-layout-help">${ui('拖动左侧手柄排序。Shift 点击连续多选，'+(globalThis.kernpadPlatform==='windows'?'Ctrl':'⌘')+' 点击自由多选。','Drag the left handle to reorder. Shift-click selects a range; '+(globalThis.kernpadPlatform==='windows'?'Ctrl':'Command')+'-click selects multiple blocks.')}</p><p class="mj-layout-help">${escape(shortcutLabel(currentShortcuts().save))} ${ui('保存并继续编辑','Save and keep editing')}<br>${escape(shortcutLabel(currentShortcuts().markers))} ${ui('切换编辑／阅读','Toggle editing / reading')}</p>`)}
 `;
 renderSurfaceControls(panel,first);const relations=$('.mj-docbody>.mj-inspector');if(relations)panel.insertAdjacentHTML('beforeend',details('relations',ui('关联资料','Linked records'),relations.innerHTML));
 const breakInput=panel.querySelector('[data-layout-control="breakBefore"]');if(breakInput)breakInput.indeterminate=mixed('breakBefore');icons();panel.scrollTop=top;
}
function removeMediaBlock(index){
 const r=selected();if(!isEditing()||!r||isProtected(r)&&!vaultUnlocked||!['image','video'].includes(r.blocks[index]?.type))return;
 snapshotEditor();r.blocks.splice(index,1);if(!r.blocks.length)r.blocks.push({type:'text',text:''});
 richSelection=null;activeRichIndex=Math.min(index,r.blocks.length-1);richBlockSelection={id:r.id,indices:[activeRichIndex]};
 repaintBlocks();syncLayoutInspector(true);remember();
 $('[data-layout-block="'+activeRichIndex+'"]')?.focus({preventScroll:true});toast(ui('媒体已删除，可撤销','Media removed. You can undo this.'));
}
function setBlockLayout(key,value){
 const r=selected(),indices=currentRichIndices();if(!r||!isEditing()||!indices.length||isProtected(r)&&!vaultUnlocked)return;
 snapshotEditor();let ordered=[...indices].sort((a,b)=>a-b);
 if(key==='heightMode'){const positions=layoutPlacements(r.blocks);let changed=true;while(changed){changed=false;for(const p of positions)if(!ordered.includes(p.index)&&ordered.some(i=>p.row<positions[i].row+positions[i].rowSpan&&p.row+p.rowSpan>positions[i].row)){ordered.push(p.index);changed=true;}}ordered.sort((a,b)=>a-b);}
 // A width preset changes the width, not the number of rows. Remove the
 // selected blocks' old position fences so fractions can flow into free cells.
 // Deliberate separate rows remain available through the Own row command.
 for(const i of ordered){const previous=blockLayout(r.blocks[i].layout);r.blocks[i].layout=blockLayout({...previous,[key]:value});if(key==='span'){r.blocks[i].layout.start=0;r.blocks[i].layout.breakBefore=false;r.blocks[i].layout.breakAfter=false;}}

 repaintBlocks();syncLayoutSelection();remember();syncLayoutInspector();
}
function renderSurfaceControls(panel,block){
 const surface=blockSurface(block?.surface),disabled=block?'':' disabled';
 const section=document.createElement('section');section.className='mj-surface-controls';section.innerHTML=`<h3>${ui('色块与边框','Fill & Border')}</h3><div class="mj-surface-swatches">${['#edf3ff','#f1ecff','#fff1df','#ffe8e6','#e4f3ed','#192c52'].map(color=>`<button style="background:${color}" data-surface-preset="${color}" aria-label="${ui('背景','Fill')} ${color}" title="${color}"${disabled}></button>`).join('')}</div><label><span>${ui('背景色','Background')}</span><input data-surface-control="background" value="${surface.background||''}" placeholder="#RRGGBB" maxlength="7" aria-label="${ui('背景色','Background color')}"${disabled}></label><label><span>${ui('边框色','Border color')}</span><input data-surface-control="borderColor" value="${surface.borderColor||''}" placeholder="#RRGGBB" maxlength="7" aria-label="${ui('边框色','Border color')}"${disabled}></label><label><span>${ui('圆角','Corners')}</span><input type="number" min="0" max="24" data-surface-control="radius" value="${surface.radius||0}" aria-label="${ui('圆角','Corner radius')}"${disabled}></label><button class="mj-text-button" data-surface-clear${disabled}>${ui('清除色块与边框','Clear fill and border')}</button>`;
 section.querySelector('h3')?.remove();panel.querySelector('[data-layout-surface-slot]')?.replaceWith(section);
}
function setBlockSurface(changes,clear=false){
 const r=selected(),indices=currentRichIndices();if(!r||!isEditing()||!indices.length||isProtected(r)&&!vaultUnlocked)return;
 snapshotEditor();for(const i of indices){if(clear)delete r.blocks[i].surface;else r.blocks[i].surface=blockSurface({...r.blocks[i].surface,...changes});}
 repaintBlocks();syncLayoutInspector(true);remember();
}
root.addEventListener('click',event=>{
 const preset=event.target.closest('[data-surface-preset]'),clear=event.target.closest('[data-surface-clear]');if(!preset&&!clear)return;
 event.preventDefault();event.stopImmediatePropagation();setBlockSurface(preset?{background:preset.dataset.surfacePreset,radius:12}: {},!!clear);
},true);
root.addEventListener('change',event=>{
 const input=event.target.closest('[data-surface-control]');if(!input)return;const key=input.dataset.surfaceControl,value=input.value.trim();
 if(key!=='radius'&&value&&!/^#[a-f\d]{6}$/i.test(value)){input.setAttribute('aria-invalid','true');toast(ui('请输入 #RRGGBB 十六进制颜色','Enter a #RRGGBB hex color'));return;}
 const number=Number(value);if(key==='radius'&&(!Number.isInteger(number)||number<0||number>24))return;
 setBlockSurface({[key]:key==='radius'?number:value});
},true);
function moveSelectedBlocks(direction){
 const r=selected(),indices=currentRichIndices();if(!r||!indices.length)return;const first=Math.min(...indices),last=Math.max(...indices);if(direction<0&&first===0||direction>0&&last===r.blocks.length-1)return;
 snapshotEditor();const moved=moveDocumentBlocks(r.blocks,indices,direction<0?first-1:last+2);richSelection=null;richBlockSelection={id:r.id,indices:moved};repaintBlocks();syncLayoutSelection();syncLayoutInspector();remember();
}
function toggleDocumentMode(){
 if(state.view!=='document'||!selected())return;const top=$('.mj-docbody')?.scrollTop||0,editing=isEditing();
 const active=document.activeElement?.closest('[data-rich-block]');if(active&&editing)readRich(active);
 docMode=editing?'view':'edit';richSelection=null;richBlockSelection=null;closeComponentMenu();render();requestAnimationFrame(()=>{const body=$('.mj-docbody');if(body)body.scrollTop=top;});remember();
}
function toggleLayoutMarkers(){toggleDocumentMode();}
function applyDocumentOptions(){
 const r=selected();if(!r)return;
 for(const [key,selector,label] of [['title','.mj-doc-title',ui('标题','Title')],['summary','.mj-docdesc',ui('用途说明','Description')]]){
  const field=$(selector);if(!field)continue;let row=field.closest('.mj-document-header-row');if(!row){row=document.createElement('div');row.className='mj-document-header-row';field.before(row);row.append(field);}
  row.hidden=!documentHeaderVisible(r,key)||!(key==='title'?r.name:r.summary)?.trim()&&(!isEditing()||key==='summary'&&editingEmptySummary!==r.id);field.hidden=row.hidden;
  let remove=row.querySelector('[data-layout-header-remove]');if(isEditing()&&!remove){remove=document.createElement('button');remove.className='mj-icon mj-remove-header';remove.dataset.layoutHeaderRemove=key;remove.setAttribute('aria-label',ui('隐藏'+label,'Hide '+label.toLowerCase()));remove.title=remove.getAttribute('aria-label');remove.innerHTML=icon('x');row.append(remove);}else if(!isEditing())remove?.remove();
 }
}

async function saveWhileEditing(){try{await persist({documentSave:true});if(!autoSaveEnabled())toast(ui('已保存，继续编辑','Saved. Keep editing.'));}catch(error){toast(String(error));}}
function renderNoteAuthenticator(el,r,b,index){
 const key=r.id+':'+index,code=blockCodes.get(key),valid=!!code;
 el.innerHTML=`<div class="mj-note-auth"><div class="mj-note-auth-heading">${icon('timer')}<strong>${escape(b.title||ui('验证器','Authenticator'))}</strong></div><div class="mj-note-auth-code"><strong class="mj-mono" data-component-code="${escape(key)}">${code?code.slice(0,3)+' '+code.slice(3):'••• •••'}</strong><button class="mj-icon" data-v3-editor="copy-block-otp" data-index="${index}" aria-label="${ui('复制验证码','Copy verification code')}" ${valid?'':'disabled'}>${icon('copy')}</button><small class="mj-otp-time"></small></div><details><summary>${ui('验证器密钥','Authenticator key')}</summary><div class="mj-note-seed">${isEditing()?`<input data-component-seed="${index}" type="password" class="mj-field-input mj-mono" value="${escape(b.seed||'')}" autocomplete="off" aria-label="${ui('验证器密钥','Authenticator key')}">`:`<input type="password" readonly class="mj-field-input mj-mono" value="${escape(b.seed||'')}" aria-label="${ui('验证器密钥','Authenticator key')}">`}<button class="mj-icon" data-layout-seed="reveal" data-index="${index}" aria-label="${ui('显示或隐藏密钥','Show or hide key')}">${icon('eye')}</button><button class="mj-icon" data-layout-seed="copy" data-index="${index}" aria-label="${ui('复制密钥','Copy key')}" ${b.seed?'':'disabled'}>${icon('copy')}</button></div><small>${plainNoteOTP(r,b)?ui('随普通便签明文保存在本机。','Stored unencrypted with this note on this Mac.'):ui('随记录加密保存。','Encrypted with this record.')}</small><p data-seed-error="${index}" role="alert"></p></details></div>`;
}
root.addEventListener('pointerdown',e=>{const panel=e.target.closest('#mj-layout-inspector');if(panel){editorPropertyPointer=true;rememberSelection();if(e.target.closest('button'))e.preventDefault();}},true);
root.addEventListener('focus',e=>{const el=e.target.closest('[data-component]');if(el&&isEditing()){if(!e.target.closest('[data-rich-block]'))selectLayoutBlock(Number(el.dataset.component));syncLayoutSelection();syncLayoutInspector();}},true);
root.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-component]');if(el&&isEditing()&&e.target.closest('input,textarea,select,[data-cell]'))selectLayoutBlock(Number(el.dataset.component));},true);
root.addEventListener('click',e=>{
 const remove=e.target.closest('[data-media-remove]');if(remove){e.preventDefault();e.stopImmediatePropagation();removeMediaBlock(Number(remove.dataset.mediaRemove));return;}
 const insert=e.target.closest('[data-layout-insert]');if(insert){e.preventDefault();e.stopImmediatePropagation();const indices=currentRichIndices();if(indices.length)showComponentMenu(insert.dataset.layoutInsert==='before'?Math.min(...indices)-1:Math.max(...indices),insert);return;}
 const position=e.target.closest('[data-layout-position]');if(position){e.preventDefault();e.stopImmediatePropagation();const r=selected(),indices=currentRichIndices();snapshotEditor();for(const i of indices){const l=blockLayout(r.blocks[i].layout);r.blocks[i].layout={...l,start:position.dataset.layoutPosition==='left'?1:position.dataset.layoutPosition==='right'?13-l.span:1+Math.floor((12-l.span)/2),breakBefore:true,breakAfter:true};}repaintBlocks();remember();syncLayoutInspector(true);return;}
 const header=e.target.closest('[data-layout-header-remove]');if(header){e.preventDefault();e.stopImmediatePropagation();const r=selected(),key=header.dataset.layoutHeaderRemove;snapshotEditor();r.documentOptions={...r.documentOptions,[key]:false};applyDocumentOptions();syncDocumentName();remember();syncLayoutInspector(true);return;}
 const seed=e.target.closest('[data-layout-seed]');if(seed){e.preventDefault();e.stopImmediatePropagation();const b=selected().blocks[Number(seed.dataset.index)];if(seed.dataset.layoutSeed==='copy')copyText(b.seed);else{const input=seed.closest('.mj-note-seed').querySelector('input');input.type=input.type==='password'?'text':'password';}return;}
 const flow=e.target.closest('[data-layout-flow]');if(flow){e.preventDefault();e.stopImmediatePropagation();snapshotEditor();const indices=[...currentRichIndices()].sort((a,b)=>a-b);for(const i of indices){const l=blockLayout(selected().blocks[i].layout);selected().blocks[i].layout={...l,start:0,breakBefore:flow.dataset.layoutFlow==='separate'||i===indices[0],breakAfter:flow.dataset.layoutFlow==='separate'||i===indices.at(-1)};}repaintBlocks();remember();return;}
 const handle=e.target.closest('[data-layout-block]'),action=e.target.closest('[data-layout-action]'),span=e.target.closest('[data-layout-span]');if(!handle&&!action&&!span){const block=e.target.closest('[data-component]');if(block&&!e.target.closest('button,input,select,textarea,[contenteditable]'))selectLayoutBlock(Number(block.dataset.component),layoutPrimary(e),e.shiftKey);return;}
 e.preventDefault();e.stopImmediatePropagation();if(handle){if(layoutIgnoreClick){layoutIgnoreClick=false;return;}selectLayoutBlock(Number(handle.dataset.layoutBlock),layoutPrimary(e),e.shiftKey);return;}if(span){setBlockLayout('span',Number(span.dataset.layoutSpan));syncLayoutInspector(true);return;}
 switch(action.dataset.layoutAction){case 'markers':toggleDocumentMode();break;case 'inspector':layoutInspectorOpen=!layoutInspectorOpen;renderLayoutEditor();break;case 'split-columns':{const r=selected(),index=(currentRichIndices().at(-1)??r.blocks.length-1)+1;snapshotEditor();r.blocks.splice(index,0,...splitColumnPreset());richBlockSelection={id:r.id,indices:[index]};repaintBlocks();remember();syncLayoutInspector(true);break;}case 'up':moveSelectedBlocks(-1);break;case 'down':moveSelectedBlocks(1);break;case 'reset':snapshotEditor();for(const i of currentRichIndices())delete selected().blocks[i].layout;repaintBlocks();remember();syncLayoutInspector();}
},true);
root.addEventListener('change',e=>{if(e.target.dataset.documentOption){const r=selected();if(e.target.dataset.documentOption==='summary')editingEmptySummary=e.target.checked?r.id:null;snapshotEditor();r.documentOptions={...r.documentOptions,[e.target.dataset.documentOption]:e.target.checked};applyDocumentOptions();remember();if(e.target.checked){const field=$(e.target.dataset.documentOption==='title'?'.mj-doc-title':'.mj-docdesc');field?.focus({preventScroll:true});}return;}const key=e.target.dataset.layoutControl;if(key){setBlockLayout(key,key==='breakBefore'?e.target.checked:key==='heightMode'?e.target.value:Number(e.target.value));}if(e.target.hasAttribute('data-layout-media-name')){const b=selected()?.blocks[currentRichIndices()[0]];if(b){b.name=e.target.value.slice(0,200);repaintBlocks();remember();}}},true);
function clearLayoutDrop(){layoutDrop=null;$('#mj-layout-drop-preview')?.remove();$$('.mj-drop-before,.mj-drop-after').forEach(n=>n.classList.remove('mj-drop-before','mj-drop-after'));}
function updateLayoutDrop(x,y){
 clearLayoutDrop();if(!layoutDrag||layoutDrag.id!==selected()?.id)return;const box=$('#mj-blocks');if(!box)return;const bounds=box.getBoundingClientRect();if(x<bounds.left-28||x>bounds.right||y<bounds.top-25||y>bounds.bottom+25)return;
 const rect=box.getBoundingClientRect(),elements=$$('#mj-blocks>[data-component]');layoutDrop=documentDropIntent(selected().blocks,layoutDrag.indices,elements.map(el=>el.getBoundingClientRect()),rect,x,y);if(!layoutDrop)return;
 const span=blockLayout(selected().blocks[layoutDrag.indices[0]].layout).span,preview=document.createElement('div');preview.id='mj-layout-drop-preview';preview.textContent=layoutDrop.row?ui('放到第 '+layoutDrop.start+' 格','Place at column '+layoutDrop.start):ui(layoutDrop.after?'在下方另起一行':'在上方另起一行',layoutDrop.after?'New row below':'New row above');preview.classList.toggle('mj-layout-drop-row',!layoutDrop.row);preview.style.cssText='left:'+((layoutDrop.start-1)*(rect.width+20)/12)+'px;top:'+((layoutDrop.row?layoutDrop.top:layoutDrop.edge)-rect.top-(layoutDrop.row?0:2))+'px;width:'+(span*(rect.width+20)/12-20)+'px;height:'+(layoutDrop.row?layoutDrop.height:4)+'px';box.append(preview);
}
function commitLayoutDrop(){if(!layoutDrag||layoutDrag.id!==selected()?.id||!layoutDrop)return;snapshotEditor();const moved=dropDocumentBlocks(selected().blocks,layoutDrag.indices,layoutDrop);richSelection=null;richBlockSelection={id:selected().id,indices:moved};layoutDrag=null;clearLayoutDrop();repaintBlocks();syncLayoutSelection();syncLayoutInspector(true);remember();}
function cancelLayoutDrag(){if(layoutPointer&&root.hasPointerCapture?.(layoutPointer.id))root.releasePointerCapture(layoutPointer.id);layoutPointer=null;layoutDrag=null;clearLayoutDrop();root.classList.remove('mj-layout-moving');$$('.mj-layout-dragging').forEach(n=>n.classList.remove('mj-layout-dragging'));}
root.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-layout-block],[data-layout-media-index]');if(!handle||!isEditing()||e.button!==0)return;e.preventDefault();const index=Number(handle.dataset.layoutBlock??handle.dataset.layoutMediaIndex);if(e.shiftKey||layoutPrimary(e)||!currentRichIndices().includes(index))selectLayoutBlock(index,layoutPrimary(e),e.shiftKey);layoutPointer={id:e.pointerId,x:e.clientX,y:e.clientY};if(e.isTrusted)root.setPointerCapture?.(e.pointerId);},true);
root.addEventListener('pointermove',e=>{if(!layoutPointer||layoutPointer.id!==e.pointerId)return;if(!layoutDrag&&Math.hypot(e.clientX-layoutPointer.x,e.clientY-layoutPointer.y)<5)return;e.preventDefault();if(!layoutDrag){layoutDrag={id:selected().id,indices:[...currentRichIndices()]};root.classList.add('mj-layout-moving');layoutDrag.indices.forEach(i=>$('[data-component="'+i+'"]')?.classList.add('mj-layout-dragging'));}const body=$('.mj-docbody'),rect=body.getBoundingClientRect();if(e.clientY<rect.top+24)body.scrollTop-=12;else if(e.clientY>rect.bottom-24)body.scrollTop+=12;updateLayoutDrop(e.clientX,e.clientY);},true);
root.addEventListener('pointerup',e=>{if(!layoutPointer||layoutPointer.id!==e.pointerId)return;e.preventDefault();if(layoutDrag){updateLayoutDrop(e.clientX,e.clientY);commitLayoutDrop();}layoutIgnoreClick=true;setTimeout(()=>{layoutIgnoreClick=false;},0);cancelLayoutDrag();},true);
root.addEventListener('pointercancel',cancelLayoutDrag,true);
root.addEventListener('lostpointercapture',()=>{if(layoutPointer)cancelLayoutDrag();});
window.addEventListener('blur',cancelLayoutDrag);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&layoutPointer){e.preventDefault();cancelLayoutDrag();}},true);
window.nativeApp.save=saveWhileEditing;window.nativeApp.toggleMarkers=toggleDocumentMode;

root.addEventListener('input',e=>{
 if(e.target.dataset.componentSeed!==undefined){const copy=e.target.closest('[data-component]')?.querySelector('[data-layout-seed="copy"]');if(copy)copy.disabled=!e.target.value.trim();}
 const el=e.target.closest('[data-rich-block]');if(!el||!isEditing()||e.isComposing||e.data!=='@')return;
 const selection=window.getSelection();if(!selection?.rangeCount)return;const range=selection.getRangeAt(0),node=range.startContainer,offset=range.startOffset;
 if(node.nodeType!==3||!offset||node.textContent[offset-1]!=='@'||/[A-Za-z0-9._%+-]/.test(node.textContent[offset-2]||' '))return;
 node.deleteData(offset-1,1);range.setStart(node,offset-1);range.collapse(true);selection.removeAllRanges();selection.addRange(range);readRich(el);const i=Number(el.dataset.richBlock);showComponentMenu(i,el,selected().blocks[i].type==='text'&&!selected().blocks[i].text);
});

new ResizeObserver(()=>{const panel=$('#mj-layout-inspector');if(panel&&!panel.hidden)panel.style.top=($('.mj-docbar')?.offsetHeight||0)+($('.mj-formatbar')?.offsetHeight||0)+'px';}).observe($('#mj-workspace'));

root.addEventListener('focusout',e=>{if(e.target.closest('#mj-layout-inspector'))setTimeout(()=>syncLayoutInspector(),0);});
