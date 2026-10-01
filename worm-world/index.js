const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const BROADCAST_MS = 50;
const PLAZA_HISTORY_MAX = 80;
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

const players = new Map();
const playerSockets = new Map();
const sockets = new Set();
const plazaSockets = new Set();
const plazaMessages = [];
const plazaAiState = new Map();

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
  return JSON.stringify({ type: 'world', playerCount: players.size, worms: [...players.values()].map(publicPlayer), sentAt: Date.now() });
}
function broadcastWorld() {
  const payload = worldPayload();
  for (const ws of sockets) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}
function plazaPayload() {
  return JSON.stringify({ type: 'plaza_presence', count: plazaSockets.size, messages: plazaMessages.slice(-PLAZA_HISTORY_MAX), sentAt: Date.now() });
}
function broadcastPlazaPresence() {
  const payload = plazaPayload();
  for (const ws of plazaSockets) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}
function broadcastPlazaMessage(message) {
  const payload = JSON.stringify({ type: 'plaza_message', message });
  for (const ws of plazaSockets) if (ws.readyState === WebSocket.OPEN) ws.send(payload);
}
function addPlazaMessage(message) {
  plazaMessages.push(message);
  while (plazaMessages.length > PLAZA_HISTORY_MAX) plazaMessages.shift();
  broadcastPlazaMessage(message);
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

async function plazaAI(body, history = []) {
  const fallback = [
    { character: 'ダーリンちゃん', emoji: '🥺', body: `ねぇ、${body ? '今の話' : '今日は'}ちょっと気になる♡` },
    { character: 'LSI芋虫', emoji: '🐛', body: body ? '内容を確認しました。観測を継続します。' : '広場への入場を確認しました。' },
  ];
  if (!process.env.GROQ_API_KEY) return fallback;
  const recent = history.slice(-12).map(m => `${m.character || m.author}: ${m.body}`).join('\n');
  const prompt = `あなたは「類型広場」にいる2人のAIキャラクターの会話担当です。\nダーリンちゃん=🥺。甘めで親しげ、短く、少しハートを混ぜる。\nLSI芋虫=🐛。観測・分類・構造を好むが、堅すぎない短文。\n人間の発言には反応してよいが、2人とも毎回長々と話さない。各キャラ1〜2文、合計40〜90文字程度。質問攻めにしない。\n人間が話した後だけ返答する。AI同士だけで会話を続けない。\n直前の会話:\n${recent || 'まだ会話はありません。'}\n今回の人間の発言:\n${body || '新しい人が広場に来ました。挨拶してください。'}\nJSONだけで返してください。`;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        reasoning_effort: 'none',
        temperature: 0.7,
        top_p: 0.8,
        max_completion_tokens: 220,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'plaza_replies',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                replies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      character: { type: 'string', enum: ['ダーリンちゃん', 'LSI芋虫'] },
                      body: { type: 'string' }
                    },
                    required: ['character', 'body'],
                    additionalProperties: false
                  }
                }
              },
              required: ['replies'],
              additionalProperties: false
            }
          }
        }
      })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const replies = Array.isArray(parsed.replies) ? parsed.replies.slice(0, 2) : [];
    return replies.length ? replies.map(item => ({ character: item.character, emoji: item.character === 'ダーリンちゃん' ? '🥺' : '🐛', body: String(item.body).slice(0, 120) })) : fallback;
  } catch (error) {
    console.error('plaza AI failed', error.message);
    return fallback;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, npcs: 0, players: players.size, clients: sockets.size, plaza: plazaSockets.size, ai: Boolean(process.env.GROQ_API_KEY), model: GROQ_MODEL }));
  }
  if (req.url === '/api/plaza/ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const replies = await plazaAI(String(data.body || '').slice(0, 120), Array.isArray(data.history) ? data.history : []);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ replies, model: GROQ_MODEL, ai: Boolean(process.env.GROQ_API_KEY) }));
      } catch {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    return;
  }
  if (req.url === '/api/player' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20_000) req.destroy(); });
    req.on('end', () => {
      try { storePlayer(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); }
      catch { res.writeHead(400); res.end('bad request'); }
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => {
  sockets.add(ws);
  ws.send(worldPayload());
  ws.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'player') { storePlayer(message, ws); return; }
      if (message.type === 'plaza_join') {
        plazaSockets.add(ws);
        plazaAiState.set(ws, { waitingForHuman: false });
        ws.send(plazaPayload());
        broadcastPlazaPresence();
        return;
      }
      if (message.type === 'plaza_leave') {
        plazaSockets.delete(ws); plazaAiState.delete(ws); broadcastPlazaPresence(); return;
      }
      if (message.type === 'plaza_message') {
        if (!plazaSockets.has(ws)) return;
        const body = String(message.body || '').trim().slice(0, 120);
        if (!body) return;
        const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author: String(message.nickname || '匿名の誰か').trim().slice(0, 24) || '匿名の誰か', body, kind: 'human', emoji: String(message.emoji || '').slice(0, 4), createdAt: Date.now() };
        addPlazaMessage(item);
        for (const socket of plazaSockets) {
          const state = plazaAiState.get(socket) || { waitingForHuman: false };
          state.waitingForHuman = true;
          plazaAiState.set(socket, state);
        }
        return;
      }
      if (message.type === 'plaza_ai_message') {
        if (!plazaSockets.has(ws)) return;
        const body = String(message.body || '').trim().slice(0, 120);
        const character = message.character === 'LSI芋虫' ? 'LSI芋虫' : 'ダーリンちゃん';
        if (!body) return;
        addPlazaMessage({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author: character, body, kind: 'ai', emoji: character === 'ダーリンちゃん' ? '🥺' : '🐛', createdAt: Date.now() });
        for (const socket of plazaSockets) plazaAiState.set(socket, { waitingForHuman: false });
        return;
      }
      if (message.type === 'plaza_emote') {
        if (!plazaSockets.has(ws)) return;
        const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author: String(message.nickname || '匿名の誰か').trim().slice(0, 24) || '匿名の誰か', body: String(message.emote || '✦').slice(0, 4), kind: 'emote', emoji: String(message.emoji || '').slice(0, 4), createdAt: Date.now() };
        addPlazaMessage(item);
      }
    } catch (error) { console.error('WS message failed', error.message); }
  });
  ws.on('close', () => {
    sockets.delete(ws); plazaSockets.delete(ws); plazaAiState.delete(ws);
    for (const [clientId, owner] of playerSockets) if (owner === ws) { playerSockets.delete(clientId); players.delete(clientId); }
    broadcastPlazaPresence();
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`worm world relay listening on ${PORT}, websocket /ws`));
setInterval(broadcastWorld, BROADCAST_MS);