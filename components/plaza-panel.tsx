'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type PlazaMessage = {
  id: string;
  author: string;
  body: string;
  kind: 'human' | 'ai' | 'emote';
  emoji?: string;
  createdAt: number;
};

const WORLD = process.env.NEXT_PUBLIC_PLAZA_REALTIME_URL || process.env.NEXT_PUBLIC_WORM_WORLD_URL || 'https://type-drift-worm-world.onrender.com';
const WS = `${WORLD.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`;
const NPC_COUNT = 2;
const EMOTES = ['👋', '✦', '🌊', '💭', '♡', '✨', '🍵'];
const displayName = (nickname?: string) => nickname?.trim() || '匿名の誰か';

export type PlazaPanelProps = {
  nickname?: string;
  externalEmote?: { emote: string; label?: string; id: number } | null;
  onToast?: (message: string) => void;
  onPresenceUpdate?: (count: number) => void;
};

const defaultInitialMessages: PlazaMessage[] = [
  {
    id: 'init-darling',
    author: 'ダーリンちゃん',
    body: 'いらっしゃい♡ ここはみんなの広場だよ。何でもつぶやいてね。',
    kind: 'ai',
    emoji: '🥺',
    createdAt: Date.now() - 60000,
  },
  {
    id: 'init-worm',
    author: 'LSI芋虫',
    body: '広場のリアルタイム接続を確認しました。発言やエモートはスレッドに記録されます。',
    kind: 'ai',
    emoji: '🐛',
    createdAt: Date.now() - 30000,
  },
];

