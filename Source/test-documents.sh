#!/bin/zsh
# WebKit, AVFoundation and print-service integration using synthetic fixtures only.
set -eu
task_source_dir="${0:A:h}"
task_project_dir="${task_source_dir:h}"
task_build_dir="$task_project_dir/Build"
mkdir -p "$task_build_dir/module-cache"
python3 "$task_source_dir/build-web.py"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/MediaAttachment.swift" "$task_source_dir/Tests/MediaTests.swift" -o "$task_build_dir/MediaTests"
"$task_build_dir/MediaTests" "$task_project_dir"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/PDFExporter.swift" "$task_source_dir/Tests/RichTextTests.swift" -o "$task_build_dir/RichTextTests"
"$task_build_dir/RichTextTests" "$task_project_dir"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/PDFExporter.swift" "$task_source_dir/Tests/AppEditorTests.swift" -o "$task_build_dir/AppEditorTests"
"$task_build_dir/AppEditorTests" "$task_project_dir"
