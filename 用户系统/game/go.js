// 围棋逻辑 + AI

function createGoBoard(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }

const GO_DIRS = [[0,1],[0,-1],[1,0],[-1,0]];

function getGoLiberties(board, r, c, size) {
  const color = board[r][c];
  if (!color) return { liberties: 0, group: [] };
  const visited = new Set();
  const libertySet = new Set();
  const queue = [[r, c]];
  visited.add(r * size + c);
  const group = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [dr, dc] of GO_DIRS) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const key = nr * size + nc;
      if (visited.has(key)) continue;
      if (board[nr][nc] === color) { visited.add(key); queue.push([nr, nc]); group.push([nr, nc]); }
      else if (board[nr][nc] === 0) libertySet.add(key);
    }
  }
  return { liberties: libertySet.size, group };
}

function goRemoveCaptures(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  let captured = 0;
  for (const [dr, dc] of GO_DIRS) {
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

function isTrueEye(board, r, c, color, size) {
  const opponent = color === 1 ? 2 : 1;
  const isCorner = (r === 0 || r === size-1) && (c === 0 || c === size-1);
  const isEdge = !isCorner && (r === 0 || r === size-1 || c === 0 || c === size-1);
  let orthCount = 0;
  for (const [dr, dc] of GO_DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (board[nr][nc] === color) orthCount++;
    else if (board[nr][nc] === opponent) return false;
  }
  if (isCorner && orthCount < 2) return false;
  if (isEdge && orthCount < 3) return false;
  if (!isCorner && !isEdge && orthCount < 4) return false;
  let diagFriend = 0;
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    if (board[nr][nc] === color || board[nr][nc] === 0) diagFriend++;
  }
  const needed = isCorner ? 1 : (isEdge ? 2 : 3);
  return diagFriend >= needed;
}

function countGroupEyes(board, group, color, size) {
  let eyes = 0; const eyeSet = new Set();
  for (const [r, c] of group) {
    for (const [dr, dc] of GO_DIRS) {
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

function goCountTerritory(board, size) {
  const b = board.map(row => [...row]);
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  const deadCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (b[r][c] === 0 || seen[r][c]) continue;
      const color = b[r][c];
      const { group } = getGoLiberties(b, r, c, size);
      group.forEach(([gr, gc]) => { seen[gr][gc] = true; });
      if (evaluateGroupLife(b, group, color, size) < 0) deadCells.push(...group);
    }
  }
  deadCells.forEach(([dr, dc]) => { b[dr][dc] = 0; });

  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let blackScore = 0, whiteScore = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (b[r][c] !== 0 || visited[r][c]) continue;
      const region = []; const queue = [[r, c]]; visited[r][c] = true; const borderColors = new Set();
      while (queue.length) {
        const [cr, cc] = queue.shift(); region.push([cr, cc]);
        for (const [dr, dc] of GO_DIRS) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          if (visited[nr][nc]) continue;
          if (b[nr][nc] !== 0) { borderColors.add(b[nr][nc]); }
          else { visited[nr][nc] = true; queue.push([nr, nc]); }
        }
      }
      if (borderColors.size === 1) { const color = [...borderColors][0]; if (color === 1) blackScore += region.length; else whiteScore += region.length; }
    }
  }
  return { black: blackScore, white: whiteScore };
}

// ---- MCTS ----
const MCTS_MS = { easy: 250, medium: 700, hard: 1400 };
const MCTS_C = 1.4;

function goPlayOn(board, r, c, color, size) {
  board[r][c] = color;
  return goRemoveCaptures(board, r, c, color, size);
}

function goNearbyEmpties(board, size, dist) {
  const pts = []; const seen = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!board[r][c]) continue;
    for (let dr = -dist; dr <= dist; dr++) for (let dc = -dist; dc <= dist; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size || board[nr][nc]) continue;
      const k = nr * size + nc;
      if (!seen[k]) { seen[k] = 1; pts.push([nr, nc]); }
    }
  }
  return pts;
}

