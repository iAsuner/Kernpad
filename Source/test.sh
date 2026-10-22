#!/bin/zsh
set -eu
task_source_dir="${0:A:h}"
task_build_dir="${KERNPAD_BUILD_DIR:-${task_source_dir:h}/Build}"
mkdir -p "$task_build_dir/module-cache"
python3 "$task_source_dir/test-web.py" "$task_build_dir/schema-fixture.json"
python3 "$task_source_dir/Tests/BuildSecurityTests.py"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/Tests.swift" -o "$task_build_dir/KernpadTests"
"$task_build_dir/KernpadTests" "$task_build_dir/schema-fixture.json"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/DeviceUnlockTests.swift" -o "$task_build_dir/DeviceUnlockTests"
"$task_build_dir/DeviceUnlockTests"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/PasswordlessTests.swift" -o "$task_build_dir/PasswordlessTests"
"$task_build_dir/PasswordlessTests"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/SessionTests.swift" -o "$task_build_dir/SessionTests"
"$task_build_dir/SessionTests"
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/SecurityAuditTests.swift" -o "$task_build_dir/SecurityAuditTests"
"$task_build_dir/SecurityAuditTests"
xcrun swiftc -swift-version 5 -O -parse-as-library -D KERNPAD_AUTH_TEST -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/MediaAttachment.swift" "$task_source_dir/PDFExporter.swift" "$task_source_dir/main.swift" "$task_source_dir/Tests/NativeAuthTests.swift" -o "$task_build_dir/NativeAuthTests"
"$task_build_dir/NativeAuthTests"
xcrun swiftc -swift-version 5 -O -parse-as-library -D KERNPAD_RECORD_TEST -module-cache-path "$task_build_dir/module-cache" \
 "$task_source_dir/VaultCrypto.swift" "$task_source_dir/DeviceUnlock.swift" "$task_source_dir/VaultStore.swift" "$task_source_dir/Tests/TestVault.swift" "$task_source_dir/Tests/RecordStorageTests.swift" -o "$task_build_dir/RecordStorageTests"
"$task_build_dir/RecordStorageTests"
node --check "$task_source_dir/Web/app.js"
