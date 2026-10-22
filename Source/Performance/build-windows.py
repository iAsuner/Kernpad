#!/usr/bin/env python3
import pathlib,subprocess,sys,shutil
project=pathlib.Path(__file__).resolve().parents[2];label=sys.argv[1]
if label not in ('before','after'):raise SystemExit('Use before or after')
folder=project/'Build/performance';output=folder/('windows-'+label)
subprocess.run(['dotnet','publish',str(project/'Windows/Kernpad.Performance'),'-c','Release','-r','win-arm64','--self-contained','true','-o',str(output)],check=True)
source=folder/'baseline-web' if label=='before' else project/'Source/Web'
for name in ['index.html','app.js','app.css','lucide.min.js','logo.svg']:shutil.copy2(source/name,output/'Web'/name)
path=output/'Web/app.js';script=path.read_text();offset=script.rindex('})();');path.write_text(script[:offset]+(project/'Source/Performance/workload.js').read_text()+script[offset:])
temporary=shutil.make_archive(str(output)+'-next','zip',output)
pathlib.Path(temporary).replace(output.with_suffix('.zip'))
print(output)
