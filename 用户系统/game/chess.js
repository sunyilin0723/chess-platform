// 中国象棋逻辑 + AI

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

function getChessMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const isRed = piece === piece.toLowerCase();
  const type = piece.toUpperCase();

  function inBoard(r, c) { return r >= 0 && r < 10 && c >= 0 && c < 9; }
  function isEnemy(r, c) { const p = board[r][c]; return p && (p === p.toUpperCase()) === isRed; }
  function isEmpty(r, c) { return inBoard(r, c) && !board[r][c]; }
  function canGo(r, c) { return inBoard(r, c) && (isEmpty(r, c) || isEnemy(r, c)); }

  if (type === 'K') {
    const [minR, maxR] = isRed ? [7, 9] : [0, 2];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5 && canGo(nr, nc)) moves.push([nr, nc]);
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
        if (!jumped) { if (isEmpty(nr, nc)) moves.push([nr, nc]); else jumped = true; }
        else { if (!isEmpty(nr, nc)) { if (isEnemy(nr, nc)) moves.push([nr, nc]); break; } }
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
    if (getChessMoves(board, rr, cc).some(([mr, mc]) => mr === r && mc === c)) return true;
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
    for (const [nr, nc] of getChessMoves(board, r, c)) {
      const saved = board[nr][nc]; board[nr][nc] = p; board[r][c] = '';
      const ok = !chessInCheck(board, color);
      board[r][c] = p; board[nr][nc] = saved;
      if (ok) return true;
    }
  }
  return false;
}

// 中国象棋AI
const CHESS_PIECE_VALUE = { K: 10000, A: 200, B: 200, N: 300, R: 1000, C: 500, P: 100 };
const POS_VALUE = {
  P: [[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[1,0,1,0,1,0,1,0,1],[2,0,2,0,2,0,2,0,2],[3,5,6,7,8,7,6,5,3],[5,8,9,10,12,10,9,8,5],[8,12,14,16,18,16,14,12,8],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0]],
  N: [[0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0],[0,1,2,1,0,1,2,1,0],[0,1,2,2,2,2,2,1,0],[0,1,2,3,3,3,2,1,0],[0,1,2,3,4,3,2,1,0],[0,1,2,3,3,3,2,1,0],[0,1,2,2,2,2,2,1,0],[0,0,1,0,0,0,1,0,0],[0,0,0,0,0,0,0,0,0]],
  R: [[0,0,0,0,0,0,0,0,0],[2,3,3,4,5,4,3,3,2],[2,3,3,4,5,4,3,3,2],[2,3,4,5,5,5,4,3,2],[2,3,4,5,6,5,4,3,2],[2,3,4,5,6,5,4,3,2],[2,3,4,5,5,5,4,3,2],[2,3,3,4,5,4,3,3,2],[2,3,3,4,5,4,3,3,2],[2,3,3,4,5,4,3,3,2]],
  C: [[0,0,0,0,0,0,0,0,0],[2,2,2,3,3,3,2,2,2],[2,2,2,2,3,2,2,2,2],[2,2,3,3,3,3,3,2,2],[2,3,3,3,4,3,3,3,2],[2,3,3,3,4,3,3,3,2],[2,2,3,3,3,3,3,2,2],[2,2,2,2,3,2,2,2,2],[2,2,2,3,3,3,2,2,2],[0,0,0,0,0,0,0,0,0]],
  K: [[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,1,1,1,0,0,0],[0,0,0,2,2,2,0,0,0],[0,0,0,3,3,3,0,0,0]],
  A: [[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,1,0,1,0,0,0],[0,0,0,0,2,0,0,0,0],[0,0,0,1,0,1,0,0,0]],
  B: [[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0],[0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,1,0,0]]
};

function chessPieceValue(piece, r, c) {
  if (!piece) return 0;
  const isRed = piece === piece.toLowerCase();
  const type = piece.toUpperCase();
  let val = CHESS_PIECE_VALUE[type] || 0;
  if (POS_VALUE[type]) { const pr = isRed ? (9 - r) : r; val += POS_VALUE[type][pr][c]; }
  return isRed ? val : -val;
}

