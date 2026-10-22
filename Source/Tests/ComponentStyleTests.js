// Render every document component with real WebKit geometry, both UI languages
// and platform fonts. Each call runs at the native harness's current width.
window.__checkComponentStyles=async language=>{
 const check=(name,ok)=>{if(!ok)throw new Error(`Component styles ${innerWidth}/${language}: ${name}`);window.__editorChecks=(window.__editorChecks||0)+1;};
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 clearInterval(interval);closeModal();clearManualState();state.area='notes';locale=language;await createPlainNote();const r=selected();vaultUnlocked=true;state.locked=false;nativeInfo.unlocked=true;state.area='vault';
 const labels=language==='en'?['Sign-in account','Sign-in password','Account ID','Linked phone','Recovery address']:['登录账号','登录密码','账号 ID','绑定手机号','账号恢复地址'];
 r.fields=labels.map((label,i)=>({key:'custom.style_'+i,label,kind:i===1?'secret':i===4?'url':'text',secret:i===1,value:i===1?'Synthetic-only':i===4?'https://example.invalid/path':'Synthetic value'}));
 const base=['heading1','heading2','heading3','text','quote','callout','check','bullet-list','number-list','table','date','tags','link','code','form','otp','divider'].map(makeBlock);
 base.push(structuredClone(window.__fixtureMedia.image),structuredClone(window.__fixtureMedia.video));
 for(const b of base){if('text'in b)b.text='Synthetic content';if(b.type==='code'){b.text='{"synthetic":true}';b.language='json';}if(b.type==='form')b.fields=[{key:'user',label:labels[0],kind:'text',value:'test@example.invalid'},{key:'password',label:labels[1],kind:'secret',value:''}];if(b.type==='date')b.value='2026-10-21';}
 const previousPlatform=document.documentElement.dataset.nativePlatform;
 for(const platform of ['macos','windows']){
  document.documentElement.dataset.nativePlatform=platform;
  for(const mode of ['edit','view']){
   docMode=mode;r.blocks=structuredClone(base);render();await frame();
   const bars=$$('.mj-toolbar,.mj-docbar,.mj-formatbar');
   const barGeometry=bars.map(bar=>{const boxes=[...bar.children].filter(el=>!el.classList.contains('mj-spacer')).map(el=>el.getBoundingClientRect()).filter(rect=>rect.width&&rect.height);return {name:bar.className,width:bar.clientWidth,scroll:bar.scrollWidth,centers:boxes.map(rect=>rect.top+rect.height/2)};});
   check(`${platform}/${mode} application controls stay on one row: ${JSON.stringify(barGeometry)}`,barGeometry.every(bar=>bar.scroll<=bar.width+1&&Math.max(...bar.centers)-Math.min(...bar.centers)<3));
   const rows=$$('.mj-properties>.mj-property');
   check(`${platform}/${mode} field rows stay inside their content area: ${JSON.stringify(rows.map(row=>({width:row.clientWidth,scroll:row.scrollWidth,label:row.querySelector("label").clientWidth,grid:getComputedStyle(row).gridTemplateColumns})))}`,rows.length===labels.length&&rows.every(row=>row.scrollWidth<=row.clientWidth+1));
   check(`${platform}/${mode} ordinary labels have enough space: ${JSON.stringify(rows.map(row=>({label:row.querySelector("label").clientWidth,text:row.querySelector("label>span").getBoundingClientRect().height,line:getComputedStyle(row.querySelector("label>span")).lineHeight})))}`,rows.every(row=>{const span=row.querySelector('label>span'),rect=span.getBoundingClientRect();return rect.height<=parseFloat(getComputedStyle(span).lineHeight)*2+.5&&row.querySelector("label").clientWidth>=Math.min(120,row.clientWidth-80);}));
   if(mode==='edit')check(`${platform} rename actions are outside field labels`,rows.every(row=>!row.querySelector('label button')&&row.querySelector(':scope>.mj-field-rename')));
   for(const span of [12,6,4,3]){
    r.blocks.forEach(b=>b.layout={span});repaintBlocks();await frame();
    const components=$$('#mj-blocks>[data-component]');
    check(`${platform}/${mode}/${span} renders all component types`,components.length===base.length);
    const overflow=components.filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>({type:r.blocks[Number(el.dataset.component)].type,width:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>el.getBoundingClientRect().right+2).map(c=>c.tagName+'.'+c.className)}));
    check(`${platform}/${mode}/${span} no component overflows: ${JSON.stringify(overflow)}`,!overflow.length);
    const forms=$$('.mj-form-row');check(`${platform}/${mode}/${span} form values and actions fit`,forms.every(row=>row.scrollWidth<=row.clientWidth+1));
   }
  }
 }
 // Include temporary notes and settings, whose extra status/control rows must
 // fit independently of the ordinary credential component matrix.
 state.area='notes';r.type='note';r.protected=false;r.fields=[];r.blocks=[{type:'text',text:'Temporary synthetic note'}];r.expiresAt=new Date(Date.now()+86400000).toISOString();docMode='edit';render();await frame();
 const noteBar=$('.mj-docbar');check('temporary note actions do not overflow or include a long deadline',noteBar.scrollWidth<=noteBar.clientWidth+1&&!noteBar.querySelector('[data-note-expiration]'));
 showTemporaryDuration('edit',r.id);await frame();
 const timeBoxes=[$('[data-temporary-value]'),$('[data-temporary-unit]')].map(el=>el.getBoundingClientRect());
 check('lifetime value and unit have a compact consistent height',Math.abs(timeBoxes[0].height-timeBoxes[1].height)<=1&&timeBoxes.every(rect=>rect.width<140&&rect.height<=34));
 const lifetimeFooter=$('.mj-modal-footer');check('lifetime actions remain inside the dialog',lifetimeFooter.scrollWidth<=lifetimeFooter.clientWidth+1);closeModal();delete r.expiresAt;
 showSettings('general');await frame();
 const settingRows=$$('.mj-settings-content>.mj-setting');
 check('settings rows retain padding around multiline help',settingRows.every(row=>{const bounds=row.getBoundingClientRect();return [...row.children].every(el=>{const rect=el.getBoundingClientRect();return rect.top>=bounds.top+10&&rect.bottom<=bounds.bottom-10;});}));closeModal();

 if(previousPlatform)document.documentElement.dataset.nativePlatform=previousPlatform;else delete document.documentElement.dataset.nativePlatform;
 r.blocks=structuredClone(base);docMode='edit';render();return true;
};
