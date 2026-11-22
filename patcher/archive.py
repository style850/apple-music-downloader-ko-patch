"""Small bounded ASAR reader/writer; never execute code from the target archive."""
import copy
import hashlib
import json
import struct

LIMIT = 64 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(name):
    return (isinstance(name, str) and name and not name.startswith('/') and
            not any(c in name for c in '\\:\0') and
            all(part not in ('', '.', '..') for part in name.split('/')))


def members(header):
    def walk(node, prefix=''):
        if not isinstance(node, dict) or not isinstance(node.get('files'), dict):
            raise ValueError('ASAR 폴더 형식이 다릅니다.')
        for key, value in node['files'].items():
            name = prefix + key
            if not relative(name) or '/' in key or not isinstance(value, dict):
                raise ValueError('ASAR 경로가 올바르지 않습니다.')
            if 'files' in value:
                yield from walk(value, name + '/')
            else:
                if 'link' in value or value.get('unpacked'):
                    raise ValueError('외부 파일·링크가 있는 ASAR은 지원하지 않습니다.')
                yield name, value
    return list(walk(header))


def read(data):
    if not 16 <= len(data) <= LIMIT:
        raise ValueError('ASAR 크기를 확인하지 못했습니다.')
    size_size, header_size, payload_size, json_size = struct.unpack_from('<4I', data)
    if size_size != 4 or payload_size != header_size - 4 or not 0 < json_size <= header_size - 8:
        raise ValueError('지원하지 않는 ASAR 헤더입니다.')
    if header_size > len(data)-8 or header_size > 8*1024*1024:
        raise ValueError('ASAR 헤더가 너무 큽니다.')
    header_bytes = data[16:16+json_size]
    header = json.loads(header_bytes.decode('utf-8'))
    files, intervals = {}, []
    for name, info in members(header):
        size = info.get('size')
        offset = info.get('offset')
        if type(size) is not int or size < 0 or not isinstance(offset, str) or not offset.isdecimal():
            raise ValueError('ASAR 파일 크기·위치가 올바르지 않습니다.')
        start = 8 + header_size + int(offset)
        if start < 8+header_size or start+size > len(data):
            raise ValueError('ASAR 파일 범위가 잘못됐습니다.')
        value = data[start:start+size]
        integrity = info.get('integrity')
        if integrity is not None:
            block = integrity.get('blockSize')
            if (integrity.get('algorithm') != 'SHA256' or integrity.get('hash') != sha(value) or
                    type(block) is not int or block <= 0 or block > LIMIT or
                    integrity.get('blocks') != [sha(value[i:i+block]) for i in range(0,len(value),block)]):
                raise ValueError('ASAR 내부 파일 무결성 검증에 실패했습니다: ' + name)
        intervals.append((start, start+size))
        files[name] = value
    intervals.sort()
    cursor=8+header_size
    for start,end in intervals:
        if start!=cursor:
            raise ValueError('ASAR 파일 범위에 중복 또는 알 수 없는 데이터가 있습니다.')
        cursor=end
    if cursor!=len(data):
        raise ValueError('ASAR 끝에 알 수 없는 데이터가 있습니다.')
    return header, files, sha(header_bytes)


