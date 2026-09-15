'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import React from 'react';
import { X } from 'lucide-react';

type Position = { x: number; y: number };
type Worm = {
  id: string;
  name: string;
  emoji: string;
  body: string;
  x: number;
  y: number;
  dir: Position;
  history: Position[];
  score: number;
  length: number;
  isAlive: boolean;
  isNpc?: boolean;
  lastSeen?: number;
};
type Ranking = { nickname: string; score: number };

const STAGE = 3000;
const SPEED = 4;
const SPACING = 6;
const MAX_HISTORY = 600;
const FOOD_RADIUS = 30;
const HIT_RADIUS = 20;
const API = process.env.NEXT_PUBLIC_API_URL || 'https://type-drift-api.onrender.com';
const WORLD = process.env.NEXT_PUBLIC_WORM_WORLD_URL || 'https://type-drift-worm-world.onrender.com';
const REVERB_HOST = process.env.NEXT_PUBLIC_REVERB_HOST || 'type-drift-reverb.onrender.com';
const REVERB_KEY = process.env.NEXT_PUBLIC_REVERB_APP_KEY || 'type-drift-worm';

const makePlayer = (nickname: string): Worm => ({
  id: 'player', name: nickname || '匿名の芋虫', emoji: '🐛', body: '🟢',
  x: STAGE / 2, y: STAGE / 2, dir: { x: 1, y: 0 },
  history: Array(30).fill({ x: STAGE / 2, y: STAGE / 2 }), score: 0, length: 3, isAlive: true,
});

