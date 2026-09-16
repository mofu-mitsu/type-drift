const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const STAGE_SIZE = 3000;
const TICK_MS = 100;
const BROADCAST_MS = 60;
const SPACING = 2;
const PLAYER_SPACING = 9;
const FOOD_RADIUS = 30;
const HIT_RADIUS = 20;
const NPC_SPEED = 22;
const MAX_HISTORY = 600;
const PUBLIC_HISTORY = 180;
const API_URL = process.env.API_URL || 'https://type-drift-api.onrender.com';

const npcTemplates = [
  ['npc1', 'LSI芋虫', '🐛', '🔵'],
  ['npc2', 'ダーリンちゃん', '🥺', '🌸'],
  ['npc3', '匿名のINTJ', '🐛', '🟣'],
  ['npc4', '匿名のLII', '🐛', '🟠'],
  ['npc5', '匿名のLSI', '🐛', '🟡'],
  ['npc6', '匿名', '🐛', '🔷'],
];

const rand = max => Math.random() * max;
const direction = () => {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
};

const makeWorm = ([id, name, emoji, body], x = rand(STAGE_SIZE), y = rand(STAGE_SIZE), score = 0) => ({
  id, name, emoji, body, x, y, dir: direction(),
  history: Array.from({ length: 30 }, () => ({ x, y })),
  score, length: 3 + Math.floor(score / 5), isAlive: true,
  wander: direction(), wanderUntil: 0,
});

const spawnPoints = [
  [1050, 1300], [1950, 1300], [1300, 1950],
  [1700, 1950], [950, 1800], [2050, 1800],
];
const npcs = new Map(npcTemplates.map((template, i) => [
  template[0], makeWorm(template, spawnPoints[i][0], spawnPoints[i][1]),
]));
const players = new Map();
const playerSockets = new Map();
const sockets = new Set();
let foods = Array.from({ length: 180 }, () => ({ x: rand(STAGE_SIZE), y: rand(STAGE_SIZE) }));
let lastLeaderboardAt = 0;
let ticking = false;

function resetNpc(npc) {
  const fresh = makeWorm([npc.id, npc.name, npc.emoji, npc.body]);
  Object.assign(npc, fresh);
}

function dropCabbages(worm) {
  const count = Math.max(3, Math.min(24, worm.length));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 20 + Math.random() * 90;
    foods.push({
      x: Math.max(0, Math.min(STAGE_SIZE, worm.x + Math.cos(a) * d)),
      y: Math.max(0, Math.min(STAGE_SIZE, worm.y + Math.sin(a) * d)),
    });
  }
}

function foodTarget(npc) {
  let best = null;
  let bestValue = Infinity;
  for (let i = 0; i < foods.length; i += 2) {
    const food = foods[i];
    const d = Math.hypot(food.x - npc.x, food.y - npc.y);
    if (d > 1200) continue;
    let nearby = 0;
    for (let j = 0; j < foods.length; j += 3) {
      const other = foods[j];
      if (Math.hypot(other.x - food.x, other.y - food.y) < 180) nearby++;
    }
    const value = d - nearby * 45;
    if (value < bestValue) {
      bestValue = value;
      best = food;
    }
  }
  return best;
}