function goShuffleSample(pts, n) {
  if (pts.length <= n) return pts;
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pts.length - i));
    const t = pts[i]; pts[i] = pts[j]; pts[j] = t;
  }
  return pts.slice(0, n);
}

function goLegalFromPts(board, pts, color, size, limit) {
  let sample = pts;
  if (sample.length > limit) {
    sample = sample.map(([r, c]) => ({ r, c, w: goCheapWeight(board, r, c, color, size) }));
    sample.sort((a, b) => b.w - a.w);
    sample = sample.slice(0, limit).map(p => [p.r, p.c]);
  }
  const moves = [];
  for (const [r, c] of sample) {
    const tb = board.map(row => [...row]);
    if (goPlayOn(tb, r, c, color, size) >= 0) moves.push([r, c]);
  }
  return moves;
}

function goCheapWeight(board, r, c, color, size) {
  let w = 1;
  const opp = 3 - color;
  for (const [dr, dc] of GO_DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
    const v = board[nr][nc];
    if (v === opp) {
      const { liberties } = getGoLiberties(board, nr, nc, size);
      if (liberties <= 1) w += 10; else if (liberties === 2) w += 2;
    } else if (v === color) {
      const { liberties } = getGoLiberties(board, nr, nc, size);
      if (liberties === 1) w += 3;
    }
  }
  return w;
}

function goSimCandidates(board, color, size, want) {
  let pts = goNearbyEmpties(board, size, 2);
  if (!pts.length) {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!board[r][c]) pts.push([r, c]);
    if (!pts.length) return [];
    const p = pts[Math.floor(Math.random() * pts.length)];
    return [{ r: p[0], c: p[1], w: 1 }];
  }
  pts = goShuffleSample(pts, want);
  const scored = [];
  for (const [r, c] of pts) scored.push({ r, c, w: goCheapWeight(board, r, c, color, size) });
  return scored;
}

function goPickWeighted(scored) {
  let total = 0;
  for (const s of scored) total += s.w;
  let x = Math.random() * total;
  for (const s of scored) { x -= s.w; if (x <= 0) return [s.r, s.c]; }
  const s = scored[scored.length - 1];
  return [s.r, s.c];
}

function goFastDiff(board, size) {
  const seen = new Uint8Array(size * size);
  let black = 0, white = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (board[r][c] !== 0 || seen[r * size + c]) continue;
    const q = [[r, c]]; seen[r * size + c] = 1;
    let n = 0, bN = 0, wN = 0;
    while (q.length) {
      const [cr, cc] = q.pop(); n++;
      for (const [dr, dc] of GO_DIRS) {
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const v = board[nr][nc];
        if (v === 1) bN = 1; else if (v === 2) wN = 1;
        else if (!v) {
          const k = nr * size + nc;
          if (!seen[k]) { seen[k] = 1; q.push([nr, nc]); }
        }
      }
    }
    if (bN && !wN) black += n; else if (wN && !bN) white += n;
  }
  return black - white;
}

// 黑胜=1 白胜=0 平=0.5；与服务端一致：提子+单色围空、无贴目
function goRollout(startBoard, toPlay, size, maxPlies, caps) {
  const b = startBoard.map(row => [...row]);
  const cap = [caps[0], caps[1]];
  let color = toPlay, passes = 0;
  for (let ply = 0; ply < maxPlies; ply++) {
    const cands = goSimCandidates(b, color, size, 14);
    if (!cands.length) {
      if (++passes >= 2) break;
      color = 3 - color;
      continue;
    }
    const mv = goPickWeighted(cands);
    const capN = goPlayOn(b, mv[0], mv[1], color, size);
    if (capN < 0) {
      if (++passes >= 2) break;
      color = 3 - color;
      continue;
    }
    if (capN > 0) cap[color - 1] += capN;
    passes = 0;
    color = 3 - color;
  }
  const diff = (cap[0] - cap[1]) + goFastDiff(b, size);
  return diff > 0 ? 1 : (diff < 0 ? 0 : 0.5);
}

