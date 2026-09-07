// 国际象棋逻辑 + AI

// 初始棋盘
function createIntlChessBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(''));
  b[0] = ['r','n','b','q','k','b','n','r']; // 黑方
  b[1] = ['p','p','p','p','p','p','p','p'];
  b[6] = ['P','P','P','P','P','P','P','P'];
  b[7] = ['R','N','B','Q','K','B','N','R']; // 白方
  return b;
}

// 判断棋子颜色：大写=白方(1)，小写=黑方(2)
function intlPieceColor(piece) {
  if (!piece) return 0;
  return piece === piece.toUpperCase() ? 1 : 2;
}

// 判断是否是敌人棋子
function isIntlEnemy(piece, myColor) {
  if (!piece) return false;
  return intlPieceColor(piece) !== myColor;
}

function isIntlFriendly(piece, myColor) {
  return intlPieceColor(piece) === myColor;
}

// 获取所有合法走法
function getIntlChessMoves(board, r, c, lastMove) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = intlPieceColor(piece);
  const type = piece.toUpperCase();
  const moves = [];

  function inBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function canGo(r, c) { return inBoard(r, c) && !isIntlFriendly(board[r][c], color); }

  if (type === 'P') {
    const dir = color === 1 ? -1 : 1; // 白方向上，黑方向下
    const startRow = color === 1 ? 6 : 1;
    const promotionRow = color === 1 ? 0 : 7;
    // 前进
    if (inBoard(r + dir, c) && !board[r + dir][c]) {
      if (r + dir === promotionRow) {
        ['q','r','b','n'].forEach(p => moves.push([r + dir, c, color === 1 ? p.toUpperCase() : p]));
      } else {
        moves.push([r + dir, c]);
      }
      // 初始两步
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push([r + 2 * dir, c]);
      }
    }
    // 吃子
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inBoard(nr, nc)) continue;
      if (board[nr][nc] && isIntlEnemy(board[nr][nc], color)) {
        if (nr === promotionRow) {
          ['q','r','b','n'].forEach(p => moves.push([nr, nc, color === 1 ? p.toUpperCase() : p]));
        } else {
          moves.push([nr, nc]);
        }
      }
      // 吃过路兵
      if (lastMove && lastMove.type === 'en_passant' && lastMove.tr === r && lastMove.tc === nc) {
        moves.push([nr, nc, 'en_passant']);
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      if (canGo(r + dr, c + dc)) moves.push([r + dr, c + dc]);
    }
  } else if (type === 'B') {
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBoard(nr, nc)) break;
        if (board[nr][nc]) {
          if (isIntlEnemy(board[nr][nc], color)) moves.push([nr, nc]);
          break;
        }
        moves.push([nr, nc]);
      }
    }
  } else if (type === 'R') {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBoard(nr, nc)) break;
        if (board[nr][nc]) {
          if (isIntlEnemy(board[nr][nc], color)) moves.push([nr, nc]);
          break;
        }
        moves.push([nr, nc]);
      }
    }
  } else if (type === 'Q') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      for (let i = 1; i < 8; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (!inBoard(nr, nc)) break;
        if (board[nr][nc]) {
          if (isIntlEnemy(board[nr][nc], color)) moves.push([nr, nc]);
          break;
        }
        moves.push([nr, nc]);
      }
    }
  } else if (type === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      if (canGo(r + dr, c + dc)) moves.push([r + dr, c + dc]);
    }
    // 王车易位
    const row = color === 1 ? 7 : 0;
    if (r === row && c === 4) {
      // 短易位
      const shortKey = color === 1 ? 'white_short' : 'black_short';
      if (!board[row][5] && !board[row][6] && board[row][7] && board[row][7].toUpperCase() === 'R' &&
          intlPieceColor(board[row][7]) === color && !lastMove?.castlingDone?.[shortKey]) {
        moves.push([row, 6, 'castle_short']);
      }
      // 长易位
      const longKey = color === 1 ? 'white_long' : 'black_long';
      if (!board[row][1] && !board[row][2] && !board[row][3] && board[row][0] && board[row][0].toUpperCase() === 'R' &&
          intlPieceColor(board[row][0]) === color && !lastMove?.castlingDone?.[longKey]) {
        moves.push([row, 2, 'castle_long']);
      }
    }
  }

  return moves;
}

// 检查王是否被将军
function isIntlKingInCheck(board, color) {
  // 找到王的位置
  let kingR = -1, kingC = -1;
  const king = color === 1 ? 'K' : 'k';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === king) { kingR = r; kingC = c; break; }
    }
    if (kingR >= 0) break;
  }
  if (kingR < 0) return true; // 王被吃了（不应该发生）

  // 检查对方所有棋子是否能攻击王
  const opponent = color === 1 ? 2 : 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (intlPieceColor(board[r][c]) === opponent) {
        const moves = getIntlChessMoves(board, r, c);
        if (moves.some(([mr, mc]) => mr === kingR && mc === kingC)) return true;
      }
    }
  }
  return false;
}

