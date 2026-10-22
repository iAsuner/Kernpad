// URLs belong only to the currently open document. Sharing immutable media
// between edit/read/preview trees avoids repeated base64 parsing and decoding.
let documentMediaResources={key:'',byData:new Map(),byURL:new Map()};
function clearDocumentMediaResources(){
 for(const url of documentMediaResources.byURL.keys())URL.revokeObjectURL(url);
 documentMediaResources={key:'',byData:new Map(),byURL:new Map()};
}
function syncDocumentMediaResources(){
 const r=state.view==='document'?selected():null,key=r?privacyEpoch+':'+r.id:'';
 if(key!==documentMediaResources.key){clearDocumentMediaResources();documentMediaResources.key=key;}
 const used=new Set((r?.blocks||[]).flatMap(b=>[b.data,b.poster]));
 for(const [data,url] of documentMediaResources.byData)if(!used.has(data)){
  URL.revokeObjectURL(url);documentMediaResources.byData.delete(data);documentMediaResources.byURL.delete(url);
 }
}
function documentMediaURL(value,type='image'){
 syncDocumentMediaResources();
 const known=documentMediaResources.byData.get(value);if(known)return value.startsWith(type==='video'?'data:video/':'data:image/')?known:'';
 const data=safeMediaData(value,type);if(!data)return '';
 const comma=data.indexOf(','),binary=atob(data.slice(comma+1)),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:data.slice(5,data.indexOf(';'))}));
 documentMediaResources.byData.set(data,url);documentMediaResources.byURL.set(url,data);return url;
}
function documentMediaData(url){
 const known=documentMediaResources.byURL.get(url);
 return known?(known.startsWith('data:image/png;')?known:''):safeMediaData(url);
}
