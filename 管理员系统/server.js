const path = require('path');
const fs = require('fs');

// 读取.env文件
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
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const GAME_SERVER = 'http://localhost:' + (process.env.GAME_PORT || '3002');
const ADMIN_KEY = process.env.ADMIN_KEY || 'no-key-configured';

// MongoDB 连接
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gomoku')
  .then(() => console.log('管理员系统 MongoDB 连接成功'))
  .catch(err => { console.error('MongoDB 连接失败:', err.message); process.exit(1); });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  games: { type: Number, default: 0 },
  deletedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { collection: 'users' });

const banSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  permanent: { type: Boolean, default: false },
  until: { type: String, default: null },
  reason: { type: String, default: '' },
  offenses: { type: Number, default: 0 },
  bannedAt: { type: String, default: () => new Date().toISOString() }
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
  adminMark: { type: Boolean, default: false }
}, { collection: 'reports' });

const gameLogSchema = new mongoose.Schema({
  winner: { type: String, required: true },
  loser: { type: String, required: true },
  totalMoves: { type: Number, default: 0 },
  gameType: { type: String, default: 'gomoku' },
  moves: { type: [mongoose.Schema.Types.Mixed], default: [] },
  time: { type: String, default: () => new Date().toISOString() }
}, { collection: 'gameRecord' });

const appealSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reportId: { type: String, default: '' },
  username: { type: String, required: true },
  reason: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  time: { type: String, default: () => new Date().toISOString() },
  reviewedAt: { type: String, default: null }
}, { collection: 'appeals' });

const notifSchema = new mongoose.Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() }
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

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true }
}, { collection: 'tokens' });

const User = mongoose.model('User', userSchema);
const Ban = mongoose.model('Ban', banSchema);
const Report = mongoose.model('Report', reportSchema);
const GameLog = mongoose.model('GameLog', gameLogSchema);
const Appeal = mongoose.model('Appeal', appealSchema);
const Token = mongoose.model('Token', tokenSchema);
const Notification = mongoose.model('Notification', notifSchema);
const ChatLog = mongoose.model('ChatLog', chatLogSchema);

// 管理员模型
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isMain: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { collection: 'admins' });
const Admin = mongoose.model('Admin', adminSchema);

// 初始化主管理员
async function initMainAdmin() {
  const mainUser = process.env.ADMIN_USERNAME;
  const mainPass = process.env.ADMIN_PASSWORD;
  if (!mainUser || !mainPass) {
    console.log('未设置主管理员账号，请在 .env 中配置 ADMIN_USERNAME 和 ADMIN_PASSWORD');
    return;
  }
  try {
    // 清空旧管理员数据，只保留.env配置的主管理员
    await Admin.deleteMany({});
    await Admin.create({ username: mainUser, password: mainPass, isMain: true });
    console.log('主管理员已创建:', mainUser);
  } catch (e) { console.error('初始化主管理员失败:', e.message); }
}
initMainAdmin();

// 管理员登录API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  console.log('登录请求:', username);
  if (!username || !password) return res.json({ error: '请输入用户名和密码' });
  try {
    const admin = await Admin.findOne({ username });
    console.log('找到管理员:', admin ? admin.username : 'null');
    if (!admin) return res.json({ error: '管理员不存在' });
    if (admin.password !== password) return res.json({ error: '密码错误' });
    const token = crypto.randomBytes(32).toString('hex');
    await Token.create({ token, username });
    res.json({ token, username, isMain: admin.isMain });
  } catch (e) {
    console.error('登录错误:', e.message);
    res.json({ error: '登录失败: ' + e.message });
  }
});

app.post('/api/logout', async (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  if (token) await Token.deleteOne({ token });
  res.json({ ok: true });
});

// 管理员认证中间件
async function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ', '');
  const t = await Token.findOne({ token });
  if (!t) return res.status(401).json({ error: '未登录' });
  req.adminUsername = t.username;
  next();
}

// 添加管理员（仅主管理员）
app.post('/api/admins/add', adminAuth, async (req, res) => {
  const admin = await Admin.findOne({ username: req.adminUsername });
  if (!admin || !admin.isMain) return res.status(403).json({ error: '只有主管理员可以添加管理员' });
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: '请输入用户名' });
  const exists = await Admin.findOne({ username });
  if (exists) return res.status(400).json({ error: '管理员已存在' });
  await Admin.create({ username, password: username, isMain: false });
  res.json({ ok: true, msg: `管理员 ${username} 已添加，初始密码为: ${username}` });
});

