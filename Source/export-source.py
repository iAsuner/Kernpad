#!/usr/bin/env python3
"""Export only the audited Git index. No Git history or ignored local files."""
import argparse
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('repository_hygiene', root / 'Source/check-repository.py')
hygiene = importlib.util.module_from_spec(spec); spec.loader.exec_module(hygiene)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', type=Path, help='A new directory; existing destinations are never overwritten')
args = parser.parse_args()
destination = args.destination.expanduser().resolve()
if destination.exists() or not destination.parent.is_dir():
    raise SystemExit('Destination must be absent, with an existing parent directory.')
files = hygiene.index_files(root)
modes = {}
for entry in filter(None, subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=root).decode().split("\0")):
    meta, name = entry.split("\t", 1)
    modes[name] = 0o755 if meta.split()[0] == "100755" else 0o644
errors = hygiene.audit(files)
if errors: raise SystemExit('\n'.join(errors))
if subprocess.run(['git', 'diff', '--quiet'], cwd=root).returncode:
    raise SystemExit('Tracked working files differ from the index. Review and stage changes before exporting.')
stage = Path(tempfile.mkdtemp(prefix='.kernpad-source-', dir=destination.parent))
try:
    for name, data in files.items():
        path = stage / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data); path.chmod(modes[name])
    errors = hygiene.audit(hygiene.directory_files(stage))
    if errors: raise SystemExit('\n'.join(errors))
    stage.chmod(0o755)
    stage.rename(destination)
finally:
    if stage.exists(): shutil.rmtree(stage)
print(f'Exported {len(files)} audited files to {destination}. No Git repository was created.')
