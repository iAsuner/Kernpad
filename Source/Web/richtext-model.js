function documentHeaderVisible(r,key){
 if(typeof r.documentOptions?.[key]==='boolean')return r.documentOptions[key];
 return key==='title'?!!r.name.trim()&&!['未命名便签','未命名记录','Untitled note','Untitled record'].includes(r.name.trim()):!!r.summary?.trim();
}

// Document formatting is data, never executable HTML or arbitrary CSS.
const richColorNames={red:'#d70015',orange:'#b65c00',green:'#247a38',blue:'#245db0',purple:'#8846ad'};
function richColor(value){
 const text=String(value||'').trim().toLowerCase();
 const names={black:'#000000',white:'#ffffff',red:'#ff0000',blue:'#0000ff',green:'#008000',gray:'#808080',grey:'#808080',orange:'#ffa500',purple:'#800080',navy:'#000080',teal:'#008080',yellow:'#ffff00',pink:'#ffc0cb',brown:'#a52a2a'};if(names[text])return names[text];
 if(/^#[\da-f]{6}$/.test(text))return text;
 if(/^#[\da-f]{3}$/.test(text))return '#'+[...text.slice(1)].map(c=>c+c).join('');
 const m=text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*1(?:\.0*)?)?\s*\)$/);
 if(m&&m.slice(1).every(n=>Number(n)<=255))return '#'+m.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 return '';
}
function richSize(value){const n=Number(value);return Number.isFinite(n)&&n>=10&&n<=72?Math.round(n):null;}
function richStyle(style={}){const out={};if(richColor(style.color))out.color=richColor(style.color);if(richSize(style.fontSize))out.fontSize=richSize(style.fontSize);if(['left','center','right','justify'].includes(style.align))out.align=style.align;return out;}
function richStyleCSS(style={}){const s=richStyle(style);return [s.color?'color:'+s.color:'',s.fontSize?'font-size:'+s.fontSize+'px':'',s.align?'text-align:'+s.align:''].filter(Boolean).join(';');}
function richSpanToken(source){
 const open=source.match(/^<span ((?:data-(?:color|rt-color|rt-size)="[^"<>]*"\s*)+)>/);if(!open)return null;
 let depth=1,end=open[0].length,bodyEnd=end;const tokens=/<span\b[^>]*>|<\/span>/g;tokens.lastIndex=end;let token;
 while((token=tokens.exec(source))){depth+=token[0]==='</span>'?-1:1;if(!depth){bodyEnd=token.index;end=tokens.lastIndex;break;}}
 if(depth)return null;
 let color='',size=null;for(const attr of open[1].matchAll(/data-(color|rt-color|rt-size)="([^"]*)"/g)){if(attr[1]==='color')color=richColorNames[attr[2]]||'';if(attr[1]==='rt-color')color=richColor(attr[2]);if(attr[1]==='rt-size')size=richSize(attr[2]);}
 if(!color&&!size)return null;
 const attrs=(color?' data-rt-color="'+color+'"':'')+(size?' data-rt-size="'+size+'"':'');
 return {length:end,inner:source.slice(open[0].length,bodyEnd),attrs,css:richStyleCSS({color,fontSize:size})};
}
function richSpanSource(node,inner){
 const color=richColor(node.dataset.rtColor)||richColorNames[node.dataset.color],size=richSize(node.dataset.rtSize);
 return color||size?'<span'+(color?' data-rt-color="'+color+'"':'')+(size?' data-rt-size="'+size+'"':'')+'>'+inner+'</span>':inner;
}
function richPlainText(value){const box=document.createElement('div');box.innerHTML=mdInline(value||'');return box.textContent||'';}
function richImportHTML(source){
 if(!String(source).trim())throw new Error(ui('请粘贴 HTML 内容','Paste HTML content'));
 if(source.length>500000)throw new Error(ui('单次 HTML 最多 500,000 字符','HTML is limited to 500,000 characters'));
 const doc=new DOMParser().parseFromString(source,'text/html');
 doc.querySelectorAll('script,iframe,frame,object,embed,link,meta,base,template,svg,math,canvas,video,audio,img,input,button,select,textarea,noscript').forEach(n=>n.remove());
 const rules=[];
 for(const sheetNode of doc.querySelectorAll('style')){try{const sheet=new CSSStyleSheet();sheet.replaceSync(sheetNode.textContent);for(const rule of sheet.cssRules)if(rule.selectorText&&rule.style)rules.push(rule);}catch{}sheetNode.remove();}
 const styleFor=node=>{const values={};for(const rule of rules){try{if(node.matches(rule.selectorText))for(const prop of rule.style)values[prop]=rule.style.getPropertyValue(prop);}catch{}}for(const prop of node.style)values[prop]=node.style.getPropertyValue(prop);return values;};
 const px=value=>{const m=String(value||'').match(/^([\d.]+)(px|pt|em|rem)?$/);if(!m)return null;return richSize(Number(m[1])*({pt:4/3,em:16,rem:16}[m[2]]||1));};
 const cssData=(css,inherited={})=>richStyle({color:richColor(css.color)||inherited.color,fontSize:px(css['font-size'])||inherited.fontSize,align:css['text-align']||inherited.align});
 const literal=text=>String(text).replace(/([\\`*_\[\]~=<])/g,'\\$1');
 const inline=(node,depth=0)=>{
  if(depth>24)return '';if(node.nodeType===3)return literal(node.textContent.replace(/\s+/g,' '));if(node.nodeType!==1)return '';
  const tag=node.tagName;if(tag==='BR')return '\n';if(tag==='CODE'){const text=node.textContent,fence='`'.repeat(Math.max(0,...(text.match(/`+/g)||[]).map(s=>s.length))+1);return fence+text+fence;}
  let text=[...node.childNodes].map(n=>inline(n,depth+1)).join('');const css=styleFor(node);
  if(['B','STRONG'].includes(tag)||Number(css['font-weight'])>=600||css['font-weight']==='bold')text='**'+text+'**';
  if(['I','EM'].includes(tag)||css['font-style']==='italic')text='*'+text+'*';
  if(['S','DEL','STRIKE'].includes(tag))text='~~'+text+'~~';if(tag==='MARK')text='=='+text+'==';
  if(tag==='A'&&safeURL(node.getAttribute('href')))text='['+text+']('+safeURL(node.getAttribute('href'))+')';
  const color=richColor(css.color),size=px(css['font-size']);return color||size?'<span'+(color?' data-rt-color="'+color+'"':'')+(size?' data-rt-size="'+size+'"':'')+'>'+text+'</span>':text;
 };
 const blocks=[],blockTags=new Set(['P','DIV','SECTION','ARTICLE','MAIN','HEADER','FOOTER','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','PRE','HR','TABLE']);
 const walk=(node,inherited={},accent=false,depth=0)=>{
  if(depth>24||blocks.length>200)return;
  if(node.nodeType===3){if(node.textContent.trim())blocks.push({type:'text',text:literal(node.textContent.trim()),textStyle:inherited,...(accent?{accent:true}:{})});return;}if(node.nodeType!==1)return;
  const tag=node.tagName,css=styleFor(node),style=cssData(css,inherited),bar=accent||tag==='BLOCKQUOTE'||!!css['border-left']&&!/^0(?:px)?\b/.test(css['border-left'])||parseFloat(css['border-left-width'])>0;
  const extra={...(Object.keys(style).length?{textStyle:style}:{}),...(bar?{accent:true}:{})};
  if(tag==='HR'){blocks.push({type:'divider',...extra});return;}
  if(tag==='PRE'){blocks.push({type:'code',language:node.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1]||'text',text:node.textContent,...extra});return;}
  if(tag==='TABLE'){const rows=[...node.querySelectorAll('tr')].filter(tr=>tr.closest('table')===node).map(tr=>[...tr.children].filter(c=>['TD','TH'].includes(c.tagName)).map(c=>inline(c).trim()));const width=Math.max(0,...rows.map(r=>r.length));if(width&&rows.length)blocks.push({type:'table',rows:rows.map(row=>Array.from({length:width},(_,i)=>row[i]||'')),...extra});return;}
  if(tag==='UL'||tag==='OL'){const items=[],levels=[];const list=(el,level)=>{for(const li of el.children){if(li.tagName!=='LI')continue;const clone=li.cloneNode(true);clone.querySelectorAll('ul,ol').forEach(n=>n.remove());items.push(inline(clone).trim());levels.push(Math.min(6,level));for(const sub of li.children)if(['UL','OL'].includes(sub.tagName))list(sub,level+1);}};list(node,0);if(items.length)blocks.push({type:'list',ordered:tag==='OL',items,levels,...extra});return;}
  if(/^H[1-6]$/.test(tag)){blocks.push({type:'heading',level:Number(tag[1]),text:inline(node).trim(),...extra});return;}
  if(![...node.children].some(c=>blockTags.has(c.tagName))){const text=inline(node).trim();if(text)blocks.push({type:'text',text,...extra});return;}
  let pending=[];const flush=()=>{const text=pending.map(n=>inline(n)).join('').trim();if(text)blocks.push({type:'text',text,...extra});pending=[];};
  for(const child of node.childNodes){if(child.nodeType===1&&blockTags.has(child.tagName)){flush();walk(child,style,bar,depth+1);}else pending.push(child);}flush();
 };
 walk(doc.body);if(blocks.length>200)throw new Error(ui('单次最多插入 200 个内容块','Insert up to 200 blocks at a time'));if(!blocks.length)throw new Error(ui('没有可插入的文字内容','No text content to insert'));return blocks;
}
function safeMediaData(value,type='image'){
 if(typeof value!=='string')return '';
 const pattern=type==='video'?/^data:video\/(mp4|quicktime);base64,[A-Za-z0-9+/]+={0,2}$/:/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
 return value.length<=(type==='video'?12000000:6000000)&&pattern.test(value)?value:'';
}
function richMediaMarkup(b,index){
 const data=documentMediaURL(b.data,b.type);if(!data)return '';
 const name=escape(b.name||''),width=Number.isInteger(b.width)&&b.width>=25&&b.width<=100?b.width:100,poster=documentMediaURL(b.poster),editing=isEditing();
 return `<figure class="mj-media" style="width:${width}%">${b.type==='video'?`<video controls playsinline preload="metadata" ${poster?`poster="${poster}"`:''} src="${data}" aria-label="${name}"></video>`:`<img src="${data}" alt="${name}" loading="lazy" draggable="false" data-layout-media-index="${index}">`}<figcaption>${name}</figcaption></figure>${editing?`<div class="mj-media-tools"><label>${ui('宽度','Width')}<select data-rich-media-width="${index}" aria-label="${ui('媒体宽度','Media width')}">${[25,50,75,100].map(n=>`<option value="${n}" ${width===n?'selected':''}>${n}%</option>`).join('')}</select></label><button class="mj-media-remove" data-media-remove="${index}">${icon('trash-2')}${b.type==='image'?ui('删除图片','Remove image'):ui('删除视频','Remove video')}</button></div>`:''}`;
}
function richPrintBlock(b){
 const style=richStyleCSS(b.textStyle),attrs=(style?' style="'+style+'"':'')+(b.accent||b.type==='quote'?' class="accent"':'');
 if(['image','video'].includes(b.type)){const data=safeMediaData(b.type==='image'?b.data:b.poster);return '<figure'+attrs+' style="width:'+Math.max(25,Math.min(100,b.width||100))+'%;margin:16px auto">'+(data?'<img style="max-width:100%;height:auto" src="'+data+'" alt="'+escape(b.name||'')+'">':'')+'<figcaption>'+escape(b.name||'')+(b.type==='video'?' (Video)':'')+'</figcaption></figure>';}
 if(b.type==='divider')return '<hr'+attrs+'>';
 if(b.type==='code')return '<pre'+attrs+'><code>'+escape(b.text||'')+'</code></pre>';
 if(b.type==='heading')return '<h'+Math.max(1,Math.min(6,b.level||2))+attrs+'>'+mdInline(b.text)+'</h'+Math.max(1,Math.min(6,b.level||2))+'>';
 if(b.type==='list'){const tag=b.ordered?'ol':'ul',tree=listTree(b),render=nodes=>'<'+tag+'>'+nodes.map(n=>'<li>'+mdInline(n.text)+(n.children.length?render(n.children):'')+'</li>').join('')+'</'+tag+'>';return '<div'+attrs+'>'+render(tree)+'</div>';}
 if(b.type==='table')return '<table'+attrs+'>'+b.rows.map((row,i)=>'<tr>'+row.map(text=>'<'+(i?'td':'th')+'>'+mdInline(text)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>';
 if(b.type==='form')return '<dl'+attrs+'>'+(b.fields||[]).map(f=>'<dt>'+escape(f.label)+'</dt><dd>'+escape(fieldIsSecret(f)?'••••••••':f.value||'—')+'</dd>').join('')+'</dl>';
 if(b.type==='otp')return '<p'+attrs+'>'+escape(b.title||'TOTP')+'：••••••</p>';
 if(b.type==='tags')return '<p'+attrs+'>'+escape((b.values||[]).join(', '))+'</p>';
 if(b.type==='link'){const url=safeURL(b.value);return '<p'+attrs+'>'+escape(b.title||'')+(url?' <a href="'+escape(url)+'">'+escape(url)+'</a>':'')+'</p>';}
 if(b.type==='date')return '<p'+attrs+'>'+escape(b.title||'')+' '+escape(b.value||'')+'</p>';
 return '<p'+attrs+'>'+(b.type==='check'?(b.checked?'☑ ':'☐ '):'')+mdInline(b.text||'')+'</p>';
}
function richPrintDocument(r){
 const fields=(r.fields||[]).map(f=>'<dt>'+escape(f.label)+'</dt><dd>'+escape(fieldIsSecret(f)?'••••••••':f.value||'—')+'</dd>').join('');
 const header=(documentHeaderVisible(r,'title')&&r.name.trim()?'<h1>'+escape(r.name)+'</h1>':'')+(documentHeaderVisible(r,'summary')&&r.summary?'<p class="summary">'+escape(r.summary)+'</p>':'');
 return '<!doctype html><html><head><meta charset="utf-8"><style>'+richPrintCSS+'</style></head><body>'+(header?'<header>'+header+'</header>':'')+(fields?'<dl>'+fields+'</dl>':'')+'<main>'+richPrintLayout(r.blocks)+'</main></body></html>';
}
function richPrintLayout(blocks){
 const content=b=>{const l=blockLayout(b.layout);return '<div class="print-block" style="padding:'+l.padding+'px;margin-top:'+l.before+'px;margin-bottom:'+l.after+'px;line-height:'+l.lineHeight+';'+blockSurfaceCSS(b.surface)+'">'+richPrintBlock(b)+'</div>';};
 return layoutRows(blocks).map(row=>{let cursor=1;const cells=[];for(const p of layoutPlacements(row)){if(p.start>cursor)cells.push('<td style="width:'+((p.start-cursor)/12*100)+'%"></td>');cells.push('<td style="width:'+(p.span/12*100)+'%">'+content(row[p.index])+'</td>');cursor=p.start+p.span;}if(cursor<13)cells.push('<td style="width:'+((13-cursor)/12*100)+'%"></td>');return row.length===1&&blockLayout(row[0].layout).span===12?content(row[0]):'<table class="layout-row"><tr>'+cells.join('')+'</tr></table>';}).join('');
}
const richPrintCSS=`@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;font-size:14px;line-height:1.65;color:#202124;margin:0;overflow-wrap:anywhere;-webkit-print-color-adjust:exact}header{margin:0 0 24px}header>h1{font-size:28px;line-height:1.3;margin:0 0 8px}.summary{color:#666}h1,h2,h3,h4,h5,h6{line-height:1.4;break-after:avoid;margin:24px 0 12px}h1{font-size:28px}h2{font-size:23px}h3{font-size:19px}p{margin:12px 0;orphans:3;widows:3}a{color:#245db0;text-decoration:none}hr{border:0;border-top:1px solid #c5c7cb;margin:24px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f6;border-radius:6px;padding:12px;font-size:12px;line-height:1.5}code{font-family:Menlo,monospace}p code,li code{background:#f1f1f3;padding:1px 4px;border-radius:3px}mark{background:#fff1a8}.accent{border-left:3px solid #3977bc;padding-left:14px}table{width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed}tr{break-inside:avoid}th,td{border:1px solid #d3d4d7;text-align:left;vertical-align:top;padding:7px}th{background:#f3f4f6}dl{display:block;margin:16px 0}dt{font-size:12px;color:#666;margin-top:10px}dd{margin:2px 0 8px;white-space:pre-wrap}table.layout-row{border:0;table-layout:fixed;margin:12px 0;border-spacing:12px 0;border-collapse:separate}table.layout-row>tbody>tr>td,table.layout-row>tr>td{border:0;padding:0;vertical-align:top}table.layout-row tr{break-inside:auto}.print-block>p{margin:4px 0 10px}.print-block>h1,.print-block>h2,.print-block>h3{margin:14px 0 8px}figure{break-inside:avoid}figure img{max-height:620px;object-fit:contain}figcaption{font-size:11px;color:#666;text-align:center}ul,ol{padding-left:24px}li{margin:5px 0}`;
