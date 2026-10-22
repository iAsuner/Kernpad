#!/usr/bin/env python3
"""Replace the installed application with the verified local build.

Quit Kernpad windows normally first. Never accesses vault data.
"""
from pathlib import Path
import os
import plistlib
import shutil
import struct
import subprocess
import uuid
from build_support import RECEIPT_NAME, signature, verify_continuity, verify_receipt


def run(*args):
    subprocess.run(args, check=True)


def verify(app):
    if app.is_symlink():
        raise RuntimeError(f"Refusing symbolic-link app: {app}")
    with (app / "Contents/Info.plist").open("rb") as file:
        info = plistlib.load(file)
    if info.get("CFBundleIdentifier") != "app.kernpad.desktop":
        raise RuntimeError(f"Unexpected bundle identifier: {app}")
    name = info.get("CFBundleIconFile", "")
    if not name or Path(name).name != name:
        raise RuntimeError(f"Missing or invalid app icon reference: {app}")
    icon = app / "Contents/Resources" / (name if name.endswith(".icns") else name + ".icns")
    data = icon.read_bytes()
    if len(data) < 16 or data[:4] != b"icns" or struct.unpack(">I", data[4:8])[0] != len(data):
        raise RuntimeError(f"Invalid ICNS resource: {icon}")
    run("/usr/bin/codesign", "--verify", "--deep", "--strict", str(app))
    signature(app)
    return info


def refresh_registration(app):
    # Register the final path after the staged app has been renamed. Finder can
    # otherwise retain the generic icon it cached while replacement was underway.
    os.utime(app, None)
    registrar = Path("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
    if registrar.is_file():
        run(str(registrar), "-f", str(app))


def replace_app(source, destination, installed, receipt_path):
    token = uuid.uuid4().hex
    stage = destination.with_name(f".Kernpad-stage-{token}.app")
    previous = [(app, app.with_name(f".{app.stem}-previous-{token}.app")) for app in installed]
    moved = []
    try:
        run("/usr/bin/ditto", str(source), str(stage))
        verify(stage)
        verify_receipt(stage, receipt_path)
        try:
            for app, backup in previous:
                os.rename(app, backup)
                moved.append((app, backup))
            os.rename(stage, destination)
            verify(destination)
            verify_receipt(destination, receipt_path)
        except Exception:
            if destination.exists() and not stage.exists():
                os.rename(destination, stage)
            for app, backup in reversed(moved):
                os.rename(backup, app)
            raise
        for _, backup in moved:
            shutil.rmtree(backup)
    finally:
        if stage.exists():
            shutil.rmtree(stage)

def main():
    project = Path(__file__).resolve().parent.parent
    source = project / "Kernpad.app"
    destination = Path("/Applications/Kernpad.app")
    info = verify(source)
    receipt_path = Path(os.environ.get("KERNPAD_BUILD_DIR", str(project / "Build"))) / RECEIPT_NAME
    verify_receipt(source, receipt_path)
    for executable in ("Kernpad",):
        state = subprocess.run(["/usr/bin/pgrep", "-x", executable], capture_output=True)
        if state.returncode != 1:
            raise RuntimeError("Quit Kernpad normally before installing (or check process-list permissions).")
    installed = [destination] if destination.exists() else []
    for app in installed:
        installed_info = verify(app)
        verify_continuity(app, source)
        if int(info["CFBundleVersion"]) < int(installed_info["CFBundleVersion"]):
            raise RuntimeError("Refusing an accidental application downgrade")
    replace_app(source, destination, installed, receipt_path)
    refresh_registration(destination)
    print(f"Installed Kernpad {info['CFBundleShortVersionString']}: {destination}")


if __name__ == "__main__":
    main()
