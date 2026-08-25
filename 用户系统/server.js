process.on('uncaughtException', (err) => { console.error('未捕获异常:', err.message); });
process.on('unhandledRejection', (err) => { console.error('未处理Promise:', err); });

// 读取.env文件
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 导入模块
const { User, Ban, Report, GameLog, Appeal, Token, Notification, ChatLog, DM } = require('./models');
const { hashPw, verifyPw, genId, genToken } = require('./utils');
const { checkSensitive, filterSensitive, isMuted, addViolation } = require('./utils/sensitive');
const { createGomokuBoard, checkGomokuWin, getAIMove: gomokuAI } = require('./game/gomoku');
const { createGoBoard, getGoLiberties, goRemoveCaptures, goCountTerritory, getAIMove: goAI } = require('./game/go');
const { createChessBoard, getChessMoves, chessFindKing, chessIsAttacked, chessInCheck, chessHasLegalMove, getAIMove: chessAI } = require('./game/chess');

// 中间件
app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'data', 'screenshots')));
app.use(express.json({ limit: '10mb' }));

// MongoDB连接
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gomoku')
  .then(() => console.log('MongoDB 连接成功'))
  .catch(err => { console.error('MongoDB 连接失败:', err.message); process.exit(1); });

// ==================== 工具函数 ====================
const rooms = new Map();
const mutedChat = new Map();

function createRoom(roomId, gameType, timerSeconds, mode, difficulty) {
  const size = gameType === 'chess' ? null : (gameType === 'go' ? 19 : 15);
  return {
    id: roomId, gameType: gameType || 'gomoku', players: [], names: {}, tokens: {},
    board: gameType === 'chess' ? createChessBoard() : (gameType === 'go' ? createGoBoard(size) : createGomokuBoard(size)),
    size: size || 15, turn: 1, started: false, choosing: false, moveCount: 0,
    moveHistory: [], undoCount: [0, 0], drawCount: [0, 0],
    pendingUndo: null, pendingDraw: null,
    timerSeconds: timerSeconds || 0, timeLeft: [timerSeconds || 0, timerSeconds || 0],
    timerInterval: null, gameOver: false, passCount: 0, lastMove: null,
    goCaptures: [0, 0], mode: mode || 'pvp', difficulty: difficulty || 'easy', aiColor: 0,
  };
}

function getPlayerColor(room, ws) {
  const p = room.players.find(p => p.ws === ws);
  return p ? p.color : 0;
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.players.forEach(p => { if (p.ws && p.ws.readyState === 1) p.ws.send(data); });
}

function broadcastTo(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function startTimer(room) {
  if (room.timerSeconds <= 0 || room.gameOver) return;
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    if (room.gameOver) { clearInterval(room.timerInterval); return; }
    const idx = room.turn - 1;
    room.timeLeft[idx]--;
    broadcast(room, { type: 'timer', timeLeft: room.timeLeft });
    if (room.timeLeft[idx] <= 0) {
      clearInterval(room.timerInterval);
      room.gameOver = true;
      const winner = idx === 0 ? 2 : 1;
      broadcast(room, { type: 'game_over', winner, reason: '超时', winnerName: room.names[winner], loserName: room.names[idx + 1] });
      cleanupRoom(room);
    }
  }, 1000);
}

function stopTimer(room) { if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; } }
function cleanupRoom(room) { stopTimer(room); }

async function recordGame(winnerName, loserName, totalMoves, moves, gameType) {
  await User.updateOne({ username: winnerName }, { $inc: { wins: 1, games: 1 } });
  await User.updateOne({ username: loserName }, { $inc: { losses: 1, games: 1 } });
  await GameLog.create({ winner: winnerName, loser: loserName, totalMoves, gameType: gameType || 'gomoku', moves: moves || [], time: new Date().toISOString() });
}

async function isBanned(username) {
  const ban = await Ban.findOne({ username });
  if (!ban) return { banned: false };
  if (ban.permanent) return { banned: true, permanent: true, reason: ban.reason };
  const until = new Date(ban.until).getTime();
  if (Date.now() < until) return { banned: true, permanent: false, daysLeft: Math.ceil((until - Date.now()) / 86400000), reason: ban.reason };
  await Ban.deleteOne({ username });
  return { banned: false };
}

async function banUser(username, reason, days) {
  const permanent = !days;
  const until = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await Ban.findOneAndUpdate({ username }, { username, permanent, until, reason, bannedAt: new Date().toISOString() }, { upsert: true });
}

async function pushNotif(username, title, content) {
  await Notification.create({ id: genId(), username, title, content, time: new Date().toISOString() });
}

// ==================== 认证路由 ====================
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ error: '请输入用户名和密码' });
    if (username.length < 2 || username.length > 10) return res.json({ error: '用户名2-10个字符' });
    if (password.length < 4) return res.json({ error: '密码至少4位' });
    const exists = await User.findOne({ username });
    if (exists) return res.json({ error: '用户名已存在' });
    const hashedPw = await hashPw(password);
    const user = await User.create({ username, password: hashedPw });
    const token = genToken();
    await Token.create({ token, username });
    res.json({ token, username });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ error: '用户不存在' });
    if (user.deletedAt) return res.json({ error: '账号已注销' });
    const ok = await verifyPw(user.password, password);
    if (!ok) return res.json({ error: '密码错误' });
    const token = genToken();
    await Token.create({ token, username });
    res.json({ token, username });
  } catch (e) { res.json({ error: e.message }); }
});

