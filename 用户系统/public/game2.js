let reconnectAttempts = 0;
let reconnectTimer = null;
let connectOptions = {};
let backToLobbyCalled = false;
let isSpectator = false;
let joinDialogOpen = false;

function connect(roomId,mode,difficulty){
  document.getElementById('chat-msgs').innerHTML='';
  connectOptions = {roomId, mode, difficulty, forbidden: selectedForbidden, spectator: false};
  reconnectAttempts = 0;
  backToLobbyCalled = false;
  isSpectator = false;
  doConnect(roomId, mode, difficulty, selectedForbidden);
}

function doConnect(roomId, mode, difficulty, forbidden){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{
    reconnectAttempts = 0;
    const autoMode=connectOptions.spectator?'spectate':(connectOptions.reconnectWasPlayer?'play':null);
    ws.send(JSON.stringify({type:'join',room:selectedGame+'_'+roomId,name:currentUser,token,gameType:selectedGame,timerSeconds:selectedTimer,mode:mode||'pvp',difficulty:difficulty||'easy',forbidden:forbidden||false,autoMode}));
  };
  ws.onmessage=(e)=>{
    const msg=JSON.parse(e.data);
    // 服务器心跳ping，回复pong
    if(msg.type==='ping'){
      ws.send(JSON.stringify({type:'pong'}));
      return;
    }
    // 服务器询问：对局还是观战
    if(msg.type==='join_ask'){
      // 人机对战模式：不弹窗，自动选择对局
      if(selectedMode==='pve'){
        if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'join_confirm',action:'play'}));
        return;
      }
      const info=document.getElementById('join-choice-info');
      const playBtn=document.getElementById('join-play-btn');
      if(msg.isNewRoom){
        info.textContent='新房间，当前无人';
      } else if(msg.occupied===0){
        info.textContent='房间暂无玩家';
      } else if(msg.occupied===1){
        info.textContent='房间已有1名玩家，等待对手';
      }
      playBtn.style.display='';
      joinDialogOpen=true;
      document.getElementById('join-choice-dialog').style.display='flex';
      return;
    }
    if(msg.type==='joined'){
      document.getElementById('join-choice-dialog').style.display='none';
      joinDialogOpen=false;
      // 观战模式
      if(msg.spectator){
        isSpectator=true;
        connectOptions.spectator=true;
        connectOptions.reconnectWasPlayer=false;
        myColor=0;playerNames=msg.names||{};gameType=msg.gameType;boardSize=msg.size||15;timerSeconds=msg.timerSeconds||0;
        isAI=false;aiColor=0;
        timeLeft=[timerSeconds,timerSeconds];
        board=msg.board||[];
        turn=msg.turn||0;
        gameOver=msg.gameOver||false;
        lastMove=null;
        showView('game');
        const displayRoom=msg.room.replace(/^[a-z]+_/,'');
        document.getElementById('room-id').textContent='房间: '+displayRoom+' (观战中)';
        document.getElementById('chat-msgs').innerHTML='';
        // 隐藏对局按钮
        document.getElementById('btn-draw').style.display='none';
        document.getElementById('btn-undo').style.display='none';
        document.getElementById('btn-report').style.display='none';
        document.getElementById('btn-resign').style.display='none';
        document.getElementById('btn-pass').style.display='none';
        document.getElementById('btn-restart').style.display='none';
        updatePlayersInfo();
        drawBoard();
        if(msg.started&&!gameOver){
          updateSpectatorTurnStatus();
        } else if(gameOver){
          setStatus('观战中 · 对局已结束');
        } else {
          setStatus('观战中 · 等待对局开始...');
        }
        return;
      }
      // 对局模式
      isSpectator=false;
      connectOptions.spectator=false;
      connectOptions.reconnectWasPlayer=true;
      myColor=msg.color;playerNames=msg.names||{};gameType=msg.gameType;boardSize=msg.size||15;timerSeconds=msg.timerSeconds||0;
      isAI=msg.mode==='pve';aiColor=isAI?(myColor===1?2:1):0;
      timeLeft=[timerSeconds,timerSeconds];
      board=msg.board||[];
      showView('game');
      const displayRoom=msg.room.replace(/^[a-z]+_/,'');
      document.getElementById('room-id').textContent='房间: '+displayRoom+(isAI?' (人机对战)':'');
      gameOver=false;turn=0;lastMove=null;
      document.getElementById('chat-msgs').innerHTML='';
      // 恢复对局按钮
      document.getElementById('btn-resign').style.display='';
      document.getElementById('btn-restart').style.display='';
      if(isAI){
        document.getElementById('btn-draw').style.display='none';
        document.getElementById('btn-undo').style.display='none';
        document.getElementById('btn-report').style.display='none';
      } else {
        document.getElementById('btn-draw').style.display='';
        document.getElementById('btn-undo').style.display='';
        document.getElementById('btn-report').style.display='';
      }
      updatePlayersInfo();drawBoard();setStatus(isAI?'等待AI加入...':'等待对手加入...');
    }
    if(msg.type==='error'){addChat('⚠ '+msg.msg,'msg-alert')}
    if(msg.type==='names'){playerNames=msg.names;updatePlayersInfo()}
    if(msg.type==='start'){
      turn=msg.turn;
      // 关闭先手选择弹窗
      document.getElementById('choose-first').classList.remove('show');
      if(isSpectator){updateSpectatorTurnStatus();addChat('对局开始！','msg-sys')}
      else{updateTurnStatus();addChat('对局开始！','msg-sys')}
    }
    if(msg.type==='choose_first'&&!isSpectator){
      // 对局已开始或已在选择中则不重复弹出
      if(turn!==0||gameOver)return;
      document.getElementById('choose-first').classList.add('show');
      setStatus('请选择先手');
    }
    if(msg.type==='waiting_choice'){
      if(isSpectator){setStatus('观战中 · 对手正在选择先手...')}
      else if(selectedMode!=='pve'){setStatus('对手正在选择先手...')}
    }
    if(msg.type==='color_swapped'&&!isSpectator){myColor=msg.color}
    if(msg.type==='timer'){
      timeLeft=msg.timeLeft;
      document.getElementById('timer-p1').textContent=formatTime(timeLeft[0]);
      document.getElementById('timer-p2').textContent=formatTime(timeLeft[1]);
      document.getElementById('timer-p1').className='timer-box'+(turn===1?' active':'');
      document.getElementById('timer-p2').className='timer-box'+(turn===2?' active':'');
    }
    if(msg.type==='move'){
      if(gameType==='chess'||gameType==='intl_chess'){
        if(msg.board)board=msg.board;
        else {board[msg.tr][msg.tc]=board[msg.fr][msg.fc];board[msg.fr][msg.fc]='';}
      } else {
        if(msg.board)board=msg.board;
        else board[msg.r][msg.c]=msg.color;
      }
      lastMove=msg.lastMove;turn=msg.turn;
      drawBoard();
      if(isSpectator){
        if(msg.win!==undefined&&msg.win!==0){
          gameOver=true;
          const winnerName=msg.win===1?playerNames[1]||'黑方':playerNames[2]||'白方';
          setStatus('🏆 '+winnerName+' 获胜！');
          addChat(winnerName+' 获胜！','msg-sys');
        } else {updateSpectatorTurnStatus()}
      } else {
        if(msg.win!==undefined&&msg.win!==0){
          gameOver=true;
          const wm=msg.win===myColor?'🎉 你赢了！':'😢 你输了';
          setStatus(wm);addChat(wm,'msg-sys');
        } else {updateTurnStatus()}
      }
    }
    if(msg.type==='pass'){
      turn=msg.turn;
      if(msg.board)board=msg.board;
      drawBoard();
      const who=msg.color===myColor?'你':(playerNames[msg.color]||'对方');
      addChat(who+' Pass了','msg-sys');
      if(isSpectator)updateSpectatorTurnStatus();
      else updateTurnStatus();
    }
    if(msg.type==='game_over'){
      gameOver=true;
      if(isSpectator){
        if(msg.winner===0){
          setStatus('🤝 '+msg.reason);addChat(msg.reason,'msg-sys');
        } else {
          const winnerName=msg.winnerName||playerNames[msg.winner]||'';
          setStatus('🏆 '+winnerName+' 获胜 ('+msg.reason+')');addChat(winnerName+' 获胜 ('+msg.reason+')','msg-sys');
        }
      } else {
        if(msg.winner===0){
          setStatus('🤝 '+msg.reason);addChat(msg.reason,'msg-sys');
        } else {
          const wm=msg.winner===myColor?'🎉 你赢了！':'😢 你输了';
          setStatus(wm+' ('+msg.reason+')');addChat(wm+' ('+msg.reason+')','msg-sys');
        }
      }
      drawBoard();
    }
    if(msg.type==='undo_approved'){
      board=msg.board||board;turn=msg.turn;moveCount=msg.moveCount;lastMove=null;
      gameOver=false;drawBoard();
      if(isSpectator)updateSpectatorTurnStatus();
      else updateTurnStatus();
      addChat('悔棋成功','msg-sys');
    }
    if(msg.type==='undo_rejected'&&!isSpectator){addChat('对手拒绝了悔棋请求','msg-sys')}
    if(msg.type==='draw_rejected'&&!isSpectator){addChat('对手拒绝了求和请求','msg-sys')}
    if(msg.type==='restart'){
      board=msg.board||board;gameOver=false;turn=0;lastMove=null;moveCount=0;
      document.getElementById('chat-msgs').innerHTML='';
      document.getElementById('choose-first').classList.remove('show');
      drawBoard();
      if(isSpectator){setStatus('观战中 · 等待对局开始...')}
      else{setStatus('等待对手加入...')}
      addChat('新一局开始！','msg-sys');
    }
    if(msg.type==='undo_request'&&!isSpectator){
      document.getElementById('undo-msg').textContent=msg.fromName+' 请求悔棋';
      document.getElementById('undo-dialog').classList.add('show');
    }
    if(msg.type==='draw_request'&&!isSpectator){
      document.getElementById('draw-msg').textContent=msg.fromName+' 请求和棋';
      document.getElementById('draw-dialog').classList.add('show');
    }
    if(msg.type==='opponent_left'){
      if(isSpectator){setStatus('观战中 · 对手已离开');addChat('对手已离开房间','msg-sys');gameOver=true}
      else{setStatus('对手已离开');addChat('对手已离开房间','msg-sys');gameOver=true}
    }
    if(msg.type==='player_left'){
      const leftName=msg.color===1?playerNames[1]:playerNames[2];
      // 从本地 playerNames 中移除
      if(msg.color) delete playerNames[msg.color];
      updatePlayersInfo();
      if(isSpectator){
        addChat((leftName||'玩家')+' 已退出房间','msg-sys');
      } else if(msg.color!==myColor){
        addChat('对手已退出房间','msg-sys');
        if(!gameOver){
          setStatus('对手已退出，等待新对手加入...');
          gameOver=true;
        }
      }
    }
    if(msg.type==='system_alert'){addChat(msg.text,'msg-alert');if(msg.banned){gameOver=true;setStatus('🚫 '+msg.text)}}
    if(msg.type==='new_notif'){onNewNotif();addChat('📩 '+msg.title+': '+msg.content,'msg-sys')}
    if(msg.type==='new_dm'){onNewDm(msg.from);addChat('📩 收到来自 '+msg.from+' 的私信','msg-sys')}
    if(msg.type==='chat'){
      if(msg.color===3){
        addChat('👁 [观战] '+msg.name+': '+msg.text,'msg-spec');
      } else if(isSpectator){
        const who=msg.color===1?playerNames[1]||'黑方':playerNames[2]||'白方';
        addChat('('+who+') '+msg.text,msg.color===1?'msg-black':'msg-white');
      } else {
        addChat((msg.color===myColor?'(我)':(msg.color===3?'[观战]':'(对方)'))+' '+msg.text,msg.color===1?'msg-black':'msg-white');
      }
    }
  };
  ws.onclose=()=>{
    ws=null;
    // 关闭可能打开的加入选择弹窗
    if(joinDialogOpen){
      document.getElementById('join-choice-dialog').style.display='none';
      joinDialogOpen=false;
    }
    // 如果不是主动断开且游戏未结束，尝试重连
    if(!gameOver && !backToLobbyCalled){
      reconnectAttempts++;
      if(reconnectAttempts <= 5){
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        setStatus(`连接断开，${Math.round(delay/1000)}秒后重连...(${reconnectAttempts}/5)`);
        addChat(`连接断开，正在重连...(${reconnectAttempts}/5)`,'msg-sys');
        reconnectTimer = setTimeout(()=>{
          if(!ws && !gameOver){
            doConnect(connectOptions.roomId, connectOptions.mode, connectOptions.difficulty, connectOptions.forbidden);
          }
        }, delay);
      } else {
        gameOver=true;
        setStatus('连接已断开，请返回大厅重新加入');
        addChat('重连失败，请返回大厅重新加入','msg-alert');
      }
    } else {
      gameOver=true;
      setStatus('连接已断开');
    }
  };
  ws.onerror=()=>{};
}
function chooseFirst(swap){
  document.getElementById('choose-first').classList.remove('show');
  if(ws&&ws.readyState===1){
    ws.send(JSON.stringify({type:'choose_first',swap}));
  } else {
    setStatus('连接异常，请返回大厅重新加入');
  }
}
function chooseJoinAction(action){
  document.getElementById('join-choice-dialog').style.display='none';
  joinDialogOpen=false;
  if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'join_confirm',action}));
}
function updateSpectatorTurnStatus(){
  if(turn===0||gameOver)return;
  const turnName=turn===1?(playerNames[1]||'黑方'):(playerNames[2]||'白方');
  const gameLabel=gameType==='chess'?(turn===1?'红方':'黑方'):(gameType==='intl_chess'?(turn===1?'白方':'黑方'):(turn===1?'黑棋':'白棋'));
  setStatus(`👁 观战中 · ${colorDot(turn)} ${turnName}（${gameLabel}）的回合`);
}
function sendRestart(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'restart'}))}
function backToLobby(){
  backToLobbyCalled=true;
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  if(ws)ws.close();
  showView('lobby');
}
function sendResign(){if(!gameOver&&confirm('确定要认输吗？')&&ws&&ws.readyState===1)ws.send(JSON.stringify({type:'resign'}))}
function sendPass(){if(!gameOver&&ws&&ws.readyState===1)ws.send(JSON.stringify({type:'pass'}))}
function sendUndo(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'undo_request'}))}
function sendDraw(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'draw_request'}))}
function respondUndo(ok){document.getElementById('undo-dialog').classList.remove('show');if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'undo_response',approve:ok}))}
function respondDraw(ok){document.getElementById('draw-dialog').classList.remove('show');if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'draw_response',approve:ok}))}
function sendChatMsg(){const t=document.getElementById('chat-input').value.trim();if(!t||!ws||ws.readyState!==1)return;ws.send(JSON.stringify({type:'chat',text:t}));document.getElementById('chat-input').value=''}
document.getElementById('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter')sendChatMsg()});
document.getElementById('room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom()});
document.getElementById('room-id').onclick=()=>{const t=document.getElementById('room-id').textContent.replace('房间: ','');navigator.clipboard.writeText(t).then(()=>{document.getElementById('room-id').textContent='已复制!';setTimeout(()=>document.getElementById('room-id').textContent='房间: '+t,1000)})};
