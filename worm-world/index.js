const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const STAGE_SIZE = 3000;
const TICK_MS = 100;
const BROADCAST_MS = 100;
const SPACING = 7;
const FOOD_RADIUS = 30;
const HIT_RADIUS = 20;
const NPC_SPEED = 26;
const MAX_HISTORY = 600;
const PUBLIC_HISTORY = 180;
const API_URL = process.env.API_URL || 'https://type-drift-api.onrender.com';

const npcTemplates = [
  ['npc1', 'LSI芋虫', '🐛', '🟢'],
  ['npc2', 'ダーリンちゃん', '🥺', '🟢'],
  ['npc3', '匿名のINTJ', '🐛', '🟢'],
  ['npc4', '匿名のLII', '🐛', '🟢'],
  ['npc5', '匿名のLSI', '🐛', '🟢'],
  ['npc6', '匿名', '🐛', '🟢'],
];

const rand = (max) => Math.random() * max;
const direction = () => { const angle = Math.random() * Math.PI * 2; return { x: Math.cos(angle), y: Math.sin(angle) }; };
const makeWorm = ([id, name, emoji, body], x = rand(STAGE_SIZE), y = rand(STAGE_SIZE), score = 0) => ({ id, name, emoji, body, x, y, dir: direction(), history: Array.from({ length: 30 }, () => ({ x, y })), score, length: 3 + Math.floor(score / 5), isAlive: true });

const npcs = new Map(npcTemplates.map(template => [template[0], makeWorm(template)]));
const players = new Map();
const playerSockets = new Map();
const sockets = new Set();
let foods = Array.from({ length: 180 }, () => ({ x: rand(STAGE_SIZE), y: rand(STAGE_SIZE) }));
let lastLeaderboardAt = 0;
let ticking = false;

function resetNpc(npc) { Object.assign(npc, makeWorm([npc.id, npc.name, npc.emoji, npc.body], rand(STAGE_SIZE), rand(STAGE_SIZE), npc.score)); }
function nearestFood(worm) { let target = null, best = Infinity; for (const food of foods) { const d = Math.hypot(food.x - worm.x, food.y - worm.y); if (d < best) { best = d; target = food; } } return best < 900 ? target : null; }

function steerNpc(npc) {
  let tx = npc.dir.x, ty = npc.dir.y, turn = 0.18, avoidX = 0, avoidY = 0, danger = false;
  const lookX = npc.x + npc.dir.x * 180, lookY = npc.y + npc.dir.y * 180;
  const others = [...npcs.values(), ...players.values()];
  for (const other of others) {
    if (!other.isAlive || other.id === npc.id) continue;
    const maxIndex = Math.min(other.history.length, other.length * SPACING);
    for (let k = 0; k < maxIndex; k += SPACING) {
      const p = other.history[k];
      if (Math.hypot(lookX - p.x, lookY - p.y) < 100) { avoidX += npc.x - p.x; avoidY += npc.y - p.y; danger = true; }
    }
  }
  if (danger) { tx = avoidX; ty = avoidY; turn = 0.45; }
  else { const food = nearestFood(npc); if (food) { tx = food.x - npc.x; ty = food.y - npc.y; turn = 0.2; } }
  if (npc.x < 180) { tx += 700; turn = Math.max(turn, 0.4); }
  if (npc.x > STAGE_SIZE - 180) { tx -= 700; turn = Math.max(turn, 0.4); }
  if (npc.y < 180) { ty += 700; turn = Math.max(turn, 0.4); }
  if (npc.y > STAGE_SIZE - 180) { ty -= 700; turn = Math.max(turn, 0.4); }
  const dist = Math.hypot(tx, ty) || 1;
  npc.dir.x = npc.dir.x * (1 - turn) + (tx / dist) * turn;
  npc.dir.y = npc.dir.y * (1 - turn) + (ty / dist) * turn;
  const len = Math.hypot(npc.dir.x, npc.dir.y) || 1;
  npc.dir.x /= len; npc.dir.y /= len;
}