app.post('/api/logout', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (token) await Token.deleteOne({ token });
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  const t = await Token.findOne({ token });
  if (!t) return res.status(401).json({ error: '未登录' });
  const user = await User.findOne({ username: t.username });
  if (!user || user.deletedAt) return res.status(401).json({ error: '用户不存在' });
  res.json({ username: t.username });
});

// ==================== 用户认证中间件 ====================
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  const t = await Token.findOne({ token });
  if (!t) return res.status(401).json({ error: '未登录' });
  req.username = t.username;
  next();
}

// ==================== 排行榜 ====================
app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find({ deletedAt: null }).select('username wins losses games').lean();
  const list = users.map(u => ({
    username: u.username, wins: u.wins, losses: u.losses, games: u.games,
    winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0,
  }));
  list.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
  res.json(list.slice(0, 20));
});

// ==================== 用户资料 ====================
app.get('/api/profile/:username', async (req, res) => {
  const u = await User.findOne({ username: req.params.username }).lean();
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { password, ...info } = u;
  info.username = req.params.username;
  info.winRate = u.games > 0 ? Math.round(u.wins / u.games * 100) : 0;
  info.deleted = !!u.deletedAt;
  info.reportCount = await Report.countDocuments({ target: req.params.username, status: 'approved' });
  info.reports = await Report.find({ target: req.params.username }).sort({ time: -1 }).lean();
  res.json(info);
});

// ==================== 修改用户名 ====================
app.post('/api/change-username', authMiddleware, async (req, res) => {
  const { newUsername, password } = req.body || {};
  if (!newUsername || !password) return res.json({ error: '请输入新用户名和密码' });
  if (newUsername.length < 2 || newUsername.length > 10) return res.json({ error: '用户名2-10个字符' });
  const user = await User.findOne({ username: req.username });
  if (!user) return res.json({ error: '用户不存在' });
  const ok = await verifyPw(user.password, password);
  if (!ok) return res.json({ error: '密码错误' });
  const exists = await User.findOne({ username: newUsername });
  if (exists) return res.json({ error: '用户名已存在' });
  await User.updateOne({ username: req.username }, { username: newUsername });
  await Token.updateMany({ username: req.username }, { username: newUsername });
  await Report.updateMany({ reporter: req.username }, { reporter: newUsername });
  await Report.updateMany({ target: req.username }, { target: newUsername });
  await Notification.updateMany({ username: req.username }, { username: newUsername });
  await DM.updateMany({ from: req.username }, { from: newUsername });
  await DM.updateMany({ to: req.username }, { to: newUsername });
  await Appeal.updateMany({ username: req.username }, { username: newUsername });
  const newToken = genToken();
  await Token.deleteOne({ token: req.headers.authorization.replace('Bearer ', '') });
  await Token.create({ token: newToken, username: newUsername });
  res.json({ ok: true, username: newUsername, token: newToken });
});

// ==================== 修改密码 ====================
app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.json({ error: '请输入所有字段' });
  if (newPassword.length < 4) return res.json({ error: '新密码至少4位' });
  const user = await User.findOne({ username: req.username });
  if (!user) return res.json({ error: '用户不存在' });
  const ok = await verifyPw(user.password, oldPassword);
  if (!ok) return res.json({ error: '原密码错误' });
  const hashedPw = await hashPw(newPassword);
  await User.updateOne({ username: req.username }, { password: hashedPw });
  res.json({ ok: true });
});

// ==================== 注销账号 ====================
app.post('/api/delete-account', authMiddleware, async (req, res) => {
  const { password } = req.body || {};
  const user = await User.findOne({ username: req.username });
  if (!user) return res.json({ error: '用户不存在' });
  const ok = await verifyPw(user.password, password);
  if (!ok) return res.json({ error: '密码错误' });
  await User.updateOne({ username: req.username }, { deletedAt: new Date().toISOString() });
  await Token.deleteMany({ username: req.username });
  res.json({ ok: true });
});

// ==================== 举报 ====================
app.post('/api/report', authMiddleware, async (req, res) => {
  const { target, reason, reasonType, screenshot } = req.body || {};
  if (!target || !reason) return res.status(400).json({ error: '请填写举报信息' });
  if (target === req.username) return res.status(400).json({ error: '不能举报自己' });
  const targetUser = await User.findOne({ username: target });
  if (!targetUser) return res.status(400).json({ error: '用户不存在' });
  let screenshotPath = '';
  if (screenshot && screenshot.startsWith('data:image')) {
    const matches = screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const filename = `${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}.${ext}`;
      screenshotPath = `screenshots/${filename}`;
      fs.writeFileSync(path.join(__dirname, 'data', screenshotPath), Buffer.from(matches[2], 'base64'));
    }
  }
  await Report.create({ id: genId(), reporter: req.username, target, reason, reasonType: reasonType || 'other', screenshot: screenshotPath, status: 'pending', time: new Date().toISOString() });
  res.json({ ok: true });
});

