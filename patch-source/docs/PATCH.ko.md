# Apple Music Downloader Native 한국어·보안 패치

이 패치는 새 프로그램이나 포터블 배포본이 아닙니다. **원본 Apple Music Downloader Native 1.0.3-beta.4 / Windows x64**와 첫 번째 패치 설치본을 지원하며, 한국어 UI와 runtime 권한 보안 수정을 적용합니다.

현재 배포본은 `AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2.exe`이며, 패치 ID는 `amdl-1.0.3-beta.4-ko-security-2`입니다. 첫 번째 패치로 "로컬 서비스를 사용할 수 없습니다"가 나온 설치본은 재설치하지 말고 이 r2 EXE를 실행하세요.

## 사용자 안내

1. 실행 중인 Apple Music Downloader Native를 완전히 종료합니다. 작업 관리자에 앱 또는 서비스가 남아 있으면 종료합니다.
2. 배포된 `AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2.exe`를 더블클릭합니다.
3. 화면 안내에 따라 적용합니다. 패처는 원본 또는 첫 번째 패치의 파일 SHA-256을 먼저 확인합니다. 정확한 지원 상태가 아니거나 다른 방식으로 바뀐 설치본이면 변경하지 않고 중단합니다.
4. 원본 설치본에서는 바꿀 원본 파일을 자동 백업합니다. 첫 번째 패치 설치본은 그 백업을 검증한 뒤 r2로 올립니다. 문제 발생 시 같은 EXE를 다시 실행해 원본 프로그램 파일 복구를 선택할 수 있습니다.
5. 완료 후 Apple Music Downloader Native를 다시 실행합니다.

패치는 설치 경로, 기존 사용자 프로필 이름 및 다운로드 경로를 바꾸지 않습니다. 로그인 토큰·쿠키·다운로드 파일을 읽거나 삭제하지 않습니다.

## 포함되는 변경

- `resources/app.asar`: 한국어 UI 변경입니다.
- `resources/bin/amdl-service.exe`: runtime 상태 파일을 현재 사용자, SYSTEM 및 관리자만 접근할 수 있도록 제한하는 보안 수정 서비스입니다. 기존 토큰을 삭제하지 않습니다.
- `resources/native-package.json`: 변경된 UI와 서비스의 검증 영수증입니다.
- `Apple Music Downloader Native.exe`: ASAR 헤더 무결성 해시 64자를 같은 길이로 교체합니다. Electron fuse나 실행 파일의 다른 영역은 변경하지 않습니다.

현재 사용자 소유 runtime 디렉터리의 ACL만 복구·강화합니다. r2는 runtime 디렉터리에 필요한 신뢰된 읽기 권한 상속을 적용하고, `data.img`, `control.secret`, `native-runtime.lock`은 별도의 보호된 ACL로 유지합니다. 다른 계정의 데이터, 시스템 전역 권한, 사용자 프로필 위치 및 다운로드 설정은 바꾸지 않습니다.

## 검증 범위

패치는 파일 무결성, 백업·복원 경로 및 runtime 시작을 대상으로 검증했습니다. 실제 Apple 로그인, 인증 코드 제출, 재생 및 다운로드는 아직 검증하지 않았습니다. 로그인은 사용자가 본인 계정과 승인된 환경에서 직접 확인해야 합니다.

## 소스에서 다시 만들기

이 소스 트리는 기준 upstream 커밋 `6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786`에서 시작했습니다. 변경 사항과 원본 고지를 함께 보존한 채 다음 순서로 빌드합니다.

Windows x64, Go 1.27.3 및 Node.js 환경에서 만들었습니다. `@electron/asar`가 Node의 모듈 경로에서 확인되어야 하며, 원본 1.0.3-beta.4 설치본이 필요합니다. 다른 위치에 설치했다면 payload 준비 명령에 `--installed-root "설치 폴더"`를 추가합니다. 상세 검증과 미확인 범위는 `PATCH-VERIFICATION.ko.md`에 있습니다.

```powershell
node electron/build-native-service.js
node scripts/prepare-korean-patch.js --service electron/bin/amdl-service.exe
Set-Location apple-music-downloader
go build -mod=readonly -trimpath -buildvcs=false -ldflags='-s -w -buildid= -H=windowsgui' -o cmd/amdl-korean-patch/amdl-korean-patch.exe ./cmd/amdl-korean-patch
```

두 번째 명령은 패처에 포함할 최소 payload만 생성합니다. 전체 runtime, 사용자 프로필, 쿠키, 토큰, 다운로드 파일 또는 원본 실행 파일은 복사하지 않습니다.

## 고지

원본 `LICENSE`와 `NOTICE`는 그대로 유지해야 합니다. 이 패치는 공식 Apple, Apple Music 또는 EILVAR 제품으로 표시되지 않습니다. 실제 배포 범위에 적용되는 권리·계약·라이선스 판단은 배포자가 별도로 검토해야 하며, 이 문서는 법률 자문이나 재배포 허가가 아닙니다.
