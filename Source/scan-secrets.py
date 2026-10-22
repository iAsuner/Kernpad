#!/usr/bin/env python3
"""Scan the exact Git index with an installed Gitleaks binary, with values redacted."""
import argparse
import importlib.util
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('repository_hygiene', root / 'Source/check-repository.py')
hygiene = importlib.util.module_from_spec(spec); spec.loader.exec_module(hygiene)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--gitleaks', default='gitleaks', help='Installed Gitleaks 8.30.1 or newer')
args = parser.parse_args()
files = hygiene.index_files(root)
errors = hygiene.audit(files)
if errors: raise SystemExit('\n'.join(errors))
with tempfile.TemporaryDirectory(prefix='Kernpad-Source-Scan-') as folder:
    stage = Path(folder)
    for name, data in files.items():
        path = stage / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    result = subprocess.run([args.gitleaks, 'dir', '--redact=100', '--no-banner', '--config', str(stage / '.gitleaks.toml'), str(stage)])
    raise SystemExit(result.returncode)
