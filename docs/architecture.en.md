# Kernpad architecture

[简体中文](architecture.zh.md)　[Project home](../README.en.md)

## Native hosts and shared interface

The macOS host uses Swift, AppKit and WKWebView. Windows uses C#, WPF and WebView2. Both share the editing, template, layout and localization implementation in `Source/Web`. A restricted command bridge delegates files, system authentication, clipboard, media and PDF to each native host. Windows does not simulate macOS authentication.

`Source/build-web.py` assembles source into local resources included at build time. Runtime operation does not depend on remote scripts or a cloud service. External navigation, imported HTML and media pass through native and shared-layer restrictions.

## Storage and keys

Current outer envelopes use `kernpad-vault` or `kernpad-backup`, version 3, AES-256-GCM and HKDF-SHA256 recovery derivation. Earlier versions and password-derived slots are rejected. Each vault has an independent root key; record key derivation and authenticated data bind record identity and purpose. Writes use fresh random nonces.

The encrypted root archive contains summaries, encrypted bodies and template archives. Lists read the index and request previews for at most 40 IDs. Opening a detail decrypts the required body. Previews never return passwords, bodies or OTP seeds. Backup and restore re-encrypt records individually without sending whole-library plaintext to the Web interface.

On macOS, the device token contains the hardware-wrapped private-key representation and an encrypted root key. Private-key operations require user presence; device material is excluded from backups. Locking invalidates authentication contexts, session tickets and detail caches. Recovery keys stay within the local recovery workflow and must never become logs or examples.

Ordinary notes, public template structure and explicitly public OTP seeds have plaintext semantics. Vault media is encrypted with its record; note media follows its note. Temporary-note expiry differs from normal Trash behavior, as described in the user guide.

## Editing and persistence

Records and components have stable IDs; import keys map fields. Saving a template retains ordinary content and clears credentials by default. Rule lists connect components, Quick Paste and vault list presentation.

Web saves carry session tickets, editing leases for opened details and record patches. A summary cannot replace an unopened body; permanent deletion requires explicit IDs. Native validation precedes atomic file replacement. Details are released only after acknowledgment, and failures retain input.

Autosave debounces and queues writes, without flashing success for short writes. Manual mode tracks differences from saved content and offers Save, Discard or Cancel during navigation. Security locking ends access first, stashing uncommitted private edits as separately encrypted drafts. After unlocking, restoration checks whether the original changed. Drafts are not backed up.

## Layout, media and PDF

The editor represents layout with a 12-unit grid, start positions, row spans and background-height settings. Dropped media passes type, size and decoding checks before joining an existing or new component. Media URLs are created on demand and released with record details.

PDF preview and export share the content snapshot, scale conversion and pagination rules. Video becomes a poster, and secrets remain masked. macOS uses a separate restricted WebKit renderer and native export; Windows uses WebView2. Preview zoom does not alter output dimensions or commit unsaved edits.

## Validation boundaries

| Layer | Coverage |
| --- | --- |
| Shared models | Shortcuts, import rules, templates, selection, undo, save ordering and session cleanup |
| Native storage | Tamper rejection, encryption, tickets, summary patches, drafts, backup and cross-platform interoperability |
| Native UI | WebKit / WebView2, media, clipboard, pagination and Chinese/English workflows |
| Signing and installation | Build receipts, signing continuity, replacement rollback and isolated Windows self-signing acceptance |
| Manual acceptance | Keyboard and pointer use, actual system authentication, readability and complete workflows |

See [Contributing](../CONTRIBUTING.en.md) for commands. Automated checks do not establish physical hardware authentication correctness or replace an independent audit. The [security policy](../SECURITY.md) describes Windows Hello physical-device acceptance and whole-library rollback limitations.
