// Twelve-column flow: content order stays stable and narrow windows stack columns.
function blockSurface(value={}){
 const out={};for(const key of ['background','borderColor'])if(typeof value[key]==='string'&&/^#[a-f\d]{6}$/i.test(value[key]))out[key]=value[key].toLowerCase();
 if(Number.isInteger(value.radius)&&value.radius>=0&&value.radius<=24)out.radius=value.radius;
 return out;
}
function blockSurfaceCSS(value={}){const s=blockSurface(value);return [s.background?'background-color:'+s.background:'',s.borderColor?'border:1px solid '+s.borderColor:'',s.radius?'border-radius:'+s.radius+'px':''].filter(Boolean).join(';');}
function blockLayout(value={}){
 const integer=(n,min,max,fallback)=>Number.isInteger(n)&&n>=min&&n<=max?n:fallback;
 const span=integer(value.span,1,12,12);
 return {span,start:integer(value.start,0,13-span,0),rowSpan:integer(value.rowSpan,1,12,1),heightMode:value.heightMode==='row'?'row':'content',padding:integer(value.padding,0,40,0),before:integer(value.before,0,64,0),after:integer(value.after,0,64,0),lineHeight:typeof value.lineHeight==='number'&&value.lineHeight>=1.2&&value.lineHeight<=2.4?value.lineHeight:1.65,breakBefore:value.breakBefore===true,breakAfter:value.breakAfter===true};
}
function layoutPlacements(blocks){
 const placed=[],occupied=[];let row=0,cursor=1;
 for(const [index,b] of blocks.entries()){
  const l=blockLayout(b.layout);if(cursor>1&&(l.breakBefore||l.start&&l.start<cursor)){row++;cursor=1;}
  let start;
  for(;;row++,cursor=1){
   start=l.start||cursor;
   const free=s=>{for(let y=row;y<row+l.rowSpan;y++)for(let x=s;x<s+l.span;x++)if(occupied[y]?.has(x))return false;return true;};
   if(!l.start)while(start+l.span<=13&&!free(start))start++;
   if(start+l.span<=13&&free(start))break;
  }
  for(let y=row;y<row+l.rowSpan;y++){occupied[y]??=new Set();for(let x=start;x<start+l.span;x++)occupied[y].add(x);}
  placed.push({index,row,start,span:l.span,rowSpan:l.rowSpan});cursor=start+l.span;if(cursor===13||l.breakAfter){row++;cursor=1;}
 }
 return placed;
}
function splitColumnPreset(){return [
 {type:'text',text:'',layout:{span:6,start:1,rowSpan:2,heightMode:'row',breakBefore:true}},
 {type:'text',text:'',layout:{span:6,start:7,heightMode:'row'}},
 {type:'text',text:'',layout:{span:6,start:7,heightMode:'row',breakAfter:true}}
];}
function layoutRows(blocks){const rows=[];let previous=-1;for(const p of layoutPlacements(blocks)){if(p.row!==previous){rows.push([]);previous=p.row;}rows.at(-1).push(blocks[p.index]);}return rows;}
function placeDocumentBlock(blocks,index,rowIndices,start){
 const b=blocks[index];if(!b||!Number.isInteger(start)||start<1||start+blockLayout(b.layout).span>13||!rowIndices.length)return null;
 const placements=layoutPlacements(blocks),span=blockLayout(b.layout).span,others=rowIndices.filter(i=>i!==index).map(i=>placements[i]);
 if(others.some(p=>!p||start<p.start+p.span&&start+span>p.start))return null;
 const group=[...others.map(p=>({block:blocks[p.index],start:p.start})),{block:b,start}].sort((a,b)=>a.start-b.start),objects=group.map(p=>p.block),at=Math.min(...rowIndices)-(index<Math.min(...rowIndices)?1:0),rest=blocks.filter(item=>!objects.includes(item));
 group.forEach((p,i)=>p.block.layout={...blockLayout(p.block.layout),start:p.start,breakBefore:i===0,breakAfter:i===group.length-1});rest.splice(at,0,...objects);blocks.splice(0,blocks.length,...rest);return blocks.indexOf(b);
}
function moveDocumentBlocks(blocks,indices,target){
 const selected=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<blocks.length).sort((a,b)=>a-b);
 if(!selected.length||!Number.isInteger(target)||target<0||target>blocks.length)return [];
 const moved=selected.map(i=>blocks[i]),rest=blocks.filter((_,i)=>!selected.includes(i)),index=target-selected.filter(i=>i<target).length;
 rest.splice(index,0,...moved);blocks.splice(0,blocks.length,...rest);return moved.map((_,i)=>index+i);
}
function documentDropIntent(blocks,indices,rects,grid,x,y){
 if(!indices.length||!rects.length||!blocks[indices[0]])return null;
 const placements=layoutPlacements(blocks),rows=[];for(const p of placements){let row=rows.find(r=>r.id===p.row);if(!row){row={id:p.row,indices:[],top:Infinity,bottom:-Infinity};rows.push(row);}row.indices.push(p.index);row.top=Math.min(row.top,rects[p.index].top);row.bottom=Math.max(row.bottom,rects[p.index].bottom);}
 for(let i=0;i<rows.length-1;i++)rows[i].bottom=Math.min(rows[i].bottom,rows[i+1].top-12);
 const row=rows.reduce((best,r)=>{const distance=Math.max(r.top-y,y-r.bottom,0);return !best||distance<best.distance?{...r,distance}:best;},null),span=blockLayout(blocks[indices[0]].layout).span,start=Math.max(1,Math.min(13-span,1+Math.round((x-grid.left)/(grid.width+20)*12))),edge=Math.min(8,(row.bottom-row.top)/4);
 const separate=after=>({index:after?Math.max(...row.indices)+1:Math.min(...row.indices),start,after,edge:after?row.bottom:row.top});
 if(y<=row.top+edge)return separate(false);if(y>=row.bottom-edge)return separate(true);
 if(indices.length===1&&placements.filter(p=>p.index!==indices[0]&&p.row<=row.id&&p.row+p.rowSpan>row.id).every(p=>start>=p.start+p.span||start+span<=p.start))return {row:row.indices,start,top:row.top,height:Math.max(34,row.bottom-row.top)};
 return separate(y>(row.top+row.bottom)/2);
}
function dropDocumentBlocks(blocks,indices,intent){
 if(!intent)return [];if(intent.row){const index=placeDocumentBlock(blocks,indices[0],intent.row,intent.start);return index===null?[]:[index];}
 const moved=moveDocumentBlocks(blocks,indices,intent.index);for(const i of moved){const l=blockLayout(blocks[i].layout);blocks[i].layout={...l,start:Math.min(intent.start,13-l.span),breakBefore:true,breakAfter:true};}return moved;
}
function blockLabel(b){return b.type==='heading'?'H'+(b.level||2):({text:'P',list:'≡',image:'IMG',video:'MOV',quote:'❯',code:'</>',table:'▦',otp:'OTP',divider:'—',check:'☑'})[b.type]||'•';}
function plainNoteOTP(record,block){return record?.type==='note'&&record.protected!==true&&block.type==='otp'&&block.storage==='public';}
