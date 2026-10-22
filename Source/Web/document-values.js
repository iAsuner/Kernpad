// Records are JSON-shaped values. Copy mutable containers while sharing their
// immutable string leaves, including large attachment payloads. No global pool
// retains document bodies after a history/session is cleared.
function cloneDocumentValue(value){
 if(Array.isArray(value))return value.map(cloneDocumentValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,cloneDocumentValue(item)]));
 return value;
}
function equalDocumentValues(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalDocumentValues(a[key],b[key]));
}
function documentValueBytes(value,strings=new Set()){
 if(typeof value==='string'){if(strings.has(value))return 0;strings.add(value);return value.length*2;}
 if(value&&typeof value==='object')return 32+Object.entries(value).reduce((size,[key,item])=>size+key.length*2+documentValueBytes(item,strings),0);
 return 8;
}