def write(header, files):
    result_header = copy.deepcopy(header)
    payload, offset = [], 0
    for name, info in members(result_header):
        value = files[name]
        info['size'], info['offset'] = len(value), str(offset)
        if 'integrity' in info:
            block = info['integrity']['blockSize']
            info['integrity'].update(hash=sha(value), blocks=[sha(value[i:i+block]) for i in range(0,len(value),block)])
        payload.append(value)
        offset += len(value)
    encoded = json.dumps(result_header, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    string = struct.pack('<I',len(encoded)) + encoded
    string += b'\0' * (-len(string) % 4)
    header_pickle = struct.pack('<I',len(string)) + string
    result = struct.pack('<II',4,len(header_pickle)) + header_pickle + b''.join(payload)
    if len(result) > LIMIT:
        raise ValueError('결과 ASAR이 너무 큽니다.')
    read(result)
    return result


def patch_integrity_resource(exe, before, after):
    """Locate the PE resource tree, then replace only the matching ASAR hash."""
    if exe[:2] != b'MZ' or len(exe) > 512*1024*1024:
        raise ValueError('Windows 실행 파일이 아닙니다.')
    pe = struct.unpack_from('<I',exe,0x3c)[0]
    if exe[pe:pe+4] != b'PE\0\0':
        raise ValueError('PE 서명을 확인하지 못했습니다.')
    sections, optional_size = struct.unpack_from('<H',exe,pe+6)[0], struct.unpack_from('<H',exe,pe+20)[0]
    optional = pe+24
    magic = struct.unpack_from('<H',exe,optional)[0]
    if magic not in (0x10b,0x20b) or not 1 <= sections <= 96:
        raise ValueError('지원하지 않는 PE 형식입니다.')
    directory = optional + (112 if magic == 0x20b else 96)
    security_offset,security_size=struct.unpack_from('<II',exe,directory+32)
    if security_offset or security_size:
        raise ValueError('서명된 원본 실행 파일은 변경하지 않습니다. 지원 확인이 필요합니다.')
    resource_rva, resource_size = struct.unpack_from('<II',exe,directory+16)
    mappings=[]
    for i in range(sections):
        position=optional+optional_size+40*i
        virtual_size,rva,raw_size,raw=struct.unpack_from('<4I',exe,position+8)
        mappings.append((rva,raw_size,raw))
    def position(rva,size):
        for base,length,raw in mappings:
            if base <= rva and rva+size <= base+length and raw+(rva-base)+size <= len(exe):
                return raw+rva-base
        raise ValueError('PE 리소스 범위를 확인하지 못했습니다.')
    base=position(resource_rva,resource_size)
    entries=[]
    visited=set()
    def walk(relative,depth):
        if depth > 4 or relative in visited or not 0 <= relative <= resource_size-16:
            raise ValueError('PE 리소스 디렉터리가 올바르지 않습니다.')
        visited.add(relative)
        named,ids=struct.unpack_from('<HH',exe,base+relative+12)
        if named+ids > 4096 or relative+16+8*(named+ids)>resource_size:
            raise ValueError('PE 리소스 항목이 너무 많습니다.')
        for i in range(named+ids):
            target=struct.unpack_from('<I',exe,base+relative+16+i*8+4)[0]
            if target & 0x80000000:
                walk(target & 0x7fffffff,depth+1)
            else:
                if target > resource_size-16:
                    raise ValueError('PE 리소스 데이터가 범위를 벗어났습니다.')
                rva,size=struct.unpack_from('<II',exe,base+target)
                if 0 < size <= 1024*1024:
                    entries.append((position(rva,size),size))
    walk(0,0)
    matches=[]
    for start,size in entries:
        value=exe[start:start+size]
        try:
            document=json.loads(value.rstrip(b'\0').decode('utf-8'))
        except (ValueError,UnicodeDecodeError):
            continue
        if not isinstance(document,list):
            continue
        candidates=[row for row in document if isinstance(row,dict) and str(row.get('file','')).replace('\\','/').lower()=='resources/app.asar']
        if not candidates:
            continue
        if len(candidates)!=1 or candidates[0].get('alg')!='SHA256' or candidates[0].get('value')!=before:
            raise ValueError('실행 파일과 ASAR 무결성 정보가 다릅니다.')
        needle=before.encode('ascii')
        if value.count(needle)!=1:
            raise ValueError('ASAR 무결성 위치가 모호합니다.')
        matches.append(start+value.index(needle))
    if len(matches)!=1:
        raise ValueError('Electron ASAR 무결성 리소스가 없거나 모호합니다.')
    offset=matches[0]
    return exe[:offset]+after.encode('ascii')+exe[offset+64:]
