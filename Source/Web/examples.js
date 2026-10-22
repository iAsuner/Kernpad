// Bundled, offline examples use the same importers, blocks and save path as user notes.
function exampleCatalog(){return exampleBundle.locales[locale==='en'?'en':'zh'];}
function exampleRecordID(example,language=locale){return `example-${language==='en'?'en':'zh'}-${example.edition?'v'+example.edition+'-':''}${example.key}`;}
function makeExampleRecord(example,language=locale){
 const blocks=example.format==='markdown'?parseMarkdown(example.source):example.format==='html'?richImportHTML(example.source):structuredClone(example.blocks);
 if(example.theme)for(const b of blocks){
  const theme=example.theme;
  if(b.type==='heading'){b.textStyle={...b.textStyle,color:theme.accent,fontSize:b.level===1?34:22};b.layout={before:b.level===1?0:18,after:4};}
  if(b.type==='heading'&&b.level===1){b.surface={background:theme.cover||theme.tint,radius:10};b.layout={padding:32,before:0,after:8};b.textStyle.color=theme.coverText||theme.accent;}
  if(b.type==='quote'||b.accent){b.surface={background:theme.tint,radius:8};b.layout={padding:20};b.textStyle={...b.textStyle,color:theme.ink,fontSize:17};}
  if(b.type==='code'){b.surface={background:theme.tint,borderColor:'#d9dee5',radius:10};b.layout={padding:12};}
  if(example.format==='html'&&b.type==='text'&&/#(?:34483D|A6533C|E9E0D0)/.test(b.text)){
   b.layout={span:4,padding:20,lineHeight:1.8};b.surface={background:theme.tint,radius:8};
  }
 }
 for(const block of blocks){if(block.media){block.data=exampleBundle.media[block.media];delete block.media;}if(block.posterMedia){block.poster=exampleBundle.media[block.posterMedia];delete block.posterMedia;}}
 return {id:exampleRecordID(example,language),type:'note',name:example.name,summary:example.summary,tag:language==='en'?'Example document':'示例文档',fields:[],blocks,refs:[],links:[],totp:false,favorite:false,documentOptions:{title:false,summary:false}};
}
async function addExampleDocuments(keys,{open=true}={}){
 if(nativeBusy||nativeLocked||!nativeReady)return;
 await persist();
 const all=[...records,...trashedRecords],added=[],catalog=exampleCatalog();
 for(const example of catalog.filter(item=>keys.includes(item.key))){const id=exampleRecordID(example);if(!all.some(item=>item.id===id)){const r=makeExampleRecord(example);records.push(r);all.push(r);added.push(r);}}
 await persist();
 if(open&&added.length){closeModal();state.area='notes';state.category='all';state.search='';$('#mj-search').value='';openRecord(added[0].id);}
 else render();
 return added;
}
function showExampleDocuments(){
 const language=locale==='en'?'en':'zh';
 modal(ui('示例文档','Example Documents'),ui('随应用提供，离线可用。新版样例会独立添加，保留旧版及你的修改。','Bundled and offline. The new edition is added separately, preserving earlier examples and your edits.'),`<div class="mj-example-grid">${exampleCatalog().map(example=>{const id=exampleRecordID(example,language),existing=record(id),trashed=trashedRecords.some(r=>r.id===id);return `<article class="mj-example-card">${example.cover?`<img src="${exampleBundle.media[example.cover]}" alt="" draggable="false">`:`<div class="mj-example-format" aria-hidden="true">${example.format==='html'?'&lt;/&gt;':'M↓'}</div>`}<strong class="mj-user-content">${escape(example.name)}</strong><p class="mj-user-content">${escape(example.summary)}</p><button class="mj-button" data-example-add="${example.key}" ${trashed?'disabled':''}>${escape(trashed?ui('已在回收站','In Trash'):existing?ui('打开文档','Open Document'):ui('添加文档','Add Document'))}</button></article>`;}).join('')}</div><p class="mj-settings-note">${ui('图片为 AI 生成；短片为原创图片运镜。示例均为普通明文便签，请将真实私密内容保存到密码库。切换界面语言后可添加对应语言版本。','Images are AI-generated; the clip animates an original still. Examples are ordinary plaintext notes. Keep real private information in Vault. Switch the interface language to add that language’s edition.')}</p><p role="status" id="mj-example-status"></p>`,`<button class="mj-button" data-credential-examples>${ui('体验密码库示例…','Try Vault Examples…')}</button><button class="mj-button" data-action="close-modal">${tr('关闭')}</button><button class="mj-primary" data-example-all>${ui('添加全部示例','Add All Examples')}</button>`);
 $('#mj-overlay .mj-modal').classList.add('mj-wide-modal');
}
function polishExamples(){
 if(state.area!=='notes'||state.view!=='table'||state.category==='trash'||state.search)return;
 $('.mj-pagehead')?.insertAdjacentHTML('beforeend',`<button class="mj-button" data-example-gallery>${icon('book-open')}${ui('示例文档','Example Documents')}</button>`);
}
root.addEventListener('click',async event=>{
 const target=event.target.closest('[data-example-gallery],[data-example-add],[data-example-all]');if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(target.hasAttribute('data-example-gallery')){showExampleDocuments();return;}
 const key=target.dataset.exampleAdd,example=exampleCatalog().find(item=>item.key===key),id=example?exampleRecordID(example):null;
 if(key&&record(id)){closeModal();state.area='notes';state.category='all';openRecord(id);return;}
 target.disabled=true;
 try{await addExampleDocuments(key?[key]:exampleCatalog().map(e=>e.key));}
 catch(error){const status=$('#mj-example-status');if(status)status.textContent=ui('添加或保存失败，示例内容仍保留在当前窗口，请重试保存。','Adding or saving failed. Added content remains in this window; retry saving.')+' '+String(error.message||error);target.disabled=false;}
},true);
