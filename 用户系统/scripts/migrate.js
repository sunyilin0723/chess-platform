const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gomoku';

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

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true }
}, { collection: 'tokens' });

const notifSchema = new mongoose.Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() }
}, { collection: 'notifications' });

const User = mongoose.model('User', userSchema);
const Ban = mongoose.model('Ban', banSchema);
const Report = mongoose.model('Report', reportSchema);
const GameLog = mongoose.model('GameLog', gameLogSchema);
const Appeal = mongoose.model('Appeal', appealSchema);
const Token = mongoose.model('Token', tokenSchema);
const Notification = mongoose.model('Notification', notifSchema);

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log('已连接MongoDB');

  // 迁移用户（JSON对象格式 -> 文档）
  const usersRaw = loadJson(path.join(DATA_DIR, 'users.json'), {});
  const users = Object.entries(usersRaw).map(([username, u]) => ({ username, ...u }));
  if (users.length > 0) {
    await User.deleteMany({});
    await User.insertMany(users);
    console.log(`用户: ${users.length}条`);
  }

  // 迁移封禁（JSON对象格式 -> 文档）
  const bansRaw = loadJson(path.join(DATA_DIR, 'bans.json'), {});
  const bans = Object.entries(bansRaw).map(([username, b]) => ({ username, ...b }));
  if (bans.length > 0) {
    await Ban.deleteMany({});
    await Ban.insertMany(bans);
    console.log(`封禁: ${bans.length}条`);
  }

  // 迁移举报
  const reports = loadJson(path.join(DATA_DIR, 'reports.json'), []);
  if (reports.length > 0) {
    await Report.deleteMany({});
    await Report.insertMany(reports);
    console.log(`举报: ${reports.length}条`);
  }

  // 迁移对局日志
  const gameLog = loadJson(path.join(DATA_DIR, 'game_log.json'), []);
  if (gameLog.length > 0) {
    await GameLog.deleteMany({});
    await GameLog.insertMany(gameLog);
    console.log(`对局: ${gameLog.length}条`);
  }

  // 迁移申诉
  const appeals = loadJson(path.join(DATA_DIR, 'appeals.json'), []);
  if (appeals.length > 0) {
    await Appeal.deleteMany({});
    await Appeal.insertMany(appeals);
    console.log(`申诉: ${appeals.length}条`);
  }

  // 迁移Token（JSON对象格式 -> 文档）
  const tokensRaw = loadJson(path.join(DATA_DIR, 'tokens.json'), {});
  const tokens = Object.entries(tokensRaw).map(([token, username]) => ({ token, username }));
  if (tokens.length > 0) {
    await Token.deleteMany({});
    await Token.insertMany(tokens);
    console.log(`Token: ${tokens.length}条`);
  }

  // 迁移通知
  const notifs = loadJson(path.join(DATA_DIR, 'notifications.json'), []);
  if (notifs.length > 0) {
    await Notification.deleteMany({});
    await Notification.insertMany(notifs);
    console.log(`通知: ${notifs.length}条`);
  }

  console.log('迁移完成！');
  await mongoose.disconnect();
}

migrate().catch(err => { console.error('迁移失败:', err.message); process.exit(1); });
