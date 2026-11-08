//go:build windows

package main

import (
	"bytes"
	"compress/gzip"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func fixture(t *testing.T) (string, string, manifest, fstest.MapFS) {
	t.Helper()
	root, profile := t.TempDir(), t.TempDir()
	m := manifest{Schema: 1, ID: "amdl-1.0.3-beta.4-ko-security-2", Version: "1.0.3-beta.4"}
	payload := fstest.MapFS{}
	for i, name := range []string{"resources/app.asar", "resources/bin/amdl-service.exe", "resources/native-package.json"} {
		before, after := []byte("original:"+name), []byte("patched:"+name)
		previous := []byte("previous:" + name)
		file := patchFile{Path: name, Before: digest(before), Previous: digest(previous), After: digest(after), Payload: []string{"app.asar", "service.exe", "receipt.json"}[i]}
		m.Files = append(m.Files, file)
		payload[file.Payload] = &fstest.MapFile{Data: after}
		target := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, before, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(profile, "session-sentinel"), []byte("private fixture remains unchanged"), 0600); err != nil {
		t.Fatal(err)
	}
	return root, profile, m, payload
}

func writePrevious(t *testing.T, root string, m manifest, keepAfter map[string]bool) {
	t.Helper()
	for _, f := range m.Files {
		if keepAfter[f.Path] {
			continue
		}
		if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(f.Path)), []byte("previous:"+f.Path), 0600); err != nil {
			t.Fatal(err)
		}
	}
}
func expectState(t *testing.T, root string, m manifest, want string) {
	t.Helper()
	state, err := inspect(root, m)
	if err != nil || state.State != want {
		t.Fatalf("state=%+v error=%v want=%s", state, err, want)
	}
}
func TestApplyRestorePreservesProfileAndBackups(t *testing.T) {
	root, profile, m, payload := fixture(t)
	calls := 0
	harden := func(got string) error {
		calls++
		if got != profile {
			t.Fatal(got)
		}
		return nil
	}
	if err := apply(root, profile, m, payload, false, harden, replaceFile); err != nil {
		t.Fatal(err)
	}
	expectState(t, root, m, "patched")
	if err := verifiedBackup(root, m); err != nil {
		t.Fatal(err)
	}
	if err := apply(root, profile, m, payload, true, harden, replaceFile); err != nil {
		t.Fatal(err)
	}
	expectState(t, root, m, "original")
	if calls != 2 {
		t.Fatalf("ACL migration calls: %d", calls)
	}
	data, err := os.ReadFile(filepath.Join(profile, "session-sentinel"))
	if err != nil || string(data) != "private fixture remains unchanged" {
		t.Fatal("profile modified", err)
	}
	if err := apply(root, profile, m, payload, false, harden, replaceFile); err != nil {
		t.Fatal("reapply with original backup", err)
	}
}

func TestPreviousPatchUpgradesUsingOriginalBackup(t *testing.T) {
	root, profile, m, payload := fixture(t)
	hardenCalls, replacements := 0, 0
	if err := apply(root, profile, m, payload, false, func(string) error { hardenCalls++; return nil }, replaceFile); err != nil {
		t.Fatal(err)
	}
	writePrevious(t, root, m, map[string]bool{"resources/app.asar": true})
	expectState(t, root, m, "previous")
	if err := apply(root, profile, m, payload, false, func(string) error { hardenCalls++; return nil }, func(source, target string) error {
		replacements++
		return replaceFile(source, target)
	}); err != nil {
		t.Fatal(err)
	}
	if replacements != 2 { // app.asar was already the v2 byte sequence.
		t.Fatalf("replacements=%d", replacements)
	}
	expectState(t, root, m, "patched")
	if err := apply(root, profile, m, payload, true, func(string) error { hardenCalls++; return nil }, replaceFile); err != nil {
		t.Fatal(err)
	}
	expectState(t, root, m, "original")
	if hardenCalls != 3 {
		t.Fatalf("harden calls=%d", hardenCalls)
	}
}

