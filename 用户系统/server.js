process.on('uncaughtException', (err) => { console.error('未捕获异常:', err.message); });
process.on('unhandledRejection', (err) => { console.error('未处理Promise:', err); });

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const argon2 = require('argon2');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/screenshots', express.static(path.join(__dirname, 'data', 'screenshots')));
app.use(express.json({ limit: '10mb' }));

// ==================== MongoDB 连接 ====================
mongoose.connect('mongodb://localhost:27017/gomoku')
  .then(() => console.log('MongoDB 连接成功'))
  .catch(err => { console.error('MongoDB 连接失败:', err.message); process.exit(1); });

// ==================== Schema 定义 ====================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  games: { type: Number, default: 0 },
  deletedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: 'users' });

const banSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  permanent: { type: Boolean, default: false },
  until: { type: String, default: null },
  reason: { type: String, default: '' },
  offenses: { type: Number, default: 0 },
  bannedAt: { type: String, default: () => new Date().toISOString() },
}, { collection: 'banList' });

const reportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reporter: { type: String, required: true },
  target: { type: String, required: true },
  reason: { type: String, default: '' },
  reasonType: { type: String, default: 'other' },
  screenshot: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  time: { type: String, default: () => new Date().toISOString() },
  reviewedAt: { type: String, default: null },
  adminMark: { type: Boolean, default: false },
}, { collection: 'reports' });

const gameLogSchema = new mongoose.Schema({
  winner: { type: String, required: true },
  loser: { type: String, required: true },
  totalMoves: { type: Number, default: 0 },
  gameType: { type: String, default: 'gomoku' },
  moves: { type: [mongoose.Schema.Types.Mixed], default: [] },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'gameRecord' });

const appealSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reportId: { type: String, required: true },
  username: { type: String, required: true },
  reason: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'appeals' });

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true },
}, { collection: 'tokens' });

const notifSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'notifications' });

const chatLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  roomId: { type: String, required: true },
  username: { type: String, default: '' },
  color: { type: Number, required: true },
  text: { type: String, required: true },
  filtered: { type: Boolean, default: false },
  alert: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'chatLogs' });

const dmSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'dms' });

const User = mongoose.model('User', userSchema);
const Ban = mongoose.model('Ban', banSchema);
const Report = mongoose.model('Report', reportSchema);
const GameLog = mongoose.model('GameLog', gameLogSchema);
const Appeal = mongoose.model('Appeal', appealSchema);
const Token = mongoose.model('Token', tokenSchema);
const Notification = mongoose.model('Notification', notifSchema);
const ChatLog = mongoose.model('ChatLog', chatLogSchema);
const DM = mongoose.model('DM', dmSchema);

// ==================== 工具函数 ====================
async function hashPw(pw) { return argon2.hash(pw); }
async function verifyPw(storedHash, pw) {
  if (storedHash.startsWith('$argon2')) {
    return argon2.verify(storedHash, pw);
  } else {
    return storedHash === crypto.createHash('sha256').update(pw).digest('hex');
  }
}

const SENSITIVE_BLOCK = [
  // 赌博相关
  '现金','下注','赌棋','赌一把','上分','下分','回收分数','收购分','买卖分',
  '微信转账','支付宝转账','红包','赌注','赌资','博彩','赌博','私局','盘口',
  '赔率','打水','套利','结算','现结','线下对局','给钱下棋',
  // 广告引流、交易
  '收徒','接单','代练','外挂','辅助','脚本','私服','源码','出售','购买',
  '加微信','加 qq','联系我','私我','群号','二维码','网址','链接','推广','变现',
  // 辱骂暴力
  '傻逼','废物','垃圾','脑残','滚','去死',
  // 违规政治、色情、涉恐
  '色情','嫖','赌','毒','翻墙','邪教'
];
const SENSITIVE_WARN = ['赢钱','赚钱','报酬','酬劳','切磋付费','有偿对局'];

function normalizeText(text) {
  let s = text.toLowerCase();
  // 全角转半角
  s = s.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // 去除空格、半角标点和全角中文标点
  s = s.replace(/[\s\.,\-_~!@#$%^&*()+=[\]{}|;:'"<>?\/\\。！？，、；：“”‘’（）【】《》～·｜…—－]/g, '');
  // 简单繁体转简体
  const trad2simp = { '贏':'赢','錢':'钱','報':'报','醜':'酬','勞':'劳','練':'练','務':'务','賣':'卖','購':'购','轉':'转','賬':'账','紅':'红','黨':'党','國':'国','軍':'军','車':'车','馬':'马','東':'东','風':'风','時':'时','間':'间' };
  s = s.split('').map(ch => trad2simp[ch] || ch).join('');
  return s;
}

function filterSensitive(text) {
  const normalized = normalizeText(text);
  const trad2simp = { '贏':'赢','錢':'钱','報':'报','醜':'酬','勞':'劳','練':'练','務':'务','賣':'卖','購':'购','轉':'转','賬':'账','紅':'红','黨':'党','國':'国','軍':'军','車':'车','馬':'马','東':'东','風':'风','時':'时','間':'间' };

  // 构建规范化字符到原始索引的映射
  const normToOrig = [];
  let normIdx = 0;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i].toLowerCase();
    if (/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/.test(ch)) {
      ch = String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }
    ch = trad2simp[ch] || ch;
    if (/[a-z0-9\u4e00-\u9fa5]/.test(ch)) {
      normToOrig[normIdx++] = i;
    }
  }

  let filtered = false;
  let blockCount = 0;
  let warnMatched = false;
  const replacements = [];

  // 强制拦截：在规范化文本中定位，替换原始文本中对应的字符（保留中间标点）
  for (const word of SENSITIVE_BLOCK) {
    const nWord = normalizeText(word);
    let idx = normalized.indexOf(nWord);
    while (idx !== -1) {
      filtered = true;
      blockCount++;
      for (let j = 0; j < nWord.length; j++) {
        const origPos = normToOrig[idx + j];
        if (origPos !== undefined) {
          replacements.push(origPos);
        }
      }
      idx = normalized.indexOf(nWord, idx + 1);
    }
  }

  // 去重并从后往前替换
  let result = text;
  if (replacements.length) {
    const uniquePos = [...new Set(replacements)].sort((a, b) => b - a);
    for (const pos of uniquePos) {
      result = result.substring(0, pos) + '*' + result.substring(pos + 1);
    }
  }

  // 预警词：只标记，不替换
  for (const word of SENSITIVE_WARN) {
    const nWord = normalizeText(word);
    if (normalized.includes(nWord)) warnMatched = true;
  }

  return { text: result, filtered, blockCount, warnMatched };
}

// 临时禁言映射：username -> 解禁时间戳
const muteMap = new Map();
function isMuted(username) {
  if (!username) return false;
  const until = muteMap.get(username);
  if (!until) return false;
  if (Date.now() > until) { muteMap.delete(username); return false; }
  return true;
}
function muteUser(username, minutes) {
  muteMap.set(username, Date.now() + minutes * 60000);
}
function genToken() { return crypto.randomBytes(32).toString('hex'); }
function genId() { return crypto.randomBytes(8).toString('hex'); }

async function pushNotif(username, title, content) {
  const notif = await Notification.create({ id: genId(), username, title, content, read: false, time: new Date().toISOString() });
  // 限制每用户最多500条通知
  const count = await Notification.countDocuments({ username });
  if (count > 500) {
    const excess = count - 500;
    const oldest = await Notification.find({ username }).sort({ time: 1 }).limit(excess).select('_id');
    if (oldest.length) {
      await Notification.deleteMany({ _id: { $in: oldest.map(n => n._id) } });
    }
  }
  const ws = findUserWs(username);
  if (ws) broadcastTo(ws, { type: 'new_notif', title, content });
}

// ==================== 清理7天过期数据 ====================
async function cleanupOldData() {
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const cutoff15 = new Date(Date.now() - 15 * 86400000).toISOString();
  // 清理已删除超过7天的用户
  await User.deleteMany({ deletedAt: { $ne: null, $lt: cutoff7 } });
  // 清理其他旧数据（7天）
  await Report.deleteMany({ time: { $lt: cutoff7 } });
  await GameLog.deleteMany({ time: { $lt: cutoff7 } });
  await Appeal.deleteMany({ time: { $lt: cutoff7 } });
  await Notification.deleteMany({ time: { $lt: cutoff7 } });
  // 聊天日志保留15天
  await ChatLog.deleteMany({ time: { $lt: cutoff15 } });
}
setInterval(cleanupOldData, 3600000);
cleanupOldData();

// ==================== 封号系统 ====================
async function isBanned(username) {
  const ban = await Ban.findOne({ username });
  if (!ban) return { banned: false };
  if (ban.permanent) return { banned: true, until: '永久', reason: ban.reason, offenses: ban.offenses };
  const until = new Date(ban.until).getTime();
  if (Date.now() >= until) return { banned: false };
  return { banned: true, until: ban.until, daysLeft: Math.ceil((until - Date.now()) / 86400000), reason: ban.reason, offenses: ban.offenses };
}

async function banUser(username, reason) {
  const activeReports = await Report.countDocuments({ target: username, status: 'approved' });
  let days;
  if (activeReports >= 50) {
    return await Ban.findOneAndUpdate({ username }, { permanent: true, reason, offenses: activeReports, bannedAt: new Date().toISOString() }, { upsert: true, new: true });
  } else if (activeReports >= 40) { days = 365; }
  else if (activeReports >= 30) { days = 180; }
  else if (activeReports >= 20) { days = 90; }
  else if (activeReports >= 12) { days = 30; }
  else if (activeReports >= 7) { days = 14; }
  else { days = 0; }
  const until = new Date(Date.now() + days * 86400000).toISOString();
  return await Ban.findOneAndUpdate({ username }, { permanent: false, until, reason, offenses: activeReports, bannedAt: new Date().toISOString() }, { upsert: true, new: true });
}

