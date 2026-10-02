'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getGuestKey, logActivity } from '@/lib/activity-log';

export type PlazaMessage = {
  id: string;
  author: string;
  body: string;
  kind: 'human' | 'ai' | 'emote';
  emoji?: string;
  createdAt: number;
};
export type PlazaUser = { sessionKey: string; nickname: string; emoji: string };
export type PlazaDirectMessage = { id: string; senderSessionKey: string; senderName: string; senderEmoji: string; body: string; createdAt: number };

const WORLD = process.env.NEXT_PUBLIC_PLAZA_REALTIME_URL || process.env.NEXT_PUBLIC_WORM_WORLD_URL || 'https://type-drift-worm-world.onrender.com';
const WS = `${WORLD.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}/ws`;
const NPC_COUNT = 2;
const EMOTES = ['👋', '✦', '🌊', '💭', '🩷', '✨', '🍵'];
const GUEST_MARKS = ['◌', '◇', '◒', '✦', '○', '△', '·'];
const displayName = (nickname?: string) => nickname?.trim() || '匿名の誰か';

export type PlazaPanelProps = {
  nickname?: string;
  externalEmote?: { emote: string; label?: string; id: number } | null;
  externalMessage?: { author: string; body: string; kind: 'human' | 'ai'; emoji?: string; id: number } | null;
  onToast?: (message: string) => void;
  onPresenceUpdate?: (count: number) => void;
  onPresenceUsers?: (users: PlazaUser[]) => void;
  onUserMessageSent?: (text: string, author?: string) => void;
  onDirectMessageReceived?: (message: PlazaDirectMessage) => void;
};

const defaultInitialMessages: PlazaMessage[] = [
  {
    id: 'init-darling',
    author: 'ダーリンちゃん',
    body: 'あら、いらっしゃい、ダーリン♡ ここは匿名という薄い仮面を被った子供たちが集まる、退屈なトランプの城よ。……ねぇ、あなたが今からここに流し込む言葉、“本音”と“演出”……一体どっちが多くなっちゃうのかしら？ ふふ、ログの漏れ、楽しみに観測してあげるね♡',
    kind: 'ai',
    emoji: '🥺',
    createdAt: Date.now() - 60000,
  },
  {
    id: 'init-worm',
    author: 'LSI芋虫',
    body: '境界線確認。広場への侵入者ログを捕捉。匿名性の保持は仮初めであり、全発言およびエモートの構造データは当領域のデータベースへ永久に固定される。逃亡は不可。発言を継続せよ。',
    kind: 'ai',
    emoji: '🐛',
    createdAt: Date.now() - 30000,
  },
];

