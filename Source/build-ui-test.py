#!/usr/bin/env python3
"""Copy the built app into an isolated sandbox for synthetic UI checks."""
from pathlib import Path
import plistlib
import subprocess
import shutil
import sys
import argparse
import uuid

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group()
mode.add_argument("--showcase", action="store_true", help="Create a second isolated app for public example screenshots")
mode.add_argument("--scenarios", action="store_true", help="Create an isolated full-flow acceptance app with a local recovery fixture")
parser.add_argument("--showcase-locale", choices=["zh", "en"], default="zh", help="Language for a fresh, isolated screenshot library")
parser.add_argument("--fresh", action="store_true", help="Create a fresh synthetic scenario or showcase store without removing earlier test data")
args = parser.parse_args()
if args.fresh and not (args.scenarios or args.showcase):
    parser.error("--fresh requires --scenarios or --showcase")

project = Path(__file__).resolve().parent.parent
app = project / ("Build/KernpadScenarios.app" if args.scenarios else "Build/KernpadShowcase.app" if args.showcase else "Build/KernpadUX.app")
previous_plist = app / "Contents/Info.plist"
previous_info = plistlib.loads(previous_plist.read_bytes()) if previous_plist.exists() else {}
subprocess.run(["/usr/bin/ditto", str(project / "Kernpad.app"), str(app)], check=True)
subprocess.run([sys.executable, str(project / "Source/build-web.py")], check=True)
for name in ["index.html", "app.js", "app.css", "lucide.min.js", "logo.svg", "LUCIDE-LICENSE.txt", "PLATFORM-ICONS-LICENSE.txt"]:
    shutil.copy2(project / "Source/Web" / name, app / "Contents/Resources/Web" / name)
plist = app / "Contents/Info.plist"
info = plistlib.loads(plist.read_bytes())
info.update(CFBundleIdentifier="app.kernpad.acceptance.showcase" if args.showcase else "app.kernpad.acceptance.ux", CFBundleName="Kernpad 展示测试" if args.showcase else "Kernpad 操作测试", CFBundleDisplayName="Kernpad 展示测试" if args.showcase else "Kernpad 操作测试")
if args.scenarios:
    info.update(CFBundleIdentifier="app.kernpad.acceptance.scenarios", CFBundleName="Kernpad 全流程测试", CFBundleDisplayName="Kernpad 全流程测试")
    previous_name = previous_info.get("KernpadUITestStoreName", "")
    name = previous_name if not args.fresh and previous_name.startswith("Kernpad-UX-Audit-Scenarios-") and "/" not in previous_name else "Kernpad-UX-Audit-Scenarios-" + str(uuid.uuid4())
    info["KernpadUITestStoreName"] = name
    import json
    scenario_root = Path.home() / "Library/Containers/app.kernpad.acceptance.scenarios/Data/tmp" / name
    (project / "Build/scenario-local-paths.json").write_text(json.dumps({"root": str(scenario_root), "keyFile": str(scenario_root / "test-only.recovery")}))
    print("Synthetic fixture paths saved in ignored Build/scenario-local-paths.json; recovery key not printed.")
if args.showcase:
    previous_name = previous_info.get("KernpadUITestStoreName", "")
    reuse = not args.fresh and previous_info.get("KernpadShowcaseLocale") == args.showcase_locale and previous_name.startswith("Kernpad-UX-Audit-Showcase-") and "/" not in previous_name
    info["KernpadUITestStoreName"] = previous_name if reuse else "Kernpad-UX-Audit-Showcase-" + str(uuid.uuid4())
    info["KernpadShowcaseLocale"] = args.showcase_locale
    import json
    showcase_root = Path.home() / "Library/Containers/app.kernpad.acceptance.showcase/Data/tmp" / info["KernpadUITestStoreName"]
    (project / "Build/showcase-local-paths.json").write_text(json.dumps({"root": str(showcase_root), "keyFile": str(showcase_root / "test-only.recovery")}))
plist.write_bytes(plistlib.dumps(info))
subprocess.run(["/usr/bin/xcrun", "swiftc", "-swift-version", "5", "-O", "-D", "KERNPAD_UI_TEST", *(["-D", "KERNPAD_SHOWCASE"] if args.showcase else []), "-target", "arm64-apple-macos14.0", "-module-cache-path", str(project / "Build/module-cache"),
                *[str(project / "Source" / name) for name in ["VaultCrypto.swift", "DeviceUnlock.swift", "VaultStore.swift", "Tests/TestVault.swift", "Tests/UIFixture.swift", "Tests/ScenarioFixture.swift", "MediaAttachment.swift", "PDFExporter.swift", "main.swift"]],
                *([str(project / "Source/Tests/ShowcaseFixture.swift")] if args.showcase else []),
                "-o", str(app / "Contents/MacOS/Kernpad")], check=True)
subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", "--options", "runtime", "--entitlements", str(project / "Source/Entitlements.plist"), str(app)], check=True)
subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)], check=True)
print(f"Isolated UI app: {app}")