// 获取所有合法走法（排除自杀走法）
function getIntlChessLegalMoves(board, r, c, lastMove) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = intlPieceColor(piece);
  const moves = getIntlChessMoves(board, r, c, lastMove);

  return moves.filter(([nr, nc, special]) => {
    // 模拟走棋
    const saved = board[nr][nc];
    const savedSpecial = special === 'en_passant' ? board[r][nc] : null;
    board[nr][nc] = piece;
    board[r][c] = '';
    if (special === 'en_passant') board[r][nc] = ''; // 吃过路兵

    const inCheck = isIntlKingInCheck(board, color);

    // 还原
    board[r][c] = piece;
    board[nr][nc] = saved;
    if (special === 'en_passant') board[r][nc] = savedSpecial;

    return !inCheck;
  });
}

// 检查是否有合法走法
function intlHasLegalMoves(board, color, lastMove) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (intlPieceColor(board[r][c]) === color) {
        if (getIntlChessLegalMoves(board, r, c, lastMove).length > 0) return true;
      }
    }
  }
  return false;
}

// 执行走棋
function makeIntlMove(board, fr, fc, tr, tc, special, lastMove) {
  const piece = board[fr][fc];
  const color = intlPieceColor(piece);
  const captured = board[tr][tc];
  const newLastMove = { fr, fc, tr, tc, type: 'move', color };

  board[tr][tc] = piece;
  board[fr][fc] = '';

  // 吃过路兵
  if (special === 'en_passant') {
    board[fr][tc] = ''; // 吃掉过路兵
    newLastMove.type = 'en_passant';
  }

  // 王车易位
  if (special === 'castle_short') {
    board[tr][tc - 1] = board[tr][tc + 1]; // 车移到王旁边
    board[tr][tc + 1] = '';
    newLastMove.type = 'castle_short';
  } else if (special === 'castle_long') {
    board[tr][tc + 1] = board[tr][tc - 2]; // 车移到王旁边
    board[tr][tc - 2] = '';
    newLastMove.type = 'castle_long';
  }

  // 兵升变
  if (special && typeof special === 'string' && ['q','r','b','n'].includes(special)) {
    board[tr][tc] = color === 1 ? special.toUpperCase() : special;
    newLastMove.promotion = special;
  }

  return { captured, newLastMove };
}

// 检查是否将军
function intlCheck(board, color) {
  return isIntlKingInCheck(board, color);
}

// 检查是否将杀
function intlCheckmate(board, color, lastMove) {
  if (!isIntlKingInCheck(board, color)) return false;
  return !intlHasLegalMoves(board, color, lastMove);
}

// 检查是否逼和
function intlStalemate(board, color, lastMove) {
  if (isIntlKingInCheck(board, color)) return false;
  return !intlHasLegalMoves(board, color, lastMove);
}

// ==================== 国际象棋AI ====================
const INTL_PIECE_VALUE = { K: 10000, Q: 900, R: 500, B: 330, N: 320, P: 100 };

// 位置价值表
const INTL_POS_VALUE = {
  P: [
    [0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],
    [10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],
    [0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],[-30,5,15,20,20,15,5,-30],
    [-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
    [-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],
    [-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],
    [-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  R: [
    [0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]
  ],
  Q: [
    [-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]
  ]
};

function intlPieceValue(piece, r, c) {
  if (!piece) return 0;
  const color = intlPieceColor(piece);
  const type = piece.toUpperCase();
  let val = INTL_PIECE_VALUE[type] || 0;
  if (INTL_POS_VALUE[type]) {
    const pr = color === 1 ? r : 7 - r;
    val += INTL_POS_VALUE[type][pr][c];
  }
  return color === 1 ? val : -val;
}

function intlEvaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      score += intlPieceValue(board[r][c], r, c);
    }
  }
  return score;
}

function intlGetAllLegalMoves(board, color, lastMove) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (intlPieceColor(board[r][c]) === color) {
        const pieceMoves = getIntlChessLegalMoves(board, r, c, lastMove);
        for (const [nr, nc, special] of pieceMoves) {
          moves.push([r, c, nr, nc, special]);
        }
      }
    }
  }
  return moves;
}

function intlSortMoves(board, moves) {
  return moves.map(([fr, fc, tr, tc, special]) => {
    let score = 0;
    const captured = board[tr][tc];
    if (captured) score += INTL_PIECE_VALUE[captured.toUpperCase()] || 0;
    if (special === 'castle_short' || special === 'castle_long') score += 60;
    if (special && typeof special === 'string' && ['q','r','b','n'].includes(special)) score += 800;
    return { fr, fc, tr, tc, special, score };
  }).sort((a, b) => b.score - a.score);
}

