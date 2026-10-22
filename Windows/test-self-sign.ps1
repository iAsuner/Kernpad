param([string]$PublishDirectory = "$PSScriptRoot/Artifacts/Kernpad-1.0.0-win-x64")
$ErrorActionPreference = 'Stop'
# Run only on an expendable VM account. No certificate is added to a trust store.
$libraryRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Kernpad'
if (Test-Path -LiteralPath $libraryRoot) { throw 'Use a fresh disposable Windows account: an existing Kernpad library must not be used by this test' }
function Read-StarterNotes {
    try {
        $profile = Get-Content -LiteralPath (Join-Path $libraryRoot 'active.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $profileID = [guid]::Empty
        if (-not [guid]::TryParse([string]$profile, [ref]$profileID)) { return @() }
        $path = Join-Path $libraryRoot ('Libraries/' + $profileID.ToString('D') + '/notes.json')
        $notes = @(Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
        if ($notes.Count -ne 4) { return @() }
        foreach ($note in $notes) {
            if ($note.type -ne 'note' -or $note.id -notlike 'example-*' -or -not $note.name -or @($note.blocks).Count -eq 0) { return @() }
        }
        return $notes
    } catch { return @() } # The atomic startup write may not have completed yet.
}
$source = (Resolve-Path $PublishDirectory).Path
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('Kernpad-SelfSign-' + [guid]::NewGuid())
$installed = Join-Path $temporary 'Kernpad'
$certificate = $null
$process = $null
try {
    New-Item -ItemType Directory -Path $temporary | Out-Null
    Copy-Item -LiteralPath $source -Destination $installed -Recurse
    $executable = Join-Path $installed 'Kernpad.exe'
    $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=Kernpad Isolated Signing Test' -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddDays(1)
    Set-AuthenticodeSignature -LiteralPath $executable -Certificate $certificate -HashAlgorithm SHA256 | Out-Null
    $signature = Get-AuthenticodeSignature -LiteralPath $executable
    # Windows PowerShell can classify an untrusted root as UnknownError rather
    # than NotTrusted. Accept that specific chain failure, never arbitrary errors.
    $untrustedRoot = $signature.Status -eq 'UnknownError' -and $signature.StatusMessage -match 'root certificate.*not trusted'
    if ($signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint -or ($signature.Status -notin @('NotTrusted','Valid') -and -not $untrustedRoot)) { throw "Self-signature failed: $($signature.Status): $($signature.StatusMessage)" }
    Write-Output "Self-signature chain result: $($signature.Status): $($signature.StatusMessage)"
    # Change a byte within the first PE section, not unsigned overlay/padding.
    $tampered = Join-Path $temporary 'tampered.exe'
    $bytes = [IO.File]::ReadAllBytes($executable)
    $pe = [BitConverter]::ToInt32($bytes, 0x3c)
    $optionalSize = [BitConverter]::ToUInt16($bytes, $pe + 20)
    $raw = [BitConverter]::ToInt32($bytes, $pe + 24 + $optionalSize + 20)
    $bytes[$raw + 128] = $bytes[$raw + 128] -bxor 1
    [IO.File]::WriteAllBytes($tampered, $bytes)
    if ((Get-AuthenticodeSignature -LiteralPath $tampered).Status -ne 'HashMismatch') { throw 'Modified executable did not fail signature integrity verification' }
    $process = Start-Process -FilePath $executable -WorkingDirectory $installed -PassThru
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Milliseconds 250
        $process.Refresh()
        if ($process.HasExited) { throw 'Installed self-signed application exited before showing its window' }
    } while ($process.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
    if ($process.MainWindowHandle -eq 0 -or $process.MainWindowTitle -ne 'Kernpad') { throw 'Installed application did not show the Kernpad window' }
    # Quiet autosave intentionally has no visible Saved label. Require both
    # committed starter documents and their accessible navigation buttons.
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $editorReady = $false
    $deadline = (Get-Date).AddSeconds(60)
    do {
        $process.Refresh()
        if ($process.HasExited) { throw 'Installed application exited before editor readiness' }
        $windowElement = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
        # Enumerate the provider tree before reading Name. WebView2's UIA
        # provider may not satisfy a NameProperty FindFirst filter until its
        # accessibility subtree has been materialized.
        $elements = $windowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $visibleNames = @()
        foreach ($element in $elements) {
            try {
                if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and -not $element.Current.IsOffscreen) { $visibleNames += ([string]$element.Current.Name).Trim() }
            }
            catch [System.Windows.Automation.ElementNotAvailableException] { continue }
        }
        $starterNotes = @(Read-StarterNotes)
        $editorReady = $starterNotes.Count -eq 4 -and @($starterNotes | Where-Object { $_.name -notin $visibleNames }).Count -eq 0
        if (-not $editorReady) { Start-Sleep -Milliseconds 300 }
    } while (-not $editorReady -and (Get-Date) -lt $deadline)
    if (-not $editorReady) {
        $diagnostic = Join-Path $PSScriptRoot 'Artifacts/windows-installed-ui.json'
        $elements = $windowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $items = @([ordered]@{ title = $process.MainWindowTitle; help = $windowElement.Current.HelpText; count = $elements.Count })
        foreach ($element in $elements) { $items += [ordered]@{ name = $element.Current.Name; type = $element.Current.ControlType.ProgrammaticName; help = $element.Current.HelpText } }
        $items | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $diagnostic -Encoding utf8
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try { $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bitmap.Save((Join-Path $PSScriptRoot 'Artifacts/windows-installed-ui.png')) }
        finally { $graphics.Dispose(); $bitmap.Dispose() }
        throw 'Installed application did not expose its four persisted starter documents; isolated VM UI diagnostics saved'
    }
    if (-not $process.CloseMainWindow()) { throw 'Installed application rejected the normal window-close request' }
    # The application allows up to 20 seconds for its acknowledged save. Give
    # process shutdown a separate margin instead of racing that same deadline.
    if (-not $process.WaitForExit(40000)) {
        $process.Refresh()
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
        $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $items = @([ordered]@{ title = $process.MainWindowTitle; phase = 'normal-close'; count = $elements.Count })
        foreach ($element in $elements) { $items += [ordered]@{ name = $element.Current.Name; type = $element.Current.ControlType.ProgrammaticName } }
        $items | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'Artifacts/windows-installed-ui.json') -Encoding utf8
        Add-Type -AssemblyName System.Drawing, System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try { $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bitmap.Save((Join-Path $PSScriptRoot 'Artifacts/windows-installed-ui.png')) }
        finally { $graphics.Dispose(); $bitmap.Dispose() }
        throw 'Installed application did not exit within 40 seconds of normal close; isolated VM diagnostics saved'
    }
    if ($process.ExitCode -ne 0) { throw "Installed application closed with exit code $($process.ExitCode)" }
    $closedNotes = @(Read-StarterNotes)
    if ($closedNotes.Count -ne 4 -or (Compare-Object @($starterNotes.id) @($closedNotes.id))) { throw 'Starter documents were not preserved after normal close' }
    $result = [ordered]@{ syntheticAccount = $true; checks = 5; signed = $true; signatureStatus = [string]$signature.Status; trustStoreModified = $false; tamperRejected = $true; installedCopyLaunched = $true; starterDocumentsPersisted = $true; normalClose = $true; helloAuthenticationTested = $false; result = 'passed' }
    $output = Join-Path $PSScriptRoot 'Artifacts/windows-self-sign-result.json'
    $result | ConvertTo-Json | Set-Content -LiteralPath $output -Encoding utf8
    Write-Output '5 Windows self-signature, tamper rejection, installed launch, persisted starter documents and normal-close checks passed'
} finally {
    if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
    if ($certificate) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -DeleteKey -Force }
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}