// ==================== 认证中间件 ====================
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  const tokenDoc = await Token.findOne({ token });
  if (!tokenDoc) return res.status(401).json({ error: 'token无效' });
  const username = tokenDoc.username;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: '用户不存在' });
  if (user.deletedAt) return res.status(401).json({ error: '账号已注销' });
  req.username = username;
  req.user = user;
  next();
}

// ==================== API 端点 ====================

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  if (username.length < 2 || username.length > 10) return res.status(400).json({ error: '用户名2-10个字符' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  const exists = await User.findOne({ username });
  if (exists) return res.status(400).json({ error: '用户名已存在' });
  await User.create({ username, password: await hashPw(password), wins: 0, losses: 0, games: 0, createdAt: new Date().toISOString() });
  const token = genToken();
  await Token.create({ token, username });
  res.json({ token, username });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: '用户名或密码错误' });
  if (user.deletedAt) return res.status(400).json({ error: '账号已注销' });
  if (!await verifyPw(user.password, password)) return res.status(400).json({ error: '用户名或密码错误' });
  // 自动升级：旧SHA256哈希重加密为Argon2
  if (!user.password.startsWith('$argon2')) {
    user.password = await hashPw(password);
    await user.save();
  }
  const ban = await isBanned(username);
  if (ban.banned) {
    const timeInfo = ban.permanent ? '永久' : `还有${ban.daysLeft}天解封`;
    return res.status(403).json({ error: `账号已被封禁：${ban.reason}（${timeInfo}）` });
  }
  const token = genToken();
  await Token.create({ token, username });
  res.json({ token, username });
});

// 登出
app.post('/api/logout', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (token) { await Token.deleteOne({ token }); }
  res.json({ ok: true });
});

// 注销账号（软删除）
app.post('/api/delete-account', authMiddleware, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: '请输入密码确认' });
  const user = await User.findOne({ username: req.username });
  if (!await verifyPw(user.password, password)) return res.status(400).json({ error: '密码错误' });
  user.deletedAt = new Date().toISOString();
  await user.save();
  await Token.deleteMany({ username: req.username });
  res.json({ ok: true });
});

// 修改用户名
app.post('/api/change-username', authMiddleware, async (req, res) => {
  const { newUsername, password } = req.body || {};
  if (!newUsername || !password) return res.status(400).json({ error: '请输入新用户名和密码' });
  if (newUsername.length < 2 || newUsername.length > 10) return res.status(400).json({ error: '用户名2-10个字符' });
  const user = await User.findOne({ username: req.username });
  if (!await verifyPw(user.password, password)) return res.status(400).json({ error: '密码错误' });
  const exists = await User.findOne({ username: newUsername });
  if (exists) return res.status(400).json({ error: '用户名已存在' });
  user.username = newUsername;
  await user.save();
  // 更新相关集合中的用户名
  await Token.updateMany({ username: req.username }, { $set: { username: newUsername } });
  await Report.updateMany({ reporter: req.username }, { $set: { reporter: newUsername } });
  await Report.updateMany({ target: req.username }, { $set: { target: newUsername } });
  await Appeal.updateMany({ username: req.username }, { $set: { username: newUsername } });
  await Notification.updateMany({ username: req.username }, { $set: { username: newUsername } });
  const banDoc = await Ban.findOne({ username: req.username });
  if (banDoc) { banDoc.username = newUsername; await banDoc.save(); }
  await GameLog.updateMany({ winner: req.username }, { $set: { winner: newUsername } });
  await GameLog.updateMany({ loser: req.username }, { $set: { loser: newUsername } });
  res.json({ ok: true, username: newUsername });
});

// 修改密码
app.post('/api/change-password', authMiddleware, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入原密码和新密码' });
  if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  const user = await User.findOne({ username: req.username });
  if (!await verifyPw(user.password, oldPassword)) return res.status(400).json({ error: '原密码错误' });
  user.password = await hashPw(newPassword);
  await user.save();
  res.json({ ok: true });
});

// 获取当前用户信息
app.get('/api/me', authMiddleware, async (req, res) => {
  const { password, ...info } = req.user.toObject();
  info.username = req.username;
  const ban = await isBanned(req.username);
  info.banned = ban.banned;
  res.json(info);
});

// 排行榜
app.get('/api/leaderboard', async (req, res) => {
  const users = await User.find({ deletedAt: null }).select('username wins losses games').lean();
  const list = users.map(u => ({
    username: u.username, wins: u.wins, losses: u.losses, games: u.games,
    winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0,
  }));
  list.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
  res.json(list.slice(0, 20));
});

// 用户资料
app.get('/api/profile/:username', async (req, res) => {
  const u = await User.findOne({ username: req.params.username }).lean();
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { password, ...info } = u;
  info.username = req.params.username;
  info.winRate = u.games > 0 ? Math.round(u.wins / u.games * 100) : 0;
  info.deleted = !!u.deletedAt;
  const approvedReports = await Report.countDocuments({ target: req.params.username, status: 'approved' });
  info.reportCount = approvedReports;
  info.reports = await Report.find({ target: req.params.username }).sort({ time: -1 }).lean();
  res.json(info);
});

// 举报
app.post('/api/report', authMiddleware, async (req, res) => {
  const { target, reason, reasonType, screenshot } = req.body || {};
  if (!target || !reason) return res.status(400).json({ error: '请填写举报信息' });
  if (!screenshot) return res.status(400).json({ error: '请上传对局截图' });
  if (target === req.username) return res.status(400).json({ error: '不能举报自己' });
  const targetUser = await User.findOne({ username: target });
  if (!targetUser) return res.status(400).json({ error: '用户不存在' });
  // 1小时内同目标举报次数限制
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const recentByMe = await Report.countDocuments({ reporter: req.username, target, time: { $gte: oneHourAgo } });
  if (recentByMe >= 3) return res.status(400).json({ error: '1小时内已向该用户举报3次' });
  let screenshotPath = '';
  if (screenshot && screenshot.startsWith('data:image')) {
    const matches = screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      screenshotPath = `screenshots/${filename}`;
      fs.writeFileSync(path.join(__dirname, 'data', screenshotPath), Buffer.from(matches[2], 'base64'));
    }
  }
  await Report.create({ id: genId(), reporter: req.username, target, reason, reasonType: reasonType || 'other', screenshot: screenshotPath, status: 'pending', time: new Date().toISOString() });
  res.json({ ok: true, msg: '举报已提交' });
});

// 撤回举报
app.post('/api/report/cancel', authMiddleware, async (req, res) => {
  const { reportId } = req.body || {};
  const result = await Report.findOneAndUpdate({ id: reportId, reporter: req.username, status: 'pending' }, { status: 'cancelled' });
  if (!result) return res.status(400).json({ error: '举报不存在或无法撤回' });
  res.json({ ok: true });
});

// 我的举报
app.get('/api/reports/mine', authMiddleware, async (req, res) => {
  const reports = await Report.find({ reporter: req.username }).sort({ time: -1 }).limit(20).lean();
  res.json(reports);
});

// 提交申诉
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

// 我的申诉
app.get('/api/appeal/mine', authMiddleware, async (req, res) => {
  const appeals = await Appeal.find({ username: req.username }).sort({ time: -1 }).limit(20).lean();
  res.json(appeals);
});

// 获取通知
app.get('/api/notifs', authMiddleware, async (req, res) => {
  const notifs = await Notification.find({ username: req.username }).sort({ time: -1 }).limit(30).lean();
  res.json({ notifs, unread: notifs.filter(n => !n.read).length });
});

// 标记通知已读
app.post('/api/notifs/read', authMiddleware, async (req, res) => {
  const { notifId } = req.body || {};
  if (notifId) {
    await Notification.findOneAndUpdate({ id: notifId, username: req.username }, { read: true });
  } else {
    await Notification.updateMany({ username: req.username }, { read: true });
  }
  res.json({ ok: true });
});

// ==================== 私信系统 ====================
app.post('/api/dm/send', authMiddleware, async (req, res) => {
  const { to, content } = req.body || {};
  if (!to || !content || !content.trim()) return res.status(400).json({ error: '缺少收件人或内容' });
  if (to === req.username) return res.status(400).json({ error: '不能给自己发私信' });
  const target = await User.findOne({ username: to });
  if (!target) return res.status(400).json({ error: '收件人不存在' });
  // 敏感词过滤
  const { text: filteredContent, filtered } = filterSensitive(content.trim());
  const dm = await DM.create({
    id: crypto.randomBytes(8).toString('hex'),
    from: req.username,
    to: to,
    content: filteredContent.substring(0, 500),
    read: false,
    time: new Date().toISOString()
  });
  // 如果对方在线，推送实时通知
  const targetWs = findUserWs(to);
  if (targetWs) {
    targetWs.send(JSON.stringify({ type: 'new_dm', from: req.username, preview: filteredContent.substring(0, 40) }));
  }
  res.json({ ok: true, filtered });
});

app.get('/api/dm/inbox', authMiddleware, async (req, res) => {
  const myName = req.username;
  // 聚合查询：获取每个对话的最新一条消息
  const allDms = await DM.find({ $or: [{ from: myName }, { to: myName }] }).sort({ time: -1 }).lean();
  const conversations = new Map();
  for (const dm of allDms) {
    const other = dm.from === myName ? dm.to : dm.from;
    if (!conversations.has(other)) {
      conversations.set(other, {
        username: other,
        lastContent: dm.content,
        lastTime: dm.time,
        unread: 0
      });
    }
    if (dm.to === myName && !dm.read) {
      conversations.get(other).unread++;
    }
  }
  res.json({ conversations: Array.from(conversations.values()) });
});

