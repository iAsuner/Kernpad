#!/usr/bin/env python3
"""Build a separate performance app without changing the shipping entry point."""
import pathlib,sys,subprocess,plistlib,shutil
project=pathlib.Path(__file__).resolve().parents[2]
label=sys.argv[1]
if label not in ('before','after'):raise SystemExit('Use before or after')
folder=project/'Build/performance';app=folder/('Kernpad-'+label+'.app')
subprocess.run(['ditto',str(project/'Kernpad.app'),str(app)],check=True)
web=app/'Contents/Resources/Web'
source=folder/'baseline-web' if label=='before' else project/'Source/Web'
for file in source.iterdir():
 if file.is_file() and file.name in ('index.html','app.js','app.css','lucide.min.js','logo.svg'):shutil.copy2(file,web/file.name)
script=(web/'app.js').read_text();offset=script.rindex('})();')
(web/'app.js').write_text(script[:offset]+(project/'Source/Performance/workload.js').read_text()+script[offset:])
info=plistlib.loads((app/'Contents/Info.plist').read_bytes());info.update(CFBundleIdentifier='app.kernpad.performance.'+label,CFBundleName='Kernpad Performance',CFBundleDisplayName='Kernpad 性能测试')
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
main=(project/'Source/main.swift').read_text()
main=main[:main.rindex('#if !KERNPAD_AUTH_TEST')]+'''
let app=NSApplication.shared
let delegate=AppDelegate()
app.delegate=delegate
guard let argument=CommandLine.arguments.firstIndex(of:"--performance-output"),argument+1<CommandLine.arguments.count else{exit(0)}
let perfOutput=URL(fileURLWithPath:CommandLine.arguments[argument+1])
let performance=PerformanceRunner(delegate,perfOutput)
DispatchQueue.main.async { performance.start() }
app.run()
'''
entry=folder/'main.swift';entry.write_text(main)
subprocess.run(['xcrun','swiftc','-swift-version','5','-O','-module-cache-path',str(project/'Build/module-cache'),*[str(project/'Source'/f) for f in ['VaultCrypto.swift','DeviceUnlock.swift','VaultStore.swift','Tests/TestVault.swift','MediaAttachment.swift','PDFExporter.swift','Performance/MacRunner.swift']],str(entry),'-o',str(app/'Contents/MacOS/Kernpad')],check=True)
subprocess.run(['codesign','--force','--sign','-','--options','runtime',str(app)],check=True)
print(app)
