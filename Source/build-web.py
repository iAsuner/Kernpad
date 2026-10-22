from pathlib import Path
import re, hashlib, shutil, plistlib
from build_examples import build_examples

source=Path(__file__).resolve().parent
web=source/'Web'
design=web/'design.html'
s=design.read_text(encoding="utf-8")
css=s.split('<style>',1)[1].split('</style>',1)[0]
js=s.split('<script>',1)[1].rsplit('</script>',1)[0]
markup=s.split('<style>',1)[0]
# The bundled app starts empty. Design samples never enter a user's library.
a=js.index('let records=[');b=js.index('const appearance=',a)
js=js[:a]+"let records=[];\nconst state={category:'all',view:'table',selected:null,search:'',editing:false,locked:false,modal:'',template:null,history:[],otp:''};\n"+js[b:]
a=js.index('records.unshift(\n {id:\'note-commands\'');b=js.index("state.area='notes';",a)
js=js[:a]+js[b:]
js=js.replace("state.selected='note-commands';state.view='document'", "state.selected=null;state.view='table'")
js=js.replace('const saved=window.openai?.widgetState?.modelContent;', 'const saved=null;')
js=re.sub(r"window.addEventListener\('openai:set_globals'.*?\n", '', js)
# Replace the last implementations; earlier prototypes remain unreachable helpers.
for name,new in [('render','renderNativeBase'),('schemaRecord','schemaNativeBase'),('makeBlock','makeNativeBlock'),('renderNav','renderNavigationBase'),('renderBuilder','renderBuilderBase'),('filtered','filteredBase')]:
 pos=js.rindex('function '+name+'(')
 js=js[:pos]+js[pos:].replace('function '+name+'(', 'function '+new+'(',1)
js=js.replace('模板已保存，仅本次预览','模板已保存').replace('演示编辑　仅本次预览','本地保存　已保存到本机')
js=js.replace('r.otpSecret||demoSeed', "r.otpSecret||''")
js=js.replace('if(state.locked||version!==otpVersion)', 'if(!vaultUnlocked||version!==otpVersion)')
js=js.replace('if(state.locked||version!==blockCodeVersion)', 'if(state.locked||version!==blockCodeVersion)')
# Public-note authenticators also tick while the vault is locked.
js=js.replace("['otp','form','preset-login','preset-server']", "['otp','form','preset-login','preset-server','preset-contact']")
js=js.replace("docMode=id.startsWith('new-')?'edit':'view'", "docMode='view'")
js=js.replace('records.unshift(r);closeModal();openRecord(r.id);', "records.unshift(r);closeModal();openRecord(r.id);docMode='edit';render();")
js=js.replace("save.textContent!==(pasteEditor?'保存并返回编辑':'保存并创建记录')", "save.textContent!==tr(pasteEditor?'保存并返回编辑':'保存并创建记录')")
js=js.replace("save.textContent=pasteEditor?'保存并返回编辑':'保存并创建记录'", "save.textContent=tr(pasteEditor?'保存并返回编辑':'保存并创建记录')")
js=js.replace('<span>DEMO CARD</span><span>VISA</span>','<span>PAYMENT CARD</span><span></span>')
# Remove inline style event/state wiring from the host mockup.
a=js.index('if(globalThis.Tweak)');b=js.index('\n})();',a);js=js[:a]+js[b:]
startup='render();checkLock();const interval=setInterval(tick,1000);'
replacement=build_examples(source)+'\n'+'\n'.join((web/name).read_text(encoding="utf-8") for name in ['document-values.js','i18n.js','shortcuts-model.js','record-previews.js','document-templates-model.js','native.js','record-helpers.js','list-model.js','refinements.js','macos.js','experience-model.js','platform-icons.js','experience.js','richtext-model.js','document-media.js','richtext.js','media-drop.js','print-layout.js','rich-color.js','layout-model.js','editing-flow.js','layout.js','shortcuts.js','examples.js','template-catalog.js','credential-tools.js','private-search.js','mailbox-import.js','editor-ux.js','pdf-preview.js','editor-history.js','manual-save.js','save-indicator.js','temporary-notes.js','document-templates.js','template-workspace.js'])+'\nconst interval=setInterval(tick,1000);'
js=js.replace(startup,replacement)
version=plistlib.loads((source/'Info.plist').read_bytes())['CFBundleShortVersionString']
markup=markup.replace('交互原型 v5（示例数据）',version+' 本地个人版').replace('设计预览，请勿输入真实凭据','纯本地').replace('示例资料仅在本次预览中编辑','Kernpad keeps your data on this Mac').replace('搜索示例资料','搜索资料').replace('密笺 macOS 本地资料库设计','Kernpad')
markup=markup.replace('<span class="mj-appname">密笺</span>','<span class="mj-appname">Kernpad</span>')
markup=markup.replace('<button class="mj-icon cursor-interaction" data-action="lock"', '<button class="mj-icon cursor-interaction" data-native="language" aria-label="切换语言">EN</button><button class="mj-icon cursor-interaction" data-action="lock"')
markup=re.sub(r'(<span class="mj-brandmark">).*?(</span>)',r'\1<img src="logo.svg" alt="Kernpad">\2',markup,count=1)
(web/'app.js').write_text(js, encoding='utf-8')
(web/'app.css').write_text('\n'.join([css]+[(web/name).read_text(encoding="utf-8") for name in ['native.css','macos.css','experience.css','richtext.css','layout.css','windows.css','examples.css','credential-tools.css','editor-ux.css','pdf-preview.css','document-templates.css']]), encoding='utf-8')
# No inline script or external resources. Network requests and embedded content are blocked.
csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
(web/'index.html').write_text('<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><title>Kernpad</title><link rel="stylesheet" href="app.css"></head><body>\n'+markup+'\n<script src="lucide.min.js"></script><script src="app.js"></script></body></html>', encoding='utf-8')
print('Built offline UI:',len(js.encode()),'bytes')