app.get('/api/dm/conversation/:username', authMiddleware, async (req, res) => {
  const myName = req.username;
  const other = req.params.username;
  const messages = await DM.find({
    $or: [
      { from: myName, to: other },
      { from: other, to: myName }
    ]
  }).sort({ time: 1 }).lean();
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

// ==================== 游戏记录 ====================
async function recordGame(winnerName, loserName, totalMoves, moves, gameType) {
  await User.updateOne({ username: winnerName }, { $inc: { wins: 1, games: 1 } });
  await User.updateOne({ username: loserName }, { $inc: { losses: 1, games: 1 } });
  await GameLog.create({ winner: winnerName, loser: loserName, totalMoves, gameType: gameType || 'gomoku', moves: moves || [], time: new Date().toISOString() });
}

// ==================== 房间与游戏逻辑 ====================
const rooms = new Map();

function createRoom(roomId, gameType, timerSeconds, mode, difficulty) {
  const size = gameType === 'chess' ? null : (gameType === 'go' ? 19 : 15);
  return {
    id: roomId, gameType: gameType || 'gomoku', players: [], names: {}, tokens: {},
    board: gameType === 'chess' ? createChessBoard() : (gameType === 'go' ? createGoBoard(size) : createGomokuBoard(size)),
    size: size || 15,
    turn: 1, started: false, choosing: false, moveCount: 0,
    moveHistory: [],
    undoCount: [0, 0], drawCount: [0, 0],
    pendingUndo: null, pendingDraw: null,
    timerSeconds: timerSeconds || 0, timeLeft: [timerSeconds || 0, timerSeconds || 0],
    timerInterval: null, gameOver: false,
    passCount: 0, lastMove: null,
    goCaptures: [0, 0],
    mode: mode || 'pvp', difficulty: difficulty || 'easy', aiColor: 0,
  };
}

function createGomokuBoard(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }
function createGoBoard(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }
function createChessBoard() {
  const b = Array.from({ length: 10 }, () => Array(9).fill(''));
  b[0] = ['R','N','B','A','K','A','B','N','R'];
  b[2][1] = 'C'; b[2][7] = 'C';
  for (let c = 0; c < 9; c += 2) b[3][c] = 'P';
  b[9] = ['r','n','b','a','k','a','b','n','r'];
  b[7][1] = 'c'; b[7][7] = 'c';
  for (let c = 0; c < 9; c += 2) b[6][c] = 'p';
  return b;
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
function findUserWs(username) {
  for (const [, room] of rooms) for (const p of room.players) if (room.names[p.color] === username) return p.ws;
  return null;
}

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
      const winnerName = room.names[winner] || '';
      const loserName = room.names[idx + 1] || '';
      broadcast(room, { type: 'game_over', winner, reason: '超时', winnerName, loserName });
      if (winnerName && loserName && winnerName !== loserName) recordGame(winnerName, loserName, room.moveCount, room.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), room.gameType);
      cleanupRoom(room);
    }
  }, 1000);
}
function stopTimer(room) { if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; } }
function cleanupRoom(room) { stopTimer(room); }

// ==================== 五子棋逻辑 ====================
function checkGomokuWin(board, r, c, color) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let i = 1; i < 5; i++) { const nr = r + dr*i, nc = c + dc*i; if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === color) count++; else break; }
    for (let i = 1; i < 5; i++) { const nr = r - dr*i, nc = c - dc*i; if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === color) count++; else break; }
    if (count >= 5) return true;
  }
  return false;
}

// ==================== 五子棋AI ====================
// 棋型评分
const GOMOKU_SCORES = {
  FIVE: 1000000,      // 五连
  OPEN_FOUR: 100000,  // 活四
  FOUR: 10000,        // 冲四
  OPEN_THREE: 5000,   // 活三
  THREE: 500,         // 眠三
  OPEN_TWO: 200,      // 活二
  TWO: 50,            // 眠二
  ONE: 10             // 单子
};

// 分析一个方向的棋型
function analyzeLine(board, r, c, dr, dc, color, size) {
  let count = 1;
  let openEnds = 0;
  let blocks = 0;

  // 正方向
  let i = 1;
  while (true) {
    const nr = r + dr * i, nc = c + dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { blocks++; break; }
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else { blocks++; break; }
  }

  // 反方向
  i = 1;
  while (true) {
    const nr = r - dr * i, nc = c - dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { blocks++; break; }
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else { blocks++; break; }
  }

  return { count, openEnds, blocks };
}

// 评估某个位置的棋型价值
function evaluatePosition(board, r, c, color, size) {
  if (board[r][c] !== color) return 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  let totalScore = 0;

  for (const [dr, dc] of dirs) {
    const { count, openEnds, blocks } = analyzeLine(board, r, c, dr, dc, color, size);

    if (count >= 5) totalScore += GOMOKU_SCORES.FIVE;
    else if (count === 4) {
      if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_FOUR;
      else if (openEnds === 1) totalScore += GOMOKU_SCORES.FOUR;
    } else if (count === 3) {
      if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_THREE;
      else if (openEnds === 1) totalScore += GOMOKU_SCORES.THREE;
    } else if (count === 2) {
      if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_TWO;
      else if (openEnds === 1) totalScore += GOMOKU_SCORES.TWO;
    } else if (count === 1) {
      if (openEnds === 2) totalScore += GOMOKU_SCORES.ONE;
    }
  }
  return totalScore;
}

// 评估整个棋盘（AI视角）
function evaluateBoard(board, aiColor, size) {
  let score = 0;
  const humanColor = aiColor === 1 ? 2 : 1;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === aiColor) {
        score += evaluatePosition(board, r, c, aiColor, size);
      } else if (board[r][c] === humanColor) {
        score -= evaluatePosition(board, r, c, humanColor, size) * 1.15;
      }
    }
  }

  // 位置价值加成：中心更有价值
  const center = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        const dist = Math.abs(r - center) + Math.abs(c - center);
        const posBonus = Math.max(0, 10 - dist);
        if (board[r][c] === aiColor) score += posBonus;
        else score -= posBonus;
      }
    }
  }

  return score;
}

// 获取候选位置（棋子周围2格内的空位）
function getCandidateMoves(board, size) {
  const candidates = new Set();
  const dirs = [-2, -1, 0, 1, 2];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        for (const dr of dirs) {
          for (const dc of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
              candidates.add(nr * size + nc);
            }
          }
        }
      }
    }
  }
  if (candidates.size === 0) candidates.add(7 * size + 7);
  return [...candidates].map(pos => [Math.floor(pos / size), pos % size]);
}

// 快速检查是否能赢
function checkWinFast(board, r, c, color, size) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let i = 1; i < 5; i++) { const nr = r + dr*i, nc = c + dc*i; if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) count++; else break; }
    for (let i = 1; i < 5; i++) { const nr = r - dr*i, nc = c - dc*i; if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) count++; else break; }
    if (count >= 5) return true;
  }
  return false;
}

// 极大极小搜索 + alpha-beta剪枝
function minimax(board, depth, alpha, beta, isMaximizing, aiColor, size) {
  const humanColor = aiColor === 1 ? 2 : 1;

  // 检查是否有赢家
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === aiColor && checkWinFast(board, r, c, aiColor, size)) return 1000000 + depth;
      if (board[r][c] === humanColor && checkWinFast(board, r, c, humanColor, size)) return -1000000 - depth;
    }
  }

  if (depth === 0) return evaluateBoard(board, aiColor, size);

  const candidates = getCandidateMoves(board, size);

  // 按走法质量排序（启发式）
  const scoredMoves = candidates.map(([r, c]) => {
    board[r][c] = isMaximizing ? aiColor : humanColor;
    const score = evaluateBoard(board, aiColor, size);
    board[r][c] = 0;
    return { r, c, score };
  }).sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { r, c } of scoredMoves) {
      board[r][c] = aiColor;
      const eval_ = minimax(board, depth - 1, alpha, beta, false, aiColor, size);
      board[r][c] = 0;
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { r, c } of scoredMoves) {
      board[r][c] = humanColor;
      const eval_ = minimax(board, depth - 1, alpha, beta, true, aiColor, size);
      board[r][c] = 0;
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// AI走棋
function getAIMove(board, aiColor, difficulty, size) {
  const depths = { easy: 2, medium: 3, hard: 5 };
  const depth = depths[difficulty] || 2;

  const candidates = getCandidateMoves(board, size);
  let bestMove = null;
  let bestScore = -Infinity;

  for (const [r, c] of candidates) {
    board[r][c] = aiColor;
    const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiColor, size);
    board[r][c] = 0;

    const randomFactor = difficulty === 'easy' ? (Math.random() * 40 - 20) : 0;

    if (score + randomFactor > bestScore) {
      bestScore = score + randomFactor;
      bestMove = [r, c];
    }
  }

  return bestMove || [7, 7];
}

// ==================== 围棋逻辑 ====================
function getGoLiberties(board, r, c, size) {
  const color = board[r][c];
  if (!color) return { liberties: 0, group: [] };
  const visited = new Set();
  let liberties = 0;
  const queue = [[r, c]];
  visited.add(r * size + c);
  const group = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr * size + nc;
      if (visited.has(key)) continue;
      if (board[nr][nc] === color) { visited.add(key); queue.push([nr, nc]); group.push([nr, nc]); }
      else if (board[nr][nc] === 0) liberties++;
    }
  }
  return { liberties, group };
}

function goRemoveCaptures(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  let captured = 0;
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (board[nr][nc] === opponent) {
      const { liberties, group } = getGoLiberties(board, nr, nc, size);
      if (liberties === 0) {
        group.forEach(([gr, gc]) => { board[gr][gc] = 0; captured++; });
      }
    }
  }
  const selfCheck = getGoLiberties(board, r, c, size);
  if (selfCheck.liberties === 0) {
    selfCheck.group.forEach(([gr, gc]) => { board[gr][gc] = 0; });
    return -1;
  }
  return captured;
}

