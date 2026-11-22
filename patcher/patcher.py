"""Apply a UI-only Korean overlay to the installed app, with verified recovery."""
import argparse
from contextlib import contextmanager
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import tempfile

from archive import read as read_asar, write as write_asar, sha, patch_integrity_resource

VERSION = '3.0.1'
KNOWN_PATCHERS = {'3.0.0', VERSION}
APP = 'Apple Music Downloader Native.exe'
FILES = ('resources/app.asar', 'resources/native-package.json', APP)
SCRIPTS = tuple('src/renderer/'+name+'.js' for name in ('native-renderer','native-login','native-startup'))
BEGIN = b'\n/* AMDL_KOREAN_OVERLAY_R3_BEGIN */\n'
END = b'\n/* AMDL_KOREAN_OVERLAY_R3_END */\n'
BACKUP = '.amdl-ko-overlay-v3'


def safe(path, *, directory=False):
    path = Path(path)
    if not path.is_absolute() or str(path).startswith('\\\\'):
        raise ValueError('로컬 절대 경로만 사용할 수 있습니다.')
    for current in (*reversed(path.parents),path):
        if current.is_symlink() or current.is_junction():
            raise ValueError('연결된 파일·폴더에는 적용하지 않습니다.')
    if directory:
        if not path.is_dir():
            raise ValueError('설치 폴더를 찾지 못했습니다.')
    elif not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('일반 파일이 아니거나 파일을 찾지 못했습니다: '+path.name)
    return path


def bounded(path,limit):
    safe(path)
    if path.stat().st_size>limit:
        raise ValueError('지원 크기를 초과했습니다: '+path.name)
    with path.open('rb') as stream:
        value=stream.read(limit+1)
    if len(value)>limit:
        raise ValueError('읽는 중 파일이 변경됐습니다.')
    return value


def ensure_directory(path):
    if path.exists() or path.is_symlink() or path.is_junction():
        safe(path,directory=True)
        return
    ensure_directory(path.parent)
    path.mkdir()
    safe(path,directory=True)


def json_bytes(value):
    return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')


