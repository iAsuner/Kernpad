#!/usr/bin/env python3
"""Signs disposable app copies only; never installs or launches them."""
from pathlib import Path
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_support as support
import importlib.util
spec = importlib.util.spec_from_file_location("install_local", Path(__file__).resolve().parents[1] / "install-local.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

count = 0


def rejects(label, operation):
    global count
    try:
        operation()
    except (RuntimeError, subprocess.CalledProcessError):
        count += 1
        return
    raise AssertionError("Accepted " + label)


def check(value, label):
    global count
    assert value, label
    count += 1


with tempfile.TemporaryDirectory(prefix="Kernpad-Build-Security-") as temporary:
    root = Path(temporary)
    app = root / "Probe.app"
    (app / "Contents/MacOS").mkdir(parents=True)
    (app / "Contents/Resources").mkdir()
    shutil.copyfile("/usr/bin/true", app / "Contents/MacOS/Probe")
    (app / "Contents/MacOS/Probe").chmod(0o755)
    metadata = app / "Contents/Info.plist"
    metadata.write_bytes(plistlib.dumps({"CFBundleIdentifier": support.BUNDLE_ID,
        "CFBundleExecutable": "Probe", "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": "0.1", "CFBundleVersion": "1"}))
    content = app / "Contents/Resources/probe.txt"
    content.write_text("Original synthetic content")
    with patch.dict(os.environ, {"KERNPAD_SIGNING_IDENTITY": "-"}):
        support.sign_and_receipt(app, root)
    receipt = root / support.RECEIPT_NAME
    check(support.verify_receipt(app, receipt)["build"] == "1", "fresh local build accepted")
    original_requirement = support.signature(app)["requirement"]
    support.capture("/usr/bin/codesign", "--verify", "--strict", "-R=" + original_requirement, str(app))
    check(True, "codesign accepts the actual original designated requirement")
    original = receipt.read_text()
    info = plistlib.loads(metadata.read_bytes())
    info.update(CFBundleShortVersionString="999.0", CFBundleVersion="9999")
    metadata.write_bytes(plistlib.dumps(info))
    content.write_text("Harmless repacked content")
    entitlements = Path(support.__file__).parent / "Entitlements.plist"

    def resign(options="runtime", entitlement_file=entitlements):
        subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", "--options", options,
            "--entitlements", str(entitlement_file), str(app)], check=True, capture_output=True)

    resign()
    check(support.signature(app)["adhoc"], "repacked ad-hoc signature is structurally valid")
    rejects("repacked app against original designated requirement", lambda: support.capture(
        "/usr/bin/codesign", "--verify", "--strict", "-R=" + original_requirement, str(app)))
    rejects("repacked version 999 against local receipt", lambda: support.verify_receipt(app, receipt))
    rejects("missing build receipt", lambda: support.verify_receipt(app, root / "missing.json"))
    receipt.write_text(json.dumps({"format": 1, "bundleID": "other", "files": {}}))
    rejects("receipt from another bundle", lambda: support.verify_receipt(app, receipt))
    receipt.write_text(original)
    alias = root / "receipt-alias.json"
    alias.symlink_to(receipt)
    rejects("symbolic-link receipt", lambda: support.verify_receipt(app, alias))
    unsafe = root / "unsafe.plist"
    values = plistlib.loads(entitlements.read_bytes())
    values["com.apple.security.get-task-allow"] = True
    unsafe.write_bytes(plistlib.dumps(values))
    resign(entitlement_file=unsafe)
    rejects("debuggable app", lambda: support.signature(app))
    resign(options="0x0")
    rejects("missing Hardened Runtime", lambda: support.signature(app))
    signed = {"adhoc": False, "team": "EXAMPLE", "requirement": "trusted-installed-requirement"}
    candidate = {"adhoc": False, "team": "EXAMPLE", "requirement": "candidate-controlled-requirement"}
    with patch.object(support, "signature", side_effect=[signed, {"adhoc": True}]):
        rejects("signed app downgraded to ad-hoc", lambda: support.verify_continuity(Path("installed"), app))
    with patch.object(support, "signature", side_effect=[signed, candidate]), patch.object(support, "capture", return_value=(b"", b"")) as capture:
        support.verify_continuity(Path("installed"), app)
        check("-R=trusted-installed-requirement" in capture.call_args.args, "update uses installed trust anchor")
    with patch.object(support, "signature", side_effect=[signed, candidate]), patch.object(support, "capture", side_effect=subprocess.CalledProcessError(1, "codesign")):
        rejects("different signer", lambda: support.verify_continuity(Path("installed"), app))

# Exercise both rename migration and transaction rollback in disposable folders.
with tempfile.TemporaryDirectory(prefix="Kernpad-Install-Rollback-") as temporary:
    root=Path(temporary);source=root/"source.app";source.mkdir();(source/"marker").write_text("new")
    destination=root/"Kernpad.app";legacy=root/"Alternate.app"
    def copy(*args): shutil.copytree(args[1],args[2])
    def seeded(app,text): app.mkdir();(app/"marker").write_text(text)
    seeded(legacy,"legacy")
    with patch.object(installer,"run",side_effect=copy),patch.object(installer,"verify"),patch.object(installer,"verify_receipt"):
        installer.replace_app(source,destination,[legacy],root/"receipt")
    check((destination/"marker").read_text()=="new" and not legacy.exists(),"renamed install migrates the legacy app without leaving a duplicate")
    (destination/"marker").write_text("previous");seeded(legacy,"legacy")
    def fail_final(app):
        if app==destination: raise RuntimeError("Synthetic final verification failure")
    with patch.object(installer,"run",side_effect=copy),patch.object(installer,"verify",side_effect=fail_final),patch.object(installer,"verify_receipt"):
        rejects("invalid installed candidate",lambda:installer.replace_app(source,destination,[destination,legacy],root/"receipt"))
    check((destination/"marker").read_text()=="previous" and (legacy/"marker").read_text()=="legacy","failed install restores both old paths")
    check(not list(root.glob(".*.app")),"rollback removes staging files")
print(f"{count} build receipt / repack / signer-policy / install rollback checks passed")