function steerNpc(npc) {
  const now = Date.now();
  let tx = npc.dir.x;
  let ty = npc.dir.y;
  let foodWeight = 0.9;
  let attackWeight = 0;
  let avoidWeight = 0;
  let attackTarget = null;
  let avoidX = 0;
  let avoidY = 0;
  const all = [...npcs.values(), ...players.values()];

  for (const other of all) {
    if (!other.isAlive || other.id === npc.id) continue;
    const dx = other.x - npc.x;
    const dy = other.y - npc.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 750) continue;

    const smaller = other.length < npc.length;
    const larger = other.length > npc.length;
    if (smaller && d < 700 && (!attackTarget || d < attackTarget.d)) {
      attackTarget = { other, d };
    }

    const maxIndex = Math.min(other.history.length, other.length * (npcTemplates.some(([id]) => id === other.id) ? SPACING : PLAYER_SPACING), 120);
    for (let k = 0; k < maxIndex; k += 4) {
      const point = other.history[k];
      const bx = npc.x - point.x;
      const by = npc.y - point.y;
      const bd = Math.hypot(bx, by) || 1;
      if (bd < (larger ? 260 : 120)) {
        const radius = larger ? 260 : 120;
        const strength = (larger ? 2.2 : 0.7) * (1 - bd / radius);
        avoidX += (bx / bd) * strength;
        avoidY += (by / bd) * strength;
        avoidWeight = Math.max(avoidWeight, strength);
      }
    }
  }

  let food = null;
  if (attackTarget) {
    const { other, d } = attackTarget;
    const lead = Math.min(180, 55 + d * 0.18);
    tx = (other.x + other.dir.x * lead) - npc.x;
    ty = (other.y + other.dir.y * lead) - npc.y;
    attackWeight = 1.15;
  } else {
    food = foodTarget(npc);
    if (food) {
      tx = food.x - npc.x;
      ty = food.y - npc.y;
      foodWeight = 1.15;
    } else if (now > npc.wanderUntil) {
      npc.wander = direction();
      npc.wanderUntil = now + 900 + Math.random() * 1800;
    }
  }

  if (avoidWeight > 0) {
    tx += avoidX * 380 * avoidWeight;
    ty += avoidY * 380 * avoidWeight;
  }

  const margin = 260;
  if (npc.x < margin) tx += (margin - npc.x) * 2.5;
  if (npc.x > STAGE_SIZE - margin) tx -= (npc.x - (STAGE_SIZE - margin)) * 2.5;
  if (npc.y < margin) ty += (margin - npc.y) * 2.5;
  if (npc.y > STAGE_SIZE - margin) ty -= (npc.y - (STAGE_SIZE - margin)) * 2.5;

  if (!attackTarget && !food) {
    tx += npc.wander.x * 120;
    ty += npc.wander.y * 120;
  }

  const dist = Math.hypot(tx, ty) || 1;
  const desiredX = tx / dist;
  const desiredY = ty / dist;
  const turn = attackWeight ? 0.18 : foodWeight > 1 ? 0.14 : 0.09;
  npc.dir.x += (desiredX - npc.dir.x) * turn;
  npc.dir.y += (desiredY - npc.dir.y) * turn;
  const len = Math.hypot(npc.dir.x, npc.dir.y) || 1;
  npc.dir.x /= len;
  npc.dir.y /= len;
}

function moveNpc(npc) {
  steerNpc(npc);
  npc.x = Math.max(0, Math.min(STAGE_SIZE, npc.x + npc.dir.x * NPC_SPEED));
  npc.y = Math.max(0, Math.min(STAGE_SIZE, npc.y + npc.dir.y * NPC_SPEED));
  npc.history.unshift({ x: npc.x, y: npc.y });
  if (npc.history.length > MAX_HISTORY) npc.history.pop();

  const remaining = [];
  let eaten = 0;
  for (const food of foods) {
    if (Math.hypot(food.x - npc.x, food.y - npc.y) < FOOD_RADIUS) eaten++;
    else remaining.push(food);
  }
  if (eaten) {
    npc.score += eaten;
    npc.length = 3 + Math.floor(npc.score / 5);
  }
  foods = remaining;
}

function isNpc(worm) {
  return npcTemplates.some(([id]) => id === worm.id);
}

function collidesHeadWithBody(head, body) {
  const step = isNpc(body) ? SPACING : PLAYER_SPACING;
  const maxIndex = Math.min(body.history.length - 1, Math.max(0, (body.length - 1) * step));
  for (let k = 0; k <= maxIndex; k += step) {
    const point = body.history[k];
    if (Math.hypot(head.x - point.x, head.y - point.y) < HIT_RADIUS) return true;
  }
  return false;
}