function goCountTerritory(board, size) {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let blackScore = 0, whiteScore = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0 || visited[r][c]) continue;
      const region = [];
      const queue = [[r, c]];
      visited[r][c] = true;
      let borderColors = new Set();
      while (queue.length) {
        const [cr, cc] = queue.shift();
        region.push([cr, cc]);
        for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (visited[nr][nc]) continue;
          if (board[nr][nc] !== 0) { borderColors.add(board[nr][nc]); }
          else { visited[nr][nc] = true; queue.push([nr, nc]); }
        }
      }
      if (borderColors.size === 1) {
        const color = [...borderColors][0];
        if (color === 1) blackScore += region.length;
        else whiteScore += region.length;
      }
    }
  }
  return { black: blackScore, white: whiteScore };
}

// ==================== 围棋AI ====================
const GO_STAR_POINTS_19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
const GO_STAR_POINTS_15 = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
const GO_STAR_POINTS_13 = [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]];

// 获取所有合法落子位置
function goGetLegalMoves(board, color, size) {
  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) continue;
      const testBoard = board.map(row => [...row]);
      testBoard[r][c] = color;
      const captures = goRemoveCaptures(testBoard, r, c, color, size);
      if (captures === -1) continue;
      const { liberties } = getGoLiberties(testBoard, r, c, size);
      if (liberties > 0 || captures > 0) moves.push([r, c]);
    }
  }
  return moves;
}

// 检查是否是真眼
function isTrueEye(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  // 角点
  const isCorner = (r === 0 || r === size-1) && (c === 0 || c === size-1);
  // 边点
  const isEdge = r === 0 || r === size-1 || c === 0 || c === size-1;

  let friendlyCount = 0;
  let edgeCount = 0;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
      edgeCount++;
      continue;
    }
    if (board[nr][nc] === color) friendlyCount++;
    else if (board[nr][nc] === opponent) return false;
  }

  if (isCorner) return friendlyCount >= 2;
  if (isEdge) return friendlyCount >= 3;
  return friendlyCount >= 4;
}

// 计算棋子群的眼位
function countGroupEyes(board, group, color, size) {
  let eyes = 0;
  const eyeSet = new Set();
  for (const [r, c] of group) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
        const key = nr * size + nc;
        if (!eyeSet.has(key) && isTrueEye(board, nr, nc, color, size)) {
          eyeSet.add(key);
          eyes++;
        }
      }
    }
  }
  return eyes;
}

// 评估棋子群的死活
function evaluateGroupLife(board, group, color, size) {
  const { liberties } = getGoLiberties(board, group[0][0], group[0][1], size);
  const eyes = countGroupEyes(board, group, color, size);

  // 两眼活棋
  if (eyes >= 2) return 1000;
  // 一眼+足够气
  if (eyes === 1 && liberties > 3) return 500;
  // 气多
  if (liberties > 6) return 300;
  if (liberties > 4) return 200;
  if (liberties > 2) return 100;
  // 危险
  if (liberties === 1) return -100;
  return 0;
}

// 评估整个棋盘
function goEvaluateBoard(board, aiColor, size) {
  const opponent = aiColor === 1 ? 2 : 1;
  let score = 0;
  const visited = new Set();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        const key = r * size + c;
        if (visited.has(key)) continue;

        const { liberties, group } = getGoLiberties(board, r, c, size);
        const color = board[r][c];
        const groupScore = evaluateGroupLife(board, group, color, size);

        group.forEach(([gr, gc]) => visited.add(gr * size + gc));

        if (color === aiColor) {
          score += groupScore + liberties * 5;
        } else {
          score -= groupScore + liberties * 5;
        }
      }
    }
  }
  return score;
}

// 获取位置评分
function goPositionScore(r, c, size, moveCount) {
  let score = 0;
  if (moveCount < 20) {
    const starPoints = size === 19 ? GO_STAR_POINTS_19 : (size === 15 ? GO_STAR_POINTS_15 : GO_STAR_POINTS_13);
    for (const [sr, sc] of starPoints) {
      if (r === sr && c === sc) score += 100;
      else if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) score += 50;
    }
  }
  const center = (size - 1) / 2;
  const distToCenter = Math.abs(r - center) + Math.abs(c - center);
  score += Math.max(0, 10 - distToCenter);
  return score;
}

// AI走棋
function goGetAIMove(board, aiColor, difficulty, size) {
  const opponent = aiColor === 1 ? 2 : 1;
  const moves = goGetLegalMoves(board, aiColor, size);
  if (moves.length === 0) return null;

  // 第一手占角
  let isEmpty = true;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) { isEmpty = false; break; }
    }
    if (!isEmpty) break;
  }
  if (isEmpty) {
    const corners = size === 19 ? [[3,3],[3,15],[15,3],[15,15]] : (size === 15 ? [[3,3],[3,11],[11,3],[11,15]] : [[3,3],[3,9],[9,3],[9,9]]);
    return corners[Math.floor(Math.random() * corners.length)];
  }

  let bestMove = null;
  let bestScore = -Infinity;
  const moveCount = board.flat().filter(x => x !== 0).length;

  for (const [r, c] of moves) {
    const testBoard = board.map(row => [...row]);
    testBoard[r][c] = aiColor;
    const captures = goRemoveCaptures(testBoard, r, c, aiColor, size);
    if (captures === -1) continue;

    // 基础分：位置价值
    let score = goPositionScore(r, c, size, moveCount);

    // 吃子奖励
    if (captures > 0) score += captures * 80;

    // 气的评估
    const { liberties } = getGoLiberties(testBoard, r, c, size);
    score += liberties * 5;

    // 眼位评估
    const testGroup = getGoLiberties(testBoard, r, c, size).group;
    const eyes = countGroupEyes(testBoard, testGroup, aiColor, size);
    if (eyes >= 2) score += 500; // 做活奖励
    if (eyes === 1) score += 200;

    // 危险检测：如果这步棋后我方棋子气变少，减分
    if (liberties <= 2) score -= 100;

    // 普通模式：防守意识
    if (difficulty !== 'easy') {
      // 检查对手是否有吃子威胁
      let maxThreat = 0;
      const opponentMoves = goGetLegalMoves(testBoard, opponent, size);
      for (const [or, oc] of opponentMoves.slice(0, 15)) {
        const oppBoard = testBoard.map(row => [...row]);
        oppBoard[or][oc] = opponent;
        const oppCaptures = goRemoveCaptures(oppBoard, or, oc, opponent, size);
        if (oppCaptures > maxThreat) maxThreat = oppCaptures;
      }
      score -= maxThreat * 60;
    }

    // 困难模式：更深入评估
    if (difficulty === 'hard') {
      // 评估整体局势
      const boardScore = goEvaluateBoard(testBoard, aiColor, size);
      score += boardScore * 0.3;

      // 检查是否在切断对方
      const opponentGroups = new Set();
      for (let gr = 0; gr < size; gr++) {
        for (let gc = 0; gc < size; gc++) {
          if (testBoard[gr][gc] === opponent) {
            const key = gr * size + gc;
            if (!opponentGroups.has(key)) {
              const { group } = getGoLiberties(testBoard, gr, gc, size);
              if (group.length <= 3) score += 30; // 切断小棋群
              group.forEach(([gr2, gc2]) => opponentGroups.add(gr2 * size + gc2));
            }
          }
        }
      }
    }

    // 简单模式随机扰动
    if (difficulty === 'easy') score += Math.random() * 25 - 12;

    if (score > bestScore) {
      bestScore = score;
      bestMove = [r, c];
    }
  }

  return bestMove;
}

// ==================== 象棋逻辑 ====================
const CHESS_DIRS = { K: [[-1,0],[1,0],[0,-1],[0,1]], k: [[-1,0],[1,0],[0,-1],[0,1]] };
function getChessMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = piece === piece.toUpperCase() ? 2 : 1;
  const moves = [];
  const isRed = piece === piece.toLowerCase();
  const type = piece.toUpperCase();

  function inBoard(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function isEnemy(r, c) { const p = board[r][c]; return p && (p === p.toUpperCase()) === isRed; }
  function isEmpty(r, c) { return inBoard(r, c) && !board[r][c]; }
  function canGo(r, c) { return inBoard(r, c) && (isEmpty(r, c) || isEnemy(r, c)); }

  if (type === 'K') {
    const [minR, maxR] = isRed ? [7, 9] : [0, 2];
    const [minC, maxC] = [3, 5];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= minR && nr <= maxR && nc >= minC && nc <= maxC && canGo(nr, nc)) moves.push([nr, nc]);
    }
    const opponent = isRed ? 'K' : 'k';
    for (let i = r + (isRed ? -1 : 1); ; i += (isRed ? -1 : 1)) {
      if (i < 0 || i >= 10) break;
      if (board[i][c]) { if (board[i][c] === opponent) moves.push([i, c]); break; }
    }
  } else if (type === 'A') {
    const [minR, maxR] = isRed ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5 && canGo(nr, nc)) moves.push([nr, nc]);
    }
  } else if (type === 'B') {
    const [minR, maxR] = isRed ? [5, 9] : [0, 4];
    for (const [dr, dc] of [[-2,-2],[-2,2],[2,-2],[2,2]]) {
      const nr = r + dr, nc = c + dc;
      const er = r + dr/2, ec = c + dc/2;
      if (nr >= minR && nr <= maxR && nc >= 0 && nc < 9 && !board[er][ec] && canGo(nr, nc)) moves.push([nr, nc]);
    }
  } else if (type === 'N') {
    for (const [dr, dc, br, bc] of [[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[-1,2,0,1],[1,-2,0,-1],[1,2,0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (inBoard(nr, nc) && !board[r + br][c + bc] && canGo(nr, nc)) moves.push([nr, nc]);
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for (let i = 1; i < 10; i++) {
        const nr = r + dr*i, nc = c + dc*i;
        if (!inBoard(nr, nc)) break;
        if (isEmpty(nr, nc)) moves.push([nr, nc]);
        else { if (isEnemy(nr, nc)) moves.push([nr, nc]); break; }
      }
    }
  } else if (type === 'C') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let jumped = false;
      for (let i = 1; i < 10; i++) {
        const nr = r + dr*i, nc = c + dc*i;
        if (!inBoard(nr, nc)) break;
        if (!jumped) {
          if (isEmpty(nr, nc)) moves.push([nr, nc]);
          else jumped = true;
        } else {
          if (!isEmpty(nr, nc)) { if (isEnemy(nr, nc)) moves.push([nr, nc]); break; }
        }
      }
    }
  } else if (type === 'P') {
    const forward = isRed ? -1 : 1;
    const crossed = isRed ? r <= 4 : r >= 5;
    if (inBoard(r + forward, c) && canGo(r + forward, c)) moves.push([r + forward, c]);
    if (crossed) {
      if (inBoard(r, c - 1) && canGo(r, c - 1)) moves.push([r, c - 1]);
      if (inBoard(r, c + 1) && canGo(r, c + 1)) moves.push([r, c + 1]);
    }
  }
  return moves;
}