export default function WormGameShared({ nickname, onExit }: { nickname: string; onExit: () => void }) {
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');
  const [frame, setFrame] = useState(0);
  const [network, setNetwork] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const [rules, setRules] = useState(false);
  const playerRef = useRef<Worm>(makePlayer(nickname));
  const remoteRef = useRef<Map<string, Worm>>(new Map());
  const foodsRef = useRef<Position[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const keyRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);

  const loadRanking = useCallback(async () => {
    try {
      const response = await fetch(`${API}/api/worm/ranking`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setRanking(Array.isArray(data.scores) ? data.scores : []);
    } catch {}
  }, []);

  const saveScore = useCallback(async () => {
    const player = playerRef.current;
    if (!keyRef.current) return;
    try {
      await fetch(`${API}/api/worm/ranking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: keyRef.current, nickname: player.name.slice(0, 80), score: player.score }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    let key = sessionStorage.getItem('type-drift-worm-tab-key');
    if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('type-drift-worm-tab-key', key); }
    keyRef.current = key;
    foodsRef.current = Array.from({ length: 100 }, () => ({ x: Math.random() * STAGE, y: Math.random() * STAGE }));
    void loadRanking();
  }, [loadRanking]);

  useEffect(() => {
    const timer = setInterval(() => void loadRanking(), 2000);
    return () => clearInterval(timer);
  }, [loadRanking]);

  useEffect(() => {
    const timer = setInterval(() => void saveScore(), 2000);
    return () => clearInterval(timer);
  }, [saveScore]);

  useEffect(() => {
    let closed = false;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (closed) return;
      setNetwork('connecting');
      const ws = new WebSocket(`wss://${REVERB_HOST}/app/${encodeURIComponent(REVERB_KEY)}?protocol=7&client=js&version=8.4&flash=false`);
      socketRef.current = ws;
      ws.onmessage = event => {
        try {
          const message = JSON.parse(event.data);
          if (message.event === 'pusher:connection_established') {
            ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel: 'worm-beach' } }));
            setNetwork('connected');
            return;
          }
          if (message.event !== 'worm.position') return;
          const payload = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
          if (!payload?.clientId || payload.clientId === keyRef.current) return;
          const existing = remoteRef.current.get(payload.clientId);
          const history = existing
            ? [{ x: Number(payload.x) || 0, y: Number(payload.y) || 0 }, ...existing.history].slice(0, MAX_HISTORY)
            : Array(30).fill({ x: Number(payload.x) || 0, y: Number(payload.y) || 0 });
          remoteRef.current.set(payload.clientId, {
            id: payload.clientId,
            name: payload.name || '匿名の芋虫', emoji: payload.emoji || '🐛', body: payload.body || '🟢',
            x: Number(payload.x) || 0, y: Number(payload.y) || 0,
            dir: { x: Number(payload.dirX) || 0, y: Number(payload.dirY) || 0 },
            history, score: Number(payload.score) || 0, length: Math.max(3, Number(payload.length) || 3),
            isAlive: payload.isAlive !== false, isNpc: payload.isNpc === true, lastSeen: Date.now(),
          });
        } catch {}
      };
      ws.onclose = () => { if (!closed) { setNetwork('offline'); reconnect = setTimeout(connect, 1500); } };
      ws.onerror = () => setNetwork('offline');
    };
    connect();
    const cleanup = setInterval(() => {
      const now = Date.now();
      remoteRef.current.forEach((worm, id) => { if (now - (worm.lastSeen || 0) > 4000) remoteRef.current.delete(id); });
    }, 1000);
    return () => { closed = true; if (reconnect) clearTimeout(reconnect); clearInterval(cleanup); socketRef.current?.close(); socketRef.current = null; };
  }, []);

  const broadcastPlayer = useCallback(() => {
    const p = playerRef.current;
    const payload = {
      clientId: keyRef.current, name: p.name, emoji: p.emoji, body: p.body,
      x: p.x, y: p.y, dirX: p.dir.x, dirY: p.dir.y, score: p.score, length: p.length,
      isAlive: p.isAlive,
    };
    fetch(`${API}/api/worm/position`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
    fetch(`${WORLD}/api/player`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, history: p.history.slice(0, MAX_HISTORY) }), keepalive: true }).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(broadcastPlayer, 100);
    return () => clearInterval(timer);
  }, [broadcastPlayer]);

  const update = useCallback(() => {
    const p = playerRef.current;
    if (p.isAlive) {
      p.x = Math.max(0, Math.min(STAGE, p.x + p.dir.x * SPEED));
      p.y = Math.max(0, Math.min(STAGE, p.y + p.dir.y * SPEED));
      p.history.unshift({ x: p.x, y: p.y });
      if (p.history.length > MAX_HISTORY) p.history.pop();

      const next: Position[] = [];
      let eaten = 0;
      for (const food of foodsRef.current) {
        if (Math.hypot(food.x - p.x, food.y - p.y) < FOOD_RADIUS) eaten++; else next.push(food);
      }
      if (eaten) { p.score += eaten; p.length = 3 + Math.floor(p.score / 5); setScore(p.score); }
      foodsRef.current = next;

      let hit = false;
      remoteRef.current.forEach(worm => {
        if (hit || !worm.isAlive) return;
        const maxIndex = worm.length * SPACING;
        for (let i = 0; i < worm.history.length && i < maxIndex; i += SPACING) {
          if (Math.hypot(p.x - worm.history[i].x, p.y - worm.history[i].y) < HIT_RADIUS) { hit = true; break; }
        }
      });
      if (hit) { p.isAlive = false; setGameState('gameover'); void saveScore(); }
    }
    setFrame(v => v + 1);
    animationRef.current = requestAnimationFrame(update);
  }, [saveScore]);

  useEffect(() => { animationRef.current = requestAnimationFrame(update); return () => cancelAnimationFrame(animationRef.current); }, [update]);

  const moveToward = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > 10) playerRef.current.dir = { x: dx / d, y: dy / d };
  }, []);

  useEffect(() => {
    const mouse = (e: MouseEvent) => moveToward(e.clientX, e.clientY);
    const touch = (e: TouchEvent) => e.touches[0] && moveToward(e.touches[0].clientX, e.touches[0].clientY);
    window.addEventListener('mousemove', mouse); window.addEventListener('touchmove', touch, { passive: true });
    const key = (e: KeyboardEvent) => {
      const m: Record<string, Position> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
      if (m[e.key]) { e.preventDefault(); playerRef.current.dir = m[e.key]; }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousemove', mouse); window.removeEventListener('touchmove', touch); window.removeEventListener('keydown', key); };
  }, [moveToward]);

  const respawn = () => { playerRef.current = makePlayer(nickname || '匿名の芋虫'); setScore(0); setGameState('playing'); void broadcastPlayer(); };
  const player = playerRef.current;
  const cameraX = player.x;
  const cameraY = player.y;
  const remotes = Array.from(remoteRef.current.values());

  return <section className="activity-section game-page">
    <p className="eyebrow">WORM BEACH</p>
    <h2>芋虫浜 <small className="score-label">🥬 {score} <span style={{ opacity: .7, fontSize: '.9em' }}>({score % 5}/5で🟢)</span></small></h2>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, fontSize: 10, color: '#6f8d86' }}>
      <span>{network === 'connected' ? '🟢 オンライン' : network === 'connecting' ? '🟡 接続中…' : '⚪ 再接続中…'}</span>
      {network === 'connected' && <span>👥 {remotes.filter(w => !w.isNpc).length + 1}人 / NPC {remotes.filter(w => w.isNpc).length}匹</span>}
    </div>

    <div ref={containerRef} className="worm-game" style={{ position: 'relative', width: '100%', height: 450, overflow: 'hidden', backgroundColor: '#a9d9c5', backgroundImage: 'radial-gradient(circle at 20px 35px, #fff2b9 0, #fff2b9 3px, transparent 4px), radial-gradient(circle at 75px 65px, #fff2b9 0, #fff2b9 3px, transparent 4px)', backgroundSize: '100px 100px', backgroundPosition: `${-cameraX}px ${-cameraY}px`, borderRadius: '12px 30px 30px 30px' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(${-cameraX}px, ${-cameraY}px)`, width: 0, height: 0 }}>
        {foodsRef.current.map((food, i) => <div key={i} style={{ position: 'absolute', left: food.x, top: food.y, fontSize: 27, transform: 'translate(-50%, -50%)', zIndex: 1 }}>🥬</div>)}
        {remotes.map(worm => worm.isAlive ? <WormVisual key={worm.id} worm={worm} npc={worm.isNpc} /> : null)}
        {player.isAlive && <WormVisual worm={player} npc={false} />}
      </div>
      {gameState === 'playing' && <p style={{ position: 'absolute', bottom: 16, left: 20, margin: 0, zIndex: 20, color: '#57877c', fontFamily: "'DM Mono', monospace", fontSize: 9 }}>画面をタップした方向、または矢印キーで移動 · 他の芋虫の体に頭がぶつかると消滅</p>}
      {gameState === 'gameover' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,56,62,.5)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}><div style={{ background: '#fffaf1', padding: '30px 40px', borderRadius: 16, textAlign: 'center' }}><h3 style={{ margin: '0 0 10px', color: '#466f71' }}>観測終了</h3><p style={{ color: '#7b9694' }}>集めたキャベツ: <b style={{ color: '#5a9a89', fontSize: 18 }}>{score}</b></p><button className="pick-button" onClick={respawn}>もう一度遊ぶ</button></div></div>}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 15, alignItems: 'start', marginTop: 15 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: '0 0 8px', color: '#466f71', fontSize: 15 }}>🏆 芋虫浜ランキング <small style={{ fontWeight: 'normal', opacity: .65 }}>全参加者</small></h3>
        <div style={{ display: 'grid', gap: 4, fontSize: 11, color: '#6f8d86', width: '100%' }}>
          {ranking.length === 0 && <span>まだ記録がありません。最初の芋虫になろう。</span>}
          {ranking.map((entry, index) => <div key={`${entry.nickname}-${index}`} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) auto', alignItems: 'center', gap: 6, padding: '5px 7px', borderRadius: 7, background: index === 0 ? 'rgba(255,242,185,.55)' : 'rgba(255,255,255,.45)', minWidth: 0 }}><span>{index + 1}.</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{entry.nickname}</span><b style={{ whiteSpace: 'nowrap' }}>{entry.score} 🥬</b></div>)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}><button className="play-button" type="button" onClick={onExit}>← 広場へ戻る</button><button className="ghost-button" type="button" onClick={() => setRules(true)}>？ ルール</button><button className="ghost-button" style={{ color: '#d87070', borderColor: 'rgba(216,112,112,.3)' }} type="button" onClick={() => { playerRef.current.isAlive = false; void saveScore(); setGameState('gameover'); }}>退出して共有</button></div>
    </div>

    {rules && <div className="modal-backdrop" onClick={() => setRules(false)}><div className="detail-modal" style={{ width: 'min(100%, 400px)' }} onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setRules(false)}><X size={18} /></button><p className="eyebrow">RULES</p><h2>芋虫浜の歩き方</h2><ul style={{ color: '#7b9694', fontSize: 12, paddingLeft: 20, lineHeight: 2 }}><li>画面をタップした方向、または矢印キーで移動します。</li><li>🥬を食べるとスコアが上がり、5つごとに体が1つ長くなります。</li><li>他の芋虫の体に頭がぶつかると消滅します。</li><li>🌐の代わりに、NPCには名前を表示しています。</li><li>NPCは人がいなくてもサーバー上で動き続けます。</li></ul><button className="primary-button" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setRules(false)}>閉じる</button></div></div>}
  </section>;
}

function WormVisual({ worm, npc }: { worm: Worm; npc: boolean }) {
  const flipped = worm.dir.x > 0;
  return <div>
    {Array.from({ length: worm.length }).map((_, index) => {
      const i = Math.min((index + 1) * SPACING, worm.history.length - 1);
      const p = worm.history[i];
      if (!p) return null;
      return <div key={index} style={{ position: 'absolute', left: p.x, top: p.y, fontSize: 24, transform: 'translate(-50%,-50%)', zIndex: npc ? 3 : 4 }}>{worm.body}</div>;
    })}
    <div style={{ position: 'absolute', left: worm.x, top: worm.y, zIndex: 10 }}><span style={{ position: 'absolute', transform: `translate(-50%,-50%) scaleX(${flipped ? -1 : 1})`, fontSize: 32, lineHeight: 1 }}>{worm.emoji}</span><small style={{ position: 'absolute', top: -32, left: 0, transform: 'translateX(-50%)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', color: npc ? '#7b9694' : '#466f71', fontFamily: "'DM Mono', monospace, 'Noto Serif JP', serif", fontSize: 10, fontWeight: npc ? 'normal' : 'bold', background: 'rgba(255,255,255,.8)', padding: '2px 6px', borderRadius: 8 }}>{worm.name}{npc ? ' · NPC' : ' · 🌐'}</small></div>
  </div>;
}
