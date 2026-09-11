'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import React from 'react';
import { X } from "lucide-react";

type Position = { x: number; y: number };

type WormData = {
  id: string;
  isPlayer: boolean;
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
};

type LeaderboardEntry = {
  nickname: string;
  score: number;
};

const STAGE_SIZE = 3000;
const SPEED = 4;
const NPC_SPEED = 3.5;
const SPACING = 6;
const MAX_HISTORY = 600;
const HIT_RADIUS = 20;
const FOOD_RADIUS = 30;
const POSITION_SEND_INTERVAL = 100;
const REMOTE_TIMEOUT = 3000;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://type-drift-api.onrender.com';
const REVERB_HOST = process.env.NEXT_PUBLIC_REVERB_HOST || 'type-drift-reverb.onrender.com';
const REVERB_APP_KEY = process.env.NEXT_PUBLIC_REVERB_APP_KEY || 'type-drift-worm';

const createWorm = (id: string, name: string, emoji: string, body: string, x: number, y: number, isPlayer: boolean): WormData => ({
  id, isPlayer, name, emoji, body, x, y,
  dir: { x: Math.random() > 0.5 ? 1 : -1, y: Math.random() > 0.5 ? 1 : -1 },
  history: Array(30).fill({ x, y }),
  score: 0,
  length: 3,
  isAlive: true
});