function chessFindKing(board, color) {
  const king = color === 1 ? 'k' : 'K';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (board[r][c] === king) return [r, c];
  return null;
}

function chessIsAttacked(board, r, c, byColor) {
  for (let rr = 0; rr < 10; rr++) for (let cc = 0; cc < 9; cc++) {
    const p = board[rr][cc];
    if (!p) continue;
    const pColor = p === p.toUpperCase() ? 2 : 1;
    if (pColor !== byColor) continue;
    const moves = getChessMoves(board, rr, cc);
    if (moves.some(([mr, mc]) => mr === r && mc === c)) return true;
  }
  return false;
}

function chessInCheck(board, color) {
  const king = chessFindKing(board, color);
  if (!king) return true;
  return chessIsAttacked(board, king[0], king[1], color === 1 ? 2 : 1);
}

function chessHasLegalMove(board, color) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = board[r][c]; if (!p) continue;
    const pColor = p === p.toUpperCase() ? 2 : 1;
    if (pColor !== color) continue;
    const moves = getChessMoves(board, r, c);
    for (const [nr, nc] of moves) {
      const saved = board[nr][nc];
      board[nr][nc] = p; board[r][c] = '';
      const ok = !chessInCheck(board, color);
      board[r][c] = p; board[nr][nc] = saved;
      if (ok) return true;
    }
  }
  return false;
}

// ==================== 中国象棋AI ====================
// 棋子基础价值
const CHESS_PIECE_VALUE = { K: 10000, A: 200, B: 200, N: 300, R: 1000, C: 500, P: 100 };

// 棋子位置价值表
const POS_VALUE = {
  P: [ // 兵/卒位置价值
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[1,0,1,0,1,0,1,0,1],
    [2,0,2,0,2,0,2,0,2],[3,5,6,7,8,7,6,5,3],
    [5,8,9,10,12,10,9,8,5],[8,12,14,16,18,16,14,12,8],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]
  ],
  N: [ // 马位置价值
    [0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0],
    [0,1,2,1,0,1,2,1,0],[0,1,2,2,2,2,2,1,0],
    [0,1,2,3,3,3,2,1,0],[0,1,2,3,4,3,2,1,0],
    [0,1,2,3,3,3,2,1,0],[0,1,2,2,2,2,2,1,0],
    [0,0,1,0,0,0,1,0,0],[0,0,0,0,0,0,0,0,0]
  ],
  R: [ // 车位置价值
    [0,0,0,0,0,0,0,0,0],[2,3,3,4,5,4,3,3,2],
    [2,3,3,4,5,4,3,3,2],[2,3,4,5,5,5,4,3,2],
    [2,3,4,5,6,5,4,3,2],[2,3,4,5,6,5,4,3,2],
    [2,3,4,5,5,5,4,3,2],[2,3,3,4,5,4,3,3,2],
    [2,3,3,4,5,4,3,3,2],[2,3,3,4,5,4,3,3,2]
  ],
  C: [ // 炮位置价值
    [0,0,0,0,0,0,0,0,0],[2,2,2,3,3,3,2,2,2],
    [2,2,2,2,3,2,2,2,2],[2,2,3,3,3,3,3,2,2],
    [2,3,3,3,4,3,3,3,2],[2,3,3,3,4,3,3,3,2],
    [2,2,3,3,3,3,3,2,2],[2,2,2,2,3,2,2,2,2],
    [2,2,2,3,3,3,2,2,2],[0,0,0,0,0,0,0,0,0]
  ],
  K: [ // 将/帅位置价值
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,1,1,1,0,0,0],
    [0,0,0,2,2,2,0,0,0],[0,0,0,3,3,3,0,0,0]
  ],
  A: [ // 士/仕位置价值
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,1,0,1,0,0,0],
    [0,0,0,0,2,0,0,0,0],[0,0,0,1,0,1,0,0,0]
  ],
  B: [ // 象/相位置价值
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,1,0,0,0,1,0,0],[0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0]
  ]
};

// 获取棋子价值（含位置）
function chessPieceValue(piece, r, c) {
  if (!piece) return 0;
  const isRed = piece === piece.toLowerCase();
  const type = piece.toUpperCase();
  let val = CHESS_PIECE_VALUE[type] || 0;
  if (POS_VALUE[type]) {
    const pr = isRed ? (9 - r) : r;
    val += POS_VALUE[type][pr][c];
  }
  return isRed ? val : -val;
}

// 评估棋盘（AI视角，正值对AI有利）
function chessEvaluateBoard(board, aiColor) {
  let score = 0;
  const opponent = aiColor === 1 ? 2 : 1;
  let aiPieces = 0, opponentPieces = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c]) {
        const piece = board[r][c];
        const isRed = piece === piece.toLowerCase();
        const pieceColor = isRed ? 1 : 2;
        const val = chessPieceValue(piece, r, c);
        if (pieceColor === aiColor) {
          score += Math.abs(val);
          aiPieces++;
        } else {
          score -= Math.abs(val);
          opponentPieces++;
        }
        // 将军威胁加分
        if (piece.toUpperCase() === 'K') {
          const opponent2 = pieceColor === 1 ? 2 : 1;
          if (chessIsAttacked(board, r, c, opponent2)) {
            if (pieceColor === aiColor) score -= 200;
            else score += 200;
          }
        }
      }
    }
  }

  // 子力优势额外加分
  if (aiPieces > opponentPieces + 2) score += 100;
  if (opponentPieces > aiPieces + 2) score -= 100;

  return score;
}

// 获取所有合法走法
function chessGetAllLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      const pColor = p === p.toUpperCase() ? 2 : 1;
      if (pColor !== color) continue;
      const pieceMoves = getChessMoves(board, r, c);
      for (const [nr, nc] of pieceMoves) {
        const saved = board[nr][nc];
        board[nr][nc] = p; board[r][c] = '';
        if (!chessInCheck(board, color)) {
          moves.push([r, c, nr, nc]);
        }
        board[r][c] = p; board[nr][nc] = saved;
      }
    }
  }
  return moves;
}

// 走法排序（提高剪枝效率）
function sortMoves(board, moves) {
  return moves.map(([fr, fc, tr, tc]) => {
    let score = 0;
    const captured = board[tr][tc];
    if (captured) score += CHESS_PIECE_VALUE[captured.toUpperCase()] || 0;
    // 将军加分
    const piece = board[fr][fc];
    board[tr][tc] = piece; board[fr][fc] = '';
    const isRed = piece === piece.toLowerCase();
    const color = isRed ? 1 : 2;
    const opponent = color === 1 ? 2 : 1;
    if (chessInCheck(board, opponent)) score += 500;
    board[fr][fc] = piece; board[tr][tc] = captured;
    return { fr, fc, tr, tc, score };
  }).sort((a, b) => b.score - a.score);
}

