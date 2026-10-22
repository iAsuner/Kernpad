// Existing mailbox bodies stay sealed. Native comparison returns only a reusable
// ID or a conflict, never passwords or OTP seeds, before any pasted data changes.
async function resolveImportMailboxes(rows,preferred=[]){
 const map=new Map(),checked=new Set();for(const row of rows){
  const data=row.data,account=data['email.account'];if(!account||checked.has(account))continue;checked.add(account);
  const result=await nativeCall('resolveMailbox',{account,password:data['email.password']||'',seed:data['email.totp']||'',preferred:preferred.slice(0,40),session:nativeInfo.session});
  if(result.id!=null){if(typeof result.id!=='string'||record(result.id)?.type!=='email')throw Error(ui('关联邮箱响应无效','Invalid mailbox response'));map.set(account,result.id);}
 }
 return map;
}
window.addEventListener('click',async event=>{
 const button=event.target.closest('[data-v4="paste-apply"],[data-v3="commit-entry"],[data-v3="create-entry"]');
 if(button?.dataset.v4==='paste-apply'&&selected()?.templateID&&!isProtected(selected()))return;
 if(!button||!nativeInfo.recordProtocol)return;event.preventDefault();event.stopImmediatePropagation();if(!vaultUnlocked||button.disabled)return;
 const editor=button.dataset.v4==='paste-apply',single=button.dataset.v3==='create-entry',current=selected();
 const draft=editor?pasteEditor:entryDraft,preview=editor?pasteEditor?.preview:entryPreview;
 const rows=editor?preview?.rows:single?[{data:entryDraft?.values,line:1}]:preview?.rows;
 if(!rows?.length||rows.some(row=>row.error))return;
 const epoch=privacyEpoch,session=nativeInfo.session,text=draft?.text,selectedID=state.selected;
 const stillCurrent=()=>epoch===privacyEpoch&&session===nativeInfo.session&&vaultUnlocked&&state.selected===selectedID&&(editor?pasteEditor:entryDraft)===draft&&draft?.text===text;
 button.disabled=true;
 try{
  const checked=validateRelations({rows:structuredClone(rows)});if(checked.rows.some(row=>row.error))throw Error(checked.rows.find(row=>row.error).error);
  await persist();if(!stillCurrent())return;
  const mailboxes=await resolveImportMailboxes(rows,editor?current.refs:entryDraft?.refs||[]);if(!stillCurrent())return;
  if(editor)applyEditorPaste(mailboxes);else commitData(rows,single,mailboxes);
  await persist();
 }catch(error){if(!stillCurrent())return;const target=editor?$('#mj-paste-preview'):$('#mj-entry-error');if(target){target.textContent=String(error.message||error);target.setAttribute('role','alert');}else toast(String(error.message||error));}
 finally{if(button.isConnected)button.disabled=false;}
},true);