function intlMinimax(board, depth, alpha, beta, isMaximizing, lastMove) {
  const color = isMaximizing ? 1 : 2;
  const opponent = isMaximizing ? 2 : 1;

  if (intlCheckmate(board, color, lastMove)) return isMaximizing ? -99999 + depth : 99999 - depth;
  if (intlStalemate(board, color, lastMove)) return 0;

  if (depth === 0) return intlEvaluateBoard(board);

  const moves = intlGetAllLegalMoves(board, color, lastMove);
  const sortedMoves = intlSortMoves(board, moves);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { fr, fc, tr, tc, special } of sortedMoves) {
      const piece = board[fr][fc]; const captured = board[tr][nc || tc];
      const { newLastMove } = intlMove_and_restore(board, fr, fc, tr, tc, special);
      const eval_ = intlMinimax(board, depth - 1, alpha, beta, false, newLastMove);
      intlUndoMove(board, fr, fc, tr, tc, special, captured, newLastMove);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { fr, fc, tr, tc, special } of sortedMoves) {
      const piece = board[fr][fc]; const captured = board[tr][nc || tc];
      const { newLastMove } = intlMove_and_restore(board, fr, fc, tr, tc, special);
      const eval_ = intlMinimax(board, depth - 1, alpha, beta, true, newLastMove);
      intlUndoMove(board, fr, fc, tr, tc, special, captured, newLastMove);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// 辅助函数：走棋并返回新状态
function intlMove_and_restore(board, fr, fc, tr, tc, special) {
  const piece = board[fr][fc];
  const captured = board[tr][tc];
  const color = intlPieceColor(piece);

  board[tr][tc] = piece;
  board[fr][fc] = '';

  let enPassantCaptured = null;
  if (special === 'en_passant') {
    enPassantCaptured = board[fr][tc];
    board[fr][tc] = '';
  }

  let rookSaved = null, rookFrom = null, rookTo = null;
  if (special === 'castle_short') {
    rookSaved = board[tr][tc + 1]; rookFrom = [tr, tc + 1]; rookTo = [tr, tc - 1];
    board[tr][tc - 1] = board[tr][tc + 1]; board[tr][tc + 1] = '';
  } else if (special === 'castle_long') {
    rookSaved = board[tr][tc - 2]; rookFrom = [tr, tc - 2]; rookTo = [tr, tc + 1];
    board[tr][tc + 1] = board[tr][tc - 2]; board[tr][tc - 2] = '';
  }

  let promotionSaved = null;
  if (special && ['q','r','b','n'].includes(special)) {
    promotionSaved = piece;
    board[tr][tc] = color === 1 ? special.toUpperCase() : special;
  }

  const newLastMove = { fr, fc, tr, tc, color, type: special || 'move' };

  return { captured, newLastMove, enPassantCaptured, rookSaved, rookFrom, rookTo, promotionSaved };
}

function intlUndoMove(board, fr, fc, tr, tc, special, captured, newLastMove) {
  const piece = board[tr][tc];
  const color = intlPieceColor(piece);

  board[fr][fc] = piece;
  board[tr][tc] = captured;

  if (special === 'en_passant') board[fr][tc] = newLastMove.enPassantCaptured;
  if (special === 'castle_short') { board[newLastMove.rookFrom[0]][newLastMove.rookFrom[1]] = newLastMove.rookSaved; board[newLastMove.rookTo[0]][newLastMove.rookTo[1]] = ''; }
  if (special === 'castle_long') { board[newLastMove.rookFrom[0]][newLastMove.rookFrom[1]] = newLastMove.rookSaved; board[newLastMove.rookTo[0]][newLastMove.rookTo[1]] = ''; }
}

// AI走棋
function intlGetAIMove(board, difficulty, lastMove) {
  const depths = { easy: 1, medium: 2, hard: 3 };
  const depth = depths[difficulty] || 1;

  const moves = intlGetAllLegalMoves(board, 1, lastMove); // AI总是白方
  if (moves.length === 0) return null;

  const sortedMoves = intlSortMoves(board, moves);
  let bestMove = null, bestScore = -Infinity;

  for (const { fr, fc, tr, tc, special } of sortedMoves) {
    const { captured, newLastMove, enPassantCaptured, rookSaved, rookFrom, rookTo, promotionSaved } = intlMove_and_restore(board, fr, fc, tr, tc, special);
    const score = intlMinimax(board, depth - 1, -Infinity, Infinity, false, newLastMove);
    intlUndoMove(board, fr, fc, tr, tc, special, captured, { ...newLastMove, enPassantCaptured, rookSaved, rookFrom, rookTo });

    const randomFactor = difficulty === 'easy' ? (Math.random() * 40 - 20) : 0;
    if (score + randomFactor > bestScore) {
      bestScore = score + randomFactor;
      bestMove = { fr, fc, tr, tc, special };
    }
  }
  return bestMove;
}

module.exports = { createIntlChessBoard, intlPieceColor, getIntlChessMoves, getIntlChessLegalMoves, intlHasLegalMoves, makeIntlMove, intlCheck, intlCheckmate, intlStalemate, intlGetAIMove };