// 极大极小搜索 + alpha-beta剪枝
function chessMinimax(board, depth, alpha, beta, isMaximizing, aiColor) {
  const opponent = aiColor === 1 ? 2 : 1;
  const currentColor = isMaximizing ? aiColor : opponent;

  if (!chessHasLegalMove(board, currentColor)) {
    const king = chessFindKing(board, currentColor);
    if (king && chessIsAttacked(board, king[0], king[1], opponent)) {
      return isMaximizing ? -99999 + depth : 99999 - depth;
    }
    return 0; // 和棋
  }

  if (depth === 0) return chessEvaluateBoard(board, aiColor);

  const moves = chessGetAllLegalMoves(board, currentColor);
  if (moves.length === 0) return chessEvaluateBoard(board, aiColor);

  // 走法排序
  const sortedMoves = sortMoves(board, moves);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { fr, fc, tr, tc } of sortedMoves) {
      const piece = board[fr][fc];
      const captured = board[tr][tc];
      board[tr][tc] = piece; board[fr][fc] = '';
      const eval_ = chessMinimax(board, depth - 1, alpha, beta, false, aiColor);
      board[fr][fc] = piece; board[tr][tc] = captured;
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { fr, fc, tr, tc } of sortedMoves) {
      const piece = board[fr][fc];
      const captured = board[tr][tc];
      board[tr][tc] = piece; board[fr][fc] = '';
      const eval_ = chessMinimax(board, depth - 1, alpha, beta, true, aiColor);
      board[fr][fc] = piece; board[tr][tc] = captured;
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// AI走棋
function chessGetAIMove(board, aiColor, difficulty) {
  const depths = { easy: 2, medium: 3, hard: 4 };
  const depth = depths[difficulty] || 2;

  const moves = chessGetAllLegalMoves(board, aiColor);
  if (moves.length === 0) return null;

  // 走法排序
  const sortedMoves = sortMoves(board, moves);

  let bestMove = null;
  let bestScore = -Infinity;

  for (const { fr, fc, tr, tc } of sortedMoves) {
    const piece = board[fr][fc];
    const captured = board[tr][tc];
    board[tr][tc] = piece; board[fr][fc] = '';
    const score = chessMinimax(board, depth - 1, -Infinity, Infinity, false, aiColor);
    board[fr][fc] = piece; board[tr][tc] = captured;

    const randomFactor = difficulty === 'easy' ? (Math.random() * 40 - 20) : 0;

    if (score + randomFactor > bestScore) {
      bestScore = score + randomFactor;
      bestMove = [fr, fc, tr, tc];
    }
  }

  return bestMove;
}

// ==================== WebSocket ====================
// 心跳检测：30秒发一次ping，10秒内没收到pong则断开
const WS_PING_INTERVAL = 30000;
const WS_PONG_TIMEOUT = 10000;

wss.on('connection', (ws) => {
  let currentRoom = null;
  let isAlive = true;
  let authenticated = false;

  // 心跳检测：标记为等待pong
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Token认证：连接后必须在5秒内发送join消息并携带有效token
  const authTimer = setTimeout(() => {
    if (!authenticated) {
      ws.send(JSON.stringify({ type: 'error', msg: '认证超时，连接将断开' }));
      ws.close();
    }
  }, 5000);

  ws.on('message', async (raw) => {
    try {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // 心跳响应
    if (msg.type === 'pong') {
      ws.isAlive = true;
      return;
    }

    // 只有join消息需要token，其他消息需要已认证
    if (msg.type !== 'join' && !authenticated) {
      ws.send(JSON.stringify({ type: 'error', msg: '未认证，请重新连接' }));
      return;
    }

    if (msg.type === 'join') {
      // 验证token
      if (!msg.token) {
        ws.send(JSON.stringify({ type: 'error', msg: '请先登录' }));
        ws.close();
        clearTimeout(authTimer);
        return;
      }

      try {
        const tokenDoc = await Token.findOne({ token: msg.token });
        if (!tokenDoc) {
          ws.send(JSON.stringify({ type: 'error', msg: '登录已过期，请重新登录' }));
          ws.close();
          clearTimeout(authTimer);
          return;
        }
        // 验证用户名匹配
        if (tokenDoc.username !== msg.name) {
          ws.send(JSON.stringify({ type: 'error', msg: '用户名与登录信息不匹配' }));
          ws.close();
          clearTimeout(authTimer);
          return;
        }
        authenticated = true;
        clearTimeout(authTimer);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', msg: '认证失败' }));
        ws.close();
        clearTimeout(authTimer);
        return;
      }

      const roomId = msg.room || 'default';
      const name = msg.name || '游客';
      isBanned(name).then(ban => {
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
        if (room.mode === 'pve' && room.players.length === 1) {
          // 人机对战模式，立即添加AI对手
          const aiColor = color === 1 ? 2 : 1;
          room.aiColor = aiColor;
          room.names[aiColor] = 'AI (' + (room.difficulty === 'easy' ? '简单' : room.difficulty === 'medium' ? '普通' : '困难') + ')';
          room.players.push({ ws: null, color: aiColor, isAI: true });
          room.started = true; room.choosing = true;
          broadcast(room, { type: 'names', names: room.names, gameType: room.gameType });
          const p1 = room.players.find(p => p.color === 1);
          if (p1 && p1.ws) {
            p1.ws.send(JSON.stringify({ type: 'choose_first' }));
            broadcast(room, { type: 'waiting_choice' });
          }
        } else if (room.players.length === 2) {
          room.started = true; room.choosing = true;
          broadcast(room, { type: 'names', names: room.names, gameType: room.gameType });
          const p1 = room.players.find(p => p.color === 1);
          if (p1 && p1.ws) {
            p1.ws.send(JSON.stringify({ type: 'choose_first' }));
            broadcast(room, { type: 'waiting_choice' });
          }
        }
      }).catch(err => { console.error('封号检查错误:', err.message); });
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
      // 人机对战模式下，如果AI是黑棋，让AI先走
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1 && currentRoom.gameType === 'gomoku') {
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = getAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
          if (aiMove) {
            const [aiR, aiC] = aiMove;
            currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]) });
            currentRoom.board[aiR][aiC] = currentRoom.aiColor;
            currentRoom.moveCount++;
            currentRoom.lastMove = [aiR, aiC];
            const aiWin = checkGomokuWin(currentRoom.board, aiR, aiC, currentRoom.aiColor);
            currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
            broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, win: aiWin ? currentRoom.aiColor : 0, lastMove: [aiR, aiC] });
            if (aiWin) {
              currentRoom.gameOver = true; stopTimer(currentRoom);
              const humanColor = currentRoom.aiColor === 1 ? 2 : 1;
              const wName = currentRoom.names[currentRoom.aiColor], lName = currentRoom.names[humanColor];
              broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: '五子连珠', winnerName: wName, loserName: lName });
              if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'gomoku');
              cleanupRoom(currentRoom);
            }
          }
        }, 500);
      }
      // 人机对战模式下，如果AI是中国象棋红棋，让AI先走
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1 && currentRoom.gameType === 'chess') {
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = chessGetAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty);
          if (aiMove) {
            const [aiFr, aiFc, aiTr, aiTc] = aiMove;
            const aiPiece = currentRoom.board[aiFr][aiFc];
            const aiSaved = currentRoom.board.map(row => [...row]);
            const aiCaptured = currentRoom.board[aiTr][aiTc];
            currentRoom.board[aiTr][aiTc] = aiPiece; currentRoom.board[aiFr][aiFc] = '';
            currentRoom.moveHistory.push({ type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, captured: aiCaptured, board: aiSaved });
            currentRoom.lastMove = [aiTr, aiTc]; currentRoom.moveCount++;
            const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
            currentRoom.turn = aiOpponent;
            broadcast(currentRoom, { type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, turn: currentRoom.turn, captured: aiCaptured, lastMove: [aiTr, aiTc], board: currentRoom.board });
            if (!chessHasLegalMove(currentRoom.board, aiOpponent)) {
              currentRoom.gameOver = true; stopTimer(currentRoom);
              const wName = currentRoom.names[currentRoom.aiColor], lName = currentRoom.names[aiOpponent];
              broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: chessInCheck(currentRoom.board, aiOpponent) ? '将杀' : '困毙', winnerName: wName, loserName: lName });
              if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), 'chess');
              cleanupRoom(currentRoom);
            }
          }
        }, 500);
      }
    }

    if (msg.type === 'move' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.turn !== myColor) return;

      if (currentRoom.gameType === 'gomoku') {
        const { r, c } = msg;
        if (r < 0 || r >= currentRoom.size || c < 0 || c >= currentRoom.size) return;
        if (currentRoom.board[r][c] !== 0) return;
        currentRoom.moveHistory.push({ type: 'move', r, c, color: myColor, board: currentRoom.board.map(row => [...row]) });
        currentRoom.board[r][c] = myColor;
        currentRoom.moveCount++;
        currentRoom.lastMove = [r, c];
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
          // 人机对战，AI走棋
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = getAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
            if (aiMove) {
              const [aiR, aiC] = aiMove;
              currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]) });
              currentRoom.board[aiR][aiC] = currentRoom.aiColor;
              currentRoom.moveCount++;
              currentRoom.lastMove = [aiR, aiC];
              const aiWin = checkGomokuWin(currentRoom.board, aiR, aiC, currentRoom.aiColor);
              currentRoom.turn = currentRoom.aiColor === 1 ? 2 : 1;
              broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, win: aiWin ? currentRoom.aiColor : 0, lastMove: [aiR, aiC] });
              if (aiWin) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const humanColor = currentRoom.aiColor === 1 ? 2 : 1;
                const wName = currentRoom.names[currentRoom.aiColor], lName = currentRoom.names[humanColor];
                broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: '五子连珠', winnerName: wName, loserName: lName });
                if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'gomoku');
                cleanupRoom(currentRoom);
              }
            }
          }, 500); // AI延迟500ms走棋，模拟思考
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
        // 人机对战，AI走棋
        if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = goGetAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
            if (aiMove) {
              const [aiR, aiC] = aiMove;
              const aiTestBoard = currentRoom.board.map(row => [...row]);
              aiTestBoard[aiR][aiC] = currentRoom.aiColor;
              const aiResult = goRemoveCaptures(aiTestBoard, aiR, aiC, currentRoom.aiColor, currentRoom.size);
              if (aiResult === -1) return;
              currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]), goCaptures: [...currentRoom.goCaptures] });
              currentRoom.board[aiR][aiC] = currentRoom.aiColor;
              goRemoveCaptures(currentRoom.board, aiR, aiC, currentRoom.aiColor, currentRoom.size);
              const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
              currentRoom.goCaptures[currentRoom.aiColor - 1] += aiResult;
              currentRoom.lastMove = [aiR, aiC]; currentRoom.moveCount++; currentRoom.passCount = 0;
              currentRoom.turn = aiOpponent;
              broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, lastMove: [aiR, aiC], goCaptures: currentRoom.goCaptures, board: currentRoom.board.map(row => [...row]) });
            } else {
              // AI无合法走法，pass
              currentRoom.passCount = (currentRoom.passCount || 0) + 1;
              currentRoom.moveHistory.push({ type: 'pass', color: currentRoom.aiColor });
              const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
              currentRoom.turn = aiOpponent;
              broadcast(currentRoom, { type: 'pass', color: currentRoom.aiColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
              if (currentRoom.passCount >= 2) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const territory = goCountTerritory(currentRoom.board, currentRoom.size);
                const black = currentRoom.goCaptures[0] + territory.black;
                const white = currentRoom.goCaptures[1] + territory.white;
                let winner, reason;
                if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
                else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
                else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
                const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
                const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
                broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
                if (winner !== 0 && wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'go');
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
        if (!moves.some(([mr, mc]) => mr === tr && mc === tc)) {
          // 检查炮的特殊规则
          if (piece.toUpperCase() === 'C') {
            const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
            if ((Math.abs(tr - fr) > 0 && Math.abs(tc - fc) > 0)) {
              return ws.send(JSON.stringify({ type: 'error', msg: '炮只能直线移动' }));
            }
            let jumped = false;
            for (let i = 1; i < 10; i++) {
              const nr = fr + dr * i, nc = fc + dc * i;
              if (nr < 0 || nr >= 10 || nc < 0 || nc >= 9) break;
              if (!jumped) {
                if (currentRoom.board[nr][nc]) jumped = true;
              } else {
                if (currentRoom.board[nr][nc]) {
                  if (currentRoom.board[nr][nc] !== piece && (currentRoom.board[nr][nc] === currentRoom.board[nr][nc].toUpperCase()) !== isRed) {
                    break; // valid capture attempt but blocked
                  }
                  break;
                }
              }
            }
            return ws.send(JSON.stringify({ type: 'error', msg: '炮需要跳过恰好一个棋子才能吃子' }));
          }
          return ws.send(JSON.stringify({ type: 'error', msg: '不能这样走' }));
        }
        const saved = currentRoom.board.map(row => [...row]);
        const captured = currentRoom.board[tr][tc];
        currentRoom.board[tr][tc] = piece; currentRoom.board[fr][fc] = '';
        if (chessInCheck(currentRoom.board, myColor)) {
          currentRoom.board[fr][fc] = piece; currentRoom.board[tr][tc] = captured;
          return ws.send(JSON.stringify({ type: 'error', msg: '不能送将' }));
        }
        currentRoom.moveHistory.push({ type: 'move', fr, fc, tr, tc, color: myColor, captured, board: saved });
        currentRoom.lastMove = [tr, tc]; currentRoom.moveCount++;
        const opponent = myColor === 1 ? 2 : 1;
        currentRoom.turn = opponent;
        broadcast(currentRoom, { type: 'move', fr, fc, tr, tc, color: myColor, turn: currentRoom.turn, captured, lastMove: [tr, tc], board: currentRoom.board });
        if (!chessHasLegalMove(currentRoom.board, opponent)) {
          currentRoom.gameOver = true; stopTimer(currentRoom);
          const wName = currentRoom.names[myColor], lName = currentRoom.names[opponent];
          broadcast(currentRoom, { type: 'game_over', winner: myColor, reason: chessInCheck(currentRoom.board, opponent) ? '将杀' : '困毙', winnerName: wName, loserName: lName });
          if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), 'chess');
          cleanupRoom(currentRoom);
        } else if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
          // 人机对战，AI走棋
          setTimeout(() => {
            if (currentRoom.gameOver) return;
            const aiMove = chessGetAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty);
            if (aiMove) {
              const [aiFr, aiFc, aiTr, aiTc] = aiMove;
              const aiPiece = currentRoom.board[aiFr][aiFc];
              const aiSaved = currentRoom.board.map(row => [...row]);
              const aiCaptured = currentRoom.board[aiTr][aiTc];
              currentRoom.board[aiTr][aiTc] = aiPiece; currentRoom.board[aiFr][aiFc] = '';
              currentRoom.moveHistory.push({ type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, captured: aiCaptured, board: aiSaved });
              currentRoom.lastMove = [aiTr, aiTc]; currentRoom.moveCount++;
              const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
              currentRoom.turn = aiOpponent;
              broadcast(currentRoom, { type: 'move', fr: aiFr, fc: aiFc, tr: aiTr, tc: aiTc, color: currentRoom.aiColor, turn: currentRoom.turn, captured: aiCaptured, lastMove: [aiTr, aiTc], board: currentRoom.board });
              if (!chessHasLegalMove(currentRoom.board, aiOpponent)) {
                currentRoom.gameOver = true; stopTimer(currentRoom);
                const wName = currentRoom.names[currentRoom.aiColor], lName = currentRoom.names[aiOpponent];
                broadcast(currentRoom, { type: 'game_over', winner: currentRoom.aiColor, reason: chessInCheck(currentRoom.board, aiOpponent) ? '将杀' : '困毙', winnerName: wName, loserName: lName });
                if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), 'chess');
                cleanupRoom(currentRoom);
              }
            }
          }, 500);
        }
      }
    }

    if (msg.type === 'pass' && currentRoom && !currentRoom.gameOver && currentRoom.gameType === 'go') {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.turn !== myColor) return;
      currentRoom.passCount = (currentRoom.passCount || 0) + 1;
      currentRoom.moveHistory.push({ type: 'pass', color: myColor });
      currentRoom.turn = myColor === 1 ? 2 : 1;
      broadcast(currentRoom, { type: 'pass', color: myColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
      if (currentRoom.passCount >= 2) {
        currentRoom.gameOver = true; stopTimer(currentRoom);
        const territory = goCountTerritory(currentRoom.board, currentRoom.size);
        const black = currentRoom.goCaptures[0] + territory.black;
        const white = currentRoom.goCaptures[1] + territory.white;
        let winner, reason;
        if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
        else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
        else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
        const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
        const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
        broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
        if (winner !== 0 && wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'go');
        cleanupRoom(currentRoom);
      } else if (currentRoom.mode === 'pve' && currentRoom.turn === currentRoom.aiColor) {
        // 人机对战，AI响应pass
        setTimeout(() => {
          if (currentRoom.gameOver) return;
          const aiMove = goGetAIMove(currentRoom.board, currentRoom.aiColor, currentRoom.difficulty, currentRoom.size);
          if (aiMove) {
            const [aiR, aiC] = aiMove;
            const aiTestBoard = currentRoom.board.map(row => [...row]);
            aiTestBoard[aiR][aiC] = currentRoom.aiColor;
            const aiResult = goRemoveCaptures(aiTestBoard, aiR, aiC, currentRoom.aiColor, currentRoom.size);
            if (aiResult === -1) return;
            currentRoom.moveHistory.push({ type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, board: currentRoom.board.map(row => [...row]), goCaptures: [...currentRoom.goCaptures] });
            currentRoom.board[aiR][aiC] = currentRoom.aiColor;
            goRemoveCaptures(currentRoom.board, aiR, aiC, currentRoom.aiColor, currentRoom.size);
            const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
            currentRoom.goCaptures[currentRoom.aiColor - 1] += aiResult;
            currentRoom.lastMove = [aiR, aiC]; currentRoom.moveCount++; currentRoom.passCount = 0;
            currentRoom.turn = aiOpponent;
            broadcast(currentRoom, { type: 'move', r: aiR, c: aiC, color: currentRoom.aiColor, turn: currentRoom.turn, lastMove: [aiR, aiC], goCaptures: currentRoom.goCaptures, board: currentRoom.board.map(row => [...row]) });
          } else {
            // AI也pass
            currentRoom.passCount = (currentRoom.passCount || 0) + 1;
            currentRoom.moveHistory.push({ type: 'pass', color: currentRoom.aiColor });
            const aiOpponent = currentRoom.aiColor === 1 ? 2 : 1;
            currentRoom.turn = aiOpponent;
            broadcast(currentRoom, { type: 'pass', color: currentRoom.aiColor, turn: currentRoom.turn, board: currentRoom.board.map(row => [...row]) });
            if (currentRoom.passCount >= 2) {
              currentRoom.gameOver = true; stopTimer(currentRoom);
              const territory = goCountTerritory(currentRoom.board, currentRoom.size);
              const black = currentRoom.goCaptures[0] + territory.black;
              const white = currentRoom.goCaptures[1] + territory.white;
              let winner, reason;
              if (black > white) { winner = 1; reason = `黑方 ${black} 目 vs 白方 ${white} 目，黑方胜`; }
              else if (white > black) { winner = 2; reason = `白方 ${white} 目 vs 黑方 ${black} 目，白方胜`; }
              else { winner = 0; reason = `黑方 ${black} 目 vs 白方 ${white} 目，平局`; }
              const wName = winner === 0 ? '平局' : currentRoom.names[winner] || '';
              const lName = winner === 0 ? '' : currentRoom.names[winner === 1 ? 2 : 1] || '';
              broadcast(currentRoom, { type: 'game_over', winner, reason, winnerName: wName, loserName: lName, black, white });
              if (winner !== 0 && wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, color: m.color })), 'go');
              cleanupRoom(currentRoom);
            }
          }
        }, 500);
      }
    }

    if (msg.type === 'resign' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      currentRoom.gameOver = true; stopTimer(currentRoom);
      const winner = myColor === 1 ? 2 : 1;
      const wName = currentRoom.names[winner], lName = currentRoom.names[myColor];
      broadcast(currentRoom, { type: 'game_over', winner, reason: '认输', winnerName: wName, loserName: lName });
      if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), currentRoom.gameType);
      cleanupRoom(currentRoom);
    }

    if (msg.type === 'undo_request' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.undoCount[myColor - 1] >= 3) { ws.send(JSON.stringify({ type: 'error', msg: '每局最多悔棋3次' })); return; }
      if (currentRoom.moveHistory.length === 0) { ws.send(JSON.stringify({ type: 'error', msg: '没有可悔棋的步骤' })); return; }
      if (currentRoom.pendingUndo) { ws.send(JSON.stringify({ type: 'error', msg: '已有待处理的悔棋请求' })); return; }
      currentRoom.pendingUndo = { from: myColor };
      const opponent = myColor === 1 ? 2 : 1;
      const opWs = currentRoom.players.find(p => p.color === opponent);
      if (opWs) opWs.ws.send(JSON.stringify({ type: 'undo_request', from: myColor, fromName: currentRoom.names[myColor] }));
      ws.send(JSON.stringify({ type: 'undo_sent' }));
    }

    if (msg.type === 'undo_response' && currentRoom && currentRoom.pendingUndo) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (myColor !== (currentRoom.pendingUndo.from === 1 ? 2 : 1)) return;
      if (msg.approve) {
        const steps = currentRoom.gameType === 'chess' ? 1 : 1;
        for (let i = 0; i < steps && currentRoom.moveHistory.length > 0; i++) {
          const last = currentRoom.moveHistory.pop();
          if (last.board) currentRoom.board = last.board.map(row => [...row]);
          if (last.goCaptures) currentRoom.goCaptures = [...last.goCaptures];
          currentRoom.moveCount--;
        }
        const requesterColor = currentRoom.pendingUndo.from;
        currentRoom.undoCount[requesterColor - 1]++;
        currentRoom.turn = requesterColor;
        currentRoom.lastMove = null;
        broadcast(currentRoom, { type: 'undo_approved', turn: currentRoom.turn, board: currentRoom.board, moveCount: currentRoom.moveCount });
      } else {
        broadcast(currentRoom, { type: 'undo_rejected' });
      }
      currentRoom.pendingUndo = null;
    }

    if (msg.type === 'draw_request' && currentRoom && !currentRoom.gameOver) {
      const myColor = getPlayerColor(currentRoom, ws);
      if (currentRoom.drawCount[myColor - 1] >= 3) { ws.send(JSON.stringify({ type: 'error', msg: '每局最多求和3次' })); return; }
      if (currentRoom.pendingDraw) { ws.send(JSON.stringify({ type: 'error', msg: '已有待处理的求和请求' })); return; }
      currentRoom.pendingDraw = { from: myColor };
      const opponent = myColor === 1 ? 2 : 1;
      const opWs = currentRoom.players.find(p => p.color === opponent);
      if (opWs) opWs.ws.send(JSON.stringify({ type: 'draw_request', from: myColor, fromName: currentRoom.names[myColor] }));
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
        const requesterColor = currentRoom.pendingDraw.from;
        currentRoom.drawCount[requesterColor - 1]++;
        broadcast(currentRoom, { type: 'draw_rejected' });
      }
      currentRoom.pendingDraw = null;
    }

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
      const blackPlayer = currentRoom.players.find(p => p.color === 1);
      if (currentRoom.mode === 'pve' && currentRoom.aiColor === 1) {
        // AI是黑棋，让人类玩家选择先手
        const humanPlayer = currentRoom.players.find(p => !p.isAI);
        if (humanPlayer && humanPlayer.ws) humanPlayer.ws.send(JSON.stringify({ type: 'choose_first' }));
      } else if (blackPlayer && blackPlayer.ws) {
        blackPlayer.ws.send(JSON.stringify({ type: 'choose_first' }));
      }
      broadcast(currentRoom, { type: 'waiting_choice' });
    }

    if (msg.type === 'chat' && currentRoom) {
      const playerColor = getPlayerColor(currentRoom, ws);
      const username = currentRoom.names[playerColor] || '';
      // 禁言检查
      if (isMuted(username)) {
        ws.send(JSON.stringify({ type: 'chat', color: 0, text: '系统：你已被临时禁言，请稍后再试' }));
        return;
      }
      let text = String(msg.text || '').substring(0, 200);
      const { text: filteredText, filtered, blockCount, warnMatched } = filterSensitive(text);

      // 触发3次以上强制拦截词 → 临时禁言10分钟
      if (blockCount >= 3) {
        muteUser(username, 10);
        ws.send(JSON.stringify({ type: 'chat', color: 0, text: '系统：消息含多次违规内容，你已被临时禁言10分钟' }));
        // 仍然记录日志，但不广播
        await ChatLog.create({
          id: crypto.randomBytes(8).toString('hex'),
          roomId: currentRoom.id,
          username,
          color: playerColor,
          text: filteredText,
          filtered: true,
          alert: warnMatched,
          time: new Date().toISOString()
        });
        return;
      }

      if (filtered) {
        ws.send(JSON.stringify({ type: 'chat', color: 0, text: '系统：消息包含敏感词，已过滤处理' }));
      }
      await ChatLog.create({
        id: crypto.randomBytes(8).toString('hex'),
        roomId: currentRoom.id,
        username,
        color: playerColor,
        text: filteredText,
        filtered,
        alert: warnMatched,
        time: new Date().toISOString()
      });
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
        const wName = currentRoom.names[winner] || '', lName = currentRoom.names[myColor] || '';
        broadcast(currentRoom, { type: 'game_over', winner, reason: '对手离开', winnerName: wName, loserName: lName });
        if (wName && lName && wName !== lName) recordGame(wName, lName, currentRoom.moveCount, currentRoom.moveHistory.map(m => ({ type: m.type, r: m.r, c: m.c, fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc, color: m.color })), currentRoom.gameType);
      } else {
        broadcast(currentRoom, { type: 'opponent_left' });
      }
      if (currentRoom.players.length === 0) { cleanupRoom(currentRoom); rooms.delete(currentRoom.id); }
    }
  });
});

