#!/usr/bin/env python3
"""Save the current built web resources before making a performance change."""
from pathlib import Path
import hashlib,json,shutil,subprocess
project=Path(__file__).resolve().parents[2]
destination=project/'Build/performance/baseline-web'
destination.mkdir(parents=True,exist_ok=False)
files=['index.html','app.js','app.css','lucide.min.js','logo.svg']
for name in files:shutil.copy2(project/'Source/Web'/name,destination/name)
manifest={'revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=project,text=True).strip(),'sha256':{name:hashlib.sha256((destination/name).read_bytes()).hexdigest() for name in files}}
(destination/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(destination)
