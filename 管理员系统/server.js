const path = require('path');
const express = require('express');
const crypto = require('crypto');

// 模型统一用游戏服的：两边 node_modules 各有一份 mongoose，本文件 require('mongoose') 会拿到未连接的第二实例
const { User, Ban, Report, GameLog, Appeal, Token, Notification, ChatLog, Feedback, Admin } = require(path.join(__dirname, '..', '用户系统', 'models'));

// 初始化主管理员
async function initMainAdmin() {
  const mainUser = process.env.ADMIN_USERNAME;
  const mainPass = process.env.ADMIN_PASSWORD;
  if (!mainUser || !mainPass) {
    console.log('未设置主管理员账号，请在 .env 中配置 ADMIN_USERNAME 和 ADMIN_PASSWORD');
    return;
  }
  try {
    // 仅在主管理员不存在时创建，避免清空其他管理员
    const exists = await Admin.findOne({ username: mainUser });
    if (!exists) {
      await Admin.create({ username: mainUser, password: mainPass, isMain: true });
      console.log('主管理员已创建:', mainUser);
    } else {
      // 同步.env中的密码
      await Admin.updateOne({ username: mainUser }, { password: mainPass, isMain: true });
      console.log('主管理员已存在:', mainUser);
    }
  } catch (e) { console.error('初始化主管理员失败:', e.message); }
}
// 由游戏服挂载：静态页挂 /admin，API 挂 /admin/api；deps = { listRooms, sendBroadcast }
module.exports = function registerAdmin(app, deps) {
  initMainAdmin();
  app.use('/admin', express.static(path.join(__dirname, 'public')));

// 管理员登录API
app.post('/admin/api/login', async (req, res) => {
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

app.post('/admin/api/logout', async (req, res) => {
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
app.post('/admin/api/admins/add', adminAuth, async (req, res) => {
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
app.post('/admin/api/admins/delete', adminAuth, async (req, res) => {
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
app.get('/admin/api/admins', adminAuth, async (req, res) => {
  const admins = await Admin.find({}, { password: 0 }).lean();
  res.json(admins);
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

app.get('/admin/api/rooms', adminAuth, async (req, res) => {
  try {
    const data = deps.listRooms();
    res.json(Array.isArray(data) ? data.filter(r => !r.gameOver) : []);
  } catch { res.json([]); }
});

app.get('/admin/api/reports', adminAuth, async (req, res) => {
  const reports = await Report.find({ status: 'pending' }).lean();
  res.json(reports);
});

app.post('/admin/api/report/approve', adminAuth, async (req, res) => {
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

app.post('/admin/api/report/reject', adminAuth, async (req, res) => {
  const { reportId } = req.body || {};
  if (!reportId) return res.status(400).json({ error: '缺少举报ID' });
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(400).json({ error: '举报不存在' });
  report.status = 'rejected'; report.reviewedAt = new Date().toISOString();
  await report.save();
  pushNotif(report.reporter, '举报被驳回', `您对${report.target}的举报已被管理员驳回`);
  res.json({ ok: true });
});

app.post('/admin/api/mark', adminAuth, async (req, res) => {
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

app.get('/admin/api/user/:username', adminAuth, async (req, res) => {
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

app.get('/admin/api/deleted-users', adminAuth, async (req, res) => {
  const users = await User.find({ deletedAt: { $ne: null } }).select('username wins losses games deletedAt createdAt').lean();
  res.json(users.map(u => ({ ...u, winRate: u.games > 0 ? Math.round(u.wins / u.games * 100) : 0 })));
});

app.get('/admin/api/appeals', adminAuth, async (req, res) => {
  const appeals = await Appeal.find({ status: 'pending' }).lean();
  res.json(appeals);
});

app.post('/admin/api/appeal/approve', adminAuth, async (req, res) => {
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

app.post('/admin/api/appeal/reject', adminAuth, async (req, res) => {
  const { appealId } = req.body || {};
  if (!appealId) return res.status(400).json({ error: '缺少申诉ID' });
  const appeal = await Appeal.findOne({ id: appealId });
  if (!appeal) return res.status(400).json({ error: '申诉不存在' });
  appeal.status = 'rejected'; appeal.reviewedAt = new Date().toISOString();
  await appeal.save();
  pushNotif(appeal.username, '申诉被驳回', '您的申诉已被驳回');
  res.json({ ok: true });
});

// ==================== 反馈系统（仅主管理员） ====================
// 主管理员权限检查
async function checkMainAdmin(req, res) {
  const admin = await Admin.findOne({ username: req.adminUsername });
  return admin && admin.isMain;
}

// 获取反馈列表
app.get('/admin/api/feedbacks', adminAuth, async (req, res) => {
  if (!(await checkMainAdmin(req, res))) return res.status(403).json({ error: '仅主管理员可查看反馈' });
  const list = await Feedback.find().sort({ time: -1 }).limit(50).lean();
  res.json(list);
});

// 回复反馈
app.post('/admin/api/feedback/reply', adminAuth, async (req, res) => {
  if (!(await checkMainAdmin(req, res))) return res.status(403).json({ error: '仅主管理员可回复反馈' });
  const { feedbackId, reply } = req.body || {};
  if (!feedbackId || !reply || !reply.trim()) return res.status(400).json({ error: '请填写回复内容' });
  const fb = await Feedback.findOne({ id: feedbackId });
  if (!fb) return res.status(400).json({ error: '反馈不存在' });
  fb.status = 'replied';
  fb.reply = reply.trim();
  fb.repliedAt = new Date().toISOString();
  await fb.save();
  // 发送站内通知给反馈用户
  pushNotif(fb.from, '反馈已回复', reply.trim().substring(0, 100));
  res.json({ ok: true });
});

// ==================== 广播通知（仅主管理员） ====================
// 用户名包含匹配搜索（排除已软删除），供广播定向选人
app.get('/admin/api/search-users', adminAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ list: [] });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const list = await User.find({ username: { $regex: escaped, $options: 'i' }, deletedAt: null })
    .select('username').limit(10).lean();
  res.json({ list: list.map(u => ({ username: u.username })) });
});

// 广播：进程内直调游戏服 sendBroadcast（写库+WS实时推送）
app.post('/admin/api/broadcast', adminAuth, async (req, res) => {
  if (!(await checkMainAdmin(req, res))) return res.status(403).json({ error: '仅主管理员可发送广播' });
  const { content, username } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: '请填写通知内容' });
  const trimmed = String(content).trim();
  if (trimmed.length > 200) return res.status(400).json({ error: '通知内容不能超过200字' });
  try {
    const r = await deps.sendBroadcast(trimmed, username || '');
    res.json({ ok: true, count: r.count || 0 });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.post('/admin/api/force-delete', adminAuth, async (req, res) => {
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

app.get('/admin/api/game-log', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const logs = await GameLog.find({ time: { $gte: cutoff } }).sort({ time: -1 }).lean();
    res.json({ total: logs.length, days, games: logs });
  } catch (e) { res.json({ total: 0, days: 7, games: [] }); }
});

app.get('/admin/api/admin/chat-logs', adminAuth, async (req, res) => {
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

// /admin SPA 回退：API 未匹配返回 404 JSON，其余返回管理端页面
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin/*', (req, res, next) => {
  if (req.path.startsWith('/admin/api/')) return res.status(404).json({ error: '接口不存在' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
};

// 直接运行本文件时给出提示（已合并，需由游戏服挂载）
if (require.main === module) console.log('管理端已合并到用户系统：请运行 用户系统/启动.bat，浏览器访问 /admin 路径');