def atomic(path,data):
    safe(path.parent,directory=True)
    fd,name=tempfile.mkstemp(prefix='.amdl-ko-',suffix='.tmp',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        if path.exists():
            safe(path)
        os.replace(name,path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def transform(original,overlay):
    header,files,old_header=read_asar(original[FILES[0]])
    package=json.loads(files.get('package.json',b'{}'))
    receipt=json.loads(original[FILES[1]])
    version=package.get('version')
    if (package.get('name')!='applemusic-downloader-native' or package.get('main')!='src/main/native-main.js' or
            not isinstance(version,str) or receipt.get('version')!=version or receipt.get('schemaVersion')!=1 or
            not isinstance(receipt.get('ui'),dict)):
        raise ValueError('원본 앱의 구성 형식이 달라 적용하지 않았습니다.')
    for name,expected in receipt['ui'].items():
        if name not in files or sha(files[name])!=expected:
            raise ValueError('원본 UI 영수증과 실제 코드가 다릅니다: '+name)
    for script in SCRIPTS:
        html=script.replace('native-renderer.js','native-index.html').replace('native-login.js','native-login.html').replace('native-startup.js','native-startup.html')
        if script not in receipt['ui'] or html not in files or script.split('/')[-1].encode() not in files[html]:
            raise ValueError('지원하는 UI 진입점을 찾지 못했습니다: '+script)
        if BEGIN in files[script] or END in files[script]:
            raise ValueError('이전 한국어 패치의 백업을 확인해야 합니다. 업데이트된 원본을 다시 설치하거나 원본 복구를 사용하세요.')
        files[script]+=BEGIN+overlay+END
        receipt['ui'][script]=sha(files[script])
    result=write_asar(header,files)
    new_header=read_asar(result)[2]
    exe=patch_integrity_resource(original[APP],old_header,new_header)
    return {FILES[0]:result,FILES[1]:json_bytes(receipt),APP:exe},version


def snapshot(root):
    safe(root,directory=True)
    return {name:bounded(root/name,512*1024*1024 if name==APP else 64*1024*1024) for name in FILES}


def load_state(root):
    location=root/BACKUP/'state.json'
    if not location.exists():
        return None
    value=json.loads(bounded(location,1024*1024))
    transition=isinstance(value,dict) and 'transitionAfter' in value
    expected={'schema','patcher','version','baseline','before','after'}|({'transitionAfter'} if transition else set())
    groups=('before','after')+(('transitionAfter',) if transition else ())
    if (not isinstance(value,dict) or set(value)!=expected or
            value.get('schema')!=1 or value.get('patcher') not in KNOWN_PATCHERS or not isinstance(value.get('version'),str) or
            (transition and value['patcher']!=VERSION) or
            any(set(value.get(group,{}))!=set(FILES) for group in groups) or
            value.get('baseline')!=value['before'][FILES[0]] or
            any(not isinstance(h,str) or len(h)!=64 or any(c not in '0123456789abcdef' for c in h)
                for group in groups for h in value[group].values())):
        raise ValueError('한국어 패치의 복구 정보를 확인하지 못했습니다.')
    return value


def inspect(root):
    current=snapshot(root)
    hashes={name:sha(value) for name,value in current.items()}
    state=load_state(root)
    status='original'
    if state and hashes==state['after']:
        status='patched' if state['patcher']==VERSION else 'upgradable'
    elif state and state.get('transitionAfter') and hashes==state['transitionAfter']:
        status='upgradable'
    elif state and hashes==state['before']:
        status='restored'
    elif state and all(hashes[name] in (state['before'][name],state['after'][name]) or
                       hashes[name]==state.get('transitionAfter',{}).get(name) for name in FILES):
        status='interrupted'
    else:
        # An upstream update is a new baseline, never an excuse to restore old files.
        files=read_asar(current[FILES[0]])[1]
        if any(BEGIN in files.get(script,b'') for script in SCRIPTS):
            raise ValueError('패치 파일과 복구 정보가 일치하지 않습니다. 자동으로 덮어쓰지 않았습니다.')
    package=json.loads(read_asar(current[FILES[0]])[1].get('package.json',b'{}'))
    return current,state,{'state':status,'version':package.get('version'),'patcher':VERSION,
                          'appliedPatcher':state and state['patcher'],'directory':str(root)}


def ensure_stopped(root):
    if os.name!='nt':
        return
    # Process executable paths only; never read command lines, profiles or credentials.
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    class Entry(ctypes.Structure):
        _fields_=[('dwSize',wintypes.DWORD),('cntUsage',wintypes.DWORD),('pid',wintypes.DWORD),
                  ('heap',ctypes.c_size_t),('module',wintypes.DWORD),('threads',wintypes.DWORD),
                  ('parent',wintypes.DWORD),('priority',wintypes.LONG),('flags',wintypes.DWORD),('exe',wintypes.WCHAR*260)]
    kernel.CreateToolhelp32Snapshot.restype=wintypes.HANDLE
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    kernel.Process32FirstW.argtypes=[wintypes.HANDLE,ctypes.POINTER(Entry)]
    kernel.Process32NextW.argtypes=kernel.Process32FirstW.argtypes
    kernel.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
    handle=kernel.CreateToolhelp32Snapshot(2,0)
    if handle==ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        entry=Entry(); entry.dwSize=ctypes.sizeof(Entry)
        more=kernel.Process32FirstW(handle,ctypes.byref(entry))
        while more:
            process=kernel.OpenProcess(0x1000,False,entry.pid)
            if process:
                try:
                    length=wintypes.DWORD(32768); path=ctypes.create_unicode_buffer(length.value)
                    if kernel.QueryFullProcessImageNameW(process,0,path,ctypes.byref(length)):
                        try:
                            Path(path.value).relative_to(root)
                        except ValueError:
                            pass
                        else:
                            raise ValueError('앱과 관련 서비스를 완전히 종료한 뒤 다시 적용해 주세요.')
                finally:
                    kernel.CloseHandle(process)
            more=kernel.Process32NextW(handle,ctypes.byref(entry))
        error=ctypes.get_last_error()
        if error!=18:  # ERROR_NO_MORE_FILES is the only successful enumeration end.
            raise ctypes.WinError(error)
    finally:
        kernel.CloseHandle(handle)


@contextmanager
def locked(root):
    safe(root,directory=True)
    path=root/'.amdl-ko-overlay.lock'
    if path.exists():
        safe(path)
    stream=path.open('a+b')
    try:
        stream.seek(0); stream.write(b'0'); stream.flush(); stream.seek(0)
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(stream.fileno(),msvcrt.LK_NBLCK,1)
        yield
    finally:
        stream.close()


def apply(root,restore=False,*,replace=atomic):
    root=Path(os.path.abspath(root))
    with locked(root):
        ensure_stopped(root)
        original,state,status=inspect(root)
        original_state=None
        if restore:
            if status['state'] not in ('patched','upgradable','interrupted'):
                raise ValueError('현재 설치본과 일치하는 적용 상태가 없습니다. 이전 버전으로 되돌리지 않았습니다.')
            target={name:bounded(root/BACKUP/state['baseline']/name,512*1024*1024) for name in FILES}
            if {name:sha(value) for name,value in target.items()}!=state['before']:
                raise ValueError('원본 백업이 변경돼 복구하지 않았습니다.')
            publish_before=True
        else:
            if status['state']=='patched':
                if state and state.get('transitionAfter'):
                    state={key:value for key,value in state.items() if key!='transitionAfter'}
                    atomic(root/BACKUP/'state.json',json_bytes(state))
                    return dict(status,patcher=VERSION,message='한국어 패치 업데이트를 마무리했습니다.')
                return dict(status,message='이미 한국어 패치가 적용되어 있습니다.')
            if status['state']=='interrupted':
                raise ValueError('이전 적용이 중단됐습니다. 원본 복구 후 다시 적용하세요.')
            overlay=(Path(__file__).parent/'korean-ui.js').read_bytes()
            if status['state']=='upgradable':
                pending=bool(state.get('transitionAfter'))
                baseline={name:bounded(root/BACKUP/state['baseline']/name,512*1024*1024) for name in FILES}
                if {name:sha(value) for name,value in baseline.items()}!=state['before']:
                    raise ValueError('원본 백업이 변경돼 업데이트하지 않았습니다.')
                target,version=transform(baseline,overlay)
                if version!=state['version']:
                    raise ValueError('원본 백업의 앱 버전이 복구 정보와 다릅니다.')
                state=dict(schema=1,patcher=VERSION,version=version,baseline=state['baseline'],
                           before=state['before'],after={name:sha(value) for name,value in target.items()})
                if not pending:
                    original_state=bounded(root/BACKUP/'state.json',1024*1024)
                    transition=dict(state,transitionAfter={name:sha(value) for name,value in original.items()})
                    atomic(root/BACKUP/'state.json',json_bytes(transition))
                publish_before=False
            else:
                target,version=transform(original,overlay)
                baseline=sha(original[FILES[0]])
                folder=root/BACKUP/baseline
                ensure_directory(folder)
                for name,data in original.items():
                    path=folder/name
                    ensure_directory(path.parent)
                    if path.exists():
                        if bounded(path,512*1024*1024)!=data:
                            raise ValueError('기존 원본 백업이 일치하지 않습니다.')
                    else:
                        atomic(path,data)
                state=dict(schema=1,patcher=VERSION,version=version,baseline=baseline,
                           before={name:sha(value) for name,value in original.items()},after={name:sha(value) for name,value in target.items()})
                publish_before=True
        # A first application publishes recovery metadata before replacements.  An
        # overlay update keeps its prior receipt until the new files are verified.
        if publish_before:
            atomic(root/BACKUP/'state.json',json_bytes(state))
        if {name:sha(value) for name,value in snapshot(root).items()}!={name:sha(value) for name,value in original.items()}:
            raise ValueError('확인 중 설치 파일이 변경돼 적용하지 않았습니다.')
        completed=[]
        try:
            for name,data in target.items():
                if bounded(root/name,512*1024*1024)!=original[name]:
                    raise ValueError('적용 중 원본 파일이 변경됐습니다.')
                completed.append(name)
                replace(root/name,data)
            if {name:sha(value) for name,value in snapshot(root).items()}!={name:sha(value) for name,value in target.items()}:
                raise ValueError('저장 결과 검증에 실패했습니다.')
        except Exception as error:
            for name in reversed(completed):
                current=bounded(root/name,512*1024*1024)
                if current not in (original[name],target[name]):
                    raise RuntimeError('외부에서 파일이 변경돼 자동 복구를 중단했습니다. 원본 백업을 보존했습니다.') from error
                atomic(root/name,original[name])
            if original_state is not None:
                atomic(root/BACKUP/'state.json',original_state)
            raise
        if not publish_before:
            atomic(root/BACKUP/'state.json',json_bytes(state))
        return dict(version=state['version'],patcher=VERSION,state='restored' if restore else 'patched',
                    message='원본 프로그램 파일을 복구했습니다.' if restore else ('한국어 패치를 업데이트했습니다. 기존 바로가기로 앱을 실행하세요.' if status['state']=='upgradable' else '한국어 패치를 적용했습니다. 기존 바로가기로 앱을 실행하세요.'))


def main():
    parser=argparse.ArgumentParser(description='Apple Music Downloader 버전 적응형 한국어 UI 패치')
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--check',action='store_true')
    mode.add_argument('--apply',action='store_true')
    mode.add_argument('--restore',action='store_true')
    parser.add_argument('--install-dir',type=Path,default=Path(os.environ.get('LOCALAPPDATA',''))/'Programs/Apple Music Downloader Native')
    args=parser.parse_args()
    if not (args.check or args.apply or args.restore):
        import tkinter as tk
        from tkinter import filedialog,messagebox
        window=tk.Tk(); window.withdraw()
        if not (args.install_dir/APP).is_file():
            selected=filedialog.askopenfilename(title='Apple Music Downloader 실행 파일 선택',filetypes=[('원본 앱',APP)])
            if not selected:
                return 0
            args.install_dir=Path(selected).parent
        try:
            status=inspect(args.install_dir)[2]
            restore=status['state'] in ('patched','interrupted')
            operation='원본 복구' if restore else ('한국어 패치 업데이트' if status['state']=='upgradable' else '한국어 패치 적용')
            if messagebox.askyesno(operation,f"설치 버전: {status['version']}\n{args.install_dir}\n\n{operation}을 진행할까요?\n로그인·다운로드 데이터와 최신 앱 기능은 유지됩니다.\n앱 업데이트 후에는 같은 패처를 다시 실행해 주세요."):
                result=apply(args.install_dir,restore)
                messagebox.showinfo('완료',result['message'])
        except Exception as error:
            messagebox.showerror('패치를 완료하지 못했습니다',str(error))
            return 1
        finally:
            window.destroy()
        return 0
    try:
        result=inspect(args.install_dir)[2] if args.check else apply(args.install_dir,args.restore)
        print(json.dumps(result,ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error),file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
