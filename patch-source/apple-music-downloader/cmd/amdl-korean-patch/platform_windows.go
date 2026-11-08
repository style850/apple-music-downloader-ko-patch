//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func safeDirectory(path string) error {
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) || strings.HasPrefix(path, `\\`) {
		return errors.New("로컬 설치 폴더만 지원합니다")
	}
	volume := filepath.VolumeName(path)
	current := volume + string(os.PathSeparator)
	for _, part := range strings.Split(strings.TrimPrefix(path, current), string(os.PathSeparator)) {
		if part == "" {
			continue
		}
		current = filepath.Join(current, part)
		pointer, err := windows.UTF16PtrFromString(current)
		if err != nil {
			return err
		}
		attrs, err := windows.GetFileAttributes(pointer)
		if err != nil {
			return err
		}
		if attrs&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || attrs&windows.FILE_ATTRIBUTE_DIRECTORY == 0 {
			return errors.New("연결 또는 특수 폴더에는 패치를 적용할 수 없습니다")
		}
	}
	return nil
}
func ensureDirectory(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("절대 경로가 필요합니다")
	}
	if _, err := os.Lstat(path); err == nil {
		return safeDirectory(path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := ensureDirectory(filepath.Dir(path)); err != nil {
		return err
	}
	if err := os.Mkdir(path, 0700); err != nil {
		return err
	}
	return safeDirectory(path)
}
func safeFile(name string) error {
	if err := safeDirectory(filepath.Dir(name)); err != nil {
		return err
	}
	pointer, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(pointer, windows.GENERIC_READ, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	var info windows.ByHandleFileInformation
	if err = windows.GetFileInformationByHandle(h, &info); err != nil {
		return err
	}
	if info.FileAttributes&(windows.FILE_ATTRIBUTE_REPARSE_POINT|windows.FILE_ATTRIBUTE_DIRECTORY) != 0 || info.NumberOfLinks != 1 {
		return errors.New("연결 또는 특수 파일에는 패치를 적용할 수 없습니다")
	}
	return nil
}
func lockInstallation(root string) (func(), error) {
	if err := safeDirectory(root); err != nil {
		return nil, err
	}
	pointer, err := windows.UTF16PtrFromString(filepath.Join(root, ".amdl-ko-patch.lock"))
	if err != nil {
		return nil, err
	}
	h, err := windows.CreateFile(pointer, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_ALWAYS, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, errors.New("다른 패치가 실행 중이거나 설치 폴더에 쓰기 권한이 없습니다")
	}
	var info windows.ByHandleFileInformation
	if windows.GetFileInformationByHandle(h, &info) != nil || info.FileAttributes&(windows.FILE_ATTRIBUTE_REPARSE_POINT|windows.FILE_ATTRIBUTE_DIRECTORY) != 0 || info.NumberOfLinks != 1 {
		windows.CloseHandle(h)
		return nil, errors.New("패치 잠금 파일이 올바르지 않습니다")
	}
	return func() { _ = windows.CloseHandle(h) }, nil
}
func ensureStopped(root string) error {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(snapshot)
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		if entry.ProcessID == uint32(os.Getpid()) {
			continue
		}
		h, e := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, entry.ProcessID)
		if e != nil {
			continue
		}
		buf := make([]uint16, 32768)
		size := uint32(len(buf))
		e = windows.QueryFullProcessImageName(h, 0, &buf[0], &size)
		windows.CloseHandle(h)
		if e == nil {
			p := windows.UTF16ToString(buf[:size])
			rel, e := filepath.Rel(strings.ToLower(root), strings.ToLower(p))
			if e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && !filepath.IsAbs(rel) {
				return errors.New("Apple Music Downloader와 관련 실행 파일을 완전히 종료한 뒤 다시 실행해 주세요")
			}
		}
	}
	if !errors.Is(err, windows.ERROR_NO_MORE_FILES) {
		return fmt.Errorf("실행 중인 앱 확인 실패: %w", err)
	}
	return nil
}
func replaceFile(source, target string) error {
	s, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	t, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(s, t, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH)
}

var user32 = windows.NewLazySystemDLL("user32.dll")

func message(title, text string, flags uintptr) int {
	t, _ := windows.UTF16PtrFromString(title)
	s, _ := windows.UTF16PtrFromString(text)
	result, _, _ := user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(s)), uintptr(unsafe.Pointer(t)), flags)
	return int(result)
}

type openFilename struct {
	Size             uint32
	Owner            windows.Handle
	Instance         windows.Handle
	Filter           *uint16
	CustomFilter     *uint16
	MaxCustomFilter  uint32
	FilterIndex      uint32
	File             *uint16
	MaxFile          uint32
	FileTitle        *uint16
	MaxFileTitle     uint32
	InitialDir       *uint16
	Title            *uint16
	Flags            uint32
	FileOffset       uint16
	FileExtension    uint16
	DefaultExtension *uint16
	CustomData       uintptr
	Hook             uintptr
	Template         *uint16
	Reserved         uintptr
	Reserved2        uint32
	FlagsEx          uint32
}

func chooseInstallation() (string, error) {
	// The common dialog selects an existing EXE; the manifest then verifies its bytes.
	filter := []uint16{}
	for _, r := range "Apple Music Downloader Native.exe\x00Apple Music Downloader Native.exe\x00\x00" {
		filter = append(filter, uint16(r))
	}
	buffer := make([]uint16, 32768)
	title, _ := windows.UTF16PtrFromString("원본 Apple Music Downloader Native.exe 선택")
	dialog := openFilename{Filter: &filter[0], File: &buffer[0], MaxFile: uint32(len(buffer)), Title: title, Flags: 0x1000 | 0x800 | 0x8}
	dialog.Size = uint32(unsafe.Sizeof(dialog))
	result, _, _ := windows.NewLazySystemDLL("comdlg32.dll").NewProc("GetOpenFileNameW").Call(uintptr(unsafe.Pointer(&dialog)))
	if result == 0 {
		return "", errors.New("선택을 취소했습니다")
	}
	return filepath.Dir(windows.UTF16ToString(buffer)), nil
}
