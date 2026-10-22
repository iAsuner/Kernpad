function currentShortcuts(){try{return {...shortcutDefaults,...validateShortcuts(nativeInfo.settings?.shortcuts||{})};}catch{return {...shortcutDefaults};}}
const shortcutNames={new:['新建','New'],save:['保存','Save'],find:['查找','Find'],lock:['锁定密码库','Lock vault'],markers:['切换编辑与阅读','Toggle editing / reading'],notes:['打开便签','Open Notes'],vault:['打开密码库','Open Vault'],settings:['打开设置','Open Settings']};
function fixedShortcutGroups(){
 const windows=globalThis.kernpadPlatform==='windows',key=chord=>shortcutLabel(chord),click=ui('点击','click');
 return [
  [ui('文字编辑','Text editing'),[
   ['undo',ui('撤销','Undo'),key('primary+z')],['redo',ui('重做','Redo'),windows?[key('primary+shift+z'),key('primary+y')]:key('primary+shift+z')],
   ['cut',ui('剪切','Cut'),key('primary+x')],['copy',ui('复制','Copy'),key('primary+c')],['paste',ui('粘贴','Paste'),key('primary+v')],['select-all',ui('全选文字或当前列表','Select all text or current list'),key('primary+a')],
   ['bold',ui('加粗','Bold'),key('primary+b')],['italic',ui('斜体','Italic'),key('primary+i')],['inline-code',ui('行内代码','Inline code'),key('primary+e')]
  ]],
  [ui('换行与组件','Line breaks and blocks'),[
   ['paragraph',ui('新段落或下一列表项','New paragraph or list item'),'Enter'],['line-break',ui('段内换行','Line break within a paragraph'),windows?'Shift + Enter':['⇧Enter','⌃Enter']],
   ['full-row',ui('新建完整一行','Start a full-width row'),windows?'Ctrl + Enter':'⌘Enter'],['insert-block',ui('空行添加组件','Insert a block on an empty line'),['@','/']],
   ['indent',ui('列表和代码缩进','Indent lists and code'),'Tab'],['outdent',ui('列表和代码取消缩进','Outdent lists and code'),windows?'Shift + Tab':'⇧Tab'],
   ['empty-block',ui('删除空段落或空列表项','Remove an empty paragraph or list item'),'Backspace'],['menu-navigation',ui('选择组件并确认','Choose and confirm a block'),['↑ ↓','Enter']]
  ]],
  [ui('选择与导航','Selection and navigation'),[
   ['toggle-select',ui('增减所选记录','Toggle record selection'),(windows?'Ctrl':'⌘')+' + '+click],['range-select',ui('连续选择记录','Select a range of records'),'Shift + '+click],
   ['cancel',ui('关闭弹窗或取消选择','Close dialog or clear selection'),'Esc'],['focus-next',ui('下一项','Next control'),'Tab'],['focus-previous',ui('上一项','Previous control'),windows?'Shift + Tab':'⇧Tab'],
   ['close-window',ui('关闭窗口','Close window'),windows?'Alt + F4':'⌘W'],...(!windows?[['quit',ui('退出应用','Quit application'),'⌘Q']]:[])
  ]]
 ];
}
function shortcutKeycaps(value){
 const expanded=value.replace(/([⌘⇧⌥⌃])(?=[^ +])/g,'$1 + ');
 return `<span class="mj-key-chord">${expanded.split(' + ').map(key=>`<kbd>${escape(key)}</kbd>`).join('<span class="mj-key-plus"> + </span>')}</span>`;
}
function shortcutSettingsContent(){
 const bindings=currentShortcuts(),windows=globalThis.kernpadPlatform==='windows',primary=windows?'Ctrl':'⌘';
 const fixed=fixedShortcutGroups().map(([name,rows])=>`<details class="mj-shortcut-group"><summary>${escape(name)}<small>${ui('固定，'+rows.length+' 项',rows.length+' fixed shortcuts')}</small></summary>${rows.map(([id,label,chord])=>`<div class="mj-setting mj-fixed-shortcut" data-fixed-shortcut="${id}"><span>${escape(label)}</span><span class="mj-fixed-keys">${(Array.isArray(chord)?chord:[chord]).map(shortcutKeycaps).join(`<span class="mj-key-alternative">${id==='menu-navigation'?ui('然后','then'):ui('或','or')}</span>`)}</span></div>`).join('')}</details>`).join('');
 return `<h3 class="mj-settings-section">${ui('可自定义','Customizable')}</h3><p class="mj-settings-note">${ui('修改后点击“保存并完成”，菜单与提示同步更新。','Choose Save & Done to update menus and hints.')}</p><div class="mj-shortcut-list">${Object.entries(bindings).map(([action,chord])=>{
  const parts=chord.split('+'),modifiers=parts.slice(0,-1).join('+'),key=parts.at(-1),label=ui(...shortcutNames[action]);
  return `<div class="mj-setting mj-shortcut-row"><span>${escape(label)}</span><div class="mj-shortcut-controls"><select data-shortcut-modifiers="${action}" aria-label="${escape(label+' '+ui('修饰键','modifiers'))}">${['primary','primary+shift','primary+alt','primary+shift+alt'].map(v=>`<option value="${v}" ${modifiers===v?'selected':''}>${escape(primary+(v.includes('shift')?' + Shift':'')+(v.includes('alt')?' + '+(windows?'Alt':'Option'):''))}</option>`).join('')}</select><span class="mj-key-plus" aria-hidden="true">+</span><select data-shortcut-key="${action}" aria-label="${escape(label+' '+ui('按键','key'))}">${Array.from('abcdefghijklmnopqrstuvwxyz0123456789,').map(v=>`<option value="${v}" ${key===v?'selected':''}>${v.toUpperCase()}</option>`).join('')}</select></div></div>`;
 }).join('')}</div><h3 class="mj-settings-section">${ui('固定快捷键','Fixed shortcuts')}</h3>${fixed}<div role="status" id="mj-shortcut-status"></div>`;
}
async function performShortcut(action){
 if(!$('#mj-overlay').hidden&&action!=='lock'&&!(action==='save'&&$('[data-template-publish]')))return;
 if(action==='new')newMacRecord();
 if(action==='save')await saveWhileEditing();
 if(action==='find')focusSearch();
 if(action==='lock')await lock();
 if(action==='markers'&&state.view==='document')toggleDocumentMode();
 if(action==='notes'||action==='vault')window.nativeApp.navigate(action);
 if(action==='settings')showSettings();
}
window.addEventListener('keydown',event=>{
 const chord=shortcutChord(event,globalThis.kernpadPlatform==='windows');if(!chord)return;
 const action=Object.entries(currentShortcuts()).find(([,binding])=>binding===chord)?.[0];if(!action)return;
 event.preventDefault();event.stopImmediatePropagation();performShortcut(action).catch(error=>toast(String(error)));
},true);
root.addEventListener('click',async event=>{
 const save=event.target.closest('[data-shortcut-save]'),reset=event.target.closest('[data-shortcut-defaults]');if(!save&&!reset)return;
 event.preventDefault();event.stopImmediatePropagation();const status=$('#mj-shortcut-status');
 if(reset){for(const [action,chord] of Object.entries(shortcutDefaults)){const parts=chord.split('+');$('[data-shortcut-modifiers="'+action+'"]').value=parts.slice(0,-1).join('+');$('[data-shortcut-key="'+action+'"]').value=parts.at(-1);}status.textContent=ui('已填入默认设置，保存后生效','Defaults filled in. Save to apply.');return;}
 try{
  const draft=reset?{}:Object.fromEntries(Object.keys(shortcutDefaults).map(action=>[action,document.querySelector(`[data-shortcut-modifiers="${action}"]`).value+'+'+document.querySelector(`[data-shortcut-key="${action}"]`).value]));
  try{validateShortcuts(draft);}catch{throw new Error(ui('快捷键重复或使用了系统／文本编辑保留组合，请调整后重试。','A shortcut conflicts or uses a reserved system/text-editing combination. Change it and try again.'));}
  save&&(save.disabled=true);reset&&(reset.disabled=true);
  const revision=modalRevision;await nativeCall('settings',{shortcuts:draft});nativeInfo.settings.shortcuts=draft;security.shortcuts=draft;
  if(revision!==modalRevision){polishMacOS();return;}
  closeModal();polishMacOS();toast(ui('快捷键已保存','Shortcuts saved'));
 }catch(error){if(status)status.textContent=String(error.message||error);if(save)save.disabled=false;if(reset)reset.disabled=false;}
},true);
window.nativeApp.performShortcut=performShortcut;