// wins 存黑方累计胜；parent.toPlay 决定选择方向
function goUctSelect(children, parentVisits, parentToPlay) {
  let best = null, bestScore = -Infinity;
  for (const ch of children) {
    let score;
    if (ch.visits === 0) score = Infinity;
    else {
      const wr = ch.wins / ch.visits;
      const forP = parentToPlay === 1 ? wr : 1 - wr;
      score = forP + MCTS_C * Math.sqrt(Math.log(parentVisits + 1) / ch.visits);
    }
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

function getAIMove(board, aiColor, difficulty, size) {
  let empty = true;
  for (let r = 0; r < size && empty; r++) for (let c = 0; c < size; c++) if (board[r][c]) { empty = false; break; }
  if (empty) {
    const corners = size === 19 ? [[3,3],[3,15],[15,3],[15,15]] : (size === 15 ? [[3,3],[3,11],[11,3],[11,11]] : [[3,3],[3,9],[9,3],[9,9]]);
    return corners[Math.floor(Math.random() * corners.length)];
  }

  const nearby = goNearbyEmpties(board, size, 2);
  const rootMoves = goLegalFromPts(board, nearby.slice(), aiColor, size, 72);
  if (!rootMoves.length) return null;
  rootMoves.push(null);

  const budget = MCTS_MS[difficulty] || MCTS_MS.medium;
  const deadline = Date.now() + budget;
  const maxPlies = size >= 19 ? 50 : (size >= 13 ? 36 : 28);
  const root = {
    board: board.map(row => [...row]),
    toPlay: aiColor,
    children: [],
    untried: rootMoves,
    visits: 0,
    wins: 0,
    parent: null,
    caps: [0, 0],
    move: null
  };
  let iterations = 0;

  while (Date.now() < deadline) {
    let node = root;
    while (!node.untried.length && node.children.length) {
      const nx = goUctSelect(node.children, node.visits, node.toPlay);
      if (!nx) break;
      node = nx;
    }

    if (node.untried.length) {
      const idx = Math.floor(Math.random() * node.untried.length);
      const a = node.untried.splice(idx, 1)[0];
      const nb = node.board.map(row => [...row]);
      const ncaps = [node.caps[0], node.caps[1]];
      if (a) {
        const capN = goPlayOn(nb, a[0], a[1], node.toPlay, size);
        if (capN < 0) {
          node.untried.push(a);
          continue;
        }
        if (capN > 0) ncaps[node.toPlay - 1] += capN;
      }
      const child = {
        board: nb,
        toPlay: 3 - node.toPlay,
        children: [],
        untried: a ? goLegalFromPts(nb, goNearbyEmpties(nb, size, 2), 3 - node.toPlay, size, 20) : [],
        visits: 0,
        wins: 0,
        parent: node,
        caps: ncaps,
        move: a
      };
      node.children.push(child);
      node = child;
    }

    const blackWin = goRollout(node.board, node.toPlay, size, maxPlies, node.caps);
    let n = node;
    while (n) {
      n.visits++;
      n.wins += blackWin;
      n = n.parent;
    }
    iterations++;
    if (iterations % 16 === 0 && Date.now() >= deadline) break;
  }

  if (!root.children.length) return null;
  const ranked = root.children.slice().sort((x, y) => y.visits - x.visits || y.wins - x.wins);
  if (difficulty === 'easy' && ranked.length > 1 && Math.random() < 0.35) {
    const pick = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))];
    return pick.move ? [pick.move[0], pick.move[1]] : null;
  }
  const best = ranked[0];
  return best.move ? [best.move[0], best.move[1]] : null;
}

module.exports = { createGoBoard, getGoLiberties, goRemoveCaptures, goCountTerritory, getAIMove };
