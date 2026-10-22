# Isolated performance testing

[简体中文](README.md)

Drivers use the production native host and four synthetic examples to edit documents and open/close PDF preview. Every run creates a new temporary store. Drivers are excluded from shipping apps. Metric definitions appear below; results are generated locally in Build.

## Capture a baseline

Before editing, generate Web resources and save them. Existing baselines are never overwritten:

```sh
python3 Source/build-web.py
python3 Source/Performance/capture-baseline.py
```

Record the Git commit and file SHA-256 hashes with a baseline. Use a separate checkout to reproduce an older version without overwriting the active working directory.

## macOS

After changes and regression checks:

```sh
zsh Source/build.sh
python3 Source/Performance/build-mac.py before
python3 Source/Performance/build-mac.py after
python3 Source/Performance/measure-mac.py before 1
python3 Source/Performance/measure-mac.py after 1
python3 Source/Performance/measure-mac.py before 2
python3 Source/Performance/measure-mac.py after 2
```

Each run takes about 80 seconds. Separate bundle IDs drive the production `AppDelegate`. Do not rebuild a running test app or launch other WebKit apps during measurement. Inspect the reported process list: attribution includes the host and newly launched WebKit processes. Local compilation, GUI launch and process-statistics permissions are required.

Each run writes raw JSON samples, `.checks.json` functional results, a phase file and a log. Accept only exit code 0 with four notes retained and preview closed. Different run numbers retain separate evidence.

## Windows 11 ARM virtual machine

Install the .NET 10 SDK on the build host and WebView2 Runtime in the guest. Build both self-contained packages from the repository root:

```sh
python3 Source/Performance/build-windows.py before
python3 Source/Performance/build-windows.py after
```

Transfer `Build/performance/windows-before.zip` and `windows-after.zip` to the guest, extract into separate directories, then run sequentially in Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .\results
.\before\Kernpad.Performance.exe .\results\windows-before-1.json
.\before\Kernpad.Performance.exe .\results\windows-before-2.json
.\after\Kernpad.Performance.exe .\results\windows-after-1.json
.\after\Kernpad.Performance.exe .\results\windows-after-2.json
```

Every run uses a new temporary store and needs no authentication. Failures write the output path plus `.error`; do not count them as passes. JSON includes fixture checks, phase statistics and sampled process IDs. Avoid concurrent WebView2 apps or builds. For x64, change the publish RID to `win-x64` and rerun on the corresponding system; ARM64 results cannot be reused.

## Functional acceptance and interpretation

The workload is not a complete functional suite. Also run `Source/test.sh`, `Source/test-documents.sh` and the .NET core suite. On Windows, run `Kernpad.Smoke.exe` using synthetic files from `Source/Tests/Fixtures/` to validate native media and PDF. It checks that photographs and video posters actually decode, preventing missing content from looking like a performance win.

Mac reports physical footprint. Windows reports both Private Bytes and Working Set. CPU uses 100% for one core. Report both runs and their variation within each platform; do not select only the best result. Prefer serial host/guest measurement when reproducing CPU comparisons. Do not commit raw local logs, temporary stores or credential-bearing results.
