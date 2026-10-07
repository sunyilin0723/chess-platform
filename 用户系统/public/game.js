const CELL=36,PAD=28;
let selectedGame='gomoku',selectedTimer=0,selectedMode='pvp',selectedDifficulty='easy',selectedForbidden=false;
let token=localStorage.getItem('gomoku_token')||'';
let currentUser=localStorage.getItem('gomoku_user')||'';
let ws,myColor=0,turn=0,gameOver=false,gameType='gomoku',boardSize=15;
let board=[],lastMove=null,playerNames={};
let timerSeconds=0,timeLeft=[0,0],moveCount=0;
let reportScreenshot='';
let isAI=false,aiColor=0,forbiddenRule=false;

// HTML安全转义
function escapeHtml(str){
  if(typeof str!=='string')return str;
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ==================== Cloudflare Turnstile ====================
let _turnstileSiteKey=null,_turnstileWidgets={};
async function getTurnstileSiteKey(){
  if(_turnstileSiteKey!==null)return _turnstileSiteKey;
  try{const r=await fetch('/api/turnstile-key');const j=await r.json();_turnstileSiteKey=j.siteKey||''}catch{_turnstileSiteKey=''}
  return _turnstileSiteKey;
}
// 等待 turnstile 脚本加载（async defer，可能未就绪）
function waitTurnstileScript(){
  return new Promise(resolve=>{
    if(window.turnstile)return resolve();
    const t=setInterval(()=>{if(window.turnstile){clearInterval(t);resolve()}},200);
    setTimeout(()=>{clearInterval(t);resolve()},5000);
  });
}
// 渲染（或重置）验证控件；siteKey 未配置时不做任何事
async function ensureTurnstile(name,containerId){
  const key=await getTurnstileSiteKey();
  if(!key)return;
  await waitTurnstileScript();
  if(!window.turnstile)return;
  const container=document.getElementById(containerId);
  if(!container)return;
  if(_turnstileWidgets[name]!==undefined){try{turnstile.reset(_turnstileWidgets[name])}catch(_){}return}
  _turnstileWidgets[name]=turnstile.render(container,{sitekey:key,theme:'auto'});
}
function getTurnstileToken(name){
  if(!window.turnstile||_turnstileWidgets[name]===undefined)return '';
  try{return turnstile.getResponse(_turnstileWidgets[name])||''}catch{return ''}
}
function resetTurnstile(name){
  if(window.turnstile&&_turnstileWidgets[name]!==undefined){try{turnstile.reset(_turnstileWidgets[name])}catch(_){}}
}

const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');

// 页面加载时确保聊天框为空，并初始化主题
document.addEventListener('DOMContentLoaded',()=>{
  const c=document.getElementById('chat-msgs');
  if(c) c.innerHTML='';
  // 初始化主题
  const savedTheme=localStorage.getItem('gomoku_theme')||'dark';
  document.documentElement.setAttribute('data-theme',savedTheme);
  // 音效开关图标
  updateSoundBtn();
  updateNotifyBtn();
  // 初始化棋类选择滑块
  initGameSlider();
  // 默认选中五子棋，显示禁手选项
  selectGame('gomoku',document.querySelector('.game-slider-item.selected'));
});

// ==================== 前端路由 ====================
const VIEW_PATHS = { lobby: '/home', auth: '/login', leaderboard: '/leaderboard', profile: '/profile', game: '/game' };
const PATH_VIEWS = { '/': 'lobby', '/home': 'lobby', '/login': 'auth', '/leaderboard': 'leaderboard', '/profile': 'profile' };
let _routing = false; // popstate 导航时禁止再 pushState

function pathForView(name) {
  return VIEW_PATHS[name] || '/home';
}
function viewForPath(p) {
  if (PATH_VIEWS[p]) return PATH_VIEWS[p];
  if (p.startsWith('/profile')) return 'profile';
  // 含 /game 及未知路径：对局不可从 URL 还原，回大厅
  return 'lobby';
}
function syncUrl(name) {
  if (_routing) { _routing = false; return; }
  const path = pathForView(name);
  if (location.pathname !== path) history.pushState({ view: name }, '', path);
}
window.addEventListener('popstate', () => {
  _routing = true;
  showView(viewForPath(location.pathname));
});

function showView(name){
  // 关闭移动端菜单
  const navLinks=document.getElementById('nav-links');
  const hamburgerBtn=document.querySelector('.hamburger-btn');
  if(navLinks) navLinks.classList.remove('show');
  if(hamburgerBtn) hamburgerBtn.classList.remove('active');
  // 从游戏房间返回大厅时清理状态
  if(name==='lobby'){
    backToLobbyCalled=true;
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    reconnectAttempts=0;
    if(ws){ ws.close(); ws=null; }
    // 关闭残留的全屏弹窗
    ['choose-first','undo-dialog','draw-dialog','report-dialog'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.classList.remove('show');
    });
    ['join-choice-dialog','feedback-dialog','welcome-dialog'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.style.display='none';
    });
    const chatMsgs=document.getElementById('chat-msgs');
    if(chatMsgs) chatMsgs.innerHTML='';
    const chatInput=document.getElementById('chat-input');
    if(chatInput) chatInput.value='';
    board=[]; lastMove=null; gameOver=false; myColor=0; turn=0;
    playerNames={}; moveCount=0;
    window._chessSelected=null; window._intlChessSelected=null;
    isAI=false; aiColor=0; isSpectator=false;
    joinDialogOpen=false;
  }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(name+'-view').classList.add('active');
  const nav=document.getElementById('navbar');
  if(name==='auth'){nav.classList.remove('show')}
  else{nav.classList.add('show');document.getElementById('nav-username').textContent=currentUser}
  if(name==='profile')loadProfile(currentUser);
  if(name==='leaderboard')loadLeaderboard();
  syncUrl(name);
}
function switchTab(t){
  document.getElementById('tab-login').className=t==='login'?'active':'';
  document.getElementById('tab-register').className=t==='register'?'active':'';
  document.getElementById('form-login').style.display=t==='login'?'block':'none';
  document.getElementById('form-register').style.display=t==='register'?'block':'none';
  document.getElementById('auth-error').textContent='';
  // 切到注册页时渲染人机验证（容器需先可见）
  if(t==='register')ensureTurnstile('register','register-turnstile');
}
function authError(msg){document.getElementById('auth-error').textContent=msg}
async function apiFetch(path,opts){
  opts=opts||{};
  const headers=Object.assign({},opts.headers||{});
  headers['Content-Type']='application/json';
  if(token)headers['Authorization']='Bearer '+token;
  opts.headers=headers;
  const res=await fetch(path,opts);
  const data=await res.json();
  if(data.error)throw new Error(data.error);
  return data;
}
async function doLogin(){
  const username=document.getElementById('login-user').value.trim();
  const password=document.getElementById('login-pw').value;
  if(!username||!password)return authError('请输入用户名和密码');
  try{const d=await apiFetch('/api/login',{method:'POST',body:JSON.stringify({username,password})});
  if(d.error)return authError(d.error);
  token=d.token;currentUser=d.username;localStorage.setItem('gomoku_token',token);localStorage.setItem('gomoku_user',currentUser);
  document.getElementById('lobby-greeting').textContent='欢迎，'+currentUser;loadNotifs();showView('lobby');
  }catch(e){authError(e.message)}
}
async function doRegister(){
  const username=document.getElementById('reg-user').value.trim();
  const password=document.getElementById('reg-pw').value;
  const password2=document.getElementById('reg-pw2').value;
  if(!username||!password)return authError('请输入用户名和密码');
  if(password!==password2)return authError('两次密码不一致');
  const turnstileToken=getTurnstileToken('register');
  if(window.turnstile&&_turnstileWidgets['register']!==undefined&&!turnstileToken)return authError('请先完成人机验证');
  try{const d=await apiFetch('/api/register',{method:'POST',body:JSON.stringify({username,password,turnstileToken})});
  if(d.error){resetTurnstile('register');return authError(d.error);}
  token=d.token;currentUser=d.username;localStorage.setItem('gomoku_token',token);localStorage.setItem('gomoku_user',currentUser);
  document.getElementById('lobby-greeting').textContent='欢迎，'+currentUser;showView('lobby');
  document.getElementById('welcome-dialog').style.display='flex';
  }catch(e){resetTurnstile('register');authError(e.message)}
}
function closeWelcomeDialog(){document.getElementById('welcome-dialog').style.display='none'}
async function logout(){
  // 停止重连，防止用空 token 重连
  backToLobbyCalled=true;
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  reconnectAttempts=0;
  try{await apiFetch('/api/logout',{method:'POST'})}catch{}
  if(ws){ ws.close(); ws=null; }
  token='';currentUser='';
  localStorage.removeItem('gomoku_token');localStorage.removeItem('gomoku_user');
  // 清除所有聊天和私信残留
  const chatMsgs=document.getElementById('chat-msgs');
  if(chatMsgs) chatMsgs.innerHTML='';
  const chatInput=document.getElementById('chat-input');
  if(chatInput) chatInput.value='';
  document.getElementById('notif-panel').style.display='none';
  document.getElementById('notif-badge').style.display='none';
  document.getElementById('notif-list').innerHTML='';
  document.getElementById('dm-panel').style.display='none';
  document.getElementById('dm-badge').style.display='none';
  document.getElementById('dm-list').innerHTML='';
  document.getElementById('dm-conversation-dialog').style.display='none';
  document.getElementById('new-dm-dialog').style.display='none';
  document.getElementById('dm-conv-messages').innerHTML='';
  showView('auth')
}
async function checkLogin(){
  if(!token){showView('auth');return}
  try{
    const d=await apiFetch('/api/me');
    currentUser=d.username||currentUser;
    localStorage.setItem('gomoku_user',currentUser);
    document.getElementById('lobby-greeting').textContent='欢迎，'+currentUser;
    loadNotifs();
    // 按当前 URL 路由（支持直接访问 /leaderboard、/profile 等）
    let target=viewForPath(location.pathname);
    if(target==='auth')target='lobby'; // 已登录访问 /login → 大厅
    showView(target);
  }catch{showView('auth')}
}
function selectTimer(secs,btn){selectedTimer=secs;document.querySelectorAll('.timer-select button').forEach(b=>b.classList.remove('sel'));btn.classList.add('sel')}
function selectMode(mode,btn){
  selectedMode=mode;
  document.querySelectorAll('.mode-select button').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('ai-difficulty').style.display=mode==='pve'?'block':'none';
  document.getElementById('room-input').style.display=mode==='pve'?'none':'';
  document.querySelector('#lobby-view .lobby-card > button[onclick="joinRoom()"]').textContent=mode==='pve'?'开始人机对战':'加入房间';
}
function selectDifficulty(diff,btn){
  selectedDifficulty=diff;
  document.querySelectorAll('#ai-difficulty button').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}
