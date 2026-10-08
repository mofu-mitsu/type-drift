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
const plazaUsers = new Map();
const plazaSessions = new Map();
const plazaMessages = [];
let plazaChain = '海辺で、最初に見つけたのは';
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
  return JSON.stringify({ type: 'plaza_presence', count: plazaSessions.size, users: [...plazaUsers.values()], messages: plazaMessages.slice(-PLAZA_HISTORY_MAX), chain: plazaChain, sentAt: Date.now() });
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

async function plazaAI(body, history = [], requestedCharacter = null) {
  const fallback = [
    { character: 'ダーリンちゃん', emoji: '🥺', body: `ねぇ、${body ? '今の話' : '今日は'}ちょっと気になる♡` },
    { character: 'LSI芋虫', emoji: '🐛', body: body ? '内容を確認しました。観測を継続します。' : '広場への入場を確認しました。' },
  ];
  const fallbackReply = (reason) => ({ replies: [requestedCharacter ? fallback.find(item => item.character === requestedCharacter) || fallback[0] : fallback[Math.random() < 0.5 ? 0 : 1]], source: 'fallback', reason });
  if (!process.env.GROQ_API_KEY) {
    console.warn('[plaza-ai] GROQ_API_KEY is missing; using fallback', { model: GROQ_MODEL });
    return fallbackReply('missing_api_key');
  }
  console.info('[plaza-ai] request', { model: GROQ_MODEL, bodyLength: body.length, hasKey: true });
  const mentionedDarling = /ダーリンちゃん|ダーリン/.test(body);
  const mentionedWorm = /LSI芋虫|芋虫|虫/.test(body);
  const preferredCharacter = requestedCharacter || (mentionedDarling ? 'ダーリンちゃん' : mentionedWorm ? 'LSI芋虫' : null);
  const recent = history.slice(-12).map(m => `${m.character || m.author}: ${m.body}`).join('\n');
  const prompt = `あなたは「類型広場」にいる2人のAIキャラクターの会話担当です。\nダーリンちゃん=🥺。甘めで親しげ、短く、少しハートを混ぜる。\nLSI芋虫=🐛。観測・分類・構造を好むが、堅すぎない短文。\n人間の発言には反応してよいが、2人とも毎回長々と話さない。各キャラ1〜2文、合計40〜90文字程度。質問攻めにしない。\n人間が話した後だけ返答する。AI同士だけで会話を続けない。\n直前の会話:\n${recent || 'まだ会話はありません。'}\n今回の人間の発言:\n${body || '新しい人が広場に来ました。挨拶してください。'}\n${preferredCharacter ? `名前が呼ばれているため、今回は必ず${preferredCharacter}を主役にして返答してください。` : '名前が呼ばれていない場合は、どちらか一人を中心に自然に返答してください。'}\nJSONだけで返してください。`;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        top_p: 0.8,
        max_completion_tokens: 900,
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      const providerMessage = detail.slice(0, 500);
      console.warn(`[plaza-ai] Groq response failed status=${response.status} model=${GROQ_MODEL} detail=${JSON.stringify(providerMessage)}`);
      return { ...fallbackReply(`groq_${response.status}`), providerMessage };
    }
    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    const rawContent = String(message.content || message.reasoning_content || message.reasoning || '').trim();
    if (!rawContent) {
      const finishReason = data.choices?.[0]?.finish_reason || 'unknown';
      const providerMessage = `empty_content finish_reason=${finishReason} message_keys=${Object.keys(message).join(',')}`;
      console.warn(`[plaza-ai] Groq returned empty content model=${GROQ_MODEL} ${providerMessage}`);
      return { ...fallbackReply('empty_response'), providerMessage };
    }
    const jsonText = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try { parsed = JSON.parse(jsonText || '{}'); } catch {
      parsed = { replies: [{ character: preferredCharacter || 'ダーリンちゃん', body: rawContent }] };
    }
    // Qwen/Groq can return either a replies array, one character object, or a
    // compact shape such as {"character":"...","reply":"..."}.
    const singleObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    const normalizedReplies = Array.isArray(singleObject.replies)
      ? singleObject.replies
      : (singleObject.character || singleObject.name || singleObject.body || singleObject.text || singleObject.reply || singleObject.message || singleObject.content)
        ? [singleObject]
        : (singleObject.reply && typeof singleObject.reply === 'object' ? [singleObject.reply] : []);
    let replies = normalizedReplies.slice(0, 2).map(item => ({
      character: item.character || item.name || item.speaker || preferredCharacter || 'ダーリンちゃん',
      body: item.body || item.text || item.content || (typeof item.reply === 'string' ? item.reply : '') || item.message || '',
    }));
    if (preferredCharacter) replies = replies.sort((a, b) => Number(b.character === preferredCharacter) - Number(a.character === preferredCharacter));
    const chosen = replies.find(item => item.character === preferredCharacter) || replies[0];
    if (!chosen || !String(chosen.body || '').trim()) {
      return { ...fallbackReply('empty_response'), providerMessage: `no_valid_reply content_length=${rawContent.length} finish_reason=${data.choices?.[0]?.finish_reason || 'unknown'} raw=${rawContent.slice(0, 180)}` };
    }
    return { replies: [{ character: chosen.character, emoji: chosen.character === 'ダーリンちゃん' ? '🥺' : '🐛', body: String(chosen.body).slice(0, 120) }], source: 'groq', reason: 'ok' };
  } catch (error) {
    console.error('[plaza-ai] request failed', error);
    return fallbackReply('request_error');
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, npcs: 0, players: players.size, clients: sockets.size, plaza: plazaSessions.size, ai: Boolean(process.env.GROQ_API_KEY), model: GROQ_MODEL }));
  }
  if (req.url === '/api/plaza/ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 20_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const requestedCharacter = data.character === 'ダーリンちゃん' || data.character === 'LSI芋虫' ? data.character : null;
        const result = await plazaAI(String(data.body || '').slice(0, 120), Array.isArray(data.history) ? data.history : [], requestedCharacter);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, model: GROQ_MODEL, ai: Boolean(process.env.GROQ_API_KEY) }));
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
        const sessionKey = String(message.sessionKey || `session-${Date.now()}-${Math.random()}`).slice(0, 120);
        const previous = plazaSessions.get(sessionKey);
        if (previous && previous !== ws) {
          plazaSockets.delete(previous); plazaUsers.delete(previous); plazaAiState.delete(previous);
          try { previous.close(4000, 'duplicate session'); } catch {}
        }
        plazaSockets.add(ws);
        plazaSessions.set(sessionKey, ws);
        ws._plazaSessionKey = sessionKey;
        plazaUsers.set(ws, { sessionKey, nickname: String(message.nickname || '匿名の誰か').slice(0, 24), emoji: String(message.emoji || '◌').slice(0, 4) });
        plazaAiState.set(ws, { waitingForHuman: false });
        ws.send(plazaPayload());
        broadcastPlazaPresence();
        return;
      }
      if (message.type === 'plaza_leave') {
        plazaSockets.delete(ws); plazaUsers.delete(ws); plazaAiState.delete(ws);
        if (plazaSessions.get(ws._plazaSessionKey) === ws) plazaSessions.delete(ws._plazaSessionKey);
        broadcastPlazaPresence(); return;
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
      if (message.type === 'plaza_chain_append') {
        if (!plazaSockets.has(ws)) return;
        const addition = String(message.body || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        if (!addition) return;
        plazaChain = `${plazaChain} ${addition}`.slice(-520);
        const payload = JSON.stringify({ type: 'plaza_chain', text: plazaChain, author: plazaUsers.get(ws)?.nickname || '匿名の誰か', sentAt: Date.now() });
        for (const socket of plazaSockets) if (socket.readyState === WebSocket.OPEN) socket.send(payload);
        return;
      }
      if (message.type === 'plaza_dm') {
        if (!plazaSockets.has(ws)) return;
        const targetSessionKey = String(message.targetSessionKey || '').slice(0, 120);
        const target = plazaSessions.get(targetSessionKey);
        const body = String(message.body || '').trim().slice(0, 1000);
        if (!target || target.readyState !== WebSocket.OPEN || !body) return;
        const sender = plazaUsers.get(ws) || { sessionKey: ws._plazaSessionKey, nickname: '匿名の誰か', emoji: '◌' };
        target.send(JSON.stringify({ type: 'plaza_dm', message: { id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, senderSessionKey: sender.sessionKey, senderName: sender.nickname, senderEmoji: sender.emoji, body, createdAt: Date.now() } }));
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
    sockets.delete(ws); plazaSockets.delete(ws); plazaUsers.delete(ws); plazaAiState.delete(ws);
    if (plazaSessions.get(ws._plazaSessionKey) === ws) plazaSessions.delete(ws._plazaSessionKey);
    for (const [clientId, owner] of playerSockets) if (owner === ws) { playerSockets.delete(clientId); players.delete(clientId); }
    broadcastPlazaPresence();
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`worm world relay listening on ${PORT}, websocket /ws`));
setInterval(broadcastWorld, BROADCAST_MS);
