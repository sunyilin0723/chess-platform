# 在线棋类对战平台

一个支持多种棋类游戏的在线对战平台，包含用户系统和管理后台。

## 功能特性

### 三种棋类游戏
- **五子棋** - 15x15棋盘，支持禁手规则（三三/四四/长连禁手）
- **围棋** - 19x19棋盘，支持领地计分、死活判断
- **中国象棋** - 标准象棋规则，支持将军/将杀判定

### 人机对战
- 三个难度等级：简单、普通、困难
- 五子棋AI：棋型评分+极大极小搜索+Alpha-Beta剪枝
- 围棋AI：死活判断+眼位识别+攻防评估
- 象棋AI：位置价值表+走法排序+搜索算法

### 用户系统
- 注册/登录（Argon2密码加密）
- 个人主页和排行榜
- 修改用户名/密码
- 账号软删除（7天保留期）

### 社交功能
- 房间内实时聊天（敏感词过滤）
- 私信系统
- 站内通知

### 反作弊系统
- 敏感词过滤（模糊匹配+全角转半角）
- 举报-审核-封禁机制
- 申诉系统
- 临时禁言（3次违规警告，10分钟封禁）

### 安全特性
- WebSocket Token认证
- 心跳检测（30秒ping）
- 断线自动重连（最多5次）
- HTML转义防XSS攻击
- 环境变量配置敏感信息

### 管理后台
- 实时对局监控
- 举报/申诉审核
- 对局记录（含棋盘回放）
- 聊天日志
- 用户查询
- 管理员管理（主管理员/普通管理员权限）

### 界面特性
- 深色/浅色主题切换
- 响应式布局
- 棋盘跟随主题变化

---

## 安装与启动

### 环境要求
- Node.js 14+
- MongoDB 4+

### 1. 安装依赖

```bash
# 用户系统
cd 用户系统
npm install

# 管理员系统
cd ../管理员系统
npm install
```

### 2. 配置环境变量

编辑根目录下的 `.env` 文件：

```env
# 游戏服务器端口
GAME_PORT=3002

# 管理后台端口
ADMIN_PORT=3003

# MongoDB连接地址
MONGO_URI=mongodb://localhost:27017/gomoku

# 主管理员账号（首次启动时创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### 3. 启动服务

**终端1 - 游戏服务器：**
```bash
cd 用户系统
node server.js
```

**终端2 - 管理后台：**
```bash
cd 管理员系统
node server.js
```

### 4. 访问网站

- 游戏平台：http://localhost:3002
- 管理后台：http://localhost:3003

---

## 项目结构

```
用户版本/
├── .env                          # 环境变量配置
├── 用户系统/                     # 游戏服务器 (端口3002)
│   ├── server.js                 # 主入口
│   ├── models/
│   │   └── index.js              # 9个数据库模型
│   ├── utils/
│   │   ├── index.js              # 密码加密、ID生成
│   │   └── sensitive.js          # 敏感词过滤、禁言
│   ├── game/
│   │   ├── gomoku.js             # 五子棋+禁手检测+AI
│   │   ├── go.js                 # 围棋+AI
│   │   └── chess.js              # 象棋+AI
│   ├── public/
│   │   ├── index.html            # 页面结构
│   │   ├── style.css             # 样式（深色/浅色主题）
│   │   ├── game.js               # 核心逻辑、认证、主题切换
│   │   ├── game2.js              # WebSocket通信、断线重连
│   │   └── game3.js              # 棋盘渲染、通知/私信
│   └── package.json
├── 管理员系统/                   # 管理后台 (端口3003)
│   ├── server.js                 # 管理API、管理员模型
│   ├── public/
│   │   └── index.html            # 管理界面（登录、监控、审核）
│   └── package.json
└── README.md
```

---

## 模块说明

### 后端模块

| 模块 | 文件 | 功能 |
|------|------|------|
| 数据库 | `models/index.js` | User, Ban, Report, GameLog, Appeal, Token, Notification, ChatLog, DM |
| 工具 | `utils/index.js` | hashPw, verifyPw, genId, genToken |
| 敏感词 | `utils/sensitive.js` | checkSensitive, filterSensitive, isMuted, addViolation |
| 五子棋 | `game/gomoku.js` | checkGomokuWin, isForbiddenMove, getAIMove |
| 围棋 | `game/go.js` | goRemoveCaptures, goCountTerritory, getAIMove |
| 象棋 | `game/chess.js` | getChessMoves, chessInCheck, chessHasLegalMove, getAIMove |

### 前端文件

| 文件 | 功能 |
|------|------|
| `game.js` | 登录认证、页面切换、主题切换、HTML安全转义 |
| `game2.js` | WebSocket连接、消息收发、断线重连 |
| `game3.js` | 棋盘绘制、通知/私信、个人主页 |

---

## 管理员系统

### 权限说明

| 操作 | 主管理员 | 普通管理员 |
|------|---------|-----------|
| 查看实时对局 | ✅ | ✅ |
| 审核举报/申诉 | ✅ | ✅ |
| 查看对局记录 | ✅ | ✅ |
| 添加管理员 | ✅ | ❌ |
| 删除管理员 | ✅ | ❌ |
| 注销用户 | ✅ | ❌ |

### 首次登录

1. 使用 `.env` 中配置的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录
2. 登录后可在"管理员"页面添加其他管理员
3. 新管理员初始密码为用户名

### 对局回放

在"对局记录"页面，点击"▶"可以展开棋盘回放：
- 支持上一步/下一步浏览
- 显示每步棋的棋谱

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Node.js | 服务器运行环境 |
| Express | HTTP服务器 |
| WebSocket (ws) | 实时通信 |
| MongoDB (Mongoose) | 数据库 |
| Argon2 | 密码加密 |
| Canvas API | 棋盘绘制 |

---

## 数据存储

| 集合 | 用途 | 保留策略 |
|------|------|---------|
| users | 用户账号 | 软删除保留7天 |
| admins | 管理员账号 | 永久 |
| tokens | 登录凭证 | 登出即删 |
| banList | 封号记录 | 永久/临时 |
| reports | 举报记录 | 永久 |
| appeals | 申诉记录 | 永久 |
| gameRecord | 对局记录（含每步棋） | 永久 |
| notifications | 站内通知 | 永久 |
| chatLogs | 聊天记录 | 15天自动清理 |
| dms | 私信记录 | 永久 |

---

## 注意事项

1. 首次启动会自动创建主管理员（从`.env`读取）
2. 主管理员每次启动会重置（清空旧数据重新创建）
3. 聊天记录默认保留15天
4. 五子棋禁手只对黑棋（先手）生效
5. 人机对战退出后房间会自动删除
