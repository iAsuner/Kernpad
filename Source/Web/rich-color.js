// Keep the picker in CSS coordinates; WebKit's native color popup can use a
// different anchor coordinate space inside the macOS window.
let richColorPickerState=null;
const richColorSwatches=[['#202124','黑色','Black'],['#737780','灰色','Gray'],['#ffffff','白色','White'],['#d70015','红色','Red'],['#b65c00','橙色','Orange'],['#b28a00','黄色','Yellow'],['#247a38','绿色','Green'],['#007c85','青色','Teal'],['#245db0','蓝色','Blue'],['#8846ad','紫色','Purple'],['#c34782','粉色','Pink'],['#896044','棕色','Brown']];
function richColorHSV(hex){
 const rgb=richColor(hex).slice(1).match(/../g).map(n=>parseInt(n,16)/255),max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;let h=0;
 if(d){const i=rgb.indexOf(max);h=60*(i===0?(rgb[1]-rgb[2])/d%6:i===1?(rgb[2]-rgb[0])/d+2:(rgb[0]-rgb[1])/d+4);}
 return {h:(h+360)%360,s:max?d/max:0,v:max};
}
function richHSVColor({h,s,v}){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');}
function selectedRichColor(){
 const stored=richSelection,range=stored?.range,node=range?.startContainer,el=node?.nodeType===1?node:node?.parentElement;
 return richColor(el&&root.contains(el)?getComputedStyle(el).color:'')||richColor(selected()?.blocks[currentRichIndices()[0]]?.textStyle?.color)||'#202124';
}
function setRichColorIndicator(color=selectedRichColor()){const button=$('[data-rich-action="colors"]');button?.style.setProperty('--rich-color',color);}
function closeRichColorPicker(focus=false){const anchor=richColorPickerState?.anchor;richColorPickerState=null;$('#mj-rich-color-popover')?.remove();anchor?.setAttribute('aria-expanded','false');if(focus&&anchor?.isConnected)anchor.focus({preventScroll:true});}
function positionRichColorPicker(){
 const picker=$('#mj-rich-color-popover'),anchor=richColorPickerState?.anchor;if(!picker||!anchor)return;if(!anchor.isConnected){closeRichColorPicker();return;}
 const a=anchor.getBoundingClientRect(),bounds=$('.mj-window').getBoundingClientRect(),leftBound=Math.max(8,bounds.left+8),rightBound=Math.min(innerWidth-8,bounds.right-8);
 picker.style.width=Math.min(252,rightBound-leftBound)+'px';const width=picker.getBoundingClientRect().width,left=Math.max(leftBound,Math.min(a.left+a.width/2-width/2,rightBound-width)),top=a.bottom+8;
 picker.style.left=left+'px';picker.style.top=top+'px';picker.style.maxHeight=Math.max(100,Math.min(innerHeight,bounds.bottom)-top-8)+'px';picker.style.setProperty('--color-arrow',Math.max(12,Math.min(width-12,a.left+a.width/2-left))+'px');
}
function previewRichColor(syncHex=true){
 const picker=$('#mj-rich-color-popover'),draft=richColorPickerState;if(!picker||!draft)return;
 const color=richHSVColor(draft),plane=picker.querySelector('.mj-color-plane');draft.color=color;plane.style.setProperty('--color-hue',draft.h);plane.setAttribute('aria-valuenow',Math.round(draft.s*100));plane.setAttribute('aria-valuetext',ui('饱和度 '+Math.round(draft.s*100)+'%，明度 '+Math.round(draft.v*100)+'%','Saturation '+Math.round(draft.s*100)+'%, brightness '+Math.round(draft.v*100)+'%'));
 const dot=plane.firstElementChild;dot.style.left=draft.s*100+'%';dot.style.top=(1-draft.v)*100+'%';picker.querySelector('[data-rich-color-hue]').value=Math.round(draft.h);picker.querySelector('.mj-color-preview').style.backgroundColor=color;
 if(syncHex)picker.querySelector('[data-rich-color-hex]').value=color;picker.querySelector('[data-rich-color-hex]').removeAttribute('aria-invalid');picker.querySelector('[data-rich-color-apply]').disabled=false;picker.querySelector('[role="alert"]').textContent='';
}
function showRichColorPicker(anchor){
 if(!isEditing()||!selected())return;if($('#mj-rich-color-popover')){closeRichColorPicker();return;}const color=selectedRichColor();closeComponentMenu();richColorPickerState={...richColorHSV(color),color,anchor,id:selected().id,epoch:privacyEpoch};
 const picker=document.createElement('section');picker.id='mj-rich-color-popover';picker.className='mj-color-menu mj-rich-color-popover';picker.setAttribute('role','dialog');picker.tabIndex=-1;picker.setAttribute('aria-label',ui('文字颜色','Text color'));
 picker.innerHTML=`<div class="mj-color-heading"><strong>${ui('文字颜色','Text color')}</strong><button class="mj-icon" data-rich-color-close aria-label="${ui('关闭颜色面板','Close color picker')}">${icon('x')}</button></div><div class="mj-color-swatches">${richColorSwatches.map(([value,zh,en])=>`<button type="button" data-rich-color-value="${value}" style="--swatch:${value}" aria-label="${ui(zh,en)} ${value}" title="${ui(zh,en)}"></button>`).join('')}</div><div class="mj-color-plane" tabindex="0" role="slider" aria-label="${ui('饱和度与明度','Saturation and brightness')}" aria-valuemin="0" aria-valuemax="100" title="${ui('左右调整饱和度，上下调整明度','Left/right adjusts saturation; up/down adjusts brightness')}"><i></i></div><input type="range" min="0" max="359" data-rich-color-hue aria-label="${ui('色相','Hue')}"><div class="mj-color-custom"><span class="mj-color-preview" aria-hidden="true"></span><input type="text" data-rich-color-hex maxlength="7" spellcheck="false" aria-label="${ui('十六进制颜色','Hex color')}" placeholder="#245db0"><button class="mj-button" data-rich-color-apply>${ui('完成','Done')}</button></div><small role="alert"></small>`;
 $('.mj-window').append(picker);anchor.setAttribute('aria-expanded','true');icons();previewRichColor();positionRichColorPicker();picker.focus({preventScroll:true});
}
function applyRichPickerColor(color){
 const draft=richColorPickerState;if(!draft||!richColor(color)||draft.id!==selected()?.id||draft.epoch!==privacyEpoch)return;
 setRichFormat('color',richColor(color));setRichColorIndicator(richColor(color));closeRichColorPicker(true);
}
root.addEventListener('pointerdown',e=>{const picker=e.target.closest('#mj-rich-color-popover');if(!picker)return;if(e.target.closest('button'))e.preventDefault();const plane=e.target.closest('.mj-color-plane');if(!plane)return;e.preventDefault();plane.focus({preventScroll:true});const sample=event=>{if(!richColorPickerState)return;const rect=plane.getBoundingClientRect();richColorPickerState.s=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));richColorPickerState.v=Math.max(0,Math.min(1,1-(event.clientY-rect.top)/rect.height));previewRichColor();};sample(e);if(e.isTrusted)plane.setPointerCapture(e.pointerId);plane.onpointermove=event=>{if(event.buttons===1)sample(event);};plane.onpointerup=()=>{plane.onpointermove=null;};},true);
root.addEventListener('click',e=>{const picker=e.target.closest('#mj-rich-color-popover');if(!picker)return;e.stopImmediatePropagation();const button=e.target.closest('button');if(!button)return;e.preventDefault();if(button.hasAttribute('data-rich-color-close'))closeRichColorPicker(true);else if(button.dataset.richColorValue)applyRichPickerColor(button.dataset.richColorValue);else if(button.hasAttribute('data-rich-color-apply'))applyRichPickerColor(picker.querySelector('[data-rich-color-hex]').value);},true);
root.addEventListener('input',e=>{if(!richColorPickerState)return;if(e.target.hasAttribute('data-rich-color-hue')){richColorPickerState.h=Number(e.target.value);previewRichColor();}if(e.target.hasAttribute('data-rich-color-hex')){const color=richColor(e.target.value),picker=$('#mj-rich-color-popover');if(color){Object.assign(richColorPickerState,richColorHSV(color));previewRichColor(false);}else{e.target.setAttribute('aria-invalid','true');picker.querySelector('[data-rich-color-apply]').disabled=true;picker.querySelector('[role="alert"]').textContent=ui('请输入十六进制颜色，如 #245db0','Enter a hex color, such as #245db0');}}},true);
window.addEventListener('keydown',e=>{if(richColorPickerState&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeRichColorPicker(true);}},true);
root.addEventListener('keydown',e=>{if(!e.target.closest('#mj-rich-color-popover'))return;if(e.key==='Enter'&&e.target.hasAttribute('data-rich-color-hex')){e.preventDefault();e.stopImmediatePropagation();applyRichPickerColor(e.target.value);return;}if(!e.target.classList.contains('mj-color-plane')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();const step=e.shiftKey?0.1:0.01,key=['ArrowLeft','ArrowRight'].includes(e.key)?'s':'v',sign=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;richColorPickerState[key]=Math.max(0,Math.min(1,richColorPickerState[key]+step*sign));previewRichColor();});
window.addEventListener('resize',positionRichColorPicker);root.addEventListener('scroll',positionRichColorPicker,true);new ResizeObserver(positionRichColorPicker).observe(root);
