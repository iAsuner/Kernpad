#!/bin/zsh
# Build a shareable app archive from the current source. Does not install or sign
# with a third party's identity; KERNPAD_SIGNING_IDENTITY is caller-controlled.
set -eu
task_source_dir="${0:A:h}"
task_project_dir="${task_source_dir:h}"
task_build_dir="${KERNPAD_BUILD_DIR:-$task_project_dir/Build}"
zsh "$task_source_dir/test.sh"
zsh "$task_source_dir/build.sh"
task_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$task_source_dir/Info.plist")"
task_archive="$task_build_dir/Kernpad-$task_version-arm64.zip"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$task_project_dir/Kernpad.app" "$task_archive"
(cd "$task_build_dir" && /usr/bin/shasum -a 256 "${task_archive:t}" > SHA256SUMS.txt)
printf 'Packaged: %s\n' "$task_archive"
