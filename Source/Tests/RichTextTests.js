const checks=[];
function check(name,test){if(!test())throw new Error(name);checks.push(name);}
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
check('colors and sizes are bounded',()=>richColor('rgb(10, 20, 30)')==='#0a141e'&&richColor('#abc')==='#aabbcc'&&!richColor('url(https://bad.invalid)')&&richSize(73)===null);
check('style properties cannot carry CSS or event handlers',()=>equal(richStyle({color:'#123456',fontSize:24,align:'center',position:'fixed',onclick:'bad'}),{color:'#123456',fontSize:24,align:'center'}));
const nested='<span data-rt-color="#123456">blue <span data-rt-size="24">large **bold**</span></span>';
const box=document.createElement('div');box.innerHTML=mdInline(nested);
check('nested inline styles round trip',()=>richSource(box)===nested);
check('rich previews remove style markup',()=>richPlainText(nested)==='blue large bold');
check('legacy named colors still render',()=>mdInline('<span data-color="blue">text</span>').includes('color:#245db0'));
check('raw HTML is never executed by the rich renderer',()=>!mdInline('<img src=x onerror=bad()>').includes('<img'));
check('invalid inline attributes cannot become markup',()=>!mdInline('<span data-rt-color="red;background:url(x)">x</span>').includes('<span'));
const source=`<style>.chapter{color:#245db0;border-left:4px solid blue}.center{text-align:center;font-size:28px}</style><div><h1 class="center">合成排版测试</h1><hr><section class="chapter"><h2>带竖线的标题</h2><p>正文 <strong style="color: rgb(180, 20, 30)">彩色重点</strong>。</p></section><ul><li>一<ul><li>子项</li></ul></li><li>二</li></ul><table><tr><th>名称</th><th>内容</th></tr><tr><td>合成资料</td><td>验收</td></tr></table><pre><code class="language-json">{"id":9007199254740993}</code></pre></div>`;
const blocks=richImportHTML(source);
check('HTML imports heading size and alignment',()=>blocks[0].type==='heading'&&blocks[0].textStyle.fontSize===28&&blocks[0].textStyle.align==='center');
check('HTML imports dividers and an accent around headings and body',()=>blocks[1].type==='divider'&&blocks[2].accent&&blocks[3].accent&&blocks[2].type==='heading');
check('HTML preserves custom text colors',()=>mdInline(blocks[3].text).includes('#b4141e'));
check('HTML preserves nested list levels',()=>equal(blocks.find(b=>b.type==='list').levels,[0,1,0]));
check('HTML tables remain editable cells',()=>equal(blocks.find(b=>b.type==='table').rows,[['名称','内容'],['合成资料','验收']]));
check('HTML code preserves exact numeric values',()=>blocks.find(b=>b.type==='code').text==='{"id":9007199254740993}');
const hostile=richImportHTML('<script>window.pwned=1</script><style>@import "https://invalid.example";p{background:url(https://invalid.example);position:fixed}</style><iframe src="file:///etc/passwd"></iframe><img src="https://invalid.example"><p onclick="bad()">safe <a href="javascript:bad()">link</a><span style="font-size:999px;color:var(--bad)">text</span></p>');
check('HTML strips active elements and attributes',()=>!JSON.stringify(hostile).match(/pwned|onclick|iframe|invalid\.example|javascript|position|background/) && !window.pwned);
check('literal Markdown characters in imported HTML stay literal',()=>mdInline(richImportHTML('<p>**literal** &lt;span&gt; [value]</p>')[0].text)==='**literal** &lt;span&gt; [value]');
check('empty HTML is rejected',()=>{try{richImportHTML('<script>bad()</script>')}catch{return true}return false});
check('oversized HTML is rejected',()=>{try{richImportHTML('a'.repeat(500001))}catch{return true}return false});
// Exercise real DOM ranges and the production formatting function.
let editorRecord={id:'editor',type:'note',blocks:[{type:'text',text:'plain **bold**'},{type:'text',text:'second'}]},richBlockSelection=null,richSelection=null,activeRichIndex=0,vaultUnlocked=false;
const root=document.createElement('section');document.body.append(root);const state={view:'document'};
function selected(){return editorRecord;}function isEditing(){return true;}function isProtected(){return false;}function $(s){return root.querySelector(s);}function snapshotEditor(){}function remember(){}function toast(){}
function repaintBlocks(){root.innerHTML=editorRecord.blocks.map((b,i)=>'<p data-rich-block="'+i+'" style="'+richStyleCSS(b.textStyle)+'">'+mdInline(b.text)+'</p>').join('');}
function readRich(el){editorRecord.blocks[Number(el.dataset.richBlock)].text=richSource(el);}
function rememberSelection(){const sel=window.getSelection();if(sel.rangeCount){const range=sel.getRangeAt(0),el=(range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement).closest('[data-rich-block]');if(el)richSelection={el,range:range.cloneRange()};}}
repaintBlocks();let el=root.querySelector('p'),range=document.createRange();range.selectNodeContents(el);richSelection={el,range};richBlockSelection={id:'editor',indices:[0]};
setRichFormat('color','#123456');
check('selected text gets a custom color and keeps bold',()=>editorRecord.blocks[0].text.includes('data-rt-color="#123456"')&&editorRecord.blocks[0].text.includes('**bold**'));
setRichFormat('color','#654321');
check('changing color replaces the earlier color',()=>editorRecord.blocks[0].text.includes('#654321')&&!editorRecord.blocks[0].text.includes('#123456'));
setRichFormat('fontSize',26);
check('selected text can combine custom size and color',()=>editorRecord.blocks[0].text.includes('data-rt-size="26"')&&editorRecord.blocks[0].text.includes('#654321'));
richSelection=null;richBlockSelection={id:'editor',indices:[0,1]};setRichFormat('align','center');setRichFormat('accent');
check('a paragraph selection shares alignment and a quote border',()=>editorRecord.blocks.every(b=>b.textStyle.align==='center'&&b.accent));
setRichFormat('block','heading2');
check('selected paragraphs can become headings without losing content',()=>editorRecord.blocks.every(b=>b.type==='heading'&&b.level===2)&&editorRecord.blocks[0].text.includes('bold'));
setRichFormat('reset');
check('reset removes custom sizes and colors but keeps emphasis',()=>!editorRecord.blocks[0].text.includes('data-rt-')&&editorRecord.blocks[0].text.includes('**bold**'));
setRichFormat('fontSize',200);
check('invalid sizes do not change the document',()=>!editorRecord.blocks.some(b=>b.textStyle.fontSize===200));
const css=document.createElement('style');css.textContent=testCSS;document.head.append(css);
root.id='kernpad-root';root.className='mj-v5 mj-v4';root.innerHTML='<div id="mj-blocks" style="width:700px"><div class="mj-component mj-docblock" style="grid-column:span 6"><div class="mj-heading-row"><h2 class="mj-rich">左侧标题</h2></div></div><div class="mj-component mj-docblock" style="grid-column:span 6"><p class="mj-rich">右侧正文</p></div><div class="mj-component mj-docblock" style="grid-column:span 12"><p class="mj-rich">下一行</p></div></div>';
const cells=[...root.querySelectorAll('.mj-docblock')],rects=cells.map(el=>el.getBoundingClientRect());
check('two half blocks share a visual row',()=>Math.abs(rects[0].top-rects[1].top)<1&&Math.abs(rects[0].width-rects[1].width)<1);
check('default block spacing stays compact',()=>rects[2].top-rects[0].bottom<=13&&rects[2].top>=rects[0].bottom);
check('headings and body begin at their column edge',()=>Math.abs(cells[0].querySelector('h2').getBoundingClientRect().left-rects[0].left)<1&&Math.abs(cells[1].querySelector('p').getBoundingClientRect().left-rects[1].left)<1);
const r={name:'富文本与 PDF 合成验收',summary:'字号、颜色、居中、引用、列表、表格和长文分页',fields:[{label:'密码',value:'NeverExportThisSecret',secret:true}],blocks:[...blocks,{type:'text',text:'并排左侧',layout:{span:6,padding:8}},{type:'text',text:'并排右侧',layout:{span:6,padding:8}},mediaFixture.image,mediaFixture.video,...Array.from({length:24},(_,i)=>({type:i%6===0?'heading':'text',level:2,text:i%6===0?'第 '+(i+1)+' 节':'这是一段用于分页验收的合成文字。字号与颜色应在导出后保留，段落自然换行。 '.repeat(4),textStyle:{color:i%6===0?'#245db0':'#202124'}}))]};
const html=richPrintDocument(r);
check('PDF masks secret values',()=>!html.includes('NeverExportThisSecret')&&html.includes('••••••••'));
check('PDF includes chosen typography and alignment',()=>html.includes('text-align:center')&&html.includes('font-size:28px')&&html.includes('color:#b4141e'));
check('PDF retains nested lists, tables and accent borders',()=>html.includes('<ul><li>一<ul>')&&html.includes('<table')&&html.includes('class="accent"'));
check('media rejects remote and SVG sources',()=>!safeMediaData('https://example.invalid/x.png')&&!safeMediaData('data:image/svg+xml;base64,AAAA'));
check('PDF includes image and video poster but omits playable video bytes',()=>html.includes(mediaFixture.image.data)&&html.includes(mediaFixture.video.poster)&&!html.includes(mediaFixture.video.data));
check('PDF preserves side-by-side grid columns',()=>html.includes('class="layout-row"')&&html.includes('width:50%'));
const positioned=document.createElement('div');positioned.innerHTML=richPrintLayout([{type:'text',text:'Positioned synthetic paragraph',layout:{span:6,start:4}}]);
check('PDF leaves equal blank columns beside a centered half block',()=>equal([...positioned.querySelectorAll('td')].map(td=>td.style.width),['25%','50%','25%']));
return {count:checks.length,html};
