const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const BROADCAST_MS = 50;

const players = new Map();
const playerSockets = new Map();
const sockets = new Set();

function publicPlayer(player) {
  return {
    clientId: player.id,
    name: player.name,
    emoji: player.emoji,
    body: player.body,
    x: player.x,
    y: player.y,
    dirX: player.dir.x,
    dirY: player.dir.y,
    score: player.score,
    length: player.length,
    isAlive: player.isAlive,
    isNpc: false,
  };
}

function worldPayload() {
  return JSON.stringify({
    type: 'world',
    playerCount: players.size,
    worms: [...players.values()].map(publicPlayer),
    sentAt: Date.now(),
  });
}

function broadcastWorld() {
  const payload = worldPayload();
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function storePlayer(data, socket = null) {
  if (!data?.clientId) throw new Error('clientId required');
  const clientId = String(data.clientId).slice(0, 80);
  const player = {
    id: clientId,
    name: String(data.name || '匿名の芋虫').slice(0, 80),
    emoji: String(data.emoji || '🐛'),
    body: String(data.body || '🟢'),
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    dir: { x: Number(data.dirX) || 0, y: Number(data.dirY) || 0 },
    length: Math.max(3, Number(data.length) || 3),
    score: Math.max(0, Number(data.score) || 0),
    isAlive: data.isAlive !== false,
  };
  players.set(clientId, player);
  if (socket) playerSockets.set(clientId, socket);
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
    return res.end(JSON.stringify({ ok: true, npcs: 0, players: players.size, clients: sockets.size }));
  }
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20_000) req.destroy();
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

server.listen(PORT, '0.0.0.0', () => console.log(`worm world relay listening on ${PORT}, websocket /ws`));
setInterval(broadcastWorld, BROADCAST_MS);
