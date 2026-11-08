# Apple Music Downloader 한국어·보안 패치 r2

Windows용 **Apple Music Downloader Native 1.0.3-beta.4**에 한국어 UI와 세션 파일 접근 권한 수정을 적용하는 비공식 패치입니다. 원본 앱을 먼저 설치한 다음 패치를 실행합니다.

**지원 환경: Windows x64 · 원본 1.0.3-beta.4 또는 첫 번째 한국어·보안 패치 설치본.** 다른 버전과 다른 방식으로 수정한 파일은 지원하지 않습니다. 원본이 베타 버전이고 실제 재생·다운로드 완료 검증은 하지 않아, 이 릴리스도 사전 릴리스로 제공합니다.

## 다운로드

| 필요한 파일 | 링크 |
| --- | --- |
| 원본 설치 EXE — 원 제작자 제공 | [AppleMusicDownloader-1.0.3-beta.4-Setup.exe](https://github.com/Andrew05213/applemusic-downloader-native/releases/download/v1.0.3-beta.4/AppleMusicDownloader-1.0.3-beta.4-Setup.exe) |
| 원본 릴리스 설명·체크섬 | [원본 v1.0.3-beta.4 릴리스](https://github.com/Andrew05213/applemusic-downloader-native/releases/tag/v1.0.3-beta.4) |
| 두 번째 패치 EXE | [AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2.exe](https://github.com/style850/apple-music-downloader-ko-patch/releases/download/v1.0.3-beta.4-ko-r2/AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2.exe) |
| 패치 EXE·소스·라이선스 묶음 | [AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2-Package.zip](https://github.com/style850/apple-music-downloader-ko-patch/releases/download/v1.0.3-beta.4-ko-r2/AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2-Package.zip) |
| 변경 소스·문서만 받기 | [AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2-Source.zip](https://github.com/style850/apple-music-downloader-ko-patch/releases/download/v1.0.3-beta.4-ko-r2/AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2-Source.zip) |
| 파일 SHA-256 | [SHA256SUMS.txt](https://github.com/style850/apple-music-downloader-ko-patch/releases/download/v1.0.3-beta.4-ko-r2/SHA256SUMS.txt) |

[이 패치의 릴리스 페이지](https://github.com/style850/apple-music-downloader-ko-patch/releases/tag/v1.0.3-beta.4-ko-r2) · [원본 소스](https://github.com/Andrew05213/applemusic-downloader-native) · [공개 변경 소스](patch-source)

원본 설치 파일은 원 제작자의 GitHub에서 직접 받습니다. 이 저장소와 패치 ZIP에는 원본 앱 전체, Apple·Android·QEMU 런타임, 사용자 프로필 및 계정 자료를 포함하지 않습니다. 원본 프로젝트가 밝힌 제3자 권리 검토의 미완료 사항은 [원본 고지](https://github.com/Andrew05213/applemusic-downloader-native/blob/6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786/NOTICE)에서 확인할 수 있습니다.

## 설치 방법

1. 위 링크의 **원본 1.0.3-beta.4**를 설치합니다. 이미 해당 원본이나 첫 패치가 설치되어 있다면 재설치는 필요하지 않습니다.
2. Apple Music Downloader를 완전히 종료합니다. 진행 중인 다운로드가 있다면 먼저 끝내세요.
3. `AppleMusicDownloader-1.0.3-beta.4-KO-Security-Patch-r2.exe`를 실행합니다.
4. 설치 폴더와 적용 안내를 확인하고 **예**를 누릅니다. 기본 경로를 찾지 못하면 실제 설치 폴더를 선택합니다.
5. 완료 후 기존 바로가기로 앱을 실행합니다. **설정 및 상태**에서 서비스 상태를 확인합니다.

패처는 지원 파일의 SHA-256을 검증하고 원본 파일을 백업합니다. 첫 패치에서 r2로 올릴 때는 기존 원본 백업도 검증합니다. 알 수 없는 버전·변조된 파일·백업 이상은 적용을 중단합니다.

설치·프로필·다운로드 경로와 계정 파일 내용은 유지합니다. 그래도 중요한 데이터는 적용 전에 백업하세요. 패처에 Apple ID나 비밀번호를 입력할 필요는 없습니다.

### 첫 패치 후 “로컬 서비스를 사용할 수 없습니다”가 나오는 경우

첫 패치가 runtime 폴더의 권한 상속을 잘못 처리해 내부 실행 파일을 읽을 수 없게 만드는 문제가 있었습니다. 이 데이터 폴더는 재설치 후에도 남을 수 있습니다. **앱을 종료한 뒤 r2를 적용**하면 해당 권한을 복구합니다. 기존 로그인 파일을 삭제할 필요는 없습니다.

### 원본 복구와 재설치

- **이미 r2가 적용된 상태에서 같은 EXE를 다시 실행하면 원본 복구를 제안합니다.** 반복 업데이트 버튼이 아닙니다.
- 복구는 백업한 원본 프로그램 파일을 되돌립니다. 로그인·다운로드 데이터와 강화된 세션 파일 권한은 유지합니다.
- 원본 앱을 제거·재설치했다면 앱을 종료한 상태에서 r2를 다시 적용합니다. 사용자 데이터까지 삭제하면 저장된 로그인이 사라질 수 있습니다.
- 원본 백업은 설치 폴더의 `.amdl-ko-security-backup-v1`에 보관됩니다. 복구가 필요할 수 있으므로 임의로 삭제하지 마세요.

## 변경 사항

- 메뉴·로그인 안내·상태·오류·접근성 문구를 한국어로 변경했습니다.
- 세션 이미지와 비밀 값 파일의 Windows 접근 권한을 현재 사용자·SYSTEM·관리자로 제한했습니다.
- r2는 runtime 하위 실행 파일에 필요한 권한 상속을 복구합니다. 민감 상태 파일은 별도 보호 권한을 유지합니다.
- 원본 해시 검증, 백업·복구, 교체 실패 시 롤백을 포함합니다. Electron ASAR 무결성 검사는 유지합니다.

## 확인한 범위와 한계

- 패처·runtime 회귀 테스트, 첫 패치 오류 재현, r2 업그레이드·반복 적용·복구·원본 신규 적용 검증을 통과했습니다.
- 한 Windows PC의 실제 설치본에서 서비스 **준비됨**, 기존 세션의 **로그인 확인됨**, 한국어 화면 및 홈 추천 목록 표시를 확인했습니다.
- 새 Apple 로그인·인증 코드 제출·곡 재생·다운로드 완료는 시험하지 않았습니다. 전체 테스트에 남은 실패와 이전 검증의 한계는 [검증 기록](docs/PATCH-VERIFICATION.ko.md)에 공개합니다.
- 이번 보안 수정은 파일 접근 권한 보호입니다. 토큰 암호화나 모든 취약점 해결을 뜻하지 않으며, 같은 사용자 권한의 악성 프로그램·관리자·SYSTEM으로부터 보호하지는 못합니다.
- **EXE는 코드 서명되지 않았습니다.** Windows에서 미확인 제작자로 표시될 수 있습니다. 게시된 체크섬으로 파일 일치 여부를 확인할 수 있지만, 체크섬은 제작자 신원이나 무해성을 보증하지 않습니다.

패치 EXE SHA-256:

```text
afc7e5c40800d205bbdd0c44470763613bf743c4643f2773f5491634eceb5b77
```

## 소스와 라이선스

`patch-source/`는 [원본 기준 커밋 `6adb6703d4f8`](https://github.com/Andrew05213/applemusic-downloader-native/tree/6adb6703d4f8ef04e08dc0e3e47b57d44c4f1786)에 적용할 변경 파일입니다. 전체 원본 소스를 복제한 저장소가 아닙니다. [소스 구성·빌드 안내](BUILD.ko.md)를 참고하세요.

원본 저작권은 **Copyright 2026 Andrew05213**입니다. 원본 `LICENSE`와 `NOTICE`, 포함된 Go 의존성·runv2 라이선스를 보존합니다. 패치의 프로젝트 코드에는 원본과 같은 Apache-2.0 조건을 적용하며, 제3자 자료에는 각자의 조건이 적용됩니다. [수정·출처 고지](docs/PATCH-ATTRIBUTION.ko.md) · [의존성 기록](docs/PATCH-DEPENDENCIES.md)

Apple, Apple Music, 원본 프로젝트 또는 EILVAR의 공식 배포·승인·보증을 뜻하지 않습니다. 명칭과 상표의 권리는 각 권리자에게 있습니다. 이 자료는 음원이나 서비스 이용 권한을 부여하지 않습니다.

## 이용자 선택 및 책임 안내

설치와 사용 여부는 이용자가 자신의 환경과 필요에 따라 자율적으로 결정합니다. 이용자는 계정과 데이터의 관리·백업, 관련 법령·서비스 약관·저작권 준수 여부를 확인해야 합니다.

이 패치는 현재 상태 그대로 제공됩니다. 제작자와 배포자는 특정 목적 적합성, 중단 없는 작동, 완전한 보안 또는 모든 계정·PC에서의 정상 작동을 보증하지 않습니다. 적용 법률이 허용하는 최대 범위에서, 사용 또는 사용 불가로 발생하는 데이터 손실, 계정·서비스 이용 제한, 장애 및 그 밖의 손해에 대한 책임을 부담하지 않습니다. 다만 법률상 배제·제한할 수 없는 책임이나 별도 서면 약정에 따른 의무까지 면제한다는 뜻은 아닙니다.

이 안내는 원본 및 각 구성 요소의 라이선스를 대체하지 않습니다. [Apache-2.0 원문 제7·8조](https://www.apache.org/licenses/LICENSE-2.0)의 무보증·책임 제한 및 예외를 함께 확인하세요. 단순히 이 문구를 게시했다는 이유로 모든 법적 책임이 없어지는 것은 아닙니다.

## 문제 제보

지원 원본 버전, 패치 버전, 재현 순서와 오류 문구를 알려 주세요. **Apple ID·비밀번호·인증 코드·쿠키·토큰·세션 이미지 또는 원본 진단 로그를 공개 이슈에 올리지 마세요.** 이 저장소에 대한 문의가 원 제작자나 Apple의 공식 지원으로 연결되는 것은 아닙니다.
