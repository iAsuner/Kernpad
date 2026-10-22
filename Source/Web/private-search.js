// Native matching returns IDs only. No persistent plaintext index or body cache.
let nativeSearch={context:'',ids:new Set(),pending:false,error:'',truncated:false},nativeSearchTimer;
function clearNativeSearch(){clearTimeout(nativeSearchTimer);nativeSearch={context:'',ids:new Set(),pending:false,error:'',truncated:false};}
function nativeSearchContext(){return JSON.stringify([privacyEpoch,nativeInfo.session,state.search.trim(),state.searchScope||'all']);}
function nativeSearchMatch(record,query){
 const metadata=[record.name,record.tag,record.platformName,type(record)?.name,...(platformFor(record)?platformTerms(platformFor(record)):[])].filter(Boolean);
 return metadata.some(value=>value.toLowerCase().includes(query))||nativeSearch.context===nativeSearchContext()&&nativeSearch.ids.has(record.id);
}
function refreshNativeSearch(){
 const query=state.search.trim();
 if(!nativeInfo.recordProtocol||!vaultUnlocked||!query||state.searchScope==='notes'){if(nativeSearch.context)clearNativeSearch();return;}
 const context=nativeSearchContext();if(context===nativeSearch.context)return;
 clearNativeSearch();nativeSearch.context=context;nativeSearch.pending=true;
 const current=()=>nativeSearch.context===context&&nativeSearchContext()===context&&vaultUnlocked;
 nativeSearchTimer=setTimeout(async()=>{
  try{
   await persist();if(!current())return;
   const result=await nativeCall('searchRecords',{query,session:nativeInfo.session});if(!current())return;
   if(!Array.isArray(result.ids)||result.ids.length>100||result.ids.some(id=>typeof id!=='string'))throw Error(ui('搜索结果无效','Invalid search response'));
   nativeSearch.ids=new Set(result.ids);nativeSearch.truncated=!!result.truncated;
  }catch(error){if(current())nativeSearch.error=String(error.message||error);}
  finally{if(current()){nativeSearch.pending=false;render();}}
 },180);
}
function decorateNativeSearch(){
 if(!nativeSearch.context)return;const page=$('.mj-global-search-page');if(!page)return;
 const message=nativeSearch.pending?ui('正在本机搜索受保护内容…','Searching protected content locally…'):nativeSearch.error?ui('密码库搜索失败，请重试。','Vault search failed. Please retry.'):nativeSearch.truncated?ui('密码库最多显示 100 条匹配，请缩小关键词。','Showing up to 100 vault matches. Refine your query.'):'';
 if(message){const status=document.createElement('p');status.className='mj-settings-note';status.setAttribute('role',nativeSearch.error?'alert':'status');status.textContent=message;page.prepend(status);if(nativeSearch.error)status.insertAdjacentHTML('beforeend',` <button class="mj-text-button" data-private-search-retry>${ui('重试','Retry')}</button>`);}
}
window.addEventListener('click',event=>{if(!event.target.closest('[data-private-search-retry]'))return;event.preventDefault();clearNativeSearch();render();},true);
