import copy
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import archive
import patcher


def asar_files(version='1.0.4'):
    files={'package.json':json.dumps(dict(name='applemusic-downloader-native',main='src/main/native-main.js',version=version)).encode(),
           'src/main/native-main.js':b'upstream main unchanged', 'src/preload/native-preload.js':b'upstream bridge unchanged'}
    for script in patcher.SCRIPTS:
        html=script.replace('native-renderer.js','native-index.html').replace('native-login.js','native-login.html').replace('native-startup.js','native-startup.html')
        files[script]=b"(() => { const features = 'upstream latest logic'; })();"
        files[html]=b'<html><body><script src="'+script.split('/')[-1].encode()+b'"></script></body></html>'
    header={'files':{}}
    for name,value in files.items():
        node=header
        parts=name.split('/')
        for part in parts[:-1]:
            node=node['files'].setdefault(part,{'files':{}})
        node['files'][parts[-1]]={'size':len(value),'offset':'0','integrity':{'algorithm':'SHA256','hash':archive.sha(value),'blockSize':4194304,'blocks':[archive.sha(value)]}}
    return archive.write(header,files),files


def exe(hash_value):
    payload=json.dumps([{'file':'resources\\app.asar','alg':'SHA256','value':hash_value},
                        {'file':'resources\\default_app.asar','alg':'SHA256','value':'f'*64}],separators=(',',':')).encode()
    value=bytearray(0x400+len(payload))
    value[:2]=b'MZ'; struct.pack_into('<I',value,0x3c,0x80); value[0x80:0x84]=b'PE\0\0'
    struct.pack_into('<H',value,0x86,1); struct.pack_into('<H',value,0x94,240)
    struct.pack_into('<H',value,0x98,0x20b)
    struct.pack_into('<II',value,0x98+112+16,0x1000,len(value)-0x200)
    section=0x98+240
    value[section:section+8]=b'.rsrc\0\0\0'
    struct.pack_into('<4I',value,section+8,len(value)-0x200,0x1000,len(value)-0x200,0x200)
    struct.pack_into('<HH',value,0x200+12,0,1)
    struct.pack_into('<II',value,0x210,1,0x20)
    struct.pack_into('<II',value,0x220,0x1200,len(payload))
    value[0x400:]=payload
    return bytes(value)


def install(root,version='1.0.4'):
    raw,files=asar_files(version)
    receipt=dict(schemaVersion=1,version=version,files={'bin/service.exe':{'sha256':'a'*64,'size':123}},
                 ui={name:archive.sha(value) for name,value in files.items() if name!='package.json'})
    values={patcher.FILES[0]:raw,patcher.FILES[1]:patcher.json_bytes(receipt),patcher.APP:exe(archive.read(raw)[2])}
    for name,value in values.items():
        target=root/name; target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(value)
    (root/'resources/bin').mkdir(exist_ok=True)
    (root/'resources/bin/service.exe').write_bytes(b'new upstream backend must remain')
    return values


def legacy_patch(root):
    original=patcher.snapshot(root)
    target,version=patcher.transform(original,b'console.log("3.0.0 overlay");')
    baseline=archive.sha(original[patcher.FILES[0]])
    folder=root/patcher.BACKUP/baseline
    for name,value in original.items():
        path=folder/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(value)
    state=dict(schema=1,patcher='3.0.0',version=version,baseline=baseline,
               before={name:archive.sha(value) for name,value in original.items()},
               after={name:archive.sha(value) for name,value in target.items()})
    patcher.atomic(root/patcher.BACKUP/'state.json',patcher.json_bytes(state))
    for name,value in target.items():
        patcher.atomic(root/name,value)
    return original,target,state


def interrupted_upgrade(root,changed):
    original,old_target,old_state=legacy_patch(root)
    overlay=(Path(patcher.__file__).parent/'korean-ui.js').read_bytes()
    target,version=patcher.transform(original,overlay)
    state=dict(schema=1,patcher=patcher.VERSION,version=version,baseline=old_state['baseline'],
               before=old_state['before'],after={name:archive.sha(value) for name,value in target.items()},
               transitionAfter=old_state['after'])
    patcher.atomic(root/patcher.BACKUP/'state.json',patcher.json_bytes(state))
    for name in patcher.FILES[:changed]:
        patcher.atomic(root/name,target[name])
    return original,target


class PatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.values=install(self.root)

    def test_preserves_members_all_upstream_logic_and_native_metadata(self):
        changed,version=patcher.transform(self.values,b'console.log("overlay");')
        self.assertEqual('1.0.4',version)
        before=archive.read(self.values[patcher.FILES[0]])[1]
        after=archive.read(changed[patcher.FILES[0]])[1]
        self.assertEqual(set(before),set(after))
        for name in before:
            self.assertEqual(before[name],after[name].split(patcher.BEGIN)[0] if name in patcher.SCRIPTS else after[name])
        r1=json.loads(self.values[patcher.FILES[1]]); r2=json.loads(changed[patcher.FILES[1]])
        self.assertEqual(r1['files'],r2['files']); self.assertEqual(r1['version'],r2['version'])
        self.assertEqual(3,sum(r1['ui'][key]!=value for key,value in r2['ui'].items()))
        self.assertEqual(len(self.values[patcher.APP]),len(changed[patcher.APP]))

    def test_same_patcher_accepts_new_version_and_keeps_service(self):
        for version in ('1.0.5-beta.5','1.9.0'):
            install(self.root,version)
            result=patcher.apply(self.root)
            self.assertEqual(version,result['version'])
            self.assertEqual('patched',patcher.inspect(self.root)[2]['state'])
            self.assertEqual(b'new upstream backend must remain',(self.root/'resources/bin/service.exe').read_bytes())

    def test_apply_repeat_restore_preserves_original_bytes(self):
        patcher.apply(self.root)
        self.assertEqual('patched',patcher.apply(self.root)['state'])
        patcher.apply(self.root,True)
        self.assertEqual(self.values,patcher.snapshot(self.root))

    def test_legacy_overlay_upgrades_from_verified_original_and_restores(self):
        original,old_target,old_state=legacy_patch(self.root)
        self.assertEqual('upgradable',patcher.inspect(self.root)[2]['state'])
        result=patcher.apply(self.root)
        state=patcher.load_state(self.root)
        self.assertEqual('patched',result['state'])
        self.assertEqual(patcher.VERSION,state['patcher'])
        self.assertEqual(old_state['baseline'],state['baseline'])
        self.assertEqual(old_state['before'],state['before'])
        self.assertNotEqual(old_target,patcher.snapshot(self.root))
        patcher.apply(self.root,True)
        self.assertEqual(original,patcher.snapshot(self.root))

    def test_legacy_upgrade_failure_keeps_old_overlay_recoverable(self):
        original,old_target,_=legacy_patch(self.root)
        calls=[]
        def fail_second(path,data):
            calls.append(path)
            if len(calls)==2:
                raise OSError('simulated locked file')
            patcher.atomic(path,data)
        with self.assertRaisesRegex(OSError,'locked'):
            patcher.apply(self.root,replace=fail_second)
        self.assertEqual(old_target,patcher.snapshot(self.root))
        self.assertEqual('upgradable',patcher.inspect(self.root)[2]['state'])
        self.assertEqual('3.0.0',patcher.load_state(self.root)['patcher'])
        self.assertNotIn('transitionAfter',patcher.load_state(self.root))
        patcher.apply(self.root,True)
        self.assertEqual(original,patcher.snapshot(self.root))

    def test_interrupted_upgrade_restores_or_retries_safely(self):
        for changed in (1,2):
            root=self.root/f'partial-{changed}'; root.mkdir(); install(root)
            original,_=interrupted_upgrade(root,changed)
            self.assertEqual('interrupted',patcher.inspect(root)[2]['state'])
            patcher.apply(root,True)
            self.assertEqual(original,patcher.snapshot(root))
        root=self.root/'retry'; root.mkdir(); install(root)
        _,target=interrupted_upgrade(root,0)
        self.assertEqual('upgradable',patcher.inspect(root)[2]['state'])
        patcher.apply(root)
        self.assertEqual(target,patcher.snapshot(root))
        self.assertNotIn('transitionAfter',patcher.load_state(root))
        root=self.root/'complete'; root.mkdir(); install(root)
        _,target=interrupted_upgrade(root,3)
        self.assertEqual('patched',patcher.inspect(root)[2]['state'])
        patcher.apply(root)
        self.assertEqual(target,patcher.snapshot(root))
        self.assertNotIn('transitionAfter',patcher.load_state(root))

    def test_mixed_legacy_target_never_upgrades_and_can_restore(self):
        original,_,_=legacy_patch(self.root)
        patcher.atomic(self.root/patcher.FILES[0],original[patcher.FILES[0]])
        self.assertEqual('interrupted',patcher.inspect(self.root)[2]['state'])
        with self.assertRaisesRegex(ValueError,'중단'):
            patcher.apply(self.root)
        patcher.apply(self.root,True)
        self.assertEqual(original,patcher.snapshot(self.root))

    def test_state_only_accepts_known_revisions_and_exact_schema(self):
        patcher.apply(self.root)
        location=self.root/patcher.BACKUP/'state.json'
        state=json.loads(location.read_text(encoding='utf-8'))
        state['patcher']='3.0.2'
        location.write_bytes(patcher.json_bytes(state))
        with self.assertRaisesRegex(ValueError,'복구 정보'):
            patcher.load_state(self.root)
        state['patcher']=patcher.VERSION; state['unexpected']=True
        location.write_bytes(patcher.json_bytes(state))
        with self.assertRaisesRegex(ValueError,'복구 정보'):
            patcher.load_state(self.root)

    def test_transition_state_rejects_unknown_hash_or_field(self):
        interrupted_upgrade(self.root,0)
        location=self.root/patcher.BACKUP/'state.json'
        state=json.loads(location.read_text(encoding='utf-8'))
        state['transitionAfter'][patcher.FILES[0]]='z'*64
        location.write_bytes(patcher.json_bytes(state))
        with self.assertRaisesRegex(ValueError,'복구 정보'):
            patcher.load_state(self.root)
        state['transitionAfter'][patcher.FILES[0]]='0'*64; state['unexpected']=True
        location.write_bytes(patcher.json_bytes(state))
        with self.assertRaisesRegex(ValueError,'복구 정보'):
            patcher.load_state(self.root)

    def test_restore_never_downgrades_after_upstream_update(self):
        patcher.apply(self.root)
        fresh=install(self.root,'1.0.5-beta.5')
        with self.assertRaisesRegex(ValueError,'이전 버전'):
            patcher.apply(self.root,True)
        self.assertEqual(fresh,patcher.snapshot(self.root))
        patcher.apply(self.root)
        patcher.apply(self.root,True)
        self.assertEqual(fresh,patcher.snapshot(self.root))

    def test_tampered_backup_is_not_restored(self):
        patcher.apply(self.root)
        state=patcher.load_state(self.root)
        backup=self.root/patcher.BACKUP/state['baseline']/patcher.FILES[0]
        backup.write_bytes(b'bad')
        with self.assertRaisesRegex(ValueError,'백업'):
            patcher.apply(self.root,True)

    def test_replacement_failure_rolls_back(self):
        calls=[]
        def fail_second(path,data):
            calls.append(path)
            if len(calls)==2:
                raise OSError('simulated locked file')
            patcher.atomic(path,data)
        with self.assertRaisesRegex(OSError,'locked'):
            patcher.apply(self.root,replace=fail_second)
        self.assertEqual(self.values,patcher.snapshot(self.root))

    def test_replacement_that_commits_then_raises_is_rolled_back(self):
        calls=[]
        def fail_second(path,data):
            calls.append(path)
            patcher.atomic(path,data)
            if len(calls)==2:
                raise OSError('after commit')
        with self.assertRaisesRegex(OSError,'after commit'):
            patcher.apply(self.root,replace=fail_second)
        self.assertEqual(self.values,patcher.snapshot(self.root))

    def test_backup_junction_is_rejected_before_creating_children(self):
        backup=self.root/patcher.BACKUP
        backup.mkdir()
        with patch.object(Path,'is_junction',autospec=True,side_effect=lambda p:p==backup):
            with self.assertRaisesRegex(ValueError,'연결'):
                patcher.apply(self.root)
        self.assertEqual([],list(backup.iterdir()))

    def test_mismatched_receipt_or_launcher_is_rejected(self):
        for target in (patcher.FILES[0],patcher.APP):
            values=copy.deepcopy(self.values)
            if target==patcher.APP:
                values[target]=exe('0'*64)
            else:
                raw=bytearray(values[target]); raw[-1]^=1; values[target]=bytes(raw)
            with self.assertRaises(ValueError):
                patcher.transform(values,b'overlay')

    def test_unknown_ui_structure_is_rejected(self):
        values=copy.deepcopy(self.values)
        receipt=json.loads(values[patcher.FILES[1]])
        del receipt['ui'][patcher.SCRIPTS[0]]
        values[patcher.FILES[1]]=patcher.json_bytes(receipt)
        with self.assertRaisesRegex(ValueError,'진입점'):
            patcher.transform(values,b'overlay')

    def test_arbitrary_binary_hash_occurrence_is_not_patched(self):
        with self.assertRaises(ValueError):
            archive.patch_integrity_resource(b'MZ'+b'0'*4096,'0'*64,'1'*64)

    def test_linked_install_is_rejected(self):
        with patch.object(Path,'is_junction',autospec=True,side_effect=lambda p:p==self.root/'resources'):
            with self.assertRaisesRegex(ValueError,'연결'):
                patcher.snapshot(self.root)

    def test_unknown_asar_trailing_payload_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'알 수 없는'):
            archive.read(self.values[patcher.FILES[0]]+b'future-extension')

    def test_signed_original_executable_is_not_modified(self):
        signed=bytearray(self.values[patcher.APP])
        struct.pack_into('<II',signed,0x98+112+32,0x500,64)
        with self.assertRaisesRegex(ValueError,'서명된'):
            archive.patch_integrity_resource(bytes(signed),'0'*64,'1'*64)

    @unittest.skipUnless(patcher.os.name=='nt','Windows enumeration contract')
    def test_process_enumeration_error_blocks_installation(self):
        kernel=Mock()
        kernel.CreateToolhelp32Snapshot.return_value=1
        kernel.Process32FirstW.return_value=0
        with patch('patcher.ctypes.WinDLL',return_value=kernel),patch('patcher.ctypes.get_last_error',return_value=5):
            with self.assertRaises(OSError):
                patcher.ensure_stopped(self.root)


if __name__=='__main__':
    unittest.main()
