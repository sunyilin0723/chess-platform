// 五子棋逻辑 + AI

function createGomokuBoard(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }

// ==================== 禁手检测 ====================
// 检测某个方向的连子数和类型
function countLine(board, r, c, dr, dc, color, size) {
  let count = 1, openEnds = 0;
  // 正方向
  let i = 1;
  while (true) {
    const nr = r + dr * i, nc = c + dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else break;
  }
  // 反方向
  i = 1;
  while (true) {
    const nr = r - dr * i, nc = c - dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else break;
  }
  return { count, openEnds };
}

// 检测某个方向是否是活三
// 活三：三颗连子，两端都有空位，且延伸后能形成活四
function isOpenThreeAt(board, r, c, dr, dc, color, size) {
  const { count, openEnds } = countLine(board, r, c, dr, dc, color, size);
  if (count !== 3 || openEnds !== 2) return false;
  
  // 检查延伸后是否能形成活四（两端都有空位的四）
  // 正方向延伸
  let canFormFour1 = false;
  for (let i = 1; i <= 3; i++) {
    const nr = r + dr * i, nc = c + dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === 0) {
      // 假设在此落子
      board[nr][nc] = color;
      const { count: c4, openEnds: o4 } = countLine(board, nr, nc, dr, dc, color, size);
      board[nr][nc] = 0;
      if (c4 === 4 && o4 >= 1) { canFormFour1 = true; break; }
      break;
    }
  }
  
  // 反方向延伸
  let canFormFour2 = false;
  for (let i = 1; i <= 3; i++) {
    const nr = r - dr * i, nc = c - dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === 0) {
      board[nr][nc] = color;
      const { count: c4, openEnds: o4 } = countLine(board, nr, nc, dr, dc, color, size);
      board[nr][nc] = 0;
      if (c4 === 4 && o4 >= 1) { canFormFour2 = true; break; }
      break;
    }
  }
  
  return canFormFour1 || canFormFour2;
}

// 检测是否是活三（两端都能延伸成活四的三）
function isOpenThree(board, r, c, color, size) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  let threeCount = 0;
  for (const [dr, dc] of dirs) {
    if (isOpenThreeAt(board, r, c, dr, dc, color, size)) threeCount++;
  }
  return threeCount;
}

// 检测是否是四（能形成五子的四）
function isFour(board, r, c, color, size) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  let fourCount = 0;
  for (const [dr, dc] of dirs) {
    const { count, openEnds } = countLine(board, r, c, dr, dc, color, size);
    if (count === 4 && openEnds >= 1) fourCount++;
  }
  return fourCount;
}

// 检测长连（超过五子的连珠）
function isOverline(board, r, c, color, size) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    const { count } = countLine(board, r, c, dr, dc, color, size);
    if (count > 5) return true;
  }
  return false;
}

// 检查是否是禁手（只对黑棋/color=1生效）
function isForbiddenMove(board, r, c, color) {
  if (color !== 1) return false; // 禁手只针对黑棋

  // 先临时落子
  board[r][c] = color;

  // 五连不算禁手（五连优先）
  if (checkGomokuWin(board, r, c, color)) {
    board[r][c] = 0;
    return false;
  }

  // 长连禁手
  if (isOverline(board, r, c, color, 15)) {
    board[r][c] = 0;
    return { forbidden: true, type: '长连禁手' };
  }

  // 四四禁手
  const fourCount = isFour(board, r, c, color, 15);
  if (fourCount >= 2) {
    board[r][c] = 0;
    return { forbidden: true, type: '四四禁手' };
  }

  // 三三禁手
  const threeCount = isOpenThree(board, r, c, color, 15);
  if (threeCount >= 2) {
    board[r][c] = 0;
    return { forbidden: true, type: '三三禁手' };
  }

  board[r][c] = 0;
  return false;
}

function checkGomokuWin(board, r, c, color) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let i = 1; i < 5; i++) { const nr = r + dr*i, nc = c + dc*i; if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === color) count++; else break; }
    for (let i = 1; i < 5; i++) { const nr = r - dr*i, nc = c - dc*i; if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && board[nr][nc] === color) count++; else break; }
    if (count >= 5) return true;
  }
  return false;
}

// ==================== 五子棋AI ====================
const GOMOKU_SCORES = { FIVE: 1000000, OPEN_FOUR: 100000, FOUR: 10000, OPEN_THREE: 5000, THREE: 500, OPEN_TWO: 200, TWO: 50, ONE: 10 };

