param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Push-Location $project
$staging = $null
try {
    python Source/build-web.py
    if ($LASTEXITCODE -ne 0) { throw 'Web generation failed' }
    if (-not $SkipTests) {
        python Source/test-web.py
        if ($LASTEXITCODE -ne 0) { throw 'Portable tests failed' }
        dotnet run --project Windows/Kernpad.Tests/Kernpad.Tests.csproj -- Source/Tests/Fixtures/interop-v3-backup.json Windows/Artifacts
        if ($LASTEXITCODE -ne 0) { throw 'Native storage tests failed' }
    }
    $artifacts = Join-Path $PSScriptRoot 'Artifacts'
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    $packageName = 'Kernpad-1.0.0-win-x64'
    $staging = Join-Path $artifacts ('publish-' + [guid]::NewGuid().ToString('N'))
    $output = Join-Path $staging $packageName
    $destination = Join-Path $artifacts $packageName
    $archive = Join-Path $artifacts ($packageName + '.zip')
    # Publish into a new directory so stale files cannot enter the release.
    dotnet publish Windows/Kernpad.Windows/Kernpad.Windows.csproj -c Release -r win-x64 --self-contained true -p:DebugSymbols=false -p:DebugType=None -o $output
    if ($LASTEXITCODE -ne 0) { throw 'Windows publish failed' }
    Get-ChildItem -LiteralPath $output -Filter '*.pdb' -Recurse -File | Remove-Item -Force
    if (Test-Path -LiteralPath $destination) {
        if ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked package directory' }
        Remove-Item -LiteralPath $destination -Recurse -Force
    }
    Move-Item -LiteralPath $output -Destination $destination
    Compress-Archive -LiteralPath $destination -DestinationPath $archive -Force
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $artifacts 'SHA256SUMS.txt'), "$hash  $packageName.zip`n", [Text.Encoding]::ASCII)
} finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Pop-Location
}