export default function PlazaPanel({
  nickname = '',
  externalEmote = null,
  onToast,
  onPresenceUpdate,
}: PlazaPanelProps) {
  const [messages, setMessages] = useState<PlazaMessage[]>(defaultInitialMessages);
  const [presence, setPresence] = useState(0);
  const [text, setText] = useState('');
  const [emoteIndex, setEmoteIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [localToast, setLocalToast] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const greetedRef = useRef(false);
  const lastHandledEmoteId = useRef<number | null>(null);
  const aiUrl = useMemo(() => `${WORLD}/api/plaza/ai`, []);

  // WebSocket 接続
  useEffect(() => {
    let alive = true;
    const connect = () => {
      if (!alive) return;
      try {
        const ws = new WebSocket(WS);
        wsRef.current = ws;
        ws.onopen = () => {
          setConnected(true);
          ws.send(JSON.stringify({ type: 'plaza_join' }));
        };
        ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'plaza_presence') {
              const count = Number(data.count) || 0;
              setPresence(count);
              onPresenceUpdate?.(count + NPC_COUNT);
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                setMessages(data.messages);
              }
            } else if (data.type === 'plaza_message' && data.message) {
              const msg: PlazaMessage = data.message;
              setMessages(current => {
                const filtered = current.filter(item => item.id !== msg.id);
                return [...filtered, msg].slice(-80);
              });
              // エモートの場合、トースト通知も出す
              if (msg.kind === 'emote') {
                const notice = `${msg.author}から ${msg.body} が届きました`;
                setLocalToast(notice);
                onToast?.(notice);
              }
            }
          } catch {
            // relay message parse error
          }
        };
        ws.onclose = () => {
          setConnected(false);
          if (alive) reconnectRef.current = window.setTimeout(connect, 2500);
        };
        ws.onerror = () => ws.close();
      } catch {
        setConnected(false);
        if (alive) reconnectRef.current = window.setTimeout(connect, 3000);
      }
    };
    connect();

    return () => {
      alive = false;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'plaza_leave' }));
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, []);

  // メッセージ追加時の自動スクロール
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // ローカルトーストのタイマー
  useEffect(() => {
    if (!localToast) return;
    const timer = window.setTimeout(() => setLocalToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [localToast]);

  // 初回入室時の歓迎挨拶
  useEffect(() => {
    if (!connected || greetedRef.current || sessionStorage.getItem('type-drift-plaza-greeted')) return;
    greetedRef.current = true;
    sessionStorage.setItem('type-drift-plaza-greeted', '1');
    void requestAi('新しい人が広場に来ました。短く自然に歓迎してください。');
  }, [connected]);

  // 送信ヘルパー
  const sendRelay = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const notice = '広場との接続を待っています…';
      setLocalToast(notice);
      onToast?.(notice);
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  };

  // AIへの返答リクエスト
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
      // フォールバック応答
      sendRelay({ type: 'plaza_ai_message', character: 'ダーリンちゃん', body: 'ねぇ、聞いてるよ♡' });
      sendRelay({ type: 'plaza_ai_message', character: 'LSI芋虫', body: '発言を記録しました。' });
    } finally {
      setAiBusy(false);
    }
  }

  // テキストメッセージ送信
  const sendMessage = () => {
    const body = text.trim();
    if (!body) return;
    const author = displayName(nickname);
    if (!sendRelay({ type: 'plaza_message', nickname: author, body })) {
      // オフライン時のローカル追加
      const localMsg: PlazaMessage = {
        id: `local-${Date.now()}`,
        author,
        body,
        kind: 'human',
        emoji: '◌',
        createdAt: Date.now(),
      };
      setMessages(curr => [...curr, localMsg]);
    }
    setText('');
    window.setTimeout(() => void requestAi(body), 350);
  };

  // エモート送信
  const sendEmote = (emoteValue: string) => {
    const author = displayName(nickname);
    if (sendRelay({ type: 'plaza_emote', nickname: author, emote: emoteValue, emoji: '◌' })) {
      const notice = `${author}から ${emoteValue} が届きました`;
      setLocalToast(notice);
      onToast?.(notice);
    } else {
      const localEmote: PlazaMessage = {
        id: `local-emote-${Date.now()}`,
        author,
        body: emoteValue,
        kind: 'emote',
        emoji: '◌',
        createdAt: Date.now(),
      };
      setMessages(curr => [...curr, localEmote]);
      const notice = `${author}から ${emoteValue} が届きました`;
      setLocalToast(notice);
      onToast?.(notice);
    }
  };

  // 親コンポーネントからの外部エモート要求
  useEffect(() => {
    if (!externalEmote || externalEmote.id === lastHandledEmoteId.current) return;
    lastHandledEmoteId.current = externalEmote.id;
    sendEmote(externalEmote.emote);
  }, [externalEmote]);

  const currentQuickEmote = EMOTES[emoteIndex % EMOTES.length];

  return (
    <div className="plaza-live-thread">
      <div className="plaza-chat-head">
        <div>
          <p className="eyebrow">LIVE THREAD</p>
          <h3>広場のひとこと</h3>
        </div>
        <span className={connected ? 'plaza-status is-connected' : 'plaza-status'}>
          {connected ? '● 接続中' : '○ 接続待機…'}
        </span>
      </div>

      {/* スクロール性のチャットスレッド */}
      <div className="plaza-chat" ref={listRef} aria-live="polite">
        {messages.length === 0 ? (
          <p className="plaza-chat-empty">まだ誰も話していません。ひとこと置いてみる？</p>
        ) : (
          messages.map(message => {
            if (message.kind === 'emote') {
              return (
                <div className="plaza-chat-item plaza-chat-item--emote" key={message.id}>
                  <div className="plaza-emote-badge">
                    <span className="plaza-emote-bubble">{message.body}</span>
                    <span className="plaza-emote-label">
                      <strong>{message.author}</strong>から {message.body} が届きました
                    </span>
                  </div>
                </div>
              );
            }

            const isAi = message.kind === 'ai';
            const avatarEmoji =
              message.emoji ||
              (isAi
                ? message.author.includes('芋虫')
                  ? '🐛'
                  : '🥺'
                : '◌');

            return (
              <article className={`plaza-chat-item plaza-chat-item--${message.kind}`} key={message.id}>
                <span className="plaza-chat-avatar">{avatarEmoji}</span>
                <div className="plaza-chat-body">
                  <div className="plaza-chat-meta">
                    <strong>{message.author}</strong>
                    {isAi && <small className="ai-tag">AI</small>}
                  </div>
                  <p>{message.body}</p>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* 入力バー */}
      <div className="plaza-chat-compose">
        <input
          value={text}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') sendMessage();
          }}
          placeholder="広場にひとこと…（Enterで送信）"
          maxLength={120}
        />
        <button
          type="button"
          className="plaza-chat-emote-btn"
          onClick={() => {
            sendEmote(currentQuickEmote);
            setEmoteIndex(i => i + 1);
          }}
          title="エモートを送る（タップで切り替え）"
          aria-label="エモートを送る"
        >
          {currentQuickEmote}
        </button>
        <button type="button" className="plaza-chat-send-btn" onClick={sendMessage}>
          送る
        </button>
      </div>

      <div className="plaza-chat-footer">
        <p className="plaza-chat-note">
          {presence + NPC_COUNT}人が広場にいます（NPC含む） · エモートもここに流れます
          {aiBusy ? ' · AIが考え中…' : ''}
        </p>
        {localToast && <div className="plaza-chat-toast">{localToast}</div>}
      </div>
    </div>
  );
}
