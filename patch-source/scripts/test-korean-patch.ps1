param(
    [string]$PatchExe = (Join-Path $PSScriptRoot '../.artifacts/release/AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch.exe'),
    [string]$InstalledRoot = (Join-Path $env:LOCALAPPDATA 'Programs/Apple Music Downloader Native')
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$scratch = Join-Path $project '.artifacts/patch-smoke-final'
if (Test-Path -LiteralPath $scratch) { throw 'Smoke directory already exists; retain or remove it explicitly before rerunning.' }
$install = Join-Path $scratch 'install'
$profile = Join-Path $scratch 'profile'
$runtime = Join-Path $profile 'native-v2/runtime'
$manifest = Get-Content -LiteralPath (Join-Path $project 'apple-music-downloader/cmd/amdl-korean-patch/payload/manifest.json') -Raw | ConvertFrom-Json
$null = New-Item -ItemType Directory -Path $runtime -Force
foreach ($file in $manifest.files) {
    $target = Join-Path $install $file.path
    $null = New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force
    Copy-Item -LiteralPath (Join-Path $InstalledRoot $file.path) -Destination $target
}
$acl = Get-Acl -LiteralPath $runtime
$everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
$rule = [System.Security.AccessControl.FileSystemAccessRule]::new($everyone,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $runtime -AclObject $acl
[IO.File]::WriteAllText((Join-Path $runtime 'data.img'), 'synthetic image fixture; no account data')
[IO.File]::WriteAllText((Join-Path $runtime 'control.secret'), 'synthetic-test-secret-only')
$before = @{}
foreach ($name in @('data.img','control.secret')) { $before[$name] = (Get-FileHash -LiteralPath (Join-Path $runtime $name)).Hash }
$steps = [System.Collections.Generic.List[object]]::new()
function Invoke-Patch([string]$Mode, [int]$Expected = 0) {
    $index = $steps.Count
    $out = Join-Path $scratch "$index.stdout.txt"
    $err = Join-Path $scratch "$index.stderr.txt"
    $arguments = @($Mode, '--install-dir', ('"'+$install+'"'), '--profile-dir', ('"'+$profile+'"'))
    $process = Start-Process -FilePath $PatchExe -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    if ($process.ExitCode -ne $Expected) { throw "Unexpected exit $($process.ExitCode): $(Get-Content -LiteralPath $err -Raw)" }
    $steps.Add(@{mode=$Mode; exitCode=$process.ExitCode; output=(Get-Content -LiteralPath $out -Raw)})
}
function Assert-Hashes([string]$Field) {
    foreach ($file in $manifest.files) {
        if ((Get-FileHash -LiteralPath (Join-Path $install $file.path)).Hash.ToLowerInvariant() -ne $file.$Field) { throw "Wrong $Field for $($file.path)" }
    }
}
Invoke-Patch '--check'
Assert-Hashes 'beforeSHA256'
Invoke-Patch '--apply'
Assert-Hashes 'afterSHA256'
Invoke-Patch '--check'
if (($steps[$steps.Count-1].output | ConvertFrom-Json).state -ne 'patched') { throw 'Patched state missing' }
$currentSID = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($name in @('', 'data.img','control.secret')) {
    $target = if ($name) { Join-Path $runtime $name } else { $runtime }
    $stateAcl = Get-Acl -LiteralPath $target
    if (-not $stateAcl.AreAccessRulesProtected) { throw 'State ACL still inherits permissions' }
    foreach ($entry in $stateAcl.Access) {
        $sid = $entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        if ($sid -notin @($currentSID,'S-1-5-18','S-1-5-32-544')) { throw "Unexpected state reader: $sid" }
    }
}
Invoke-Patch '--apply'
Assert-Hashes 'afterSHA256'
Invoke-Patch '--restore'
Assert-Hashes 'beforeSHA256'
Invoke-Patch '--check'
if (($steps[$steps.Count-1].output | ConvertFrom-Json).state -ne 'original') { throw 'Original state missing' }
foreach ($name in @('data.img','control.secret')) {
    if ((Get-FileHash -LiteralPath (Join-Path $runtime $name)).Hash -ne $before[$name]) { throw 'Synthetic session bytes changed' }
    if (-not (Get-Acl -LiteralPath (Join-Path $runtime $name)).AreAccessRulesProtected) { throw 'Restore weakened ACL' }
}
$asar = Join-Path $install 'resources/app.asar'
$fileStream = [IO.File]::OpenWrite($asar)
try { $fileStream.WriteByte(255) } finally { $fileStream.Dispose() }
Invoke-Patch '--apply' 1
Copy-Item -LiteralPath (Join-Path $InstalledRoot 'resources/app.asar') -Destination $asar -Force
Assert-Hashes 'beforeSHA256'
foreach ($file in $manifest.files) {
    if ((Get-FileHash -LiteralPath (Join-Path $InstalledRoot $file.path)).Hash.ToLowerInvariant() -ne $file.beforeSHA256) { throw 'Real installation changed' }
}
$receipt = @{passed=$true; steps=$steps; syntheticSessionBytesPreserved=$true; protectedDacl=$true; restoreKeepsDacl=$true; originalInstallationUnchanged=$true; patchSHA256=(Get-FileHash -LiteralPath $PatchExe).Hash.ToLowerInvariant()}
$receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $project '.artifacts/patch-exe-smoke.json') -Encoding utf8
Write-Output 'PASS: EXE apply, repeat apply, restore, wrong-version rejection, session preservation, protected DACL and untouched real installation.'
