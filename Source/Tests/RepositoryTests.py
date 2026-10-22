#!/usr/bin/env python3
"""Publication boundary regression tests; no real credentials or personal data."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

source = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('hygiene', source / 'check-repository.py')
hygiene = importlib.util.module_from_spec(spec); spec.loader.exec_module(hygiene)

class PublicationTests(unittest.TestCase):
    def test_safe_source(self):
        self.assertFalse(hygiene.audit({'README.md': b'[guide](docs/guide.md)', 'docs/guide.md': b'Guide'}))
    def test_private_and_generated(self):
        for name in ['.git/config', 'Build/result.json', 'demo.kernpad', 'copy.kernpadbackup', 'device-unlock-any.json', 'test-only.recovery', 'notes.json', '.env', 'signing.pfx', 'App.app/Contents/Info.plist', 'Source/Web/app.js', 'Windows/bin/file.txt']:
            with self.subTest(name=name): self.assertTrue(hygiene.audit({name:b'example'}))
    def test_untrusted_path(self):
        for name in ['../outside', '/absolute/file']:
            self.assertTrue(hygiene.audit({name:b'example'}))
    def test_credential_value_is_never_reported(self):
        secret='gh'+'p_'+'SyntheticToken1234567890abcdefghijklmn'
        errors=hygiene.audit({'fixture.json': ('{"token":"'+secret+'"}').encode()})
        self.assertTrue(errors); self.assertNotIn(secret,str(errors))
    def test_retired_name_and_personal_path(self):
        for text in ['Folio'+'Key', '/Us'+'ers/example/private.txt']:
            self.assertTrue(hygiene.audit({'source.txt':text.encode()}))
    def test_link_resolution(self):
        self.assertFalse(hygiene.audit({'docs/index.md':b'[home](../README.md)', 'README.md':b'Home'}))
        self.assertTrue(hygiene.audit({'docs/index.md':b'[missing](../../outside.md)'}))
    def test_unreviewed_binary(self):
        self.assertTrue(hygiene.audit({'mystery.bin':b'\xff\x00'}))
    def test_directory_includes_hidden_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder); (path/'.hidden').write_text('example')
            self.assertIn('.hidden',hygiene.directory_files(path))
    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder); (path/'target').write_text('example')
            try: (path/'link').symlink_to(path/'target')
            except OSError: self.skipTest('Symlinks unavailable')
            with self.assertRaises(ValueError): hygiene.directory_files(path)

if __name__=='__main__': unittest.main()