function analyzeLine(board, r, c, dr, dc, color, size) {
  let count = 1, openEnds = 0, blocks = 0;
  let i = 1;
  while (true) {
    const nr = r + dr * i, nc = c + dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { blocks++; break; }
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else { blocks++; break; }
  }
  i = 1;
  while (true) {
    const nr = r - dr * i, nc = c - dc * i;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { blocks++; break; }
    if (board[nr][nc] === color) { count++; i++; }
    else if (board[nr][nc] === 0) { openEnds++; break; }
    else { blocks++; break; }
  }
  return { count, openEnds, blocks };
}

function evaluatePosition(board, r, c, color, size) {
  if (board[r][c] !== color) return 0;
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  let totalScore = 0;
  for (const [dr, dc] of dirs) {
    const { count, openEnds } = analyzeLine(board, r, c, dr, dc, color, size);
    if (count >= 5) totalScore += GOMOKU_SCORES.FIVE;
    else if (count === 4) { if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_FOUR; else if (openEnds === 1) totalScore += GOMOKU_SCORES.FOUR; }
    else if (count === 3) { if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_THREE; else if (openEnds === 1) totalScore += GOMOKU_SCORES.THREE; }
    else if (count === 2) { if (openEnds === 2) totalScore += GOMOKU_SCORES.OPEN_TWO; else if (openEnds === 1) totalScore += GOMOKU_SCORES.TWO; }
    else if (count === 1) { if (openEnds === 2) totalScore += GOMOKU_SCORES.ONE; }
  }
  return totalScore;
}

function evaluateBoard(board, aiColor, size) {
  let score = 0;
  const humanColor = aiColor === 1 ? 2 : 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === aiColor) score += evaluatePosition(board, r, c, aiColor, size);
      else if (board[r][c] === humanColor) score -= evaluatePosition(board, r, c, humanColor, size) * 1.15;
    }
  }
  const center = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        const dist = Math.abs(r - center) + Math.abs(c - center);
        const posBonus = Math.max(0, 10 - dist);
        if (board[r][c] === aiColor) score += posBonus; else score -= posBonus;
      }
    }
  }
  return score;
}

function getCandidateMoves(board, size) {
  const candidates = new Set();
  const dirs = [-2, -1, 0, 1, 2];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        for (const dr of dirs) {
          for (const dc of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) candidates.add(nr * size + nc);
          }
        }
      }
    }
  }
  if (candidates.size === 0) candidates.add(7 * size + 7);
  return [...candidates].map(pos => [Math.floor(pos / size), pos % size]);
}

function checkWinFast(board, r, c, color, size) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let i = 1; i < 5; i++) { const nr = r + dr*i, nc = c + dc*i; if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) count++; else break; }
    for (let i = 1; i < 5; i++) { const nr = r - dr*i, nc = c - dc*i; if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) count++; else break; }
    if (count >= 5) return true;
  }
  return false;
}

function minimax(board, depth, alpha, beta, isMaximizing, aiColor, size) {
  const humanColor = aiColor === 1 ? 2 : 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === aiColor && checkWinFast(board, r, c, aiColor, size)) return 1000000 + depth;
      if (board[r][c] === humanColor && checkWinFast(board, r, c, humanColor, size)) return -1000000 - depth;
    }
  }
  if (depth === 0) return evaluateBoard(board, aiColor, size);
  const candidates = getCandidateMoves(board, size);
  const scoredMoves = candidates.map(([r, c]) => {
    board[r][c] = isMaximizing ? aiColor : humanColor;
    const score = evaluateBoard(board, aiColor, size);
    board[r][c] = 0;
    return { r, c, score };
  }).sort((a, b) => isMaximizing ? b.score - a.score : a.score - b.score);
  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { r, c } of scoredMoves) {
      board[r][c] = aiColor;
      const eval_ = minimax(board, depth - 1, alpha, beta, false, aiColor, size);
      board[r][c] = 0;
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { r, c } of scoredMoves) {
      board[r][c] = humanColor;
      const eval_ = minimax(board, depth - 1, alpha, beta, true, aiColor, size);
      board[r][c] = 0;
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getAIMove(board, aiColor, difficulty, size) {
  const depths = { easy: 2, medium: 3, hard: 5 };
  const depth = depths[difficulty] || 2;
  const candidates = getCandidateMoves(board, size);
  let bestMove = null, bestScore = -Infinity;
  for (const [r, c] of candidates) {
    board[r][c] = aiColor;
    const score = minimax(board, depth - 1, -Infinity, Infinity, false, aiColor, size);
    board[r][c] = 0;
    const randomFactor = difficulty === 'easy' ? (Math.random() * 40 - 20) : 0;
    if (score + randomFactor > bestScore) { bestScore = score + randomFactor; bestMove = [r, c]; }
  }
  return bestMove || [7, 7];
}

module.exports = { createGomokuBoard, checkGomokuWin, getAIMove, isForbiddenMove };
