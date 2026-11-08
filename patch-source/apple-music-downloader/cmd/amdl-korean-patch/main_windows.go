//go:build windows

package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/Andrew05213/applemusic_downloader/internal/nativeruntime"
)

//go:embed payload/*
var embedded embed.FS

func hardenProfile(profile string) error {
	runtime := filepath.Join(profile, "native-v2", "runtime")
	if _, err := os.Lstat(runtime); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return err
	}
	return nativeruntime.HardenStateForPatch(runtime)
}
func run() error {
	check := flag.Bool("check", false, "설치 파일 확인만 수행")
	applyFlag := flag.Bool("apply", false, "패치 적용")
	restoreFlag := flag.Bool("restore", false, "원본 복구")
	root := flag.String("install-dir", filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "Apple Music Downloader Native"), "설치 폴더")
	profile := flag.String("profile-dir", filepath.Join(os.Getenv("APPDATA"), "AppleMusicDownloader-v2-test"), "기존 프로필 폴더")
	flag.Parse()
	payload, err := fs.Sub(embedded, "payload")
	if err != nil {
		return err
	}
	raw, err := fs.ReadFile(payload, "manifest.json")
	if err != nil {
		return fmt.Errorf("패치 자료가 없습니다: %w", err)
	}
	m, err := readManifest(raw)
	if err != nil {
		return err
	}
	if (*applyFlag && *restoreFlag) || (*check && (*applyFlag || *restoreFlag)) {
		return fmt.Errorf("실행 모드는 하나만 선택해 주세요")
	}
	interactive := !(*check || *applyFlag || *restoreFlag)
	if interactive {
		if _, err := os.Stat(filepath.Join(*root, "Apple Music Downloader Native.exe")); err != nil {
			*root, err = chooseInstallation()
			if err != nil {
				return err
			}
		}
	}
	state, err := inspect(*root, m)
	if err != nil {
		return err
	}
	if *check {
		data, _ := json.MarshalIndent(state, "", "  ")
		fmt.Println(string(data))
		return nil
	}
	if interactive {
		restore := state.State == "partial" || state.State == "patched"
		text := "원본 1.0.3-beta.4에 보안·한국어 패치를 적용합니다.\n원본 저작권: 2026 Andrew05213 · Apache-2.0\n\n설치 폴더: " + *root + "\n\n기존 로그인과 다운로드 데이터는 유지됩니다.\n원본 프로그램 파일을 백업하고 세션 파일 읽기 권한을 보호합니다.\n다른 사용자 접근을 막는 수정이며 토큰 암호화 기능은 아닙니다.\n\n앱을 완전히 종료했으면 [예]를 누르세요."
		if state.State == "previous" {
			text = "이전 보안·한국어 패치가 설치되어 있습니다.\n\n이전 권한 처리 오류를 복구하는 업데이트를 적용합니다. 원본 프로그램 파일 백업을 검증한 뒤 필요한 파일만 교체하며, 기존 로그인·다운로드 데이터는 유지합니다.\n\n설치 폴더: " + *root + "\n\n앱을 완전히 종료했으면 [예]를 누르세요."
		} else if restore {
			text = "이미 패치됐거나 이전 작업이 중단된 설치본입니다.\n\n백업한 원본 프로그램 파일로 복구하시겠습니까?\n로그인·다운로드 데이터와 강화된 세션 파일 권한은 유지됩니다.\n\n설치 폴더: " + *root
		}
		if message("Apple Music Downloader 보안·한국어 패치", text, 0x4|0x20) != 6 {
			return nil
		}
		*restoreFlag = restore
	}
	if err := apply(*root, *profile, m, payload, *restoreFlag, hardenProfile, replaceFile); err != nil {
		return err
	}
	result := "보안·한국어 패치를 적용했습니다.\n이제 기존 바로가기로 앱을 실행하세요.\n\n이 패치 EXE를 다시 실행하면 원본 프로그램 파일을 복구할 수 있습니다."
	if state.State == "previous" {
		result = "이전 패치의 권한 처리 오류를 복구했습니다.\n이제 기존 바로가기로 앱을 실행하세요."
	}
	if *restoreFlag {
		result = "원본 프로그램 파일을 복구했습니다.\n로그인·다운로드 데이터와 강화된 세션 파일 권한은 유지했습니다."
	}
	if interactive {
		message("완료", result, 0x40)
	} else {
		fmt.Println(result)
	}
	return nil
}
func main() {
	if err := run(); err != nil {
		if len(os.Args) == 1 {
			message("패치를 완료하지 못했습니다", err.Error(), 0x10)
		} else {
			fmt.Fprintln(os.Stderr, err)
		}
		os.Exit(1)
	}
}
