let reconnectAttempts = 0;
let reconnectTimer = null;
let connectOptions = {};

function connect(roomId,mode,difficulty){
  document.getElementById('chat-msgs').innerHTML='';
  connectOptions = {roomId, mode, difficulty};
  reconnectAttempts = 0;
  backToLobbyCalled = false;
  doConnect(roomId, mode, difficulty);
}

function doConnect(roomId, mode, difficulty){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{
    reconnectAttempts = 0;
    ws.send(JSON.stringify({type:'join',room:selectedGame+'_'+roomId,name:currentUser,token,gameType:selectedGame,timerSeconds:selectedTimer,mode:mode||'pvp',difficulty:difficulty||'easy'}));
  };
  ws.onmessage=(e)=>{
    const msg=JSON.parse(e.data);
    // 服务器心跳ping，回复pong
    if(msg.type==='ping'){
      ws.send(JSON.stringify({type:'pong'}));
      return;
    }
    if(msg.type==='joined'){
      myColor=msg.color;playerNames=msg.names||{};gameType=msg.gameType;boardSize=msg.size||15;timerSeconds=msg.timerSeconds||0;
      isAI=msg.mode==='pve';aiColor=isAI?(myColor===1?2:1):0;
      timeLeft=[timerSeconds,timerSeconds];
      board=msg.board||[];
      showView('game');
      const displayRoom=msg.room.replace(/^[a-z]+_/,'');
      document.getElementById('room-id').textContent='房间: '+displayRoom+(isAI?' (人机对战)':'');
      gameOver=false;turn=0;lastMove=null;
      document.getElementById('chat-msgs').innerHTML='';
      // 人机对战模式下隐藏不需要的按钮
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
    if(msg.type==='start'){turn=msg.turn;updateTurnStatus();addChat('对局开始！','msg-sys')}
    if(msg.type==='choose_first'){document.getElementById('choose-first').classList.add('show');setStatus('请选择先手')}
    if(msg.type==='waiting_choice'){setStatus('对手正在选择先手...')}
    if(msg.type==='color_swapped'){myColor=msg.color}
    if(msg.type==='timer'){
      timeLeft=msg.timeLeft;
      document.getElementById('timer-p1').textContent=formatTime(timeLeft[0]);
      document.getElementById('timer-p2').textContent=formatTime(timeLeft[1]);
      document.getElementById('timer-p1').className='timer-box'+(turn===1?' active':'');
      document.getElementById('timer-p2').className='timer-box'+(turn===2?' active':'');
    }
    if(msg.type==='move'){
      if(gameType==='chess'){
        board[msg.tr][msg.tc]=board[msg.fr][msg.fc];board[msg.fr][msg.fc]='';
      } else {
        board[msg.r][msg.c]=msg.color;
      }
      lastMove=msg.lastMove;turn=msg.turn;
      if(msg.board)board=msg.board;
      drawBoard();
      if(msg.win!==undefined&&msg.win!==0){
        gameOver=true;
        const wm=msg.win===myColor?'🎉 你赢了！':'😢 你输了';
        setStatus(wm);addChat(wm,'msg-sys');
      } else {updateTurnStatus()}
    }
    if(msg.type==='pass'){
      turn=msg.turn;
      if(msg.board)board=msg.board;
      drawBoard();
      addChat((msg.color===myColor?'你':'对手')+' Pass了','msg-sys');
      updateTurnStatus();
    }
    if(msg.type==='game_over'){
      gameOver=true;
      if(msg.winner===0){
        setStatus('🤝 '+msg.reason);addChat(msg.reason,'msg-sys');
      } else {
        const wm=msg.winner===myColor?'🎉 你赢了！':'😢 你输了';
        setStatus(wm+' ('+msg.reason+')');addChat(wm+' ('+msg.reason+')','msg-sys');
      }
      drawBoard();
    }
    if(msg.type==='undo_approved'){
      board=msg.board||board;turn=msg.turn;moveCount=msg.moveCount;lastMove=null;
      gameOver=false;drawBoard();updateTurnStatus();
      addChat('悔棋成功','msg-sys');
    }
    if(msg.type==='undo_rejected'){addChat('对手拒绝了悔棋请求','msg-sys')}
    if(msg.type==='draw_rejected'){addChat('对手拒绝了求和请求','msg-sys')}
    if(msg.type==='restart'){
      board=msg.board||board;gameOver=false;turn=0;lastMove=null;moveCount=0;
      document.getElementById('chat-msgs').innerHTML='';
      drawBoard();setStatus('等待对手加入...');
      addChat('新一局开始！','msg-sys');
    }
    if(msg.type==='undo_request'){
      document.getElementById('undo-msg').textContent=msg.fromName+' 请求悔棋';
      document.getElementById('undo-dialog').classList.add('show');
    }
    if(msg.type==='draw_request'){
      document.getElementById('draw-msg').textContent=msg.fromName+' 请求和棋';
      document.getElementById('draw-dialog').classList.add('show');
    }
    if(msg.type==='opponent_left'){setStatus('对手已离开');addChat('对手已离开房间','msg-sys');gameOver=true}
    if(msg.type==='system_alert'){addChat(msg.text,'msg-alert');if(msg.banned){gameOver=true;setStatus('🚫 '+msg.text)}}
    if(msg.type==='new_notif'){onNewNotif();addChat('📩 '+msg.title+': '+msg.content,'msg-sys')}
    if(msg.type==='new_dm'){onNewDm(msg.from);addChat('📩 收到来自 '+msg.from+' 的私信','msg-sys')}
    if(msg.type==='chat'){addChat((msg.color===myColor?'(我)':'(对方)')+' '+msg.text,msg.color===1?'msg-black':'msg-white')}
  };
  ws.onclose=()=>{
    ws=null;
    // 如果不是主动断开且游戏未结束，尝试重连
    if(!gameOver && !backToLobbyCalled){
      reconnectAttempts++;
      if(reconnectAttempts <= 5){
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        setStatus(`连接断开，${Math.round(delay/1000)}秒后重连...(${reconnectAttempts}/5)`);
        addChat(`连接断开，正在重连...(${reconnectAttempts}/5)`,'msg-sys');
        reconnectTimer = setTimeout(()=>{
          if(!ws && !gameOver){
            doConnect(connectOptions.roomId, connectOptions.mode, connectOptions.difficulty);
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
let backToLobbyCalled = false;
function chooseFirst(swap){document.getElementById('choose-first').classList.remove('show');if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'choose_first',swap}))}
function sendRestart(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'restart'}))}
function backToLobby(){
  backToLobbyCalled=true;
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  if(ws)ws.close();
  showView('lobby');
}
function sendResign(){if(!gameOver&&confirm('确定要认输吗？'))ws.send(JSON.stringify({type:'resign'}))}
function sendPass(){if(!gameOver)ws.send(JSON.stringify({type:'pass'}))}
function sendUndo(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'undo_request'}))}
function sendDraw(){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'draw_request'}))}
function respondUndo(ok){document.getElementById('undo-dialog').classList.remove('show');ws.send(JSON.stringify({type:'undo_response',approve:ok}))}
function respondDraw(ok){document.getElementById('draw-dialog').classList.remove('show');ws.send(JSON.stringify({type:'draw_response',approve:ok}))}
function sendChatMsg(){const t=document.getElementById('chat-input').value.trim();if(!t||!ws||ws.readyState!==1)return;ws.send(JSON.stringify({type:'chat',text:t}));document.getElementById('chat-input').value=''}
document.getElementById('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter')sendChatMsg()});
document.getElementById('room-input').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom()});
document.getElementById('room-id').onclick=()=>{const t=document.getElementById('room-id').textContent.replace('房间: ','');navigator.clipboard.writeText(t).then(()=>{document.getElementById('room-id').textContent='已复制!';setTimeout(()=>document.getElementById('room-id').textContent='房间: '+t,1000)})};
