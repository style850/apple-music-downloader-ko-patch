//go:build windows

package nativeruntime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestPrivateStateDirectoryDoesNotInheritParentReaders(t *testing.T) {
	parent := t.TempDir()
	handle, err := openStateDirectory(parent)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	user, err := currentStateUserSID()
	if err != nil {
		t.Fatal(err)
	}
	world, err := windows.CreateWellKnownSid(windows.WinWorldSid)
	if err != nil {
		t.Fatal(err)
	}
	entries := []windows.EXPLICIT_ACCESS{
		fullStateControlEntry(user, windows.TRUSTEE_IS_USER, windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT),
		{AccessPermissions: windows.GENERIC_READ, AccessMode: windows.GRANT_ACCESS, Inheritance: windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: windows.TRUSTEE_IS_WELL_KNOWN_GROUP, TrusteeValue: windows.TrusteeValueFromSID(world)}},
	}
	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION, nil, nil, acl, nil); err != nil {
		t.Fatal(err)
	}

	state, err := preparePrivateStateDirectory(filepath.Join(parent, "runtime"))
	if err != nil {
		t.Fatal(err)
	}
	file, err := createPrivateStateFile(filepath.Join(state, "data.img"))
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := validatePrivateStateFile(filepath.Join(state, "data.img"), "runtime data image"); err != nil {
		t.Fatalf("state file inherited parent reader: %v", err)
	}
	directory, err := openStateDirectory(state)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(directory)
	if err := validateStateACL(directory, "runtime state directory"); err != nil {
		t.Fatalf("state directory inherited parent reader: %v", err)
	}
}

func TestExistingStateDirectoryWithInheritedReaderFailsClosed(t *testing.T) {
	parent := t.TempDir()
	handle, err := openStateDirectory(parent)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	user, err := currentStateUserSID()
	if err != nil {
		t.Fatal(err)
	}
	world, err := windows.CreateWellKnownSid(windows.WinWorldSid)
	if err != nil {
		t.Fatal(err)
	}
	entries := []windows.EXPLICIT_ACCESS{
		fullStateControlEntry(user, windows.TRUSTEE_IS_USER, windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT),
		{AccessPermissions: windows.GENERIC_READ, AccessMode: windows.GRANT_ACCESS, Inheritance: windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: windows.TRUSTEE_IS_WELL_KNOWN_GROUP, TrusteeValue: windows.TrusteeValueFromSID(world)}},
	}
	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION, nil, nil, acl, nil); err != nil {
		t.Fatal(err)
	}
	if err := windows.CreateDirectory(windows.StringToUTF16Ptr(filepath.Join(parent, "runtime")), nil); err != nil {
		t.Fatal(err)
	}
	if _, err := preparePrivateStateDirectory(filepath.Join(parent, "runtime")); err == nil {
		t.Fatal("existing state directory with inherited reader accepted")
	}
}