// ==================== 管理员 API ====================
const ADMIN_KEY = process.env.ADMIN_KEY;
function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (h.replace('Bearer ', '') !== ADMIN_KEY) return res.status(403).json({ error: '无管理员权限' });
  next();
}

// 管理员查看房间
app.get('/api/admin/rooms', adminAuth, (req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    if (room.players.length === 0) continue;
    list.push({
      id, gameType: room.gameType, moveCount: room.moveCount, turn: room.turn, started: room.started, gameOver: room.gameOver,
      size: room.size, names: { 1: room.names[1] || '等待中', 2: room.names[2] || '等待中' },
      board: room.board.map(row => [...row]),
    });
  }
  res.json(list);
});

// 管理员查看待处理举报
app.get('/api/admin/reports', adminAuth, async (req, res) => {
  const reports = await Report.find({ status: 'pending' }).lean();
  res.json(reports);
});

// 管理员确认举报
const reportTypeNames2 = { boost: '刷胜率/放水', cheat: '使用外挂', abuse: '恶意行为', other: '其他' };
app.post('/api/admin/report/approve', adminAuth, async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: '缺少举报ID' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  report.status = 'approved'; report.reviewedAt = new Date().toISOString();
  await report.save();
  await pushNotif(report.target, '举报被确认', `您的举报（${reportTypeNames2[report.reasonType] || report.reasonType}）已被管理员确认违规`);
  const approvedCount = await Report.countDocuments({ target: report.target, status: 'approved' });
  if (approvedCount >= 5) { await banUser(report.target, '多次被管理员确认违规'); }
  res.json({ ok: true });
});

