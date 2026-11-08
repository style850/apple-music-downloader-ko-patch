# 소스 구성과 빌드

이 저장소의 `patch-source/`는 원본 커밋 `6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786`에 덮어쓸 변경 파일만 포함합니다. 원본 전체와 런타임은 포함하지 않습니다. GitHub의 **Code → Download ZIP** 또는 릴리스의 `-Source.zip`으로 공개 소스를 받을 수 있습니다.

## 원본 소스 준비

빈 작업 폴더에서 아래 명령을 실행합니다. 기존 작업 중인 저장소에는 덮어쓰지 마세요.

```powershell
git clone https://github.com/Andrew05213/applemusic-downloader-native.git upstream-build
git -C upstream-build checkout --detach 6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786
git clone https://github.com/style850/apple-music-downloader-ko-patch.git patch-publication
Copy-Item -Path 'patch-publication/patch-source/*' -Destination 'upstream-build' -Recurse -Force
Copy-Item -LiteralPath 'patch-publication/patch-source/.gitignore' -Destination 'upstream-build/.gitignore' -Force
Set-Location upstream-build
```

새 폴더의 원본 파일에 변경 파일을 덮어쓰는 단계입니다. 원본 라이선스와 고지를 보존합니다.

## 빌드 전제와 명령

실제 배포본은 Windows x64, Go 1.27.3에서 빌드했습니다. Node.js와 원본 잠금 파일 기준의 `@electron/asar` 4.3.1이 필요합니다. 원본 소스의 의존성 설치 안내를 따르세요. 원본 1.0.3-beta.4 설치 파일 또는 패처가 검증할 수 있는 원본 백업도 필요합니다.

```powershell
node electron/build-native-service.js
node scripts/prepare-korean-patch.js --service electron/bin/amdl-service.exe
Set-Location apple-music-downloader
go test ./cmd/amdl-korean-patch ./internal/nativeruntime
go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w -buildid= -H=windowsgui' -o amdl-korean-patch-r2.exe ./cmd/amdl-korean-patch
```

설치 경로가 기본값과 다르면 payload 준비 명령에 `--installed-root "원본 설치 폴더"`를 추가합니다. 이 명령은 설치 파일 해시를 확인하고 패처에 포함할 UI·서비스·검증 자료를 생성합니다. 사용자 프로필이나 원본 전체 런타임은 payload로 복사하지 않습니다.

`scripts/test-korean-patch.ps1`은 **원본 상태의 지원 설치본**을 별도 시험 폴더에 복사하는 통합 검사입니다. 패치된 설치본을 기본 입력으로 넘기지 마세요. 테스트 폴더가 이미 있으면 중단하며, 수백 MB의 여유 공간이 필요합니다.

게시된 EXE와 완전히 같은 바이트가 생성되는 재현 빌드는 별도로 검증하지 않았습니다. 게시된 EXE의 체크섬과 실행 검증 기록은 README 및 `verification/`에서 확인할 수 있습니다.