func TestHardenStateForPatchPreservesExistingState(t *testing.T) {
	manifest := testBundle(t)
	bundle, err := LoadBundle(context.Background(), manifest)
	if err != nil {
		t.Fatal(err)
	}
	parent := t.TempDir()
	parentHandle, err := openStateDirectory(parent)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(parentHandle)
	user, err := currentStateUserSID()
	if err != nil {
		t.Fatal(err)
	}
	world, err := windows.CreateWellKnownSid(windows.WinWorldSid)
	if err != nil {
		t.Fatal(err)
	}
	acl, err := windows.ACLFromEntries([]windows.EXPLICIT_ACCESS{
		fullStateControlEntry(user, windows.TRUSTEE_IS_USER, windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT),
		{AccessPermissions: windows.GENERIC_READ, AccessMode: windows.GRANT_ACCESS, Inheritance: windows.SUB_CONTAINERS_AND_OBJECTS_INHERIT, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: windows.TRUSTEE_IS_WELL_KNOWN_GROUP, TrusteeValue: windows.TrusteeValueFromSID(world)}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := windows.SetSecurityInfo(parentHandle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION, nil, nil, acl, nil); err != nil {
		t.Fatal(err)
	}
	state := filepath.Join(parent, "runtime")
	if err := windows.CreateDirectory(windows.StringToUTF16Ptr(state), nil); err != nil {
		t.Fatal(err)
	}
	image, err := os.ReadFile(filepath.Join(filepath.Dir(manifest), "guest", "blank.img"))
	if err != nil {
		t.Fatal(err)
	}
	contents := map[string][]byte{"data.img": image, "control.secret": []byte(strings.Repeat("a", 64)), "native-runtime.lock": nil}
	for name, value := range contents {
		if err := os.WriteFile(filepath.Join(state, name), value, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := HardenStateForPatch(state); err != nil {
		t.Fatal(err)
	}
	for name, want := range contents {
		got, err := os.ReadFile(filepath.Join(state, name))
		if err != nil || string(got) != string(want) {
			t.Fatalf("%s changed during hardening", name)
		}
		if err := validatePrivateStateFile(filepath.Join(state, name), name); err != nil {
			t.Fatalf("%s remained accessible: %v", name, err)
		}
	}
	lease, err := prepareState(context.Background(), bundle, state)
	if err != nil {
		t.Fatalf("hardened state rejected: %v", err)
	}
	_ = lease.Close()
}

func TestHardenStateForPatchKeepsRuntimeInputsReadable(t *testing.T) {
	manifest := testBundle(t)
	bundle, err := LoadBundle(context.Background(), manifest)
	if err != nil {
		t.Fatal(err)
	}
	state := filepath.Join(t.TempDir(), "runtime")
	lease, err := prepareState(context.Background(), bundle, state)
	if err != nil {
		t.Fatal(err)
	}
	if err := prepareRuntimeInputs(context.Background(), bundle, state); err != nil {
		_ = lease.Close()
		t.Fatal(err)
	}
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	directory := bundle.runtimeInputsDirectory()
	inputs := []string{"kernel", "firmware/bios-256k.bin"}
	before := map[string][]byte{}
	for _, name := range inputs {
		file := filepath.Join(state, directory, filepath.FromSlash(name))
		before[name], err = os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
	}
	root, err := openStatePatchDirectory(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := hardenStateACL(root, false); err != nil {
		_ = windows.CloseHandle(root)
		t.Fatal(err)
	}
	if err := windows.CloseHandle(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.ReadFile(filepath.Join(state, directory, "kernel")); err == nil {
		t.Fatal("old non-inheriting runtime DACL did not reproduce unreadable cached input")
	}
	if err := HardenStateForPatch(state); err != nil {
		t.Fatal(err)
	}
	for _, name := range inputs {
		file := filepath.Join(state, directory, filepath.FromSlash(name))
		after, err := os.ReadFile(file)
		if err != nil || string(after) != string(before[name]) {
			t.Fatalf("runtime input %s changed or became unreadable: %v", name, err)
		}
	}
	if err := prepareRuntimeInputs(context.Background(), bundle, state); err != nil {
		t.Fatalf("hardened runtime inputs rejected: %v", err)
	}
	world, err := windows.CreateWellKnownSid(windows.WinWorldSid)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range inputs {
		file := filepath.Join(state, directory, filepath.FromSlash(name))
		handle, err := openStatePatchFile(file)
		if err != nil {
			t.Fatal(err)
		}
		descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			_ = windows.CloseHandle(handle)
			t.Fatal(err)
		}
		dacl, _, err := descriptor.DACL()
		if err != nil {
			_ = windows.CloseHandle(handle)
			t.Fatal(err)
		}
		for index := uint16(0); index < dacl.AceCount; index++ {
			var ace *windows.ACCESS_ALLOWED_ACE
			if windows.GetAce(dacl, uint32(index), &ace) != nil {
				_ = windows.CloseHandle(handle)
				t.Fatal("runtime input DACL is unreadable")
			}
			if (*windows.SID)(unsafe.Pointer(&ace.SidStart)).Equals(world) {
				_ = windows.CloseHandle(handle)
				t.Fatal("runtime input still grants World access")
			}
		}
		if err := windows.CloseHandle(handle); err != nil {
			t.Fatal(err)
		}
	}
	handle, err := openStateDirectory(state)
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	dacl, _, err := descriptor.DACL()
	if err != nil {
		t.Fatal(err)
	}
	for index := uint16(0); index < dacl.AceCount; index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if windows.GetAce(dacl, uint32(index), &ace) != nil || ace.Header.AceFlags&(windows.OBJECT_INHERIT_ACE|windows.CONTAINER_INHERIT_ACE) != windows.OBJECT_INHERIT_ACE|windows.CONTAINER_INHERIT_ACE {
			t.Fatal("runtime directory ACL does not inherit to runtime inputs")
		}
	}
}