func TestPreviousPatchRequiresVerifiedOriginalBackup(t *testing.T) {
	root, profile, m, payload := fixture(t)
	if err := apply(root, profile, m, payload, false, func(string) error { return nil }, replaceFile); err != nil {
		t.Fatal(err)
	}
	writePrevious(t, root, m, nil)
	if err := os.Remove(filepath.Join(root, backupName, filepath.FromSlash(m.Files[0].Path))); err != nil {
		t.Fatal(err)
	}
	called := false
	if err := apply(root, profile, m, payload, false, func(string) error { called = true; return nil }, replaceFile); err == nil {
		t.Fatal("previous patch without backup accepted")
	}
	if called {
		t.Fatal("harden called before backup validation")
	}
	expectState(t, root, m, "previous")
}
func TestUnknownInstallationRejectedBeforeBackup(t *testing.T) {
	root, profile, m, payload := fixture(t)
	target := filepath.Join(root, "resources", "app.asar")
	os.WriteFile(target, []byte("newer user installation"), 0600)
	if err := apply(root, profile, m, payload, false, func(string) error { t.Fatal("harden called"); return nil }, replaceFile); err == nil {
		t.Fatal("unknown installation accepted")
	}
	if _, err := os.Stat(filepath.Join(root, backupName)); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("backup created before validation")
	}
}
func TestHardeningFailureDoesNotReplaceProgram(t *testing.T) {
	root, profile, m, payload := fixture(t)
	if err := apply(root, profile, m, payload, false, func(string) error { return errors.New("unsafe owner") }, replaceFile); err == nil {
		t.Fatal("expected hardening error")
	}
	expectState(t, root, m, "original")
	if err := verifiedBackup(root, m); err != nil {
		t.Fatal(err)
	}
}
func TestBadPayloadNeverTouchesInstalledBytes(t *testing.T) {
	root, profile, m, payload := fixture(t)
	payload[m.Files[1].Payload] = &fstest.MapFile{Data: []byte("tampered")}
	if err := apply(root, profile, m, payload, false, func(string) error { t.Fatal("hardening before payload check"); return nil }, replaceFile); err == nil {
		t.Fatal("bad payload accepted")
	}
	expectState(t, root, m, "original")
}
func TestReplacementFailureRollsBackEarlierFiles(t *testing.T) {
	root, profile, m, payload := fixture(t)
	calls := 0
	replace := func(source, target string) error {
		calls++
		if calls == 2 {
			return errors.New("injected sharing violation")
		}
		return replaceFile(source, target)
	}
	if err := apply(root, profile, m, payload, false, func(string) error { return nil }, replace); err == nil {
		t.Fatal("expected replacement error")
	}
	expectState(t, root, m, "original")
	if err := verifiedBackup(root, m); err != nil {
		t.Fatal(err)
	}
}
func TestPartialPatchCanOnlyRestore(t *testing.T) {
	root, profile, m, payload := fixture(t)
	harden := func(string) error { return nil }
	if err := apply(root, profile, m, payload, false, harden, replaceFile); err != nil {
		t.Fatal(err)
	}
	f := m.Files[0]
	original, _ := os.ReadFile(filepath.Join(root, backupName, filepath.FromSlash(f.Path)))
	os.WriteFile(filepath.Join(root, filepath.FromSlash(f.Path)), original, 0600)
	expectState(t, root, m, "partial")
	if err := apply(root, profile, m, payload, false, harden, replaceFile); err == nil {
		t.Fatal("partial installation accepted")
	}
	if err := apply(root, profile, m, payload, true, harden, replaceFile); err != nil {
		t.Fatal(err)
	}
	expectState(t, root, m, "original")
}
func TestCorruptedBackupCannotRestore(t *testing.T) {
	root, profile, m, payload := fixture(t)
	harden := func(string) error { return nil }
	if err := apply(root, profile, m, payload, false, harden, replaceFile); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(root, backupName, "resources", "app.asar"), []byte("tampered"), 0600)
	if err := apply(root, profile, m, payload, true, harden, replaceFile); err == nil {
		t.Fatal("tampered backup accepted")
	}
	expectState(t, root, m, "patched")
}
func TestManifestRejectsTraversalDuplicateAndMissingSecurity(t *testing.T) {
	_, _, m, _ := fixture(t)
	raw, _ := json.Marshal(m)
	if _, err := readManifest(raw); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../app.asar", "C:/app.asar", "resources/../app.asar", "resources\\app.asar", "resources/app.asar:stream"} {
		bad := m
		bad.Files = append([]patchFile{}, m.Files...)
		bad.Files[0].Path = name
		raw, _ := json.Marshal(bad)
		if _, err := readManifest(raw); err == nil {
			t.Fatal("accepted", name)
		}
	}
	bad := m
	bad.Files = append([]patchFile{}, m.Files...)
	bad.Files[1] = bad.Files[0]
	raw, _ = json.Marshal(bad)
	if _, err := readManifest(raw); err == nil {
		t.Fatal("duplicate accepted")
	}
	bad = m
	bad.Files = bad.Files[:2]
	raw, _ = json.Marshal(bad)
	if _, err := readManifest(raw); err == nil {
		t.Fatal("missing receipt accepted")
	}
}
func TestExactExecutableEditsAndCompressedPayload(t *testing.T) {
	original := []byte("prefix:OLDHASH:suffix")
	after := []byte("prefix:NEWHASH:suffix")
	f := patchFile{Before: digest(original), After: digest(after), Edits: []edit{{Offset: 7, Before: hex.EncodeToString([]byte("OLDHASH")), After: hex.EncodeToString([]byte("NEWHASH"))}}}
	got, err := patchedBytes(f, original, nil)
	if err != nil || !bytes.Equal(got, after) {
		t.Fatal(err)
	}
	f.Edits[0].Offset = 100
	if _, err := patchedBytes(f, original, nil); err == nil {
		t.Fatal("out of bounds accepted")
	}
	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	gz.Write(after)
	gz.Close()
	f.Edits = nil
	f.Payload = "file.gz"
	f.Compression = "gzip"
	payload := fstest.MapFS{"file.gz": &fstest.MapFile{Data: compressed.Bytes()}}
	got, err = patchedBytes(f, original, payload)
	if err != nil || !bytes.Equal(got, after) {
		t.Fatal(err)
	}
	payload["file.gz"] = &fstest.MapFile{Data: []byte("invalid gzip")}
	if _, err := patchedBytes(f, original, payload); err == nil {
		t.Fatal("invalid gzip accepted")
	}
}
func TestHardlinkedTargetRejected(t *testing.T) {
	root, _, m, _ := fixture(t)
	target := filepath.Join(root, "resources", "app.asar")
	if err := os.Link(target, filepath.Join(root, "other-link")); err != nil {
		t.Fatal(err)
	}
	if _, err := inspect(root, m); err == nil {
		t.Fatal("hardlinked program accepted")
	}
}
func TestInstallationLockIsExclusive(t *testing.T) {
	root := t.TempDir()
	unlock, err := lockInstallation(root)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if other, err := lockInstallation(root); err == nil {
		other()
		t.Fatal("concurrent patch accepted")
	}
}
