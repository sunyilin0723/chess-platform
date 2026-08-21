// 获取主题颜色
function getThemeColor(varName){return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()}

function drawBoard(){
  if(gameType==='chess')drawChess();
  else if(gameType==='go')drawGo();
  else drawGomoku();
}
function drawGomoku(){
  const sz=boardSize;
  canvas.width=canvas.height=CELL*(sz-1)+PAD*2;
  const boardBg=getThemeColor('--board-bg');
  const boardLine=getThemeColor('--board-line');
  ctx.fillStyle=boardBg;ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<sz;i++){
    ctx.beginPath();ctx.moveTo(PAD,PAD+i*CELL);ctx.lineTo(PAD+(sz-1)*CELL,PAD+i*CELL);ctx.strokeStyle=boardLine;ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(PAD+i*CELL,PAD);ctx.lineTo(PAD+i*CELL,PAD+(sz-1)*CELL);ctx.stroke();
  }
  const stars=sz===15?[3,7,11]:sz===19?[3,9,15]:[2,6];
  for(const r of stars)for(const c of stars){ctx.beginPath();ctx.arc(PAD+c*CELL,PAD+r*CELL,3,0,Math.PI*2);ctx.fillStyle=boardLine;ctx.fill()}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++){
    if(board[r]&&board[r][c]!==0){
      const x=PAD+c*CELL,y=PAD+r*CELL;
      ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);
      const g=ctx.createRadialGradient(x-3,y-3,2,x,y,14);
      if(board[r][c]===1){g.addColorStop(0,'#555');g.addColorStop(1,'#111')}
      else{g.addColorStop(0,'#fff');g.addColorStop(1,'#bbb')}
      ctx.fillStyle=g;ctx.fill();
    }
  }
  if(lastMove){const x=PAD+lastMove[1]*CELL,y=PAD+lastMove[0]*CELL;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#f44';ctx.fill()}
}
function drawGo(){
  const sz=boardSize;
  const cellW=Math.min(CELL,Math.floor((canvas.width-PAD*2)/(sz-1))||CELL);
  canvas.width=canvas.height=cellW*(sz-1)+PAD*2;
  const boardBg=getThemeColor('--board-bg');
  const boardLine=getThemeColor('--board-line');
  ctx.fillStyle=boardBg;ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let i=0;i<sz;i++){
    ctx.beginPath();ctx.moveTo(PAD,PAD+i*cellW);ctx.lineTo(PAD+(sz-1)*cellW,PAD+i*cellW);ctx.strokeStyle=boardLine;ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(PAD+i*cellW,PAD);ctx.lineTo(PAD+i*cellW,PAD+(sz-1)*cellW);ctx.stroke();
  }
  const stars=sz===19?[3,9,15]:sz===13?[3,6,9]:[2,4,6];
  for(const r of stars)for(const c of stars){ctx.beginPath();ctx.arc(PAD+c*cellW,PAD+r*cellW,3,0,Math.PI*2);ctx.fillStyle=boardLine;ctx.fill()}
  const stoneR=cellW*0.43;
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++){
    if(board[r]&&board[r][c]!==0){
      const x=PAD+c*cellW,y=PAD+r*cellW;
      ctx.beginPath();ctx.arc(x,y,stoneR,0,Math.PI*2);
      const g=ctx.createRadialGradient(x-stoneR*0.2,y-stoneR*0.2,stoneR*0.1,x,y,stoneR);
      if(board[r][c]===1){g.addColorStop(0,'#444');g.addColorStop(1,'#000')}
      else{g.addColorStop(0,'#fff');g.addColorStop(1,'#ccc')}
      ctx.fillStyle=g;ctx.fill();
    }
  }
  if(lastMove){const x=PAD+lastMove[1]*cellW,y=PAD+lastMove[0]*cellW;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#f44';ctx.fill()}
}
function drawChess(){
  canvas.width=522;canvas.height=578;
  const cw=54,ch=54;
  const padX=33,padY=33;
  const ox=padX,oy=padY;
  const frameW=12;
  const boardLine=getThemeColor('--board-line');
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  ctx.fillStyle=isLight?'#5a3a1a':'#2a1800';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=isLight?'#6b4a2a':'#3a2510';ctx.fillRect(frameW/2,frameW/2,canvas.width-frameW,canvas.height-frameW);
  const bgGrad=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  if(isLight){
    bgGrad.addColorStop(0,'#f5e6c8');bgGrad.addColorStop(0.3,'#faf0d8');bgGrad.addColorStop(0.7,'#f5e6c8');bgGrad.addColorStop(1,'#edd8b8');
  }else{
    bgGrad.addColorStop(0,'#e8d5a8');bgGrad.addColorStop(0.3,'#f0e0b8');bgGrad.addColorStop(0.7,'#e8d5a8');bgGrad.addColorStop(1,'#dcc898');
  }
  ctx.fillStyle=bgGrad;ctx.fillRect(frameW,frameW,canvas.width-frameW*2,canvas.height-frameW*2);
  ctx.strokeStyle=boardLine;ctx.lineWidth=1;
  for(let r=0;r<10;r++){ctx.beginPath();ctx.moveTo(ox,oy+r*ch);ctx.lineTo(ox+8*cw,oy+r*ch);ctx.stroke()}
  for(let c=0;c<9;c++){
    if(c===0||c===8){ctx.beginPath();ctx.moveTo(ox+c*cw,oy);ctx.lineTo(ox+c*cw,oy+9*ch);ctx.stroke()}
    else{ctx.beginPath();ctx.moveTo(ox+c*cw,oy);ctx.lineTo(ox+c*cw,oy+4*ch);ctx.stroke();
    ctx.beginPath();ctx.moveTo(ox+c*cw,oy+5*ch);ctx.lineTo(ox+c*cw,oy+9*ch);ctx.stroke()}
  }
  ctx.beginPath();ctx.moveTo(ox,oy+4*ch);ctx.lineTo(ox+8*cw,oy+5*ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox+8*cw,oy+4*ch);ctx.lineTo(ox,oy+5*ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox+3*cw,oy);ctx.lineTo(ox+5*cw,oy+2*ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox+5*cw,oy);ctx.lineTo(ox+3*cw,oy+2*ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox+3*cw,oy+7*ch);ctx.lineTo(ox+5*cw,oy+9*ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ox+5*cw,oy+7*ch);ctx.lineTo(ox+3*cw,oy+9*ch);ctx.stroke();
  function drawMark(cr,cc,dr,dc){
    const m=6,l=8;
    const x=ox+cc*cw,y=oy+cr*ch;
    if(cc>0){
      ctx.beginPath();ctx.moveTo(x-m,y-m);ctx.lineTo(x-m,y-m-l);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-m,y-m);ctx.lineTo(x-m-l,y-m);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-m,y+m);ctx.lineTo(x-m,y+m+l);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-m,y+m);ctx.lineTo(x-m-l,y+m);ctx.stroke();
    }
    if(cc<8){
      ctx.beginPath();ctx.moveTo(x+m,y-m);ctx.lineTo(x+m,y-m-l);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+m,y-m);ctx.lineTo(x+m+l,y-m);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+m,y+m);ctx.lineTo(x+m,y+m+l);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x+m,y+m);ctx.lineTo(x+m+l,y+m);ctx.stroke();
    }
  }
  const marks=[[2,1],[2,7],[7,1],[7,7],[3,0],[3,2],[3,4],[3,6],[3,8],[6,0],[6,2],[6,4],[6,6],[6,8]];
  marks.forEach(([r,c])=>drawMark(r,c));
  ctx.font=`bold 22px "KaiTi","STKaiti","SimKai","FangSong",serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=boardLine;
  ctx.fillText('楚  河',ox+2*cw,oy+4.5*ch);
  ctx.fillText('漢  界',ox+6*cw,oy+4.5*ch);
  const pieceChars={K:'將',A:'士',B:'象',N:'馬',R:'車',C:'砲',P:'卒',k:'帥',a:'仕',b:'相',n:'馬',r:'車',c:'炮',p:'兵'};
  function drawPiece(x,y,piece){
    const isRed=piece===piece.toLowerCase();
    const radius=cw*0.46;
    ctx.save();
    ctx.beginPath();ctx.arc(x+2,y+3,radius,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.18)';ctx.fill();
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);
    const pg=ctx.createRadialGradient(x-radius*0.2,y-radius*0.3,radius*0.1,x+radius*0.1,y+radius*0.1,radius);
    pg.addColorStop(0,'#f5ead0');pg.addColorStop(0.4,'#ecdcb8');pg.addColorStop(0.8,'#d8c8a0');pg.addColorStop(1,'#c0a878');
    ctx.fillStyle=pg;ctx.fill();
    ctx.strokeStyle='#8b7050';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,radius-4,0,Math.PI*2);
    ctx.strokeStyle=isRed?'#c83830':'#3a5a30';ctx.lineWidth=1.8;ctx.stroke();
    ctx.fillStyle=isRed?'#c83830':'#2a3a28';
    ctx.font=`bold ${Math.floor(cw*0.42)}px "KaiTi","STKaiti","SimKai","FangSong",serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(pieceChars[piece]||piece,x,y+1);
    ctx.restore();
  }
  for(let r=0;r<10;r++)for(let c=0;c<9;c++){
    const p=board[r]&&board[r][c];if(!p)continue;
    drawPiece(ox+c*cw,oy+r*ch,p);
  }
  if(lastMove){
    const x=ox+lastMove[1]*cw,y=oy+lastMove[0]*ch;
    ctx.strokeStyle='rgba(220,60,30,0.85)';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(x,y,cw*0.42,0,Math.PI*2);ctx.stroke();
  }
  function chessClickHandler(e){
    if(gameOver||myColor!==turn||gameType!=='chess')return;
    const rect=canvas.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
    const my=(e.clientY-rect.top)*(canvas.height/rect.height);
    const c=Math.round((mx-ox)/cw),r=Math.round((my-oy)/ch);
    if(r<0||r>=10||c<0||c>=9)return;
    if(!window._chessSelected){
      const p=board[r]&&board[r][c];if(!p)return;
      const pc=p===p.toUpperCase()?2:1;if(pc!==myColor)return;
      window._chessSelected=[r,c];drawBoard();
      const x2=ox+c*cw,y2=oy+r*ch;
      ctx.strokeStyle='#5c9ded';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(x2,y2,cw*0.48,0,Math.PI*2);ctx.stroke();
    } else {
      const [fr,fc]=window._chessSelected;window._chessSelected=null;
      if(fr===r&&fc===c){drawBoard();return}
      ws.send(JSON.stringify({type:'move',fr,fc,tr:r,tc:c}));
    }
  }
  canvas.removeEventListener('click',window._chessClickBound);
  window._chessClickBound=chessClickHandler;
  canvas.addEventListener('click',chessClickHandler);
}
canvas.addEventListener('click',e=>{
  if(gameOver||myColor!==turn||gameType==='chess')return;
  const rect=canvas.getBoundingClientRect();
  const mx=(e.clientX-rect.left)*(canvas.width/rect.width);
  const my=(e.clientY-rect.top)*(canvas.height/rect.height);
  if(gameType==='go'){
    const sz=boardSize;
    const cellW=parseFloat(canvas.width-PAD*2)/(sz-1);
    const c=Math.round((mx-PAD)/cellW),r=Math.round((my-PAD)/cellW);
    if(r<0||r>=sz||c<0||c>=sz)return;
    if(board[r]&&board[r][c]!==0)return;
    ws.send(JSON.stringify({type:'move',r,c}));
  } else {
    const sz=boardSize;
    const c=Math.round((mx-PAD)/CELL),r=Math.round((my-PAD)/CELL);
    if(r<0||r>=sz||c<0||c>=sz)return;
    if(board[r]&&board[r][c]!==0)return;
    ws.send(JSON.stringify({type:'move',r,c}));
  }
});
canvas.addEventListener('mousemove',e=>{
  if(gameOver||myColor!==turn||gameType==='chess'){canvas.style.cursor='not-allowed';return}
  canvas.style.cursor='pointer';
});

