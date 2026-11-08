package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type edit struct {
	Offset int64  `json:"offset"`
	Before string `json:"beforeHex"`
	After  string `json:"afterHex"`
}
type patchFile struct {
	Path        string `json:"path"`
	Before      string `json:"beforeSHA256"`
	Previous    string `json:"previousSHA256,omitempty"`
	After       string `json:"afterSHA256"`
	Payload     string `json:"payload,omitempty"`
	Compression string `json:"compression,omitempty"`
	Edits       []edit `json:"edits,omitempty"`
}
type manifest struct {
	Schema  int         `json:"schemaVersion"`
	ID      string      `json:"patchId"`
	Version string      `json:"version"`
	Files   []patchFile `json:"files"`
}
type installationState struct {
	State     string `json:"state"`
	Directory string `json:"directory"`
	PatchID   string `json:"patchId"`
}

const backupName = ".amdl-ko-security-backup-v1"

func digest(data []byte) string { sum := sha256.Sum256(data); return hex.EncodeToString(sum[:]) }
func fileDigest(name string) (string, error) {
	f, err := os.Open(name)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func validRelative(name string) bool {
	return name != "" && !filepath.IsAbs(name) && !strings.ContainsAny(name, "\\:") && !strings.HasPrefix(name, "/") && filepath.ToSlash(filepath.Clean(name)) == name && name != "." && name != ".." && !strings.HasPrefix(name, "../")
}
func readManifest(data []byte) (manifest, error) {
	var m manifest
	if json.Unmarshal(data, &m) != nil || m.Schema != 1 || m.ID != "amdl-1.0.3-beta.4-ko-security-2" || m.Version != "1.0.3-beta.4" || len(m.Files) < 2 || len(m.Files) > 5 {
		return m, errors.New("패치 정보가 올바르지 않습니다")
	}
	seen := map[string]bool{}
	allowed := map[string]bool{"resources/app.asar": true, "resources/bin/amdl-service.exe": true, "resources/native-package.json": true, "Apple Music Downloader Native.exe": true}
	for _, f := range m.Files {
		if !validRelative(f.Path) || !allowed[f.Path] || seen[f.Path] {
			return m, errors.New("패치 파일 경로가 올바르지 않습니다")
		}
		seen[f.Path] = true
		hashes := []string{f.Before, f.After}
		if f.Previous != "" {
			hashes = append(hashes, f.Previous)
		}
		for _, hash := range hashes {
			b, e := hex.DecodeString(hash)
			if e != nil || len(b) != 32 {
				return m, errors.New("패치 해시가 올바르지 않습니다")
			}
		}
		if (f.Payload == "") == (len(f.Edits) == 0) {
			return m, errors.New("패치 파일 형식이 올바르지 않습니다")
		}
		if f.Payload != "" && (!validRelative(f.Payload) || strings.Contains(f.Payload, "/") || (f.Compression != "" && f.Compression != "gzip")) {
			return m, errors.New("패치 자료 경로가 올바르지 않습니다")
		}
		for _, e := range f.Edits {
			before, bErr := hex.DecodeString(e.Before)
			after, aErr := hex.DecodeString(e.After)
			if e.Offset < 0 || bErr != nil || aErr != nil || len(before) == 0 || len(before) != len(after) {
				return m, errors.New("실행 파일 패치가 올바르지 않습니다")
			}
		}
	}
	if !seen["resources/app.asar"] || !seen["resources/bin/amdl-service.exe"] || !seen["resources/native-package.json"] {
		return m, errors.New("필수 보안 패치 파일이 없습니다")
	}
	return m, nil
}
func inspect(root string, m manifest) (installationState, error) {
	state := installationState{Directory: root, PatchID: m.ID}
	if !filepath.IsAbs(root) {
		return state, errors.New("설치 폴더는 절대 경로여야 합니다")
	}
	before, after, previousOnly := 0, 0, 0
	for _, f := range m.Files {
		name := filepath.Join(root, filepath.FromSlash(f.Path))
		if err := safeFile(name); err != nil {
			return state, err
		}
		hash, err := fileDigest(name)
		if err != nil {
			return state, err
		}
		switch hash {
		case f.Before:
			before++
		case f.After:
			after++
		case f.Previous:
			previousOnly++
		default:
			return state, fmt.Errorf("지원하는 원본과 다른 파일입니다: %s\n1.0.3-beta.4 원본 설치본에만 적용할 수 있습니다", f.Path)
		}
	}
	switch {
	case before == len(m.Files):
		state.State = "original"
	case after == len(m.Files):
		state.State = "patched"
	case before == 0 && previousOnly > 0 && after+previousOnly == len(m.Files):
		state.State = "previous"
	default:
		state.State = "partial"
	}
	return state, nil
}
func patchedBytes(f patchFile, original []byte, payload fs.FS) ([]byte, error) {
	if digest(original) != f.Before {
		return nil, errors.New("원본 파일 검증 실패")
	}
	var result []byte
	if f.Payload != "" {
		data, err := fs.ReadFile(payload, f.Payload)
		if err != nil {
			return nil, err
		}
		if f.Compression == "gzip" {
			reader, err := gzip.NewReader(bytes.NewReader(data))
			if err != nil {
				return nil, err
			}
			result, err = io.ReadAll(io.LimitReader(reader, 64*1024*1024+1))
			closeErr := reader.Close()
			if err != nil || closeErr != nil || len(result) > 64*1024*1024 {
				return nil, errors.New("패치 자료 압축 해제 실패")
			}
		} else {
			result = data
		}
	} else {
		result = append([]byte{}, original...)
		for _, e := range f.Edits {
			before, _ := hex.DecodeString(e.Before)
			after, _ := hex.DecodeString(e.After)
			if e.Offset > int64(len(result)) || int64(len(before)) > int64(len(result))-e.Offset || !bytes.Equal(result[e.Offset:e.Offset+int64(len(before))], before) {
				return nil, errors.New("실행 파일 무결성 정보가 원본과 다릅니다")
			}
			copy(result[e.Offset:], after)
		}
	}
	if digest(result) != f.After {
		return nil, errors.New("패치 결과 해시 검증 실패")
	}
	return result, nil
}
func writeNew(name string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(name), ".amdl-ko-backup-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	_, writeErr := f.Write(data)
	syncErr := f.Sync()
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	if syncErr != nil {
		return syncErr
	}
	if closeErr != nil {
		return closeErr
	}
	if _, err := os.Lstat(name); !errors.Is(err, os.ErrNotExist) {
		return errors.New("백업 경로가 이미 존재합니다")
	}
	return os.Rename(f.Name(), name)
}
func verifiedBackup(root string, m manifest) error {
	for _, f := range m.Files {
		name := filepath.Join(root, backupName, filepath.FromSlash(f.Path))
		if err := safeFile(name); err != nil {
			return err
		}
		hash, err := fileDigest(name)
		if err != nil || hash != f.Before {
			return fmt.Errorf("원본 백업 검증 실패: %s", f.Path)
		}
	}
	return nil
}

// All originals are retained before replacement. ACL tightening is never undone.
func apply(root, profile string, m manifest, payload fs.FS, restore bool, harden func(string) error, replace func(string, string) error) (resultErr error) {
	unlock, err := lockInstallation(root)
	if err != nil {
		return err
	}
	defer unlock()
	if err := ensureStopped(root); err != nil {
		return err
	}
	state, err := inspect(root, m)
	if err != nil {
		return err
	}
	if restore && state.State == "original" {
		return harden(profile)
	}
	if !restore && state.State == "partial" {
		return errors.New("이전 패치가 중단된 상태입니다. 먼저 원본 복구를 실행해 주세요")
	}
	if !restore && state.State == "patched" {
		return harden(profile)
	}
	backup := filepath.Join(root, backupName)
	if restore || state.State == "previous" {
		if err := verifiedBackup(root, m); err != nil {
			return err
		}
	} else {
		if err := safeDirectory(root); err != nil {
			return err
		}
		if err := ensureDirectory(backup); err != nil {
			return err
		}
		if err := safeDirectory(backup); err != nil {
			return err
		}
		for _, f := range m.Files {
			target := filepath.Join(backup, filepath.FromSlash(f.Path))
			if err := ensureDirectory(filepath.Dir(target)); err != nil {
				return err
			}
			if err := safeDirectory(filepath.Dir(target)); err != nil {
				return err
			}
			if _, err := os.Lstat(target); err == nil {
				if err := safeFile(target); err != nil {
					return err
				}
				hash, err := fileDigest(target)
				if err != nil || hash != f.Before {
					return errors.New("기존 원본 백업이 변경되어 중단했습니다")
				}
				continue
			} else if !errors.Is(err, os.ErrNotExist) {
				return err
			}
			original, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(f.Path)))
			if err != nil {
				return err
			}
			if digest(original) != f.Before {
				return errors.New("백업 직전 원본 파일이 변경되었습니다")
			}
			if err := writeNew(target, original); err != nil {
				return err
			}
		}
		if err := verifiedBackup(root, m); err != nil {
			return err
		}
	}
	type stagedFile struct {
		temp, target string
		spec         patchFile
	}
	staged := []stagedFile{}
	changed := []patchFile{}
	complete := false
	defer func() {
		if restore || complete {
			return
		}
		for i := len(changed) - 1; i >= 0; i-- {
			f := changed[i]
			target := filepath.Join(root, filepath.FromSlash(f.Path))
			current, err := fileDigest(target)
			if err != nil || current != f.After {
				resultErr = errors.Join(resultErr, errors.New("변경된 파일을 자동 복구할 수 없습니다. 원본 백업은 보존되어 있습니다"))
				continue
			}
			data, err := os.ReadFile(filepath.Join(backup, filepath.FromSlash(f.Path)))
			if err != nil || digest(data) != f.Before {
				resultErr = errors.Join(resultErr, errors.New("원본 백업 재검증 실패"))
				continue
			}
			temp, err := os.CreateTemp(filepath.Dir(target), ".amdl-ko-rollback-*")
			if err != nil {
				resultErr = errors.Join(resultErr, err)
				continue
			}
			_, writeErr := temp.Write(data)
			syncErr, closeErr := temp.Sync(), temp.Close()
			if writeErr == nil && syncErr == nil && closeErr == nil {
				err = replaceFile(temp.Name(), target)
			} else {
				err = errors.Join(writeErr, syncErr, closeErr)
			}
			_ = os.Remove(temp.Name())
			if err != nil {
				resultErr = errors.Join(resultErr, fmt.Errorf("원본 백업은 보존됐습니다. 복구를 다시 실행해 주세요: %w", err))
			}
		}
	}()
	defer func() {
		for _, s := range staged {
			_ = os.Remove(s.temp)
		}
	}()
	for _, f := range m.Files {
		target := filepath.Join(root, filepath.FromSlash(f.Path))
		current, err := fileDigest(target)
		if err != nil {
			return err
		}
		desired := f.After
		if restore {
			desired = f.Before
		}
		if current == desired {
			continue
		}
		if restore {
			if current != f.After && current != f.Previous {
				return errors.New("복구 직전 설치 파일이 변경되었습니다")
			}
		} else if state.State == "original" && current != f.Before {
			return errors.New("적용 직전 설치 파일이 변경되었습니다")
		} else if state.State == "previous" && current != f.Previous {
			return errors.New("업그레이드 직전 설치 파일이 변경되었습니다")
		}
		original, err := os.ReadFile(filepath.Join(backup, filepath.FromSlash(f.Path)))
		if err != nil {
			return err
		}
		if digest(original) != f.Before {
			return errors.New("원본 백업이 변경되었습니다")
		}
		data := original
		if !restore {
			data, err = patchedBytes(f, original, payload)
			if err != nil {
				return err
			}
		}
		if err := safeDirectory(filepath.Dir(target)); err != nil {
			return err
		}
		temp, err := os.CreateTemp(filepath.Dir(target), ".amdl-ko-stage-*")
		if err != nil {
			return err
		}
		name := temp.Name()
		staged = append(staged, stagedFile{name, target, f})
		_, writeErr := temp.Write(data)
		syncErr := temp.Sync()
		closeErr := temp.Close()
		if writeErr != nil {
			return writeErr
		}
		if syncErr != nil {
			return syncErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	if err := ensureStopped(root); err != nil {
		return err
	}
	if err := harden(profile); err != nil {
		return fmt.Errorf("세션 파일 권한을 안전하게 변경하지 못했습니다. 기존 데이터는 유지됩니다: %w", err)
	}
	for _, s := range staged {
		if err := safeFile(s.target); err != nil {
			return err
		}
		hash, err := fileDigest(s.target)
		if err != nil {
			return err
		}
		if hash != s.spec.Before && hash != s.spec.Previous && hash != s.spec.After {
			return errors.New("적용 직전 설치 파일이 변경되었습니다")
		}
		if err = replace(s.temp, s.target); err != nil {
			return fmt.Errorf("파일 교체 실패. 앱을 완전히 종료하고 다시 실행해 주세요: %w", err)
		}
		changed = append(changed, s.spec)
	}
	final, err := inspect(root, m)
	if err != nil {
		return err
	}
	expected := "patched"
	if restore {
		expected = "original"
	}
	if final.State != expected {
		return errors.New("최종 파일 검증 실패. 원본 복구를 실행해 주세요")
	}
	complete = true
	return nil
}