// 删除管理员（仅主管理员）
app.post('/api/admins/delete', adminAuth, async (req, res) => {
  const admin = await Admin.findOne({ username: req.adminUsername });
  if (!admin || !admin.isMain) return res.status(403).json({ error: '只有主管理员可以删除管理员' });
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: '请输入用户名' });
  const target = await Admin.findOne({ username });
  if (!target) return res.status(400).json({ error: '管理员不存在' });
  if (target.isMain) return res.status(400).json({ error: '不能删除主管理员' });
  await Admin.deleteOne({ username });
  res.json({ ok: true });
});

// 获取管理员列表
app.get('/api/admins', adminAuth, async (req, res) => {
  const admins = await Admin.find({}, { password: 0 }).lean();
  res.json(admins);
});

// 调试：查看所有管理员（无需认证）
app.get('/api/debug/admins', async (req, res) => {
  const admins = await Admin.find().lean();
  res.json(admins.map(a => ({ username: a.username, isMain: a.isMain })));
});

function pushNotif(username, title, content) {
  Notification.create({ id: crypto.randomBytes(8).toString('hex'), username, title, content, read: false, time: new Date().toISOString() });
}

function banUser(username, reason) {
  return Report.countDocuments({ target: username, status: 'approved' }).then(count => {
    const activeReports = count;
    const bans = { permanent: activeReports >= 50 };
    if (!bans.permanent) {
      let days = 14;
      if (activeReports >= 40) days = 365;
      else if (activeReports >= 30) days = 180;
      else if (activeReports >= 20) days = 90;
      else if (activeReports >= 12) days = 30;
      else if (activeReports >= 7) days = 14;
      else days = 0;
      bans.until = new Date(Date.now() + days * 86400000).toISOString();
    }
    bans.reason = reason;
    bans.offenses = activeReports;
    bans.bannedAt = new Date().toISOString();
    return Ban.findOneAndUpdate({ username }, bans, { upsert: true, new: true });
  });
}

function checkAutoBan(target) {
  return Report.countDocuments({ target, status: 'approved' }).then(count => {
    if (count >= 5) {
      banUser(target, '多次被举报/确认违规');
      return { action: 'banned' };
    }
    if (count === 3) return { action: 'warned', count };
    return { action: 'none' };
  });
}

app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await fetch(GAME_SERVER + '/api/admin/rooms', { headers: { 'Authorization': 'Bearer ' + ADMIN_KEY } });
    const data = await rooms.json();
    res.json(Array.isArray(data) ? data.filter(r => !r.gameOver) : []);
  } catch { res.json([]); }
});

app.get('/api/reports', async (req, res) => {
  const reports = await Report.find({ status: 'pending' }).lean();
  res.json(reports);
});

app.post('/api/report/approve', async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: '缺少举报ID' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  report.status = 'approved'; report.reviewedAt = new Date().toISOString();
  await report.save();
  const names = { boost: '刷胜率/放水', cheat: '使用外挂', abuse: '恶意行为', other: '其他' };
  pushNotif(report.target, '举报被确认', `您的举报（${names[report.reasonType] || report.reasonType}）已被管理员确认`);
  await checkAutoBan(report.target);
  res.json({ ok: true });
});

app.post('/api/report/reject', async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: '缺少举报ID' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  report.status = 'rejected'; report.reviewedAt = new Date().toISOString();
  await report.save();
  pushNotif(report.reporter, '举报被驳回', `您对${report.target}的举报已被管理员驳回`);
  res.json({ ok: true });
});

app.post('/api/mark', async (req, res) => {
  const { username, reason } = req.body || {};
  if (!username || !reason) return res.status(400).json({ error: '参数不完整' });
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: '用户不存在' });
  await Report.create({ id: crypto.randomBytes(8).toString('hex'), reporter: '管理员', target: username, reason, reasonType: reason, status: 'approved', time: new Date().toISOString(), reviewedAt: new Date().toISOString(), adminMark: true });
  const names = { boost: '刷胜率/放水', cheat: '使用外挂', abuse: '恶意行为', other: '其他' };
  pushNotif(username, '被管理员标记', `您因${names[reason] || reason}被管理员标记`);
  await checkAutoBan(username);
  res.json({ ok: true });
});

