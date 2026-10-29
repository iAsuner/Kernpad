// Array order is the manual order. Pinning only partitions its presentation;
// new records can keep using unshift without displacing the pinned group.
function orderedRecords(list){return [...list.filter(r=>r.pinned===true),...list.filter(r=>r.pinned!==true)];}
function moveRecordRelative(list,id,targetID,after=false){
 const source=list.find(r=>r.id===id),target=list.find(r=>r.id===targetID);
 if(!source||!target||source===target)return list;
 const next=list.filter(r=>r!==source),at=next.indexOf(target)+(after?1:0);next.splice(at,0,source);return next;
}
function restoreRecordOrder(list,ids){
 const byID=new Map(list.map(r=>[r.id,r])),known=new Set(ids);
 return [...list.filter(r=>!known.has(r.id)),...ids.map(id=>byID.get(id)).filter(Boolean)];
}
