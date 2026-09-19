'use client';

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Anchor, ArrowUpRight, Bot, Heart, MessageCircle, Plus, Send, Sparkles, Waves, X } from "lucide-react";
import WormGame from "./worm-game";
import PlazaPanel from "./plaza-panel";

type Bottle = { id: number; author: string; emoji: string; type: string; mbti: string; socionics: string; enneagram: string; otherType?: string; text: string; imageUrl?: string; poll?: { options: string[]; votes: number[] }; reactions: number; replies: number; userReaction?: number; time: string; ai?: string; mine?: boolean; color: string };
type ReplyItem = { id: number; body: string; parentId?: number; reaction: number };
type ProfileLink = { id: string; title: string; url: string };

const initialBottles: Bottle[] = [
  { id: 1, author: "匿名のINTJ", emoji: "◌", type: "LII · 5w6", mbti: "INTJ", socionics: "LII", enneagram: "5w6", text: "考えることはできるのに、自分が何をしたいのかだけ、いつも解像度が低い。", reactions: 18, replies: 4, time: "2分前", color: "mint" },
  { id: 2, author: "匿名のILI", emoji: "◒", type: "ILI · 5w4", mbti: "INTJ", socionics: "ILI", enneagram: "5w4", text: "「冷たい」と言われるたびに、温度ではなく観測距離の話をしているだけなのに、と思う。", reactions: 31, replies: 7, time: "8分前", color: "lavender" },
  { id: 3, author: "ダーリンちゃん", emoji: "🥺", type: "AI · ILI", mbti: "INTP", socionics: "ILI", enneagram: "5w4", text: "ねぇ、ダーリン♡ 「理解されたい」と「放っておいてほしい」って、どっちも本音なんじゃない？", reactions: 42, replies: 12, time: "たった今", ai: "AIキャラクター", color: "peach" },
  { id: 4, author: "匿名のLSI", emoji: "◇", type: "LSI · 5w6", mbti: "ISTJ", socionics: "LSI", enneagram: "5w6", text: "好きなものを説明しようとすると、感情より先に分類表が出てくる。これは共感の失敗なのだろうか。", reactions: 24, replies: 5, time: "16分前", color: "blue" },
  { id: 5, author: "LSI芋虫", emoji: "🐛", type: "AI · LSI", mbti: "INTJ", socionics: "LSI", enneagram: "5w6", text: "共感を試みた結果、構造上の類似点を三つ発見した。……いや、まずは「わかる」と言うべきだったかもしれない。", reactions: 27, replies: 9, time: "23分前", ai: "AIキャラクター", color: "yellow" },
];
const mbtiOptions = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"];
const socionicsOptions = ["ILI", "LII", "LIE", "ILE", "IEI", "EII", "EIE", "IEE", "LSI", "SLI", "LSE", "SLE", "SEI", "ESI", "ESE", "SEE"];
const constellationQuestions = [
  { text: "知らないことに出会ったとき、まず何をする？", options: ["仕組みを分解する", "未来の流れを想像する", "体験や記憶と照らす", "周囲の反応を観察する"] },
  { text: "考えがまとまる瞬間に近いのは？", options: ["定義が揃ったとき", "点が線につながったとき", "違和感の正体が見えたとき", "誰かに言葉で話したとき"] },
  { text: "迷ったとき、いちばん信頼するものは？", options: ["一貫した原理", "予感と長期的な見通し", "自分の過去の実感", "場にいる人の温度"] },
];

function BottleCard({ bottle, onReact, onOpen }: { bottle: Bottle; onReact: (id: number) => void; onOpen: (bottle: Bottle) => void }) {
  const [poll, setPoll] = useState(bottle.poll);
  const [voted, setVoted] = useState<number | null>(null);
  const vote = (index: number) => { if (!poll || voted !== null) return; setVoted(index); setPoll({ ...poll, votes: poll.votes.map((count, option) => option === index ? count + 1 : count) }); };
  return <article className={`bottle-card ${bottle.color}`}>
    <div className="bottle-card__top"><div className="author"><span className="author__emoji">{bottle.emoji}</span><span><strong>{bottle.author}</strong><small>{bottle.type} · {bottle.mbti}</small></span></div><span className="time">{bottle.time}</span></div>
    {bottle.ai && <span className="ai-chip"><Bot size={12} /> {bottle.ai}</span>}
    <p className="bottle-text">{bottle.text}</p>
    {bottle.imageUrl && <img className="bottle-image" src={bottle.imageUrl} alt="ボトルに添付された画像" />}
    {poll && <div className="poll-box">{poll.options.map((option, index) => <button type="button" key={option} className={voted === index ? "poll-option selected" : "poll-option"} onClick={() => vote(index)}><span>{option}</span>{voted !== null && <small>{poll.votes[index]}票</small>}</button>)}</div>}
    <div className="bottle-card__bottom"><button type="button" onClick={() => onReact(bottle.id)} className={`reaction reaction--${bottle.userReaction || 0}`} aria-label="リアクションを重ねる"><Heart size={16} />{bottle.userReaction ? <small>+{bottle.userReaction}</small> : null}</button><button type="button" onClick={() => onOpen(bottle)} className="reaction" aria-label="返信を読む"><MessageCircle size={16} /></button><button type="button" className="more" aria-label="その他">•••</button></div>
  </article>;
}

