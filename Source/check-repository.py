#!/usr/bin/env python3
"""Audit the Git index, or an exported source directory, without printing secrets."""
import argparse
from pathlib import Path, PurePosixPath
import re
import posixpath
import subprocess
import sys
from urllib.parse import unquote

BINARY_ASSETS = {'.png', '.jpg', '.jpeg', '.webp', '.mp4', '.ico', '.icns'}
GENERATED = {'Source/Web/app.js', 'Source/Web/app.css', 'Source/Web/index.html'}
PRIVATE_SUFFIXES = {'.kernpad', '.kernpadbackup', '.p12', '.pfx', '.pem', '.key', '.log', '.zip', '.dmg', '.exe', '.dll', '.pdb', '.recovery', '.mobileprovision', '.provisionprofile', '.crt', '.cer', '.pub', '.sqlite', '.sqlite3', '.db'}
PATTERNS = [r'gh[pousr]_' + r'[A-Za-z0-9]{30,}', r'github_pat_' + r'[A-Za-z0-9_]{30,}',
            r'AKIA' + r'[A-Z0-9]{16}', r'-----BEGIN ' + r'(?:RSA |EC |OPENSSH )?PRIVATE KEY-----']


def index_files(root):
    entries = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root).decode().split('\0')
    files = {}
    for entry in filter(None, entries):
        meta, name = entry.split('\t', 1)
        mode, oid, stage = meta.split()
        if stage != '0' or mode not in {'100644', '100755'}:
            raise ValueError(name + ': unresolved merge, symlink or submodule')
        files[name] = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=root)
    return files


def directory_files(root):
    files = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError(str(path.relative_to(root)) + ': symbolic link')
        if path.is_file():
            files[path.relative_to(root).as_posix()] = path.read_bytes()
    return files


def audit(files):
    errors = []
    for name, data in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts:
            errors.append(name + ': path escapes source root'); continue
        if (any(p in {'.git', 'Build', 'work', 'bin', 'obj', 'Artifacts', '__pycache__', '.aws', '.ssh', '.codex'} or p.endswith(('.app', '.dSYM')) for p in path.parts)
                or path.suffix.lower() in PRIVATE_SUFFIXES or path.name.startswith('.env') and path.name != '.env.example'
                or name in GENERATED or path.name in {'active.json', 'notes.json', 'settings.json', 'template-schemas.json'}
                or path.name.startswith('device-unlock-')):
            errors.append(name + ': private or generated artifact')
        try:
            content = data.decode('utf-8')
        except UnicodeDecodeError:
            if path.suffix.lower() not in BINARY_ASSETS:
                errors.append(name + ': unreviewed binary asset')
            continue
        for pattern in PATTERNS:
            if re.search(pattern, content):
                errors.append(name + ': possible credential (value withheld)')
        old_name = 'folio' + 'key'
        if old_name in name.lower() or old_name in content.lower():
            errors.append(name + ': retired product name')
        if re.search(r'/(?:Users|home)/[^/\s`]+/', content):
            errors.append(name + ': personal absolute path')
        if re.search(r'01a[0-9a-f]{5}-[0-9a-f-]{27}', content):
            errors.append(name + ': local chat identifier')
        if path.suffix == '.md':
            for target in re.findall(r'\]\(([^\s)]+)\)', content) + re.findall(r'(?:src|href)="([^"]+)"', content):
                if target.startswith(('https://', 'http://', '#', 'mailto:')):
                    continue
                local = unquote(target.split('#', 1)[0])
                resolved = posixpath.normpath(str(path.parent / local))
                if local and resolved not in files:
                    errors.append(name + ': missing local link ' + local)
    if not files: errors.append('No publication files found')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, help='Check every file in an exported tree, including hidden files')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    try:
        files = directory_files(args.directory.resolve()) if args.directory else index_files(root)
        errors = audit(files)
    except (ValueError, subprocess.CalledProcessError) as error:
        errors = [str(error)]; files = {}
    if errors:
        print('\n'.join(errors), file=sys.stderr); return 1
    print(f'Publication hygiene passed for {len(files)} files. Run a dedicated secret scanner and review screenshots separately.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
