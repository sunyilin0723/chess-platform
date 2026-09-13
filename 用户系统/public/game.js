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

const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');

// 页面加载时确保聊天框为空，并初始化主题
document.addEventListener('DOMContentLoaded',()=>{
  const c=document.getElementById('chat-msgs');
  if(c) c.innerHTML='';
  // 初始化主题
  const savedTheme=localStorage.getItem('gomoku_theme')||'dark';
  document.documentElement.setAttribute('data-theme',savedTheme);
  // 初始化棋类选择滑块
  initGameSlider();
  // 默认选中五子棋，显示禁手选项
  selectGame('gomoku',document.querySelector('.game-slider-item.selected'));
});

function showView(name){
  // 从游戏房间返回大厅时清理状态
  if(name==='lobby'){
    backToLobbyCalled=true;
    if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
    if(ws){ ws.close(); ws=null; }
    const chatMsgs=document.getElementById('chat-msgs');
    if(chatMsgs) chatMsgs.innerHTML='';
    const chatInput=document.getElementById('chat-input');
    if(chatInput) chatInput.value='';
    board=[]; lastMove=null; gameOver=false; myColor=0; turn=0;
    playerNames={}; moveCount=0;
    window._chessSelected=null; window._intlChessSelected=null;
    isAI=false; aiColor=0;
  }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(name+'-view').classList.add('active');
  const nav=document.getElementById('navbar');
  if(name==='auth'){nav.classList.remove('show')}
  else{nav.classList.add('show');document.getElementById('nav-username').textContent=currentUser}
  if(name==='profile')loadProfile(currentUser);
  if(name==='leaderboard')loadLeaderboard();
}
function switchTab(t){
  document.getElementById('tab-login').className=t==='login'?'active':'';
  document.getElementById('tab-register').className=t==='register'?'active':'';
  document.getElementById('form-login').style.display=t==='login'?'block':'none';
  document.getElementById('form-register').style.display=t==='register'?'block':'none';
  document.getElementById('auth-error').textContent='';
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
  try{const d=await apiFetch('/api/register',{method:'POST',body:JSON.stringify({username,password})});
  if(d.error)return authError(d.error);
  token=d.token;currentUser=d.username;localStorage.setItem('gomoku_token',token);localStorage.setItem('gomoku_user',currentUser);
  document.getElementById('lobby-greeting').textContent='欢迎，'+currentUser;showView('lobby');
  document.getElementById('welcome-dialog').style.display='flex';
  }catch(e){authError(e.message)}
}
function closeWelcomeDialog(){document.getElementById('welcome-dialog').style.display='none'}
async function logout(){
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
async function checkLogin(){if(!token)return showView('auth');try{const d=await apiFetch('/api/me');currentUser=d.username||currentUser;localStorage.setItem('gomoku_user',currentUser);document.getElementById('lobby-greeting').textContent='欢迎，'+currentUser;loadNotifs();showView('lobby')}catch{showView('auth')}}
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