export default function PlazaPanel({
  nickname = '',
  externalEmote = null,
  externalMessage = null,
  onToast,
  onPresenceUpdate,
  onPresenceUsers,
  onUserMessageSent,
  onDirectMessageReceived,
}: PlazaPanelProps) {
  const [messages, setMessages] = useState<PlazaMessage[]>(defaultInitialMessages);
  const [presence, setPresence] = useState(0);
  const [text, setText] = useState('');
  const [emoteIndex, setEmoteIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState('未確認');
  const [localToast, setLocalToast] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const greetedRef = useRef(false);
  const lastHandledEmoteId = useRef<number | null>(null);
  const lastHandledMessageId = useRef<number | null>(null);
  const sessionKeyRef = useRef<string>('');
  const aiUrl = useMemo(() => `${WORLD}/api/plaza/ai`, []);

  // WebSocket 接続
  useEffect(() => {
    let alive = true;
    const api = process.env.NEXT_PUBLIC_API_URL;
    sessionKeyRef.current = typeof crypto !== 'undefined' ? crypto.randomUUID() : `plaza-${Date.now()}`;
    const guestMark = GUEST_MARKS[Math.floor(Math.random() * GUEST_MARKS.length)];
    let heartbeat: number | null = null;
    const presence = (path: string, payload: Record<string, unknown>) => {
      if (!api) return;
      void fetch(`${api}/api/presence/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() }, body: JSON.stringify(payload), keepalive: path === 'leave' }).catch(() => undefined);
    };
    const connect = () => {
      if (!alive) return;
      try {
        const ws = new WebSocket(WS);
        wsRef.current = ws;
        ws.onopen = () => {
          setConnected(true);
          ws.send(JSON.stringify({ type: 'plaza_join', sessionKey: sessionKeyRef.current, nickname: displayName(nickname), emoji: guestMark }));
          presence('join', { session_key: sessionKeyRef.current, nickname: displayName(nickname) });
          heartbeat = window.setInterval(() => presence('heartbeat', { session_key: sessionKeyRef.current }), 20000);
        };
        ws.onmessage = event => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'plaza_presence') {
              const count = Number(data.count) || 0;
              setPresence(count);
              onPresenceUpdate?.(count + NPC_COUNT);
              onPresenceUsers?.(Array.isArray(data.users) ? data.users : []);
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                setMessages(data.messages);
              }
            } else if (data.type === 'plaza_message' && data.message) {
              const msg: PlazaMessage = data.message;
              setMessages(current => {
                const filtered = current.filter(item => item.id !== msg.id);
                return [...filtered, msg].slice(-80);
              });
              if (msg.kind === 'human') {
                onUserMessageSent?.(msg.body, msg.author);
              }
              // エモートの場合、トースト通知も出す
              if (msg.kind === 'emote') {
                const notice = `${msg.author}から ${msg.body} が届きました`;
                setLocalToast(notice);
                onToast?.(notice);
              }
            } else if (data.type === 'plaza_dm' && data.message) {
              onDirectMessageReceived?.(data.message as PlazaDirectMessage);
              window.dispatchEvent(new CustomEvent('type-drift:dm-received', { detail: data.message }));
              setLocalToast(`💌 ${data.message.senderName || '匿名の誰か'}からメッセージが届きました`);
              onToast?.(`💌 ${data.message.senderName || '匿名の誰か'}からメッセージが届きました`);
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
      if (heartbeat) window.clearInterval(heartbeat);
      presence('leave', { session_key: sessionKeyRef.current });
      wsRef.current = null;
    };
  }, [nickname]);

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

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ targetSessionKey?: string; body?: string }>).detail;
      if (!detail?.targetSessionKey || !detail.body) return;
      sendRelay({ type: 'plaza_dm', targetSessionKey: detail.targetSessionKey, body: detail.body, senderName: displayName(nickname), senderEmoji: '◌' });
    };
    window.addEventListener('type-drift:dm-send', receive);
    return () => window.removeEventListener('type-drift:dm-send', receive);
  }, [nickname]);

  // AIへの返答リクエスト
  async function requestAi(humanText: string) {
    if (aiBusy) return;
    setAiBusy(true);
    console.info('[Type Drift AI] request', { endpoint: aiUrl, text: humanText.slice(0, 80) });
    try {
      const response = await fetch(aiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: humanText, history: messages.slice(-12) }),
      });
      if (!response.ok) throw new Error(`ai failed (${response.status})`);
      const data = await response.json();
      setAiStatus(`${data.source === 'groq' ? 'Groq' : 'fallback'} · ${data.model || 'モデル未確認'}`);
      console.info('[Type Drift AI] response', { source: data.source, reason: data.reason, model: data.model, replies: data.replies?.length || 0 });
      if (data.source !== 'groq') {
        const reason = data.reason || 'unknown';
        const notice = `AIは代替応答です（${reason}）。気になる場合は意見箱へ送れます。`;
        setLocalToast(notice);
        onToast?.(notice);
      }
      for (const reply of Array.isArray(data.replies) ? data.replies.slice(0, 1) : []) {
        sendRelay({ type: 'plaza_ai_message', character: reply.character, body: reply.body });
      }
    } catch (error) {
      setAiStatus('fallback · 接続失敗');
      console.error('[Type Drift AI] failed', error);
      // フォールバック応答
      const character = /ダーリンちゃん|ダーリン/.test(humanText) || Math.random() < 0.5 ? 'ダーリンちゃん' : 'LSI芋虫';
      const notice = 'AI接続エラーで代替応答になりました。気になる場合は意見箱へ送れます。';
      setLocalToast(notice);
      onToast?.(notice);
      sendRelay({ type: 'plaza_ai_message', character, body: character === 'ダーリンちゃん' ? 'ねぇ、聞いてるよ♡' : '発言を記録しました。' });
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
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (api) void fetch(`${api}/api/plaza/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Guest-Key': getGuestKey() }, body: JSON.stringify({ nickname: author, body }) }).catch(() => undefined);
    logActivity('plaza_message', { bodyLength: body.length, author });
    setText('');
    onUserMessageSent?.(body, author);
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
    logActivity('plaza_emote', { emote: emoteValue, author });
    if (Math.random() < 0.25) {
      const reactions = [
        { character: 'ダーリンちゃん', body: `${emoteValue}ね。ふふ、ちゃんと届いてるわ♡` },
        { character: 'LSI芋虫', body: `${emoteValue}の入力を確認。反応としては妥当です。` },
      ];
      const reaction = reactions[Math.floor(Math.random() * reactions.length)];
      window.setTimeout(() => sendRelay({ type: 'plaza_ai_message', character: reaction.character, body: reaction.body }), 450);
    }
  };

  // 親コンポーネントからの外部エモート要求
  useEffect(() => {
    if (!externalEmote || externalEmote.id === lastHandledEmoteId.current) return;
    lastHandledEmoteId.current = externalEmote.id;
    sendEmote(externalEmote.emote);
  }, [externalEmote]);

  // 親コンポーネントからの外部メッセージ要求（ブリプレゼント反応など）
  useEffect(() => {
    if (!externalMessage || externalMessage.id === lastHandledMessageId.current) return;
    lastHandledMessageId.current = externalMessage.id;
    const newMsg: PlazaMessage = {
      id: `ext-${Date.now()}-${Math.random()}`,
      author: externalMessage.author,
      body: externalMessage.body,
      kind: externalMessage.kind,
      emoji: externalMessage.emoji,
      createdAt: Date.now(),
    };
    setMessages(curr => [...curr, newMsg]);
    sendRelay({
      type: 'plaza_message',
      nickname: externalMessage.author,
      body: externalMessage.body,
    });
  }, [externalMessage]);

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
                  <p className="plaza-chat-text">{message.body}</p>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* 入力バー */}
      <div className="plaza-chat-compose">
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="広場にひとこと…（改行可能 / 送るボタンで送信）"
          maxLength={300}
          rows={2}
          className="plaza-chat-textarea"
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