// 管理员驳回举报
app.post('/api/admin/report/reject', adminAuth, async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: '缺少举报ID' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  report.status = 'rejected'; report.reviewedAt = new Date().toISOString();
  await report.save();
  await pushNotif(report.reporter, '举报被驳回', `您对${report.target}的举报已被管理员驳回`);
  res.json({ ok: true });
});

// 管理员标记用户
app.post('/api/admin/mark', adminAuth, async (req, res) => {
  const { username, reason } = req.body || {};
  if (!username || !reason) return res.status(400).json({ error: '参数不完整' });
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: '用户不存在' });
  await Report.create({ id: genId(), reporter: '管理员', target: username, reason, reasonType: reason, status: 'approved', time: new Date().toISOString(), reviewedAt: new Date().toISOString(), adminMark: true });
  await pushNotif(username, '被管理员标记', `您因${reportTypeNames2[reason] || reason}被管理员标记违规`);
  const approvedCount = await Report.countDocuments({ target: username, status: 'approved' });
  if (approvedCount >= 5) { await banUser(username, '管理员确认多次违规'); }
  res.json({ ok: true });
});

// 管理员查看用户详情
app.get('/api/admin/user/:username', adminAuth, async (req, res) => {
  const u = await User.findOne({ username: req.params.username }).lean();
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { password, ...info } = u;
  info.username = req.params.username;
  info.winRate = u.games > 0 ? Math.round(u.wins / u.games * 100) : 0;
  info.deleted = !!u.deletedAt;
  info.deletedAt = u.deletedAt || null;
  info.reports = await Report.find({ target: req.params.username }).sort({ time: -1 }).limit(20).lean();
  const ban = await Ban.findOne({ username: req.params.username });
  if (ban) {
    if (ban.permanent) { info.banned = true; info.banInfo = { banned: true, permanent: true, reason: ban.reason, offenses: ban.offenses }; }
    else { const until = new Date(ban.until).getTime(); info.banned = Date.now() < until; info.banInfo = { banned: info.banned, permanent: false, daysLeft: Math.ceil((until - Date.now()) / 86400000), reason: ban.reason, offenses: ban.offenses }; }
  } else { info.banned = false; info.banInfo = { banned: false }; }
  res.json(info);
});

// 管理员查看已删除用户
app.get('/api/admin/deleted-users', adminAuth, async (req, res) => {
  const users = await User.find({ deletedAt: { $ne: null } }).select('username wins losses games deletedAt createdAt').lean();
  const deleted = users.map(u => ({
    username: u.username, wins: u.wins, losses: u.losses, games: u.games,
    winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0,
    deletedAt: u.deletedAt, createdAt: u.createdAt,
  }));
  res.json(deleted);
});

// 管理员查询近N天对局记录
app.get('/api/admin/game-log', adminAuth, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const recent = await GameLog.find({ time: { $gte: cutoff } }).sort({ time: -1 }).lean();
  res.json({ total: recent.length, days, games: recent });
});

app.get('/api/admin/chat-logs', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const roomId = req.query.room || '';
    const username = req.query.username || '';
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const query = { time: { $gte: cutoff } };
    if (roomId) query.roomId = roomId;
    if (username) query.username = username;
    const logs = await ChatLog.find(query).sort({ time: -1 }).lean();
    res.json({ total: logs.length, days, logs });
  } catch (e) { res.json({ total: 0, days: 7, logs: [] }); }
});

// 管理员彻底注销用户
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

// ==================== 心跳检测定时器 ====================
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      console.log('心跳超时，断开连接');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, WS_PING_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ==================== 启动 ====================
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => { console.log(`五子棋(用户版)运行在 http://localhost:${PORT}`); });
