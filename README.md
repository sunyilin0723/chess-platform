# 在线棋类对战平台

一个支持多种棋类游戏的在线对战平台，包含用户系统和管理后台。

## 功能特性

### 三种棋类游戏
- **五子棋** - 15x15棋盘，AI使用极大极小搜索+Alpha-Beta剪枝
- **围棋** - 19x19棋盘，AI包含死活判断、眼位识别
- **中国象棋** - 标准象棋规则，AI包含位置价值表和走法排序

### 人机对战
- 三个难度等级：简单、普通、困难
- 简单：搜索深度低+随机扰动
- 普通：中等搜索深度+防守意识
- 困难：深度搜索+全局评估

### 用户系统
- 注册/登录（Argon2密码加密，兼容旧版SHA-256）
- 个人主页和排行榜
- 修改用户名/密码
- 账号软删除（7天保留期）

### 社交功能
- 房间内实时聊天
- 私信系统
- 站内通知

### 反作弊系统
- 敏感词过滤（模糊匹配+全角转半角）
- 举报-审核-封禁机制（3次警告，5次封禁）
- 申诉系统
- 临时禁言（3次违规警告，10分钟封禁）

### 安全特性
- WebSocket Token认证（连接后5秒内验证）
- 心跳检测（30秒ping，超时断开）
- 断线自动重连（最多5次，指数退避）
- HTML转义防XSS攻击
- 环境变量配置敏感信息

### 界面特性
- 深色/浅色主题切换
- 响应式布局
- 平滑过渡动画
- 三种棋盘都会跟随主题变化

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
# 管理员密钥（两个服务器必须一致）
ADMIN_KEY=你的密钥

# 游戏服务器端口
GAME_PORT=3002

# 管理后台端口
ADMIN_PORT=3003

# MongoDB连接地址
MONGO_URI=mongodb://localhost:27017/gomoku
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
├── .env                          # 环境变量配置（密钥、端口、数据库）
├── 用户系统/                     # 游戏服务器 (端口3002)
│   ├── server.js                 # 主入口（路由、WebSocket、启动）
│   ├── models/
│   │   └── index.js              # 9个数据库模型
│   ├── utils/
│   │   ├── index.js              # 密码加密、ID生成
│   │   └── sensitive.js          # 敏感词过滤、禁言系统
│   ├── game/
│   │   ├── gomoku.js             # 五子棋逻辑+AI
│   │   ├── go.js                 # 围棋逻辑+AI
│   │   └── chess.js              # 象棋逻辑+AI
│   ├── public/
│   │   ├── index.html            # 页面结构
│   │   ├── style.css             # 样式（深色/浅色主题）
│   │   ├── game.js               # 核心逻辑、认证、主题切换、安全转义
│   │   ├── game2.js              # WebSocket通信、断线重连、游戏指令
│   │   └── game3.js              # 棋盘渲染、通知/私信、个人主页
│   └── package.json
├── 管理员系统/                   # 管理后台 (端口3003)
│   ├── server.js                 # 管理API、审核功能
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
| 数据库模型 | `models/index.js` | User, Ban, Report, GameLog, Appeal, Token, Notification, ChatLog, DM |
| 工具函数 | `utils/index.js` | hashPw, verifyPw, genId, genToken |
| 敏感词 | `utils/sensitive.js` | checkSensitive, filterSensitive, isMuted, addViolation |
| 五子棋 | `game/gomoku.js` | createGomokuBoard, checkGomokuWin, getAIMove |
| 围棋 | `game/go.js` | createGoBoard, goRemoveCaptures, goCountTerritory, getAIMove |
| 象棋 | `game/chess.js` | createChessBoard, getChessMoves, chessInCheck, chessHasLegalMove, getAIMove |

### 前端文件

| 文件 | 功能 |
|------|------|
| `game.js` | 登录认证、页面切换、主题切换、HTML安全转义 |
| `game2.js` | WebSocket连接、消息收发、断线重连、游戏指令 |
| `game3.js` | 三种棋盘绘制、通知/私信系统、个人主页、排行榜 |

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

## 游戏操作

### 五子棋
- 15x15棋盘，黑先白后
- 五子连珠获胜
- AI使用棋型评分+搜索算法

### 围棋
- 19x19棋盘，黑先白后
- 双方连续Pass后计算领地
- AI使用死活判断+眼位识别

### 中国象棋
- 标准象棋规则，红先黑后
- 将军/将杀判定
- AI使用位置价值表+走法排序

---

## 管理后台功能

1. **实时对局** - 查看当前所有进行中的游戏
2. **举报审核** - 处理用户举报（确认/驳回）
3. **申诉审核** - 处理封号申诉
4. **对局记录** - 查看历史游戏记录（含每步棋数据）
5. **聊天日志** - 查看聊天记录
6. **用户查询** - 查看用户信息、封禁管理、强制删除

---

## 数据存储

### MongoDB集合

| 集合 | 用途 | 保留策略 |
|------|------|---------|
| users | 用户账号 | 软删除保留7天 |
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

1. 首次使用前确保MongoDB已启动
2. `.env` 文件中的 `ADMIN_KEY` 两个服务器必须一致
3. 管理后台登录需要输入 `.env` 中设置的密钥
4. 聊天记录默认保留15天
5. 被删除的用户数据保留7天
6. WebSocket断线会自动重连（最多5次）