function selectForbidden(forbidden,btn){
  selectedForbidden=forbidden;
  document.querySelectorAll('#forbidden-select button').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}
// 棋类选择滑块
const GAME_TYPES = ['gomoku','go','chess','intl_chess'];
function selectGame(type,btn){
  selectedGame=type;
  const items=document.querySelectorAll('.game-slider-item');
  items.forEach(b=>b.classList.remove('selected'));
  if(btn)btn.classList.add('selected');
  moveSliderIndicator(GAME_TYPES.indexOf(type));
  const forbidden=document.getElementById('forbidden-select');
  if(forbidden){
    if(type==='gomoku')forbidden.classList.remove('hidden');
    else forbidden.classList.add('hidden');
  }
}
function moveSliderIndicator(index){
  if(index<0)index=0;
  const indicator=document.getElementById('game-slider-indicator');
  if(!indicator)return;
  const count=GAME_TYPES.length;
  const width=100/count;
  indicator.style.left=`calc(${index*width}% + 4px)`;
  indicator.style.width=`calc(${width}% - 6px)`;
}
// 拖拽支持
let sliderDragging=false,sliderStartX=0,sliderStartIndex=0,sliderMoved=false;
function initGameSlider(){
  const slider=document.getElementById('game-slider');
  if(!slider)return;
  const items=document.querySelectorAll('.game-slider-item');
  const indicator=document.getElementById('game-slider-indicator');
  // 初始化指示器位置
  moveSliderIndicator(0);
  slider.addEventListener('pointerdown',e=>{
    sliderDragging=true;sliderMoved=false;
    sliderStartX=e.clientX;
    sliderStartIndex=GAME_TYPES.indexOf(selectedGame);
    try{slider.setPointerCapture(e.pointerId)}catch(_){}
    indicator.style.transition='none';
    items.forEach(b=>b.classList.add('dragging'));
  });
  slider.addEventListener('pointermove',e=>{
    if(!sliderDragging)return;
    const dx=e.clientX-sliderStartX;
    if(Math.abs(dx)>4)sliderMoved=true;
    const sliderWidth=slider.offsetWidth;
    const count=GAME_TYPES.length;
    const itemWidth=sliderWidth/count;
    const offset=Math.max(0,Math.min(sliderWidth-itemWidth, sliderStartIndex*itemWidth+dx));
    indicator.style.left=(offset+4)+'px';
  });
  slider.addEventListener('pointerup',e=>{
    if(!sliderDragging)return;
    sliderDragging=false;
    indicator.style.transition='left .3s cubic-bezier(.4,0,.2,1),background .3s';
    items.forEach(b=>b.classList.remove('dragging'));
    if(sliderMoved){
      // 拖拽：根据距离吸附
      const dx=e.clientX-sliderStartX;
      const sliderWidth=slider.offsetWidth;
      const itemWidth=sliderWidth/GAME_TYPES.length;
      let targetIndex=Math.round((sliderStartIndex*itemWidth+dx)/itemWidth);
      targetIndex=Math.max(0,Math.min(GAME_TYPES.length-1,targetIndex));
      selectGame(GAME_TYPES[targetIndex],items[targetIndex]);
    } else {
      // 点击：根据点击位置计算索引
      const rect=slider.getBoundingClientRect();
      const x=e.clientX-rect.left;
      let targetIndex=Math.floor(x/(rect.width/GAME_TYPES.length));
      targetIndex=Math.max(0,Math.min(GAME_TYPES.length-1,targetIndex));
      selectGame(GAME_TYPES[targetIndex],items[targetIndex]);
    }
  });
  slider.addEventListener('pointercancel',()=>{
    sliderDragging=false;
    indicator.style.transition='left .3s cubic-bezier(.4,0,.2,1),background .3s';
    items.forEach(b=>b.classList.remove('dragging'));
    moveSliderIndicator(GAME_TYPES.indexOf(selectedGame));
  });
  slider.addEventListener('pointercancel',()=>{
    sliderDragging=false;
    indicator.style.transition='left .3s cubic-bezier(.4,0,.2,1),background .3s';
    items.forEach(b=>b.classList.remove('dragging'));
    moveSliderIndicator(GAME_TYPES.indexOf(selectedGame));
  });
}
function joinRoom(){
  let roomId=document.getElementById('room-input').value.trim()||'default';
  if(selectedMode==='pve') roomId='pve_'+currentUser;
  connect(roomId,selectedMode,selectedDifficulty);
}
function formatTime(s){if(s<=0)return'--:--';const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function setStatus(html){document.getElementById('status').innerHTML=html}
function colorDot(c){return`<span class="color-dot" style="background:${c===1?'#222':'#eee'};border-color:${c===1?'#666':'#999'}"></span>`}
function addChat(text,cls){const d=document.createElement('div');d.className='msg '+(cls||'');d.textContent=text;const c=document.getElementById('chat-msgs');c.appendChild(d);c.scrollTop=c.scrollHeight}
function updatePlayersInfo(){
  document.getElementById('player-black').innerHTML=colorDot(1)+escapeHtml(playerNames[1]||'等待加入');
  document.getElementById('player-white').innerHTML=colorDot(2)+escapeHtml(playerNames[2]||'等待加入');
}
function updateTurnStatus(){
  if(turn===0||gameOver)return;
  const isMe=turn===myColor;
  const myName=playerNames[myColor]||'你';
  const sideName=gameType==='chess'?(myColor===1?'红方':'黑方'):(gameType==='intl_chess'?(myColor===1?'白方':'黑方'):(myColor===1?'黑棋':'白棋'));
  setStatus(`${isMe?myName+'，轮到你了':'等待对手落子...'} · ${colorDot(myColor)} ${sideName}`);
  document.getElementById('btn-pass').style.display=(gameType==='go'&&!gameOver)?'inline-block':'none';
}

// 主题切换
function toggleTheme(){
  const current=document.documentElement.getAttribute('data-theme');
  const next=current==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('gomoku_theme',next);
  if(board&&board.length&&typeof drawBoard==='function')drawBoard();
}

// 移动端菜单
function toggleMobileMenu(){
  const nav=document.getElementById('nav-links');
  const btn=document.querySelector('.hamburger-btn');
  if(nav) nav.classList.toggle('show');
  if(btn) btn.classList.toggle('active');
}
// 点击菜单项后关闭菜单
document.addEventListener('click',function(e){
  if(window.innerWidth>768) return;
  const nav=document.getElementById('nav-links');
  const hamburger=document.querySelector('.hamburger-btn');
  if(!nav||!hamburger) return;
  if(!nav.contains(e.target)&&!hamburger.contains(e.target)){
    nav.classList.remove('show');
    hamburger.classList.remove('active');
  }
});

// ==================== 音效系统（Web Audio 合成，无音频文件） ====================
let _audioCtx = null;
let soundEnabled = localStorage.getItem('gomoku_sound') !== '0';
function ensureAudio(){
  if(!_audioCtx){
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
// 首次用户手势时解锁 AudioContext（浏览器要求）
document.addEventListener('pointerdown', () => { if(soundEnabled) ensureAudio(); }, { passive: true });

function playTone(freq, dur, type, vol, when){
  if(!soundEnabled) return;
  const ctx = ensureAudio(); if(!ctx) return;
  const t = ctx.currentTime + (when || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol || 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.03);
}
// 落子（五子棋/围棋）：低沉短促"哒"
function playStoneSound(){ playTone(200, 0.06, 'triangle', 0.5); playTone(90, 0.1, 'sine', 0.3, 0.01); }
// 走棋（象棋/国际象棋）：清脆落盘
function playChessSound(){ playTone(520, 0.04, 'square', 0.1); playTone(260, 0.07, 'sine', 0.2, 0.02); }
// 吃子：双声
function playCaptureSound(){ playTone(340, 0.05, 'square', 0.15); playTone(500, 0.06, 'square', 0.15, 0.07); }
// 胜利：上行三连音
function playWinSound(){ playTone(523, 0.16, 'sine', 0.3); playTone(659, 0.16, 'sine', 0.3, 0.13); playTone(784, 0.3, 'sine', 0.3, 0.26); }
// 失败：下行三连音
function playLoseSound(){ playTone(392, 0.22, 'sine', 0.3); playTone(311, 0.22, 'sine', 0.3, 0.16); playTone(233, 0.35, 'sine', 0.3, 0.32); }
// 平局：双音
function playDrawSound(){ playTone(392, 0.2, 'sine', 0.28); playTone(440, 0.25, 'sine', 0.28, 0.2); }
// 提示音（轮到你了）
function playNotifSound(){ playTone(880, 0.12, 'sine', 0.3); playTone(1174, 0.15, 'sine', 0.3, 0.12); }
function toggleSound(){
  soundEnabled = !soundEnabled;
  localStorage.setItem('gomoku_sound', soundEnabled ? '1' : '0');
  updateSoundBtn();
  if(soundEnabled) playTone(880, 0.1, 'sine', 0.3); // 开启时响一声反馈
}
function updateSoundBtn(){
  const b = document.getElementById('btn-sound');
  if(b) b.textContent = soundEnabled ? '🔊' : '🔇';
}

// ==================== 轮到你了 · 通知 ====================
let _titleTimer = null;
const _origTitle = document.title;
function stopTitleFlash(){
  if(_titleTimer){ clearInterval(_titleTimer); _titleTimer = null; document.title = _origTitle; }
}
document.addEventListener('visibilitychange', () => { if(!document.hidden) stopTitleFlash(); });
window.addEventListener('focus', stopTitleFlash);

// 系统通知是否可用且未被关闭
function notifyEnabled(){
  return window.Notification && Notification.permission === 'granted' && localStorage.getItem('gomoku_notify') !== '0';
}
function updateNotifyBtn(){
  const b = document.getElementById('btn-notify');
  if(!b) return;
  b.textContent = notifyEnabled() ? '🔔' : '🔕';
}
// 手动开关（点击 = 用户手势，浏览器必定弹出授权框）
function toggleNotify(){
  if(!window.Notification){ alert('当前浏览器不支持系统通知'); return; }
  if(Notification.permission === 'denied'){
    alert('浏览器已拒绝通知权限。\n开启方法：点击地址栏左侧的锁图标 → 网站设置 → 通知 → 允许，然后刷新页面。');
    return;
  }
  if(Notification.permission === 'default'){
    // 未授权：请求授权（用户手势保证弹窗）
    Promise.resolve(Notification.requestPermission()).then(p => {
      if(p === 'granted'){
        localStorage.setItem('gomoku_notify', '1');
        updateNotifyBtn();
        try { new Notification('🔔 通知已开启', { body: '对手落子时将收到提醒', tag: 'notify-test' }); } catch(e){}
      } else if(p === 'denied'){
        alert('权限被拒绝。\n开启方法：点击地址栏左侧的锁图标 → 网站设置 → 通知 → 允许，然后刷新页面。');
      }
    }).catch(()=>{});
    return;
  }
  // 已授权 → 开关
  const wasOn = localStorage.getItem('gomoku_notify') !== '0';
  localStorage.setItem('gomoku_notify', wasOn ? '0' : '1');
  updateNotifyBtn();
  if(wasOn === false){ try { new Notification('🔔 通知已开启', { tag: 'notify-test' }); } catch(e){} }
}
function notifyMyTurn(){
  playNotifSound();
  // 系统通知（已授权且未关闭时）
  if(notifyEnabled()){
    try { new Notification('♟ 轮到你了！', { body: '对手已落子，轮到你走棋', tag: 'my-turn' }); } catch(e){}
  }
  // 标签页在后台 → 标题栏闪烁
  if(document.hidden && !_titleTimer){
    let on = false;
    _titleTimer = setInterval(() => {
      on = !on;
      document.title = on ? '🔴 轮到你了！' : _origTitle;
    }, 1000);
  }
}
// 进入对局时请求一次系统通知权限
function maybeAskNotification(){
  if(!window.Notification) { updateNotifyBtn(); return; }
  updateNotifyBtn();
  if(Notification.permission === 'default' && !localStorage.getItem('gomoku_notif_asked')){
    try {
      Promise.resolve(Notification.requestPermission()).then(p => {
        // 只有明确授权/拒绝才标记已询问；未弹出(default)下次再试
        if(p && p !== 'default') localStorage.setItem('gomoku_notif_asked', '1');
        if(p === 'granted') localStorage.setItem('gomoku_notify', '1');
        updateNotifyBtn();
      }).catch(()=>{});
    } catch(e){}
  }
}