// ==================== 撤回举报 ====================
app.post('/api/report/cancel', authMiddleware, async (req, res) => {
  const { reportId } = req.body || {};
  const result = await Report.findOneAndUpdate({ id: reportId, reporter: req.username, status: 'pending' }, { status: 'cancelled' });
  if (!result) return res.status(400).json({ error: '举报不存在或无法撤回' });
  res.json({ ok: true });
});

// ==================== 申诉 ====================
app.post('/api/appeal', authMiddleware, async (req, res) => {
  const { reportId, reason } = req.body || {};
  if (!reportId || !reason) return res.status(400).json({ error: '请填写申诉理由' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  if (report.target !== req.username) return res.status(400).json({ error: '只能申诉针对自己的举报' });
  const existing = await Appeal.findOne({ reportId });
  if (existing) return res.status(400).json({ error: '该举报已申诉过' });
  await Appeal.create({ id: genId(), reportId, username: req.username, reason, status: 'pending', time: new Date().toISOString() });
  res.json({ ok: true });
});

// ==================== 我的申诉 ====================
app.get('/api/appeal/mine', authMiddleware, async (req, res) => {
  const appeals = await Appeal.find({ username: req.username }).sort({ time: -1 }).limit(20).lean();
  res.json(appeals);
});

// ==================== 通知 ====================
app.get('/api/notifs', authMiddleware, async (req, res) => {
  const notifs = await Notification.find({ username: req.username }).sort({ time: -1 }).limit(30).lean();
  res.json({ notifs, unread: notifs.filter(n => !n.read).length });
});

app.post('/api/notifs/read', authMiddleware, async (req, res) => {
  const { notifId } = req.body || {};
  if (notifId) { await Notification.findOneAndUpdate({ id: notifId, username: req.username }, { read: true }); }
  else { await Notification.updateMany({ username: req.username }, { read: true }); }
  res.json({ ok: true });
});

// ==================== 私信 ====================
app.post('/api/dm/send', authMiddleware, async (req, res) => {
  const { to, content } = req.body || {};
  if (!to || !content || !content.trim()) return res.status(400).json({ error: '缺少收件人或内容' });
  if (to === req.username) return res.status(400).json({ error: '不能给自己发私信' });
  const target = await User.findOne({ username: to });
  if (!target) return res.status(400).json({ error: '收件人不存在' });
  const { text: filteredContent } = filterSensitive(content.trim());
  await DM.create({ id: genId(), from: req.username, to, content: filteredContent.substring(0, 500), read: false, time: new Date().toISOString() });
  res.json({ ok: true });
});

app.get('/api/dm/inbox', authMiddleware, async (req, res) => {
  const allDms = await DM.find({ $or: [{ from: req.username }, { to: req.username }] }).sort({ time: -1 }).lean();
  const conversations = new Map();
  for (const dm of allDms) {
    const other = dm.from === req.username ? dm.to : dm.from;
    if (!conversations.has(other)) conversations.set(other, { username: other, lastContent: dm.content, lastTime: dm.time, unread: 0 });
    if (dm.to === req.username && !dm.read) conversations.get(other).unread++;
  }
  res.json({ conversations: Array.from(conversations.values()) });
});

app.get('/api/dm/conversation/:username', authMiddleware, async (req, res) => {
  const messages = await DM.find({ $or: [{ from: req.username, to: req.params.username }, { from: req.params.username, to: req.username }] }).sort({ time: 1 }).lean();
  res.json({ messages });
});

app.post('/api/dm/read', authMiddleware, async (req, res) => {
  const { with: withUser } = req.body || {};
  if (!withUser) return res.status(400).json({ error: '缺少用户名' });
  await DM.updateMany({ from: withUser, to: req.username, read: false }, { read: true });
  res.json({ ok: true });
});

app.get('/api/dm/unread', authMiddleware, async (req, res) => {
  const count = await DM.countDocuments({ to: req.username, read: false });
  res.json({ count });
});

// ==================== WebSocket ====================
const WS_PING_INTERVAL = 30000;
const WS_PONG_TIMEOUT = 10000;

wss.on('connection', (ws) => {
  let currentRoom = null;
  let authenticated = false;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const authTimer = setTimeout(() => {
    if (!authenticated) { ws.send(JSON.stringify({ type: 'error', msg: '认证超时' })); ws.close(); }
  }, 5000);

  ws.on('message', async (raw) => {
    try {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'pong') { ws.isAlive = true; return; }
      if (msg.type !== 'join' && !authenticated) { ws.send(JSON.stringify({ type: 'error', msg: '未认证' })); return; }

      if (msg.type === 'join') {
        if (!msg.token) { ws.send(JSON.stringify({ type: 'error', msg: '请先登录' })); ws.close(); clearTimeout(authTimer); return; }
        try {
          const tokenDoc = await Token.findOne({ token: msg.token });
          if (!tokenDoc || tokenDoc.username !== msg.name) { ws.send(JSON.stringify({ type: 'error', msg: '认证失败' })); ws.close(); clearTimeout(authTimer); return; }
          authenticated = true; clearTimeout(authTimer);
        } catch { ws.send(JSON.stringify({ type: 'error', msg: '认证失败' })); ws.close(); clearTimeout(authTimer); return; }

        const roomId = msg.room || 'default';
        const name = msg.name || '游客';
        const ban = await isBanned(name);
        if (ban.banned) {
          const timeInfo = ban.permanent ? '永久' : `还有${ban.daysLeft}天解封`;
          ws.send(JSON.stringify({ type: 'error', msg: `账号已被封禁：${ban.reason}（${timeInfo}）` }));
          return;
        }

        let room = rooms.get(roomId);
        if (!room) room = createRoom(roomId, msg.gameType, msg.timerSeconds, msg.mode, msg.difficulty);
        if (room.players.length >= 2) { ws.send(JSON.stringify({ type: 'error', msg: '房间已满' })); return; }
        const color = room.players.length === 0 ? 1 : 2;
        room.players.push({ ws, color });
        room.names[color] = name;
        room.tokens[color] = msg.token || '';
        rooms.set(roomId, room);
        currentRoom = room;

        ws.send(JSON.stringify({ type: 'joined', color, room: roomId, names: room.names, gameType: room.gameType, size: room.size, timerSeconds: room.timerSeconds, board: room.board, mode: room.mode, difficulty: room.difficulty }));

        // 人机对战模式
        if (room.mode === 'pve' && room.players.length === 1) {
          const aiColor = color === 1 ? 2 : 1;
          room.aiColor = aiColor;
          room.names[aiColor] = 'AI (' + (room.difficulty === 'easy' ? '简单' : room.difficulty === 'medium' ? '普通' : '困难') + ')';
          room.players.push({ ws: null, color: aiColor, isAI: true });
          room.started = true; room.choosing = true;
          broadcast(room, { type: 'names', names: room.names, gameType: room.gameType });
          const p1 = room.players.find(p => p.color === 1);
          if (p1 && p1.ws) { p1.ws.send(JSON.stringify({ type: 'choose_first' })); broadcast(room, { type: 'waiting_choice' }); }
        } else if (room.players.length === 2) {
          room.started = true; room.choosing = true;
          broadcast(room, { type: 'names', names: room.names, gameType: room.gameType });
          const p1 = room.players.find(p => p.color === 1);
          if (p1 && p1.ws) { p1.ws.send(JSON.stringify({ type: 'choose_first' })); broadcast(room, { type: 'waiting_choice' }); }
        }
        return;
      }

    if (msg.type === 'choose_first' && currentRoom && currentRoom.choosing) {
      if (getPlayerColor(currentRoom, ws) !== 1) return;
      currentRoom.choosing = false;
      if (msg.swap) {
        const p1 = currentRoom.players.find(p => p.color === 1);
        const p2 = currentRoom.players.find(p => p.color === 2);
        const tmpN = currentRoom.names[1], tmpT = currentRoom.tokens[1];
        p1.color = 2; p2.color = 1;
        currentRoom.names[1] = currentRoom.names[2]; currentRoom.names[2] = tmpN;
        currentRoom.tokens[1] = currentRoom.tokens[2]; currentRoom.tokens[2] = tmpT;
        ws.send(JSON.stringify({ type: 'color_swapped', color: 2 }));
        if (p2.ws) p2.ws.send(JSON.stringify({ type: 'color_swapped', color: 1 }));
        broadcast(currentRoom, { type: 'names', names: currentRoom.names, gameType: currentRoom.gameType });
      }
      currentRoom.turn = 1; currentRoom.moveCount = 0;
      broadcast(currentRoom, { type: 'start', turn: 1 });
      startTimer(currentRoom);
      // 五子棋AI先手
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1 && currentRoom.gameType === 'gomoku') {
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = gomokuAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
          if (aiMove) {
            const [aiR, aiC] = aiMove;
            currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]) });
            currentRoom.board[aiR][aiC] = currentRoom.aiColor;
            currentRoom.moveCount++; currentRoom.lastMove = [aiR, aiC];
            const aiWin = checkGomokuWin(currentRoom.board, aiR, aiC, currentRoom.aiColor);
            currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
            broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, win: aiWin ? currentRoom.aiColor : 0, lastMove: [aiR, aiC] });
            if (aiWin) {
              currentRoom.gameOver = true; stopTimer(currentRoom);
              const humanColor = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: '五子连珠', winnerName: currentRoom.names[currentRoom.aiColor], loserName: currentRoom.names[humanColor] });
              cleanupRoom(currentRoom);
            }
          }
        }, 500);
      }
      // 象棋AI先手
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1 && currentRoom.gameType === 'chess') {
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = chessAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty);
          if (aiMove) {
            const [aiFr, aiFc, aiTr, aiTc] = aiMove;
            const aiPiece = currentRoom.board[aiFr][aiFc]; const aiCaptured = currentRoom.board[aiTr][aiTc];
            const aiSaved = currentRoom.board.map(row => [...row]);
            currentRoom.board[aiTr][aiTc] = aiPiece; currentRoom.board[aiFr][aiFc] = '';
            currentRoom.moveHistory.push({ type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, captured: aiCaptured, board: aiSaved });
            currentRoom.lastMove = [aiTr, aiTc]; currentRoom.moveCount++;
            const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1; currentRoom.turn = aiOpponent;
            broadcast(currentRoom, { type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, turn: currentRoom.turn, captured: aiCaptured, lastMove: [aiTr, aiTc], board: currentRoom.board });
          }
        }, 500);
      }
    }

    // ==================== 走棋 ====================
    if (msg.type === 'move' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.turn !== myColor) return;

      if (currentRoom.gameType === 'gomoku') {
        const { r, c } = msg;
        if (r < 0 || r >= currentRoom.size || c < 0 || c >= currentRoom.size) return;
        if (currentRoom.board[r][c] !== 0) return;
        currentRoom.moveHistory.push({ type: 'move', r, c, color: myColor, board: currentRoom.board.map(row => [...row]) });
        currentRoom.board[r][c] = myColor;
        currentRoom.moveCount++; currentRoom.lastMove = [r, c];
        const win = checkGomokuWin(currentRoom.board, r, c, myColor);
        currentRoom.turn = myColor === 1 ? 2 : 1;
        broadcast(currentRoom, { type: 'move', r, c, color: myColor, turn: currentRoom.turn, win: win ? myColor : 0, lastMove: [r, c] });
        if (win) {
          currentRoom.gameOver = true; stopTimer(currentRoom);
          const wName = currentRoom.names[myColor], lName = currentRoom.names[myColor === 1 ? 2 : 1];
          broadcast(currentRoom, { type: 'game_over', winner: myColor, reason: '五子连珠', winnerName: wName, loserName: lName });
          if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'gomoku');
          cleanupRoom(currentRoom);
        } else if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = gomokuAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
            if (aiMove) {
              const [aiR, aiC] = aiMove;
              currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]) });
              currentRoom.board[aiR][aiC] = currentRoom.aiColor;
              currentRoom.moveCount++; currentRoom.lastMove = [aiR, aiC];
              const aiWin = checkGomokuWin(currentRoom.board, aiR, aiC, currentRoom.aiColor);
              currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, win: aiWin ? currentRoom.aiColor : 0, lastMove: [aiR, aiC] });
              if (aiWin) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const humanColor = currentRoom.aiColor === 1 ? 2 : 1;
                broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: '五子连珠', winnerName: currentRoom.names[currentRoom.aiColor], loserName: currentRoom.names[humanColor] });
                cleanupRoom(currentRoom);
              }
            }
          }, 500);
        }
      } else if (currentRoom.gameType === 'go') {
        const { r, c } = msg;
        if (r < 0 || r >= currentRoom.size || c < 0 || c >= currentRoom.size) return;
        if (currentRoom.board[r][c] !== 0) return;
        const testBoard = currentRoom.board.map(row => [...row]);
        testBoard[r][c] = myColor;
        const result = goRemoveCaptures(testBoard, r, c, myColor, currentRoom.size);
        if (result === -1) return;
        currentRoom.moveHistory.push({ type: 'move', r, c, color: myColor, board: currentRoom.board.map(row => [...row]), goCaptures: [...currentRoom.goCaptures] });
        currentRoom.board[r][c] = myColor;
        goRemoveCaptures(currentRoom.board, r, c, myColor, currentRoom.size);
        const opponent = myColor === 1 ? 2 : 1;
        currentRoom.goCaptures[myColor - 1] += result;
        currentRoom.lastMove = [r, c]; currentRoom.moveCount++; currentRoom.passCount = 0;
        currentRoom.turn = opponent;
        broadcast(currentRoom, { type: 'move', r, c, color: myColor, turn: currentRoom.turn, lastMove: [r, c], goCaptures: currentRoom.goCaptures, board: currentRoom.board.map(row => [...row]) });
        if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = goAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
            if (aiMove) {
              const [aiR, aiC] = aiMove;
              const aiTestBoard = currentRoom.board.map(row => [...row]);
              aiTestBoard[aiR][aiC] = currentRoom.aiColor;
              const aiResult = goRemoveCaptures(aiTestBoard, aiR, aiC, currentRoom.aiColor, currentRoom.size);
              if (aiResult === -1) return;
              currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]), goCaptures: [...currentRoom.goCaptures] });
              currentRoom.board[aiR][aiC] = currentRoom.aiColor;
              goRemoveCaptures(currentRoom.board, aiR, aiC, currentRoom.aiColor, currentRoom.size);
              currentRoom.goCaptures[currentRoom.aiColor - 1] += aiResult;
              currentRoom.lastMove = [aiR, aiC]; currentRoom.moveCount++; currentRoom.passCount = 0;
              currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, lastMove: [aiR, aiC], goCaptures: currentRoom.goCaptures, board: currentRoom.board.map(row => [...row]) });
            } else {
              currentRoom.passCount++; currentRoom.moveHistory.push({ type: 'pass', color: currentRoom.aiColor });
              currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'pass', color: currentRoom.aiColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
              if (currentRoom.passCount >= 2) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const territory = goCountTerritory(currentRoom.board, currentRoom.size);
                const black = currentRoom.goCaptures[0] + territory.black, white = currentRoom.goCaptures[1] + territory.white;
                let winner, reason;
                if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
                else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
                else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
                const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
                const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
                broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
                cleanupRoom(currentRoom);
              }
            }
          }, 500);
        }
      } else if (currentRoom.gameType === 'chess') {
        const { fr, fc, tr, tc } = msg;
        if (fr < 0 || fr >= 10 || fc < 0 || fc >= 9 || tr < 0 || tr >= 10 || tc < 0 || tc >= 9) return;
        const piece = currentRoom.board[fr][fc];
        if (!piece) return ws.send(JSON.stringify({ type: 'error', msg: '没有棋子' }));
        const pieceColor = piece === piece.toUpperCase() ? 2 : 1;
        if (pieceColor !== myColor) return ws.send(JSON.stringify({ type: 'error', msg: '不是你的棋子' }));
        const moves = getChessMoves(currentRoom.board, fr, fc);
        if (!moves.some(([mr, mc]) => mr === tr && mc === tc)) return ws.send(JSON.stringify({ type: 'error', msg: '不能这样走' }));
        const saved = currentRoom.board.map(row => [...row]);
        const captured = currentRoom.board[tr][tc];
        currentRoom.board[tr][tc] = piece; currentRoom.board[fr][fc] = '';
        if (chessInCheck(currentRoom.board, myColor)) {
          currentRoom.board[fr][fc] = piece; currentRoom.board[tr][tc] = captured;
          return ws.send(JSON.stringify({ type: 'error', msg: '不能送将' }));
        }
        currentRoom.moveHistory.push({ type: 'move', fr, fc, tr, tc, color: myColor, captured, board: saved });
        currentRoom.lastMove = [tr, tc]; currentRoom.moveCount++;
        const opponent = myColor === 1 ? 2 : 1; currentRoom.turn = opponent;
        broadcast(currentRoom, { type: 'move', fr, fc, tr, tc, color: myColor, turn: currentRoom.turn, captured, lastMove: [tr, tc], board: currentRoom.board });
        if (!chessHasLegalMove(currentRoom.board, opponent)) {
          currentRoom.gameOver = true; stopTimer(currentRoom);
          const wName = currentRoom.names[myColor], lName = currentRoom.names[opponent];
          broadcast(currentRoom, { type: 'game_over', winner: myColor, reason: chessInCheck(currentRoom.board, opponent) ? '将杀' : '困毙', winnerName: wName, loserName: lName });
          if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), 'chess');
          cleanupRoom(currentRoom);
        } else if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = chessAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty);
            if (aiMove) {
              const [aiFr, aiFc, aiTr, aiTc] = aiMove;
              const aiPiece = currentRoom.board[aiFr][aiFc]; const aiCaptured = currentRoom.board[aiTr][aiTc];
              const aiSaved = currentRoom.board.map(row => [...row]);
              currentRoom.board[aiTr][aiTc] = aiPiece; currentRoom.board[aiFr][aiFc] = '';
              currentRoom.moveHistory.push({ type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, captured: aiCaptured, board: aiSaved });
              currentRoom.lastMove = [aiTr, aiTc]; currentRoom.moveCount++;
              currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, turn: currentRoom.turn, captured: aiCaptured, lastMove: [aiTr, aiTc], board: currentRoom.board });
              if (!chessHasLegalMove(currentRoom.board, currentRoom.turn)) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const wName = currentRoom.names[currentRoom.aiColor], lName = currentRoom.names[currentRoom.turn];
                broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: chessInCheck(currentRoom.board, currentRoom.turn) ? '将杀' : '困毙', winnerName: wName, loserName: lName });
                cleanupRoom(currentRoom);
              }
            }
          }, 500);
        }
      }
    }

    // ==================== 围棋Pass ====================
    if (msg.type === 'pass' && currentRoom && !currentRoom.gameOver && currentRoom.gameType === 'go') {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.turn !== myColor) return;
      currentRoom.passCount++; currentRoom.moveHistory.push({ type: 'pass', color: myColor });
      currentRoom.turn = myColor === 1 ? 2 : 1;
      broadcast(currentRoom, { type: 'pass', color: myColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
      if (currentRoom.passCount >= 2) {
        currentRoom.gameOver = true; stopTimer(currentRoom);
        const territory = goCountTerritory(currentRoom.board, currentRoom.size);
        const black = currentRoom.goCaptures[0] + territory.black, white = currentRoom.goCaptures[1] + territory.white;
        let winner, reason;
        if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
        else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
        else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
        const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
        const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
        broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
        cleanupRoom(currentRoom);
      } else if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = goAI(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
          if (aiMove) {
            const [aiR, aiC] = aiMove;
            const aiTestBoard = currentRoom.board.map(row => [...row]);
            aiTestBoard[aiR][aiC] = currentRoom.aiColor;
            const aiResult = goRemoveCaptures(aiTestBoard, aiR, aiC, currentRoom.aiColor, currentRoom.size);
            if (aiResult === -1) return;
            currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]), goCaptures: [...currentRoom.goCaptures] });
            currentRoom.board[aiR][aiC] = currentRoom.aiColor;
            goRemoveCaptures(currentRoom.board, aiR, aiC, currentRoom.aiColor, currentRoom.size);
            currentRoom.goCaptures[currentRoom.aiColor - 1] += aiResult;
            currentRoom.lastMove = [aiR, aiC]; currentRoom.moveCount++; currentRoom.passCount = 0;
            currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
            broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, lastMove: [aiR, aiC], goCaptures: currentRoom.goCaptures, board: currentRoom.board.map(row => [...row]) });
          } else {
            currentRoom.passCount++; currentRoom.moveHistory.push({ type: 'pass', color: currentRoom.aiColor });
            currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
            broadcast(currentRoom, { type: 'pass', color: currentRoom.aiColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
            if (currentRoom.passCount >= 2) {
              currentRoom.gameOver = true; stopTimer(currentRoom);
              const territory = goCountTerritory(currentRoom.board, currentRoom.size);
              const black = currentRoom.goCaptures[0] + territory.black, white = currentRoom.goCaptures[1] + territory.white;
              let winner, reason;
              if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
              else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
              else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
              const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
              const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
              broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
              cleanupRoom(currentRoom);
            }
          }
        }, 500);
      }
    }

    // ==================== 认输 ====================
    if (msg.type === 'resign' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      currentRoom.gameOver = true; stopTimer(currentRoom);
      const winner = myColor === 1 ? 2 : 1;
      broadcast(currentRoom, { type: 'game_over', winner, reason: '认输', winnerName: currentRoom.names[winner], loserName: currentRoom.names[myColor] });
      cleanupRoom(currentRoom);
    }

    // ==================== 悔棋 ====================
    if (msg.type === 'undo_request' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.undoCount[myColor - 1] >= 3) { ws.send(JSON.stringify({ type: 'error', msg: '每局最多悔棋3次' })); return; }
      if (currentRoom.moveHistory.length === 0) { ws.send(JSON.stringify({ type: 'error', msg: '没有可悔棋的步骤' })); return; }
      if (currentRoom.pendingUndo) { ws.send(JSON.stringify({ type: 'error', msg: '已有待处理的悔棋请求' })); return; }
      currentRoom.pendingUndo = { from: myColor };
      const opponent = myColor === 1 ? 2 : 1;
      const opWs = currentRoom.players.find(p => p.color === opponent);
      if (opWs && opWs.ws) opWs.ws.send(JSON.stringify({ type: 'undo_request', from: myColor, fromName: currentRoom.names[myColor] }));
      ws.send(JSON.stringify({ type: 'undo_sent' }));
    }

    if (msg.type === 'undo_response' && currentRoom && currentRoom.pendingUndo) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (myColor !== (currentRoom.pendingUndo.from === 1 ? 2 : 1)) return;
      if (msg.approve) {
        for (let i = 0; i < 1 && currentRoom.moveHistory.length > 0; i++) {
          const last = currentRoom.moveHistory.pop();
          if (last.board) currentRoom.board = last.board.map(row => [...row]);
          if (last.goCaptures) currentRoom.goCaptures = [...last.goCaptures];
          currentRoom.moveCount--;
        }
        currentRoom.undoCount[currentRoom.pendingUndo.from - 1]++;
        currentRoom.turn = currentRoom.pendingUndo.from;
        currentRoom.lastMove = null;
        broadcast(currentRoom, { type: 'undo_approved', turn: currentRoom.turn, board: currentRoom.board, moveCount: currentRoom.moveCount });
      } else {
        broadcast(currentRoom, { type: 'undo_rejected' });
      }
      currentRoom.pendingUndo = null;
    }

    // ==================== 求和 ====================
    if (msg.type === 'draw_request' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.drawCount[myColor - 1] >= 3) { ws.send(JSON.stringify({ type: 'error', msg: '每局最多求和3次' })); return; }
      if (currentRoom.pendingDraw) { ws.send(JSON.stringify({ type: 'error', msg: '已有待处理的求和请求' })); return; }
      currentRoom.pendingDraw = { from: myColor };
      const opponent = myColor === 1 ? 2 : 1;
      const opWs = currentRoom.players.find(p => p.color === opponent);
      if (opWs && opWs.ws) opWs.ws.send(JSON.stringify({ type: 'draw_request', from: myColor, fromName: currentRoom.names[myColor] }));
      ws.send(JSON.stringify({ type: 'draw_sent' }));
    }

    if (msg.type === 'draw_response' && currentRoom && currentRoom.pendingDraw) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (myColor !== (currentRoom.pendingDraw.from === 1 ? 2 : 1)) return;
      if (msg.approve) {
        currentRoom.gameOver = true; stopTimer(currentRoom);
        broadcast(currentRoom, { type: 'game_over', winner: 0, reason: '双方同意和棋', winnerName: '平局', loserName: '' });
        cleanupRoom(currentRoom);
      } else {
        currentRoom.drawCount[currentRoom.pendingDraw.from - 1]++;
        broadcast(currentRoom, { type: 'draw_rejected' });
      }
      currentRoom.pendingDraw = null;
    }

    // ==================== 再来一局 ====================
    if (msg.type === 'restart' && currentRoom && currentRoom.gameOver) {
      const newBoard = currentRoom.gameType === 'chess' ? createChessBoard() :
        (currentRoom.gameType === 'go' ? createGoBoard(currentRoom.size) : createGomokuBoard(currentRoom.size));
      currentRoom.board = newBoard;
      currentRoom.turn = 1; currentRoom.moveCount = 0; currentRoom.moveHistory = [];
      currentRoom.undoCount = [0, 0]; currentRoom.drawCount = [0, 0];
      currentRoom.pendingUndo = null; currentRoom.pendingDraw = null;
      currentRoom.gameOver = false; currentRoom.passCount = 0; currentRoom.lastMove = null;
      currentRoom.goCaptures = [0, 0];
      currentRoom.timeLeft = [currentRoom.timerSeconds || 0, currentRoom.timerSeconds || 0];
      currentRoom.choosing = true;
      broadcast(currentRoom, { type: 'restart', board: currentRoom.board });
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1) {
        const humanPlayer = currentRoom.players.find(p => !p.isAI);
        if (humanPlayer && humanPlayer.ws) humanPlayer.ws.send(JSON.stringify({ type: 'choose_first' }));
      } else {
        const p1 = currentRoom.players.find(p => p.color === 1);
        if (p1 && p1.ws) p1.ws.send(JSON.stringify({ type: 'choose_first' }));
      }
      broadcast(currentRoom, { type: 'waiting_choice' });
    }

    // ==================== 聊天 ====================
    if (msg.type === 'chat' && currentRoom) {
      const playerColor = getPlayerColor(currentRoom, ws);
      const username = currentRoom.names[playerColor] || '';
      if (isMuted(username)) {
        ws.send(JSON.stringify({ type: 'chat', color: 0, text: '系统：你已被临时禁言，请稍后再试' }));
        return;
      }
      let text = String(msg.text || '').substring(0, 200);
      const { text: filteredText, filtered } = filterSensitive(text);
      if (filtered) ws.send(JSON.stringify({ type: 'chat', color: 0, text: '系统：消息包含敏感词，已过滤处理' }));
      await ChatLog.create({ id: genId(), roomId: currentRoom.id, username, color: playerColor, text: filteredText, filtered, time: new Date().toISOString() });
      broadcast(currentRoom, { type: 'chat', color: playerColor, text: filteredText });
    }
    } catch (e) { console.error('消息处理错误:', e.message); }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const myColor = getPlayerColor(currentRoom, ws);
      currentRoom.players = currentRoom.players.filter(p => p.ws !== ws);
      if (!currentRoom.gameOver && myColor) {
        currentRoom.gameOver = true; stopTimer(currentRoom);
        const winner = myColor === 1 ? 2 : 1;
        broadcast(currentRoom, { type: 'game_over', winner, reason: '对手离开', winnerName: currentRoom.names[winner], loserName: currentRoom.names[myColor] });
      }
      if (currentRoom.players.length === 0) { cleanupRoom(currentRoom); rooms.delete(currentRoom.id); }
    }
  });
});