export default function WormGame({ nickname, onExit }: { nickname: string, onExit: () => void }) {
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const requestRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientKeyRef = useRef<string>('');
  const socketRef = useRef<WebSocket | null>(null);
  const remoteWormsRef = useRef<Map<string, WormData & { lastSeen: number }>>(new Map());

  const initialWorms = [
    createWorm('player', nickname, '🐛', '🟢', STAGE_SIZE / 2, STAGE_SIZE / 2, true),
    createWorm('npc1', 'LSI芋虫', '🐛', '🔵', STAGE_SIZE * 0.2, STAGE_SIZE * 0.2, false),
    createWorm('npc2', 'ダーリンちゃん', '🥺', '🌸', STAGE_SIZE * 0.8, STAGE_SIZE * 0.2, false),
    createWorm('npc3', '匿名のINTJ', '🐛', '🟣', STAGE_SIZE * 0.5, STAGE_SIZE * 0.8, false),
    createWorm('npc4', '匿名のLII', '🐛', '⚪', STAGE_SIZE * 0.3, STAGE_SIZE * 0.7, false),
    createWorm('npc5', '匿名のLSI', '🐛', '🟡', STAGE_SIZE * 0.7, STAGE_SIZE * 0.5, false),
    createWorm('npc6', '匿名', '🐛', '🟤', STAGE_SIZE * 0.4, STAGE_SIZE * 0.4, false),
  ];

  const wormsRef = useRef<WormData[]>(initialWorms);
  const foodsRef = useRef<Position[]>([]);

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/worm/ranking`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setLeaderboard(Array.isArray(data.scores) ? data.scores : []);
    } catch {
      // Ranking is optional; the game itself should continue offline.
    }
  }, []);

  const submitScore = useCallback(async (finalScore: number) => {
    if (!clientKeyRef.current || finalScore <= 0) return;
    try {
      await fetch(`${API_URL}/api/worm/ranking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: clientKeyRef.current,
          nickname: nickname.slice(0, 80) || '匿名の芋虫',
          score: finalScore,
        }),
      });
      await loadLeaderboard();
    } catch {
      // Keep the local game usable even if the API is sleeping/unavailable.
    }
  }, [loadLeaderboard, nickname]);

  useEffect(() => {
    const storageKey = 'type-drift-worm-client-key';
    let key = window.localStorage.getItem(storageKey);
    if (!key) {
      key = crypto.randomUUID();
      window.localStorage.setItem(storageKey, key);
    }
    clientKeyRef.current = key;
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    const initialFoods = Array.from({ length: 80 }).map(() => ({
      x: Math.random() * STAGE_SIZE,
      y: Math.random() * STAGE_SIZE
    }));
    foodsRef.current = initialFoods;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (foodsRef.current.length < 150) {
        foodsRef.current.push({ x: Math.random() * STAGE_SIZE, y: Math.random() * STAGE_SIZE });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const worms = wormsRef.current;
      const deadNPCs = worms.filter(w => !w.isPlayer && !w.isAlive);
      deadNPCs.forEach(npc => {
        Object.assign(npc, createWorm(npc.id, npc.name, npc.emoji, npc.body, Math.random() * STAGE_SIZE, Math.random() * STAGE_SIZE, false));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Reverb speaks the Pusher WebSocket protocol, so the browser can connect
  // directly without adding Echo/Pusher packages to the Next.js bundle.
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      setNetworkStatus('connecting');

      const url = `wss://${REVERB_HOST}/app/${encodeURIComponent(REVERB_APP_KEY)}?protocol=7&client=js&version=8.4&flash=false`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        // Reverb sends pusher:connection_established before this is normally needed.
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.event === 'pusher:connection_established') {
            socket.send(JSON.stringify({
              event: 'pusher:subscribe',
              data: { channel: 'worm-beach' },
            }));
            setNetworkStatus('connected');
            return;
          }

          if (message.event !== 'worm.position') return;

          const payload = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
          if (!payload?.clientId || payload.clientId === clientKeyRef.current) return;

          const now = Date.now();
          const existing = remoteWormsRef.current.get(payload.clientId);
          const history = existing
            ? [{ x: payload.x, y: payload.y }, ...existing.history].slice(0, MAX_HISTORY)
            : Array(30).fill({ x: payload.x, y: payload.y });

          remoteWormsRef.current.set(payload.clientId, {
            id: `remote-${payload.clientId}`,
            isPlayer: true,
            name: payload.name || '匿名の芋虫',
            emoji: payload.emoji || '🐛',
            body: payload.body || '🟢',
            x: Number(payload.x) || 0,
            y: Number(payload.y) || 0,
            dir: { x: Number(payload.dirX) || 0, y: Number(payload.dirY) || 0 },
            history,
            score: Number(payload.score) || 0,
            length: Math.max(3, Number(payload.length) || 3),
            isAlive: payload.isAlive !== false,
            lastSeen: now,
          });
        } catch {
          // Ignore malformed websocket messages.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setNetworkStatus('offline');
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        setNetworkStatus('offline');
      };
    };

    connect();

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      remoteWormsRef.current.forEach((worm, id) => {
        if (now - worm.lastSeen > REMOTE_TIMEOUT) {
          remoteWormsRef.current.delete(id);
        }
      });
    }, 1000);

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(cleanupInterval);
      socketRef.current?.close();
      socketRef.current = null;
      remoteWormsRef.current.clear();
    };
  }, []);

  // Send the local head position at 10Hz. Neon is deliberately not involved
  // in this hot path; Laravel/Reverb handles the live movement fan-out.
  useEffect(() => {
    const interval = setInterval(() => {
      const socket = socketRef.current;
      const player = wormsRef.current.find(w => w.isPlayer);
      if (!socket || socket.readyState !== WebSocket.OPEN || !clientKeyRef.current || !player) return;

      const payload = {
        clientId: clientKeyRef.current,
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
      };

      fetch(`${API_URL}/api/worm/position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Realtime is best-effort; the game remains playable when API is asleep.
      });
    }, POSITION_SEND_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const update = useCallback(() => {
    const worms = wormsRef.current;
    let foods = foodsRef.current;

    worms.forEach(worm => {
      if (!worm.isAlive) return;

      if (!worm.isPlayer) {
        let tx = worm.dir.x, ty = worm.dir.y;
        let turn = 0.04;

        let wallForceX = 0, wallForceY = 0;
        if (worm.x < 150) wallForceX = 1; else if (worm.x > STAGE_SIZE - 150) wallForceX = -1;
        if (worm.y < 150) wallForceY = 1; else if (worm.y > STAGE_SIZE - 150) wallForceY = -1;

        let avoidX = 0, avoidY = 0;
        let dangerFound = false;
        const lookAheadX = worm.x + worm.dir.x * 120;
        const lookAheadY = worm.y + worm.dir.y * 120;

        worms.forEach(otherWorm => {
          if (!otherWorm.isAlive || otherWorm.id === worm.id) return;
          const maxIndex = otherWorm.length * SPACING;
          for (let k = 0; k < otherWorm.history.length && k < maxIndex; k += SPACING) {
            const bx = otherWorm.history[k].x;
            const by = otherWorm.history[k].y;
            if (Math.hypot(lookAheadX - bx, lookAheadY - by) < 80) {
              avoidX += (worm.x - bx);
              avoidY += (worm.y - by);
              dangerFound = true;
            }
          }
        });

        let attackX = 0, attackY = 0;
        let attacking = false;
        if (!dangerFound) {
          worms.forEach(otherWorm => {
            if (!otherWorm.isAlive || otherWorm.id === worm.id) return;
            if (worm.length > otherWorm.length) {
              const distToHead = Math.hypot(worm.x - otherWorm.x, worm.y - otherWorm.y);
              if (distToHead < 250) {
                attackX = (otherWorm.x + otherWorm.dir.x * 80) - worm.x;
                attackY = (otherWorm.y + otherWorm.dir.y * 80) - worm.y;
                attacking = true;
              }
            }
          });
        }

        let foodX = 0, foodY = 0;
        let hasFood = false;
        if (!dangerFound && !attacking) {
          let minDist = Infinity;
          let target = null as Position | null;
          foods.forEach(f => {
            const d = Math.hypot(f.x - worm.x, f.y - worm.y);
            if (d < minDist) { minDist = d; target = f; }
          });
          if (target && minDist < 800) {
            foodX = target.x - worm.x;
            foodY = target.y - worm.y;
            hasFood = true;
          }
        }

        if (wallForceX || wallForceY) {
          tx = wallForceX || tx; ty = wallForceY || ty;
          turn = 0.12;
        } else if (dangerFound) {
          tx = avoidX; ty = avoidY;
          turn = 0.15;
        } else if (attacking) {
          tx = attackX; ty = attackY;
          turn = 0.07;
        } else if (hasFood) {
          tx = foodX; ty = foodY;
          turn = 0.05;
        }

        const tDist = Math.hypot(tx, ty);
        if (tDist > 0) {
          worm.dir.x = worm.dir.x * (1 - turn) + (tx / tDist) * turn;
          worm.dir.y = worm.dir.y * (1 - turn) + (ty / tDist) * turn;
          const nDist = Math.hypot(worm.dir.x, worm.dir.y);
          worm.dir.x /= nDist; worm.dir.y /= nDist;
        }
      }

      const speed = worm.isPlayer ? SPEED : NPC_SPEED;
      worm.x = Math.max(0, Math.min(STAGE_SIZE, worm.x + worm.dir.x * speed));
      worm.y = Math.max(0, Math.min(STAGE_SIZE, worm.y + worm.dir.y * speed));

      worm.history.unshift({ x: worm.x, y: worm.y });
      if (worm.history.length > MAX_HISTORY) worm.history.pop();

      let nextFoods: Position[] = [];
      let eatenCount = 0;
      for (const f of foods) {
        if (Math.hypot(f.x - worm.x, f.y - worm.y) < FOOD_RADIUS) {
          eatenCount++;
        } else {
          nextFoods.push(f);
        }
      }
      if (eatenCount > 0) {
        worm.score += eatenCount;
        worm.length = 3 + Math.floor(worm.score / 5);
      }
      foods = nextFoods;
    });

    // Local/NPC collisions.
    for (let i = 0; i < worms.length; i++) {
      const a = worms[i];
      if (!a.isAlive) continue;
      let hit = false;

      for (let j = 0; j < worms.length; j++) {
        const b = worms[j];
        if (!b.isAlive || i === j) continue;
        const hitMaxIndex = b.length * SPACING;
        for (let k = 0; k < b.history.length && k < hitMaxIndex; k += SPACING) {
          const bx = b.history[k].x;
          const by = b.history[k].y;
          if (Math.hypot(a.x - bx, a.y - by) < HIT_RADIUS) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }

      // A real remote player's locally reconstructed trail can also kill us.
      if (!hit && a.isPlayer) {
        remoteWormsRef.current.forEach(remote => {
          if (hit || !remote.isAlive) return;
          const hitMaxIndex = remote.length * SPACING;
          for (let k = 0; k < remote.history.length && k < hitMaxIndex; k += SPACING) {
            const bx = remote.history[k].x;
            const by = remote.history[k].y;
            if (Math.hypot(a.x - bx, a.y - by) < HIT_RADIUS) {
              hit = true;
              break;
            }
          }
        });
      }

      if (hit) {
        a.isAlive = false;
        const dropMaxIndex = a.length * SPACING;
        for (let k = 0; k < a.history.length && k < dropMaxIndex; k += SPACING) {
          foods.push({
            x: a.history[k].x + (Math.random() * 20 - 10),
            y: a.history[k].y + (Math.random() * 20 - 10)
          });
        }
      }
    }

    foodsRef.current = foods;
    setRenderTrigger(prev => prev + 1);
    requestRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  useEffect(() => {
    const player = wormsRef.current.find(w => w.isPlayer);
    if (player) {
      if (!player.isAlive && gameState !== 'gameover') {
        setGameState('gameover');
        void submitScore(player.score);
      } else if (player.isAlive && player.score !== score) {
        setScore(player.score);
      }
    }
  }, [renderTrigger, gameState, score, submitScore]);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
      const player = wormsRef.current.find(w => w.isPlayer);
      if (player && player.isAlive) player.dir = { x: dx / dist, y: dy / dist };
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handlePointerMove]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        const player = wormsRef.current.find(w => w.isPlayer);
        if (player && player.isAlive) player.dir = { x: move[0], y: move[1] };
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const respawn = () => {
    const w = wormsRef.current;
    const pIdx = w.findIndex(x => x.isPlayer);
    if (pIdx >= 0) w[pIdx] = createWorm('player', nickname, '🐛', '🟢', STAGE_SIZE / 2, STAGE_SIZE / 2, true);
    setScore(0);
    setGameState('playing');
  };

  const retire = () => {
    const player = wormsRef.current.find(w => w.isPlayer);
    if (player) {
      player.isAlive = false;
      void submitScore(player.score);
    }
    setGameState('gameover');
  };

  const handleNativeShare = () => {
    const text = `芋虫浜でスコア${score}を記録しました！🥬\n#typedrift #芋虫浜\n`;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      navigator.share({ title: '芋虫浜の記録', text, url }).catch(console.error);
    } else {
      alert("お使いのブラウザやOSはネイティブ共有（ナビゲーション共有）に対応していません。");
    }
  };

  const player = wormsRef.current.find(w => w.isPlayer);
  const cameraX = player ? player.x : STAGE_SIZE / 2;
  const cameraY = player ? player.y : STAGE_SIZE / 2;
  const remoteWorms = Array.from(remoteWormsRef.current.values());

  const stageStyle = {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: `translate(${-cameraX}px, ${-cameraY}px)`
  };

  return (
    <section className="activity-section game-page">
      <p className="eyebrow">WORM BEACH</p>
      <h2>
        芋虫浜 <small className="score-label">🥬 {score} <span style={{opacity: 0.7, fontSize: '0.9em'}}>({score % 5}/5で🟢)</span></small>
      </h2>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '10px', color: '#6f8d86' }}>
        <span>{networkStatus === 'connected' ? '🟢 オンライン' : networkStatus === 'connecting' ? '🟡 接続中…' : '⚪ オフライン（NPCのみ）'}</span>
        {networkStatus === 'connected' && <span>👥 {remoteWorms.length + 1}匹参加中</span>}
      </div>

      <div
        ref={containerRef}
        className="worm-game"
        style={{
          position: 'relative', width: '100%', height: '450px', overflow: 'hidden',
          backgroundColor: '#a9d9c5',
          backgroundImage: 'radial-gradient(circle at 20px 35px, #fff2b9 0, #fff2b9 3px, transparent 4px), radial-gradient(circle at 75px 65px, #fff2b9 0, #fff2b9 3px, transparent 4px)',
          backgroundSize: '100px 100px',
          backgroundPosition: `${-cameraX}px ${-cameraY}px`,
          borderRadius: '12px 30px 30px 30px'
        }}
      >
        <div className="game-stage" style={{ ...stageStyle, width: 0, height: 0 }}>
          {foodsRef.current.map((food, i) => (
            <div key={i} style={{ position: 'absolute', left: food.x, top: food.y, fontSize: '27px', transform: 'translate(-50%, -50%)', zIndex: 1 }}>🥬</div>
          ))}

          {wormsRef.current.map(worm => {
            if (!worm.isAlive) return null;
            const isFlipped = worm.dir.x > 0;
            return (
              <div key={worm.id}>
                {Array.from({ length: worm.length }).map((_, index) => {
                  const histIndex = Math.min((index + 1) * SPACING, worm.history.length - 1);
                  const pos = worm.history[histIndex];
                  if (!pos) return null;
                  return (
                    <div key={`body-${index}`} style={{ position: 'absolute', left: pos.x, top: pos.y, fontSize: '24px', transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                      {worm.body}
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', left: worm.x, top: worm.y, zIndex: 10 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', transform: `translate(-50%, -50%) scaleX(${isFlipped ? -1 : 1})`, fontSize: '32px', lineHeight: 1 }}>{worm.emoji}</span>
                    <small style={{ position: 'absolute', top: '-32px', left: '0', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: worm.isPlayer ? '#466f71' : '#7b9694', fontFamily: "'DM Mono', monospace, 'Noto Serif JP', serif", fontSize: '10px', fontWeight: worm.isPlayer ? 'bold' : 'normal', background: 'rgba(255,255,255,0.7)', padding: '2px 6px', borderRadius: '8px' }}>
                      {worm.name}
                    </small>
                  </div>
                </div>
              </div>
            );
          })}

          {remoteWorms.map(worm => {
            if (!worm.isAlive) return null;
            const isFlipped = worm.dir.x > 0;
            return (
              <div key={worm.id}>
                {Array.from({ length: worm.length }).map((_, index) => {
                  const histIndex = Math.min((index + 1) * SPACING, worm.history.length - 1);
                  const pos = worm.history[histIndex];
                  if (!pos) return null;
                  return (
                    <div key={`remote-body-${index}`} style={{ position: 'absolute', left: pos.x, top: pos.y, fontSize: '24px', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
                      {worm.body}
                    </div>
                  );
                })}
                <div style={{ position: 'absolute', left: worm.x, top: worm.y, zIndex: 11 }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', transform: `translate(-50%, -50%) scaleX(${isFlipped ? -1 : 1})`, fontSize: '32px', lineHeight: 1 }}>{worm.emoji}</span>
                    <small style={{ position: 'absolute', top: '-32px', left: '0', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#466f71', fontFamily: "'DM Mono', monospace, 'Noto Serif JP', serif", fontSize: '10px', fontWeight: 'bold', background: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: '8px' }}>
                      {worm.name} 🌐
                    </small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {gameState === 'playing' && (
          <p style={{ position: 'absolute', bottom: '16px', left: '20px', margin: 0, zIndex: 20, color: '#57877c', fontFamily: "'DM Mono', monospace", fontSize: '9px' }}>
            画面をタップした方向、または矢印キーで移動 · 他の芋虫の体に頭がぶつかると消滅
          </p>
        )}

        {gameState === 'gameover' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(34, 56, 62, 0.5)', display: 'grid', placeItems: 'center', zIndex: 100, backdropFilter: 'blur(2px)' }}>
            <div style={{ background: '#fffaf1', padding: '30px 40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 10px', color: '#466f71', fontFamily: "'Noto Serif JP', serif", fontSize: '22px' }}>観測終了</h3>
              <p style={{ margin: '0 0 24px', color: '#7b9694', fontSize: '13px' }}>
                集めたキャベツ: <b style={{ color: '#5a9a89', fontSize: '16px' }}>{score}</b>
                <span style={{opacity: 0.7, fontSize: '0.9em', marginLeft: '6px'}}>({score % 5}/5で🟢)</span>
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
                <button onClick={handleNativeShare} className="primary-button">共有する</button>
                <a href={`https://x.com/intent/tweet?text=${encodeURIComponent(`芋虫浜でスコア${score}を記録しました！🥬\n#typedrift #芋虫浜\n${typeof window !== 'undefined' ? window.location.origin : ''}`)}`} target="_blank" rel="noopener noreferrer" className="primary-button" style={{ textDecoration: 'none', background: '#000', color: '#fff', borderColor: '#000' }}>𝕏</a>
              </div>
              <button className="pick-button" onClick={respawn}>もう一度遊ぶ</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '15px', alignItems: 'start', marginTop: '15px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px', color: '#466f71', fontSize: '15px' }}>🏆 芋虫浜ランキング</h3>
          <div style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6f8d86' }}>
            {leaderboard.length === 0 && <span>まだ記録がありません。最初の芋虫になろう。</span>}
            {leaderboard.map((entry, index) => (
              <div key={`${entry.nickname}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 7px', borderRadius: '7px', background: index === 0 ? 'rgba(255,242,185,0.55)' : 'rgba(255,255,255,0.45)' }}>
                <span>{index + 1}. {entry.nickname}</span><b>{entry.score} 🥬</b>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="play-button" type="button" onClick={onExit}>← 広場へ戻る</button>
          {gameState === 'playing' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="ghost-button" type="button" onClick={() => setRuleOpen(true)}>？ ルール</button>
              <button className="ghost-button" style={{ color: '#d87070', borderColor: 'rgba(216,112,112,0.3)' }} type="button" onClick={retire}>退出して共有</button>
            </div>
          )}
        </div>
      </div>

      {ruleOpen && (
        <div className="modal-backdrop" onClick={() => setRuleOpen(false)}>
          <div className="detail-modal" style={{ width: 'min(100%, 400px)' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setRuleOpen(false)}><X size={18} /></button>
            <p className="eyebrow">RULES</p>
            <h2 style={{ marginBottom: '15px' }}>芋虫浜の歩き方</h2>
            <ul style={{ color: '#7b9694', fontSize: '12px', paddingLeft: '20px', lineHeight: 2, marginBottom: '25px' }}>
              <li>画面をタップした方向、または矢印キーで移動します。</li>
              <li>落ちているキャベツ（🥬）を食べるとスコアが上がります。</li>
              <li><strong>5つ食べるごとに体（🟢）が1つ長くなります。</strong></li>
              <li>他の芋虫の体に自分の頭がぶつかると消滅します。</li>
              <li>消滅した芋虫は、体の長さに応じたキャベツをその場に落とします。</li>
              <li><strong>🌐マークの芋虫は、別の端末から遊んでいるプレイヤーです。</strong></li>
            </ul>
            <button className="primary-button" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setRuleOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </section>
  );
}