app.get('/api/user/:username', async (req, res) => {
  const u = await User.findOne({ username: req.params.username }).lean();
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const info = { ...u };
  delete info.password;
  delete info._id;
  info.username = req.params.username;
  info.winRate = u.games > 0 ? Math.round(u.wins / u.games * 100) : 0;
  info.deleted = !!u.deletedAt;
  info.reports = await Report.find({ target: req.params.username }).sort({ time: -1 }).limit(20).lean();
  const ban = await Ban.findOne({ username: req.params.username });
  if (ban) {
    if (ban.permanent) {
      info.banned = true;
      info.banInfo = { banned: true, permanent: true, reason: ban.reason, offenses: ban.offenses };
    } else {
      const until = new Date(ban.until).getTime();
      if (Date.now() < until) {
        info.banned = true;
        info.banInfo = { banned: true, permanent: false, daysLeft: Math.ceil((until - Date.now()) / 86400000), reason: ban.reason, offenses: ban.offenses };
      } else {
        info.banned = false;
        info.banInfo = { banned: false };
      }
    }
  } else {
    info.banned = false;
    info.banInfo = { banned: false };
  }
  res.json(info);
});

app.get('/api/deleted-users', async (req, res) => {
  const users = await User.find({ deletedAt: { $ne: null } }).select('username wins losses games deletedAt createdAt').lean();
  res.json(users.map(u => ({ ...u, winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0 })));
});

app.get('/api/appeals', async (req, res) => {
  const appeals = await Appeal.find({ status: 'pending' }).lean();
  res.json(appeals);
});

app.post('/api/appeal/approve', async (req, res) => {
  const { appealId } = req.body || {};
  if (!appealId) return res.status(400).json({ error: '缺少申诉ID' });
  const appeal = await Appeal.findOne({ id: appealId });
  if (!appeal) return res.status(400).json({ error: '申诉不存在' });
  appeal.status = 'approved'; appeal.reviewedAt = new Date().toISOString();
  await appeal.save();
  await Ban.deleteOne({ username: appeal.username });
  await Report.updateMany({ target: appeal.username, status: { $in: ['pending', 'approved'] } }, { status: 'cancelled', reviewedAt: new Date().toISOString() });
  pushNotif(appeal.username, '申诉通过', '您的申诉已通过，账号已解封');
  res.json({ ok: true });
});

app.post('/api/appeal/reject', async (req, res) => {
  const { appealId } = req.body || {};
  if (!appealId) return res.status(400).json({ error: '缺少申诉ID' });
  const appeal = await Appeal.findOne({ id: appealId });
  if (!appeal) return res.status(400).json({ error: '申诉不存在' });
  appeal.status = 'rejected'; appeal.reviewedAt = new Date().toISOString();
  await appeal.save();
  pushNotif(appeal.username, '申诉被驳回', '您的申诉已被驳回');
  res.json({ ok: true });
});

app.post('/api/force-delete', adminAuth, async (req, res) => {
  // 只有主管理员可以注销用户
  const admin = await Admin.findOne({ username: req.adminUsername });
  if (!admin || !admin.isMain) {
    return res.status(403).json({ error: '只有主管理员可以注销用户' });
  }
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: '缺少用户名' });
  await User.deleteOne({ username });
  await Token.deleteMany({ username });
  await Report.deleteMany({ $or: [{ reporter: username }, { target: username }] });
  await GameLog.deleteMany({ $or: [{ winner: username }, { loser: username }] });
  await Ban.deleteOne({ username });
  await Appeal.deleteMany({ username });
  await Notification.deleteMany({ username });
  res.json({ ok: true });
});

const PORT = process.env.ADMIN_PORT || 3003;

app.get('/api/game-log', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const logs = await GameLog.find({ time: { $gte: cutoff } }).sort({ time: -1 }).lean();
    res.json({ total: logs.length, days, games: logs });
  } catch (e) { res.json({ total: 0, days: 7, games: [] }); }
});

app.get('/api/admin/chat-logs', async (req, res) => {
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

app.listen(PORT, () => console.log(`管理员系统运行在 http://localhost:${PORT}`));
