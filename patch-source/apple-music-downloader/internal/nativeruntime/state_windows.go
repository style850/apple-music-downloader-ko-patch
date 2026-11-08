//go:build windows

package nativeruntime

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func currentStateUserSID() (*windows.SID, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	return user.User.Sid, nil
}

func trustedStateSIDs() ([]*windows.SID, error) {
	user, err := currentStateUserSID()
	if err != nil {
		return nil, err
	}
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return nil, err
	}
	administrators, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return nil, err
	}
	return []*windows.SID{user, system, administrators}, nil
}

func privateStateSecurityAttributes(directory bool) (*windows.SecurityAttributes, error) {
	user, err := currentStateUserSID()
	if err != nil {
		return nil, err
	}
	flags := ""
	if directory {
		flags = "OICI"
	}
	sddl := "D:P(A;" + flags + ";FA;;;" + user.String() + ")(A;" + flags + ";FA;;;SY)(A;" + flags + ";FA;;;BA)"
	descriptor, err := windows.SecurityDescriptorFromString(sddl)
	if err != nil {
		return nil, err
	}
	return &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: descriptor}, nil
}

func fullStateControlEntry(sid *windows.SID, trusteeType windows.TRUSTEE_TYPE, inheritance uint32) windows.EXPLICIT_ACCESS {
	return windows.EXPLICIT_ACCESS{AccessPermissions: windows.GENERIC_ALL, AccessMode: windows.GRANT_ACCESS, Inheritance: inheritance, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: trusteeType, TrusteeValue: windows.TrusteeValueFromSID(sid)}}
}

func rejectStateReparseComponents(path string) error {
	volume := filepath.VolumeName(path)
	if volume == "" {
		return errors.New("state directory must be absolute")
	}
	current := volume + string(os.PathSeparator)
	for _, component := range strings.Split(strings.TrimPrefix(path, current), string(os.PathSeparator)) {
		if component == "" {
			continue
		}
		current = filepath.Join(current, component)
		pointer, err := windows.UTF16PtrFromString(current)
		if err != nil {
			return err
		}
		attributes, err := windows.GetFileAttributes(pointer)
		if err != nil || attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
			return errors.New("state directory has a reparse component")
		}
	}
	return nil
}

func openStateHandle(path string, access uint32, creation uint32, attributes *windows.SecurityAttributes) (windows.Handle, error) {
	pointer, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}
	return windows.CreateFile(pointer, access, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, attributes, creation, windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
}

func openStateDirectory(path string) (windows.Handle, error) {
	pointer, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}
	return windows.CreateFile(pointer, windows.GENERIC_READ|windows.READ_CONTROL|windows.WRITE_DAC, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
}

func openStatePatchDirectory(path string) (windows.Handle, error) {
	pointer, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}
	return windows.CreateFile(pointer, windows.READ_CONTROL|windows.WRITE_DAC, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
}

func openStatePatchFile(path string) (windows.Handle, error) {
	pointer, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return windows.InvalidHandle, err
	}
	return windows.CreateFile(pointer, windows.READ_CONTROL|windows.WRITE_DAC, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
}

func validateStateACL(handle windows.Handle, label string) error {
	trusted, err := trustedStateSIDs()
	if err != nil {
		return err
	}
	descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(trusted[0]) {
		return fmt.Errorf("%s owner is not the current user", label)
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PRESENT == 0 || control&windows.SE_DACL_PROTECTED == 0 {
		return fmt.Errorf("%s has an unsafe DACL", label)
	}
	dacl, _, err := descriptor.DACL()
	if err != nil || dacl == nil {
		return fmt.Errorf("%s has no DACL", label)
	}
	for index := uint16(0); index < dacl.AceCount; index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if windows.GetAce(dacl, uint32(index), &ace) != nil || ace == nil || ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			return fmt.Errorf("%s has an invalid DACL entry", label)
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		trustedSID := false
		for _, candidate := range trusted {
			trustedSID = trustedSID || sid.Equals(candidate)
		}
		if !trustedSID {
			return fmt.Errorf("%s grants access outside the trusted identities", label)
		}
	}
	return nil
}

func preparePrivateStateDirectory(path string) (string, error) {
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0700); err != nil {
		return "", err
	}
	if err := rejectStateReparseComponents(parent); err != nil {
		return "", err
	}
	attributes, err := privateStateSecurityAttributes(true)
	if err != nil {
		return "", err
	}
	pointer, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return "", err
	}
	if err := windows.CreateDirectory(pointer, attributes); err != nil && !errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		return "", err
	}
	if err := rejectStateReparseComponents(path); err != nil {
		return "", err
	}
	handle, err := openStateDirectory(path)
	if err != nil {
		return "", err
	}
	defer windows.CloseHandle(handle)
	info := windows.ByHandleFileInformation{}
	if windows.GetFileInformationByHandle(handle, &info) != nil || info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY == 0 || info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return "", errors.New("state directory is not a regular directory")
	}
	if err := validateStateACL(handle, "runtime state directory"); err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(path)
}

