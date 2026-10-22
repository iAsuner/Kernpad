#!/bin/zsh
set -eu
task_source_dir="${0:A:h}"
task_output_dir="${task_source_dir:h}"
task_build_dir="${KERNPAD_BUILD_DIR:-$task_output_dir/Build}"
task_app_dir="$task_output_dir/Kernpad.app"
[[ ! -L "$task_app_dir" ]] || { print -u2 "Refusing symbolic-link app output"; exit 1; }
rm -rf "$task_app_dir"
mkdir -p "$task_build_dir/module-cache" "$task_app_dir/Contents/MacOS" "$task_app_dir/Contents/Resources/Web" "$task_build_dir/Kernpad.iconset"
# An interrupted or failed rebuild must not leave an installable old receipt.
rm -f "$task_build_dir/Kernpad-build-receipt.json"
python3 "$task_source_dir/build-web.py"
node --check "$task_source_dir/Web/app.js"
xcrun swiftc -swift-version 5 -O -module-cache-path "$task_build_dir/module-cache" "$task_source_dir/make-icon.swift" -o "$task_build_dir/make-icon"
"$task_build_dir/make-icon" "$task_build_dir/Kernpad.iconset" "$task_source_dir/Web/logo.svg"
python3 "$task_source_dir/make-windows-icon.py" "$task_build_dir/Kernpad.iconset" "$task_output_dir/Windows/Kernpad.Windows/Kernpad.ico"
iconutil -c icns "$task_build_dir/Kernpad.iconset" -o "$task_app_dir/Contents/Resources/Kernpad.icns"
cp "$task_build_dir/Kernpad.iconset/icon_512x512@2x.png" "$task_output_dir/Kernpad-logo.png"
cp "$task_build_dir/Kernpad.iconset/icon_256x256.png" "$task_output_dir/Kernpad-icon-256.png"
cp "$task_source_dir/Web/logo.svg" "$task_output_dir/Kernpad-logo.svg"
xcrun swiftc -swift-version 5 -O -target arm64-apple-macos14.0 -module-cache-path "$task_build_dir/module-cache" \
  "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/MediaAttachment.swift" "$task_source_dir/PDFExporter.swift" "$task_source_dir/main.swift" -o "$task_app_dir/Contents/MacOS/Kernpad"
cp "$task_source_dir/Info.plist" "$task_app_dir/Contents/Info.plist"
cp "$task_output_dir/LICENSE" "$task_output_dir/THIRD_PARTY_NOTICES.txt" "$task_app_dir/Contents/Resources/"
for task_file in index.html app.js app.css lucide.min.js logo.svg LUCIDE-LICENSE.txt PLATFORM-ICONS-LICENSE.txt; do cp "$task_source_dir/Web/$task_file" "$task_app_dir/Contents/Resources/Web/"; done
python3 "$task_source_dir/build_support.py" "$task_app_dir" "$task_build_dir"
printf 'Built: %s\n' "$task_app_dir"
