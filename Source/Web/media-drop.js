function droppedMediaKind(file){
 if(/\.(mp4|mov|m4v)$/i.test(file.name))return 'video';
 if(/\.(png|jpe?g|heic|tiff?|gif|bmp|webp)$/i.test(file.name))return 'image';
 throw new Error(ui('请拖入图片，或 MP4 / MOV / M4V 视频。','Drop an image or an MP4 / MOV / M4V video.'));
}
function clearMediaDrop(){root.querySelectorAll('.mj-media-drop-target').forEach(el=>el.classList.remove('mj-media-drop-target'));$('#mj-media-drop-hint')?.remove();}
function mediaDropTarget(event){
 if(!isEditing()||state.view!=='document'||!selected()||isProtected(selected())&&!vaultUnlocked)return null;
 const box=event.target.closest('#mj-blocks');if(!box)return null;
 const el=event.target.closest('[data-component]');return {box,el,index:el?Number(el.dataset.component):selected().blocks.length};
}
function placeDroppedMedia(items,index,added){
 if(index<0){items.unshift(...added);return added.map((_,i)=>i);}
 const anchor=items[index],replace=anchor?.type==='text'&&!anchor.text?.trim();
 if(replace){
  added[0].layout=structuredClone(blockLayout(anchor.layout));
  if(anchor.surface)added[0].surface=structuredClone(anchor.surface);
  items.splice(index,1,added[0]);
  if(added.length>1)insertDocumentAfter(items,index,added.slice(1));
 }else if(anchor)insertDocumentAfter(items,index,added);
 else items.push(...added);
 return added.map(b=>items.indexOf(b));
}
async function insertDroppedMedia(files,target){
 const r=selected(),epoch=privacyEpoch,anchor=r?.blocks[target.index],original=anchor?JSON.stringify(anchor):null;
 if(!r||!isEditing()||mediaImporting||isProtected(r)&&!vaultUnlocked)return;
 const current=()=>epoch===privacyEpoch&&selected()===r&&record(r.id)===r&&state.view==='document'&&isEditing()&&(!isProtected(r)||vaultUnlocked);
 mediaImporting=true;
 try{
  if(!files.length||files.length>10)throw new Error(ui('一次最多拖入 10 个文件','Drop up to 10 files at once'));
  const kinds=files.map(droppedMediaKind);
  if(files.some((f,i)=>!f.size||f.size>(kinds[i]==='video'?8:20)*1024*1024)||files.reduce((sum,f)=>sum+f.size,0)>20*1024*1024)throw new Error(ui('单张原图最多 20 MB、视频最多 8 MB；一次拖入总计最多 20 MB。','Images: up to 20 MB; videos: up to 8 MB; combined drop: up to 20 MB.'));
  await persist();const blocks=[];
  for(const [i,file] of files.entries()){
   if(!current())return;
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error(ui('文件读取失败','Could not read file')));reader.readAsDataURL(file);});
   if(!current())return;
   const result=await nativeCall('importMedia',{kind:kinds[i],name:file.name.slice(0,200),base64:data});
   if(!current())return;
   if(!result.block||result.block.type!==kinds[i]||!safeMediaData(result.block.data,kinds[i]))throw new Error(ui('无法导入媒体文件','Could not import media'));
   blocks.push(result.block);
  }
  if(!current())return;
  const index=anchor?r.blocks.indexOf(anchor):r.blocks.length;
  if(index<0||anchor&&JSON.stringify(anchor)!==original)throw new Error(ui('目标栏已改变，请重新拖入。','The target cell changed. Drop the files again.'));
  const candidate=snapshot(),draft=candidate.records.find(item=>item.id===r.id);
  const indices=placeDroppedMedia(draft.blocks,index,blocks);
  if(draft.blocks.length>5000||new TextEncoder().encode(JSON.stringify(candidate)).length>20*1024*1024)throw new Error(ui('附件总量超过资料库容量，请减少文件后重试。','The library is full. Try fewer files.'));
  snapshotEditor();r.blocks=draft.blocks;richSelection=null;richBlockSelection={id:r.id,indices};repaintBlocks();remember();
  toast(ui('媒体已放入目标栏，可撤销本次导入。','Media added to the target column. You can undo this import.'));
 }catch(error){if(current())toast(String(error));}finally{mediaImporting=false;clearMediaDrop();}
}
window.addEventListener('dragover',event=>{
 if(![...event.dataTransfer.types].includes('Files'))return;event.preventDefault();clearMediaDrop();
 const target=mediaDropTarget(event);event.dataTransfer.dropEffect=target&&!mediaImporting?'copy':'none';if(!target||mediaImporting)return;
 (target.el||target.box).classList.add('mj-media-drop-target');
 const hint=document.createElement('div');hint.id='mj-media-drop-hint';hint.textContent=target.el?ui('放入此栏，保留原有内容','Drop into this column. Existing content is kept.'):ui('在文档末尾插入','Insert at the end of the document');hint.setAttribute('role','status');root.append(hint);
},true);
window.addEventListener('dragleave',event=>{if(!event.relatedTarget)clearMediaDrop();},true);
window.addEventListener('drop',event=>{
 if(![...event.dataTransfer.types].includes('Files'))return;
 event.preventDefault();event.stopImmediatePropagation();const target=mediaDropTarget(event);clearMediaDrop();
 if(target)void insertDroppedMedia([...event.dataTransfer.files],target);
 else toast(ui('请先进入文档编辑，再把文件拖到正文或目标栏。','Open the document in Edit mode, then drop files into the body or a column.'));
},true);