function chessEvaluateBoard(board, aiColor) {
  let score = 0; let aiPieces = 0, opponentPieces = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c]) {
        const piece = board[r][c]; const isRed = piece === piece.toLowerCase();
        const pieceColor = isRed ? 1 : 2; const val = chessPieceValue(piece, r, c);
        if (pieceColor === aiColor) { score += Math.abs(val); aiPieces++; }
        else { score -= Math.abs(val); opponentPieces++; }
        if (piece.toUpperCase() === 'K') {
          if (chessIsAttacked(board, r, c, pieceColor === 1 ? 2 : 1)) {
            if (pieceColor === aiColor) score -= 200; else score += 200;
          }
        }
      }
    }
  }
  if (aiPieces > opponentPieces + 2) score += 100;
  if (opponentPieces > aiPieces + 2) score -= 100;
  return score;
}

function chessGetAllLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c]; if (!p) continue;
      const pColor = p === p.toUpperCase() ? 2 : 1;
      if (pColor !== color) continue;
      for (const [nr, nc] of getChessMoves(board, r, c)) {
        const saved = board[nr][nc]; board[nr][nc] = p; board[r][c] = '';
        if (!chessInCheck(board, color)) moves.push([r, c, nr, nc]);
        board[r][c] = p; board[nr][nc] = saved;
      }
    }
  }
  return moves;
}

function sortMoves(board, moves) {
  return moves.map(([fr, fc, tr, tc]) => {
    let score = 0; const captured = board[tr][tc];
    if (captured) score += CHESS_PIECE_VALUE[captured.toUpperCase()] || 0;
    const piece = board[fr][fc]; board[tr][tc] = piece; board[fr][fc] = '';
    if (chessInCheck(board, piece === piece.toLowerCase() ? 2 : 1)) score += 500;
    board[fr][fc] = piece; board[tr][tc] = captured;
    return { fr, fc, tr, tc, score };
  }).sort((a, b) => b.score - a.score);
}

function chessMinimax(board, depth, alpha, beta, isMaximizing, aiColor) {
  const opponent = aiColor === 1 ? 2 : 1; const currentColor = isMaximizing ? aiColor : opponent;
  if (!chessHasLegalMove(board, currentColor)) {
    const king = chessFindKing(board, currentColor);
    if (king && chessIsAttacked(board, king[0], king[1], opponent)) return isMaximizing ? -99999 + depth : 99999 - depth;
    return 0;
  }
  if (depth === 0) return chessEvaluateBoard(board, aiColor);
  const moves = chessGetAllLegalMoves(board, currentColor);
  if (moves.length === 0) return chessEvaluateBoard(board, aiColor);
  const sortedMoves = sortMoves(board, moves);
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { fr, fc, tr, tc } of sortedMoves) {
      const piece = board[fr][fc]; const captured = board[tr][tc];
      board[tr][tc] = piece; board[fr][fc] = '';
      const eval_ = chessMinimax(board, depth - 1, alpha, beta, false, aiColor);
      board[fr][fc] = piece; board[tr][tc] = captured;
      maxEval = Math.max(maxEval, eval_); alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { fr, fc, tr, tc } of sortedMoves) {
      const piece = board[fr][fc]; const captured = board[tr][tc];
      board[tr][tc] = piece; board[fr][fc] = '';
      const eval_ = chessMinimax(board, depth - 1, alpha, beta, true, aiColor);
      board[fr][fc] = piece; board[tr][tc] = captured;
      minEval = Math.min(minEval, eval_); beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAIMove(board, aiColor, difficulty) {
  const depths = { easy: 2, medium: 3, hard: 4 };
  const depth = depths[difficulty] || 2;
  const moves = chessGetAllLegalMoves(board, aiColor);
  if (moves.length === 0) return null;
  const sortedMoves = sortMoves(board, moves);
  let bestMove = null, bestScore = -Infinity;
  for (const { fr, fc, tr, tc } of sortedMoves) {
    const piece = board[fr][fc]; const captured = board[tr][tc];
    board[tr][tc] = piece; board[fr][fc] = '';
    const score = chessMinimax(board, depth - 1, -Infinity, Infinity, false, aiColor);
    board[fr][fc] = piece; board[tr][tc] = captured;
    const randomFactor = difficulty === 'easy' ? (Math.random() * 40 - 20) : 0;
    if (score + randomFactor > bestScore) { bestScore = score + randomFactor; bestMove = [fr, fc, tr, tc]; }
  }
  return bestMove;
}

module.exports = { createChessBoard, getChessMoves, chessFindKing, chessIsAttacked, chessInCheck, chessHasLegalMove, getAIMove };