// ==================== 心跳检测 ====================
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, WS_PING_INTERVAL);
wss.on('close', () => clearInterval(heartbeatInterval));

// ==================== 管理员API ====================
const ADMIN_KEY = process.env.ADMIN_KEY;
function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (h.replace('Bearer ', '') !== ADMIN_KEY) return res.status(403).json({ error: '无管理员权限' });
  next();
}

app.get('/api/admin/rooms', adminAuth, (req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.players.length === 0) continue;
    list.push({ id, gameType: room.gameType, moveCount: room.moveCount, turn: room.turn, started: room.started, gameOver: room.gameOver, size: room.size, names: { 1: room.names[1] || '等待中', 2: room.names[2] || '等待中' }, board: room.board.map(row => [...row]) });
  }
  res.json(list);
});

app.get('/api/admin/deleted-users', adminAuth, async (req, res) => {
  const users = await User.find({ deletedAt: { $ne: null } }).select('username wins losses games deletedAt createdAt').lean();
  res.json(users.map(u => ({ username: u.username, wins: u.wins, losses: u.losses, games: u.games, winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0, deletedAt: u.deletedAt, createdAt: u.createdAt })));
});

app.get('/api/admin/game-log', adminAuth, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const recent = await GameLog.find({ time: { $gte: cutoff } }).sort({ time: -1 }).lean();
  res.json({ total: recent.length, days, games: recent });
});

app.get('/api/admin/chat-logs', adminAuth, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const roomId = req.query.room || '';
  const username = req.query.username || '';
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const query = { time: { $gte: cutoff } };
  if (roomId) query.roomId = roomId;
  if (username) query.username = username;
  const logs = await ChatLog.find(query).sort({ time: -1 }).lean();
  res.json({ total: logs.length, days, logs });
});

app.post('/api/admin/force-delete', adminAuth, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: '用户不存在' });
  await User.deleteOne({ username });
  await Token.deleteMany({ username });
  await Report.deleteMany({ $or: [{ reporter: username }, { target: username }] });
  await GameLog.deleteMany({ $or: [{ winner: username }, { loser: username }] });
  await Ban.deleteOne({ username });
  await Appeal.deleteMany({ username });
  await Notification.deleteMany({ username });
  res.json({ ok: true });
});

// ==================== 启动 ====================
const PORT = process.env.GAME_PORT || 3002;
server.listen(PORT, () => { console.log(`五子棋(用户版)运行在 http://localhost:${PORT}`); });
