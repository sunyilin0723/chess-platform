// 敏感词库
const SENSITIVE_BLOCK = [
  '现金','下注','赌棋','赌一把','上分','下分','回收分数','收购分','买卖分',
  '微信转账','支付宝转账','红包','赌注','赌资','博彩','赌博','私局','盘口',
  '赔率','打水','套利','结算','现结','线下对局','给钱下棋',
  '收徒','接单','代练','外挂','辅助','脚本','私服','源码','出售','购买',
  '加微信','加 qq','联系我','私我','群号','二维码','网址','链接','推广','变现',
  '傻逼','废物','垃圾','脑残','滚','去死',
  '色情','嫖','赌','毒','翻墙','邪教'
];
const SENSITIVE_WARN = ['赢钱','赚钱','报酬','酬劳','切磋付费','有偿对局'];

// 文本规范化（全角转半角，去空格标点）
function normalizeText(text) {
  let s = text.toLowerCase();
  s = s.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[\s\u3000\uff0c\u3002\uff01\uff1f\u3001\u300a\u300b\uff08\uff09\u2018\u2019\u201c\u201d]/g, '');
  return s;
}

// 检查敏感词
function checkSensitive(text) {
  const normalized = normalizeText(text);
  for (const word of SENSITIVE_BLOCK) {
    if (normalized.includes(word)) return { blocked: true, warn: false, word };
  }
  for (const word of SENSITIVE_WARN) {
    if (normalized.includes(word)) return { blocked: false, warn: true, word };
  }
  return { blocked: false, warn: false };
}

// 过滤敏感词（保留原标点）
function filterSensitive(text) {
  let result = text;
  for (const word of SENSITIVE_BLOCK) {
    const regex = new RegExp(word.split('').join('[\\s\\W]*'), 'gi');
    result = result.replace(regex, match => match[0] + '*'.repeat(Math.max(0, match.length - 2)) + match[match.length - 1]);
  }
  return result;
}

// 临时禁言系统
const mutedUsers = new Map(); // username -> { until, violations }

function isMuted(username) {
  const m = mutedUsers.get(username);
  if (!m) return false;
  if (Date.now() > m.until) { mutedUsers.delete(username); return false; }
  return true;
}

function addViolation(username) {
  const m = mutedUsers.get(username) || { violations: 0, until: 0 };
  m.violations++;
  if (m.violations >= 3) {
    m.until = Date.now() + 10 * 60 * 1000; // 10分钟禁言
    m.violations = 0;
  }
  mutedUsers.set(username, m);
}

module.exports = { checkSensitive, filterSensitive, isMuted, addViolation, SENSITIVE_BLOCK, SENSITIVE_WARN };
