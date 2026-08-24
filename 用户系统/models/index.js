const mongoose = require('mongoose');

// 用户模型
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  games: { type: Number, default: 0 },
  deletedAt: { type: String, default: null },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { collection: 'users' });

// 封号模型
const banSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  permanent: { type: Boolean, default: false },
  until: { type: String, default: null },
  reason: { type: String, default: '' },
  offenses: { type: Number, default: 0 },
  bannedAt: { type: String, default: () => new Date().toISOString() },
}, { collection: 'banList' });

// 举报模型
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

// 游戏记录模型
const gameLogSchema = new mongoose.Schema({
  winner: { type: String, required: true },
  loser: { type: String, required: true },
  totalMoves: { type: Number, default: 0 },
  gameType: { type: String, default: 'gomoku' },
  moves: { type: [mongoose.Schema.Types.Mixed], default: [] },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'gameRecord' });

// 申诉模型
const appealSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reportId: { type: String, required: true },
  username: { type: String, required: true },
  reason: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'appeals' });

// 令牌模型
const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  username: { type: String, required: true },
}, { collection: 'tokens' });

// 通知模型
const notifSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'notifications' });

// 聊天日志模型
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

// 私信模型
const dmSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  content: { type: String, required: true },
  read: { type: Boolean, default: false },
  time: { type: String, default: () => new Date().toISOString() },
}, { collection: 'dms' });

// 导出模型
const User = mongoose.model('User', userSchema);
const Ban = mongoose.model('Ban', banSchema);
const Report = mongoose.model('Report', reportSchema);
const GameLog = mongoose.model('GameLog', gameLogSchema);
const Appeal = mongoose.model('Appeal', appealSchema);
const Token = mongoose.model('Token', tokenSchema);
const Notification = mongoose.model('Notification', notifSchema);
const ChatLog = mongoose.model('ChatLog', chatLogSchema);
const DM = mongoose.model('DM', dmSchema);

module.exports = { User, Ban, Report, GameLog, Appeal, Token, Notification, ChatLog, DM };
