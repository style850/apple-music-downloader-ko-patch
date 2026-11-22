[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$python = 'C:\Users\Harmonix\AppData\Local\Programs\Python\Python313\python.exe'
$pyInstallerCache = 'E:\EILVAR\Eilvar-Codex\.local\cache\pc-prep-python'
$patcherDirectory = Join-Path $repositoryRoot 'patcher'
$entryPoint = Join-Path $patcherDirectory 'patcher.py'
$overlay = Join-Path $patcherDirectory 'korean-ui.js'
$artifactRoot = Join-Path $repositoryRoot '.artifacts'
$sourceVersion = [regex]::Match((Get-Content -LiteralPath $entryPoint -Raw), "(?m)^VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'\r?$").Groups[1].Value
if (-not $sourceVersion) { throw '패처 버전을 확인하지 못했습니다.' }
$releaseDirectory = Join-Path $artifactRoot "release/$sourceVersion"
$output = Join-Path $releaseDirectory 'AppleMusicDownloader-Korean-Patch.exe'
$workDirectory = Join-Path $artifactRoot "build/patcher-$sourceVersion-work"
$specDirectory = Join-Path $artifactRoot "build/patcher-$sourceVersion-spec"
$distDirectory = Join-Path $artifactRoot "build/patcher-$sourceVersion-dist"

foreach ($path in @($python, $pyInstallerCache, $entryPoint, $overlay)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "빌드 입력을 찾지 못했습니다: $path"
    }
}

foreach ($path in @($output, $workDirectory, $specDirectory, $distDirectory)) {
    if (Test-Path -LiteralPath $path) {
        throw "기존 빌드 결과를 덮어쓰지 않습니다: $path"
    }
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $workDirectory) -Force | Out-Null

$previousPythonPath = $env:PYTHONPATH
$previousInstallerCache = $env:PYINSTALLER_CONFIG_DIR
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
try {
    $env:PYINSTALLER_CONFIG_DIR = Join-Path $artifactRoot 'pyinstaller-cache'
    $env:TEMP = Join-Path $artifactRoot 'tmp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    $env:PYTHONPATH = if ([string]::IsNullOrWhiteSpace($previousPythonPath)) {
        $pyInstallerCache
    } else {
        "$pyInstallerCache;$previousPythonPath"
    }

    & $python -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --console `
        --name 'AppleMusicDownloader-Korean-Patch' `
        --paths $patcherDirectory `
        --add-data "$overlay;." `
        --distpath $distDirectory `
        --workpath $workDirectory `
        --specpath $specDirectory `
        $entryPoint
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller가 종료 코드 $LASTEXITCODE 로 실패했습니다."
    }
} finally {
    $env:PYTHONPATH = $previousPythonPath
    $env:PYINSTALLER_CONFIG_DIR = $previousInstallerCache
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
}

$builtExecutable = Join-Path $distDirectory 'AppleMusicDownloader-Korean-Patch.exe'
if (-not (Test-Path -LiteralPath $builtExecutable -PathType Leaf)) {
    throw "PyInstaller 출력 파일을 찾지 못했습니다: $builtExecutable"
}

if (Test-Path -LiteralPath $output) {
    throw "기존 빌드 결과를 덮어쓰지 않습니다: $output"
}
Copy-Item -LiteralPath $builtExecutable -Destination $output
& $output --help
if ($LASTEXITCODE -ne 0) {
    throw "빌드된 EXE의 --help 검사가 종료 코드 $LASTEXITCODE 로 실패했습니다."
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash.ToLowerInvariant()
Write-Host "완료: $output"
Write-Host "SHA-256: $hash"
