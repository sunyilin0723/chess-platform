// 围棋逻辑 + AI

function createGoBoard(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }

function getGoLiberties(board, r, c, size) {
  const color = board[r][c];
  if (!color) return { liberties: 0, group: [] };
  const visited = new Set();
  let liberties = 0;
  const queue = [[r, c]];
  visited.add(r * size + c);
  const group = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr * size + nc;
      if (visited.has(key)) continue;
      if (board[nr][nc] === color) { visited.add(key); queue.push([nr, nc]); group.push([nr, nc]); }
      else if (board[nr][nc] === 0) liberties++;
    }
  }
  return { liberties, group };
}

function goRemoveCaptures(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  let captured = 0;
  for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (board[nr][nc] === opponent) {
      const { liberties, group } = getGoLiberties(board, nr, nc, size);
      if (liberties === 0) { group.forEach(([gr, gc]) => { board[gr][gc] = 0; captured++; }); }
    }
  }
  const selfCheck = getGoLiberties(board, r, c, size);
  if (selfCheck.liberties === 0) { selfCheck.group.forEach(([gr, gc]) => { board[gr][gc] = 0; }); return -1; }
  return captured;
}

function goCountTerritory(board, size) {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let blackScore = 0, whiteScore = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0 || visited[r][c]) continue;
      const region = []; const queue = [[r, c]]; visited[r][c] = true; let borderColors = new Set();
      while (queue.length) {
        const [cr, cc] = queue.shift(); region.push([cr, cc]);
        for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (visited[nr][nc]) continue;
          if (board[nr][nc] !== 0) { borderColors.add(board[nr][nc]); }
          else { visited[nr][nc] = true; queue.push([nr, nc]); }
        }
      }
      if (borderColors.size === 1) { const color = [...borderColors][0]; if (color === 1) blackScore += region.length; else whiteScore += region.length; }
    }
  }
  return { black: blackScore, white: whiteScore };
}

// 围棋AI
const GO_STAR_POINTS_19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
const GO_STAR_POINTS_15 = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
const GO_STAR_POINTS_13 = [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]];

function goGetLegalMoves(board, color, size) {
  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) continue;
      const testBoard = board.map(row => [...row]);
      testBoard[r][c] = color;
      const captures = goRemoveCaptures(testBoard, r, c, color, size);
      if (captures === -1) continue;
      const { liberties } = getGoLiberties(testBoard, r, c, size);
      if (liberties > 0 || captures > 0) moves.push([r, c]);
    }
  }
  return moves;
}

function isTrueEye(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  const isCorner = (r === 0 || r === size-1) && (c === 0 || c === size-1);
  const isEdge = r === 0 || r === size-1 || c === 0 || c === size-1;
  let friendlyCount = 0;
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (board[nr][nc] === color) friendlyCount++;
    else if (board[nr][nc] === opponent) return false;
  }
  if (isCorner) return friendlyCount >= 2;
  if (isEdge) return friendlyCount >= 3;
  return friendlyCount >= 4;
}

function countGroupEyes(board, group, color, size) {
  let eyes = 0; const eyeSet = new Set();
  for (const [r, c] of group) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) {
        const key = nr * size + nc;
        if (!eyeSet.has(key) && isTrueEye(board, nr, nc, color, size)) { eyeSet.add(key); eyes++; }
      }
    }
  }
  return eyes;
}

function evaluateGroupLife(board, group, color, size) {
  const { liberties } = getGoLiberties(board, group[0][0], group[0][1], size);
  const eyes = countGroupEyes(board, group, color, size);
  if (eyes >= 2) return 1000;
  if (eyes === 1 && liberties > 3) return 500;
  if (liberties > 6) return 300; if (liberties > 4) return 200; if (liberties > 2) return 100;
  if (liberties === 1) return -100;
  return 0;
}

function goEvaluateBoard(board, aiColor, size) {
  const opponent = aiColor === 1 ? 2 : 1; let score = 0; const visited = new Set();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== 0) {
        const key = r * size + c; if (visited.has(key)) continue;
        const { liberties, group } = getGoLiberties(board, r, c, size);
        const color = board[r][c]; const groupScore = evaluateGroupLife(board, group, color, size);
        group.forEach(([gr, gc]) => visited.add(gr * size + gc));
        if (color === aiColor) score += groupScore + liberties * 5; else score -= groupScore + liberties * 5;
      }
    }
  }
  return score;
}

function goPositionScore(r, c, size, moveCount) {
  let score = 0;
  if (moveCount < 20) {
    const starPoints = size === 19 ? GO_STAR_POINTS_19 : (size === 15 ? GO_STAR_POINTS_15 : GO_STAR_POINTS_13);
    for (const [sr, sc] of starPoints) {
      if (r === sr && c === sc) score += 100; else if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) score += 50;
    }
  }
  const center = (size - 1) / 2; score += Math.max(0, 10 - Math.abs(r - center) - Math.abs(c - center));
  return score;
}

function getAIMove(board, aiColor, difficulty, size) {
  const opponent = aiColor === 1 ? 2 : 1;
  const moves = goGetLegalMoves(board, aiColor, size);
  if (moves.length === 0) return null;

  let isEmpty = true;
  for (let r = 0; r < size; r++) { for (let c = 0; c < size; c++) { if (board[r][c] !== 0) { isEmpty = false; break; } } if (!isEmpty) break; }
  if (isEmpty) {
    const corners = size === 19 ? [[3,3],[3,15],[15,3],[15,15]] : (size === 15 ? [[3,3],[3,11],[11,3],[11,15]] : [[3,3],[3,9],[9,3],[9,9]]);
    return corners[Math.floor(Math.random() * corners.length)];
  }

  let bestMove = null, bestScore = -Infinity;
  const moveCount = board.flat().filter(x => x !== 0).length;

  for (const [r, c] of moves) {
    const testBoard = board.map(row => [...row]);
    testBoard[r][c] = aiColor;
    const captures = goRemoveCaptures(testBoard, r, c, aiColor, size);
    if (captures === -1) continue;

    let score = goPositionScore(r, c, size, moveCount);
    if (captures > 0) score += captures * 80;
    const { liberties } = getGoLiberties(testBoard, r, c, size);
    score += liberties * 5;
    const testGroup = getGoLiberties(testBoard, r, c, size).group;
    const eyes = countGroupEyes(testGroup, testBoard, aiColor, size);
    if (eyes >= 2) score += 500; if (eyes === 1) score += 200;
    if (liberties <= 2) score -= 100;

    if (difficulty !== 'easy') {
      let maxThreat = 0;
      const opponentMoves = goGetLegalMoves(testBoard, opponent, size);
      for (const [or, oc] of opponentMoves.slice(0, 15)) {
        const oppBoard = testBoard.map(row => [...row]);
        oppBoard[or][oc] = opponent;
        const oppCaptures = goRemoveCaptures(oppBoard, or, oc, opponent, size);
        if (oppCaptures > maxThreat) maxThreat = oppCaptures;
      }
      score -= maxThreat * 60;
    }

    if (difficulty === 'hard') {
      score += goEvaluateBoard(testBoard, aiColor, size) * 0.3;
    }

    if (difficulty === 'easy') score += Math.random() * 25 - 12;
    if (score > bestScore) { bestScore = score; bestMove = [r, c]; }
  }
  return bestMove;
}

module.exports = { createGoBoard, getGoLiberties, goRemoveCaptures, goCountTerritory, getAIMove };