func createPrivateStateFile(path string) (*os.File, error) {
	attributes, err := privateStateSecurityAttributes(false)
	if err != nil {
		return nil, err
	}
	handle, err := openStateHandle(path, windows.GENERIC_WRITE|windows.READ_CONTROL, windows.CREATE_NEW, attributes)
	if err != nil {
		return nil, err
	}
	if err := validatePrivateStateHandle(handle, "runtime state file"); err != nil {
		_ = windows.CloseHandle(handle)
		return nil, err
	}
	return os.NewFile(uintptr(handle), path), nil
}

func openPrivateStateLock(path string) (*os.File, error) {
	attributes, err := privateStateSecurityAttributes(false)
	if err != nil {
		return nil, err
	}
	access := uint32(windows.GENERIC_READ | windows.GENERIC_WRITE | windows.READ_CONTROL)
	handle, err := openStateHandle(path, access, windows.CREATE_NEW, attributes)
	if errors.Is(err, windows.ERROR_FILE_EXISTS) || errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		handle, err = openStateHandle(path, access, windows.OPEN_EXISTING, nil)
	}
	if err != nil {
		return nil, err
	}
	if err := validatePrivateStateHandle(handle, "runtime state lock"); err != nil {
		_ = windows.CloseHandle(handle)
		return nil, err
	}
	return os.NewFile(uintptr(handle), path), nil
}

func validatePrivateStateHandle(handle windows.Handle, label string) error {
	info := windows.ByHandleFileInformation{}
	if err := windows.GetFileInformationByHandle(handle, &info); err != nil || info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0 || info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || info.NumberOfLinks != 1 {
		return fmt.Errorf("%s is not a private regular file", label)
	}
	return validateStateACL(handle, label)
}

func validatePrivateStateFile(path, label string) error {
	handle, err := openStateHandle(path, windows.GENERIC_READ|windows.READ_CONTROL, windows.OPEN_EXISTING, nil)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(handle)
	return validatePrivateStateHandle(handle, label)
}

func hardenStateACL(handle windows.Handle, directory bool) error {
	attributes, err := privateStateSecurityAttributes(directory)
	if err != nil {
		return err
	}
	descriptor := attributes.SecurityDescriptor
	dacl, _, err := descriptor.DACL()
	if err != nil || dacl == nil {
		return errors.New("private state DACL unavailable")
	}
	return windows.SetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
}

// HardenStateForPatch is for an offline patcher after it has stopped the app.
// It preserves bytes and only narrows access on the state directory and its
// direct sensitive files. A failure may leave already-hardened entries private.
func HardenStateForPatch(stateDir string) error {
	if !filepath.IsAbs(stateDir) || rejectStateReparseComponents(stateDir) != nil {
		return ErrInvalidState
	}
	directory, err := openStatePatchDirectory(stateDir)
	if err != nil {
		return ErrInvalidState
	}
	defer windows.CloseHandle(directory)
	directoryInfo := windows.ByHandleFileInformation{}
	if windows.GetFileInformationByHandle(directory, &directoryInfo) != nil || directoryInfo.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY == 0 || directoryInfo.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return ErrInvalidState
	}
	type candidate struct {
		name      string
		handle    windows.Handle
		directory bool
	}
	candidates := []candidate{{name: "runtime state directory", handle: directory, directory: true}}
	defer func() {
		for _, candidate := range candidates[1:] {
			_ = windows.CloseHandle(candidate.handle)
		}
	}()
	for _, name := range []string{"data.img", "control.secret", "native-runtime.lock"} {
		path := filepath.Join(stateDir, name)
		handle, err := openStatePatchFile(path)
		if errors.Is(err, windows.ERROR_FILE_NOT_FOUND) {
			continue
		}
		if err != nil {
			return ErrInvalidState
		}
		candidates = append(candidates, candidate{name: "runtime " + name, handle: handle})
	}
	// Validate every existing target before changing any DACL. Existing
	// inherited readers are accepted only for this explicit offline migration.
	for _, candidate := range candidates {
		if candidate.handle == directory {
			if err := validateStateOwner(candidate.handle, candidate.name); err != nil {
				return ErrInvalidState
			}
			continue
		}
		if err := validateStateFileForPatch(candidate.handle, candidate.name); err != nil {
			return ErrInvalidState
		}
	}
	for _, candidate := range candidates {
		if err := hardenStateACL(candidate.handle, candidate.directory); err != nil || validateStateACL(candidate.handle, candidate.name) != nil {
			return ErrInvalidState
		}
	}
	return nil
}

func validateStateOwner(handle windows.Handle, label string) error {
	user, err := currentStateUserSID()
	if err != nil {
		return err
	}
	descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user) {
		return fmt.Errorf("%s owner is not the current user", label)
	}
	return nil
}

func validateStateFileForPatch(handle windows.Handle, label string) error {
	info := windows.ByHandleFileInformation{}
	if err := windows.GetFileInformationByHandle(handle, &info); err != nil || info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0 || info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || info.NumberOfLinks != 1 {
		return fmt.Errorf("%s is not a regular non-reparse file", label)
	}
	return validateStateOwner(handle, label)
}