function moveNpc(npc) {
  steerNpc(npc);
  npc.x = Math.max(0, Math.min(STAGE_SIZE, npc.x + npc.dir.x * NPC_SPEED));
  npc.y = Math.max(0, Math.min(STAGE_SIZE, npc.y + npc.dir.y * NPC_SPEED));
  npc.history.unshift({ x: npc.x, y: npc.y });
  if (npc.history.length > MAX_HISTORY) npc.history.pop();
  const remaining = []; let eaten = 0;
  for (const food of foods) { if (Math.hypot(food.x - npc.x, food.y - npc.y) < FOOD_RADIUS) eaten++; else remaining.push(food); }
  if (eaten) { npc.score += eaten; npc.length = 3 + Math.floor(npc.score / 5); }
  foods = remaining;
}

function collides(a, b) { const maxIndex = Math.min(b.history.length, b.length * SPACING); for (let k = 0; k < maxIndex; k += SPACING) { const p = b.history[k]; if (Math.hypot(a.x - p.x, a.y - p.y) < HIT_RADIUS) return true; } return false; }

function publicWorm(worm) {
  return { clientId: worm.id, name: worm.name, emoji: worm.emoji, body: '🟢', x: worm.x, y: worm.y, dirX: worm.dir.x, dirY: worm.dir.y, score: worm.score, length: worm.length, isAlive: worm.isAlive, isNpc: npcTemplates.some(([id]) => id === worm.id), history: worm.history.slice(0, PUBLIC_HISTORY) };
}

function worldPayload() { return JSON.stringify({ type: 'world', playerCount: players.size, worms: [...npcs.values(), ...players.values()].map(publicWorm), sentAt: Date.now() }); }
function broadcastWorld() { const payload = worldPayload(); for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(payload); }

async function saveNpcScore(npc) { try { await fetch(`${API_URL}/api/worm/ranking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientKey: `npc:${npc.id}`, nickname: npc.name, score: npc.score }) }); } catch (error) { console.error('NPC ranking sync failed', error.message); } }

function storePlayer(data, socket = null) {
  if (!data?.clientId) throw new Error('clientId required');
  const clientId = String(data.clientId).slice(0, 80);
  const x = Number(data.x) || 0, y = Number(data.y) || 0;
  const player = { id: clientId, name: String(data.name || '匿名の芋虫').slice(0, 80), x, y, dir: { x: Number(data.dirX) || 0, y: Number(data.dirY) || 0 }, history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [{ x, y }], length: Math.max(3, Number(data.length) || 3), score: Math.max(0, Number(data.score) || 0), isAlive: data.isAlive !== false };
  players.set(clientId, player);
  if (socket) playerSockets.set(clientId, socket);
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    for (const npc of npcs.values()) if (npc.isAlive) moveNpc(npc);
    const all = [...npcs.values(), ...players.values()];
    for (const npc of npcs.values()) {
      if (!npc.isAlive) continue;
      let dead = false;
      for (const other of all) { if (!other.isAlive || other.id === npc.id) continue; if (collides(npc, other)) { dead = true; break; } }
      if (dead) { npc.isAlive = false; setTimeout(() => resetNpc(npc), 500); }
    }
    const now = Date.now();
    if (now - lastLeaderboardAt > 3000) { lastLeaderboardAt = now; for (const npc of npcs.values()) void saveNpcScore(npc); }
    while (foods.length < 180) foods.push({ x: rand(STAGE_SIZE), y: rand(STAGE_SIZE) });
  } finally { ticking = false; }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, npcs: npcs.size, players: players.size, clients: sockets.size })); }
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) req.destroy(); });
    req.on('end', () => { try { storePlayer(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); } catch { res.writeHead(400); res.end('bad request'); } });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  sockets.add(ws);
  ws.send(worldPayload());
  ws.on('message', raw => { try { const message = JSON.parse(raw.toString()); if (message.type === 'player') storePlayer(message, ws); } catch (error) { console.error('WS message failed', error.message); } });
  ws.on('close', () => { sockets.delete(ws); for (const [clientId, owner] of playerSockets) if (owner === ws) { playerSockets.delete(clientId); players.delete(clientId); } });
});

server.listen(PORT, '0.0.0.0', () => console.log(`worm world listening on ${PORT}, websocket /ws`));
setInterval(() => { void tick(); }, TICK_MS);
setInterval(broadcastWorld, BROADCAST_MS);
