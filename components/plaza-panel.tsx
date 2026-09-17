'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type PlazaMessage = { id: string; author: string; body: string; kind: 'human' | 'ai' | 'emote'; emoji?: string; createdAt: number };
type Props = { nickname: string; emote: string; onToast: (message: string) => void };

const WORLD = process.env.NEXT_PUBLIC_WORM_WORLD_URL || 'https://type-drift-worm-world.onrender.com';
const WS = `${WORLD.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`;
const NPC_COUNT = 2;
const displayName = (nickname: string) => nickname || '匿名の誰か';

export default function PlazaPanel({ nickname, emote, onToast }: Props) {
  const [messages, setMessages] = useState<PlazaMessage[]>([]);
  const [presence, setPresence] = useState(0);
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const greetedRef = useRef(false);
  const aiUrl = useMemo(() => `${WORLD}/api/plaza/ai`, []);

  useEffect(() => {
    const findTarget = () => {
      const target = document.querySelector('.plaza-section');
      setPortalTarget(target instanceof HTMLElement ? target : null);
      const pill = document.querySelector('.online-pill');
      if (pill) pill.textContent = `● ${presence + NPC_COUNT}人がいる`;
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [presence]);

  useEffect(() => {
    let alive = true;
    const connect = () => {
      if (!alive || !document.querySelector('.plaza-section')) return;
      const ws = new WebSocket(WS);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); ws.send(JSON.stringify({ type: 'plaza_join' })); };
      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'plaza_presence') {
            setPresence(Number(data.count) || 0);
            if (Array.isArray(data.messages)) setMessages(data.messages);
          } else if (data.type === 'plaza_message' && data.message) {
            setMessages(current => [...current.filter(item => item.id !== data.message.id), data.message].slice(-80));
          }
        } catch { /* ignore malformed relay data */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive && document.querySelector('.plaza-section')) reconnectRef.current = window.setTimeout(connect, 1800);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      alive = false;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'plaza_leave' }));
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!connected || greetedRef.current || sessionStorage.getItem('type-drift-plaza-greeted')) return;
    greetedRef.current = true;
    sessionStorage.setItem('type-drift-plaza-greeted', '1');
    void requestAi('新しい人が広場に来ました。短く自然に歓迎してください。');
  }, [connected]);

  const sendRelay = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      onToast('広場との接続を待っています…');
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  };

  async function requestAi(humanText: string) {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const response = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: humanText, history: messages.slice(-12) }),
      });
      if (!response.ok) throw new Error('ai failed');
      const data = await response.json();
      for (const reply of Array.isArray(data.replies) ? data.replies.slice(0, 2) : []) {
        sendRelay({ type: 'plaza_ai_message', character: reply.character, body: reply.body });
      }
    } catch {
      sendRelay({ type: 'plaza_ai_message', character: 'ダーリンちゃん', body: 'ねぇ、聞いてるよ♡' });
      sendRelay({ type: 'plaza_ai_message', character: 'LSI芋虫', body: '発言を記録しました。' });
    } finally {
      setAiBusy(false);
    }
  }

  const sendMessage = () => {
    const body = text.trim();
    if (!body || !sendRelay({ type: 'plaza_message', nickname: displayName(nickname), body })) return;
    setText('');
    window.setTimeout(() => void requestAi(body), 250);
  };

  const sendEmote = () => {
    if (!sendRelay({ type: 'plaza_emote', nickname: displayName(nickname), emote, emoji: '◌' })) return;
    onToast(`${displayName(nickname)}から ${emote} が届きました`);
  };

  const content = <>
    <div className="plaza-chat-head">
      <div><p className="eyebrow">LIVE THREAD</p><h3>広場のひとこと</h3></div>
      <span className={connected ? 'plaza-status is-connected' : 'plaza-status'}>{connected ? '● 接続中' : '○ 接続中…'}</span>
    </div>
    <div className="plaza-chat" ref={listRef} aria-live="polite">
      {messages.length === 0 && <p className="plaza-chat-empty">まだ誰も話していません。ひとこと置いてみる？</p>}
      {messages.map(message => <article className={`plaza-chat-item plaza-chat-item--${message.kind}`} key={message.id}>
        <span className="plaza-chat-avatar">{message.emoji || (message.kind === 'ai' ? '🥺' : '◌')}</span>
        <div><div className="plaza-chat-meta"><strong>{message.author}</strong>{message.kind === 'ai' && <small>AI</small>}</div><p>{message.body}</p></div>
      </article>)}
    </div>
    <div className="plaza-chat-compose">
      <input value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') sendMessage(); }} placeholder="広場にひとこと…" maxLength={120} />
      <button type="button" className="plaza-chat-emote" onClick={sendEmote} aria-label="エモートを送る">{emote}</button>
      <button type="button" onClick={sendMessage}>送る</button>
    </div>
    <p className="plaza-chat-note">{presence + NPC_COUNT}人が広場にいます（NPC含む） · エモートもここに流れます{aiBusy ? ' · AIが考え中…' : ''}</p>
  </>;

  return portalTarget ? createPortal(content, portalTarget) : null;
}
