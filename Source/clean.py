#!/usr/bin/env python3
"""Remove known project-generated outputs, never installed apps or user libraries."""
import argparse
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dry-run', action='store_true', help='List targets without deleting them')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
names = [
    '.DS_Store', 'Build', 'work', 'Kernpad.app', 'Windows/Artifacts',
    'Source/Web/app.js', 'Source/Web/app.css', 'Source/Web/index.html',
]
for product in ('Kernpad',):
    names.extend((f'{product}-logo.png', f'{product}-logo.svg', f'{product}-icon-256.png'))
for project in sorted((root / 'Windows').glob('*/*.csproj')):
    names.extend(str((project.parent / part).relative_to(root)) for part in ('bin', 'obj'))
for folder in (root / 'Source').rglob('__pycache__'):
    names.append(str(folder.relative_to(root)))
for name in dict.fromkeys(names):
    target = root / name
    if not target.exists() and not target.is_symlink():
        continue
    # Do not traverse a symlinked parent into another checkout or user directory.
    if not target.parent.resolve().is_relative_to(root):
        raise SystemExit(f'Refusing external target: {name}')
    print(('Would remove: ' if args.dry_run else 'Removing: ') + name)
    if args.dry_run:
        continue
    if target.is_dir() and not target.is_symlink():
        shutil.rmtree(target)
    else:
        target.unlink()
print('Git history, source, fixtures, installed applications and user libraries are preserved.')
