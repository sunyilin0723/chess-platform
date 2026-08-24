const crypto = require('crypto');
const argon2 = require('argon2');

// 密码哈希
async function hashPw(pw) { return argon2.hash(pw); }

// 密码验证（兼容SHA-256旧密码）
async function verifyPw(storedHash, pw) {
  if (storedHash.startsWith('$argon2')) {
    return argon2.verify(storedHash, pw);
  } else {
    return storedHash === crypto.createHash('sha256').update(pw).digest('hex');
  }
}

// 生成唯一ID
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// 生成Token
function genToken() { return crypto.randomBytes(32).toString('hex'); }

module.exports = { hashPw, verifyPw, genId, genToken };
