/*
 * Renderer-only Korean overlay.  It is appended to the existing renderer,
 * login and startup entry scripts, so it deliberately has no Electron, IPC
 * or service dependencies.  The allow-list below is the safety boundary:
 * catalog cards, playlist names, track names, artist names and all form
 * values are left exactly as supplied by Apple or the user.
 */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && !root.__amdlKoreanUiOverlayInstalled) {
    root.__amdlKoreanUiOverlayInstalled = true;
    api.install(root.document);
  }
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const EXACT = Object.freeze({
    'Music': 'Music 다운로더', 'Music 下载器': 'Music 다운로더', 'Apple Music Downloader': 'Apple Music 다운로더',
    '正在解析': '해석하는 중', '正在下载': '다운로드하는 중', '正在处理': '처리하는 중',
    '正在解密': '복호화하는 중', '正在写入标签': '태그 저장 중', '正在保存': '저장하는 중',
    '等待传输状态': '전송 상태를 기다리는 중', '总量待确认': '전체 용량 확인 중',
    '等待有效进度信息': '진행 정보를 기다리는 중', '状态暂不可用': '상태를 사용할 수 없음',
    '登录 Apple Music': 'Apple Music 로그인', '登录': '로그인', '验证': '인증', '密码': '암호', 'Apple 账户': 'Apple 계정', '验证码': '인증 코드',
    '正在确认登录会话…': '로그인 세션을 확인하는 중…', '正在恢复并验证已有会话…': '기존 세션을 복원하고 확인하는 중…',
    '使用 Apple 账户继续': 'Apple 계정으로 계속하기', '正在登录，请稍候…': '로그인하는 중…', '请输入本次登录的六位验证码': '이번 로그인에 받은 6자리 코드를 입력하세요',
    '登录成功': '로그인 완료', '暂时无法验证已有会话，请先重试': '기존 세션을 확인할 수 없습니다. 다시 시도하세요.', '本机服务暂不可用，请重试': '로컬 서비스를 사용할 수 없습니다. 다시 시도하세요.',
    '重新验证会话': '세션 다시 확인', '暂不登录': '나중에 로그인', '查看 Apple 原始提示': 'Apple 원문 안내 보기', '收不到设备验证码？': '기기 인증 코드를 받지 못했나요?',
    '主页': '홈', '新发现': '새로운 발견', '我的歌单': '내 플레이리스트', '下载与管理': '다운로드 및 관리', '下载任务': '다운로드 작업', '设置与状态': '설정 및 상태', '暂无内容。': '콘텐츠가 없습니다.',
    '正在读取新发现…': '새로운 발견을 불러오는 중…', '正在读取目录…': '카탈로그를 불러오는 중…', '当前地区暂无发现内容。': '현재 지역에는 새로운 발견 콘텐츠가 없습니다.',
    '新发现暂时无法载入，请检查网络后重试。': '새로운 발견을 지금 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도하세요.', '目录暂不可用，请检查登录与网络后重试。': '카탈로그를 사용할 수 없습니다. 로그인과 네트워크를 확인한 뒤 다시 시도하세요.',
    '重新载入': '다시 불러오기', '新歌': '새 노래', '编辑精选': '에디터 추천', '新发行与歌单': '신규 발매 및 플레이리스트', '专属推荐歌单': '맞춤 추천 플레이리스트',
    '歌曲': '노래', '艺人': '아티스트', '专辑': '앨범', '歌单': '플레이리스트', '推荐': '추천', '最佳结果': '최고 일치 결과',
    '▶ 播放': '▶ 재생', '下载全部': '전체 다운로드',
    '播放列表': '플레이리스트', '账号与服务': '계정 및 서비스', '正在恢复会话': '세션 복원 중', '搜索': '검색', '加载更多': '더 불러오기',
    '下载状态': '다운로드 상태', '正在连接下载服务…': '다운로드 서비스에 연결하는 중…', '刷新目录': '카탈로그 새로 고침',
    '美国': '미국', '中国大陆': '중국 본토', '香港': '홍콩', '台湾': '대만', '日本': '일본', '英国': '영국',
    '下载': '다운로드', '下载位置': '다운로드 위치', '选择文件夹': '폴더 선택', '默认音质': '기본 음질', '已有文件': '기존 파일', '并行下载': '동시 다운로드',
    'ALAC 无损': 'ALAC 무손실', 'FLAC 无损（由 ALAC 转换，不重采样）': 'FLAC 무손실 (ALAC에서 변환, 리샘플링 없음)',
    'MP3（320 kbps，由 ALAC 转换）': 'MP3 (320 kbps, ALAC에서 변환)', '跳过': '건너뛰기', '覆盖': '덮어쓰기', '报告冲突': '충돌 보고',
    '单曲文件名': '트랙 파일 이름', '保存设置': '설정 저장', '恢复默认': '기본값 복원', '缓存与预加载': '캐시 및 미리 불러오기',
    '正在读取缓存占用…': '캐시 사용량을 읽는 중…', '缓存上限（MB）': '캐시 한도(MB)', '调整容量': '용량 조정', '清理缓存': '캐시 지우기',
    '下载地区': '다운로드 지역', '元数据匹配地区': '메타데이터 일치 지역', '歌词地区': '가사 지역', '元数据语言': '메타데이터 언어',
    '歌词类型': '가사 유형', '歌词格式': '가사 형식', '封面格式': '표지 형식', '封面尺寸': '표지 크기', 'ALAC 采样率上限': 'ALAC 샘플레이트 상한',
    '保存歌词文件': '가사 파일 저장', '嵌入歌词': '가사 포함', '嵌入封面': '표지 포함', '保存艺人封面': '아티스트 표지 저장', '保存动态封面': '움직이는 표지 저장', '使用专辑曲序': '앨범 트랙 번호 사용',
    '自动': '자동', '简体中文': '중국어 간체', '繁体中文': '중국어 번체', '英语': '영어', '日语': '일본어', '逐行歌词': '줄 단위 가사', '逐字歌词': '단어 단위 가사',
    '诊断日志': '진단 로그', '导出诊断': '진단 내보내기', '交流 QQ 群': '커뮤니티 QQ 그룹', '加入任务': '작업에 추가',
    '进入应用': '앱 열기', '退出': '종료', '启动暂未完成，可以进入应用查看状态。': '시작을 완료하지 못했습니다. 앱에서 상태를 확인할 수 있습니다.',
    '正在启动 Apple Music Downloader': 'Apple Music 다운로더를 시작하는 중',
    '返回上一页': '이전 페이지', '返回上一页（Esc）': '이전 페이지(Esc)', '展开侧边栏': '사이드바 펼치기', '收起侧边栏': '사이드바 접기', '切换侧边栏': '사이드바 전환',
    '查看下载进度': '다운로드 진행률 보기', '当前任务曲目进度': '현재 작업의 트랙 진행률', '目录地区': '카탈로그 지역', '刷新当前目录': '현재 카탈로그 새로 고침',
    '展开搜索': '검색 펼치기', '搜索 Apple Music': 'Apple Music 검색', '主导航': '기본 탐색', '主页推荐': '홈 추천', '查看登录与状态': '로그인 및 상태 보기',
    '粘贴 Apple Music 歌曲、专辑或歌单链接': 'Apple Music 곡, 앨범 또는 플레이리스트 링크 붙여넣기', '正在验证会话': '세션 확인 중', 'Windows 原生服务': 'Windows 네이티브 서비스',
    '重新验证': '다시 확인', '交流与反馈群号，可直接选中复制': '문의 및 피드백 그룹 번호입니다. 선택하여 복사할 수 있습니다.', '单曲文件名模板': '트랙 파일 이름 템플릿',
    '停止播放': '재생 중지', '下载与处理进度': '다운로드 및 처리 진행률', '打开所在文件夹': '파일이 있는 폴더 열기',
    '正在删除…': '삭제하는 중…', '正在处理…': '처리하는 중…', '等待传输状态…': '전송 상태를 기다리는 중…', '暂无下载任务': '다운로드 작업 없음',
    '取消': '취소', '重试失败项': '실패 항목 다시 시도', '仅删除任务': '작업만 삭제', '删除任务与文件': '작업 및 파일 삭제',
    '排队中': '대기 중', '下载中': '다운로드 중', '正在取消': '취소하는 중', '完成': '완료', '部分完成': '일부 완료', '失败': '실패', '已取消': '취소됨', '已中断': '중단됨', '已跳过': '건너뜀', '不可用': '사용할 수 없음',
    '未登录': '로그인되지 않음', '正在登录': '로그인 중', '等待验证码': '인증 코드를 기다리는 중', '等待账户验证交互': '계정 인증 안내를 기다리는 중', '已验证登录': '로그인 인증됨', '会话暂未验证': '세션이 아직 인증되지 않음', '本机服务不可用': '로컬 서비스를 사용할 수 없음',
    '当前没有活动下载': '현재 활성 다운로드가 없습니다', '等待下载服务响应…': '다운로드 서비스 응답을 기다리는 중…', '下载状态暂未更新': '다운로드 상태가 아직 갱신되지 않았습니다.',
    '连接中断，正在重试…': '연결이 끊어져 다시 시도하는 중…', '暂无活动下载': '활성 다운로드 없음', '正在删除，请稍候…': '삭제하는 중입니다. 잠시 기다려 주세요…',
    '正在处理…': '처리하는 중…', '已请求取消。': '취소를 요청했습니다.', '已请求重试。': '다시 시도를 요청했습니다.',
    '任务已删除，下载文件已保留。': '작업을 삭제했으며 다운로드 파일은 유지했습니다.', '任务及其拥有的文件已删除。': '작업과 작업이 소유한 파일을 삭제했습니다.',
    '还没有下载任务。': '아직 다운로드 작업이 없습니다.', '等待会话恢复': '세션 복원을 기다리는 중',
    '未获得明确失败原因，请导出诊断以便排查。': '명확한 실패 이유를 확인하지 못했습니다. 진단을 내보내어 확인하세요.',
    'Music 会话未完成复验。可重试未完成曲目。': 'Music 세션 재확인이 완료되지 않았습니다. 완료되지 않은 곡을 다시 시도할 수 있습니다.',
    '解密许可获取失败。请重新验证会话，并检查该资源的地区与订阅权限。': '복호화 라이선스를 가져오지 못했습니다. 세션을 다시 확인하고 해당 리소스의 지역 및 구독 권한을 확인하세요.',
    '授权被拒绝（HTTP 401）。请到设置中重新验证或登录。': '인증이 거부되었습니다(HTTP 401). 설정에서 다시 인증하거나 로그인하세요.',
    '资源访问被拒绝（HTTP 403）。请检查账号地区、订阅和资源权限。': '리소스 접근이 거부되었습니다(HTTP 403). 계정 지역, 구독 및 리소스 권한을 확인하세요.',
    '当前地区找不到此资源（HTTP 404）。请切换下载地区或选择对应版本。': '현재 지역에서 이 리소스를 찾을 수 없습니다(HTTP 404). 다운로드 지역을 바꾸거나 해당 버전을 선택하세요.',
    '目录 Token 获取失败。请检查服务与网络后重试，无需反复输入验证码。': '카탈로그 토큰을 가져오지 못했습니다. 서비스와 네트워크를 확인한 뒤 다시 시도하세요. 인증 코드를 반복 입력할 필요는 없습니다.',
    '下载盘空间不足。请清理空间或更换下载位置后重试。': '다운로드 드라이브 공간이 부족합니다. 공간을 비우거나 다운로드 위치를 바꾼 뒤 다시 시도하세요.',
    '无法写入文件。请检查下载目录权限、只读属性和文件占用。': '파일에 쓸 수 없습니다. 다운로드 폴더 권한, 읽기 전용 속성 및 파일 사용 여부를 확인하세요.',
    '媒体解密失败。请导出诊断，并检查解密服务后重试。': '미디어 복호화에 실패했습니다. 진단을 내보내고 복호화 서비스를 확인한 뒤 다시 시도하세요.',
    '下载结果未确认完整。请检查文件并重试失败项，不等同于文件一定不存在。': '다운로드 결과의 완전성이 확인되지 않았습니다. 파일을 확인하고 실패 항목을 다시 시도하세요. 파일이 반드시 없다는 뜻은 아닙니다.',
    '下载凭据不可用。请到设置中检查登录与服务状态。': '다운로드 자격 증명을 사용할 수 없습니다. 설정에서 로그인 및 서비스 상태를 확인하세요.',
    '目录元数据解析失败。请检查地区和网络后重试。': '카탈로그 메타데이터 해석에 실패했습니다. 지역과 네트워크를 확인한 뒤 다시 시도하세요.',
    '媒体地址解析失败。请检查地区、资源可用性和网络。': '미디어 주소 해석에 실패했습니다. 지역, 리소스 사용 가능 여부 및 네트워크를 확인하세요.',
    '媒体地址请求排队超时，请稍后重试。': '미디어 주소 요청 대기 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',
    '媒体服务暂未返回播放地址，已自动重试，请稍后再试。': '미디어 서비스가 아직 재생 주소를 반환하지 않았습니다. 자동으로 다시 시도했으니 잠시 후 다시 시도하세요.',
    '媒体地址服务响应异常，请重试或导出诊断。': '미디어 주소 서비스 응답이 비정상입니다. 다시 시도하거나 진단을 내보내세요.',
    '这首歌曲暂不提供所选音质，请尝试其他音质。': '이 곡은 선택한 음질을 현재 제공하지 않습니다. 다른 음질을 시도하세요.',
    '媒体传输或解密失败，现有记录未提供更细原因。请导出诊断后重试。': '미디어 전송 또는 복호화에 실패했으며, 현재 기록에는 자세한 원인이 없습니다. 진단을 내보낸 뒤 다시 시도하세요.',
    '无法准备输出文件。请检查下载位置、空间与文件占用。': '출력 파일을 준비할 수 없습니다. 다운로드 위치, 공간 및 파일 사용 여부를 확인하세요.',
    '歌词文件写入失败。请检查下载目录权限与歌词设置。': '가사 파일 쓰기에 실패했습니다. 다운로드 폴더 권한과 가사 설정을 확인하세요.',
    '音频标签写入失败。请检查文件占用和元数据设置。': '오디오 태그 쓰기에 실패했습니다. 파일 사용 여부와 메타데이터 설정을 확인하세요.',
    '兼容音频封装失败，文件未发布。请导出诊断查看原因，勿将临时文件视为下载完成。': '호환 오디오 패키징에 실패해 파일이 게시되지 않았습니다. 진단을 내보내 원인을 확인하고 임시 파일을 다운로드 완료로 보지 마세요.',
    '文件保存或重命名失败。请检查文件占用与目录权限。': '파일 저장 또는 이름 변경에 실패했습니다. 파일 사용 여부와 폴더 권한을 확인하세요.',
    '音频完整性校验失败。请重试此曲，勿将未校验文件视为成功。': '오디오 무결성 검사에 실패했습니다. 이 곡을 다시 시도하고 검사되지 않은 파일을 성공으로 보지 마세요.',
    '此曲在当前地区没有可下载版本。': '이 곡은 현재 지역에서 다운로드할 수 있는 버전이 없습니다.',
    '无权访问此歌单。请检查账号与歌单权限。': '이 플레이리스트에 접근할 권한이 없습니다. 계정과 플레이리스트 권한을 확인하세요.',
    '私人歌单需要有效登录。请重新验证会话。': '비공개 플레이리스트에는 유효한 로그인이 필요합니다. 세션을 다시 확인하세요.',
    '歌单不存在，或在当前地区不可用。': '플레이리스트가 없거나 현재 지역에서 사용할 수 없습니다.',
    '歌单曲目未能完整获取。请检查网络后重试。': '플레이리스트 곡을 모두 가져오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.',
    '资料库有这首曲目，但未返回对应的 Apple Music 目录 ID。': '보관함에는 이 곡이 있지만 해당 Apple Music 카탈로그 ID를 반환하지 않았습니다.',
    '歌单条目缺少曲目标识，无法识别这首曲目。': '플레이리스트 항목에 곡 식별자가 없어 이 곡을 확인할 수 없습니다.',
    '此歌单条目不是支持下载的歌曲或音乐视频。': '이 플레이리스트 항목은 다운로드를 지원하는 곡 또는 뮤직비디오가 아닙니다.',
    '歌单中已有同一目录曲目，本条已跳过。': '플레이리스트에 같은 카탈로그 곡이 있어 이 항목을 건너뛰었습니다.',
    '未找到可下载的曲目，具体原因见下方各条目。': '다운로드할 수 있는 곡을 찾지 못했습니다. 자세한 이유는 아래 항목에서 확인하세요.',
    '其他下载或文件删除正在进行。请稍后重试，或选择“仅删除任务”保留文件。': '다른 다운로드 또는 파일 삭제가 진행 중입니다. 잠시 후 다시 시도하거나 “작업만 삭제”를 선택해 파일을 유지하세요.',
    '此任务正在删除，请等待完成后刷新列表。': '이 작업을 삭제 중입니다. 완료될 때까지 기다린 후 목록을 새로 고치세요.',
    '文件正在被其他程序使用。请关闭播放器等程序后重试；任务记录已保留。': '파일을 다른 프로그램에서 사용 중입니다. 플레이어 등을 닫은 뒤 다시 시도하세요. 작업 기록은 유지되었습니다.',
    '没有权限删除文件，或文件为只读。请检查权限，或选择“仅删除任务”。': '파일 삭제 권한이 없거나 파일이 읽기 전용입니다. 권한을 확인하거나 “작업만 삭제”를 선택하세요.',
    '文件已被修改，为避免误删已保留。可选择“仅删除任务”保留文件。': '파일이 변경되어 오삭제를 방지하기 위해 유지했습니다. “작업만 삭제”를 선택해 파일을 유지할 수 있습니다.',
    '部分文件未能删除，任务记录已保留。请检查文件占用和权限后重试，也可仅删除任务。': '일부 파일을 삭제하지 못했으며 작업 기록은 유지되었습니다. 파일 사용 여부와 권한을 확인한 뒤 다시 시도하거나 작업만 삭제하세요.',
    '任务仍在运行，请先取消，等待结束后再删除。': '작업이 아직 실행 중입니다. 먼저 취소하고 종료된 뒤 삭제하세요.',
    '服务正在停止或更新，请稍后重试。': '서비스를 중지하거나 업데이트 중입니다. 잠시 후 다시 시도하세요.',
    '请求超时，结果尚未确认。正在刷新任务状态，请确认后再重试。': '요청 시간이 초과되어 결과가 아직 확인되지 않았습니다. 작업 상태를 새로 고치는 중이니 확인 후 다시 시도하세요.',
    '操作未完成，任务记录未确认删除。请检查本机服务后重试。': '작업을 완료하지 못했고 작업 기록 삭제도 확인되지 않았습니다. 로컬 서비스를 확인한 뒤 다시 시도하세요.',
    '上游请求过于频繁（HTTP 429）。请稍后重试。': '상위 서비스 요청이 너무 잦습니다(HTTP 429). 잠시 후 다시 시도하세요.', '上游服务暂不可用（HTTP 5xx）。请稍后重试。': '상위 서비스를 지금 사용할 수 없습니다(HTTP 5xx). 잠시 후 다시 시도하세요.',
    'Windows 原生服务 · 已就绪': 'Windows 네이티브 서비스 · 준비됨', 'Windows 原生服务 · 正在启动': 'Windows 네이티브 서비스 · 시작하는 중',
    '设置已保存，下一个任务生效。': '설정을 저장했습니다. 다음 작업부터 적용됩니다.', '保存失败，请检查设置值。': '저장하지 못했습니다. 설정값을 확인하세요.',
    '设置暂不可用，请检查本机服务。': '설정을 사용할 수 없습니다. 로컬 서비스를 확인하세요.', '刷新未完成，请稍后重试。': '새로 고침을 완료하지 못했습니다. 잠시 후 다시 시도하세요.',
    '缓存设置需要新版桌面服务。': '캐시 설정에는 새 데스크톱 서비스가 필요합니다.', '缓存暂不可用，仍可在线浏览。': '캐시를 사용할 수 없지만 온라인 탐색은 계속할 수 있습니다.',
    '暂时无法读取缓存占用。': '캐시 사용량을 지금 읽을 수 없습니다.', '调整未完成，请重试。': '조정을 완료하지 못했습니다. 다시 시도하세요.', '清理未完成，请重试。': '정리를 완료하지 못했습니다. 다시 시도하세요.',
    '下载目录不存在，请检查磁盘或目录。': '저장 폴더가 없습니다. 디스크 또는 폴더를 확인하세요.', '无法打开所在文件夹，请稍后重试。': '파일이 있는 폴더를 열 수 없습니다. 잠시 후 다시 시도하세요.',
    '已打开下载目录，任务尚无可定位文件。': '다운로드 폴더를 열었습니다. 이 작업에는 아직 찾을 수 있는 파일이 없습니다.',
    '任务已删除，但列表刷新失败，稍后会自动重试。': '작업을 삭제했지만 목록을 새로 고치지 못했습니다. 잠시 후 자동으로 다시 시도합니다.',
    '任务列表刷新失败，已保留当前列表，稍后会自动重试。': '작업 목록을 새로 고치지 못했습니다. 현재 목록을 유지하며 잠시 후 자동으로 다시 시도합니다.',
    '操作暂未完成，请检查状态后重试。': '작업을 완료하지 못했습니다. 상태를 확인한 뒤 다시 시도하세요.',
    '登录窗口暂不可用。': '로그인 창을 열 수 없습니다.', '验证暂不可用，请检查网络。': '인증을 사용할 수 없습니다. 네트워크를 확인하세요.',
    '诊断导出未完成。': '진단 내보내기를 완료하지 못했습니다.', '暂时无法完成操作，请重试。': '작업을 완료하지 못했습니다. 다시 시도하세요.',
    '其他国家/地区': '기타 국가/지역', '国家/地区区号': '국가/지역 번호', '国家区号': '국가 번호', '其他国家区号': '기타 국가 번호',
    '关闭提示': '안내 닫기', '取消登录': '로그인 취소', '正在继续验证…': '인증을 계속하는 중…',
    '请完成下方 Apple 账户验证提示': '아래 Apple 계정 인증 안내를 완료하세요.', '正在验证 Apple 账户…': 'Apple 계정을 확인하는 중…',
    '正在验证设备验证码…': '기기 인증 코드를 확인하는 중…', '正在启动 Music 服务…': 'Music 서비스를 시작하는 중…', '正在获取 Music 会话…': 'Music 세션을 가져오는 중…', '正在校验 Music 会话…': 'Music 세션을 확인하는 중…',
    '重新输入': '다시 입력', '继续': '계속', '输入内容': '입력 내용', '选择登录方式': '로그인 방법 선택', 'Apple 账户验证未通过': 'Apple 계정 인증 실패',
    'Apple 账户验证': 'Apple 계정 인증', '确认账户信息': '계정 정보 확인', '输入设备验证码': '기기 인증 코드 입력', '暂不支持此验证步骤': '이 인증 단계는 아직 지원하지 않습니다.',
    '此步骤暂不支持在原生窗口完成。不会自动打开链接或执行其他操作。': '이 단계는 네이티브 창에서 완료할 수 없습니다. 링크를 자동으로 열거나 다른 작업을 실행하지 않습니다.',
    'Apple 拒绝了本次认证；仅凭此提示不能确定是密码错误。': 'Apple에서 이번 인증을 거부했습니다. 이 안내만으로 암호 오류라고 단정할 수 없습니다.',
    '在受信任设备上批准本次登录，填写本次收到的六位验证码。': '신뢰하는 기기에서 이번 로그인을 승인한 뒤 받은 6자리 인증 코드를 입력하세요.',
    '提示内容过长，已截断显示。': '안내 내용이 너무 길어 일부만 표시했습니다.', '重试本机服务': '로컬 서비스 다시 시도',
    '界面与本机服务版本不一致。请退出后用同一安装包重新安装。': '화면과 로컬 서비스 버전이 일치하지 않습니다. 종료 후 같은 설치 패키지로 다시 설치하세요.',
    '无法启动本机服务。请检查安装是否完整及系统拦截记录。': '로컬 서비스를 시작할 수 없습니다. 설치 완전성과 시스템 차단 기록을 확인하세요.',
    '本机服务启动回执无效。请导出诊断或重新安装。': '로컬 서비스 시작 응답이 올바르지 않습니다. 진단을 내보내거나 다시 설치하세요.',
    '运行组件缺失。请检查安装是否完整及系统拦截记录。': '실행 구성 요소가 없습니다. 설치 완전성과 시스템 차단 기록을 확인하세요.',
    '运行组件版本或结构无效。请用同一安装包重新安装。': '실행 구성 요소의 버전 또는 구조가 올바르지 않습니다. 같은 설치 패키지로 다시 설치하세요.',
    '运行组件完整性校验失败。请导出诊断，不要删除会话。': '실행 구성 요소 무결성 검사에 실패했습니다. 진단을 내보내고 세션은 삭제하지 마세요.',
    '无法访问应用数据目录。请检查该目录的可用性和权限。': '앱 데이터 폴더에 접근할 수 없습니다. 폴더의 사용 가능 여부와 권한을 확인하세요.',
    '无法打开或初始化下载任务数据库。请导出诊断，不要删除任务记录。': '다운로드 작업 데이터베이스를 열거나 초기화할 수 없습니다. 진단을 내보내고 작업 기록은 삭제하지 마세요.',
    '下载任务队列初始化失败。请导出诊断。': '다운로드 작업 대기열 초기화에 실패했습니다. 진단을 내보내세요.',
    '下载任务队列正被另一个服务占用。请完全退出软件后重试。': '다운로드 작업 대기열을 다른 서비스가 사용 중입니다. 프로그램을 완전히 종료한 뒤 다시 시도하세요.',
    '无法读取或准备本机运行数据。请导出诊断，不要删除会话。': '로컬 실행 데이터를 읽거나 준비할 수 없습니다. 진단을 내보내고 세션은 삭제하지 마세요.',
    '本机运行数据无法加锁，可能被其他进程占用。请完全退出软件后重试。': '로컬 실행 데이터를 잠글 수 없습니다. 다른 프로세스가 사용 중일 수 있으니 프로그램을 완전히 종료한 뒤 다시 시도하세요.',
    '准备运行文件超时。请检查磁盘是否可用，并导出诊断。': '실행 파일 준비 시간이 초과되었습니다. 디스크 사용 가능 여부를 확인하고 진단을 내보내세요.',
    '运行组件启动后未及时就绪。请导出诊断后重试。': '실행 구성 요소가 시작 후 제때 준비되지 않았습니다. 진단을 내보낸 뒤 다시 시도하세요.',
    '运行组件意外退出。请导出诊断。': '실행 구성 요소가 예기치 않게 종료되었습니다. 진단을 내보내세요.',
    '无法启动运行组件。请检查安装是否完整及系统拦截记录。': '실행 구성 요소를 시작할 수 없습니다. 설치 완전성과 시스템 차단 기록을 확인하세요.',
    '运行组件的本地端口不可用。请重试启动本机服务。': '실행 구성 요소의 로컬 포트를 사용할 수 없습니다. 로컬 서비스를 다시 시작하세요.',
    '本机服务无法建立本地连接。请导出诊断。': '로컬 서비스가 로컬 연결을 만들 수 없습니다. 진단을 내보내세요.',
    '本机服务响应超时。请导出诊断后重试。': '로컬 서비스 응답 시간이 초과되었습니다. 진단을 내보낸 뒤 다시 시도하세요.',
    '本机服务返回了无效的状态。请导出诊断。': '로컬 서비스가 올바르지 않은 상태를 반환했습니다. 진단을 내보내세요.',
    '登录未完成，请导出诊断后重试。': '로그인을 완료하지 못했습니다. 진단을 내보낸 뒤 다시 시도하세요.', '本次登录已取消。': '이번 로그인이 취소되었습니다.',
    '请先完成登录。': '먼저 로그인을 완료하세요.', '暂时无法确认 Music 会话，请重试。': 'Music 세션을 확인할 수 없습니다. 다시 시도하세요.',
    '正在处理登录，请稍候。': '로그인을 처리하는 중입니다. 잠시 기다려 주세요.', '登录信息格式不正确。': '로그인 정보 형식이 올바르지 않습니다.',
    '请填写完整国际号码，如 +447700900123。': '완전한 국제 전화번호를 입력하세요. 예: +447700900123', '验证提示已超时，请重新登录。': '인증 안내 시간이 초과되었습니다. 다시 로그인하세요.',
    '手机号会补上所选国家区号，默认中国大陆 +86；已带 + 区号的号码直接使用。': '전화번호에는 선택한 국가 번호가 추가됩니다. 기본값은 중국 본토 +86이며 + 국가 번호가 있는 번호는 그대로 사용합니다.',
    '验证交互通道不可用，请重新登录或导出诊断。': '인증 안내 채널을 사용할 수 없습니다. 다시 로그인하거나 진단을 내보내세요.',
    'Apple 要求的此步骤暂不支持在原生窗口完成，请查看提示说明。': 'Apple에서 요구한 이 단계는 네이티브 창에서 지원하지 않습니다. 안내를 확인하세요.',
    '原生认证组件发生异常，请导出诊断。': '네이티브 인증 구성 요소에 오류가 발생했습니다. 진단을 내보내세요.',
    '账号认证完成，但获取或保存 Music 会话失败，请导出诊断。': '계정 인증은 완료했지만 Music 세션을 가져오거나 저장하지 못했습니다. 진단을 내보내세요.',
    '暂时无法重新验证会话，请稍后重试。': '지금 세션을 다시 인증할 수 없습니다. 잠시 후 다시 시도하세요.',
    'Sign in': '로그인', 'Login': '로그인', 'Settings': '설정', 'Downloads': '다운로드', 'Download': '다운로드', 'Export diagnostics': '진단 내보내기',
    'Choose folder': '폴더 선택', 'Save settings': '설정 저장', 'Restore defaults': '기본값 복원', 'Clear cache': '캐시 지우기',
    'FLAC lossless (converted from ALAC, no resampling)': 'FLAC 무손실 (ALAC에서 변환, 리샘플링 없음)', 'MP3 (320 kbps, converted from ALAC)': 'MP3 (320 kbps, ALAC에서 변환)'
  });

  const PATTERNS = Object.freeze([
    [/^已处理 (\d+) \/ (\d+) 首$/, '$1 / $2곡 처리함'],
    [/^(\d+\+?) 项活动任务$/, '활성 작업 $1개'],
    [/^预估 (\d+(?:\.\d+)?)%$/, '예상 $1%'],
    [/^已下载 ([\d.]+ (?:B|KiB|MiB|GiB))(?: \/ (预计总量|总量) ([\d.]+ (?:B|KiB|MiB|GiB)))?$/, (_, received, estimated, total) => total ? `다운로드한 데이터 ${received} / ${estimated === '预计总量' ? '예상 전체' : '전체'} ${total}` : `다운로드한 데이터 ${received}`],
    [/^当前已接收 ([\d.]+ (?:B|KiB|MiB|GiB))(?: \/ ([\d.]+ (?:B|KiB|MiB|GiB)))?$/, (_, received, total) => `현재 받은 데이터 ${received}${total ? ' / ' + total : ''}`],
    [/^(?:预估进度 (\d+(?:\.\d+)?)%，)?已处理 (\d+) 首，共 (\d+) 首$/, (_, percent, done, total) => `${percent ? '예상 진행률 ' + percent + '%, ' : ''}${total}곡 중 ${done}곡 처리함`],
    [/^请在 (\d+) 秒内完成$/, ' $1초 안에 완료하세요'],
    [/^请在\s*(\d+)\s*秒内完成$/, ' $1초 안에 완료하세요'],
    [/^正在加入下载队列…$/, '다운로드 대기열에 추가하는 중…'],
    [/^已加入下载队列。$/, '다운로드 대기열에 추가했습니다.'],
    [/^下载服务或所选音质尚未就绪，请稍后重试。$/, '다운로드 서비스 또는 선택한 음질이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.'],
    [/^下载状态暂未更新$/, '다운로드 상태가 아직 갱신되지 않았습니다.'],
    [/^正在解析曲目$/, '트랙을 해석하는 중…'],
    [/^已处理 (\d+) \/ (\d+) 首$/, '$1 / $2곡 처리함'],
    [/^预估 (\d+)%$/, '예상 $1%'],
    [/^本次已接收 (.+)$/, '이번에 받은 데이터 $1'],
    [/^未能加入任务，请检查登录、地区与服务状态。$/, '작업을 추가하지 못했습니다. 로그인, 지역 및 서비스 상태를 확인하세요.'],
    [/^已用 (.+) \/ (\d+) MB · (\d+) 项目录与封面缓存$/, '사용량 $1 / $2 MB · 카탈로그 및 표지 캐시 $3개'],
    [/^缓存上限已调整，超出容量的旧缓存已自动清理。$/, '캐시 한도를 조정했고 초과한 이전 캐시를 자동으로 정리했습니다.'],
    [/^缓存已关闭并清理。$/, '캐시를 끄고 정리했습니다.'],
    [/^缓存已清理，下载文件与登录会话不受影响。$/, '캐시를 정리했습니다. 다운로드 파일과 로그인 세션은 유지됩니다.'],
    [/^请输入 0–10240 MB，0 为关闭缓存。$/, '0–10240 MB를 입력하세요. 0은 캐시를 끕니다.'],
    [/^下载位置已保存，新任务生效；已有任务保留原位置。$/, '다운로드 위치를 저장했습니다. 새 작업에 적용되며 기존 작업은 원래 위치를 유지합니다.'],
    [/^(排队中|下载中|正在取消|完成|部分完成|失败|已取消|已中断|已跳过|不可用|等待会话恢复) · 成功 (\d+) · 失败 (\d+) · 跳过 (\d+) · 不可用 (\d+)$/, (_, status, succeeded, failed, skipped, unavailable) => `${EXACT[status]} · 성공 ${succeeded} · 실패 ${failed} · 건너뜀 ${skipped} · 사용할 수 없음 ${unavailable}`],
    [/^成功 (\d+) · 失败 (\d+) · 跳过 (\d+) · 不可用 (\d+)$/, '성공 $1 · 실패 $2 · 건너뜀 $3 · 사용할 수 없음 $4'],
    [/^(目录解析|媒体地址解析|媒体传输|下载)超时。请检查网络或本机服务后重试。$/, (_, stage) => `${({ 目录解析: '카탈로그 해석', 媒体地址解析: '미디어 주소 해석', 媒体传输: '미디어 전송', 下载: '다운로드' })[stage]} 시간이 초과되었습니다. 네트워크 또는 로컬 서비스를 확인한 뒤 다시 시도하세요.`],
    [/^(目录解析|媒体地址解析|媒体传输|下载)无法解析服务器地址。请检查 DNS 或代理设置。$/, (_, stage) => `${({ 目录解析: '카탈로그 해석', 媒体地址解析: '미디어 주소 해석', 媒体传输: '미디어 전송', 下载: '다운로드' })[stage]}에서 서버 주소를 해석할 수 없습니다. DNS 또는 프록시 설정을 확인하세요.`],
    [/^(目录解析|媒体地址解析|媒体传输|下载)连接被拒绝或中断。请检查服务与网络。$/, (_, stage) => `${({ 目录解析: '카탈로그 해석', 媒体地址解析: '미디어 주소 해석', 媒体传输: '미디어 전송', 下载: '다운로드' })[stage]} 연결이 거부되었거나 끊겼습니다. 서비스와 네트워크를 확인하세요.`],
    [/^(目录解析|媒体地址解析|媒体传输|下载)遇到临时网络或上游错误，请稍后重试。$/, (_, stage) => `${({ 目录解析: '카탈로그 해석', 媒体地址解析: '미디어 주소 해석', 媒体传输: '미디어 전송', 下载: '다운로드' })[stage]} 중 일시적인 네트워크 또는 상위 서비스 오류가 발생했습니다. 잠시 후 다시 시도하세요.`],
    [/^失败原因：(.{1,400})$/s, '실패 이유: $1'],
    [/^该目录不可写入，请重新选择。$/, '이 폴더에는 쓸 수 없습니다. 다시 선택하세요.'],
    [/^下载位置未更改，请检查目录后重试。$/, '다운로드 위치를 변경하지 못했습니다. 폴더를 확인한 뒤 다시 시도하세요.'],
    [/^本机服务初始化超时。请导出诊断后重试。$/, '로컬 서비스 초기화 시간이 초과되었습니다. 진단을 내보낸 뒤 다시 시도하세요.'],
    [/^本机服务已退出。请查看系统拦截记录，或导出诊断后重试。$/, '로컬 서비스가 종료되었습니다. 시스템 차단 기록을 확인하거나 진단을 내보낸 뒤 다시 시도하세요.'],
    [/^无法连接本机服务。请导出诊断后重试。$/, '로컬 서비스에 연결할 수 없습니다. 진단을 내보낸 뒤 다시 시도하세요.'],
    [/^启动暂未完成，可以进入应用查看状态。$/, '시작을 완료하지 못했습니다. 앱에서 상태를 확인할 수 있습니다.'],
    [/^正在播放$/, '재생 중'], [/^已暂停$/, '일시 정지됨'], [/^播放结束$/, '재생 종료'],
    [/^Waiting for (.+)$/, '$1 대기 중'], [/^Downloading$/, '다운로드 중'], [/^Processing$/, '처리 중'], [/^Completed$/, '완료됨'], [/^Failed$/, '실패함']
  ]);

  const UI_ROOTS = '#app-header, #sidebar, #tasks-view, #settings-view, #download-monitor, #player, .login-content, #startup-error, body > main[aria-label]';
  const STATUS_SELECTORS = '#notice, #jobs-status, #monitor-title, #monitor-detail, #monitor-progress, #account-state, #runtime-state, #directory-feedback, #cache-usage, #cache-feedback, #sidebar-session, #player-status, #login-status, #login-error, #interaction-title, #interaction-message, #interaction-note, #interaction-error, #interaction-expiry, #startup-message, .job-summary, .job-failure, .job-feedback, .job-transfer, .job-item-failure, .job-folder-feedback, .jobs-empty';
  const EXCLUDED = '#catalog-content, #sidebar-playlists, #player-title, #download-directory, #interaction-original-text, .catalog-card, .track-row, .detail-hero, .search-song-row, .search-best-card, .artist-release-card, .job h3, .job li, [data-track-id], [data-album-id], [data-playlist-id], [data-user-content]';
  const USER_CONTENT = '#sidebar-playlists, #player-title, #download-directory, #interaction-original-text, [data-user-content]';
  const CATALOG_HEADINGS = '#catalog-content > h2, #catalog-content .discover-section-heading > h2, #catalog-content .discover-kicker, #catalog-content .artist-latest > h2, #catalog-content .artist-top-songs > h2, #catalog-content .search-best > h2, #catalog-content .detail-related > h2, #catalog-content .related-feedback > span';
  const ACTION_CONTROLS = '#jobs .job-actions button[data-job-action], #jobs .job-folder-button, #catalog-content .card-actions button, #catalog-content button.download-action, #catalog-content button[data-catalog-page], #catalog-content .discover-scroll-actions button, #catalog-content button.artist-play, #catalog-content button.search-song-play, #catalog-content .track-row > button';
  const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'aria-valuetext'];

  function translate(value) {
    if (typeof value !== 'string') return value;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const core = value.slice(leading.length, value.length - trailing.length);
    if (!core) return value;
    let translated = Object.hasOwn(EXACT, core) ? EXACT[core] : undefined;
    if (!translated) {
      for (const [pattern, replacement] of PATTERNS) {
        if (pattern.test(core)) { translated = core.replace(pattern, replacement).trimStart(); break; }
      }
    }
    return translated ? leading + translated + trailing : value;
  }

  function isExcluded(element) {
    return !element || (typeof element.closest === 'function' && Boolean(element.closest(EXCLUDED)));
  }

  function isInputValueTarget(element) {
    const tag = String(element && element.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea';
  }

  function isSafePageTitle(element) {
    // This toolbar title is generated by updateNavigation; resource titles live in detail-hero.
    return Boolean(element && element.id === 'page-title');
  }

  function isSystemElement(element) {
    if (!element || typeof element.closest !== 'function' || typeof element.matches !== 'function' || element.closest(USER_CONTENT)) return false;
    return isSafePageTitle(element) || element.matches(STATUS_SELECTORS + ', ' + CATALOG_HEADINGS) || Boolean(element.closest(ACTION_CONTROLS));
  }

  function isAllowedElement(element) {
    if (!element || isInputValueTarget(element)) return false;
    if (typeof element.matches !== 'function' || typeof element.closest !== 'function') return false;
    if (element.id === 'monitor-title') {
      const documentRef = element.ownerDocument;
      const count = documentRef && documentRef.getElementById('sidebar-job-count');
      const detail = documentRef && documentRef.getElementById('monitor-detail');
      return Boolean(count && (count.hidden || detail && ['连接中断，正在重试…', '等待下载服务响应…', EXACT['连接中断，正在重试…'], EXACT['等待下载服务响应…']].includes(detail.textContent)));
    }
    if (isSystemElement(element)) return true;
    if (isExcluded(element)) return false;
    if (element.matches('option')) return Boolean(element.closest('#region, #quality, #existing, #preference-fields, #account-fields, #interaction-fields'));
    if (element.closest('#jobs') && !element.matches(STATUS_SELECTORS) && !element.closest(STATUS_SELECTORS)) return false;
    return isSafePageTitle(element) || element.matches(STATUS_SELECTORS) || Boolean(element.closest(UI_ROOTS));
  }

  function isAllowedAttributeElement(element) {
    if (!element || typeof element.closest !== 'function') return false;
    if (isSystemElement(element)) return true;
    if (isExcluded(element)) return false;
    if (isInputValueTarget(element)) return Boolean(element.closest(UI_ROOTS));
    return isAllowedElement(element);
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return false;
    const parent = node.parentElement;
    if (!parent || typeof parent.closest !== 'function' || parent.closest(USER_CONTENT)) return false;
    // A job row deliberately combines a media title and an app-owned status in one text node.
    const jobItem = typeof parent.matches === 'function' && parent.matches('#jobs .job > ul > li');
    if (!jobItem && !isAllowedElement(parent)) return false;
    const next = jobItem ? translateJobItem(node.nodeValue) : parent.matches('.job-transfer, #monitor-detail') ? translateTransfer(node.nodeValue) : translate(node.nodeValue);
    if (next === node.nodeValue) return false;
    node.nodeValue = next;
    return true;
  }

  function translateJobItem(value) {
    const boundary = value.lastIndexOf(' · ');
    if (boundary < 0) return value;
    const status = value.slice(boundary + 3);
    if (!['排队中', '下载中', '正在取消', '完成', '部分完成', '失败', '已取消', '已中断', '已跳过', '不可用', '等待会话恢复'].includes(status)) return value;
    return value.slice(0, boundary + 3) + translate(status);
  }

  function translateTransfer(value) {
    return value.split(' · ').map(translate).join(' · ');
  }

  function translateAttribute(element, value) {
    if (typeof element.closest === 'function' && element.closest(ACTION_CONTROLS)) {
      for (const [pattern, replacement] of [
        [/^播放 (.+)$/s, '$1 재생'], [/^下载 (.+)$/s, '$1 다운로드'],
        [/^向左浏览 (.+)$/s, '$1 왼쪽으로 탐색'], [/^向右浏览 (.+)$/s, '$1 오른쪽으로 탐색']
      ]) if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return translate(value);
  }

  function translateElement(element) {
    if (typeof element.matches === 'function' && element.matches('#jobs .job > ul > li')) {
      return Array.from(element.childNodes || []).reduce((changed, node) => changed + Number(translateTextNode(node)), 0);
    }
    if (!isAllowedAttributeElement(element)) return 0;
    let changed = 0;
    for (const attribute of ATTRIBUTES) {
      if (!element.hasAttribute || !element.hasAttribute(attribute)) continue;
      const oldValue = element.getAttribute(attribute);
      const next = translateAttribute(element, oldValue);
      if (next !== oldValue) { element.setAttribute(attribute, next); changed += 1; }
    }
    if (!isAllowedElement(element)) return changed;
    for (const node of Array.from(element.childNodes || [])) if (translateTextNode(node)) changed += 1;
    return changed;
  }

  function translateTree(root) {
    if (!root) return 0;
    let changed = root.nodeType === 1 ? translateElement(root) : translateTextNode(root) ? 1 : 0;
    if (!root.querySelectorAll) return changed;
    for (const element of root.querySelectorAll('*')) changed += translateElement(element);
    return changed;
  }

  function install(documentRef) {
    if (!documentRef || !documentRef.documentElement) return { disconnect() {}, translateNow() { return 0; } };
    documentRef.documentElement.lang = 'ko';
    documentRef.title = translate(documentRef.title);
    const translateNow = () => translateTree(documentRef.documentElement);
    translateNow();
    const Observer = documentRef.defaultView && documentRef.defaultView.MutationObserver || (typeof MutationObserver === 'function' && MutationObserver);
    if (!Observer) return { disconnect() {}, translateNow };
    const observer = new Observer(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateTextNode(record.target);
        else if (record.type === 'attributes') translateElement(record.target);
        else for (const node of record.addedNodes) translateTree(node);
      }
    });
    observer.observe(documentRef.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
    return { disconnect: () => observer.disconnect(), translateNow };
  }

  return { EXACT, PATTERNS, translate, translateJobItem, translateTransfer, isExcluded, isInputValueTarget, isSafePageTitle, isAllowedElement, isAllowedAttributeElement, translateTextNode, translateElement, translateTree, install };
});
