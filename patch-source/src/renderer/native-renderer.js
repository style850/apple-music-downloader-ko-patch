// Modified 2026-11-08 for the Korean/security patch; see docs/PATCH-ATTRIBUTION.ko.md.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const desktop = window.nativeDesktop;
  const motion = window.nativeMotion;
  const api = (path, method = 'GET', body) => desktop.api(path, { method, body });
  const state = { view: 'browse', session: 'checking', canDownload:false, gateGeneration:0, generation: 0, feed: 'home', detail: null, browseSnapshot:null, preferences: null, pending: new Set(), playing: '', playbackGeneration: 0, playbackItem:null, previewGeneration:0, previewPromise:null };
  let collectionPlayRequest = 0, segmentPlayer = null, playbackStopBarrier = Promise.resolve();
  const releaseStream = () => { segmentPlayer?.dispose(); segmentPlayer = null; };
  const viewHistory = [], detailHistory = [];
  let searching = false, sidebarLibraryRegion = '', sidebarLibraryRequest = 0;
  const sessionNames = { checking: '세션 복원 중', needs_login: '로그인 필요', authenticating: '로그인 중', needs_2fa: '인증 코드 대기 중', needs_interaction: '계정 인증 상호작용 대기 중', authenticated: '로그인 확인됨', unverified: '세션이 아직 확인되지 않음', runtime_unavailable: '로컬 서비스를 사용할 수 없음' };
  const statusNames = { queued: '대기 중', running: '다운로드 중', cancelling: '취소 중', succeeded: '완료', partial: '일부 완료', failed: '실패', cancelled: '취소됨', interrupted: '중단됨', skipped: '건너뜀', unavailable: '사용할 수 없음' };
  const notice = text => { $('notice').textContent = text; motion?.feedback($('notice'),text); };
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const button = (text, action, label = text) => { const value = node('button', text); value.type = 'button'; value.setAttribute('aria-label', label); value.onclick = () => Promise.resolve().then(action).catch(() => notice('작업을 완료하지 못했습니다. 상태를 확인한 뒤 다시 시도하세요.')); return value; };
  function image(url) { const value = node('img', undefined, 'artwork'); value.alt = ''; value.loading = 'lazy'; if (/^https:\/\/[^/]+\.mzstatic\.com\//.test(url || '')) value.src = desktop.artworkURL ? desktop.artworkURL(url) : url; return value; }
  function observe(session) {
    const previousSession=state.session;
    state.session = sessionNames[session?.state] ? session.state : 'runtime_unavailable';
    $('account-state').textContent = sessionNames[state.session]; if(state.session !== 'authenticated') state.canDownload=false; $('session-light').dataset.state = state.canDownload ? 'authenticated' : state.session==='authenticated'?'unverified':state.session;
    $('session-light').title = sessionNames[state.session] + ' · 로그인 및 상태 열기';
    $('sidebar-session').textContent = sessionNames[state.session];
    if (state.session === 'needs_login' && previousSession !== 'needs_login') { sidebarLibraryRegion=''; ++sidebarLibraryRequest; $('sidebar-playlists').replaceChildren(); }
    if (session?.region && /^[a-z]{2}$/.test(session.region) && !$('region').dataset.selected) {
      if (![...$('region').options].some(option => option.value === session.region)) { const option = node('option', session.region.toUpperCase()); option.value = session.region; $('region').append(option); }
      $('region').value = session.region;
    }
    if(state.session==='authenticated' && sidebarLibraryRegion!==$('region').value)void loadSidebarLibrary();
    for (const control of document.querySelectorAll('[data-download]')) control.disabled = !state.canDownload || control.dataset.available !== 'true';
    if(session?.region) void gate();
    if(state.session==='authenticated'&&previousSession!=='authenticated'){jobNameAttempts.clear();if(state.view==='tasks')void resolveJobNames();}
  }
  async function gate(){const generation=++state.gateGeneration;let ready=false;try{const caps=await api('/api/v1/capabilities');ready=state.session==='authenticated'&&caps.queue?.state==='ready'&&caps.jobExecutorConfigured===true&&caps.qualities?.[$('quality').value]?.available===true;}catch{}if(generation!==state.gateGeneration)return;state.canDownload=ready;$('session-light').dataset.state=ready?'authenticated':state.session==='authenticated'?'unverified':state.session;$('session-light').title=ready?'현재 음질로 다운로드 작업을 제출할 수 있음 · 개별 곡의 최종 성공은 보장되지 않음':'아직 다운로드를 제출할 수 없음 · 설정 및 상태 열기';for(const control of document.querySelectorAll('[data-download]'))control.disabled=!ready||control.dataset.available!=='true';}
  function updateNavigation() {
    document.querySelector('.native-toolbar').hidden = state.view==='browse'&&!!state.detail;
    $('browse-back').disabled = !((state.view==='browse' && (state.detail || searching)) || viewHistory.length);
    for(const control of document.querySelectorAll('[data-feed]')) { const active=state.view==='browse'&&!searching&&control.dataset.feed===state.feed;control.classList.toggle('selected',active);if(active)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current'); }
    $('page-title').textContent = state.view==='browse' ? searching?'검색':({home:'홈',discover:'새로운 발견',library:'나의 플레이리스트'}[state.feed]||'홈') : {tasks:'다운로드 작업',settings:'설정 및 상태'}[state.view];
    for(const control of document.querySelectorAll('.sidebar-playlist')) {if(state.view==='browse'&&state.detail?.id===control.dataset.id)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');}
  }
  function view(name, remember = true) { const changed=name!==state.view;if(changed)motion?.cancelAll();if(remember&&changed){viewHistory.push(state.view);if(viewHistory.length>20)viewHistory.shift();}state.view = name; for (const value of ['browse', 'tasks', 'settings']) { $(value + '-view').hidden = value !== name; for (const control of document.querySelectorAll('[data-view="' + value + '"]')) { if (value === name) control.setAttribute('aria-current', 'page'); else control.removeAttribute('aria-current'); } }updateNavigation();if(changed)motion?.enter(name==='tasks'?$('page-title'):$(name+'-view'),'page',remember?1:-1);if (name === 'tasks') void jobs(); if (name === 'settings') void settings(); }
  async function loadSidebarLibrary(force = false) {
    if(state.session!=='authenticated')return;
    const region=$('region').value;if(!force&&sidebarLibraryRegion===region)return;sidebarLibraryRegion=region;const request=++sidebarLibraryRequest;
    try {const data=await api('/api/v1/catalog/library?'+new URLSearchParams({region,offset:'0'}));if(request!==sidebarLibraryRequest||state.session!=='authenticated'||region!==$('region').value)return;const list=$('sidebar-playlists');list.replaceChildren();for(const item of(data.groups||[]).flatMap(group=>group.items||[]).filter(item=>item.type==='library-playlists').slice(0,25)){const control=button('',()=>{view('browse');return detail(item);},item.title+' 세부 정보 보기');control.className='sidebar-playlist';control.dataset.id=item.id;control.append(image(item.artwork),node('span',item.title));list.append(control);}updateNavigation();}catch{/* Library failure never blocks the main catalog. */}
  }
  function detailPath(item, region=$('region').value) { const library=item.type==='library-playlists';return '/api/v1/catalog/'+(library?'library-detail':'detail')+'?'+new URLSearchParams({region,id:item.id,...(library?{}:{type:item.type}),offset:'0'}); }
  let prefetchActive=0;const prefetched=new Set();
  function preloadOnIntent(control, path) { if(!desktop.prefetchCatalog)return;let timer;const cancel=()=>{clearTimeout(timer);};const schedule=()=>{cancel();timer=setTimeout(()=>{const target=typeof path==='function'?path():path;if(prefetchActive>=2||prefetched.has(target)||navigator.connection?.saveData)return;prefetched.add(target);if(prefetched.size>256)prefetched.delete(prefetched.values().next().value);prefetchActive++;Promise.resolve(desktop.prefetchCatalog(target)).catch(()=>prefetched.delete(target)).finally(()=>prefetchActive--);},150);};control.addEventListener('pointerenter',schedule);control.addEventListener('focus',schedule);control.addEventListener('pointerleave',cancel);control.addEventListener('blur',cancel);control.addEventListener('click',cancel); }
  async function queue(url, title = '') {
    if (state.session !== 'authenticated') { await desktop.openLogin(); return; }
    if (!state.canDownload) {notice('다운로드 서비스 또는 선택한 음질이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');return;}
    const key = url + '|' + $('quality').value + '|' + $('existing').value; if (state.pending.has(key)) return; state.pending.add(key);
    notice('다운로드 대기열에 추가하는 중…');
    try {
      let canonical = url;
      if (!/\/library\/playlists?\//.test(url)) canonical = (await api('/api/v1/browser-download/resolve', 'POST', { url })).url;
      const result = await api('/api/v1/jobs', 'POST', { urls: [canonical], ...(title ? { titles: [title] } : {}), quality: $('quality').value, existingPolicy: $('existing').value });
      if (!Array.isArray(result.jobs) || result.jobs.length !== 1 || !result.jobs[0].id || result.jobs[0].url !== canonical) throw new Error('incomplete_receipt');
      if (title) rememberJobName(canonical, title);
      notice('다운로드 대기열에 추가했습니다.');
    } catch { notice('작업을 추가하지 못했습니다. 로그인, 지역 및 서비스 상태를 확인하세요.'); }
    finally { state.pending.delete(key); }
  }
  function download(item, text = '') { const label=item.title+' 다운로드',control = button('', () => queue(item.url, item.title), label);control.title=label;control.classList.add('download-action');control.append(icon('download'));if(text)control.append(node('span',text));control.dataset.download = ''; control.dataset.available = String(item.downloadable && item.type !== 'music-videos'); control.disabled = !state.canDownload || control.dataset.available !== 'true'; return control; }
  function safePreview(url) { try { const value = new URL(url); return value.protocol === 'https:' && !value.username && !value.password && !value.port && !value.hash && (value.hostname.endsWith('.mzstatic.com') || value.hostname === 'audio-ssl.itunes.apple.com') ? value.href : ''; } catch { return ''; } }
  async function stopPlayback(invalidate = true) { if(invalidate) { ++state.playbackGeneration; ++collectionPlayRequest; } releaseStream(); state.playing = ''; state.playbackItem=null; $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load(); $('player').hidden = true; playbackStopBarrier = Promise.all([playbackStopBarrier,api('/api/native/playback', 'DELETE').catch(() => {})]); await playbackStopBarrier; }
  function preview(item,generation){
    if(state.previewGeneration===generation)return state.previewPromise;
    state.previewGeneration=generation;
    state.previewPromise=(async()=>{
      if(generation!==state.playbackGeneration)return;
      releaseStream();
      let url=safePreview(item.previewUrl);
      if(!url&&item.discoveryTrack){
        try {const data=await api(detailPath(item,item.discoveryRegion));url=safePreview(data.resource?.previewUrl);}
        catch {/* A discovery entry has no preview until catalog detail is resolved. */}
        if(generation!==state.playbackGeneration)return;
      }
      if(!url){$('audio').pause();$('audio').removeAttribute('src');$('audio').load();$('player-status').textContent='전체 재생과 미리 듣기를 모두 사용할 수 없음';return;}
      $('audio').dataset.mode='미리 듣기';$('audio').src=url;
      try{await $('audio').play();if(generation===state.playbackGeneration)$('player-status').textContent='미리 듣기 · 전체 곡이 아님';}
      catch{if(generation===state.playbackGeneration)$('player-status').textContent='미리 듣기를 사용할 수 없음';}
    })();
    return state.previewPromise;
  }
  async function play(item) {
    ++collectionPlayRequest;
    if (state.playing === item.id && $('audio').src) { if ($('audio').paused) await $('audio').play(); else $('audio').pause(); return; }
    const generation = ++state.playbackGeneration; await stopPlayback(false); if(generation !== state.playbackGeneration) return; state.playing = item.id; state.playbackItem=item;
    $('player').hidden = false; motion?.enter($('player'),'panel'); $('player-title').textContent = item.title + (item.artist ? ' · ' + item.artist : ''); $('player-status').textContent = '전체 재생 준비 중…';
    let full = false;
    if (state.session === 'authenticated') {
      try {
        const result = await api('/api/native/playback', 'POST', { id: item.id, region: $('region').value });
        if (generation !== state.playbackGeneration) return;
        if (result.ok === true && result.mode === 'stream') {
          const current = () => generation === state.playbackGeneration && state.previewGeneration !== generation;
          segmentPlayer = new NativeSegmentPlayer($('audio'), result, desktop, () => { if(current())void preview(item,generation); }, text => { if(current())$('player-status').textContent=text; });
          $('audio').dataset.mode='전체 재생'; await segmentPlayer.start(); full = true;
        } else if (result.ok === true && result.mode === 'full' && /^http:\/\/127\.0\.0\.1:\d+\/api\/native\/playback\/[a-f0-9]{32}$/.test(result.mediaURL)) { $('audio').dataset.mode='전체 재생'; $('audio').src = result.mediaURL; await $('audio').play(); full = true; }
      } catch { /* The single play action may fall back only to a real preview. */ }
    }
    if (generation !== state.playbackGeneration) return;
    if (!full||state.previewGeneration===generation) {await preview(item,generation);return;}
    $('player-status').textContent = '전체 재생';
  }
  function personalMixGroup(group, path) {
    const route = new URL(path, 'http://fixture').pathname;
    if (!['/api/v1/catalog/home', '/api/v1/catalog/recommendation'].includes(route) || group.type !== 'playlists') return false;
    return (group.items?.length > 0 && group.items.every(item => item.playlistType === 'personal-mix')) || /^(?:playlists made for you|made for you|专属推荐歌单|專屬推薦歌單|为你打造的歌单|為你打造的播放列表)$/i.test((group.title || '').trim());
  }
  async function playCollection(item, control) {
    const request = ++collectionPlayRequest, region = $('region').value;
    control.disabled = true; control.setAttribute('aria-busy', 'true');
    try {
      const data = await api('/api/v1/catalog/detail?' + new URLSearchParams({region, id:item.id, type:item.type, offset:'0'}));
      if (request !== collectionPlayRequest || region !== $('region').value) return;
      const first = (data.tracks || []).find(track => track.type === 'songs' && !track.unavailableReason);
      if (!first) { notice('이 플레이리스트에는 재생할 수 있는 곡이 없습니다. 세부 정보에서 확인하세요.'); return; }
      await play(first);
    } catch { if (request === collectionPlayRequest) notice('이 플레이리스트를 지금 재생할 수 없습니다. 세부 정보에서 다시 시도하세요.'); }
    finally { control.disabled = false; control.removeAttribute('aria-busy'); }
  }
  function personalMixCard(item) {
    const value = node('article', undefined, 'catalog-card personal-mix-card artwork-missing');
    const cover = button('', () => detail(item), item.title+' 세부 정보 보기');
    cover.className = 'catalog-artwork-action personal-mix-cover';
    preloadOnIntent(cover,()=>detailPath(item));
    const backdrop = image(item.artwork); backdrop.className = 'personal-mix-backdrop';
    const artwork = image(item.artwork); artwork.className = 'personal-mix-artwork';
    artwork.onload = () => value.classList.remove('artwork-missing');
    artwork.onerror = () => value.classList.add('artwork-missing');
    cover.append(backdrop, artwork, node('h3', item.title, 'personal-mix-title'));
    const summary = node('p', item.description || item.artist || 'Apple Music이 추천하는 콘텐츠', 'personal-mix-summary');
    const playButton = button('▶', () => playCollection(item, playButton), item.title+' 재생');
    playButton.className = 'personal-mix-play';
    value.append(cover, summary, playButton);
    return value;
  }
  function card(item, personalMix = false, related = false) {
    if (personalMix && item.type === 'playlists') return personalMixCard(item);
    const value = node('article', undefined, item.type==='artists'?'catalog-card artist-card':'catalog-card');
    {
      const label = item.title+' 세부 정보 보기';
      const cover = button('', () => detail(item), label); cover.className = 'catalog-artwork-action'; cover.append(image(item.artwork));
      const title = node('h3'); const link = button(item.title, () => detail(item), label); link.className = 'catalog-title-action'; title.append(link);
      preloadOnIntent(cover,()=>detailPath(item));preloadOnIntent(link,()=>detailPath(item));
      value.append(cover, title);
    }
    value.append(node('p',item.type==='artists'?'아티스트':related&&/^\d{4}/.test(item.releaseDate||'')?item.releaseDate.slice(0,4)+'년':item.artist));
    if (item.type === 'songs') {
      const actions = node('div', undefined, 'card-actions');
      actions.append(button('▶', () => play(item), item.title+' 재생'), download(item));
      value.append(actions);
    }
    return value;
  }
  function track(item, index) { const row = node('div', undefined, 'track-row'); row.append(node('span', String(index + 1), 'muted'), node('span', item.title), node('span', item.artist, 'muted artist'), node('span', item.duration ? Math.floor(item.duration / 60000) + ':' + String(Math.floor(item.duration / 1000) % 60).padStart(2, '0') : '', 'muted duration'), button('▶', () => play(item), item.title+' 재생'), download(item)); return row; }
  function searchSongRow(item, subtitle=item.artist) {
    const row=node('article',undefined,'search-song-row');row.setAttribute('role','listitem');
    const label=item.title+' 세부 정보 보기';
    const cover=button('',()=>detail(item),label);cover.className='catalog-artwork-action search-song-cover';cover.append(image(item.artwork));
    const title=node('h3');const link=button(item.title,()=>detail(item),label);link.className='catalog-title-action';link.title=item.title;title.append(link);
    const copy=node('div',undefined,'search-song-copy');const mobileArtist=node('p',subtitle,'search-song-mobile-artist');copy.append(title,mobileArtist);
    const artist=node('span',item.artist,'search-song-artist');artist.title=item.artist||'';
    const duration=node('span',item.duration>0?Math.floor(item.duration/60000)+':'+String(Math.floor(item.duration/1000)%60).padStart(2,'0'):'—','search-song-duration');
    const playButton=button('▶',()=>play(item),item.title+' 재생');playButton.className='search-song-play';
    const downloadButton=download(item);downloadButton.className='search-song-download';
    preloadOnIntent(cover,()=>detailPath(item));preloadOnIntent(link,()=>detailPath(item));
    row.append(cover,copy,artist,duration,playButton,downloadButton);return row;
  }
  function searchBestCard(item){
    const control=button('',()=>detail(item),'최고 결과 '+item.title+' 세부 정보 보기');control.className='search-best-card'+(item.type==='artists'?' artist-result':'');
    const artwork=image(item.artwork);const copy=node('span',undefined,'search-best-copy');
    const type={artists:'아티스트',albums:'앨범',songs:'노래',playlists:'플레이리스트','music-videos':'뮤직 비디오'}[item.type]||'작품';
    copy.append(node('strong',item.title),node('span',type+(item.type!=='artists'&&item.artist?' · '+item.artist:'')));
    control.title=item.title;control.append(artwork,copy);preloadOnIntent(control,()=>detailPath(item));return control;
  }
  function searchGroups(data){
    const order=['albums','songs','artists','playlists','music-videos'];
    const priority=kind=>kind==='artists'&&data.bestResults?.[0]?.type==='artists'?-1:order.indexOf(kind)<0?99:order.indexOf(kind);
    return [...(data.groups||[])].sort((a,b)=>priority(a.type)-priority(b.type));
  }
  function detailArtist(item){
    const line=node('p',undefined,'detail-artist');
    const valid=ref=>/^[1-9][0-9]{0,19}$/.test(ref.id||'');
    const refs=(item.artists||[]).filter(valid);
    if(!refs.length&&valid({id:item.artistId}))refs.push({id:item.artistId,name:item.relatedArtist||''});
    if(!refs.length){line.textContent=item.artist||'';return line;}
    if(!refs.some(ref=>ref.name)){line.append(document.createTextNode((item.artist||'')+' '));}
    refs.forEach((ref,index)=>{if(index)line.append(document.createTextNode('·'));const artist={id:ref.id,type:'artists',title:ref.name||'관련 아티스트'};const link=button(artist.title,()=>detail(artist),artist.title+' 아티스트 페이지 보기');link.className='detail-artist-link';preloadOnIntent(link,()=>detailPath(artist));line.append(link);});
    return line;
  }
  function artistHome(content,data){
    const item=data.resource,home=data.artistHome||{},songs=(home.topSongs||[]).slice(0,9),latest=home.latestRelease;
    const hero=node('section',undefined,'detail-hero artist-hero');const portrait=node('div',undefined,'artist-portrait');portrait.append(image(item.artwork));
    const title=node('div',undefined,'artist-title-row');const first=songs.find(song=>!song.unavailableReason);let playButton;
    playButton=button('▶',()=>first?play(first):playCollection(latest,playButton),item.title+' 재생');playButton.className='artist-play';playButton.disabled=!first&&!latest;
    title.append(playButton,node('h1',item.title));hero.append(portrait,title);content.append(hero);
    if(latest||songs.length){
      const overview=node('div',undefined,'artist-overview');if(!latest)overview.classList.add('no-latest');
      if(latest){const section=node('section',undefined,'artist-latest');section.setAttribute('aria-label','최신 발매');section.append(node('h2','최신 발매'));const release=node('div',undefined,'artist-release-card');const cover=button('',()=>detail(latest),latest.title+' 세부 정보 보기');cover.className='catalog-artwork-action';cover.append(image(latest.artwork));const copy=node('div',undefined,'artist-release-copy');
        if(/^\d{4}-\d{2}-\d{2}/.test(latest.releaseDate||'')){const date=new Date(latest.releaseDate.slice(0,10)+'T00:00:00Z');if(!Number.isNaN(date.getTime()))copy.append(node('p',new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(date),'artist-release-date'));}
        const heading=node('h3');const link=button(latest.title,()=>detail(latest),latest.title+' 세부 정보 보기');link.className='catalog-title-action';heading.append(link);copy.append(heading);if(latest.trackCount)copy.append(node('p',latest.trackCount+'곡'));copy.append(download(latest,'다운로드'));preloadOnIntent(cover,()=>detailPath(latest));preloadOnIntent(link,()=>detailPath(latest));release.append(cover,copy);section.append(release);overview.append(section);}
      if(songs.length){const section=node('section',undefined,'artist-top-songs');section.setAttribute('aria-label','인기 곡');section.append(node('h2','인기 곡'));const list=node('div',undefined,'search-song-list');list.setAttribute('role','list');list.setAttribute('aria-label','인기 곡');for(const song of songs)list.append(searchSongRow(song,[song.albumTitle,/^\d{4}/.test(song.releaseDate||'')?song.releaseDate.slice(0,4)+'년':''].filter(Boolean).join(' · ')||song.artist));section.append(list);overview.append(section);}
      content.append(overview);
    }
  }
  function detailTraits(item) {const parts=[...(item.genres||[]).slice(0,1)];if(/^\d{4}/.test(item.releaseDate||''))parts.push(item.releaseDate.slice(0,4)+'년');const variants=item.audioVariants||[];if(variants.includes('hi-res-lossless'))parts.push('고해상도 무손실');else if(variants.includes('lossless'))parts.push('무손실');if(variants.includes('dolby-atmos'))parts.push('Dolby Atmos');if(item.contentRating==='explicit')parts.push('E');return parts.join(' · ');}
  function drawDetailMetadata(content) { const item=content.querySelector('.detail-hero')?.resource;if(!item)return;const lines=[];if(/^\d{4}-\d{2}-\d{2}/.test(item.releaseDate||'')){const date=new Date(item.releaseDate.slice(0,10)+'T00:00:00Z');if(!Number.isNaN(date.getTime()))lines.push(new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(date));}const list=content.querySelector('.track-list');const count=list.childElementCount,total=item.trackCount||count;const minutes=Math.floor([...list.children].reduce((sum,row)=>sum+Number(row.dataset.duration||0),0)/60000);if(total)lines.push(total+'곡'+(count>=total&&minutes?' · '+minutes+'분':''));if(item.copyright)lines.push(item.copyright);if(item.recordLabel&&!(item.copyright||'').includes(item.recordLabel))lines.push(item.recordLabel);content.querySelector('.detail-metadata').textContent=lines.join('\n'); }
  async function relatedWorks(item, slot, generation) {
    if(!item.artistId){slot.hidden=true;return;}slot.hidden=false;const title=(item.relatedArtist||item.artist||'같은 아티스트')+'의 다른 작품';
    try{const data=await api('/api/v1/catalog/artist-albums?'+new URLSearchParams({region:$('region').value,id:item.artistId,offset:'0'}));if(generation!==state.generation||!slot.isConnected)return;const seen=new Set([item.id]),items=(data.groups||[]).flatMap(group=>group.items||[]).filter(value=>{if(value.type!=='albums'||seen.has(value.id))return false;seen.add(value.id);return true;}).slice(0,12);slot.replaceChildren();if(!items.length){slot.hidden=true;return;}slot.append(node('h2',title));const grid=node('div',undefined,'catalog-grid related-grid');for(const value of items)grid.append(card(value,false,true));slot.append(grid);}catch{if(generation!==state.generation||!slot.isConnected)return;slot.replaceChildren(node('h2',title));const feedback=node('div',undefined,'related-feedback');feedback.append(node('span','다른 작품을 지금 불러올 수 없습니다'),button('다시 시도',()=>relatedWorks(item,slot,generation)));slot.append(feedback);}
  }
  function discoverFeature(item, index) {
    const value = node('article',undefined,'discover-feature');
    const label = item.title+' 세부 정보 보기';
    const cover = button('',()=>detail(item),label);
    cover.className='catalog-artwork-action discover-feature-cover';
    const artwork = image(item.artwork);
    if(index<2)artwork.loading='eager';
    cover.append(artwork);
    value.append(node('p',item.editorialLabel||(item.type==='albums'?'앨범':'플레이리스트'),'discover-kicker'));
    const title = node('h3');
    const link = button(item.title,()=>detail(item),label);
    link.className='catalog-title-action';link.title=item.title;title.append(link);
    value.append(title,node('p',item.artist,'discover-credit'),cover);
    if(item.description)value.append(node('p',item.description,'discover-description'));
    for(const control of [cover,link])preloadOnIntent(control,()=>detailPath(item));
    return value;
  }
  function renderDiscover(content, data) {
    for(const [index,group] of (data.groups||[]).entries()){
      if(!group.items?.length)continue;
      const featured=group.layout==='featured',tracks=group.layout==='tracks';
      const section=node('section',undefined,'discover-section');
      const title=group.title||(tracks?'신곡':featured?'에디터 추천':'신규 발매 및 플레이리스트');
      const heading=node('h2',title,featured?'discover-feature-heading':undefined);
      heading.id='discover-heading-'+index;
      section.setAttribute('aria-labelledby',heading.id);
      const row=node('div',undefined,'discover-shelf '+(featured?'discover-feature-shelf':tracks?'discover-track-shelf':'catalog-grid discover-cover-shelf'));
      row.tabIndex=0;
      row.setAttribute('role',tracks?'list':'group');
      row.setAttribute('aria-label',title);
      if(tracks)for(const item of group.items)row.append(searchSongRow({...item,discoveryTrack:true,discoveryRegion:data.storefront||$('region').value}));
      else for(const [i,item] of group.items.entries())row.append(featured?discoverFeature(item,i):card(item));
      const header=node('div',undefined,'discover-section-heading');
      const controls=node('div',undefined,'discover-scroll-actions');
      controls.hidden=true;
      const move = direction => row.scrollBy({left:direction*row.clientWidth});
      const prev=button('‹',()=>move(-1),title+' 왼쪽으로 탐색');
      const next=button('›',()=>move(1),title+' 오른쪽으로 탐색');
      section.syncDiscoveryShelf=()=>{
        const end=row.scrollWidth-row.clientWidth;
        controls.hidden=end<=1;
        prev.setAttribute('aria-disabled',String(row.scrollLeft<=1));
        next.setAttribute('aria-disabled',String(row.scrollLeft>=end-1));
      };
      row.addEventListener('scroll',section.syncDiscoveryShelf,{passive:true});
      controls.append(prev,next);header.append(heading,controls);
      section.append(header,row);content.append(section);
    }
    requestAnimationFrame(syncDiscoveryShelves);
  }
  function syncDiscoveryShelves(){for(const section of $('catalog-content').querySelectorAll('.discover-section'))section.syncDiscoveryShelf();}
  window.addEventListener('resize',syncDiscoveryShelves,{passive:true});
  const isDiscover = path => !!path && new URL(path,'http://fixture').pathname==='/api/v1/catalog/discover';
  async function browse(path, append = false) {
    const discoveryPage=isDiscover(path);
    if(!append && path!==state.catalogPath && (discoveryPage||isDiscover(state.catalogPath))){
      motion?.cancelTree($('catalog-content'));
      $('catalog-content').replaceChildren();
      $('catalog-more').hidden=true;
    }
    if(!append)state.catalogPath=path;
    motion?.cancelTree($('catalog-content'));$('refresh-catalog').setAttribute('aria-busy','true');
    const generation = ++state.generation; notice(discoveryPage?'새로운 발견을 불러오는 중…':'카탈로그를 불러오는 중…');
    try {
      const data = await api(path); if (generation !== state.generation) return;
      const content = $('catalog-content'); if (!append) content.replaceChildren();
      const searchPage=new URL(path,'http://fixture').pathname==='/api/v1/catalog/search';
      // Later relationship pages contain tracks without repeating resource
      // metadata. Append them to the existing detail, keeping its header.
      const appendingTracks=append&&Array.isArray(data.tracks)&&!!content.querySelector('.track-list');
      if (discoveryPage) {
        renderDiscover(content,data);
      } else if ((data.resource&&data.resource.type!=='artists')||appendingTracks) {
        if (!append) { const hero = node('div', undefined, 'detail-hero');hero.resource=data.resource; const info = node('div',undefined,'detail-info'); info.append(node('h1', data.resource.title), detailArtist(data.resource),node('p',detailTraits(data.resource),'detail-traits')); const actions = node('div', undefined, 'card-actions'); if (data.tracks?.length) actions.append(button('▶ 재생', () => play(data.tracks.find(item=>!item.unavailableReason)||data.tracks[0]))); actions.append(download(data.resource, '모두 다운로드')); info.append(actions); hero.append(image(data.resource.artwork), info);const related=node('section',undefined,'detail-related');related.hidden=true;content.append(hero, node('div', undefined, 'track-list'),node('p','','detail-metadata'),related);void relatedWorks(data.resource,related,generation); }
        const list = content.querySelector('.track-list'); const start = list.childElementCount; for (const [index, item] of (data.tracks || []).entries()){const row=track(item,start+index);row.dataset.duration=String(Math.max(0,item.duration||0));list.append(row);}drawDetailMetadata(content);
      } else {
        if(data.resource?.type==='artists'&&!append)artistHome(content,data);
        if(searchPage&&!append&&data.bestResults?.length){const section=node('section',undefined,'search-best');section.setAttribute('aria-label','최고 결과');section.append(node('h2','최고 결과'));const grid=node('div',undefined,'search-best-grid');for(const item of data.bestResults.slice(0,8))grid.append(searchBestCard(item));section.append(grid);content.append(section);}
        for (const group of searchPage?searchGroups(data):data.groups||[]) {
        const personalMix = personalMixGroup(group, path);
        const songSearch=searchPage&&group.type==='songs';
        if(searchPage&&!group.items?.length)continue;
        let grid=append&&searchPage?[...content.querySelectorAll('[data-search-kind]')].find(value=>value.dataset.searchKind===group.type):null;
        if(!grid){
          const title=personalMix ? '나를 위한 추천 플레이리스트' : group.title || ({ songs: '노래', artists:'아티스트', albums: '앨범', playlists: '플레이리스트', 'library-playlists': '나의 플레이리스트' }[group.type] || '추천');
          content.append(node('h2',title,personalMix?'personal-mixes-heading':undefined));
          const artistPage=state.detail?.type==='artists';
          grid=node('div',undefined,songSearch?'search-song-list':personalMix?'catalog-grid personal-mixes':searchPage||artistPage?'catalog-grid search-collection-grid'+(group.type==='artists'?' search-artists':''):'catalog-grid');
          if(searchPage)grid.dataset.searchKind=group.type;
          if(songSearch){grid.setAttribute('role','list');grid.setAttribute('aria-label',title);}
          if(personalMix){grid.tabIndex=0;grid.setAttribute('role','region');grid.setAttribute('aria-label','나를 위한 추천 플레이리스트');}
          content.append(grid);
        }
        for (const item of group.items || []) grid.append(songSearch?searchSongRow(item):card(item,personalMix));
        if(Number.isInteger(group.nextOffset)&&!Number.isInteger(data.nextOffset)){
          const next=new URL(path,'http://fixture');next.searchParams.set('offset',String(group.nextOffset));
          if(group.recommendationId){next.pathname='/api/v1/catalog/recommendation';next.searchParams.delete('term');next.searchParams.delete('type');next.searchParams.set('id',group.recommendationId);}
          else if(next.pathname.endsWith('/search'))next.searchParams.set('type',group.type);
          const more=button('더 불러오기',async()=>{more.disabled=true;const requestGeneration=state.generation+1;const loaded=await browse(next.pathname+next.search,true);if(requestGeneration!==state.generation)return;if(loaded)more.remove();else more.disabled=false;},(group.title||group.type)+' 더 불러오기');more.dataset.catalogPage='';content.append(more);
        }
        }
      }
      const next = data.nextOffset; $('catalog-more').hidden = !Number.isInteger(next); $('catalog-more').onclick = () => { const url = new URL(path, 'http://fixture'); url.searchParams.set('offset', String(next)); void browse(url.pathname + url.search, true); };
      if(!append)motion?.content(content);
      notice((data.resource||data.tracks?.length || data.groups?.some(group => group.items?.length)) ? '' : discoveryPage?'현재 지역에서 발견할 콘텐츠가 없습니다.':'콘텐츠가 없습니다.'); observe({ state: state.session }); return true;
    } catch {
      if (generation === state.generation) {
        notice(discoveryPage?'새로운 발견을 지금 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도하세요.':'카탈로그를 사용할 수 없습니다. 로그인 및 네트워크를 확인한 뒤 다시 시도하세요.');
        const content=$('catalog-content');
        if(discoveryPage&&!content.querySelector('.discover-section'))content.replaceChildren(button('다시 불러오기',()=>browse(path)));
      }
      return false;
    }
    finally {if(generation===state.generation)$('refresh-catalog').removeAttribute('aria-busy');}
  }
  function discardDetail() { state.detail = null; state.browseSnapshot = null;detailHistory.length=0;updateNavigation(); }
  const feedPath = mode => '/api/v1/catalog/' + mode + '?' + new URLSearchParams({region:$('region').value,...(mode==='discover'?{}:{offset:'0'})});
  function feed(mode) { searching=false;discardDetail(); state.feed = mode;updateNavigation(); return browse(feedPath(mode)); }
  function takeSnapshot(){motion?.cancelTree($('catalog-content'));const content=document.createDocumentFragment();const scrolls=[...$('catalog-content').querySelectorAll('.catalog-grid,.search-song-list,.discover-shelf')].map(element=>({element,x:element.scrollLeft,y:element.scrollTop}));const snapshot={content,scrolls,detail:state.detail,path:state.catalogPath,region:$('region').value,moreHidden:$('catalog-more').hidden,moreAction:$('catalog-more').onclick,notice:$('notice').textContent,trigger:document.activeElement,x:window.scrollX,y:window.scrollY};content.append(...$('catalog-content').childNodes);return snapshot;}
  function detail(item, replace=false) {
    const entering = !state.detail;
    if (entering) {
      state.browseSnapshot = takeSnapshot();
    } else if(!replace&&(state.detail.id!==item.id||state.detail.type!==item.type)){detailHistory.push(takeSnapshot());if(detailHistory.length>10)detailHistory.shift();}
    state.detail = item;updateNavigation(); $('catalog-more').hidden = true; $('catalog-more').onclick = null;
    if (entering||!replace) { $('browse-back').focus({preventScroll:true}); window.scrollTo(0, 0); }
    return browse(detailPath(item));
  }
  function closeDetail() {
    if (!state.detail) return;
    motion?.cancelTree($('catalog-content'));$('refresh-catalog').removeAttribute('aria-busy');
    ++state.generation;
    const snapshot = detailHistory.length?detailHistory.pop():state.browseSnapshot;
    if(snapshot?.detail)state.detail=snapshot.detail;else discardDetail();updateNavigation();
    if (!snapshot || snapshot.region !== $('region').value) { void feed(state.feed); return; }
    state.catalogPath=snapshot.path;
    $('catalog-content').replaceChildren(snapshot.content); $('catalog-more').hidden = snapshot.moreHidden; $('catalog-more').onclick = snapshot.moreAction;
    for(const scroll of snapshot.scrolls||[]){scroll.element.scrollLeft=scroll.x;scroll.element.scrollTop=scroll.y;}
    requestAnimationFrame(syncDiscoveryShelves);
    for (const control of document.querySelectorAll('[data-catalog-page]')) control.disabled = false;
    notice(snapshot.notice === '카탈로그를 불러오는 중…' ? '' : snapshot.notice); observe({state:state.session});
    if (snapshot.trigger?.isConnected) snapshot.trigger.focus({preventScroll:true});
    window.scrollTo(snapshot.x, snapshot.y);
    motion?.content($('catalog-content'),-1);
    const hero=$('catalog-content').querySelector('.detail-hero'),related=$('catalog-content').querySelector('.detail-related');if(hero?.resource?.artistId&&related&&!related.childElementCount)void relatedWorks(hero.resource,related,state.generation);
  }
  function goBack(){if(state.view==='browse'&&state.detail){closeDetail();return;}if(viewHistory.length){view(viewHistory.pop(),false);return;}if(searching)void feed(state.feed);}
  const jobCards = new Map(), jobOperations = new Map(), removedJobs = new Set();
  const jobNames = new Map(), jobNameAttempts = new Set(); let resolvingJobName = false;
  try { for (const [url,title] of Object.entries(JSON.parse(localStorage.getItem('native-v2-job-names') || '{}'))) if (typeof title === 'string') jobNames.set(url,title.slice(0,300)); } catch {}
  function rememberJobName(url, title) {
    if (typeof title !== 'string' || !title.trim()) return;
    jobNames.set(url,title.trim().slice(0,300));
    while(jobNames.size>256)jobNames.delete(jobNames.keys().next().value);
    try { localStorage.setItem('native-v2-job-names',JSON.stringify(Object.fromEntries(jobNames))); } catch {}
  }
  function jobResource(job) {
    try {
      const url = new URL(job.url), parts = url.pathname.split('/').filter(Boolean), selected = url.searchParams.get('i');
      const library = parts[1] === 'library';
      const type = selected ? 'songs' : library ? 'library-playlists' : ({album:'albums',song:'songs',playlist:'playlists','music-video':'music-videos'})[parts[1]];
      const id = selected || parts.at(-1);
      if (type && /^(?:\d+|(?:pl\.|p\.)[a-zA-Z0-9.-]+)$/.test(id) && /^[a-z]{2}$/i.test(parts[0])) return {region:parts[0],id,type,library};
    } catch {}
    return null;
  }
  function jobHeading(job) {
    if(job.title)return job.title;
    if(jobNames.has(job.url))return jobNames.get(job.url);
    const resource = jobResource(job);
    if(resource?.type==='songs'){const item=job.items?.find(item=>item.sourceId===resource.id);if(item?.name)return item.name;}
    const kind = resource ? {albums:'앨범',songs:'노래',playlists:'플레이리스트','library-playlists':'개인 플레이리스트','music-videos':'뮤직 비디오'}[resource.type] : '다운로드 작업';
    return kind + (resource ? ' · ' + resource.id : '');
  }
  async function resolveJobNames() {
    if(resolvingJobName)return;resolvingJobName=true;
    try {
      while(state.view==='tasks'){
        const entry=[...jobCards.values()].find(card=>!card.job.title&&!jobNames.has(card.job.url)&&!jobNameAttempts.has(card.job.url)&&jobResource(card.job));
        if(!entry)break;
        const job=entry.job,resource=jobResource(job);jobNameAttempts.add(job.url);
        try {
          const result=await api('/api/v1/catalog/'+(resource.library?'library-detail':'detail')+'?'+new URLSearchParams({region:resource.region,id:resource.id,...(resource.library?{}:{type:resource.type}),offset:'0'}));
          if(result.resource?.title){rememberJobName(job.url,result.resource.title);for(const card of jobCards.values())if(card.job.url===job.url)card.querySelector('h3').textContent=jobHeading(card.job);}
        } catch { /* Do not block deletion or repeatedly retry catalog on every poll. */ }
      }
    } finally {resolvingJobName=false;}
  }
  const downloadFailures = {
    license_failed:'복호화 권한을 가져오지 못했습니다. 세션을 다시 확인하고 이 리소스의 지역 및 구독 권한을 확인하세요.',
    session_rejected:'권한이 거부되었습니다(HTTP 401). 설정에서 다시 확인하거나 로그인하세요.',
    resource_forbidden:'리소스 접근이 거부되었습니다(HTTP 403). 계정 지역, 구독 및 리소스 권한을 확인하세요.',
    resource_not_found:'현재 지역에서 이 리소스를 찾을 수 없습니다(HTTP 404). 다운로드 지역을 바꾸거나 해당 버전을 선택하세요.',
    catalog_token_failed:'카탈로그 토큰을 가져오지 못했습니다. 서비스와 네트워크를 확인한 뒤 다시 시도하세요. 인증 코드를 반복해서 입력할 필요는 없습니다.',
    disk_full:'다운로드 디스크 공간이 부족합니다. 공간을 비우거나 다운로드 위치를 바꾼 뒤 다시 시도하세요.',
    permission_denied:'파일에 쓸 수 없습니다. 다운로드 폴더 권한, 읽기 전용 속성 및 파일 사용 상태를 확인하세요.',
    decryption_failed:'미디어 복호화에 실패했습니다. 진단을 내보내고 복호화 서비스를 확인한 뒤 다시 시도하세요.',
    download_result_missing:'다운로드 결과의 완전성이 확인되지 않았습니다. 파일을 확인하고 실패한 항목을 다시 시도하세요. 파일이 반드시 없다는 뜻은 아닙니다.',
    credentials_failed:'다운로드 자격 증명을 사용할 수 없습니다. 설정에서 로그인 및 서비스 상태를 확인하세요.',
    metadata_failed:'카탈로그 메타데이터를 해석하지 못했습니다. 지역과 네트워크를 확인한 뒤 다시 시도하세요.',
    manifest_failed:'미디어 주소를 해석하지 못했습니다. 지역, 리소스 가용성 및 네트워크를 확인하세요.',
    manifest_queue_timeout_transient:'미디어 주소 요청이 대기열에서 시간 초과되었습니다. 잠시 후 다시 시도하세요.',
    manifest_empty_transient:'미디어 서비스가 아직 재생 주소를 반환하지 않았습니다. 자동으로 다시 시도했으니 잠시 후 다시 시도하세요.',
    manifest_response_invalid:'미디어 주소 서비스 응답이 올바르지 않습니다. 다시 시도하거나 진단을 내보내세요.',
    quality_unavailable:'이 곡은 선택한 음질로 제공되지 않습니다. 다른 음질을 시도하세요.',
    media_failed:'미디어 전송 또는 복호화에 실패했습니다. 현재 기록에는 더 자세한 이유가 없습니다. 진단을 내보낸 뒤 다시 시도하세요.',
    output_failed:'출력 파일을 준비할 수 없습니다. 다운로드 위치, 공간 및 파일 사용 상태를 확인하세요.',
    lyrics_failed:'가사 파일을 쓰지 못했습니다. 다운로드 폴더 권한과 가사 설정을 확인하세요.',
    tagging_failed:'오디오 태그를 쓰지 못했습니다. 파일 사용 상태와 메타데이터 설정을 확인하세요.',
    muxing_failed:'호환 오디오 패키징에 실패했습니다. 파일은 게시되지 않았습니다. 진단을 내보내 원인을 확인하고 임시 파일을 다운로드 완료로 간주하지 마세요.',
    publish_failed:'파일 저장 또는 이름 변경에 실패했습니다. 파일 사용 상태와 폴더 권한을 확인하세요.',
    validation_failed:'오디오 무결성 검사에 실패했습니다. 이 곡을 다시 시도하고 검사되지 않은 파일을 성공으로 간주하지 마세요.',
    track_unavailable:'이 곡은 현재 지역에서 다운로드할 수 있는 버전이 없습니다.',
    playlist_access_denied:'이 플레이리스트에 접근할 권한이 없습니다. 계정 및 플레이리스트 권한을 확인하세요.',
    playlist_auth_required:'개인 플레이리스트에는 유효한 로그인이 필요합니다. 세션을 다시 확인하세요.',
    playlist_not_found:'플레이리스트가 없거나 현재 지역에서 사용할 수 없습니다.',
    playlist_pagination_failed:'플레이리스트 곡을 모두 가져오지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.'
  };
  function downloadFailure(value) {
    const code=value.errorCode||'',message=String(value.errorMessage||'');
    if(downloadFailures[code])return downloadFailures[code];
    const stage={metadata:'카탈로그 해석',manifest:'미디어 주소 해석',media:'미디어 전송'}[code.split('_')[0]]||'다운로드';
    if(/_timeout_transient$/.test(code))return stage+' 시간이 초과되었습니다. 네트워크 또는 로컬 서비스를 확인한 뒤 다시 시도하세요.';
    if(/_dns_transient$/.test(code))return stage+'에서 서버 주소를 해석할 수 없습니다. DNS 또는 프록시 설정을 확인하세요.';
    if(/_connection_transient$/.test(code))return stage+' 연결이 거부되었거나 중단되었습니다. 서비스와 네트워크를 확인하세요.';
    if(/_transient$/.test(code))return /HTTP 429/.test(message)?'업스트림 요청이 너무 많습니다(HTTP 429). 잠시 후 다시 시도하세요.':/HTTP 5xx/.test(message)?'업스트림 서비스를 사용할 수 없습니다(HTTP 5xx). 잠시 후 다시 시도하세요.':stage+' 중 일시적인 네트워크 또는 업스트림 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
    return message ? '실패 원인: '+message.slice(0,400) : '명확한 실패 원인을 받지 못했습니다. 진단을 내보내 조사하세요.';
  }
  function bytes(value) {const units=['B','KiB','MiB','GiB'];let unit=0;while(value>=1024&&unit<3){value/=1024;unit++;}return value.toFixed(unit?1:0)+' '+units[unit];}
  const jobProgressMemory=new Map();
  function freshTransfer(value){return value&&Number.isFinite(value.at)&&Date.now()-value.at<=4000&&value.at-Date.now()<=2000;}
  function activeTransferItems(job){
    const terminal=new Set((job.items||[]).filter(item=>['succeeded','failed','skipped','unavailable','cancelled','interrupted'].includes(item.status)).map(item=>item.sourceId));
    const seen=new Set();return (Array.isArray(job.transfer?.items)?job.transfer.items:[]).filter(item=>{
      if(typeof item.sourceId!=='string'||seen.has(item.sourceId)||terminal.has(item.sourceId)||!Number.isFinite(item.progress)||item.progress<0||item.progress>.99)return false;
      seen.add(item.sourceId);return true;
    });
  }
  function plannedTransferTotals(job){
    const t=job.transfer?.totals,valid=value=>Number.isSafeInteger(value)&&value>=0;
    if(!freshTransfer(job.transfer)||!t||!valid(t.items)||t.items<1||t.items>100000||!valid(t.unknownItems)||t.unknownItems>t.items||
      !valid(t.bytes)||!valid(t.totalBytes)||!valid(t.processedBytes)||t.bytes>t.totalBytes||t.processedBytes>t.totalBytes||
      typeof t.estimated!=='boolean'||(t.unknownItems>0&&!t.estimated)||!Number.isFinite(t.progress)||t.progress<0||t.progress>.99)return null;
    return t;
  }
  function jobProgress(job){
    const budget=plannedTransferTotals(job);
    const total=Math.max(Number.isFinite(job.total)?Math.max(0,job.total):0,budget?.items||0);
    const done=Math.min(total,['succeeded','failed','skipped','unavailable'].reduce((sum,key)=>sum+(Number.isFinite(job[key])?Math.max(0,job[key]):0),0));
    const active=['running','cancelling'].includes(job.status),fresh=freshTransfer(job.transfer),items=fresh?activeTransferItems(job):[];
    const identity=String(job.attempt||0)+'/'+String(job.startedAt||'')+'/'+total;
    let previous=jobProgressMemory.get(job.id);if(previous?.identity!==identity)previous=null;
    let value=done+items.reduce((sum,item)=>sum+item.progress,0),weighted=!!budget||!!items.length||!!previous?.weighted;
    // A selective retry plan describes this attempt, not prior completed tracks.
    // Retain the existing track-unit fallback when those scopes differ.
    if(active&&budget&&budget.items===total&&budget.totalBytes>0&&budget.unknownItems===0)value=total*budget.progress;
    if(active){value=Math.min(value,total*.99);if(fresh&&previous)value=Math.max(value,Math.min(previous.value,total*.99));}
    value=Math.max(0,Math.min(total,value));
    const unknown=budget?budget.unknownItems>0:items.some(item=>!(Number.isFinite(item.totalBytes)&&item.totalBytes>0)&&item.progress===0);
    const known=total>0&&!unknown&&!(active&&weighted&&!fresh);
    if(!active)jobProgressMemory.delete(job.id);else if(fresh){jobProgressMemory.set(job.id,{identity,value,weighted});if(jobProgressMemory.size>256)jobProgressMemory.delete(jobProgressMemory.keys().next().value);}
    return {total,done,value,known,weighted,percent:total?(value/total*100).toFixed(1).replace(/\.0$/,''):''};
  }
  function applyJobProgress(progress,p){
    progress.setAttribute('aria-label','다운로드 및 처리 진행률');progress.max=p.total||1;if(p.known)progress.value=p.value;else progress.removeAttribute('value');
    progress.setAttribute('aria-valuetext',p.known?(p.weighted?'예상 진행률 '+p.percent+'%, ':'')+'처리됨 '+p.done+'곡, 총 '+p.total+'곡':'유효한 진행률 정보 대기 중');
  }
  function transferAmount(job){
    const budget=plannedTransferTotals(job);
    if(budget)return '다운로드됨 '+bytes(budget.bytes)+(budget.unknownItems>0?' · 총량 확인 대기 중':' / '+(budget.estimated?'예상 총량 ':'총량 ')+bytes(budget.totalBytes));
    const items=activeTransferItems(job);if(!items.length)return '';
    const valid=value=>Number.isSafeInteger(value)&&value>=0;
    if(items.some(item=>!valid(item.bytes)||!valid(item.totalBytes)))return '';
    const received=items.reduce((sum,item)=>sum+item.bytes,0),total=items.reduce((sum,item)=>sum+item.totalBytes,0);
    if(!valid(received)||!valid(total))return '';
    return '현재 수신됨 '+bytes(received)+(items.some(item=>item.totalBytes===0)?' · 총량 확인 대기 중':' / '+bytes(total));
  }
  let monitorRequest=null,monitorJobs=[],monitorAt=0,monitorFailed=false;
  function drawMonitor(){
    const progress=$('monitor-progress'),title=$('monitor-title'),detail=$('monitor-detail'),speed=$('monitor-speed');
    const current=monitorJobs.find(job=>job.status==='running')||monitorJobs.find(job=>job.status==='cancelling')||monitorJobs[0];
    const stale=!monitorAt||Date.now()-monitorAt>4500;
    $('sidebar-job-count').hidden=!monitorJobs.length;$('sidebar-job-count').textContent=String(monitorJobs.length)+(monitorJobs.length===100?'+':'');
    if(stale||monitorFailed){title.textContent='다운로드 상태가 아직 갱신되지 않음';detail.textContent=monitorFailed?'연결이 끊어졌습니다. 다시 시도하는 중…':'다운로드 서비스 응답 대기 중…';speed.textContent='—';progress.removeAttribute('value');progress.setAttribute('aria-valuetext','상태를 사용할 수 없음');return;}
    if(!current){title.textContent='다운로드 작업 없음';detail.textContent='현재 활성 다운로드가 없습니다';speed.textContent='0 B/s';progress.max=1;progress.value=0;progress.setAttribute('aria-valuetext','활성 다운로드 없음');return;}
    title.textContent=jobHeading(current);
    const fresh=monitorJobs.filter(job=>['running','cancelling'].includes(job.status)&&job.transfer&&Number.isFinite(job.transfer.at)&&Date.now()-job.transfer.at<=4000&&job.transfer.at-Date.now()<=2000);
    const downloading=fresh.filter(job=>job.transfer.phase==='downloading');
    const bps=downloading.reduce((sum,job)=>sum+(Number.isFinite(job.transfer.bytesPerSecond)?Math.max(0,job.transfer.bytesPerSecond):0),0);
    speed.textContent=downloading.length?bytes(bps)+'/s':'—';
    const p=jobProgress(current),{total,done}=p;
    const phase=current.status==='queued'?'대기 중':current.status==='cancelling'?'취소 중':fresh.find(job=>job.id===current.id)?({preparing:'해석 중',downloading:'다운로드 중',decrypting:'복호화 중',tagging:'태그 작성 중',publish:'저장 중',processing:'처리 중'}[current.transfer?.phase]||'처리 중'):'전송 상태 대기 중';
    const amount=plannedTransferTotals(current)?transferAmount(current):'';
    detail.textContent=phase+(p.weighted&&p.known?' · 예상 '+p.percent+'%':'')+(amount?' · '+amount:total?' · 처리됨 '+done+' / '+total+'곡':' · 곡 해석 중')+(monitorJobs.length>1?' · 활성 작업 '+monitorJobs.length+(monitorJobs.length===100?'+':'')+'개':'');
    applyJobProgress(progress,p);
  }
  function refreshMonitor(){if(monitorRequest)return monitorRequest;monitorRequest=(async()=>{try{const result=await api('/api/v1/jobs?active=true&limit=100');if(!Array.isArray(result.jobs))throw new Error('invalid_jobs');monitorJobs=result.jobs.filter(job=>['queued','running','cancelling'].includes(job.status)&&!removedJobs.has(job.id));monitorAt=Date.now();monitorFailed=false;}catch{monitorFailed=true;}drawMonitor();})().finally(()=>monitorRequest=null);return monitorRequest;}
  function drawJobTransfer(card) {
    const job=card.job,field=card.querySelector('.job-transfer'),value=job.transfer;
    const p=jobProgress(job);applyJobProgress(card.querySelector('progress'),p);
    if(!['running','cancelling'].includes(job.status)){field.textContent='';return;}
    if(!freshTransfer(value)||!Number.isFinite(value.bytesPerSecond)||!Number.isFinite(value.bytes)){field.textContent='전송 상태 대기 중…';return;}
    const phase={preparing:'해석 중',downloading:'다운로드 중',processing:'처리 중',decrypting:'복호화 중',tagging:'태그 작성 중',publish:'저장 중'}[value.phase]||'처리 중';
    field.textContent=phase+(p.weighted&&p.known?' · 예상 '+p.percent+'%':'')+(value.phase==='downloading'?' · '+bytes(Math.max(0,value.bytesPerSecond))+'/s':'')+' · '+(transferAmount(job)||'이번에 수신됨 '+bytes(Math.max(0,value.bytes)));
  }
  let jobRefresh = null, jobListVersion = 0, jobListFailed = false, removalAcknowledged = false;
  const jobOperationErrors = {
    output_busy: '다른 다운로드 또는 파일 삭제가 진행 중입니다. 잠시 후 다시 시도하거나 파일을 유지하려면 “작업만 삭제”를 선택하세요.',
    job_deleting: '이 작업을 삭제하고 있습니다. 완료된 뒤 목록을 새로 고치세요.',
    file_in_use: '다른 프로그램에서 파일을 사용 중입니다. 플레이어 등의 프로그램을 닫은 뒤 다시 시도하세요. 작업 기록은 유지됩니다.',
    file_access_denied: '파일을 삭제할 권한이 없거나 파일이 읽기 전용입니다. 권한을 확인하거나 “작업만 삭제”를 선택하세요.',
    file_changed: '파일이 수정되어 오삭제를 방지하기 위해 유지했습니다. 파일을 유지하려면 “작업만 삭제”를 선택하세요.',
    file_delete_failed: '일부 파일을 삭제하지 못했고 작업 기록은 유지됩니다. 파일 사용 상태와 권한을 확인한 뒤 다시 시도하거나 작업만 삭제하세요.',
    job_active: '작업이 아직 실행 중입니다. 먼저 취소하고 종료된 뒤 삭제하세요.',
    service_maintenance: '서비스가 중지 또는 업데이트 중입니다. 잠시 후 다시 시도하세요.'
  };
  function jobError(error) {
    const message = String(error?.message || error || '');
    for (const [code, text] of Object.entries(jobOperationErrors)) if (new RegExp('\\b' + code + '\\b').test(message)) return text;
    if (/abort|timeout|timed out/i.test(message)) return '요청 시간이 초과되어 결과가 아직 확인되지 않았습니다. 작업 상태를 새로 고치는 중이니 확인 후 다시 시도하세요.';
    return '작업을 완료하지 못했고 작업 기록의 삭제도 확인되지 않았습니다. 로컬 서비스를 확인한 뒤 다시 시도하세요.';
  }
  function syncJobOperation(card) {
    const operation = jobOperations.get(card.dataset.jobId);
    card.setAttribute('aria-busy', String(!!operation));
    for (const control of card.querySelectorAll('[data-job-action]')) {
      control.disabled = !!operation;
      control.textContent = operation?.action === control.dataset.jobAction ? (operation.deleting ? '삭제 중…' : '처리 중…') : control.dataset.label;
      control.setAttribute('aria-label', control.textContent);
    }
  }
  async function refreshJobsAfterMutation() {
    if (jobRefresh) await jobRefresh;
    if (state.view === 'tasks') await jobs();
  }
  async function jobAction(id, action) {
    if (jobOperations.has(id) || removedJobs.has(id)) return;
    const deleting = action === 'record' || action === 'files';
    if (action === 'files' && !confirm('이 작업과 이 작업이 소유한 다운로드 파일을 삭제할까요?')) return;
    const card = jobCards.get(id);
    if (!card) return;
    jobOperations.set(id, { action, deleting }); ++jobListVersion; removalAcknowledged = false;
    const feedback = card.querySelector('.job-feedback');
    feedback.textContent = deleting ? '삭제 중입니다. 잠시 기다리세요…' : '처리 중…'; feedback.classList.remove('error');motion?.feedback(feedback,feedback.textContent);
    syncJobOperation(card);
    const suffix = { record: '/record', files: '', cancel: '/cancel', retry: '/retry' }[action];
    try {
      try { await api('/api/v1/jobs/' + id + suffix, deleting ? 'DELETE' : 'POST'); }
      catch (error) { if (!deleting || !/\bnot_found\b/.test(String(error?.message || error))) throw error; }
      ++jobListVersion;
      if (deleting) {
        removedJobs.add(id); jobCards.delete(id); motion?.cancelTree(card);card.remove(); removalAcknowledged = true;
        $('jobs-status').textContent = action === 'record' ? '작업을 삭제했고 다운로드 파일은 유지했습니다.' : '작업과 이 작업이 소유한 파일을 삭제했습니다.';
      } else { feedback.textContent = action === 'cancel' ? '취소를 요청했습니다.' : '다시 시도를 요청했습니다.'; }
    } catch (error) {
      feedback.textContent = jobError(error); feedback.classList.add('error');
      motion?.feedback(feedback,feedback.textContent);
    } finally {
      jobOperations.delete(id); syncJobOperation(card);
      void refreshJobsAfterMutation();
    }
  }
  function drawJob(job) {
    let card = jobCards.get(job.id);
    if (!card) {
      card = node('article', undefined, 'job'); card.dataset.jobId = job.id;
      const feedback = node('p', '', 'job-feedback'); feedback.setAttribute('role', 'status');
      const heading=node('div',undefined,'job-heading');const folderStatus=node('p','','job-folder-feedback');folderStatus.setAttribute('role','status');let folder;
      folder=button('',async()=>{if(folder.disabled)return;folder.disabled=true;folder.setAttribute('aria-busy','true');try{const result=await desktop.revealJobFolder(job.id);folderStatus.textContent=result?.revealed===false?'다운로드 폴더를 열었지만 작업에 찾을 수 있는 파일이 없습니다.':'';}catch(error){folderStatus.textContent=/native_directory_missing/.test(error?.message||'')?'저장 폴더가 없습니다. 디스크 또는 폴더를 확인하세요.':'포함된 폴더를 열 수 없습니다. 잠시 후 다시 시도하세요.';}finally{folder.disabled=!desktop.revealJobFolder;folder.removeAttribute('aria-busy');}},'포함된 폴더 열기');folder.className='job-folder-button';folder.title='포함된 폴더 열기';folder.disabled=!desktop.revealJobFolder;
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','ui-icon');icon.setAttribute('aria-hidden','true');const shape=document.createElementNS('http://www.w3.org/2000/svg','path');shape.setAttribute('d','M3 7V4h7l2 3h9v13H3Z');icon.append(shape);folder.append(icon);heading.append(node('h3'),folder);
      card.append(heading,folderStatus,node('p', '', 'job-summary'), node('p','','job-transfer'),node('p','','job-failure'), node('progress'), node('ul'), node('div', undefined, 'job-actions'), feedback);
      jobCards.set(job.id, card);
    }
    card.job=job;card.querySelector('h3').textContent = jobHeading(job);card.querySelector('h3').title=job.url;drawJobTransfer(card);
    if(card.jobStatus!==undefined&&card.jobStatus!==job.status)motion?.enter(card.querySelector('.job-summary'),'feedback');card.jobStatus=job.status;
    card.querySelector('.job-summary').textContent = (statusNames[job.status] || job.status) + ' · 성공 ' + job.succeeded + ' · 실패 ' + job.failed + ' · 건너뜀 ' + job.skipped + ' · 사용할 수 없음 ' + job.unavailable;
    const items = card.querySelector('ul'), signature = JSON.stringify(job.items || []);
    const failedItems=(job.items||[]).filter(item=>item.status==='failed'||item.status==='unavailable');
    card.querySelector('.job-failure').textContent=['failed','partial','interrupted'].includes(job.status)?(job.errorCode&&job.errorCode!=='execution_failed'?downloadFailure(job):failedItems.length?downloadFailure(failedItems[0]):downloadFailure(job)):'';
    if (card.itemsSignature !== signature) {
      const scroll = items.scrollTop; items.replaceChildren();
      for (const item of job.items || []) {const row=node('li',(item.name||item.sourceId)+' · '+(statusNames[item.status]||item.status));if(['failed','unavailable','interrupted'].includes(item.status))row.append(node('p',downloadFailure(item),'job-item-failure'));items.append(row);}
      items.hidden = !job.items?.length; items.scrollTop = scroll; card.itemsSignature = signature;
    }
    // Preserve the actual button nodes across polling, including pointer-down
    // to pointer-up. Do not rebuild a pending action even if its status changes.
    if (card.actionStatus !== job.status && !jobOperations.has(job.id)) {
      const actions = card.querySelector('.job-actions'); actions.replaceChildren();
      const add = (label, action) => { const control = button(label, () => jobAction(job.id, action)); control.dataset.jobAction = action; control.dataset.label = label; actions.append(control); };
      if (['queued', 'running', 'cancelling'].includes(job.status)) add('취소', 'cancel');
      else {
        if (['failed', 'partial', 'interrupted', 'cancelled'].includes(job.status)) add('실패한 항목 다시 시도', 'retry');
        add('작업만 삭제', 'record'); add('작업 및 파일 삭제', 'files');
      }
      card.actionStatus = job.status;
    }
    syncJobOperation(card);
    return card;
  }
  function jobs() {
    if (jobRefresh) return jobRefresh;
    const version = jobListVersion;
    jobRefresh = (async () => {
      try {
        const result = await api('/api/v1/jobs?limit=30');
        if (state.view !== 'tasks' || version !== jobListVersion) return;
        const list = $('jobs'), visible = new Set();
        list.querySelector('.jobs-empty')?.remove();
        let previous = null;
        for (const job of result.jobs || []) {
          if (removedJobs.has(job.id)) continue;
          visible.add(job.id); const card = drawJob(job);
          const next = previous ? previous.nextElementSibling : list.firstElementChild;
          if (next !== card) {const entering=!card.isConnected;list.insertBefore(card, next);if(entering)motion?.enter(card.querySelector('h3'),'card');}
          previous = card;
        }
        for (const [id, card] of jobCards) if (!visible.has(id) && !jobOperations.has(id)) { motion?.cancelTree(card);card.remove(); jobCards.delete(id); }
        if (!jobCards.size) list.append(node('p', '아직 다운로드 작업이 없습니다.', 'jobs-empty'));
        void resolveJobNames();
        if (jobListFailed) { $('jobs-status').textContent = ''; jobListFailed = false; }
      } catch {
        if (state.view !== 'tasks' || version !== jobListVersion) return;
        jobListFailed = true;
        $('jobs-status').textContent = removalAcknowledged ? '작업은 삭제되었지만 목록을 새로 고치지 못했습니다. 잠시 후 자동으로 다시 시도합니다.' : '작업 목록을 새로 고치지 못했습니다. 현재 목록은 유지하며 잠시 후 자동으로 다시 시도합니다.';
      }
    })().finally(() => { jobRefresh = null; });
    return jobRefresh;
  }
  const fields = [['downloadRegion','다운로드 지역',['','us','cn','hk','tw','jp','gb']],['metadataRegion','메타데이터 일치 지역',['','cn','us','jp']],['lyricsRegion','가사 지역',['','cn','us','jp']],['language','메타데이터 언어',['','zh-CN','zh-TW','en-US','ja']],['lyricsType','가사 유형',['lyrics','syllable-lyrics']],['lyricsFormat','가사 형식',['lrc','ttml']],['coverFormat','커버 형식',['jpg','png']],['coverSize','커버 크기',['500x500','1000x1000','3000x3000','5000x5000']],['alacMax','ALAC 샘플 레이트 상한',[44100,48000,96000,192000]],['saveLyrics','가사 파일 저장'],['embedLyrics','가사 포함'],['embedCover','커버 포함'],['saveArtistCover','아티스트 커버 저장'],['saveAnimatedArtwork','움직이는 아트워크 저장'],['useSongInfoForPlaylist','앨범 트랙 순서 사용']];
  const regionChoices={'':'자동',us:'미국',cn:'중국 본토',hk:'홍콩',tw:'대만',jp:'일본',gb:'영국'};
  const preferenceChoices={downloadRegion:regionChoices,metadataRegion:regionChoices,lyricsRegion:regionChoices,language:{'':'자동','zh-CN':'중국어 간체','zh-TW':'중국어 번체','en-US':'영어',ja:'일본어'},lyricsType:{lyrics:'줄 단위 가사','syllable-lyrics':'음절 단위 가사'},lyricsFormat:{lrc:'LRC',ttml:'TTML'},coverFormat:{jpg:'JPG',png:'PNG'},coverSize:{'500x500':'500 × 500 px','1000x1000':'1000 × 1000 px','3000x3000':'3000 × 3000 px','5000x5000':'5000 × 5000 px'},alacMax:{44100:'44.1 kHz',48000:'48 kHz',96000:'96 kHz',192000:'192 kHz'}};
  const preferenceLabel=(key,value)=>Object.hasOwn(preferenceChoices[key]||{},String(value))?preferenceChoices[key][String(value)]:String(value);
  function drawPreferences(value) { state.preferences = value; $('preference-fields').replaceChildren(); for (const [key, label, options] of fields) { const field = node('label', label, options ? '' : 'check'); const control = node(options ? 'select' : 'input'); control.dataset.preference = key; if (options) { for (const choice of options) { const option = node('option', preferenceLabel(key,choice)); option.value = String(choice); control.append(option); } if (![...control.options].some(option => option.value === String(value[key]))) { const option = node('option', preferenceLabel(key,value[key])); option.value = String(value[key]); control.append(option); } control.value = String(value[key]); } else { control.type = 'checkbox'; control.checked = value[key]; } field.append(control); $('preference-fields').append(field); } $('filename').value = value.songFileFormat; }
  async function cacheSettings(){if(!desktop.cacheInfo){$('cache-usage').textContent='캐시 설정에는 최신 데스크톱 서비스가 필요합니다.';$('save-cache-limit').disabled=true;$('clear-cache').disabled=true;return;}try{const info=await desktop.cacheInfo();$('cache-limit').value=String(info.limitMB);$('cache-usage').textContent=info.available?'사용 중 '+bytes(info.usedBytes)+' / '+info.limitMB+' MB · 카탈로그 및 커버 캐시 '+info.entries+'개':'캐시를 사용할 수 없지만 온라인 탐색은 계속할 수 있습니다.';}catch{$('cache-usage').textContent='캐시 사용량을 지금 읽을 수 없습니다.';}}
  async function settings() {void cacheSettings(); try { const [preferences, concurrency, current] = await Promise.all([api('/api/v1/settings/download'), api('/api/v1/settings/download-concurrency'), api('/api/native/state')]); drawPreferences(preferences.settings); $('concurrency').value = concurrency.downloadConcurrency; $('download-directory').textContent = current.downloadDirectory || ''; $('runtime-state').textContent = current.runtime.phase === 'ready' ? 'Windows 네이티브 서비스 · 준비됨' : 'Windows 네이티브 서비스 · 시작 중'; } catch { notice('설정을 사용할 수 없습니다. 로컬 서비스를 확인하세요.'); } }
  $('choose-download-directory').disabled=!desktop.chooseDownloadDirectory;
  $('choose-download-directory').onclick=async()=>{const control=$('choose-download-directory');if(control.disabled)return;control.disabled=true;try{const result=await desktop.chooseDownloadDirectory();if(result&&!result.canceled){$('download-directory').textContent=result.directory;$('directory-feedback').textContent='다운로드 위치를 저장했습니다. 새 작업에 적용되며 기존 작업은 원래 위치를 유지합니다.';}}catch(error){$('directory-feedback').textContent=/native_directory_denied/.test(error?.message||'')?'이 폴더에는 쓸 수 없습니다. 다시 선택하세요.':'다운로드 위치를 변경하지 못했습니다. 폴더를 확인한 뒤 다시 시도하세요.';}finally{control.disabled=!desktop.chooseDownloadDirectory;}};
  $('save-cache-limit').onclick=async()=>{const limit=Number($('cache-limit').value);if(!$('cache-limit').value.trim()||!Number.isInteger(limit)||limit<0||limit>10240){$('cache-feedback').textContent='0–10240 MB를 입력하세요. 0은 캐시를 끕니다.';return;}const control=$('save-cache-limit');control.disabled=true;try{await desktop.setCacheLimit(limit);prefetched.clear();await cacheSettings();$('cache-feedback').textContent=limit?'캐시 상한을 조정했고 용량을 초과한 이전 캐시를 자동으로 정리했습니다.':'캐시를 끄고 정리했습니다.';}catch{$('cache-feedback').textContent='조정을 완료하지 못했습니다. 다시 시도하세요.';}finally{control.disabled=false;}};
  $('clear-cache').onclick=async()=>{const control=$('clear-cache');control.disabled=true;try{await desktop.clearCache();prefetched.clear();await cacheSettings();$('cache-feedback').textContent='캐시를 정리했습니다. 다운로드 파일과 로그인 세션은 영향을 받지 않습니다.';}catch{$('cache-feedback').textContent='정리를 완료하지 못했습니다. 다시 시도하세요.';}finally{control.disabled=false;}};
  $('refresh-catalog').onclick=async()=>{const control=$('refresh-catalog');control.disabled=true;++state.generation;try{if(state.view==='tasks'){await Promise.all([jobs(),refreshMonitor()]);return;}if(state.view==='settings'){await settings();return;}await desktop.refreshCatalog?.();prefetched.clear();detailHistory.length=0;void loadSidebarLibrary(true);if(state.detail){state.browseSnapshot=null;await detail(state.detail,true);}else if(searching)await browse(state.catalogPath);else await feed(state.feed);}catch{notice('새로 고침을 완료하지 못했습니다. 잠시 후 다시 시도하세요.');}finally{control.disabled=false;}};
  for (const token of ['{tracknum:02d}', '{disk}', '{title}', '{artist}', '{album}', '{album_artist}', '{year}', '{song_id}', ' - ', '. ']) $('filename-tokens').append(button(token, () => { const field = $('filename'); field.setRangeText(token, field.selectionStart, field.selectionEnd, 'end'); field.focus(); }));
  for (const control of document.querySelectorAll('[data-view]')) control.onclick = () => view(control.dataset.view);
  for (const control of document.querySelectorAll('[data-feed]')) control.onclick = () => { view('browse'); void feed(control.dataset.feed); };
  function setSidebar(expanded,save=false){const changed=document.body.classList.contains('nav-open')!==expanded;document.body.classList.toggle('nav-open',expanded);$('nav-toggle').setAttribute('aria-expanded',String(expanded));$('nav-toggle').setAttribute('aria-label',expanded?'사이드바 접기':'사이드바 펼치기');if(changed)requestAnimationFrame(syncDiscoveryShelves);if(changed&&expanded)motion?.enter(document.querySelector('.sidebar-scroll'),'panel');if(save)try{localStorage.setItem('native-v2-sidebar',expanded?'expanded':'collapsed');}catch{}}
  let sidebarPreference='';try{sidebarPreference=localStorage.getItem('native-v2-sidebar')||'';}catch{}setSidebar(innerWidth>900&&sidebarPreference!=='collapsed');
  $('nav-toggle').onclick = () => setSidebar(!document.body.classList.contains('nav-open'),true);
  $('sidebar-search-toggle').onclick=()=>{setSidebar(true);$('search-input').focus();};
  for(const control of document.querySelectorAll('[data-feed]'))preloadOnIntent(control,()=>feedPath(control.dataset.feed));
  $('quality').onchange=()=>gate();
  $('session-light').onclick = () => { view('settings'); if(state.session !== 'authenticated') void desktop.openLogin().catch(()=>notice('로그인 창을 지금 사용할 수 없습니다.')); }; $('open-login').onclick = () => desktop.openLogin().catch(()=>notice('로그인 창을 지금 사용할 수 없습니다.')); $('recheck').onclick = () => desktop.recheck().catch(() => notice('확인을 사용할 수 없습니다. 네트워크를 확인하세요.'));
  $('export-log').onclick = () => desktop.exportDiagnostics().catch(()=>notice('진단 내보내기를 완료하지 못했습니다.')); $('browse-back').onclick = goBack;
  $('download-monitor').onclick=()=>view('tasks');
  document.addEventListener('keydown', event => { if(event.key==='Escape'&&!event.defaultPrevented&&state.view==='browse'&&state.detail){event.preventDefault();closeDetail();} });
  $('region').onchange = () => { $('region').dataset.selected = 'true';void loadSidebarLibrary(true); if (state.detail) { state.browseSnapshot = null;detailHistory.length=0; void detail(state.detail,true); } else void feed(state.feed); };
  $('search-form').onsubmit = event => { event.preventDefault(); view('browse'); searching=true;discardDetail();updateNavigation();if(innerWidth<=900)setSidebar(false); void browse('/api/v1/catalog/search?' + new URLSearchParams({ region: $('region').value, term: $('search-input').value.trim(), type: '', offset: '0' })); };
  $('manual-form').onsubmit = event => { event.preventDefault(); void queue($('manual-url').value.trim()); };
  $('stop-playback').onclick = () => stopPlayback(); for (const event of ['playing','pause','ended']) $('audio').addEventListener(event, () => { $('player-status').textContent = (statusNames[event] || { playing: '재생 중', pause: '일시 정지됨', ended: '재생 종료' }[event]) + ' · ' + ($('audio').dataset.mode || ''); }); $('audio').onerror = () => { if(state.playbackItem&&$('audio').dataset.mode==='전체 재생'){void preview(state.playbackItem,state.playbackGeneration);}else if(state.playbackItem)$('player-status').textContent = '오디오를 사용할 수 없습니다. 다시 시도하세요.'; };
  try { const saved = JSON.parse(localStorage.getItem('native-v2-download-defaults') || '{}'); if (['aac-lc','alac','atmos'].includes(saved.quality)) $('quality').value = saved.quality; if (['skip','overwrite','fail'].includes(saved.existing)) $('existing').value = saved.existing; } catch {}
  $('save-settings').onclick = async () => { if (!state.preferences) return; const next = { ...state.preferences, songFileFormat: $('filename').value }; for (const control of document.querySelectorAll('[data-preference]')) next[control.dataset.preference] = control.type === 'checkbox' ? control.checked : control.dataset.preference === 'alacMax' ? Number(control.value) : control.value; try { await api('/api/v1/settings/download','PUT',next); await api('/api/v1/settings/download-concurrency','PUT',{downloadConcurrency:Number($('concurrency').value)}); localStorage.setItem('native-v2-download-defaults',JSON.stringify({quality:$('quality').value,existing:$('existing').value})); notice('설정을 저장했습니다. 다음 작업부터 적용됩니다.'); } catch { notice('저장에 실패했습니다. 설정 값을 확인하세요.'); } };
  $('reset-settings').onclick = async () => { try { await api('/api/v1/settings/download','DELETE'); await api('/api/v1/settings/download-concurrency','DELETE'); $('quality').value='alac';$('existing').value='skip';localStorage.removeItem('native-v2-download-defaults');await settings();await gate(); } catch {notice('기본값 복원을 완료하지 못했습니다. 다시 시도하세요.');} };
  desktop.onSession(observe); desktop.getState().then(observe).catch(() => observe({state:'runtime_unavailable'}));
  const icons={home:['m3 10 9-7 9 7','M5 9v12h5v-7h4v7h5V9'],grid:['M3 3h7v7H3z','M14 3h7v7h-7z','M3 14h7v7H3z','M14 14h7v7h-7z'],library:['M5 3h14v18H5z','M8 7h8','M8 11h8','m9 16 2 2 4-4'],download:['M12 3v12','m7 10 5 5 5-5','M4 16v5h16v-5'],settings:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','m10 3-1 3-3 1-3-1-1 4 2 2-1 3 3 2 3-1 2 2 4-1 1-3 3-1 1-4-2-2 1-3-3-2-3 1-2-2Z'],search:['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14','m15 15 6 6'],sidebar:['M3 4h18v16H3z','M8 4v16'],music:['M9 18V5l10-2v13','m9 9 10-2','M5 16a3 2 0 1 0 0 4 3 2 0 0 0 0-4','M15 14a3 2 0 1 0 0 4 3 2 0 0 0 0-4'],refresh:['M20 11a8 8 0 1 0-2 6','M20 4v7h-7']};
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('ui-icon');for(const d of icons[name]||[]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;}
  for(const target of document.querySelectorAll('[data-icon]'))target.append(icon(target.dataset.icon));
  if(desktop.onReady)desktop.onReady(()=>{void feed('home');void loadSidebarLibrary(true);void refreshMonitor();});else {void feed('home');void refreshMonitor();} setInterval(() => {void refreshMonitor();drawMonitor();if (state.view === 'tasks') {void jobs();for(const card of jobCards.values())drawJobTransfer(card);} }, 1000);
})();