function setupNotifs(){
  let notifOpen=false;
  window.toggleNotifPanel=function(){
    notifOpen=!notifOpen;
    document.getElementById('notif-panel').style.display=notifOpen?'block':'none';
    if(notifOpen)loadNotifs();
  };
  window.markAllRead=function(){apiFetch('/api/notifs/read',{method:'POST',body:JSON.stringify({})});loadNotifs()};
  window.loadNotifs=function(){
    apiFetch('/api/notifs').then(data=>{
      const badge=document.getElementById('notif-badge');
      if(data.unread>0){badge.style.display='block';badge.textContent=data.unread}
      else{badge.style.display='none'}
      const el=document.getElementById('notif-list');
      if(!data.notifs.length){el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">暂无消息</div>';return}
      el.innerHTML=data.notifs.map(n=>`<div class="notif-item" style="${n.read?'opacity:0.6':''}">
        <div style="font-size:13px;font-weight:bold;margin-bottom:3px">${n.title}</div>
        <div class="notif-content">${escapeHtml(n.content)}</div>
        <div class="notif-time">${new Date(n.time).toLocaleString('zh-CN')}</div>
      </div>`).join('');
    });
  };
  window.onNewNotif=function(){const b=document.getElementById('notif-badge');const c=parseInt(b.textContent)||0;b.style.display='block';b.textContent=c+1};
}
setupNotifs();

// ==================== 私信系统 ====================
let dmOpen=false, dmConvOpen=false, currentDmUser='';
window.toggleDmPanel=function(){
  dmOpen=!dmOpen;
  document.getElementById('dm-panel').style.display=dmOpen?'block':'none';
  if(dmOpen)loadDmInbox();
};
window.loadDmInbox=function(){
  apiFetch('/api/dm/inbox').then(data=>{
    const badge=document.getElementById('dm-badge');
    const totalUnread=data.conversations.reduce((s,c)=>s+c.unread,0);
    if(totalUnread>0){badge.style.display='block';badge.textContent=totalUnread}
    else{badge.style.display='none'}
    const el=document.getElementById('dm-list');
    if(!data.conversations.length){el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">暂无私信</div>';return}
    el.innerHTML=data.conversations.map(c=>{
      const time=new Date(c.lastTime).toLocaleString('zh-CN');
      const unreadBadge=c.unread>0?`<span class="notif-unread">${c.unread}</span>`:'';
      return `<div onclick="openDmConversation('${c.username}')" class="notif-item" style="display:flex;justify-content:space-between;align-items:center">
        <div style="overflow:hidden">
          <div style="font-size:13px;font-weight:bold;margin-bottom:3px">${escapeHtml(c.username)}${unreadBadge}</div>
          <div class="dm-preview">${c.lastContent}</div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;margin-left:8px">${time}</div>
      </div>`;
    }).join('');
  }).catch(()=>{});
};
window.openDmConversation=function(username){
  currentDmUser=username;
  dmConvOpen=true;
  document.getElementById('dm-conversation-dialog').style.display='flex';
  document.getElementById('dm-conv-title').textContent='与 '+username+' 的对话';
  loadDmMessages(username);
  // 标记已读
  apiFetch('/api/dm/read',{method:'POST',body:JSON.stringify({with:username})}).then(()=>loadDmInbox()).catch(()=>{});
};
window.loadDmMessages=function(username){
  apiFetch('/api/dm/conversation/'+encodeURIComponent(username)).then(data=>{
    const el=document.getElementById('dm-conv-messages');
    if(!data.messages.length){el.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:20px">暂无消息</div>';return}
    el.innerHTML=data.messages.map(m=>{
      const isMe=m.from===currentUser;
      const time=new Date(m.time).toLocaleString('zh-CN');
      return `<div style="margin-bottom:10px;text-align:${isMe?'right':'left'}">
        <div class="${isMe?'dm-bubble-me':'dm-bubble-them'}">${escapeHtml(m.content)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${time}</div>
      </div>`;
    }).join('');
    el.scrollTop=el.scrollHeight;
  }).catch(()=>{});
};
window.sendDmMsg=function(){
  const input=document.getElementById('dm-conv-input');
  const content=input.value.trim();
  if(!content||!currentDmUser)return;
  apiFetch('/api/dm/send',{method:'POST',body:JSON.stringify({to:currentDmUser,content})}).then(()=>{
    input.value='';
    loadDmMessages(currentDmUser);
  }).catch(e=>alert(e.message));
};
window.closeDmConversation=function(){
  dmConvOpen=false;currentDmUser='';
  document.getElementById('dm-conversation-dialog').style.display='none';
};
window.openNewDmDialog=function(){
  document.getElementById('new-dm-dialog').style.display='flex';
  document.getElementById('new-dm-to').value='';
  document.getElementById('new-dm-content').value='';
};
window.closeNewDmDialog=function(){
  document.getElementById('new-dm-dialog').style.display='none';
};
window.submitNewDm=function(){
  const to=document.getElementById('new-dm-to').value.trim();
  const content=document.getElementById('new-dm-content').value.trim();
  if(!to||!content){alert('请填写收件人和内容');return}
  apiFetch('/api/dm/send',{method:'POST',body:JSON.stringify({to,content})}).then(()=>{
    closeNewDmDialog();
    if(dmOpen)loadDmInbox();
    if(dmConvOpen&&currentDmUser===to)loadDmMessages(to);
  }).catch(e=>alert(e.message));
};
window.onNewDm=function(from){
  const b=document.getElementById('dm-badge');
  const c=parseInt(b.textContent)||0;
  b.style.display='block';b.textContent=c+1;
  if(dmOpen)loadDmInbox();
  if(dmConvOpen&&currentDmUser===from){
    loadDmMessages(from);
    apiFetch('/api/dm/read',{method:'POST',body:JSON.stringify({with:from})}).catch(()=>{});
  }
};

// 定期检查未读私信数
setInterval(()=>{
  if(token)apiFetch('/api/dm/unread').then(d=>{
    const b=document.getElementById('dm-badge');
    if(d.count>0){b.style.display='block';b.textContent=d.count}
    else{b.style.display='none'}
  }).catch(()=>{});
},30000);

function selectReportType(btn){document.querySelectorAll('#report-type-btns button').forEach(b=>{b.classList.remove('selected');b.style.borderColor='#333';b.style.color='#ccc'});btn.classList.add('selected');btn.style.borderColor='#e74c3c';btn.style.color='#fff'}
const reportTypeNames={boost:'刷胜率/放水',cheat:'使用外挂',abuse:'恶意行为',other:'其他'};
function showReportDialog(){
  const opp=playerNames[myColor===1?2:1];if(!opp)return;
  reportScreenshot='';document.getElementById('screenshot-preview').innerHTML='';document.getElementById('report-detail').value='';
  document.querySelectorAll('#report-type-btns button').forEach(b=>{b.classList.remove('selected');b.style.borderColor='#333';b.style.color='#ccc'});
  document.getElementById('report-dialog').classList.add('show');
  document.getElementById('report-target-name').textContent='举报：'+opp;
}
function closeReportDialog(){document.getElementById('report-dialog').classList.remove('show')}
function captureBoard(){reportScreenshot=canvas.toDataURL('image/png');document.getElementById('screenshot-preview').innerHTML=`<img src="${reportScreenshot}" style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #333">`}
function previewScreenshot(input){if(input.files&&input.files[0]){const r=new FileReader();r.onload=e=>{reportScreenshot=e.target.result;document.getElementById('screenshot-preview').innerHTML=`<img src="${reportScreenshot}" style="max-width:100%;max-height:200px;border-radius:6px;border:1px solid #333">`};r.readAsDataURL(input.files[0])}}
async function submitReport(){
  const target=playerNames[myColor===1?2:1];if(!target)return;
  const rt=document.querySelector('#report-type-btns button.selected');
  if(!rt){alert('请选择举报类型');return}
  if(!reportScreenshot){alert('请上传截图');return}
  const detail=document.getElementById('report-detail').value.trim();
  try{await apiFetch('/api/report',{method:'POST',body:JSON.stringify({target,reason:detail||rt.dataset.type,reasonType:rt.dataset.type,screenshot:reportScreenshot})});alert('举报已提交');closeReportDialog()}catch(e){alert(e.message)}
}
function loadProfile(username){
  const el=document.getElementById('profile-content');
  apiFetch('/api/profile/'+encodeURIComponent(username)).then(u=>{
    const isMe=username===currentUser;
    el.innerHTML=`<div class="profile-header"><div class="avatar">${escapeHtml(u.username[0].toUpperCase())}</div><div><div class="profile-name">${escapeHtml(u.username)}</div><div class="profile-date">注册于 ${new Date(u.createdAt).toLocaleDateString('zh-CN')}</div></div></div>
    <div class="stat-grid"><div class="stat-box stat-wins"><div class="stat-val">${u.wins}</div><div class="stat-label">胜</div></div><div class="stat-box stat-losses"><div class="stat-val">${u.losses}</div><div class="stat-label">负</div></div><div class="stat-box"><div class="stat-val">${u.games}</div><div class="stat-label">总场</div></div><div class="stat-box stat-rate"><div class="stat-val">${u.winRate}%</div><div class="stat-label">胜率</div></div></div>
    ${u.reportCount>0?`<div class="profile-warn">⚠ 该用户被举报 ${u.reportCount} 次</div>`:''}
    ${!isMe?`<button onclick="openDmConversation('${u.username}')" class="profile-btn-dm">📩 发送私信</button>`:''}
    ${isMe?`
    <div class="profile-section">
      <div style="margin-bottom:14px">
        <label class="profile-label">修改用户名</label>
        <input type="text" id="new-username" placeholder="新用户名" maxlength="10" class="profile-input">
        <input type="password" id="username-pw" placeholder="输入密码确认" class="profile-input">
        <button onclick="changeUsername()" class="profile-btn-primary">修改用户名</button>
      </div>
      <div style="margin-bottom:16px">
        <label class="profile-label">修改密码</label>
        <input type="password" id="old-pw" placeholder="原密码" class="profile-input">
        <input type="password" id="new-pw" placeholder="新密码" class="profile-input">
        <input type="password" id="new-pw2" placeholder="确认新密码" class="profile-input">
        <button onclick="changePassword()" class="profile-btn-primary">修改密码</button>
      </div>
      <div id="settings-msg" style="text-align:center;font-size:13px;min-height:18px;margin-bottom:8px"></div>
      ${(u.banned||u.reportCount>=0)?`
      <div class="profile-info-box">
        <div id="my-reports-list"></div>
        <div id="appeal-history"></div>
        <div id="appeal-msg" style="text-align:center;font-size:12px;min-height:16px;margin-top:6px"></div>
      </div>`:''}
      <button onclick="loadMyReports()" class="profile-btn-secondary">我的举报</button>
      <button onclick="deleteAccount()" class="profile-btn-danger">注销账号</button>
    </div>`:''}`;
    if(isMe&&document.getElementById('appeal-history'))loadAppealHistory();
  }).catch(()=>{el.innerHTML='<p style="text-align:center;color:var(--text-muted)">加载失败</p>'});
}
function settingsMsg(text,ok){const el=document.getElementById('settings-msg');if(!el)return;el.textContent=text;el.style.color=ok?'#2ecc71':'#e74c3c'}
async function changeUsername(){
  const nw=document.getElementById('new-username').value.trim();
  const pw=document.getElementById('username-pw').value;
  if(!nw||!pw)return settingsMsg('请输入新用户名和密码',false);
  try{const r=await apiFetch('/api/change-username',{method:'POST',body:JSON.stringify({newUsername:nw,password:pw})});
  if(r.error)return settingsMsg(r.error,false);
  currentUser=r.username;localStorage.setItem('gomoku_user',currentUser);
  document.getElementById('nav-username').textContent=currentUser;
  settingsMsg('用户名修改成功',true);loadProfile(currentUser);
  }catch(e){settingsMsg(e.message,false)}
}
async function changePassword(){
  const op=document.getElementById('old-pw').value;
  const np=document.getElementById('new-pw').value;
  const np2=document.getElementById('new-pw2').value;
  if(!op||!np||!np2)return settingsMsg('请输入所有字段',false);
  if(np!==np2)return settingsMsg('两次输入的新密码不一致',false);
  try{const r=await apiFetch('/api/change-password',{method:'POST',body:JSON.stringify({oldPassword:op,newPassword:np})});
  if(r.error)return settingsMsg(r.error,false);
  settingsMsg('密码修改成功',true);
  document.getElementById('old-pw').value='';document.getElementById('new-pw').value='';document.getElementById('new-pw2').value='';
  }catch(e){settingsMsg(e.message,false)}
}
async function deleteAccount(){
  if(!confirm('确定要注销账号吗？此操作不可撤销'))return;
  const pw=prompt('请输入密码确认注销：');if(!pw)return;
  try{const r=await apiFetch('/api/delete-account',{method:'POST',body:JSON.stringify({password:pw})});
  if(r.error)return alert(r.error);
  alert('账号已注销');token='';currentUser='';localStorage.removeItem('gomoku_token');localStorage.removeItem('gomoku_user');showView('auth');
  }catch(e){alert(e.message)}
}
async function loadMyReports(){
  const el=document.getElementById('my-reports-list');
  if(!el)return;
  try{
    const data=await apiFetch('/api/profile/'+encodeURIComponent(currentUser));
    const reports=data.reports||[];
    const appeals=await apiFetch('/api/appeal/mine');
    const appealedIds=new Set(appeals.map(a=>a.reportId));
    if(!reports.length){el.innerHTML='<div style="text-align:center;padding:10px;color:var(--text-muted)">暂无举报记录</div>';return}
    let html='<div class="dm-section-title">针对您的举报</div>';
    reports.forEach(r=>{
      const t=new Date(r.time).toLocaleString('zh-CN');
      const st={pending:'待审核',approved:'确认违规',rejected:'已驳回',cancelled:'已撤回'}[r.status]||r.status;
      const sc={pending:'var(--accent-yellow)',approved:'var(--accent-red)',rejected:'var(--text-muted)',cancelled:'var(--text-muted)'}[r.status]||'var(--text-muted)';
      const appealed=appealedIds.has(r.id);
      html+=`<div style="padding:8px 12px;background:var(--bg-input);border-radius:6px;margin-bottom:6px;font-size:13px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="color:${sc}">[${st}]</span>
          <span style="color:var(--text-muted);font-size:11px">${t}</span>
        </div>
        <div class="appeal-reason">${r.reasonType==='boost'?'刷胜率/放水':r.reasonType==='cheat'?'使用外挂':r.reasonType==='abuse'?'恶意行为':'其他'} ${r.adminMark?'(管理员标记)':''}</div>
        ${r.status==='approved'&&!appealed?`<button onclick="appealReport('${r.id}')" style="padding:3px 10px;font-size:12px;border:1px solid var(--accent-blue);border-radius:4px;background:transparent;color:var(--accent-blue);cursor:pointer">申诉</button>`:''}
        ${appealed?`<span style="color:var(--text-muted);font-size:11px">已申诉</span>`:''}
      </div>`;
    });
    el.innerHTML=html;
  }catch{el.innerHTML='<p style="color:var(--text-muted)">加载失败</p>'}
}
async function appealReport(reportId){
  const reason=prompt('请填写申诉理由：');
  if(!reason)return;
  try{await apiFetch('/api/appeal',{method:'POST',body:JSON.stringify({reportId,reason})});alert('申诉已提交');loadMyReports()}catch(e){alert(e.message)}
}
async function cancelReport(id){try{await apiFetch('/api/report/cancel',{method:'POST',body:JSON.stringify({reportId:id})});loadMyReports()}catch(e){alert(e.message)}}
async function submitAppeal(){
  const reason=document.getElementById('appeal-reason').value.trim();
  if(!reason){document.getElementById('appeal-msg').textContent='请填写申诉理由';document.getElementById('appeal-msg').style.color='#e74c3c';return}
  try{const r=await apiFetch('/api/appeal',{method:'POST',body:JSON.stringify({reason})});
  if(r.error){document.getElementById('appeal-msg').textContent=r.error;document.getElementById('appeal-msg').style.color='#e74c3c';return}
  document.getElementById('appeal-msg').textContent='申诉已提交，等待管理员审核';document.getElementById('appeal-msg').style.color='#2ecc71';
  document.getElementById('appeal-reason').value='';
  }catch(e){document.getElementById('appeal-msg').textContent=e.message;document.getElementById('appeal-msg').style.color='#e74c3c'}
}
async function loadAppealHistory(){
  const el=document.getElementById('appeal-history');if(!el)return;
  try{const list=await apiFetch('/api/appeal/mine');
  if(!list.length){el.innerHTML='';return}
  const st={pending:'审核中',approved:'申诉成功（已解封）',rejected:'申诉被驳回（封号+3天）'};
  const sc={pending:'#f0c040',approved:'#2ecc71',rejected:'#e74c3c'};
  el.innerHTML=list.map(a=>`<div style="padding:6px 10px;background:#16213e;border-radius:4px;margin-bottom:6px;font-size:12px">
    <span style="color:${sc[a.status]||'#888'}">[${st[a.status]||a.status}]</span>
    ${escapeHtml(a.reason.substring(0,40))}${a.reason.length>40?'...':''}
    <span style="float:right;color:#666">${new Date(a.time).toLocaleDateString('zh-CN')}</span>
  </div>`).join('')}catch{}}
if(document.getElementById('appeal-history'))loadAppealHistory();
function loadLeaderboard(){
  const el=document.getElementById('lb-content');
  apiFetch('/api/leaderboard').then(list=>{
    if(!list.length){el.innerHTML='<div class="lb-empty">暂无数据</div>';return}
    let html='<table><thead><tr><th>排名</th><th>用户名</th><th>胜</th><th>负</th><th>总场</th><th>胜率</th></tr></thead><tbody>';
    list.forEach((u,i)=>{const rank=i<3?['🥇','🥈','🥉'][i]:(i+1);html+=`<tr><td class="lb-rank">${rank}</td><td>${escapeHtml(u.username)}</td><td class="lb-wins">${u.wins}</td><td>${u.losses}</td><td>${u.games}</td><td class="lb-rate">${u.winRate}%</td></tr>`});
    html+='</tbody></table>';el.innerHTML=html;
  }).catch(()=>{el.innerHTML='<div class="lb-empty">加载失败</div>'});
}
checkLogin();
drawBoard();