function killNpc(npc) {
  if (!npc.isAlive) return;
  npc.isAlive = false;
  dropCabbages(npc);
  setTimeout(() => resetNpc(npc), 700);
}

function killPlayer(player) {
  if (!player.isAlive) return;
  player.isAlive = false;
}

function resolveCollisions() {
  const all = [...npcs.values(), ...players.values()].filter(w => w.isAlive);
  for (const head of all) {
    if (!head.isAlive) continue;
    for (const body of all) {
      if (!body.isAlive || body.id === head.id) continue;
      if (!collidesHeadWithBody(head, body)) continue;
      if (isNpc(head)) killNpc(head);
      else killPlayer(head);
      break;
    }
  }
}

function publicWorm(worm) {
  return {
    clientId: worm.id, name: worm.name, emoji: worm.emoji,
    body: worm.body || '🟢', x: worm.x, y: worm.y,
    dirX: worm.dir.x, dirY: worm.dir.y, score: worm.score,
    length: worm.length, isAlive: worm.isAlive,
    isNpc: isNpc(worm),
    history: worm.history.slice(0, PUBLIC_HISTORY),
  };
}

function worldPayload() {
  return JSON.stringify({
    type: 'world',
    playerCount: players.size,
    worms: [...npcs.values(), ...players.values()].map(publicWorm),
    sentAt: Date.now(),
  });
}

function broadcastWorld() {
  const payload = worldPayload();
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

async function saveNpcScore(npc) {
  try {
    await fetch(`${API_URL}/api/worm/ranking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: `npc:${npc.id}`, nickname: npc.name, score: npc.score }),
    });
  } catch (error) {
    console.error('NPC ranking sync failed', error.message);
  }
}

function storePlayer(data, socket = null) {
  if (!data?.clientId) throw new Error('clientId required');
  const clientId = String(data.clientId).slice(0, 80);
  const x = Number(data.x) || 0;
  const y = Number(data.y) || 0;
  const player = {
    id: clientId,
    name: String(data.name || '匿名の芋虫').slice(0, 80),
    emoji: String(data.emoji || '🐛'),
    body: String(data.body || '🟢'),
    x, y,
    dir: { x: Number(data.dirX) || 0, y: Number(data.dirY) || 0 },
    history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [{ x, y }],
    length: Math.max(3, Number(data.length) || 3),
    score: Math.max(0, Number(data.score) || 0),
    isAlive: data.isAlive !== false,
  };
  players.set(clientId, player);
  if (socket) playerSockets.set(clientId, socket);
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    for (const npc of npcs.values()) {
      if (npc.isAlive) moveNpc(npc);
    }

    resolveCollisions();

    const now = Date.now();
    if (now - lastLeaderboardAt > 3000) {
      lastLeaderboardAt = now;
      for (const npc of npcs.values()) void saveNpcScore(npc);
    }

    while (foods.length < 180) foods.push({ x: rand(STAGE_SIZE), y: rand(STAGE_SIZE) });
  } finally {
    ticking = false;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, npcs: npcs.size, players: players.size, clients: sockets.size }));
  }
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100_000) req.destroy();
    });
    req.on('end', () => {
      try {
        storePlayer(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  sockets.add(ws);
  ws.send(worldPayload());
  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'player') storePlayer(message, ws);
    } catch (error) {
      console.error('WS message failed', error.message);
    }
  });
  ws.on('close', () => {
    sockets.delete(ws);
    for (const [clientId, owner] of playerSockets) {
      if (owner === ws) {
        playerSockets.delete(clientId);
        players.delete(clientId);
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`worm world listening on ${PORT}, websocket /ws`));
setInterval(() => { void tick(); }, TICK_MS);
setInterval(broadcastWorld, BROADCAST_MS);
