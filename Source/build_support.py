#!/usr/bin/env python3
"""Local signing and build receipts. A receipt trusts this checkout, not a publisher."""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import subprocess
import sys

RECEIPT_NAME = "Kernpad-build-receipt.json"
BUNDLE_ID = "app.kernpad.desktop"
UNSAFE_ENTITLEMENTS = {
    "com.apple.security.get-task-allow", "get-task-allow",
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.cs.allow-dyld-environment-variables",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.allow-jit",
}


def capture(*args):
    result = subprocess.run(args, check=True, capture_output=True)
    return result.stdout, result.stderr


def signature(app):
    _, details = capture("/usr/bin/codesign", "-d", "--verbose=4", str(app))
    text = details.decode()
    if "runtime" not in next((line for line in text.splitlines() if line.startswith("CodeDirectory ")), ""):
        raise RuntimeError("Hardened Runtime is required")
    output, errors = capture("/usr/bin/codesign", "-d", "--entitlements", ":-", str(app))
    xml = output if b"<plist" in output else errors
    start = xml.find(b"<?xml")
    if start < 0:
        start = xml.find(b"<plist")
    end = xml.find(b"</plist>")
    if start < 0 or end < 0:
        raise RuntimeError("Missing app entitlements")
    entitlements = plistlib.loads(xml[start:end + len(b"</plist>")])
    if entitlements.get("com.apple.security.app-sandbox") is not True:
        raise RuntimeError("App Sandbox is required")
    if any(entitlements.get(key) for key in UNSAFE_ENTITLEMENTS):
        raise RuntimeError("Refusing debugging or code-injection entitlements")
    output, errors = capture("/usr/bin/codesign", "-d", "-r-", str(app))
    requirements = (output + errors).decode()
    requirement = next((line.split("=>", 1)[1].strip() for line in requirements.splitlines() if line.lstrip("# ").startswith("designated =>")), None)
    if not requirement:
        raise RuntimeError("Missing designated signing requirement")
    team = next((line.split("=", 1)[1] for line in text.splitlines() if line.startswith("TeamIdentifier=")), "not set")
    return {"adhoc": "Signature=adhoc" in text, "team": team, "requirement": requirement}


def bundle_files(app):
    files = {}
    for path in sorted(app.rglob("*")):
        if path.is_symlink():
            raise RuntimeError("Symbolic links are not supported in this standalone app")
        if path.is_file():
            files[path.relative_to(app).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    if not files:
        raise RuntimeError("Empty app bundle")
    return files


def verify_receipt(app, receipt_path):
    if receipt_path.is_symlink():
        raise RuntimeError("Refusing symbolic-link build receipt")
    try:
        receipt = json.loads(receipt_path.read_text())
    except (OSError, ValueError) as error:
        raise RuntimeError("Missing local build receipt; run zsh Source/build.sh first") from error
    if receipt.get("format") != 1 or receipt.get("bundleID") != BUNDLE_ID:
        raise RuntimeError("Invalid local build receipt")
    if receipt.get("files") != bundle_files(app) or receipt.get("signing") != signature(app):
        raise RuntimeError("App differs from the local build receipt; rebuild from trusted source")
    return receipt


def verify_continuity(installed, candidate):
    previous = signature(installed)
    if previous["adhoc"]:
        return
    current = signature(candidate)
    if current["adhoc"]:
        raise RuntimeError("Refusing to replace a signed app with an ad-hoc build")
    # This is the installed app's requirement, never one supplied by the candidate.
    capture("/usr/bin/codesign", "--verify", "--strict", "-R=" + previous["requirement"], str(candidate))


def sign_and_receipt(app, build_dir):
    identity = os.environ.get("KERNPAD_SIGNING_IDENTITY", "-")
    if not identity.strip():
        raise RuntimeError("KERNPAD_SIGNING_IDENTITY must be a signing identity or '-'")
    command = ["/usr/bin/codesign", "--force", "--sign", identity, "--options", "runtime",
               "--entitlements", str(Path(__file__).parent / "Entitlements.plist")]
    if identity != "-" and os.environ.get("KERNPAD_SIGN_TIMESTAMP", "auto") != "none":
        command.append("--timestamp")
    subprocess.run(command + [str(app)], check=True)
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != BUNDLE_ID:
        raise RuntimeError("Unexpected bundle identity")
    receipt = {"format": 1, "bundleID": BUNDLE_ID, "version": info["CFBundleShortVersionString"],
               "build": info["CFBundleVersion"], "signing": signature(app), "files": bundle_files(app)}
    target = build_dir / RECEIPT_NAME
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    temporary.chmod(0o600)
    temporary.replace(target)
    print("Signing:", "ad-hoc (local integrity only)" if receipt["signing"]["adhoc"] else receipt["signing"]["team"])
    print("Build receipt:", target)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_support.py APP BUILD_DIRECTORY")
    sign_and_receipt(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
