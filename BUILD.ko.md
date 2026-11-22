# 3.0.1 패처 빌드

이 문서는 공개된 3.0.1 소스로 `AppleMusicDownloader-Korean-Patch.exe`를 만드는 방법입니다. 빌드하지 않고 사용하려면 [3.0.1 릴리스](https://github.com/style850/apple-music-downloader-ko-patch/releases/tag/v3.0.1)에서 EXE를 받으세요. 이전 `patch-source/`와 r2 빌드 절차는 1.0.3-beta.4 전용 역사적 자료이며, 새 패처의 빌드 입력이 아닙니다.

## 빌드 입력

- `patcher/patcher.py`와 `patcher/archive.py`: Python 표준 라이브러리만 사용하는 패처 코드
- `patcher/korean-ui.js`: 기존 원본 화면 스크립트 끝에 붙는 한국어 UI 표시층
- `scripts/build-patcher.ps1`: 단일 EXE를 만드는 고정 빌드 스크립트
- Python 3.13: `C:\Users\Harmonix\AppData\Local\Programs\Python\Python313\python.exe`
- 이미 준비된 PyInstaller 캐시: `E:\EILVAR\Eilvar-Codex\.local\cache\pc-prep-python`

빌드 스크립트는 의존성을 내려받거나 설치하지 않습니다. 캐시에 PyInstaller가 없으면 실패하며, 별도 패키지 설치는 이 절차의 범위가 아닙니다.

## 빌드

PowerShell에서 저장소 루트로 이동한 뒤 실행합니다.

```powershell
Set-Location 'E:\EILVAR\apple-music-downloader-ko-patch'
.\scripts\build-patcher.ps1
```

완료되면 단일 실행 파일은 다음 위치에 생깁니다.

```text
.artifacts\release\3.0.1\AppleMusicDownloader-Korean-Patch.exe
```

스크립트는 이 EXE의 `--help` 실행과 SHA-256 출력을 확인합니다. 실제 설치본에 적용하거나 사용자 데이터를 변경하는 검사는 수행하지 않습니다.

버전은 `patcher/patcher.py`의 `VERSION`에서 읽으며 release/work/spec/dist를 버전별로 분리합니다. 같은 버전의 출력·PyInstaller work/spec 폴더가 이미 있으면 기존 결과를 덮어쓰지 않고 중단합니다. 새 빌드가 필요하면 검증이 끝난 해당 빌드 산출물만 별도로 보관하거나 정리한 후 다시 실행하세요.

## 실행 예

```powershell
.\.artifacts\release\3.0.1\AppleMusicDownloader-Korean-Patch.exe --help
.\.artifacts\release\3.0.1\AppleMusicDownloader-Korean-Patch.exe --check
.\.artifacts\release\3.0.1\AppleMusicDownloader-Korean-Patch.exe --check --install-dir 'C:\Users\사용자\AppData\Local\Programs\Apple Music Downloader Native'
```

인수 없이 실행하면 Tk 창으로 설치 경로를 선택해 적용 또는 복구를 확인합니다. 명령줄 모드에서는 `--check`, `--apply`, `--restore` 중 하나를 명시해야 합니다.

## 역사적 r2 소스

`patch-source/`는 원본 커밋 `6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786`에 덮어쓰는 r2 변경 파일입니다. 원본 전체와 런타임은 포함하지 않습니다. r2를 재현해야 하는 경우에만 이전 절차와 원본 라이선스·고지를 참고하세요. 새 패처는 원본 Go 서비스나 Node 의존성을 다시 빌드하지 않습니다.