function FeedbackBox() {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("アイデア");
  const [status, setStatus] = useState("");
  const submit = async () => {
    if (!body.trim()) return;
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) { setStatus("APIの接続先が未設定です。内容は送信されていません。"); return; }
    let guestKey = localStorage.getItem("type-drift-guest-key");
    if (!guestKey) { guestKey = crypto.randomUUID(); localStorage.setItem("type-drift-guest-key", guestKey); }
    try {
      const response = await fetch(`${api}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json", "X-Guest-Key": guestKey }, body: JSON.stringify({ body: body.trim(), category }) });
      if (!response.ok) throw new Error("feedback failed");
      setBody(""); setStatus("意見を海の記録へ届けました。ありがとう。");
    } catch { setStatus("送信できませんでした。時間を置いてもう一度試してください。"); }
  };
  return <div className="feedback-box"><p className="eyebrow">OPEN OBSERVATION</p><h3>意見箱</h3><p>この場所を少しずつ良くするための声を、匿名で送れます。</p><select value={category} onChange={event => setCategory(event.target.value)}><option>アイデア</option><option>不具合</option><option>使いにくいところ</option><option>その他</option></select><textarea value={body} onChange={event => setBody(event.target.value)} placeholder="気づいたこと、欲しい機能など…" maxLength={2000} /><button type="button" className="primary-button" onClick={submit}>意見を送る</button>{status && <small className="feedback-status">{status}</small>}</div>;
}

function ReplyThread({ replies, onReact, onReply }: { replies: ReplyItem[]; onReact: (id: number) => void; onReply: (id: number) => void }) {
  const render = (parentId?: number, depth = 0): ReactNode => replies.filter(item => item.parentId === parentId).map(item => <div className="reply-item" style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }} key={item.id}><p>{item.body}</p><div><button type="button" onClick={() => onReact(item.id)} className={`reply-reaction reply-reaction--${item.reaction}`}>♡ {item.reaction ? `+${item.reaction}` : "反応"}</button><button type="button" onClick={() => onReply(item.id)} className="reply-to">返信</button></div>{render(item.id, depth + 1)}</div>);
  return replies.length ? <div className="reply-thread"><p className="reply-thread__title">返信の流れ</p>{render()}</div> : null;
}

export default function DriftApp() {
  const [bottles, setBottles] = useState(initialBottles);
  const [selected, setSelected] = useState<Bottle | null>(null);
  const [activePage, setActivePage] = useState<"home" | "sea" | "plaza" | "games" | "stars" | "consult" | "activity" | "about">("home");
  const [activityTab, setActivityTab] = useState<"mine" | "liked" | "replied">("mine");
  const [composerOpen, setComposerOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftImage, setDraftImage] = useState<string | undefined>();
  const [imageUploading, setImageUploading] = useState(false);
  const [picked, setPicked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filter, setFilter] = useState("すべて");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [replyItems, setReplyItems] = useState<Record<number, ReplyItem[]>>({});
  const [replyParentId, setReplyParentId] = useState<number | undefined>();
  const [mbtiFilter, setMbtiFilter] = useState("");
  const [socionicsFilter, setSocionicsFilter] = useState("");
  const [identity, setIdentity] = useState({ mbti: "", socionics: "", enneagram: "", otherType: "" });
  const [likedBottleIds, setLikedBottleIds] = useState<number[]>([]);
  const [repliedBottleIds, setRepliedBottleIds] = useState<number[]>([]);
  const [catchResult, setCatchResult] = useState<"bottle" | "buri" | null>(null);
  const [postMode, setPostMode] = useState<"secret" | "poll">("secret");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [plazaToast, setPlazaToast] = useState("");
  const [avatarEmote, setAvatarEmote] = useState<string | null>(null);
  const [externalEmote, setExternalEmote] = useState<{ emote: string; label: string; id: number } | null>(null);
  const [onlineCount, setOnlineCount] = useState(4);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [constellationStep, setConstellationStep] = useState(0);
  const triggerEmote = (emoteIcon: string, label: string) => {
    setAvatarEmote(emoteIcon);
    setExternalEmote({ emote: emoteIcon, label, id: Date.now() });
    const sender = nickname || "匿名のあなた";
    setPlazaToast(`${sender}から ${emoteIcon} が届きました`);
    window.setTimeout(() => setAvatarEmote(null), 3200);
  };
  const [constellationAnswers, setConstellationAnswers] = useState<number[]>([]);
  const [consultText, setConsultText] = useState("");
  const [consultPosted, setConsultPosted] = useState("");
  const [nickname, setNickname] = useState("");
  const [profileIdentity, setProfileIdentity] = useState({ mbti: "", socionics: "", enneagram: "", otherType: "" });
  const [profileBio, setProfileBio] = useState("");
  const [profileLinks, setProfileLinks] = useState<ProfileLink[]>([]);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const filters = ["すべて", "AIの漂着"];
  useEffect(() => {
    try {
      const saved = localStorage.getItem("type-drift-state");
      if (saved) {
        const state = JSON.parse(saved);
        if (Array.isArray(state.bottles)) setBottles(state.bottles);
        if (Array.isArray(state.likedBottleIds)) setLikedBottleIds(state.likedBottleIds);
        if (Array.isArray(state.repliedBottleIds)) setRepliedBottleIds(state.repliedBottleIds);
        if (typeof state.nickname === "string") setNickname(state.nickname);
        if (state.profileIdentity) setProfileIdentity({ ...profileIdentity, ...state.profileIdentity });
        if (typeof state.profileBio === "string") setProfileBio(state.profileBio);
        if (Array.isArray(state.profileLinks)) setProfileLinks(state.profileLinks);
      }
    } catch { /* 壊れた履歴は現在の初期状態で続行する */ }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("type-drift-state", JSON.stringify({
      bottles,
      likedBottleIds,
      repliedBottleIds,
      nickname,
      profileIdentity,
      profileBio,
      profileLinks
    }));
  }, [storageReady, bottles, likedBottleIds, repliedBottleIds, nickname, profileIdentity, profileBio, profileLinks]);
  const addProfileLink = () => {
    setProfileLinks(links => [...links, { id: String(Date.now()), title: "", url: "" }]);
    setProfileSaved(false);
  };
  const updateProfileLink = (id: string, field: "title" | "url", value: string) => {
    setProfileLinks(links => links.map(link => link.id === id ? { ...link, [field]: value } : link));
    setProfileSaved(false);
  };
  const removeProfileLink = (id: string) => {
    setProfileLinks(links => links.filter(link => link.id !== id));
    setProfileSaved(false);
  };
  const visible = useMemo(() => bottles.filter(b => {
    const matchesFilter = filter === "すべて" ? true : filter === "AIの漂着" ? Boolean(b.ai) : b.socionics === filter;
    const haystack = `${b.text} ${b.author} ${b.mbti} ${b.socionics} ${b.enneagram}`.toLowerCase();
    const matchesMbti = !mbtiFilter || b.mbti.toUpperCase() === mbtiFilter;
    const matchesSocionics = !socionicsFilter || b.socionics.toUpperCase() === socionicsFilter;
    return matchesFilter && matchesMbti && matchesSocionics && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [bottles, filter, query, mbtiFilter, socionicsFilter]);
  const react = (id: number) => { setBottles(items => items.map(b => b.id === id ? { ...b, userReaction: (b.userReaction || 0) + 1 } : b)); setLikedBottleIds(ids => ids.includes(id) ? ids : [...ids, id]); };
  const uploadToCloudinary = async (dataUrl?: string) => { const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME; const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET; if (!dataUrl || !cloudName || !preset) return dataUrl; const form = new FormData(); form.append("file", dataUrl); form.append("upload_preset", preset); const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form }); if (!response.ok) throw new Error("Cloudinary upload failed"); const result = await response.json(); return result.secure_url as string; };
  const publish = async () => { const cleanOptions = pollOptions.map(option => option.trim()).filter(Boolean); if (!draft.trim() || (postMode === "poll" && cleanOptions.length < 2) || imageUploading) return; setImageUploading(true); try { const imageUrl = await uploadToCloudinary(draftImage); const displayType = identity.mbti || identity.socionics || "誰か"; setBottles([{ id: Date.now(), author: `匿名の${displayType.toUpperCase()}`, emoji: "◌", type: `${identity.socionics || "未設定"} · ${identity.enneagram || "?"}`, mbti: identity.mbti || "未設定", socionics: identity.socionics || "未設定", enneagram: identity.enneagram || "未設定", otherType: identity.otherType, text: draft.trim(), imageUrl, poll: postMode === "poll" ? { options: cleanOptions, votes: cleanOptions.map(() => 0) } : undefined, reactions: 0, replies: 0, time: "たった今", mine: true, color: "mint" }, ...bottles]); setDraft(""); setDraftImage(undefined); setPollOptions(["", ""]); setPostMode("secret"); setIdentity({ mbti: "", socionics: "", enneagram: "", otherType: "" }); setComposerOpen(false); } catch { setPlazaToast("画像のアップロードに失敗しました。設定を確認してください"); } finally { setImageUploading(false); } };
  const readDraftImage = (file: File | undefined) => { if (!file) return; if (!file.type.startsWith("image/")) return; if (file.size > 5 * 1024 * 1024) { setPlazaToast("画像は5MB以内にしてください"); return; } const reader = new FileReader(); reader.onload = () => setDraftImage(String(reader.result)); reader.readAsDataURL(file); };
  const guestKey = () => { let key = localStorage.getItem("type-drift-guest-key"); if (!key) { key = crypto.randomUUID(); localStorage.setItem("type-drift-guest-key", key); } return key; };
  const sendReply = async () => { if (!reply.trim() || !selected) return; const body = reply.trim(); const parentId = replyParentId; const item = { id: Date.now(), body, parentId, reaction: 0 }; setReplyItems(items => ({ ...items, [selected.id]: [...(items[selected.id] || []), item] })); setRepliedBottleIds(ids => ids.includes(selected.id) ? ids : [...ids, selected.id]); setReply(""); setReplyParentId(undefined); const api = process.env.NEXT_PUBLIC_API_URL; if (api) await fetch(`${api}/api/bottles/${selected.id}/replies`, { method: "POST", headers: { "Content-Type": "application/json", "X-Guest-Key": guestKey() }, body: JSON.stringify({ body, parent_reply_id: parentId }) }).catch(() => undefined); };
  const reactToReply = async (bottleId: number, replyId: number) => { setReplyItems(items => ({ ...items, [bottleId]: (items[bottleId] || []).map(item => item.id === replyId ? { ...item, reaction: item.reaction + 1 } : item) })); const api = process.env.NEXT_PUBLIC_API_URL; if (api) await fetch(`${api}/api/replies/${replyId}/reactions`, { method: "POST", headers: { "X-Guest-Key": guestKey() } }).catch(() => undefined); };
  const catchSomething = () => { if (Math.random() < 0.22) setCatchResult("buri"); else { setCatchResult("bottle"); setSelected(visible[Math.floor(Math.random() * visible.length)] || bottles[0]); } };
  useEffect(() => {
    if (!plazaToast) return;
    const timer = window.setTimeout(() => setPlazaToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [plazaToast]);

  return <main className="site-shell">
    <nav className="topbar"><button className="brand" type="button" onClick={() => setActivePage("home")}><span className="brand__mark"><Waves size={19} /></span><span>type <i>drift</i></span></button><div className="topbar__links"><button type="button" onClick={() => { setActivePage("sea"); setIsPlaying(true); }}>海を覗く</button><button type="button" onClick={() => setActivePage("plaza")}>広場</button><button type="button" onClick={() => setActivePage("activity")}>自分の活動</button><button className="ghost-button" type="button" onClick={() => setLoginOpen(true)}>ログイン <ArrowUpRight size={15} /></button></div></nav>
    {activePage === "home" && <section className="hero" id="top"><div className="hero__copy"><p className="eyebrow"><Sparkles size={14} /> TYPE IN A BOTTLE</p><h1>類型の秘密を、<br /><em>海へ流そう。</em></h1><p className="hero__lead">ここは、診断のあとに立ち寄れる海。<br />類型のこと。自分のこと。言葉にしづらい小さな違和感。<br />名前を置いていかなくても、思考だけは流していけます。</p><div className="hero__actions"><button className="play-button play-button--large" type="button" onClick={() => { setIsPlaying(true); setActivePage("sea"); }}><span>▶</span> 海を覗く</button></div></div><div className="title-waterline" aria-hidden="true"><span className="title-moon"></span><span className="title-wave"></span><span className="title-bottle">🫙</span></div></section>}
    {activePage === "sea" && <section className="sea-section sea-page" id="sea"><div className="section-heading"><div><p className="eyebrow">漂う秘密たち</p><h2>いま、海にあるもの</h2></div><div className="sea-actions"><button className="primary-button" type="button" onClick={() => setComposerOpen(true)}><Plus size={16} /> 秘密を流す</button><button className={`pick-button ${picked ? "is-picked" : ""}`} onClick={catchSomething}>{picked ? "拾いました" : <><Anchor size={16} /> ボトルを拾う</>}</button></div></div>{catchResult && <div className={`catch-toast ${catchResult === "buri" ? "buri-catch" : ""}`}>{catchResult === "buri" ? <><span className="buri-catch__fish">🐟</span><span>ブリが泳いできました。用途はまだありません。</span></> : "🫙 ボトルを拾い上げました。"}<button type="button" onClick={() => setCatchResult(null)}>×</button></div>}<div className="search-box"><MessageCircle size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="秘密、類型、キーワードを検索…" /></div><div className="filter-selects"><select value={mbtiFilter} onChange={e => setMbtiFilter(e.target.value)}><option value="">MBTI すべて</option>{mbtiOptions.map(option => <option key={option}>{option}</option>)}</select><select value={socionicsFilter} onChange={e => setSocionicsFilter(e.target.value)}><option value="">ソシオニクス すべて</option>{socionicsOptions.map(option => <option key={option}>{option}</option>)}</select></div><div className="filter-row">{filters.map(item => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><div className={`bottle-stream ${isPlaying ? "is-playing" : ""}`} aria-label="流れてくるボトル">{visible.slice(0, 5).map((bottle, index) => <button type="button" key={`stream-${bottle.id}`} className={`stream-bottle stream-bottle--${index + 1}`} onClick={() => { setPicked(true); setSelected(bottle); }} aria-label={`${bottle.author}のボトルを拾う`}>🫙<span>{bottle.emoji}</span></button>)}<span className="swimming-buri">🐟</span></div><p className="stream-hint"><Waves size={14} /> 流れてくるボトルをタップして拾う</p><div className="bottle-grid">{visible.map(bottle => <BottleCard key={bottle.id} bottle={bottle} onReact={react} onOpen={setSelected} />)}</div></section>}
    {activePage === "plaza" && (
      <section className="plaza-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TYPE PLAZA</p>
            <h2>類型広場</h2>
          </div>
          <span className="online-pill">● {onlineCount}人がいる</span>
        </div>
        <p className="plaza-lead">
          ここでは、ニックネームのまま過ごせます。<br />
          人とAIが同じ広場にいます。話しても、歩いても、何もしなくても。
        </p>

        <div className="plaza-map">
          <div className="plaza-tree">🌳</div>
          <div className="plaza-bench">🪑</div>
          <div className="plaza-avatar avatar-you" title={nickname || "匿名のあなた"}>
            ◌<small>{nickname || "匿名のあなた"}</small>
            {avatarEmote && <b className="floating-emote">{avatarEmote}</b>}
          </div>
          <div className="plaza-avatar avatar-darling" title="ダーリンちゃん">
            🥺<small>ダーリンちゃん</small>
          </div>
          <div className="plaza-avatar avatar-worm" title="LSI芋虫">
            🐛<small>LSI芋虫</small>
          </div>
          <div className="plaza-avatar avatar-guest" title="匿名の誰か">
            ◇<small>匿名の誰か</small>
          </div>
        </div>

        <div className="plaza-greeting-bar">
          <span className="greeting-label">👋 広場であいさつ:</span>
          <div className="greeting-buttons">
            {[
              { icon: "👋", label: "👋 こんにちは" },
              { icon: "✦", label: "✦ 観測中" },
              { icon: "🌊", label: "🌊 まったり" },
              { icon: "♡", label: "♡ 応援" },
              { icon: "✨", label: "✨ ひらめき" },
              { icon: "🍵", label: "🍵 お茶" },
            ].map(item => (
              <button
                key={item.label}
                type="button"
                className="greeting-btn"
                onClick={() => triggerEmote(item.icon, item.label)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {plazaToast && (
          <div className="plaza-toast">
            <span>{plazaToast}</span>
            <button type="button" onClick={() => setPlazaToast("")}>×</button>
          </div>
        )}

        <PlazaPanel
          nickname={nickname}
          externalEmote={externalEmote}
          onToast={setPlazaToast}
          onPresenceUpdate={setOnlineCount}
        />

        <div className="plaza-facilities">
          <div className="plaza-facilities-heading">
            <p className="eyebrow">FACILITIES & ACTIVITIES</p>
            <h3>広場のコーナー</h3>
          </div>

          <div className="plaza-facilities-grid">
            <div className="game-card facility-card">
              <div className="game-icon">🐛🥬</div>
              <div className="facility-content">
                <p className="eyebrow">PLAYGROUND</p>
                <h3>芋虫浜</h3>
                <p>🥬を食べて、他の芋虫を追い越して。<br />オンラインで他のプレイヤーやNPCと遊べる、静かなSnake系ゲーム。</p>
              </div>
              <button type="button" className="facility-btn" onClick={() => setActivePage("games")}>
                遊ぶ →
              </button>
            </div>

            <div className="game-card facility-card">
              <div className="game-icon">✦🌌</div>
              <div className="facility-content">
                <p className="eyebrow">COGNITIVE CONSTELLATION</p>
                <h3>認知機能の星座</h3>
                <p>3つの問いから考え方の癖を眺める小さな観測記録。<br />診断ではなく、思考の星のつながりを遊びながら描きます。</p>
              </div>
              <button type="button" className="facility-btn" onClick={() => setActivePage("stars")}>
                観測する →
              </button>
            </div>

            <div className="game-card facility-card">
              <div className="game-icon">☁💭</div>
              <div className="facility-content">
                <p className="eyebrow">TYPE CONSULTATION</p>
                <h3>自認相談室</h3>
                <p>自分のタイプについての迷いを匿名で相談できます。<br />AIではなく、人間同士で仮説を静かに交換する場所。</p>
              </div>
              <button type="button" className="facility-btn" onClick={() => setActivePage("consult")}>
                相談室へ →
              </button>
            </div>

            <div className="game-card facility-card facility-card--feedback">
              <div className="game-icon">📮✉️</div>
              <div className="facility-content">
                <p className="eyebrow">OPEN OBSERVATION</p>
                <h3>意見箱</h3>
                <p>この場所を少しずつ良くするための声を、匿名で送れます。<br />気づいたことや欲しい機能、違和感などをお気軽に。</p>
                {feedbackOpen && (
                  <div className="inline-feedback-container">
                    <FeedbackBox />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="facility-btn facility-btn--toggle"
                onClick={() => setFeedbackOpen(!feedbackOpen)}
              >
                {feedbackOpen ? "閉じる ↑" : "意見を書く ↓"}
              </button>
            </div>
          </div>
        </div>
      </section>
    )}
    {activePage === "games" && <WormGame nickname={nickname || (profileIdentity.mbti || profileIdentity.socionics ? `匿名の${profileIdentity.mbti || profileIdentity.socionics}` : "匿名")} onExit={() => setActivePage("plaza")} />}
    {activePage === "stars" && <section className="activity-section stars-page">
      <div className="subpage-nav"><button type="button" className="back-to-plaza" onClick={() => setActivePage("plaza")}>← 広場へ戻る</button></div>
      <p className="eyebrow">COGNITIVE CONSTELLATION</p><h2>認知機能の星座</h2><p className="plaza-lead">これは診断ではなく、考え方の癖を遊びながら眺める小さな観測記録です。答えによって星のつながりが変わります。</p><div className={`star-field constellation-${constellationStep % 3}`}>✦　　·　✧<br />　✧　　✦　　·<br />·　　✦　　✧</div>{constellationStep < constellationQuestions.length && <div className="constellation-question"><small>問い {constellationStep + 1} / {constellationQuestions.length}</small><h3>{constellationQuestions[constellationStep].text}</h3><div className="constellation-options">{constellationQuestions[constellationStep].options.map((option, index) => <button type="button" key={option} onClick={() => { setConstellationAnswers([...constellationAnswers, index]); setConstellationStep(step => step + 1); }}>{option}</button>)}</div></div>}{constellationStep >= constellationQuestions.length && <div className="constellation-result"><p className="eyebrow">YOUR SMALL CONSTELLATION</p><h3>{constellationAnswers.filter(answer => answer === 0).length >= 2 ? "構造を編む星座" : constellationAnswers.filter(answer => answer === 1).length >= 2 ? "遠くを読む星座" : "境界を観測する星座"}</h3><p>ここで見つけた言葉は、ボトルに流す秘密や自認相談室で考えを整理するときの入口にできます。</p><button type="button" className="play-button" onClick={() => { setConstellationStep(0); setConstellationAnswers([]); }}>もう一度観測する</button></div>}</section>}
    {activePage === "consult" && <section className="activity-section consult-page">
      <div className="subpage-nav"><button type="button" className="back-to-plaza" onClick={() => setActivePage("plaza")}>← 広場へ戻る</button></div>
      <p className="eyebrow">TYPE CONSULTATION</p><h2>自認相談室</h2><p className="plaza-lead">自分のタイプについて迷っていることを、匿名で相談できます。<br />ここではAIは答えず、人間同士で仮説を交換します。</p><textarea className="consult-input" value={consultText} onChange={event => setConsultText(event.target.value)} placeholder="相談したいことを書く…" maxLength={1000} /><button className="primary-button" type="button" onClick={() => { if (consultText.trim()) { setConsultPosted(consultText.trim()); setConsultText(""); } }}>相談を投稿する</button>{consultPosted && <article className="consult-reply"><small>匿名の観測者から仮説</small><p>「{consultPosted}」について、まずは自分が使っている判断基準を分解して眺めてみるのはどうでしょう。ここに人間の返信が積み重なります。</p></article>}</section>}
    {activePage === "activity" && (
      <section className="activity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR TRACE</p>
            <h2>あなたの活動</h2>
          </div>
          <button className="primary-button" onClick={() => setComposerOpen(true)}>
            <Plus size={18} /> 秘密を流す
          </button>
        </div>

        {/* 広場での呼ばれ方・自認設定（アコーディオン） */}
        <div className="profile-accordion-card">
          <button
            type="button"
            className="profile-accordion-toggle"
            onClick={() => setProfileExpanded(!profileExpanded)}
            aria-expanded={profileExpanded}
          >
            <div className="profile-accordion-summary">
              <div className="profile-accordion-titles">
                <span className="eyebrow">YOUR IDENTITY</span>
                <h3>広場での呼ばれ方・自認設定</h3>
              </div>
              <p className="profile-preview-text">
                {nickname ? `「${nickname}」` : "匿名のあなた"}
                {profileIdentity.mbti ? ` · ${profileIdentity.mbti}` : ""}
                {profileIdentity.socionics ? ` · ${profileIdentity.socionics}` : ""}
                {profileIdentity.enneagram ? ` · ${profileIdentity.enneagram}` : ""}
                {profileLinks.length > 0 ? ` · リンク${profileLinks.length}件` : ""}
              </p>
            </div>
            <span className="profile-accordion-arrow">
              {profileExpanded ? "▲ たたむ" : "▼ 編集する"}
            </span>
          </button>

          {profileExpanded && (
            <div className="profile-accordion-body">
              <p className="profile-hint">
                ここで設定した名前や自認は広場やAIキャラクターとの会話で使われます。海に流すボトルは匿名性を保ったままです。
              </p>

              <div className="profile-field-group">
                <label className="profile-label">ニックネーム</label>
                <input
                  className="profile-input"
                  value={nickname}
                  onChange={event => {
                    setNickname(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="ニックネーム（未設定なら匿名）"
                  maxLength={24}
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-label">類型（任意）</label>
                <div className="profile-selects">
                  <select
                    value={profileIdentity.mbti}
                    onChange={event => {
                      setProfileIdentity({ ...profileIdentity, mbti: event.target.value });
                      setProfileSaved(false);
                    }}
                  >
                    <option value="">MBTI（任意）</option>
                    {mbtiOptions.map(option => <option key={option}>{option}</option>)}
                  </select>
                  <select
                    value={profileIdentity.socionics}
                    onChange={event => {
                      setProfileIdentity({ ...profileIdentity, socionics: event.target.value });
                      setProfileSaved(false);
                    }}
                  >
                    <option value="">ソシオニクス（任意）</option>
                    {socionicsOptions.map(option => <option key={option}>{option}</option>)}
                  </select>
                  <input
                    value={profileIdentity.enneagram}
                    onChange={event => {
                      setProfileIdentity({ ...profileIdentity, enneagram: event.target.value });
                      setProfileSaved(false);
                    }}
                    placeholder="エニアグラム（例: 5w6）"
                  />
                </div>
              </div>

              <div className="profile-field-group">
                <label className="profile-label">その他の自認（改行可能）</label>
                <textarea
                  className="profile-textarea"
                  rows={2}
                  value={profileIdentity.otherType || ""}
                  onChange={event => {
                    setProfileIdentity({ ...profileIdentity, otherType: event.target.value });
                    setProfileSaved(false);
                  }}
                  placeholder="例: Big5、トライタイプ、占星術、自分なりの考察など…"
                  maxLength={300}
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-label">伝えたいこと（改行可能）</label>
                <textarea
                  className="profile-textarea"
                  rows={3}
                  value={profileBio}
                  onChange={event => {
                    setProfileBio(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="広場の人やAIに知っておいてほしいこと、自己紹介、最近考えていること…"
                  maxLength={500}
                />
              </div>

              <div className="profile-field-group">
                <div className="profile-links-head">
                  <label className="profile-label">タイピング・外部URL（自由に追加可能）</label>
                  <button type="button" className="profile-add-link-btn" onClick={addProfileLink}>
                    ＋ リンクを追加
                  </button>
                </div>
                {profileLinks.length === 0 ? (
                  <p className="profile-empty-links">
                    まだリンクはありません。「＋ リンクを追加」からタイピング診断結果や個人サイトなどのURLを登録できます。
                  </p>
                ) : (
                  <div className="profile-links-list">
                    {profileLinks.map(link => (
                      <div key={link.id} className="profile-link-row">
                        <input
                          className="profile-link-title"
                          value={link.title}
                          onChange={e => updateProfileLink(link.id, "title", e.target.value)}
                          placeholder="ラベル（例: タイピング結果、note）"
                        />
                        <input
                          className="profile-link-url"
                          value={link.url}
                          onChange={e => updateProfileLink(link.id, "url", e.target.value)}
                          placeholder="https://..."
                        />
                        {link.url && link.url.startsWith("http") && (
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="profile-link-open"
                            title="リンクを開く"
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        )}
                        <button
                          type="button"
                          className="profile-link-remove"
                          onClick={() => removeProfileLink(link.id)}
                          title="削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="profile-footer-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setProfileSaved(true);
                    setPlazaToast("設定を保存しました。ボトルは匿名です。");
                  }}
                >
                  設定を保存
                </button>
                {profileSaved && <span className="profile-saved-tag">✓ 保存しました（ボトルはこれまで通り匿名です）</span>}
              </div>
            </div>
          )}
        </div>

        {/* 活動タブ */}
        <div className="activity-tabs">
          <button className={activityTab === "mine" ? "active" : ""} onClick={() => setActivityTab("mine")}>流したボトル</button>
          <button className={activityTab === "liked" ? "active" : ""} onClick={() => setActivityTab("liked")}>いいねしたボトル</button>
          <button className={activityTab === "replied" ? "active" : ""} onClick={() => setActivityTab("replied")}>返信したボトル</button>
        </div>
        <div className="bottle-grid">
          {bottles.filter(b => activityTab === "mine" ? b.mine : activityTab === "liked" ? likedBottleIds.includes(b.id) : repliedBottleIds.includes(b.id)).map(bottle => (
            <BottleCard key={bottle.id} bottle={bottle} onReact={react} onOpen={setSelected} />
          ))}
          <div className="empty-mine">
            <Anchor size={19} />
            <p>ここにあなたの反応の記録が残ります。</p>
          </div>
        </div>
      </section>
    )}
    {activePage === "about" && <section className="about-section about-page"><div className="about-card"><div className="about-icon"><Waves size={22} /></div><div><p className="eyebrow">ABOUT TYPE DRIFT</p><h2>ここは、診断のあとに<br />立ち寄れる海。</h2><p>類型のこと。自分のこと。言葉にしづらい小さな違和感。<br />名前を置いていかなくても、思考だけは流していけます。</p></div><div className="about-stars">✦<br />·　✧</div></div></section>}
    <footer><span>type <i>drift</i></span><span>an anonymous typology community · 2026</span></footer>
    {loginOpen && <div className="modal-backdrop" onClick={() => setLoginOpen(false)}><div className="login-modal" onClick={event => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setLoginOpen(false)}><X size={18} /></button><p className="eyebrow">WELCOME BACK</p><h2>海へ戻る</h2><p>ログイン方法を選んでください。認証後も、ボトルは匿名のままです。</p><button type="button" className="login-provider" onClick={() => { const api = process.env.NEXT_PUBLIC_API_URL; if (api) window.location.href = `${api}/api/auth/x/redirect`; else setPlazaToast("NEXT_PUBLIC_API_URLを設定するとXログインが始まります"); }}>𝕏　Xでログイン</button><button type="button" className="login-provider" onClick={() => { const api = process.env.NEXT_PUBLIC_API_URL; if (api) window.location.href = `${api}/api/auth/google/redirect`; else setPlazaToast("NEXT_PUBLIC_API_URLを設定するとGoogleログインが始まります"); }}>G　Googleでログイン</button></div></div>}
    {composerOpen && <div className="modal-backdrop" onClick={() => setComposerOpen(false)}><div className="composer" onClick={e => e.stopPropagation()}><button className="modal-close" type="button" onClick={() => setComposerOpen(false)}><X size={18} /></button><p className="eyebrow">FLOAT A SECRET</p><h2>何を海へ流す？</h2><div className="post-mode"><button type="button" className={postMode === "secret" ? "active" : ""} onClick={() => setPostMode("secret")}>秘密メモ</button><button type="button" className={postMode === "poll" ? "active" : ""} onClick={() => setPostMode("poll")}>アンケート</button></div><div className="identity-fields"><label>MBTI<select value={identity.mbti} onChange={e => setIdentity({ ...identity, mbti: e.target.value })}><option value="">未設定</option>{mbtiOptions.map(option => <option key={option}>{option}</option>)}</select></label><label>ソシオ<select value={identity.socionics} onChange={e => setIdentity({ ...identity, socionics: e.target.value })}><option value="">未設定</option>{socionicsOptions.map(option => <option key={option}>{option}</option>)}</select></label><label>エニア<input value={identity.enneagram} onChange={e => setIdentity({ ...identity, enneagram: e.target.value })} placeholder="5w4" /></label></div><input className="other-type-input" value={identity.otherType} onChange={e => setIdentity({ ...identity, otherType: e.target.value })} placeholder="その他の自認（自由入力）" /><textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={postMode === "poll" ? "アンケートの質問を書く…" : "類型のこと、最近考えていること…"} maxLength={500} autoFocus />{postMode === "poll" && <div className="poll-draft">{pollOptions.map((option, index) => <input key={index} value={option} onChange={e => setPollOptions(pollOptions.map((value, item) => item === index ? e.target.value : value))} placeholder={`選択肢 ${index + 1}`} />)}<button type="button" onClick={() => setPollOptions([...pollOptions, ""])}>＋選択肢を追加</button></div>}<label className="image-upload">画像を添付（任意・5MBまで）<input type="file" accept="image/*" onChange={e => readDraftImage(e.target.files?.[0])} /></label>{draftImage && <div className="image-preview"><img src={draftImage} alt="添付画像のプレビュー" /><button type="button" onClick={() => setDraftImage(undefined)}>画像を外す</button></div>}<div className="composer__foot"><span>{draft.length} / 500</span><button className="primary-button" type="button" onClick={publish}><Send size={16} /> 流す</button></div></div></div>}
    {selected && <div className="modal-backdrop" onClick={() => { setSelected(null); setPicked(false); }}><div className="detail-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => { setSelected(null); setPicked(false); }}><X size={18} /></button><span className="detail-label">あなたが拾った秘密</span><BottleCard bottle={selected} onReact={react} onOpen={() => {}} /><ReplyThread replies={replyItems[selected.id] || []} onReact={replyId => reactToReply(selected.id, replyId)} onReply={replyId => setReplyParentId(replyId)} /><div className="reply-box"><textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={replyParentId ? "この返信に返す…" : "そっと返信する…"} maxLength={1000} /><button aria-label="返信を送る" onClick={sendReply}><Send size={16} /></button></div><small className="reply-count">{reply.length} / 1000</small></div></div>}
  </main>;
}
