//go:build !windows

package nativeruntime

import (
	"os"
	"path/filepath"
)

func preparePrivateStateDirectory(path string) (string, error) {
	if err := os.MkdirAll(path, 0700); err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(path)
}

func createPrivateStateFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
}

func validatePrivateStateFile(path, _ string) error {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return ErrInvalidState
	}
	return nil
}

func HardenStateForPatch(string) error { return ErrStateHardeningUnsupported }
