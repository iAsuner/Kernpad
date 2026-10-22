# Contributing to Kernpad

[简体中文](CONTRIBUTING.md)

Use issues for reproducible bugs and proposals, and pull requests for implementations. For substantial architecture or interaction changes, describe the concrete use case, expected behavior and scope first. Report vulnerabilities privately according to the [security policy](SECURITY.md).

## Environment

macOS development requires Apple Silicon, macOS 14+, Xcode Command Line Tools, Python 3.9+ and Node.js 22+. Windows development requires Windows 11, .NET 10 SDK, Python 3.9+, Node.js 22+ and WebView2 Runtime.

Edit shared UI source in `Source/Web/`, then run `python3 Source/build-web.py`. Do not commit the three generated Web files. The native hosts load local resources; serving the UI as a website is not a complete vault acceptance test.

## Validate changes

| Scope | Command |
| --- | --- |
| Shared models, behavior and copy | `python3 Source/test-web.py` |
| macOS crypto, storage, sessions and bridge | `zsh Source/test.sh` |
| Rich text, media, layout and PDF | `zsh Source/test-documents.sh` |
| macOS integration and signing | `zsh Source/build.sh` |
| Native Windows client | `powershell -File Windows/build.ps1` |
| Full Chinese and English Windows workflows | `dotnet run --project Windows/Kernpad.Smoke -- --workflows Windows/Artifacts/workflows` |
| Publication boundaries | `python3 Source/Tests/RepositoryTests.py` |

Record actual commands, platforms, results and gaps in the PR. System authentication is completed by a person; CI or a VM cannot establish physical hardware policy correctness. Use synthetic credentials, temporary libraries and isolated test apps.

For editing or persistence changes, cover typing, undo, failure/retry, navigation, locking and restart. For templates, cover design, save, application, Quick Paste and list mappings. For layout, check both languages, the minimum window width, long labels, keyboard operation and PDF.

## Code and data constraints

- Preserve availability checks and actual protected-key operations. Authentication booleans must not replace hardware protection.
- Keep summaries, individual details and session-ticket patches separate. Retain failed edits and release details only after a successful save.
- Format and identity changes require a complete migration design. Shipping code supports only the current Kernpad format.
- Explain the need, license and package impact of new dependencies and commit their lock files.
- Maintain Chinese and English copy separately. Avoid decorative middle-dot separators and strings assembled from disconnected phrases.
- Never commit apps, caches, logs, personal libraries, certificates, access tokens or real recovery keys.

## Audit the publication surface

Review and stage the intended files, then run:

```sh
python3 Source/check-repository.py
python3 Source/scan-secrets.py --gitleaks /path/to/gitleaks
python3 Source/export-source.py ../Kernpad-source
```

Use official Gitleaks 8.30.1 or newer. Default rules remain enabled; the only configured exception is an exact public RFC test seed in specified files. Do not exclude whole test directories. Matches are redacted. Review images manually; a passing scan does not prove absence of sensitive information.

The exporter copies only reviewed index content, excluding `.git`, untracked files and local conversion tools. It refuses existing destinations. Start a new repository from that directory without transferring development history. Recheck it with `python3 Source/check-repository.py --directory ../Kernpad-source`.

## Release

Run the platform tests and actual installation acceptance. Review third-party notices, signatures and SHA-256. Upload only intended application packages and checksums, checking for debug data, user libraries and signing keys. Enable GitHub private vulnerability reporting and branch protection, and confirm CI actually completed successfully. Missing or unstarted CI is not a pass.

A suitable repository description is “Local notes and password manager with rich text, Markdown, HTML, custom templates and PDF.” Relevant Topics include `password-manager`, `notes`, `markdown`, `rich-text`, `pdf`, `totp`, `offline`, `macos`, `windows`, `swift` and `wpf`.

Project code is MIT-licensed. Preserve third-party licenses and provenance when contributing; see [third-party notices](THIRD_PARTY_NOTICES.txt).
