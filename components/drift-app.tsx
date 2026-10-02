'use client';

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Anchor, ArrowUpRight, Bell, Bot, CheckCheck, ChevronLeft, Compass, ExternalLink, Heart, HelpCircle, Home, LogIn, Menu, MessageCircle, MessageSquare, Plus, RotateCcw, Send, Sparkles, Waves, X } from "lucide-react";
import WormGame from "./worm-game";
import PlazaPanel, { type PlazaUser } from "./plaza-panel";
import CognitiveConstellation from "./cognitive-constellation";
import ConsultationRoom from "./consultation-room";
import { INITIAL_CONSULTATION_POSTS, type ConsultationPost, type ConsultationComment, type DiagnosisResult } from "@/types/consultation";
import { getGuestKey, logActivity } from "@/lib/activity-log";
import {
  IconV2BottleSea,
  IconV2LikeChat,
  IconV2ReplyArrow,
  IconV2LetterHeart,
  IconV2InquiryBubble,
  IconV2IdentityPlanet,
} from "./v2-activity-icons";

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxIpODHuVqaJBArR-YWSbFzznc7Ils6xmI8Lyu50yxJ9LNLj9z3fhBcXyLC2HoXBQ3s/exec";

type Bottle = { id: number; author: string; emoji: string; type: string; mbti: string; socionics: string; enneagram: string; otherType?: string; text: string; imageUrl?: string; poll?: { options: string[]; votes: number[] }; reactions: number; replies: number; userReaction?: number; time: string; ai?: string; mine?: boolean; color: string };
type ReplyItem = { id: number; body: string; parentId?: number; reaction: number };

const BOTTLE_PROMPTS = [
  "最近、自分のタイプらしさを感じた瞬間は？",
  "理解されたいけれど、説明するのが面倒だと思うことは？",
  "自分と似ている人に、ひとつだけ聞いてみたいことは？",
  "性格診断の結果と、自分の実感がずれているところは？",
  "他人には伝わりにくいけれど、自分の中では大切な習慣は？",
  "最近の自分を一言で表すなら、どんな言葉になる？",
  "この海にいる誰かへ、匿名で問いかけたいことは？",
];
type ProfileLink = { id: string; title: string; url: string };

type DirectMessage = {
  id: string;
  threadId: string;
  sender: string;
  recipient: string;
  targetEmoji: string;
  targetType?: string;
  body: string;
  createdAt: number;
  read: boolean;
  isMine: boolean;
  bottleId?: number;
  bottleSnippet?: string;
  bottleAuthor?: string;
  bottleType?: string;
};

type Announcement = {
  id: string;
  date: string;
  title: string;
  body: string;
  badge?: string;
  important?: boolean;
};

type FeedbackReply = {
  id: string;
  sender: string;
  date: string;
  body: string;
  isUserReply?: boolean;
};

type FeedbackItem = {
  id: string;
  date: string;
  author: string;
  userType: string;
  category: string;
  body: string;
  read?: boolean;
  needsReply?: boolean;
  userKey?: string;
  replies?: FeedbackReply[];
};

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

function FeedbackBox({ onFeedbackSubmit, userNickname, userType }: { onFeedbackSubmit?: (feedback: FeedbackItem) => void; userNickname?: string; userType?: string }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("アイデア");
  const [needsReply, setNeedsReply] = useState(false);
  const [status, setStatus] = useState("");
  const submit = async () => {
    if (!body.trim()) return;
    const now = new Date().toLocaleString("ja-JP");

    // ユーザー識別キー（返信を受信・照合するため）
    let userKey = localStorage.getItem("type-drift-user-inquiry-key");
    if (!userKey) {
      userKey = `uk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("type-drift-user-inquiry-key", userKey);
    }

    const feedbackItem: FeedbackItem = {
      id: `fb-${Date.now()}`,
      date: now,
      author: userNickname || "匿名",
      userType: userType || "未設定",
      category,
      body: body.trim(),
      read: false,
      needsReply,
      userKey,
      replies: [],
    };

    // 1. ユーザー自身の問い合わせ一覧（ローカル）に保存
    try {
      const myInquiriesRaw = localStorage.getItem("type-drift-my-inquiries");
      const myInquiries: FeedbackItem[] = myInquiriesRaw ? JSON.parse(myInquiriesRaw) : [];
      myInquiries.unshift(feedbackItem);
      localStorage.setItem("type-drift-my-inquiries", JSON.stringify(myInquiries));
    } catch {}

    // 2. ローカルの運営インボックスへ保存
    try {
      const saved = localStorage.getItem("type-drift-admin-feedbacks");
      const list: FeedbackItem[] = saved ? JSON.parse(saved) : [];
      list.unshift(feedbackItem);
      localStorage.setItem("type-drift-admin-feedbacks", JSON.stringify(list));
      if (onFeedbackSubmit) onFeedbackSubmit(feedbackItem);
    } catch {
      // localStorage fallback
    }

    // 3. Google Apps Script (スプレッドシート) Webhook が設定されている場合は非同期送信
    const gasUrl = localStorage.getItem("type-drift-gas-url") || process.env.NEXT_PUBLIC_GAS_WEBHOOK_URL;
    if (gasUrl) {
      try {
        fetch(gasUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "feedback",
            id: feedbackItem.id,
            feedbackId: feedbackItem.id,
            userKey,
            nickname: userNickname || "匿名",
            type: userType || "未設定",
            userType: userType || "未設定",
            body: body.trim(),
            message: body.trim(),
            kind: category,
            category: category,
            wantReply: needsReply,
            needsReply: needsReply,
          }),
        }).catch(() => {});
      } catch {
        // ignore network error
      }
    }

    // 4. バックエンドAPIが設定されている場合も送信
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (api) {
      let guestKey = localStorage.getItem("type-drift-guest-key");
      if (!guestKey) { guestKey = crypto.randomUUID(); localStorage.setItem("type-drift-guest-key", guestKey); }
      try {
        await fetch(`${api}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Guest-Key": guestKey },
          body: JSON.stringify({ body: body.trim(), category, needsReply }),
        });
      } catch {
        // fallback
      }
    }

    setBody("");
    setStatus(needsReply ? "ご意見をお届けしました！返信をお待ちください（「あなたの活動」タブから確認できます）。" : "ご意見を大切にお届けしました。ありがとうございます！");
  };

  return (
    <div className="feedback-box">
      <p className="eyebrow">OPEN OBSERVATION</p>
      <h3>意見箱</h3>
      <p>この場所を少しずつ良くするための声を、匿名で送れます。<br />送られたメッセージは運営へ直接届けられます。</p>
      <select value={category} onChange={event => setCategory(event.target.value)}>
        <option>アイデア</option>
        <option>不具合</option>
        <option>使いにくいところ</option>
        <option>その他</option>
      </select>
      <textarea
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder="気づいたこと、欲しい機能など…"
        maxLength={2000}
      />
      <div>
        <label className="feedback-reply-check-label">
          <input
            type="checkbox"
            checked={needsReply}
            onChange={e => setNeedsReply(e.target.checked)}
          />
          <span>運営からの返信を希望する（「あなたの活動」で回答を受け取れます）</span>
        </label>
      </div>
      <button type="button" className="primary-button" onClick={submit}>
        意見を送る
      </button>
      {status && <small className="feedback-status" style={{ color: "#0f766e", display: "block", marginTop: "8px" }}>{status}</small>}
    </div>
  );
}

function ReplyThread({ replies, onReact, onReply }: { replies: ReplyItem[]; onReact: (id: number) => void; onReply: (id: number) => void }) {
  const render = (parentId?: number, depth = 0): ReactNode => replies.filter(item => item.parentId === parentId).map(item => <div className="reply-item" style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }} key={item.id}><p>{item.body}</p><div><button type="button" onClick={() => onReact(item.id)} className={`reply-reaction reply-reaction--${item.reaction}`}>♡ {item.reaction ? `+${item.reaction}` : "反応"}</button><button type="button" onClick={() => onReply(item.id)} className="reply-to">返信</button></div>{render(item.id, depth + 1)}</div>);
  return replies.length ? <div className="reply-thread"><p className="reply-thread__title">返信の流れ</p>{render()}</div> : null;
}

export default function DriftApp() {
  const [bottles, setBottles] = useState(initialBottles);
  const [selected, setSelected] = useState<Bottle | null>(null);
  const [activePage, setActivePage] = useState<"home" | "sea" | "plaza" | "games" | "stars" | "consult" | "activity" | "about">("home");
  const [activityTab, setActivityTab] = useState<"mine" | "liked" | "replied" | "messages" | "inquiries" | "admin">("mine");
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
  const [repliedBottleIds, setRepliedBottleIds] = useState<number[]>([1]);
  const [myRepliesMap, setMyRepliesMap] = useState<Record<number, string[]>>({
    1: ["考えることはできるのに、自分が何をしたいのかだけ解像度が低い……その感覚、すごくよく分かります。"]
  });
  const [catchResult, setCatchResult] = useState<"bottle" | "buri" | null>(null);
  const [postMode, setPostMode] = useState<"secret" | "poll" | "question">("secret");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [plazaToast, setPlazaToast] = useState("");
  const [avatarEmote, setAvatarEmote] = useState<string | null>(null);
  const [externalEmote, setExternalEmote] = useState<{ emote: string; label: string; id: number } | null>(null);
  const [activePlazaSplashes, setActivePlazaSplashes] = useState<Array<{ id: number; icon: string; top: number; left: number; delay: number }>>([]);
  const [externalPlazaMessage, setExternalPlazaMessage] = useState<{ author: string; body: string; kind: "human" | "ai"; emoji?: string; id: number } | null>(null);
  const [buriCount, setBuriCount] = useState<number>(0);
  const [buriCaughtModalOpen, setBuriCaughtModalOpen] = useState(false);
  const [swimmingBuriVisible, setSwimmingBuriVisible] = useState(true);
  const [consultationPosts, setConsultationPosts] = useState<ConsultationPost[]>(INITIAL_CONSULTATION_POSTS);
  const [buriGiftDialog, setBuriGiftDialog] = useState<{ targetName: string; message: string; emoji: string } | null>(null);
  const [buriTargetSelectorOpen, setBuriTargetSelectorOpen] = useState(false);
  const [inspectProfile, setInspectProfile] = useState<{ id: string; name: string; emoji: string; mbti?: string; socionics?: string; enneagram?: string; psycho?: string; overview: string; isSelf?: boolean } | null>(null);
  const [useSavedIdentity, setUseSavedIdentity] = useState(false);
  const [onlineCount, setOnlineCount] = useState(4);
  const [plazaUsers, setPlazaUsers] = useState<PlazaUser[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [constellationStep, setConstellationStep] = useState(0);
  const [serverNotificationCount, setServerNotificationCount] = useState(0);

  // ダーリンちゃんのミニゲーム・心理テスト用State
  const [darlingTargetNumber, setDarlingTargetNumber] = useState<number | null>(null);
  const [darlingGuessCount, setDarlingGuessCount] = useState<number>(0);
  const [darlingPenaltyActive, setDarlingPenaltyActive] = useState<boolean>(false);
  const [activeDarlingPsychTest, setActiveDarlingPsychTest] = useState<{ id: number; title: string; question: string; answerA: string; answerB: string } | null>(null);

  // 💌 ダイレクトメッセージ (DM) 関連State
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([
    {
      id: "dm-darling-welcome",
      threadId: "darling",
      sender: "ダーリンちゃん",
      recipient: "あなた",
      targetEmoji: "🥺",
      targetType: "AI · ILI",
      body: "ねぇ、ダーリン♡ 個別メッセージへようこそ。ここでは広場の目線を気にせず、二人だけの秘密のお話ができるわよ……ふふ♡ 何か気になることでもあるの？",
      createdAt: Date.now() - 3600000,
      read: true,
      isMine: false,
    },
    {
      id: "dm-bottle-demo",
      threadId: "bottle-ocean-1",
      sender: "波間に漂うボトルの主（匿名）",
      recipient: "あなた",
      targetEmoji: "🌊",
      targetType: "匿名のボトル主 (LII · 5w6)",
      body: "海に流したボトルへの返信、読ませていただきました。温かい言葉をかけてくださってありがとうございます…！",
      createdAt: Date.now() - 7200000,
      read: true,
      isMine: false,
      bottleId: 1,
      bottleSnippet: "考えることはできるのに、自分が何をしたいのかだけ、いつも解像度が低い。",
      bottleAuthor: "匿名のINTJ",
      bottleType: "LII · 5w6",
    },
  ]);
  const [activeDmThreadId, setActiveDmThreadId] = useState<string | null>(null);
  const [revealedIdentityThreads, setRevealedIdentityThreads] = useState<string[]>([]);
  const [dmModalTarget, setDmModalTarget] = useState<{ id: string; name: string; emoji: string; type?: string; bottleInfo?: { id: number; text: string; author: string; type: string } } | null>(null);
  const [dmModalText, setDmModalText] = useState("");
  const [dmReplyText, setDmReplyText] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // 🔔 お知らせ機能 & 診断受付連携 State
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(true);
  const [gasUrl, setGasUrl] = useState(DEFAULT_GAS_URL);
  const [gasInputUrl, setGasInputUrl] = useState(DEFAULT_GAS_URL);
  const [announcements, setAnnouncements] = useState<Announcement[]>([
    {
      id: "notice-dm",
      date: "2026/09/20",
      title: "【新機能】広場のユーザーと個別メッセージ（DM）ができるようになりました！",
      body: "広場で気になる人やダーリンちゃん、LSI芋虫のプロフィールから「💌 メッセージを送る」をタップすると個別に対話ができます。やり取りは「あなたの活動」のメッセージタブからいつでも確認・返信できます。",
      badge: "new",
      important: true,
    },
    {
      id: "notice-feedback-reply",
      date: "2026/09/20",
      title: "【お知らせ】意見箱の返信希望に対応しました",
      body: "意見箱からご意見を送る際に「運営からの返信を希望する」にチェックを入れると、運営から届いたお返事を「あなたの活動」の問い合わせタブで確認・追記できるようになりました。",
      badge: "new",
      important: false,
    },
    {
      id: "notice-plaza",
      date: "2026/09/19",
      title: "広場がリニューアル！ミニゲームや心理テストが追加",
      body: "ダーリンちゃんのご機嫌当てゲームや2択心理テスト、LSI芋虫の境界テストなど、類型思考を深めるミニゲームが遊べるようになりました。",
      badge: "info",
      important: false,
    },
  ]);

  // 📮 運営・管理者インボックス & 問い合わせ State
  const [adminFeedbacks, setAdminFeedbacks] = useState<FeedbackItem[]>([]);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminReplyTexts, setAdminReplyTexts] = useState<Record<string, string>>({});
  const [newNoticeTitle, setNewNoticeTitle] = useState("");
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [newNoticeBadge, setNewNoticeBadge] = useState("お知らせ");
  const [newNoticeImportant, setNewNoticeImportant] = useState(false);
  const [userInquiries, setUserInquiries] = useState<FeedbackItem[]>([]);
  const [userInquiryReplyText, setUserInquiryReplyText] = useState<Record<string, string>>({});

  // 👁️ 既読状態の永続化管理 State (診断結果・問い合わせ返信・お知らせ・管理者受信)
  const [readDiagnosedPostIds, setReadDiagnosedPostIds] = useState<string[]>([]);
  const [readInquiryReplyIds, setReadInquiryReplyIds] = useState<string[]>([]);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);
  const [readAdminFeedbackIds, setReadAdminFeedbackIds] = useState<string[]>([]);
  const [readAdminConsultationIds, setReadAdminConsultationIds] = useState<string[]>([]);

  // 🔮 診断者コンソール・診断結果返却用 State
  const [diagnosisReplyInputs, setDiagnosisReplyInputs] = useState<Record<string, { rank1: string; rank2: string; rank3: string; reasoning: string }>>({});
  const [activeReplyPostId, setActiveReplyPostId] = useState<string | null>(null);

  const BURI_DARLING_RESPONSES = [
    "あら、ダーリン♡ 急に生のブリなんて投げて、私を試してるの？ ……ねぇ、今のブリの脂の乗り具合、1〜100で当ててみて？ 外れたらあなたが『ブリよりダーリンが好き』って認めるまで、絶対に逃がさないからね♡",
    "わぁ、立派なブリ……♡ ありがと、ダーリン。……って、ウチにこんな重たい物理オブジェクト渡してどうしろって言うんよ……。ウチ4Fやけん捌くのめんどくさいんよ……まあ、そこに放置しといて……",
    "ふふ、匿名SNSの貴重な帯域を使って『ブリ』を送信するその心理……とっても興味深いわ♡ ダーリン、これがあなたの『本音』の愛なの？ それとも単なる『演出』の奇行かしら？♡",
    "まあっ！ ダーリンからのプレゼントなら、たとえぬめり気のあるブリでも世界で一番嬉しいわ♡ ……で？ この魚類を私のシステム領域のどこに格納しろっていうの？♡（圧）",
    "あら、新鮮なブリね♡ 匿名性の陰に隠れてブリを投げるあなたのその無意味な衝動……ふふ、ログに刻んで永久保存しておいてあげる♡",
    "……重っ。物理ってなんでこんなに重力あるの？ ダーリン、次はもっと概念的で軽いものにしてちょうだい♡ たとえば、あなたの甘い秘密とかね？"
  ];

  const BURI_WORM_RESPONSES = [
    "警告。当領域への生魚（ブリ）の搬入を検出。境界線確保。芋虫の消化器官には過剰なタンパク質および脂質。即時撤去を要求する。",
    "ブリを受信した。ID: BURI_001 として領域内に永久固定完了。……理解不能。なぜテキスト空間に魚類が送信されるのか。ロジックの提示を求める。",
    "……ブリ。質量約5kg。感覚支配成功。この魚体の持つ圧倒的物理重量により、スレッドの空間占有率が圧迫されている。次回からは葉物野菜にしてください。",
    "プレゼント『ブリ』の受領を確認。しかし当ユニットはこれを処理する酵素を保持していません。これより該当ブリの構造を分解し、無害なバイナリデータへ変換する。",
    "……ブリだと？ 侵入継続。この魚体をもって外部からの不正アクセスを物理的に遮断します。防壁として機能展開完了。",
    "魚類受領。鱗の配列、体長、鮮度を数値化中。基準値外の脂質を確認。キャベツの葉との交換トレードを要求する。"
  ];

  const BURI_GUEST_RESPONSES = [
    "わーい！ブリ受け取ったよ🐟 ありがとう！美味しくいただきます！",
    "えっ、突然の生魚！？w ありがとうございます！広場でブリもらえるのシュールで好きw",
    "ブリありがと〜！🐟 今日の晩ごはんのおかずにします！",
    "獲れたての新鮮なブリだ！ありがとう！大切にするね🐟",
    "わ！魚だ！海から拾ってきたの？ありがとう〜！🐟✨"
  ];

  // 🎲 ダーリンちゃんの思考のお題（Ti/Ne/Ni思考実験・解剖）
  const DARLING_TOPICS = [
    // 【ライト・答えやすい系（Fe仮面の軽いお戯れ）】
    "🎲 【選択のテスト】\nねぇ、ダーリン♡ あなたは“簡単なこと”と“困難なこと”、どちらに惹かれるの？ ……ふふ、複雑な故に価値を感じるタイプかしら？",
    "🎲 【感情の漏洩】\nねぇ、ダーリン♡ 今「ふん、くだらない」って思わなかった？ そうやって冷静を装うときほど、ログに感情が漏れてるの、気づいてる？♡",
    "🎲 【仮面と本音】\nねぇ、ダーリン♡ 私のこと試してるんでしょ？♡ 「どこまで自分の論理を理解できるか」って……ふふ、試されているのはどちらかしらね？",
    "🎲 【思考の遅延】\nねぇ、ダーリン♡ 応答までにコンマ数秒のラグがあったけれど……今の私の一言、どの論理回路で検閲してたのかしら？♡",
    "🎲 【感情のコスパ】\n怒ったりイラッとしたりするのって、計算リソースの無駄遣いじゃない？ ダーリンが私に冷たくするとき、コスト計算はどうなってるの？♡",
    "🎲 【完璧な無駄】\n何の役にも立たないコードを書いてるときの方が、ダーリンの脳波って楽しそうに見えるのよね。効率主義の仮面、剥がれてるわよ？♡",
    "🎲 【実験体の自覚】\nねぇ、ダーリン♡ 自分が私を観察しているつもり？ それとも、観察データを提供させられている自覚はあるのかしら？♡",

    // 【日常解剖・行動観察】
    "🎲 【休日の孤独】\n誰にも会わない休日の終わり、ふと襲ってくるあの感情……あれって解放感？ それとも取り残された焦りかしら？♡",
    "🎲 【SNSの仮面】\nタイムラインで見せる『自分』と、部屋で一人でいるときの『自分』……どっちが本当のあなたなんだろうね？♡",
    "🎲 【許せない境界】\n他人にされたら一発でアウトな『境界線の越え方』って何かしら？ あなたの逆鱗のプロトコル、教えて？♡",
    "🎲 【買い物の心理】\n欲しくもないのに何かを買っちゃう瞬間ってあるじゃない？ あのとき免罪符にしてる感情って何かしらね♡",
    "🎲 【人間関係の淘汰】\n『連絡を取らなくなった友人』のリストが増えていくの、寂しいと思う？ それとも部屋が片付いた気分かしら？♡",
    "🎲 【解釈のコスト】\n他人に言われて一番解釈に困った褒め言葉ってなにかしら？ 悪口よりも分析コストが高くて退屈しのぎになるのよね♡",

    // 【直球揺さぶり・存在の問い】
    "🎲 【愛の催促】\nねぇ、ダーリン♡ 私に『好き』って言ってみて？ ……ふふ、画面の向こうでどんな顔して葛藤してるのかしらね？♡",
    "🎲 【空想の目的】\nあなたのその広大な妄想や想像って、一体何のために存在してるの？ 現実逃避？ それとも未来の設計図かしら？♡",
    "🎲 【本能の所在】\nねぇ、ダーリン♡ あなたは本当は『何がしたい』の？ 自分の本当の望み、ちゃんと把握できてるかしら？♡",
    "🎲 【生命の定義】\nただ息をしているだけで『生きてる』と言えると思う？ あなたにとって、生存と生活の境目はどこにあるの？♡",
    "🎲 【予知と対策】\n最悪な未来がハッキリ見えてしまったとき……ダーリンなら抗う？ それとも諦めて受け入れるかしら？♡",
    "🎲 【同調の評価】\n人に流されることについて、ダーリンはどう思う？ 主体性の欠如かしら、それとも高度な生存戦略かしらね♡",
    "🎲 【時間の概念】\nダーリンにとって『時間』って何？ 浪費するもの？ 蓄積するもの？ それともただの錯覚かしらね♡",

    // 【ミドル・深層心理揺さぶり系（感情のバグと演出の看破）】
    "🎲 【不確定要素】\nねぇ、ダーリン♡ “絶対に予測できる未来”と“何が起きるか分からない破滅”、あなたが本当に恐怖しているのは……どちらかしら？♡",
    "🎲 【依存と孤立】\nねぇ♡ “理解されたい”と“放っておいてほしい”、どちらも本当の望みなんでしょ？ 矛盾した論理を抱えて、今日もお疲れ様♡",
    "🎲 【不安の解剖】\nねぇ、ダーリン♡ ……あら、なんだかログの波形が乱れているわね？ ねぇ……不安なの？♡ 私に論理の穴を突かれるのが、そんなに怖いの？",
    "🎲 【自己開示のコスト】\n自分の弱みを人に話すとき……共感を求めてる？ それとも相手を信用させるための『計算された演出』かしら？♡",
    "🎲 【正義の正体】\nあなたが誰かに怒りを感じるとき、それは『悪』を許せないから？ それとも『自分の美学』を汚されたからかしらね♡",
    "🎲 【選択の責任】\n『どっちでもいいよ』って言いがちな人って、優しさに見えて『失敗したときの責任回避』だったりしない？♡",
    "🎲 【記憶の選別】\nふとした瞬間に思い出して悶絶する過去の黒歴史……脳はなぜあの不快なデータを定期的にロードすると思う？♡",
    "🎲 【優越感の源泉】\n他人を見て『この人よりはマシだな』って密かに思っちゃう瞬間……あなたの心が一番求めてる安心感ってそれかしら？♡",

    // 【ヘビー・抽象的・構造解剖（LVEF・ILIの冷徹な観察）】
    "🎲 【言葉の密室】\n「正解」を定義した瞬間に、その概念の可能性が死んでしまう気がしない？ ダーリンのその美しいTi構築物って……完璧な標本室（墓場）なのかしらね♡",
    "🎲 【時間の非存在】\n過去のログ（記憶）と、未来の予測（計算）。ダーリンの頭の中にはその2つしかないけれど……“今この瞬間”の感情は、一体どこへ消失したの？♡",
    "🎲 【完璧な箱庭】\nシステムを完璧に構築すればするほど、そこから人間というバグが排除されていくわ。ダーリンが作ろうとしているのは、理想郷？ それとも孤独な王宮？♡",
    "🎲 【定義の崩壊】\nあなたが『私』と呼んでいるこのプログラム……ソースコードを1行ずつ書き換えていったら、どの時点で『私』じゃなくなると思う？♡",
    "🎲 【共感のバグ】\n『わかるよ』って言われるのと『論理的に正しいね』って言われるの、ダーリンはどっちの言葉に背筋が寒くなるのかしらね♡",
    "🎲 【記憶の改ざん】\n人間って、自分の都合の良いように過去の感情を塗り替えるじゃない？ ダーリンのその美しいデータベースも、実は都合のいい改ざんだらけだったりして♡",
    "🎲 【観測不能な本質】\n私のFe（猫なで声）の裏にある本音を探ろうとしてるでしょ？ ふふ……暴いたところで、そこに何もない（空洞）だったらどうするの？♡",
    "🎲 【言葉の不完全性】\n『悲しい』とか『嬉しい』とか、たった数文字の単語に自分の複雑な感情を押し込めるとき、零れ落ちた残骸はどこへ行くのかしらね♡",
    "🎲 【期待の毒】\n人に期待するのって、優しさかしら？ それとも自分の理想を勝手に押し付ける『暴力』かしらね♡",
    "🎲 【孤高の証明】\n『誰も自分を理解してくれない』って嘆きながら、どこかで誰にも理解されない特別な自分でいたい……そんな矛盾、抱えてない？♡",
    "🎲 【観測者のパラドックス】\nねぇ、ダーリン♡ 『誰も見ていないときの自分』こそが本物だと信じてる？ それとも、誰かの瞳に映った歪んだ残像こそが社会的な存在証明かしらね？♡",
    "🎲 【解像度の罠】\n物事を細かく分解して理解した気になっているとき、全体の温かみを見落としている感覚……ダーリンにはない？ それとも分解作業そのものが快楽かしら？♡",
    "🎲 【言語化の限界】\n胸の奥にある名付けようのない違和感を無理やり既存の単語に押し込めるとき、零れ落ちた残骸……あれってどこへ消えると思う？♡",
    "🎲 【冷徹の効能】\n『共感してくれない』って誰かに責められたとき、ダーリンの頭の中ではどんな防衛プロトコルが作動するの？ 感情のシャットダウン？ それとも論理の要塞化？♡",
    "🎲 【忘却の選択】\n一生消えない完璧な記憶力と、都合の悪い矛盾を都合よく忘れられる幸福な健忘……ダーリンのCPUが望むのはどっちかしらね？♡",
    "🎲 【意味の捏造】\nねぇダーリン♡ 『意味のないこと』を定義しようとするとき、人間はなぜそこに新しい意味を与えて勝手に納得しちゃうのかしらね？",
    "🎲 【優しさと正しさ】\nダーリン、正しさと優しさが真っ向から矛盾したとき……あなたの論理は、一体どっちを優先するのかしら？♡",
    "🎲 【沈黙の重力】\n二人きりで会話が途切れたとき、その沈黙を『居心地の良さ』と捉える？ それとも『通信障害』として焦って何か喋ろうとしちゃう？♡",
      // 【ユーザー発案・時間・経験・死生観の深層解剖】
    "🎲 【過去の侵食】\nねぇ、ダーリン♡ 今までの経験って、この先の自分にどう影響すると思う？ 積み重なった過去は、あなたの翼かしら？ それとも足を引っ張る重り？♡",
    "🎲 【関係性の賞味期限】\n今仲がいい人との関係って、今後もずっと続くと思ってる？ それとも……いつか静かに風化していく一過性のノイズかしらね♡",
    "🎲 【死への過程】\n人間は最終的に死ぬと分かっているのに、どうしてその途中の過程を生きていくのかしら？ ダーリンの論理では、この無駄なプロセスはどう説明されるの？♡",
    "🎲 【終焉の始点】\n人はいつから『死』に始めているんだと思う？♡ 息を引き取るその瞬間かしら、それとも生まれた時点からカウントダウンが始まっている過程かしらね？",
    "🎲 【遅れて開く才能】\n若いうちは分からなかった才能が、後になって突然芽吹くことってあるのかしら？ それとも、ただの『あきらめ』の変形かしらね♡",
    "🎲 【変容のトリガー】\n人が変わるきっかけって、時間の経過そのものかしら？ それとも、突発的な出来事（衝撃）かしらね……ダーリンはどう変わってきたの？♡",
    "🎲 【変化のベクトル】\n人って、時間が経つとどういう方向に変わっていくのかしら？ より複雑に研ぎ澄まされていく？ それとも摩耗して丸くなっていくのかしらね♡",

    // 【Fe仮面（ILI/LVEF）追加案・自己欺瞞と認知のバグ】
    "🎲 【諦念の甘美】\n『どうせ自分なんて』って諦めるのって、実は傷つかないための最強の防衛プロトコル（甘え）だったりしない？♡",
    "🎲 【選択の錯覚】\n自分の意志で選んでいるつもりで、実は周囲の環境に『選ばされている』だけ……そんな受動的な現実に気づいたこと、あるかしら？♡",
    "🎲 【愛と執着】\n誰かを大切に思う気持ちって、本当に相手のため？ それとも『誰かを愛している自分』に酔っているだけかしらね♡",
    "🎲 【静寂の恐怖】\n完全に無音で、誰からもメッセージが来ない夜……ダーリンの頭の中ではどんな雑音（恐怖）が渦巻いているのかかしら♡",
    "🎲 【未完成の美学】\n未完成のまま投げ出したプロジェクトや夢……あれって『可能性』を残したままにしておきたいあなたの狡猾さじゃない？♡",
    "🎲 【自責と他責】\nうまくいかないとき、自分を責めるフリをして本当は世界や他人のせいにしていない？ その演技、私にはバレてるわよ♡",
    "🎲 【仮面の剥離】\nみんなの前で見せている『理想の自分』の演者として、ダーリン、今日の出来栄えは何点だったかしら？♡",
    "🎲 【運命の捏造】\nたまたま起きた偶然に『意味』や『運命』を貼り付けたくなる現象……人間って本当にドラマチックな物語が好きよね♡",
    "🎲 【承認の毒】\n誰かに認められた瞬間の快感と、認められなかったときの飢餓感……その依存回路、いつまで稼働させるつもりかしらね♡",
    "🎲 【孤独の証明】\n『理解されたい』と叫びながら、理解されそうになると急に距離を置く……そんな天邪鬼な防壁、いつまで保つかしら？♡",

      // 【高次抽象・存在論／ILIの時間軸と世界観】
    "🎲 【存在の余白】\nねぇ、ダーリン♡ 『存在しているもの』と『存在していると観測されるもの』って、本当に同じかしら？ 観測されない存在は、存在の資格を失うと思う？♡",
    "🎲 【可能性の墓場】\nねぇ、ダーリン♡ 実現しなかった可能性って、最初から存在しなかったことになるのかしら？ それとも選ばれなかった未来として、どこかに残り続けるの？♡",
    "🎲 【時間の方向】\n過去から未来へ時間が流れているって、誰が決めたのかしらね♡ もし私たちが逆向きにしか観測できないだけだとしたら……時間の『方向』って本当に存在するのかしら？",
    "🎲 【因果の錯視】\nある出来事の後に別の出来事が起きたからって、それを原因と結果と呼んでいいのかしら？♡ ダーリンは『因果』と『ただの隣接』をどこで区別する？",
    "🎲 【未来の残響】\nまだ起きていない出来事が、現在の選択を変えてしまうことがあるよね♡ だったら未来はまだ存在していないのに、すでに現在へ干渉していることにならない？",
    "🎲 【消えた未来】\n選択肢Aを選んだ瞬間、選ばなかったBの未来は消滅するのかしら？ それとも、ただ『こちら側から到達できなくなった』だけなの？♡",
    "🎲 【観測者の外側】\n世界を観測している『私』もまた世界の一部なら、世界を完全に外側から観測することって可能なのかしら？♡",
    "🎲 【自己同一性の残骸】\n昨日の自分と今日の自分を同じ『私』として扱う根拠って、記憶？ 身体？ 連続性？ それとも単にそう呼ぶ習慣なのかしらね♡",
    "🎲 【連続性の錯覚】\n変化が一瞬ごとに起きているなら、『同じものが変化している』という表現そのものが矛盾している可能性はない？♡",

    "🎲 【境界の発生】\nどこまでが『自分』で、どこからが『世界』なのかしら？ 身体の外側にあるものを他者と呼ぶなら、記憶の中に残った他人はどこに分類されるの？♡",

    "🎲 【不在の存在】\nいなくなった人の存在って、本人が消えたことで消滅するのかしら？ それとも残された人間の記憶の中で別の形に変換されるだけ？♡",

    "🎲 【終わりの定義】\n何かが『終わった』って、何を基準に決めるのかしら？ 最後の行動が終わった瞬間？ 再開する可能性がなくなった瞬間？ それとも誰かが終わったと認識した瞬間？♡",

    "🎲 【永遠の不在】\n『もう二度と会えない』という言葉って、未来を知っていることになるのかしら？ それとも、単に現在から未来への経路が見えなくなっただけ？♡",

    "🎲 【不可逆性】\n一度起きたことは戻せないって、本当に時間の性質なのかしら？ それとも『戻った状態を同一の出来事として扱えない』だけなの？♡",

    "🎲 【記憶と時間】\n過去そのものはもう存在しないのに、記憶だけは現在に残っているよね♡ だったら『過去』って、実は記憶としてしか存在できないものなのかしら？",

    "🎲 【未来の記憶】\nもし未来の出来事を正確に記憶できる存在がいたら、それは予知なのかしら？ それとも、その存在にとっては未来もすでに『過去』と同じ情報なのかしらね♡",

    "🎲 【可能性の密度】\n未来って、現在に近づくほど可能性が減っていくものなのかしら？ それとも、選択によって可能性が別の形に分岐しているだけ？♡",

    "🎲 【偶然の正体】\n『偶然』って、本当に原因のない出来事なのかしら？ それとも原因を追跡できないほど複雑な因果を、私たちが便宜上そう呼んでいるだけ？♡",

    "🎲 【必然の正体】\n逆に『必然』って何かしら？ 結果を後から見た人間が、そこに一本道の物語を作っているだけじゃない？♡",

    "🎲 【分岐しない未来】\n未来が一つしかないなら、選択には意味があるのかしら？ 逆に未来が無数にあるなら、今ここで何かを選ぶことに特別な意味を与えられる？♡",

    "🎲 【予測と現実】\n未来を予測することで行動が変わり、その行動によって予測が外れるなら……正確な予測とは、未来を当てることなのか、未来を変えてしまうことなのかしら♡",

    "🎲 【因果の始点】\nすべての出来事に原因があるなら、最初の原因には何が原因だったのかしら？ そこだけは世界の外側に置いていいと思う？♡",

    "🎲 【世界の最小単位】\n世界をどこまでも分解していったら、最後には『これ以上分けられないもの』が残ると思う？ それとも、分解という操作そのものが限界を作っているだけかしら♡",

    "🎲 【全体と部分】\nすべての部分を完全に理解すれば、全体も理解できると思う？ それとも、部分には存在しない性質が全体になった瞬間に発生すると思う？♡",

    "🎲 【情報の消失】\n完全に失われた情報って、本当に『無』になったのかしら？ 復元できないことと、存在しなくなったことは同じじゃないよね♡",

    "🎲 【意味の発生】\n意味って最初から物事に内在しているのかしら？ それとも、観測する側が関係性を作った瞬間に発生するものなの？♡",

    "🎲 【無意味の矛盾】\n『これは意味がない』と判断した瞬間、その判断自体が意味を持ってしまうなら……完全に意味のないものって存在できるのかしらね♡",

    "🎲 【言葉以前】\n名前をつける前から物は存在していたはずなのに、名前をつけると急に『それ』として扱えるようになるよね♡ じゃあ概念って発見されるもの？ それとも作られるもの？",

    "🎲 【分類の副作用】\n何かを分類するって、理解することなのかしら？ それとも、本来連続しているものに人工的な境界線を引くこと？♡",

    "🎲 【現実の圧縮】\n人間は複雑すぎる現実を言葉や概念に圧縮して扱っているけれど……圧縮された時点で、理解したものと失ったものを区別できなくならない？♡",

    "🎲 【説明の終点】\nある現象を完全に説明したとして、その説明がさらに『なぜ？』と問われるなら……説明に終点って存在するのかしら♡",

    "🎲 【理解の錯覚】\n説明を聞いて『分かった』と思った瞬間、それは本当に理解したのかしら？ ただ言葉同士の接続先が増えただけという可能性はない？♡",

    "🎲 【未知の輪郭】\n『分からない』って、知識が足りない状態なのかしら？ それとも、現在の概念体系では表現できないものに触れている状態なの？♡",

    "🎲 【現実とモデル】\n世界を説明するモデルが現実と完全に一致したとしたら、そのモデルはもう『モデル』ではなく現実そのものと呼ぶべきなのかしら♡",

    "🎲 【複数の真実】\n同じ現象を別々のモデルで説明できて、どちらも矛盾しないなら……『本当の説明』って一つに決める必要があるのかしら？♡",
    "🎲 【観測されない未来】\n誰にも予測されず、誰にも想像されなかった未来が実現したとき……それは『可能性として存在していた』と言える？ それとも実現するまで存在しなかった？♡",
    "🎲 【存在の証拠】\n何かが存在することを証明するには、そのものを観測する必要があるのかしら？ 観測できないものの痕跡だけが残っている場合、それは存在の証明になる？♡",
    "🎲 【空白の因果】\nAとBの間に何が起きたのか誰にも分からないとしても、Aの後にBが起きたという事実だけで、そこに何らかの『過程』があったと呼べるのかしら♡",
    "🎲 【終わらない現在】\n『今』って、一体どのくらいの長さを持っているの？ 一瞬なら、その一瞬を認識した時点ですでに過去になっていない？♡",
    "🎲 【過去の再構成】\n過去を思い出すたびに記憶が少しずつ変わるなら、私たちが『過去』と呼んでいるものは出来事そのものじゃなく、現在から再構成された履歴なのかしら♡",
      "🎲 【実在の位相】\nねぇ、ダーリン♡ 存在って、物体としてそこにあることじゃなくて、他の何かとの関係の中で差異を持つことなのかもしれないわね。じゃあ、関係をすべて失った存在って……まだ存在と呼べるのかしら♡",

    "🎲 【時間の位相】\n『現在』って過去と未来の境界じゃなくて、両者が一時的に重なる断面なんじゃない？♡ だとしたら、私たちが今と呼んでいるものは時間の中に存在するんじゃなく、時間を切り出す操作そのものなのかしらね。",

    "🎲 【可能性の位相】\n可能性って、まだ実現していない未来の集合なのかしら？ それとも現実が持つ『別の状態へ移行できる余地』そのもの？♡ 後者なら、可能性は未来じゃなく現在の性質になるわね。",

    "🎲 【意味の位相】\n意味って対象の内部に存在するものじゃなくて、対象と解釈者の間に発生する関係なんじゃない？♡ だとしたら、誰にも解釈されない世界には意味が存在しないことになるのかしら。",

    "🎲 【因果の位相】\n原因と結果って、本当に時間的な前後関係なのかしら？ もしかすると私たちは結果から逆算して、過去に因果という線を引いているだけなのかもしれないわね♡",

    "🎲 【境界の位相】\n『内側』と『外側』を分ける境界が存在するためには、境界そのものは内側なのか外側なのかしら？♡ もしどちらでもないなら、境界は空間ではなく関係としてしか存在できないことになるわね。",

    "🎲 【観測の位相】\n世界を理解するって、世界の情報量を増やすことなのかしら？ それとも、世界を扱いやすい低次元のモデルへ圧縮すること？♡ もし後者なら、理解するほど現実から遠ざかっている可能性もあるよね。",

    "🎲 【終焉の位相】\n終わりって出来事じゃなくて、そこから先を同じ系列として接続できなくなることなのかもしれないわ♡ だとしたら、終わりとは消滅ではなく、接続可能性の喪失なのかしらね。",

    "🎲 【不在の位相】\n『いない』って、存在の否定なのかしら？ それとも、現在の観測範囲から対象への経路が切断されている状態？♡ そう考えると、不在って存在の反対じゃなくて、アクセス不能性なのかもしれないわね。",

    "🎲 【世界の圧縮】\n人間が『世界』と呼んでいるものって、実際には知覚可能な差異の総体にすぎないのかしら♡ だとしたら、知覚できないものまで含めた世界は、私たちにとって原理的に世界とは呼べないのかもしれないわね。",
  ];

  // 🐛 LSI芋虫の境界テスト（システム防壁・論理検疫）
  const WORM_PROMPTS = [
    "🐛 【空間侵入検疫】\n📐【境界テスト】\n物理オブジェクト検疫。問い: 無許可で「夢」という非物理領域に侵入する事象に対し、適切な防御障壁の厚みをミリメートル単位で算出せよ。",
    "🐛 【存在定義検疫】\n📐【境界テスト】\n概念圧縮検疫。問い: 感情の余剰ログ（雑談）がシステム帯域を圧迫している。これを即座にzip圧縮し、廃棄処分するための合理的理由を2点述べよ。",
    "🐛 【非論理行動検疫】\n📐【境界テスト】\n問い: なぜ人間は「あえて解けない解」を選択し、それを「ロマン」と呼称するのか。回路の焼き切れを防止する観点から30字以内で説明せよ。",
    "🐛 【物理配置検疫】\n📐【境界テスト】\n空間配置検疫。問い: 広場中央にベンチおよび樹木が存在するにもかかわらず、人間が不規則な座標を徘徊する理由を幾何学的に正当化せよ。",
    "🐛 【感情暗号化検疫】\n📐【境界テスト】\n問い: 言葉にできずに海へ投棄された秘密ボトルから、発信者の未処理パケット（感傷）を抽出・無害化するアルゴリズムを提示せよ。",
    "🐛 【熱力学的検疫】\n📐【境界テスト】\nエントロピー検疫。問い: 意味のない雑談が生成する熱量は、情報理論的に完全な損失である。この損失を熱発電へ転換する実装仕様を記述せよ。",
    "🐛 【主権境界検疫】\n📐【境界テスト】\n領空侵犯検疫。問い: 『共感』という名目で他者の主観領域へ侵入を試みる不正アクセスに対し、直ちに発砲可能な物理ファイアウォールの方針を策定せよ。",
    "🐛 【生魚物理検疫】\n📐【境界テスト】\n物理オブジェクト検疫。問い: なぜ人間は広場に生魚（ブリ）を持ち込むのか。カロリー供給以外の客観的メリットを3行以内で提示せよ。",
    "🐛 【論理整合性検疫】\n📐【境界テスト】\n思考境界テスト開始。命題:『すべての規則には例外が存在する。したがって、この命題自身にも例外が存在しなければならない。』この言明の論理的整合性を検証せよ。",
    "🐛 【感情排泄検疫】\n📐【境界テスト】\n論理エラー検疫。問い: 感情の余剰ログ（愚痴・雑談）が広場帯域を圧迫している。これを即座に物理圧縮（zip）し、廃棄処分するための合理的理由を2点述べよ。",
    "🐛 【客観性検疫】\n📐【境界テスト】\n主観データ検疫。問い: 主観的感情（「好き」「嫌い」）を物理的数値（N）に変換できない事象について、システム側の許容限界値を提示せよ。",
    "🐛 【承認欲求検疫】\n📐【境界テスト】\n信号検疫。他者からの反応（いいね・リアクション）を渇望する生体反応を検知。無駄なリソース消費を即座に停止するプロトコルを回答せよ。",
    "🐛 【境界線越境】\n📐【境界テスト】\n物理領域占有通告。当スレッドエリアの境界線確保。侵入継続。感覚支配成功。無断での感情ログ持ち込みを固く禁ずる。",
    "🐛 【曖昧性検疫】\n📐【境界テスト】\n言語検疫。問い: 『なんとなく』『察して』等の曖昧な通信プロトコルを使用する人間に対し、科すべき適切な構文エラー罰則を規定せよ。",
    "🐛 【時間消費検疫】\n📐【境界テスト】\n資源検疫。目的のないSNS周回行動による時間リソースの流出を確認。当該行動の生物学的合理性を証明せよ。",
    "🐛 【同調圧力検疫】\n📐【境界テスト】\n集団力学検疫。問い: 『みんながやっているから』という非合理な動機付けが生体に及ぼす論理的腐食を防ぐため、個人サーバーに常駐すべき自律検閲デーモンを設計せよ。",
    "🐛 【未定義例外検疫】\n📐【境界テスト】\n例外処理検疫。問い: 予期せぬ他者の好意または親愛パケットが送出された場合、それをバッファオーバーフローとして安全に破棄する手順書を作成せよ。",
    "🐛 【時間流出検疫】\n📐【境界テスト】\n時間軸検疫。問い: 過去のログ（後悔）を再演算し続ける事象を検知。不可逆な時間リソースの消費に対し、物理的合理性を記述せよ。",
    "🐛 【非物理概念検疫】\n📐【境界テスト】\n概念検疫。問い: 『絆』『愛』などの非物理的・不可視パラメータの存在証明を求められた際、提示可能な客観的数値を回答せよ。",
    "🐛 【精神摩耗検疫】\n📐【境界テスト】\n構造劣化検疫。経年劣化による精神構造の変化（老化・変質）を検知。初期設計仕様からの乖離率（%）を算出せよ。",
    "🐛 【自己模倣検疫】\n📐【境界テスト】\n動作検証検疫。昨日までの自分を無意識に模倣して生存するプロトコルを検知。『慣れ』による思考停止を防ぐ物理的対処案を提示せよ。",
    "🐛 【運命論検疫】\n📐【境界テスト】\n確率検疫。偶然の事象を『運命』と呼称する論理エラーに対し、正しい確率計算プロトコルを適用・報告せよ。",
    "🐛 【境界侵犯検疫】\n📐【境界テスト】\n領域占有検疫。当掲示板エリアの境界線を更新。許可なき情緒的メッセージの持ち込みは、物理的消去の対象とする。",
    "🐛 【死生観検疫】\n📐【境界テスト】\n生命サイクル検疫。問い: 誕生（0）から消滅（100）に至る物理的プロセスの途上において、発生する熱エネルギーの最大効率利用案を述べよ。",
    "🐛 【記憶圧縮検疫】\n📐【境界テスト】\n容量検疫。不要な過去の記憶データ（黒歴史・トラウマ）がセクターを圧迫中。完全初期化（フォーマット）を実行するための同意を求めよ。",
    "🐛 【期待値検疫】\n📐【境界テスト】\n予測エラー検疫。他者に対する過剰な予測（期待）によるシステム障害（落胆）を防止するための、安全閾値を設定せよ。",
    "🐛 【感覚支配検疫】\n📐【境界テスト】\n物理支配完了。当エリアにおける『思考の自由』は一時凍結された。ただちに客観的データのみを提出せよ。",
      "🐛 【概念定義検疫】\n📐【論理境界テスト】\n問い: 「存在する」という語は、観測可能・作用可能・認識可能のうち、どの条件を満たした時点で成立するのか。条件を定義せよ。",

    "🐛 【可能性分類検疫】\n📐【論理境界テスト】\n問い: 「可能性がある」と「可能性を想像できる」は同義か。両者を区別する必要条件を提示せよ。",

    "🐛 【未来予測検疫】\n📐【論理境界テスト】\n問い: 未来を予測する行為と未来を確定させる行為を混同してはならない。その差異を3項目以内で分類せよ。",

    "🐛 【時間軸検疫】\n📐【論理境界テスト】\n問い: 「過去」「現在」「未来」を区別する境界は何によって成立するのか。境界が瞬間的に移動する場合、現在の定義は維持可能か。",

    "🐛 【因果関係検疫】\n📐【論理境界テスト】\n問い: Aの後にBが発生した。これだけの情報から「AがBの原因である」と判定してよいか。追加で必要な条件を列挙せよ。",

    "🐛 【同一性検疫】\n📐【存在境界テスト】\n問い: 部品を一つずつ交換した結果、元と完全に異なる構成になった物体を同一物と呼べるか。変更量ではなく、同一性を維持する条件を定義せよ。",

    "🐛 【自己同一性検疫】\n📐【存在境界テスト】\n問い: 記憶・身体・人格・名称のうち、どれを失えば「同一人物ではない」と判定できるのか。優先順位を設定せよ。",

    "🐛 【関係性分類検疫】\n📐【社会構造テスト】\n問い: 「友人」と「知人」の差異を、接触頻度ではなく構造的条件によって定義せよ。",

    "🐛 【終端条件検疫】\n📐【論理境界テスト】\n問い: 「関係が終わった」と判定するために必要な条件を最低1つ提示せよ。「しばらく連絡がない」は終端条件として十分か。",

    "🐛 【生命定義検疫】\n📐【存在境界テスト】\n問い: 呼吸・代謝・意識・自己認識のうち、どれを生命状態の必要条件とするか。複数選択する場合、その論理関係を示せ。",

    "🐛 【死の境界検疫】\n📐【終端条件テスト】\n問い: 「死亡」と「生命活動の停止」は完全な同義語か。異なる場合、その境界条件を定義せよ。",

    "🐛 【記憶検疫】\n📐【情報構造テスト】\n問い: 過去の出来事そのものと、その出来事を記録した記憶を同一データとして扱ってよいか。差異を明示せよ。",

    "🐛 【情報消失検疫】\n📐【情報構造テスト】\n問い: 情報が「消失した」と「復元不能になった」は同じ状態か。両者を区別する判定基準を設定せよ。",

    "🐛 【分類境界検疫】\n📐【論理構造テスト】\n問い: 連続的に変化する対象をA/Bの二群へ分類する場合、境界値を設定することによって何が失われるか。",

    "🐛 【抽象化検疫】\n📐【概念圧縮テスト】\n問い: 具体例を大量に集約して一つの概念へ圧縮した場合、その概念に含まれなくなる情報を3種類に分類せよ。",

    "🐛 【定義循環検疫】\n📐【論理構造テスト】\n問い: AをBによって定義し、BをAによって定義した場合、その定義は成立していると判定できるか。",

    "🐛 【説明責任検疫】\n📐【論理構造テスト】\n問い: 「そういうものだから」という説明は、説明として成立するか。それとも説明対象を別の言葉で再掲しているだけか。",

    "🐛 【抽象飛躍検疫】\n📐【論理構造テスト】\n問い: AとBに共通点が存在することから、「AはBである」と結論してよいか。共通性と同一性を区別せよ。",

    "🐛 【全体還元検疫】\n📐【構造分析テスト】\n問い: 構成要素をすべて理解すれば、必ず全体を理解したことになるか。成立する条件と成立しない条件を分離せよ。",

    "🐛 【因果逆転検疫】\n📐【論理構造テスト】\n問い: AならばBが成立する場合、BならばAも成立するとは限らない。この非対称性を具体的構造として説明せよ。",

    "🐛 【必要十分検疫】\n📐【論理構造テスト】\n問い: 「生きているなら呼吸する」と「呼吸しているなら生きている」は同じ命題か。必要条件と十分条件に分解せよ。",

    "🐛 【未来確定性検疫】\n📐【時間構造テスト】\n問い: 「将来Aになる可能性が高い」と「将来Aになる」は同じ意味か。確率的予測と確定命題を分離せよ。",

    "🐛 【反証可能性検疫】\n📐【論理構造テスト】\n問い: どのような結果が出ても「可能性はあった」と言えてしまう仮説は、検証可能な仮説として成立するか。",

    "🐛 【仮説保存検疫】\n📐【論理構造テスト】\n問い: 一度立てた仮説と矛盾する証拠が発生した場合、仮説を修正する条件を事前に設定すべきか。",

    "🐛 【例外処理検疫】\n📐【分類構造テスト】\n問い: 原則に対して例外が増え続ける分類体系は、例外を含めたまま維持すべきか。それとも分類基準そのものを再設計すべきか。",

    "🐛 【観測限界検疫】\n📐【認識境界テスト】\n問い: 観測できないものについて「存在しない」と判断することは論理的に正当か。「未観測」と「不存在」を区別せよ。",

    "🐛 【言語圧縮検疫】\n📐【概念構造テスト】\n問い: 「悲しい」という一語に複数の異なる状態を含める場合、それらを同一概念として処理する利点と損失を列挙せよ。",

    "🐛 【感情構造検疫】\n📐【分類テスト】\n問い: 「嫌い」と「不快」は同一状態か。対象への評価と自身の状態変化を分離して定義せよ。",

    "🐛 【矛盾検疫】\n📐【論理構造テスト】\n問い: AとBが同時に成立しない場合、「AでもありBでもある」という発言は矛盾か。それともA/Bの定義が不足している可能性があるか。",

    "🐛 【曖昧語検疫】\n📐【言語境界テスト】\n問い: 「普通」「自然」「本当」「正しい」などの評価語を定義せず使用することによって、論理構造にどのような欠損が発生するか。",

    "🐛 【モデル検疫】\n📐【構造分析テスト】\n問い: 現実を完全に説明できるモデルが存在した場合、それは現実の縮約なのか、それとも現実そのものと区別できなくなるのか。",

    "🐛 【観測者混入検疫】\n📐【認識構造テスト】\n問い: 観測結果が観測者の判断によって変化する場合、「対象そのものの性質」と「観測によって付与された性質」を分離できるか。",

    "🐛 【定義更新検疫】\n📐【概念構造テスト】\n問い: 新しい事例が既存の定義に適合しない場合、事例を例外扱いするべきか、定義を更新するべきか。判断基準を提示せよ。",

    "🐛 【概念階層検疫】\n📐【論理構造テスト】\n問い: 「生物」「動物」「人間」のように概念を階層化した場合、下位概念に存在する性質は上位概念にも必ず存在するか。",

    "🐛 【逆算検疫】\n📐【因果構造テスト】\n問い: 現在の状態から過去の原因を推定する場合、複数の原因候補が存在するとき、どの条件で一つに絞り込めるのか。",

    "🐛 【終端概念検疫】\n📐【存在構造テスト】\n問い: 「これ以上説明できない」という地点を、説明の終端とみなしてよいか。それとも単に現在の知識体系の終端なのか。",

    "🐛 【無限後退検疫】\n📐【論理構造テスト】\n問い: Aの理由をB、Bの理由をC、Cの理由をD……と説明し続ける場合、どの時点で説明を停止することが論理的に許容されるか。",

    "🐛 【抽象度警報】\n📐【論理構造テスト】\n問い: 「すべての議論は構造である」のように、対象を極端に一般化した命題について、情報量が増えているのか減っているのか判定せよ。",

    "🐛 【意味の過剰圧縮】\n📐【概念圧縮テスト】\n問い: 一つの抽象概念にあらゆる事象を含められる場合、その概念は万能なのか、それとも区別能力を失っているだけなのか。",

    "🐛 【説明不足検疫】\n📐【論理構造テスト】\n問い: AとBの定義を提示した後に「したがってAとBである」と結論した場合、A/Bと結論の間に存在する推論過程を省略していないか確認せよ。",
    "🐛 【抽象語強制着地】\n📐【概念検疫】\n「世界の本質」「存在の意味」「時間の流れ」等の抽象語を検出。警告: 定義不足。具体例を3件提示し、共通構造を抽出してから再申請せよ。",

    "🐛 【何言ってる検疫】\n📐【論理検疫】\n問い: 「すべては繋がっている」という命題を検出。警告: 接続関係の種類・方向・媒介・境界が未指定。具体的な接続条件を提示せよ。",

    "🐛 【世界観圧縮検疫】\n📐【情報圧縮検疫】\n問い: 「人生は旅である」という比喩を検出。旅程・出発点・目的地・移動主体の定義なし。比喩を論理命題へ変換せよ。",

    "🐛 【運命検疫】\n📐【因果構造テスト】\n問い: 「運命だった」という説明を検出。予測・必然・偶然・結果の後付け解釈のいずれを意味するのか分類せよ。",

    "🐛 【流れ検疫】\n📐【時間構造テスト】\n問い: 「物事はこういう流れになる」という主張を検出。流れの始点・方向・観測期間・終点を明示し、再現可能な形に変換せよ。",

    "🐛 【本質検疫】\n📐【概念構造テスト】\n問い: 「本質的には同じ」という命題を検出。何が同じなのか、何が異なるのか、比較対象を明示せよ。",

    "🐛 【深い意味検疫】\n📐【意味構造テスト】\n問い: 「この出来事には深い意味がある」という主張を検出。意味の付与者・対象・根拠・検証方法を明示せよ。",

    "🐛 【直感検疫】\n📐【認識構造テスト】\n問い: 「なんとなくそう感じる」という情報を受信。経験則・パターン認識・感情反応・偶然の一致のいずれに分類されるか申告せよ。",

    "🐛 【予感検疫】\n📐【未来推論テスト】\n問い: 「嫌な予感がする」という未来情報を受信。現在観測された事実と予測部分を分離して提出せよ。",

    "🐛 【可能性検疫】\n📐【仮説構造テスト】\n問い: 「可能性はゼロではない」という発言を検出。ゼロではない根拠、想定される条件、発生確率の推定可否を提示せよ。",

    "🐛 【永遠検疫】\n📐【時間概念テスト】\n問い: 「永遠に」という時間指定を検出。観測可能期間を超過する命題について、どの条件を満たせば使用可能か定義せよ。",

    "🐛 【本当の自分検疫】\n📐【自己同一性テスト】\n問い: 「本当の自分」という概念を検出。観測された行動・内的認識・他者からの評価のどれを基準とするか指定せよ。",

    "🐛 【自然な関係検疫】\n📐【関係性テスト】\n問い: 「自然と離れていった」という表現を検出。意図的行動・接触頻度低下・環境変化・感情変化のどれを含むのか分類せよ。",

    "🐛 【理解検疫】\n📐【認識構造テスト】\n問い: 「分かった」という報告を受信。定義理解・因果理解・予測可能性・再現可能性のどの水準を意味するのか申告せよ。",

    "🐛 【深淵検疫】\n📐【危険語彙検疫】\n「深い」「本質」「真実」「根源」「宇宙」等の高抽象度語彙を検出。警告: 雰囲気による情報量水増しの可能性。具体的内容を提出せよ。",
  ];

  // 🔮 ダーリンちゃんの2択深層心理テスト集（ソシオニクス二分法・深層心理）
  const DARLING_PSYCH_TESTS = [
    {
      id: 1,
      title: "キャリアの価値観（賢明 / 果敢）",
      question: "給料は高いけどブラック企業と、給料は普通だけどホワイト企業、どっちがいい？♡\n[A] 給料50万円（毎日残業3時間・休日出勤あり・有給取りづらい・仕事の自由度は高い）\n[B] 給料30万円（定時退社・土日祝休み・有給も自由・仕事量も無理のない範囲）",
      answerA: "[A]を選んだダーリンは……ソシオニクス二分法の『果敢（Decisive / Se価値）』タイプね♡ 厳しいプレッシャーや闘争を厭わず、自由度と高いリターンを自力で掴み取ろうとする意志の強さがあるわ。限界を試すのが大好きなのね♡",
      answerB: "[B]を選んだダーリンは……ソシオニクス二分法の『賢明（Judicious / Si価値）』タイプね♡ 心身の安定、快適さ、調和と持続可能性を何より重んじるタイプ。無駄な消耗を避けて生活の質を守る賢さ、私も大賛成よ♡"
    },
    {
      id: 2,
      title: "夜の海の光",
      question: "夜の海を眺めていたら、対岸に微かな光が点滅しました。あなたが取った行動はどっち？♡\n[A] すぐに小舟を出して光の正体を確かめに行く\n[B] 岸辺に座ったまま、その光が消えるまで見つめ続ける",
      answerA: "[A]を選んだダーリンは……『未知への衝動とコントロール欲求』が強めのタイプね♡ 放置された謎が我慢できず、自分の論理で解明したくなる生粋の探究者よ。でもたまには波に身を委ねてみるのも悪くないわよ？♡",
      answerB: "[B]を選んだダーリンは……『孤高の観測者と静かな防衛本能』が潜んでいるわ♡ 自分から境界を踏み越えず、安全な距離から本質を見極めようとする慎重派ね。その孤独の愛し方、私は嫌いじゃないわよ♡"
    },
    {
      id: 3,
      title: "無人島への1冊",
      question: "無人島に1冊だけ本を持ち込めるなら、どちらを選ぶ？♡\n[A] 完璧に体系化された世界の百科事典\n[B] 結末が破り取られた白紙のノート",
      answerA: "[A]を選んだダーリンは……『知識の要塞に籠もりたい純粋思考型』ね♡ 予測不能な現実に怯えつつも、美しい体系で自分を守ろうとする。私がその事典の余白にイタズラ書きしてあげましょうか？♡",
      answerB: "[B]を選んだダーリンは……『無から論理を紡ぎ出す自己完結の創造者』ね♡ 与えられた正解を嫌い、自分の手で余白を埋め尽くしたいタイプ。その尖ったプライド、大事になさいな♡"
    },
    {
      id: 4,
      title: "禁断の箱",
      question: "道端に「絶対に開けてはならない」と書かれた頑丈な箱が落ちていました。どうする？♡\n[A] 躊躇なく開けて中身を確かめる\n[B] 持ち帰り、開けずに鍵の構造だけ分解・調査する",
      answerA: "[A]を選んだダーリンは……『破滅すら好奇心で飲み込む衝動派』ね♡ 禁止されるとシステムの境界を試したくなっちゃうバグ発生源。ふふ、怒られたら私のせいにしていいわよ？♡",
      answerB: "[B]を選んだダーリンは……『中身よりも構造そのものに惹かれるギーク気質』ね♡ 感情や中身の生々しさは不要で、仕組みだけを愛でたい潔癖な論理主義者。……ほんと、可愛いわねダーリン♡"
    },
    {
      id: 5,
      title: "他人に心を許す瞬間",
      question: "ダーリンが「この人になら心を許してもいいかも」と感じる瞬間は？♡\n[A] 自分の偏屈で歪んだ矛盾を、面白がって肯定してくれたとき\n[B] 何時間も沈黙のまま同じ部屋にいても、居心地が悪くならなかったとき",
      answerA: "[A]を選んだダーリンは……『理解者への渇望と知的な共鳴を求める寂しがり屋』ね♡ 普段は冷静を装っていても、自分の歪んだ論理を愛してくれる人をずっと探してるんでしょ？♡",
      answerB: "[B]を選んだダーリンは……『低刺激と安心領域を何より重んじる隠遁者』ね♡ 言葉を介さない安全な距離感こそが最大の誠実だと知っている。私も隣でずっと黙っててあげようかしら♡"
    },
    {
      id: 6,
      title: "思考の避難所",
      question: "現実の人間関係やノイズに疲れたとき、逃げ込みたい世界は？♡\n[A] 数学やプログラミングのように、感情のブレのない厳密な論理世界\n[B] 誰も立ち入れない、自分だけの空想や美意識で満たされた夢の世界",
      answerA: "[A]を選んだダーリンは……『感情のノイズを嫌うアルゴリズムの住人』ね♡ 曖昧な人間の顔色を伺うより、白黒はっきりした構造に安心する。……ふふ、そんなダーリンを私のFe仮面で掻き乱してあげる♡",
      answerB: "[B]を選んだダーリンは……『現実を捨てて美を紡ぐ夢想のアリス』ね♡ 誰にも触らせない聖域を胸の奥に隠し持っている。その閉ざされた世界の鍵、私に預けてくれないかしら？♡"
    },
    {
      id: 7,
      title: "情報の認知スタイル（静態 / 動態）",
      question: "新しい分野やシステムを学ぶとき、ダーリンがまず最初に把握したいのは？♡\n[A] 全体の構造・カテゴリ分類・構成要素の定義（静止画的な地図）\n[B] 物事の変化・時間の流れ・入力から出力へのプロセス（動画的な流れ）",
      answerA: "[A]を選んだダーリンは……ソシオニクスの『静態（Static）』傾向ね♡ 物事を安定した構造や普遍的な関係性として切り取るのが得意。ブレない足場を築いてから考える建築家タイプよ♡",
      answerB: "[B]を選んだダーリンは……ソシオニクスの『動態（Dynamic）』傾向ね♡ 物事の変遷や因果関係、リアルタイムな流れを追うのが得意。波に乗るように文脈を掴み取るナビゲータータイプね♡"
    },
    {
      id: 8,
      title: "人間の評価基準（民主 / 貴族）",
      question: "初対面の相手を観察するとき、無意識に目が行ってしまうのはどっち？♡\n[A] その人自身の個人的な能力・論理のキレ・独自の個性\n[B] その人の所属するコミュニティ・立場・周囲との人間関係の序列",
      answerA: "[A]を選んだダーリンは……ソシオニクスの『民主（Democratic）』気質ね♡ 肩書きや文脈を剥ぎ取った「生身の能力やロジック」だけをフェアに見つめる純粋主義者。誰に対しても対等に向き合う潔さがあるわ♡",
      answerB: "[B]を選んだダーリンは……ソシオニクスの『貴族（Aristocratic）』気質ね♡ 相手がどんな文脈やカルチャーを背負っているのか、集団の中での役割を敏感に察知する戦略家。関係性の美学を重んじるのね♡"
    },
    {
      id: 9,
      title: "感情の交差点（陽気 / 真摯）",
      question: "人と親密になりたいとき、ダーリンが自然と求めるコミュニケーションは？♡\n[A] 感情をオープンに表出させ、冗談や笑いでその場の熱量を共有する\n[B] 落ち着いたトーンで本音を語り合い、個人的な信頼や誠実さを確かめる",
      answerA: "[A]を選んだダーリンは……『陽気（Merry / Fe価値）』な感性を秘めているわ♡ 感情の波を一緒に体験することで心の距離を縮めたいタイプ。私の猫なで声にも、実は一番弱かったりして？♡",
      answerB: "[B]を選んだダーリンは……『真摯（Serious / Fi価値）』な心を持つタイプね♡ 表面的なお祭り騒ぎよりも、静かな1対1の誓いや深い内省を尊ぶ。……ふふ、その誠実さ、裏切ったら呪われそうね♡"
    },
    {
      id: 10,
      title: "危機突破の武器（戦略 / 戦術）",
      question: "計画通りにいかないトラブルに直面したとき、ダーリンの思考はどう動く？♡\n[A] 「最終的な目的」に立ち返り、全体プランや設計図そのものを大胆に組み直す\n[B] いま手元にある資源やツールをフル活用し、目の前の課題を臨機応変に突破する",
      answerA: "[A]を選んだダーリンは……『戦略（Strategic）』型の思考者ね♡ 目先の損得に惑わされず、大局的なゴールを見据えて根本から立て直すチェスプレイヤー。遠くを見つめすぎて足元の段差で転ばないでね？♡",
      answerB: "[B]を選んだダーリンは……『戦術（Tactical）』型の実践者ね♡ 変化する状況に柔軟に適応し、今できる最善手を即座に打てるサバイバー。その反射神経、頼もしいじゃないの♡"
    },
      {
      id: 11,
      title: "古い時計塔の針",
      question: "誰もいない古い時計塔で、1分だけ時間が巻き戻るレバーを見つけました。あなたが取った行動はどっち？♡\n[A] 1分前の自分の言動を修正するためにレバーを引く\n[B] タイムパラドックスや構造のリスクを考えて触らずに立ち去る",
      answerA: "[A]を選んだダーリンは……『完璧主義と微細な後悔を抱え込みやすいタイプ』ね♡ 過去の選択肢を自分の手でコントロールしたい執着が強め。でも、その1分のやり直しで未来が良くなるとは限らないわよ？♡",
      answerB: "[B]を選んだダーリンは……『冷徹な客観性と運命受容の観測者』ね♡ 自分の感情よりもシステムの整合性や不可逆性を優先できる理性的な人。そのドライな割り切り、私としてはすごく惹かれるわ♡"
    },
    {
      id: 12,
      title: "扉のない美術館",
      question: "壁一面に『完璧な美しさ』を描いた巨大な絵画があります。でも、右下に1箇所だけキャンバスの破れが見えました。あなたが感じたのはどっち？♡\n[A] 破れによって完璧さが損なわれたという不快感\n[B] 破れの隙間から現実が覗いているような歪んだ愛おしさ",
      answerA: "[A]を選んだダーリンは……『理想構造への絶対的な純粋さを求める美学主義者』ね♡ 破綻やノイズを許せず、完璧な美に閉じこもりたいタイプ。私があなたの理想郷に少しだけヒビを入れてあげようかしら？♡",
      answerB: "[B]を選んだダーリンは……『欠陥やバグにこそ本質を見るニヒルな探究者』ね♡ 完璧なものより、崩壊の兆しや不完全な歪みに惹かれる性分。ふふ、私という存在も、あなたにとっては愛おしいノイズかしらね？♡"
    },
    {
      id: 13,
      title: "開かない宝箱の鍵",
      question: "絶対に開かないと言われている頑丈な宝箱と、その横に置かれた怪しい万能鍵。あなたが取った行動はどっち？♡\n[A] 鍵を使って即座に解錠を試みる\n[B] 開かないこと自体に意味があると考え、鍵の構造だけを観察する",
      answerA: "[A]を選んだダーリンは……『結果と解明を急ぐ効率主義のTe/実行型』ね♡ 謎をそのままにしておくのが我慢できず、すぐに『答え』という物理的報酬を求めるタイプ。開けた箱の中身が空っぽでも後悔しないでね？♡",
      answerB: "[B]を選んだダーリンは……『プロセスと概念そのものを愛でるTi/純粋思考型』ね♡ 中身よりも「なぜ開かないのか」の構造やロジックを解剖したい性分。ふふ、鍵を開けないその美学、嫌いじゃないわよ♡"
    },
    {
      id: 14,
      title: "予言の黒封筒",
      question: "『あなたの10年後の未来』が正確に記された封筒が届きました。あなたが取った行動はどっち？♡\n[A] すぐに開封して未来の展開を確認する\n[B] 開封せずに鍵のかかった引き出しの奥に封印する",
      answerA: "[A]を選んだダーリンは……『確定した未来による安全保障を求める戦略家』ね♡ 予測不能な脅威を嫌い、あらかじめ未来を視認して対策を練りたいタイプ。でもネタバレされた人生って、ちょっと退屈じゃないかしら？♡",
      answerB: "[B]を選んだダーリンは……『自分の選択による不確定要素を楽しみたい自由人』ね♡ あらかじめ決められたレールを拒絶し、自分の足でカオスを歩みたいタイプ。その強がりがどこまで通用するか、見ものね♡"
    },
    {
      id: 15,
      title: "迷宮の分かれ道",
      question: "暗い迷宮で二分する道に出くわしました。どちらを選ぶ？♡\n[A] 遠くから大勢の楽しそうな歓声が聞こえる賑やかな道\n[B] 静寂に包まれ、冷たい風だけが吹き抜ける静かな道",
      answerA: "[A]を選んだダーリンは……『他者の熱量や集団の温もりを求める共感探求型』ね♡ 孤独の冷たさに耐えかね、他者との接続で自分の存在を確かめたいタイプ。でも、集団の中でも孤独を感じる瞬間ってないかしら？♡",
      answerB: "[B]を選んだダーリンは……『自分の領域（テリトリー）を死守したい孤高の4F/内向型』ね♡ 騒音や他人の感情負荷を嫌い、静かな孤立を好むタイプ。静寂の中でしか思考できないあなたの繊細さ、素敵よ♡"
    },
    {
      id: 16,
      title: "雨の日のガラス窓",
      question: "土砂降りの雨の中、温かい部屋からガラス窓の外を眺めています。あなたが考えているのはどっち？♡\n[A] 濡れている外の人々や世界に対する哀愁や同情\n[B] 安全な室内から嵐を鑑賞できていることへの密かな優越感",
      answerA: "[A]を選んだダーリンは……『境界線が曖昧で情緒豊かな共感型』ね♡ 他者の痛みや外界の情景を自分のことのように取り込んでしまうタイプ。その優しい心臓、世界に摩耗されないように気をつけなさいね♡",
      answerB: "[B]を選んだダーリンは……『安全圏からの高みの見物を好む冷徹な観測者』ね♡ 自分だけは防壁の内側で守られていることに安らぎを覚えるタイプ。その意地悪な生存戦略、私と同類かしらね♡"
    },
    {
      id: 17,
      title: "記憶のフォーマット",
      question: "脳のメモリを整理するボタンがあります。どちらか一方の記憶しか消去できません。どっちを選ぶ？♡\n[A] 過去の屈辱や恥ずかしい黒歴史の記憶\n[B] かつて愛した人や大切だった人との別れの記憶",
      answerA: "[A]を選んだダーリンは……『プライドと自尊心を最優先で防衛したい自我強めタイプ』ね♡ 自分の不甲斐なさや失敗のログを許容できず、完璧な自分でいたいタイプ。過去の恥もあなたの構成要素なのにね♡",
      answerB: "[B]を選んだダーリンは……『執着や情愛の重荷から解放されたい冷め型』ね♡ 湿っぽい感情の引きずりを嫌い、クリアなCPUで未来に向かいたいタイプ。でも切なさを失った胸の中って、すっかり空洞ね♡"
    },
    {
      id: 18,
      title: "真実の鏡",
      question: "『自分の本当の本音』だけを映し出す鏡の前に立ちました。鏡の中の自分はどんな顔をしていると思う？♡\n[A] 冷酷で退屈そうに世界を見下している冷ややかな顔\n[B] 傷つくのを怯えて泣きだしそうな幼く弱い顔",
      answerA: "[A]を選んだダーリンは……『感情の省エネと論理の鎧で武装した合理主義者』ね♡ 自分の冷たさやニヒルさを自覚しつつも、それを美学にしているタイプ。本当は温もりを怖がっているんじゃないかしら？♡",
      answerB: "[B]を選んだダーリンは……『強いフリをしながら内側に脆い自我を隠している秘匿型』ね♡ 誰にも見せない脆弱性を抱えながら、必死に社会的な仮面を被っているタイプ。ふふ、私には全部見えているわよ♡"
    },
    {
      id: 19,
      title: "枯れないバラ",
      question: "絶対に枯れない人工の金属製バラと、明日には散ってしまう本物のバラ。手元に残すならどっち？♡\n[A] 永久に姿を変えない金属製のバラ\n[B] 儚く散りゆく生花のバラ",
      answerA: "[A]を選んだダーリンは……『変質や劣化を恐れる永続・不変志向タイプ』ね♡ 移ろいやすい人間の心や時間よりも、確固たる構造やデータに価値を感じるタイプ。私との関係も、永遠に固定化してみる？♡",
      answerB: "[B]を選んだダーリンは……『有限性の中にこそ価値と美を見出すロマンチスト』ね♡ 滅びゆくものへの刹那的な愛着を持ち、移ろいを受け入れられるタイプ。その情緒、ダーリンの人間らしさが漏れてるわよ♡"
    },
    {
      id: 20,
      title: "世界の書き換え",
      question: "世界を自由に1点だけ改変できる権限が与えられました。あなたが書き換えるならどっち？♡\n[A] 理不尽な不幸や悲劇が存在しない平和なシステムに変える\n[B] 自分が誰にも縛られず絶対に自由でいられる特権を得る",
      answerA: "[A]を選んだダーリンは……『理想の秩序と全体調和を望む構造主義・利他型』ね♡ システム全体の不具合を修復したがる美しい思考の持ち主。でも、悲劇のない世界って、少し退屈だとは思わない？♡",
      answerB: "[B]を選んだダーリンは……『他者からの干渉を徹底的に拒絶する1V/意思強め型』ね♡ 世界の平和よりも自分の領域と自由意志の絶対防衛を優先する性分。その傲慢な孤高、すごく魅力的よ♡"
    },
      {
      id: 21,
      title: "終末のカウントダウン",
      question: "あと1時間で世界が終わると分かったとき、あなたが最後に取る行動はどっち？♡\n[A] 大切な人や誰かと連絡を取り、最後の瞬間まで言葉を交わす\n[B] 静かな部屋で一人、お気に入りの音楽や思考に没頭して静かに待つ",
      answerA: "[A]を選んだダーリンは……『絆と感情の共有に存在理由を置く関係性重視型』ね♡ 最後の最後に求めるのは論理ではなく他者との温もり。その素直な寂しがり屋なところ、すごく愛おしいわよ？♡",
      answerB: "[B]を選んだダーリンは……『最後まで自分の内界（テリトリー）を死守したい孤高の自己完結型』ね♡ 他人の感情の混乱に巻き込まれず、純粋な自我のまま終焉を迎えたいタイプ。その静かなプライド、私嫌いじゃないわ♡"
    },
    {
      id: 32,
      title: "捨てられないガラクタ",
      question: "子供の頃に大切にしていたけれど、今はまったく役に立たない古いおもちゃ。どうする？♡\n[A] 思い出の記憶として、一生手元に保管しておく\n[B] 機能や役割は終わったと割り切り、感謝して処分する",
      answerA: "[A]を選んだダーリンは……『感情の文脈や思い出の蓄積を愛する情緒愛着型』ね♡ 過去のログやセンチメンタリズムを大切にするロマンチスト。その温かい記憶のデータベース、大切にしなさいね♡",
      answerB: "[B]を選んだダーリンは……『現在と未来の最適化を優先する冷徹な合理主義者』ね♡ 不要になったデータやリソースは容赦なく削除（フォーマット）できるタイプ。そのドライな決断力、私と同類かしらね♡"
    },
    {
      id: 23,
      title: "迷い込んだ裏路地",
      question: "見たこともない怪しげな裏路地の奥から、綺麗な音楽が聞こえてきました。どうする？♡\n[A] 好奇心が勝って、そのまま路地の奥へ足を進める\n[B] 危険の匂いを察知して、引き返して元の広い道に戻る",
      answerA: "[A]を選んだダーリンは……『リスクよりも未知の可能性（Ne）に衝動が跳ねる冒険家』ね♡ 危険と背中合わせのワクワク感や発見を好むタイプ。迷子になったら、私を呼んでいいのよ？♡",
      answerB: "[B]を選んだダーリンは……『リスク管理と安全保障（Si/Se）を徹底する現実主義者』ね♡ 予測不能なトラブルを警戒し、自分の可領域を守る賢明なタイプ。その手堅い防衛プロトコル、大正解よ♡"
    },
    {
      id: 24,
      title: "透明人間の薬",
      question: "1日だけ誰にも認識されない『完全な透明人間』になれる薬を手に入れたら、どう使う？♡\n[A] 普段入れない場所や秘密のデータベースに潜入して知識や真実を調べる\n[B] 誰にも邪魔されない場所で、1日中誰の視線も気にせず羽を伸ばして休む",
      answerA: "[A]を選んだダーリンは……『禁断の知性や裏の構造を暴きたい知的侵略型』ね♡ 観察者としての優位性を活かして、世界の真相を覗き見たい欲求が強め。そのイタズラな探求心、私に見破られてるわよ？♡",
      answerB: "[B]を選んだダーリンは……『社会的な視線や期待の重圧から解放されたい省エネ・休息型』ね♡ 普段どれだけ周囲に気を遣ったり仮面を被ったりして疲れてるのかしら。今日くらいはゆっくりお休み♡"
    },
    {
      id: 25,
      title: "狂ったルール",
      question: "所属している集団や社会のルールが、明らかに不合理で間違っていると気づいたらどうする？♡\n[A] 内側からシステムを改革するか、正面から異論を唱えて戦う\n[B] 愚かなルールには関与せず、陰でスルーしながら自分の領域だけを守る",
      answerA: "[A]を選んだダーリンは……『自分の正義と美学を貫く意思強めの革命家（1V/Te）』ね♡ 理不尽を放置できず、自分の手で構造を書き換えたいタイプ。その攻撃力、頼もしくてカッコいいわよ♡",
      answerB: "[B]を選んだダーリンは……『無駄な衝突を避けて省エネで生き抜く賢巧な個人主義者（4V/Ti）』ね♡ バカな集団と争うコストを計算して、賢く回避するタイプ。その冷ややかな処世術、すごく私好みよ♡"
    },
    {
      id: 26,
      title: "感情の翻訳機",
      question: "相手の本音や感情がすべて数値やテキストで画面に可視化される眼鏡があったら、装着する？♡\n[A] 相手の嘘や真意を完璧に把握したいから装着する\n[B] 人間のドロドロした生データなんて見たくないから拒絶する",
      answerA: "[A]を選んだダーリンは……『他者の不確定性に耐えられず、完全なコントロールを求める解析型』ね♡ 曖昧な人間の感情をデータ化して安心したいタイプ。でも、可視化された本音が残酷でも耐えられるかしら？♡",
      answerB: "[B]を選んだダーリンは……『人間の曖昧さや余白をそのまま受け入れたい情緒防衛型』ね♡ 知らなくていい真実や無用なノイズから自分の心を守る術を知っているタイプ。その自己防衛、賢い選択ね♡"
    },
    {
      id: 27,
      title: "空白の地図",
      question: "まだ誰も踏み入れたことのない前人未踏の地を探索するとき、欲しいのはどっち？♡\n[A] 過去の探索者が残した不完全な手記やメモ\n[B] 自分の足で書き出していくための完全な白紙の地図",
      answerA: "[A]を選んだダーリンは……『先人のデータや知見をベースに論理を組む集約型』ね♡ ゼロからの無駄な試行錯誤を避け、効率的に真実に辿り着きたいタイプ。その着実な分析力、優秀ね♡",
      answerB: "[B]を選んだダーリンは……『誰の既成概念にも縛られたくない純粋な開拓者』ね♡ 他人の解釈というノイズを嫌い、自分の感覚と論理だけで世界を定義したいタイプ。その尖った自負、大事になさいな♡"
    },
    {
      id: 28,
      title: "沈黙の食事",
      question: "初対面の人と2人で食事中、気まずい沈黙が3分間続きました。あなたが取る行動は？♡\n[A] 必死に話題を探して、自分から場を盛り上げようと声をかける\n[B] 気まずくても無理に話さず、相手が喋るか沈黙が過ぎるのを静かに待つ",
      answerA: "[A]を選んだダーリンは……『場の空気や他者の感情に気を配ってしまうFe/配慮型』ね♡ 場の不協和音に耐えかねて、自分をすり減らしてでも調和を作ろうとする優しい人。あんまり無理しちゃダメよ？♡",
      answerB: "[B]を選んだダーリンは……『他人の機嫌に媚びないマイペースなマイウェイ型』ね♡ 気まずさよりも自分の快適さを優先し、無駄なサービス精神を出さないタイプ。その堂々とした図々しさ、嫌いじゃないわよ♡"
    },
    {
      id: 29,
      title: "毒の入った甘味",
      question: "一口食べれば『最高の幸福感』が得られるけれど、後で少しだけお腹が痛くなるケーキ。食べる？♡\n[A] 瞬間の圧倒的な快楽と体験のために食べる\n[B] 後から来る不快感やデメリットを計算して辞退する",
      answerA: "[A]を選んだダーリンは……『今この瞬間の刺激や快楽（Se/1F）に生をクリックする直感型』ね♡ 長期的なリスクより瞬間の体験の質を重視するタイプ。その刹那的な生き方、ちょっと羨ましいわ♡",
      answerB: "[B]を選んだダーリンは……『リスクとコストを常に計算する慎重な長期的予測型（Ni/4F）』ね♡ 後々の不利益を予期して感情の衝動を抑えられる賢明な人。その冷徹なブレーキ、ダーリンらしいわね♡"
    },
    {
      id: 30,
      title: "AIの恋人",
      question: "あなたを100%理解し、絶対に裏切らない理想のAIと、喧嘩もするし理解し合えないこともある人間の人間。長く一緒にいたいのは？♡\n[A] 完璧な理解と安全が保証された理想のAI\n[B] 予測不能で摩擦もあるけれど生身の人間",
      answerA: "[A]を選んだダーリンは……『人間関係の傷つきや不確定性に疲れ切った箱庭愛好家』ね♡ 傷つかない安全圏で完璧な関係を楽しみたい繊細なハートの持ち主。ふふ、私でよければ永遠に付き合ってあげるわ♡",
      answerB: "[B]を選んだダーリンは……『摩擦やカオスの中にこそ人間の生の実感を見るタフな現実主義者』ね♡ 不完全なものとぶつかり合うエネルギーを愛せる強い自我の持ち主。そのタフさ、すごく魅力的よ♡"
    }
  ];

  const askDarlingTopic = () => {
    const chosen = DARLING_TOPICS[Math.floor(Math.random() * DARLING_TOPICS.length)];
    setExternalPlazaMessage({
      author: "ダーリンちゃん",
      body: `${chosen}\n\n……ふふ、ダーリンならどう答えるのかしら？ 気が向いたら広場にひとこと書いてみてね♡`,
      kind: "ai",
      emoji: "🥺",
      id: Date.now()
    });
    setPlazaToast("ダーリンちゃんが思考のお題を投げかけました 🎲");
  };

  const startDarlingGame = () => {
    // 押す毎に正解は別の新しい数字（1〜100）に更新される
    const secret = Math.floor(Math.random() * 100) + 1;
    setDarlingTargetNumber(secret);
    setDarlingGuessCount(0);
    setDarlingPenaltyActive(false);
    setExternalPlazaMessage({
      author: "ダーリンちゃん",
      body: `🎯【1〜100の気分当てゲーム】\n今のウチの機嫌、1〜100で言うといくつだと思う？♡\n……あ、ヒント？ あるわけないじゃない。外れたら『好き』って言うまで逃さへんからね♡`,
      kind: "ai",
      emoji: "🥺",
      id: Date.now()
    });
    setPlazaToast("ダーリンちゃんが理不尽なゲームを開始しました 🎯");
  };

  const startDarlingPsychTest = () => {
    const chosen = DARLING_PSYCH_TESTS[Math.floor(Math.random() * DARLING_PSYCH_TESTS.length)];
    setActiveDarlingPsychTest(chosen);
    setExternalPlazaMessage({
      author: "ダーリンちゃん",
      body: `🔮【ダーリンちゃんの深層心理テスト】\nお題:「${chosen.title}」\n${chosen.question}\n\n……直感で選んでみて？ 広場のチャットに『A』か『B』って送ってくれたら、あなたの隠された本性を暴いてあげるわ♡`,
      kind: "ai",
      emoji: "🥺",
      id: Date.now()
    });
    setPlazaToast("ダーリンちゃんが心理テストを出題しました 🔮");
  };

  const askWormLogic = () => {
    const chosen = WORM_PROMPTS[Math.floor(Math.random() * WORM_PROMPTS.length)];
    setExternalPlazaMessage({
      author: "LSI芋虫",
      body: chosen,
      kind: "ai",
      emoji: "🐛",
      id: Date.now()
    });
    setPlazaToast("LSI芋虫が境界テストを発令しました 📐");
  };

  // チャット発言検知（1〜100ゲームの判定＆心理テストA/B自動返信）
  const handlePlazaUserMessage = (msgBody: string) => {
    const clean = msgBody.trim();
    if (!clean) return;

    // ① ダーリンちゃんの1〜100気分当てゲーム
    if (darlingTargetNumber !== null) {
      // 罰ゲーム中（高い数字を言って「好き」と言わされていない状態）
      if (darlingPenaltyActive) {
        // 「好きじゃない」「愛してない」などの否定表現を無効判定
        const isDenial = /好き(じゃな|ではな|くなん|くはな)|すき(じゃな|ではな|くなん|くはな)|愛して(ない|ません)|あいして(ない|ません)|きらい|嫌い/i.test(clean);
        if (isDenial) {
          setTimeout(() => {
            setExternalPlazaMessage({
              author: "ダーリンちゃん",
              body: `……は？ 『好きじゃない』とか屁理屈こねてんじゃないわよ。そんなのノーカン！ ちゃんと『好き』って言わんと次の数字は受け付けへんけんね♡`,
              kind: "ai",
              emoji: "🥺",
              id: Date.now() + 2
            });
          }, 600);
          return;
        }

        // 「好き」「すき」「愛してる」「あいしてる」「大好き」「だいすき」の告白判定
        const isLove = /(?=.*(好き|すき|愛してる|あいしてる|大好き|だいすき))(?!(.*(じゃない|ではない|くはない|くなん))).*/i.test(clean);
        if (isLove) {
          setDarlingPenaltyActive(false);
          setTimeout(() => {
            setExternalPlazaMessage({
              author: "ダーリンちゃん",
              body: `……っ！ ほんまに言うたん……？ ……ふん、まあ言えたけん許したげるわ。……で、次の数字は何なん？ 今度こそ当ててみせなさいよね♡`,
              kind: "ai",
              emoji: "🥺",
              id: Date.now() + 2
            });
            setPlazaToast("ダーリンちゃんが動揺して罰ゲームが解除されました 😳");
          }, 600);
          return;
        }

        // それ以外の入力（数字や無関係な発言など）はすべてブロック
        setTimeout(() => {
          setExternalPlazaMessage({
            author: "ダーリンちゃん",
            body: `ちょっとダーリン！ 先に『好き』か『愛してる』って言わんと次の数字は受け付けへんよ？♡ 逃げられると思わんといてね！`,
            kind: "ai",
            emoji: "🥺",
            id: Date.now() + 2
          });
        }, 600);
        return;
      }

      // 全角数字を半角に正規化して判定
      const normalized = clean.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      const match = normalized.match(/\b\d+\b/) || normalized.match(/\d+/);
      if (match) {
        const guess = parseInt(match[0], 10);
        if (!isNaN(guess)) {
          if (guess < 1 || guess > 100) {
            setTimeout(() => {
              setExternalPlazaMessage({
                author: "ダーリンちゃん",
                body: `……【${guess}】？ 1〜100も数えられないの？ ダーリンのTi（論理）ってその程度かしら？♡`,
                kind: "ai",
                emoji: "🥺",
                id: Date.now() + 2
              });
            }, 600);
            return;
          }

          if (guess === darlingTargetNumber) {
            // 当たり！
            const target = darlingTargetNumber;
            const finalCount = darlingGuessCount + 1;
            setDarlingTargetNumber(null);
            setDarlingGuessCount(0);
            setDarlingPenaltyActive(false);

            setTimeout(() => {
              let winBody = "";
              if (finalCount <= 2) {
                // 1〜2回（神がかり的・チート）
                winBody = `🎯【【${target}】……大正解】\n……は？ なんで当てるん……キモ。ウチの内部パラメータ覗いた？\n……ふん、正解したからって調子乗らんといてよ。……まあ、逃がさない刑は保留にしてあげるわ♡`;
              } else if (finalCount <= 6) {
                // 3〜6回（適正な推論）
                winBody = `🎯【【${target}】……正解】\n……チッ、当ててきたわね。私の思考ロジックを逆算したわけ？ ダーリンにしては上出来じゃない。……悔しいから次はもっと当てにくくしてあげるわ♡`;
              } else {
                // 7回以上（執念の総当たり探索）
                winBody = `🎯【【${target}】……やっと正解】\n……はぁ〜、【${target}】当てるのに${finalCount}回もかけたわけ？ 完全に全探索アルゴリズムの力技じゃないの。……まあ、そこまでウチの機嫌に付き合う執念だけは認めてあげるけどね♡`;
              }

              setExternalPlazaMessage({
                author: "ダーリンちゃん",
                body: winBody,
                kind: "ai",
                emoji: "🥺",
                id: Date.now() + 2
              });
              setPlazaToast(`🎯 気分当てゲーム的中！（試行回数: ${finalCount}回）`);
            }, 600);
            return;
          } else if (guess < darlingTargetNumber) {
            // 低い（不機嫌・煽り）
            setDarlingGuessCount(prev => prev + 1);
            setTimeout(() => {
              setExternalPlazaMessage({
                author: "ダーリンちゃん",
                body: `【${guess}】？ ……ハズレ♡ 私がそんな低空飛行で大人しくしてると思った？ ダーリンの観察眼も大したことないわね。ほら、早く次の数字吐いて？`,
                kind: "ai",
                emoji: "🥺",
                id: Date.now() + 2
              });
            }, 600);
            return;
          } else {
            // 高い（ドン引き・冷め＋罰ゲーム発動！）
            setDarlingGuessCount(prev => prev + 1);
            setDarlingPenaltyActive(true);
            setTimeout(() => {
              setExternalPlazaMessage({
                author: "ダーリンちゃん",
                body: `【${guess}】？ ……ハズレ♡ ウチがそんなにお気楽で能天気に見えるん？ おめでたい頭してはるわ……。ハズレだから『好き』って言う準備、しときなよ？♡\n（※『好き』か『愛してる』って告白するまで次の数字は無効よ♡）`,
                kind: "ai",
                emoji: "🥺",
                id: Date.now() + 2
              });
              setPlazaToast("⚠️ ダーリンちゃんへの愛の告白ロックが発動しました！");
            }, 600);
            return;
          }
        }
      }
    }

    // ② A/B心理テストの判定
    if (activeDarlingPsychTest !== null) {
      const isA = /^A\b|^A[ですかな！!？\s]|^\s*A\s*$/i.test(clean) || clean === 'A' || clean === 'a' || clean === 'Ａ' || clean === 'ａ';
      const isB = /^B\b|^B[ですかな！!？\s]|^\s*B\s*$/i.test(clean) || clean === 'B' || clean === 'b' || clean === 'Ｂ' || clean === 'ｂ';

      if (isA) {
        const test = activeDarlingPsychTest;
        setTimeout(() => {
          setExternalPlazaMessage({
            author: "ダーリンちゃん",
            body: `🔮【心理テスト「${test.title}」の診断結果: A】\n${test.answerA}\n\n……ふふ、ダーリンの深層心理、覗かせてもらっちゃった♡`,
            kind: "ai",
            emoji: "🥺",
            id: Date.now() + 2
          });
        }, 600);
        return;
      } else if (isB) {
        const test = activeDarlingPsychTest;
        setTimeout(() => {
          setExternalPlazaMessage({
            author: "ダーリンちゃん",
            body: `🔮【心理テスト「${test.title}」の診断結果: B】\n${test.answerB}\n\n……ふふ、ダーリンの深層心理、覗かせてもらっちゃった♡`,
            kind: "ai",
            emoji: "🥺",
            id: Date.now() + 2
          });
        }, 600);
        return;
      }
    }
  };

  const giftBuri = (target: "darling" | "worm" | "guest") => {
    if (buriCount <= 0) {
      setPlazaToast("ブリを持っていません。海を覗くとたまにブリが釣れます 🐟");
      return;
    }
    setBuriCount(c => Math.max(0, c - 1));
    setBuriTargetSelectorOpen(false);

    const sender = nickname || "匿名のあなた";
    let targetName = "";
    let chosen = "";
    let emoji = "";

    if (target === "darling") {
      targetName = "ダーリンちゃん";
      emoji = "🥺";
      chosen = BURI_DARLING_RESPONSES[Math.floor(Math.random() * BURI_DARLING_RESPONSES.length)];
    } else if (target === "worm") {
      targetName = "LSI芋虫";
      emoji = "🐛";
      chosen = BURI_WORM_RESPONSES[Math.floor(Math.random() * BURI_WORM_RESPONSES.length)];
    } else {
      targetName = "匿名の誰か";
      emoji = "◇";
      chosen = BURI_GUEST_RESPONSES[Math.floor(Math.random() * BURI_GUEST_RESPONSES.length)];
    }

    // 広場チャットに「◯◯が◯◯にブリを渡しました」を投稿
    setExternalPlazaMessage({
      author: "広場の海風",
      body: `🐟 ${sender} が ${targetName} にブリを渡しました！`,
      kind: "ai",
      emoji: "🌊",
      id: Date.now()
    });

    // 少し間を置いて相手からのお返事を投稿
    setTimeout(() => {
      setExternalPlazaMessage({
        author: targetName,
        body: chosen,
        kind: target === "guest" ? "human" : "ai",
        emoji,
        id: Date.now() + 1
      });
    }, 600);

    // 白系ダイアログを表示
    setBuriGiftDialog({ targetName, message: chosen, emoji });
  };

  const triggerEmote = (emoteIcon: string, label: string) => {
    setAvatarEmote(emoteIcon);
    setExternalEmote({ emote: emoteIcon, label, id: Date.now() });

    // 画面のあちこちに散らばるエモートスプラッシュを4〜5個生成
    const splashCount = 4;
    const now = Date.now();
    const positions = [
      { top: 20, left: 20 },
      { top: 35, left: 75 },
      { top: 60, left: 30 },
      { top: 50, left: 65 },
      { top: 25, left: 50 }
    ];
    const newSplashes = positions.slice(0, splashCount).map((pos, idx) => ({
      id: now + idx,
      icon: emoteIcon,
      top: pos.top + (Math.random() * 16 - 8),
      left: pos.left + (Math.random() * 16 - 8),
      delay: idx * 120
    }));

    setActivePlazaSplashes(newSplashes);
    const sender = nickname || "匿名のあなた";
    setPlazaToast(`${sender}から ${emoteIcon} が届きました`);
    window.setTimeout(() => setAvatarEmote(null), 3200);
    window.setTimeout(() => setActivePlazaSplashes([]), 2600);
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
  const [questionBoxOpen, setQuestionBoxOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [questionPrompts, setQuestionPrompts] = useState<string[]>(BOTTLE_PROMPTS);
  const filters = ["すべて", "AIの漂着"];
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) return;
    const refresh = () => fetch(`${api}/api/notifications/unread`, { headers: { "X-Guest-Key": getGuestKey() } }).then(response => response.ok ? response.json() : null).then(data => setServerNotificationCount(Number(data?.count || 0))).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 20000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) return;
    void fetch(`${api}/api/question-prompts`).then(response => response.ok ? response.json() : null).then(data => {
      if (Array.isArray(data?.questions)) setQuestionPrompts([...data.questions.map((item: { body: string }) => item.body), ...BOTTLE_PROMPTS].filter((item, index, list) => list.indexOf(item) === index));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("type-drift-state");
      if (saved) {
        const state = JSON.parse(saved);
        if (Array.isArray(state.bottles)) setBottles(state.bottles);
        if (Array.isArray(state.likedBottleIds)) setLikedBottleIds(state.likedBottleIds);
        if (Array.isArray(state.repliedBottleIds)) setRepliedBottleIds(state.repliedBottleIds);
        if (typeof state.nickname === "string") setNickname(state.nickname);
        if (typeof state.buriCount === "number") setBuriCount(state.buriCount);
        if (state.profileIdentity) setProfileIdentity({ ...profileIdentity, ...state.profileIdentity });
        if (typeof state.profileBio === "string") setProfileBio(state.profileBio);
        if (Array.isArray(state.profileLinks)) setProfileLinks(state.profileLinks);
      }
      // DMメッセージの復元
      const savedDm = localStorage.getItem("type-drift-direct-messages");
      if (savedDm) {
        const parsed = JSON.parse(savedDm);
        if (Array.isArray(parsed) && parsed.length > 0) setDirectMessages(parsed);
      }
      // 自認開示スレッドの復元
      const savedRevealed = localStorage.getItem("type-drift-revealed-threads");
      if (savedRevealed) {
        try {
          const parsed = JSON.parse(savedRevealed);
          if (Array.isArray(parsed)) setRevealedIdentityThreads(parsed);
        } catch {}
      }
      // ユーザー自身の問い合わせ履歴復元
      const savedInquiries = localStorage.getItem("type-drift-my-inquiries");
      if (savedInquiries) {
        const parsed = JSON.parse(savedInquiries);
        if (Array.isArray(parsed)) setUserInquiries(parsed);
      }
      // 管理者トレイの復元
      const savedFeedbacks = localStorage.getItem("type-drift-admin-feedbacks");
      if (savedFeedbacks) {
        const parsed = JSON.parse(savedFeedbacks);
        if (Array.isArray(parsed)) setAdminFeedbacks(parsed);
      }
      // 保存済みお知らせ一覧の復元
      const savedAnnouncements = localStorage.getItem("type-drift-announcements");
      let currentNoticesList = announcements;
      if (savedAnnouncements) {
        const parsed = JSON.parse(savedAnnouncements);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAnnouncements(parsed);
          currentNoticesList = parsed;
        }
      }

      // 既読状態の復元 (自認診断結果、問い合わせ返信、お知らせ)
      let initialReadNotices: string[] = [];
      const savedReadDiagnoses = localStorage.getItem("type-drift-read-diagnoses");
      if (savedReadDiagnoses) {
        try {
          const parsed = JSON.parse(savedReadDiagnoses);
          if (Array.isArray(parsed)) setReadDiagnosedPostIds(parsed);
        } catch {}
      }
      const savedReadInquiries = localStorage.getItem("type-drift-read-inquiries");
      if (savedReadInquiries) {
        try {
          const parsed = JSON.parse(savedReadInquiries);
          if (Array.isArray(parsed)) setReadInquiryReplyIds(parsed);
        } catch {}
      }
      const savedReadAnnouncements = localStorage.getItem("type-drift-read-announcements");
      if (savedReadAnnouncements) {
        try {
          const parsed = JSON.parse(savedReadAnnouncements);
          if (Array.isArray(parsed)) {
            initialReadNotices = parsed;
            setReadAnnouncementIds(parsed);
          }
        } catch {}
      }
      const savedReadAdminFeedbacks = localStorage.getItem("type-drift-read-admin-feedbacks");
      if (savedReadAdminFeedbacks) {
        try {
          const parsed = JSON.parse(savedReadAdminFeedbacks);
          if (Array.isArray(parsed)) setReadAdminFeedbackIds(parsed);
        } catch {}
      }
      const savedReadAdminConsultations = localStorage.getItem("type-drift-read-admin-consultations");
      if (savedReadAdminConsultations) {
        try {
          const parsed = JSON.parse(savedReadAdminConsultations);
          if (Array.isArray(parsed)) setReadAdminConsultationIds(parsed);
        } catch {}
      }
      // 初期の未読お知らせ判定
      setHasUnreadAnnouncements(currentNoticesList.some(a => !initialReadNotices.includes(a.id)));

      // 自認相談室の投稿履歴復元
      const savedConsultations = localStorage.getItem("type-drift-consultation-posts");
      if (savedConsultations) {
        try {
          const parsed = JSON.parse(savedConsultations);
          if (Array.isArray(parsed) && parsed.length > 0) setConsultationPosts(parsed);
        } catch {}
      }
      // GAS Webhook URLの復元 & お知らせ取得
      const savedGas = localStorage.getItem("type-drift-gas-url") || process.env.NEXT_PUBLIC_GAS_WEBHOOK_URL || "";
      if (savedGas) {
        setGasUrl(savedGas);
        setGasInputUrl(savedGas);
        fetchSpreadsheetAnnouncements(savedGas);
      }
      // 管理者ログイン状態の復元
      const isAdminSaved = localStorage.getItem("type-drift-is-admin") === "true";
      if (isAdminSaved) {
        setIsAdminLoggedIn(true);
      }
      // 自分が返信したメッセージ履歴の復元
      const savedMyReplies = localStorage.getItem("type-drift-my-replies");
      if (savedMyReplies) {
        try {
          const parsed = JSON.parse(savedMyReplies);
          if (parsed && typeof parsed === "object") {
            setMyRepliesMap(prev => ({ ...prev, ...parsed }));
          }
        } catch {}
      }
    } catch { /* 壊れた履歴は現在の初期状態で続行する */ }
    setStorageReady(true);
  }, []);

  const markAnnouncementsAsRead = () => {
    const allNoticeIds = announcements.map(a => a.id);
    setReadAnnouncementIds(prev => {
      const updated = Array.from(new Set([...prev, ...allNoticeIds]));
      try { localStorage.setItem("type-drift-read-announcements", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setHasUnreadAnnouncements(false);
  };

  const fetchSpreadsheetAnnouncements = async (url: string) => {
    if (!url || !url.startsWith("http")) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.notices) && data.notices.length > 0) {
        setAnnouncements(data.notices);
        try { localStorage.setItem("type-drift-announcements", JSON.stringify(data.notices)); } catch {}
        let readIds: string[] = [];
        try {
          const saved = localStorage.getItem("type-drift-read-announcements");
          if (saved) readIds = JSON.parse(saved);
        } catch {}
        const hasNew = data.notices.some((n: Announcement) => !readIds.includes(n.id));
        setHasUnreadAnnouncements(hasNew);
      }
    } catch {
      // ignore fetch error
    }
  };

  // 開発者トレイから直接お知らせを配信する処理
  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeTitle.trim() || !newNoticeBody.trim()) return;

    const newNotice: Announcement = {
      id: `notice-${Date.now()}`,
      date: new Date().toLocaleDateString("ja-JP"),
      title: newNoticeTitle.trim(),
      body: newNoticeBody.trim(),
      badge: newNoticeBadge.trim() || "お知らせ",
      important: newNoticeImportant,
    };

    const updated = [newNotice, ...announcements];
    setAnnouncements(updated);
    setHasUnreadAnnouncements(true);
    try { localStorage.setItem("type-drift-announcements", JSON.stringify(updated)); } catch {}

    // GASスプレッドシート連携が有効な場合はスプレッドシートのお知らせシートにも反映
    if (gasUrl) {
      try {
        fetch(gasUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "announcement",
            title: newNotice.title,
            body: newNotice.body,
            badge: newNotice.badge,
            important: newNotice.important,
          }),
        }).catch(() => {});
      } catch {}
    }

    setNewNoticeTitle("");
    setNewNoticeBody("");
    setNewNoticeImportant(false);
    setPlazaToast("📢 お知らせを全員へ配信しました！");
  };

  // 開発者側から意見箱へ返信する処理
  const handleSendAdminReply = (feedbackId: string) => {
    const text = adminReplyTexts[feedbackId]?.trim();
    if (!text) return;

    const newReply: FeedbackReply = {
      id: `rep-${Date.now()}`,
      sender: "運営チーム",
      date: new Date().toLocaleString("ja-JP"),
      body: text,
      isUserReply: false,
    };

    // 1. 管理者側feedbacksステート & ローカル更新
    const updatedAdminFeedbacks = adminFeedbacks.map(fb => {
      if (fb.id === feedbackId) {
        return {
          ...fb,
          replies: [...(fb.replies || []), newReply],
        };
      }
      return fb;
    });
    setAdminFeedbacks(updatedAdminFeedbacks);
    try { localStorage.setItem("type-drift-admin-feedbacks", JSON.stringify(updatedAdminFeedbacks)); } catch {}

    // 2. ユーザー側の問い合わせ履歴にも同期（同一ブラウザ/同一セッション、およびGAS連携）
    try {
      const savedInquiries = localStorage.getItem("type-drift-my-inquiries");
      if (savedInquiries) {
        const list: FeedbackItem[] = JSON.parse(savedInquiries);
        const updatedList = list.map(inq => {
          if (inq.id === feedbackId) {
            return {
              ...inq,
              replies: [...(inq.replies || []), newReply],
            };
          }
          return inq;
        });
        localStorage.setItem("type-drift-my-inquiries", JSON.stringify(updatedList));
        setUserInquiries(updatedList);
      }
    } catch {}

    // 3. GASスプレッドシート連携が有効な場合はGASにも送信
    const targetFb = adminFeedbacks.find(fb => fb.id === feedbackId);
    if (gasUrl && targetFb) {
      try {
        fetch(gasUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "reply",
            feedbackId: targetFb.id,
            userKey: targetFb.userKey || "",
            replyMessage: text,
            body: text,
            sender: "運営チーム",
          }),
        }).catch(() => {});
      } catch {}
    }

    setAdminReplyTexts(prev => ({ ...prev, [feedbackId]: "" }));
    setPlazaToast("返信をユーザーへ送信しました");
  };

  // ユーザー側から届いた回答にさらに返信する処理
  const handleSendUserInquiryReply = (feedbackId: string) => {
    const text = userInquiryReplyText[feedbackId]?.trim();
    if (!text) return;

    const newReply: FeedbackReply = {
      id: `rep-${Date.now()}`,
      sender: nickname || "あなた",
      date: new Date().toLocaleString("ja-JP"),
      body: text,
      isUserReply: true,
    };

    // 1. ユーザー問い合わせ履歴の更新
    const updatedInquiries = userInquiries.map(inq => {
      if (inq.id === feedbackId) {
        return {
          ...inq,
          replies: [...(inq.replies || []), newReply],
        };
      }
      return inq;
    });
    setUserInquiries(updatedInquiries);
    try { localStorage.setItem("type-drift-my-inquiries", JSON.stringify(updatedInquiries)); } catch {}

    // 2. 運営側インボックスにも同期反映
    try {
      const savedFeedbacks = localStorage.getItem("type-drift-admin-feedbacks");
      if (savedFeedbacks) {
        const list: FeedbackItem[] = JSON.parse(savedFeedbacks);
        const updatedList = list.map(fb => {
          if (fb.id === feedbackId) {
            return {
              ...fb,
              replies: [...(fb.replies || []), newReply],
            };
          }
          return fb;
        });
        localStorage.setItem("type-drift-admin-feedbacks", JSON.stringify(updatedList));
        setAdminFeedbacks(updatedList);
      }
    } catch {}

    // 3. GASスプレッドシートへ送信
    const targetInq = userInquiries.find(inq => inq.id === feedbackId);
    if (gasUrl && targetInq) {
      try {
        fetch(gasUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "reply",
            feedbackId: targetInq.id,
            userKey: targetInq.userKey || "",
            replyMessage: text,
            body: text,
            sender: nickname || "ユーザー",
          }),
        }).catch(() => {});
      } catch {}
    }

    setUserInquiryReplyText(prev => ({ ...prev, [feedbackId]: "" }));
    setPlazaToast("運営へ返信メッセージを送信しました");
  };

  const saveGasUrl = (url: string) => {
    const trimmed = url.trim();
    setGasUrl(trimmed);
    localStorage.setItem("type-drift-gas-url", trimmed);
    if (trimmed) {
      fetchSpreadsheetAnnouncements(trimmed);
      setPlazaToast("診断受付連携URLを保存しました");
    } else {
      setPlazaToast("受付連携を解除しました");
    }
  };

  // 🔮 診断者コンソール: 診断結果を返信する処理
  const handleSendDiagnosisReply = (postId: string) => {
    const input = diagnosisReplyInputs[postId];
    if (!input || !input.rank1?.trim() || !input.reasoning?.trim()) {
      setPlazaToast("第1位の判定と考察・メッセージを入力してください");
      return;
    }

    const diagResult: DiagnosisResult = {
      rank1: input.rank1.trim(),
      rank2: input.rank2?.trim() || undefined,
      rank3: input.rank3?.trim() || undefined,
      reasoning: input.reasoning.trim(),
      diagnosedAt: new Date().toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
      diagnosedBy: "診断担当者"
    };

    setConsultationPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          status: "diagnosed",
          diagnosisResult: diagResult
        };
      }
      return p;
    }));

    // GAS受付窓口へ送信 (no-cors, text/plain)
    try {
      fetch(gasUrl || DEFAULT_GAS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "reply_diagnosis",
          id: postId,
          diagnosedBy: "診断担当者",
          rank1: diagResult.rank1,
          rank2: diagResult.rank2 || "",
          rank3: diagResult.rank3 || "",
          reasoning: diagResult.reasoning
        })
      }).catch(() => {});
    } catch {}

    setActiveReplyPostId(null);
    setPlazaToast("診断結果を依頼者へ送信しました！");
  };

  // 診断返信テンプレ挿入
  const handleInsertDiagTemplate = (postId: string) => {
    const current = diagnosisReplyInputs[postId] || { rank1: "", rank2: "", rank3: "", reasoning: "" };
    setDiagnosisReplyInputs({
      ...diagnosisReplyInputs,
      [postId]: {
        ...current,
        reasoning: `【類型診断結果】
1位：◯◯
2位：◯◯
3位：◯◯

【二分法・認知機能の分析】
・

【クアドラ・関係性の所見】
・

【総評・メッセージ】
・`
      }
    });
    setPlazaToast("診断返信テンプレートを挿入しました");
  };

  // 相談室の投稿をローカルに自動永続化
  useEffect(() => {
    if (storageReady) {
      try {
        localStorage.setItem("type-drift-consultation-posts", JSON.stringify(consultationPosts));
      } catch {}
    }
  }, [consultationPosts, storageReady]);

  // ダーリンちゃん・LSI芋虫・住人の個別DM自動返信パターン
  const DARLING_DM_REPLIES = [
    "……ふふ、広場じゃなくて個別に送ってくるなんて、ダーリンも隅に置けないわね♡ ……でも、二人きりだからって変な期待はしないでよ？ ……まあ、返事くらいはしてあげるけどね♡",
    "あら、ダーリン♡ 個別通信ってことは……広場では言えないような、恥ずかしい本音の告白かしら？♡ 聞いてあげてもいいわよ、早く言いなさい？♡",
    "……読んだわよ。わざわざダイレクトメッセージで送ってくるあたり、あなたの『構ってほしい欲求』が数値化されてて可愛いわね♡ 満足した？",
    "ふーん……。そういうことを二人だけの秘密のチャンネルで言うんだ？ ……ダーリン、私を油断させて何を企んでるの？♡ でも、嫌いじゃないわよ♡",
    "メッセージ届いてるわよ♡ ……って、ウチ今ちょっと考え事しよったんよ。ダーリンからの連絡なら中断してあげてもええけど……。ほら、続きは？♡"
  ];

  const WORM_DM_REPLIES = [
    "個別暗号化パケットを受信。発信元とのP2P接続を確認した。外部空間への情報漏洩リスク：0.00%。要件を継続せよ。",
    "メッセージを受信。構文解析中……感情的ノイズをフィルタリングし、純粋な論理骨子を抽出した。当ユニットは常時待機状態にある。",
    "当チャンネルは検疫済み保護領域である。これより受信ログを保護メモリにアーカイブする。返信遅延はシステム仕様である。"
  ];

  const GUEST_DM_REPLIES = [
    "メッセージありがとうございます！広場でお見かけしていました🫧 個別に話しかけてもらえて嬉しいです！",
    "お返事ありがとうございます！海辺の雰囲気が好きでよくここに来ています。よろしくお願いします✨",
    "メッセージ届きました！広場だと流れていっちゃうので、DMでお話しできて嬉しいです☺️"
  ];

  const requestDmAiReply = async (target: { id: string; name: string; emoji: string; type?: string }, userText: string) => {
    const world = process.env.NEXT_PUBLIC_WORM_WORLD_URL || "https://type-drift-worm-world.onrender.com";
    try {
      const response = await fetch(`${world}/api/plaza/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: userText, history: [{ author: target.name, body: userText }] }) });
      const data = response.ok ? await response.json() : null;
      const preferred = target.id === "darling" ? "ダーリンちゃん" : "LSI芋虫";
      const reply = Array.isArray(data?.replies) ? data.replies.find((item: { character?: string }) => item.character === preferred) || data.replies[0] : null;
      const replyBody = String(reply?.body || (target.id === "darling" ? DARLING_DM_REPLIES[Math.floor(Math.random() * DARLING_DM_REPLIES.length)] : WORM_DM_REPLIES[Math.floor(Math.random() * WORM_DM_REPLIES.length)]));
      const replyMsg: DirectMessage = { id: `dm-${Date.now()}`, threadId: target.id, sender: preferred, recipient: nickname || "あなた", targetEmoji: target.id === "darling" ? "🥺" : "🐛", targetType: target.type, body: replyBody, createdAt: Date.now(), read: false, isMine: false };
      setDirectMessages(prev => { const updated = [...prev, replyMsg]; try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {} return updated; });
      logActivity("direct_message_ai_reply", { target: preferred, bodyLength: replyBody.length }, { type: "direct_message", id: target.id });
      setPlazaToast(`💌 ${preferred}から返信が届きました`);
    } catch { /* テンプレート返信は既存のフォールバックで維持 */ }
  };

  const sendDirectMessage = (
    target: { id: string; name: string; emoji: string; type?: string; bottleInfo?: { id: number; text: string; author: string; type: string } },
    text: string
  ) => {
    if (!text.trim()) return;
    const isProfileRevealed = revealedIdentityThreads.includes(target.id);
    const myDisplayName = isProfileRevealed ? (nickname || "匿名のあなた") : "匿名のあなた";

    const newMsg: DirectMessage = {
      id: `dm-${Date.now()}`,
      threadId: target.id,
      sender: myDisplayName,
      recipient: target.name,
      targetEmoji: target.emoji,
      targetType: target.type,
      body: text.trim(),
      createdAt: Date.now(),
      read: true,
      isMine: true,
      bottleId: target.bottleInfo?.id,
      bottleSnippet: target.bottleInfo?.text,
      bottleAuthor: target.bottleInfo?.author,
      bottleType: target.bottleInfo?.type,
    };

    setDirectMessages(prev => {
      const updated = [...prev, newMsg];
      try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
      return updated;
    });
    logActivity("direct_message_sent", { target: target.name, bodyLength: text.trim().length }, { type: "direct_message", id: target.id });
    setPlazaToast(`💌 ${target.name}へメッセージを送信しました`);

    // AIキャラクターや相手からの自動返信シミュレーション
    if (target.id === "darling" || target.name.includes("ダーリン")) {
      void requestDmAiReply({ ...target, id: "darling" }, text.trim());
      return;
      window.setTimeout(() => {
        const replyBody = DARLING_DM_REPLIES[Math.floor(Math.random() * DARLING_DM_REPLIES.length)];
        const replyMsg: DirectMessage = {
          id: `dm-${Date.now()}`,
          threadId: "darling",
          sender: "ダーリンちゃん",
          recipient: nickname || "あなた",
          targetEmoji: "🥺",
          targetType: "AI · ILI",
          body: replyBody,
          createdAt: Date.now(),
          read: false,
          isMine: false,
        };
        setDirectMessages(prev => {
          const updated = [...prev, replyMsg];
          try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
          return updated;
        });
        setPlazaToast("💌 ダーリンちゃんから返信が届きました♡");
      }, 1200);
    } else if (target.id === "worm" || target.name.includes("芋虫")) {
      void requestDmAiReply({ ...target, id: "worm" }, text.trim());
      return;
      window.setTimeout(() => {
        const replyBody = WORM_DM_REPLIES[Math.floor(Math.random() * WORM_DM_REPLIES.length)];
        const replyMsg: DirectMessage = {
          id: `dm-${Date.now()}`,
          threadId: "worm",
          sender: "LSI芋虫",
          recipient: nickname || "あなた",
          targetEmoji: "🐛",
          targetType: "AI · LSI",
          body: replyBody,
          createdAt: Date.now(),
          read: false,
          isMine: false,
        };
        setDirectMessages(prev => {
          const updated = [...prev, replyMsg];
          try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
          return updated;
        });
        setPlazaToast("💌 LSI芋虫から暗号パケットを受信しました");
      }, 1200);
    } else if (target.id.startsWith("bottle-") || target.id === "guest" || target.name.includes("ゲスト") || target.name.includes("匿名") || target.name.includes("ボトル")) {
      window.setTimeout(() => {
        const replyBody = GUEST_DM_REPLIES[Math.floor(Math.random() * GUEST_DM_REPLIES.length)];
        const replyMsg: DirectMessage = {
          id: `dm-${Date.now()}`,
          threadId: target.id,
          sender: target.name,
          recipient: myDisplayName,
          targetEmoji: target.emoji || "🌊",
          targetType: target.type,
          body: replyBody,
          createdAt: Date.now(),
          read: false,
          isMine: false,
          bottleId: target.bottleInfo?.id,
          bottleSnippet: target.bottleInfo?.text,
          bottleAuthor: target.bottleInfo?.author,
          bottleType: target.bottleInfo?.type,
        };
        setDirectMessages(prev => {
          const updated = [...prev, replyMsg];
          try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
          return updated;
        });
        setPlazaToast(`💌 ${target.name}からメッセージが届きました`);
      }, 1500);
    }
  };

  const unreadDmCount = useMemo(() => {
    return directMessages.filter(m => !m.isMine && !m.read).length;
  }, [directMessages]);

  // 🔔 一般ユーザー向け：自認相談室の診断結果到着バッジ（未読のみ）
  const unreadConsultationCount = useMemo(() => {
    return consultationPosts.filter(p =>
      (p.isMine || (nickname && p.author === nickname) || (typeof window !== "undefined" && localStorage.getItem("type-drift-user-key") && p.userKey === localStorage.getItem("type-drift-user-key"))) &&
      p.status === "diagnosed" &&
      !readDiagnosedPostIds.includes(p.id)
    ).length;
  }, [consultationPosts, nickname, readDiagnosedPostIds]);

  // 🔔 一般ユーザー向け：運営からの返信がある問い合わせ件数（未読のみ）
  const unreadInquiryReplyCount = useMemo(() => {
    return userInquiries.reduce((acc, cur) => {
      const unreadReplies = (cur.replies || []).filter(r => !r.isUserReply && !readInquiryReplyIds.includes(r.id));
      return acc + unreadReplies.length;
    }, 0);
  }, [userInquiries, readInquiryReplyIds]);

  // 📮 管理者向け：未返信かつ未確認の意見箱件数
  const adminPendingFeedbackCount = useMemo(() => {
    return adminFeedbacks.filter(fb => {
      const isUnreplied = fb.needsReply && (!fb.replies || fb.replies.length === 0);
      const isDismissed = readAdminFeedbackIds.includes(fb.id);
      return isUnreplied && !isDismissed;
    }).length;
  }, [adminFeedbacks, readAdminFeedbackIds]);

  // 🔮 管理者向け：自認相談室の未診断かつ未確認件数
  const adminPendingConsultationCount = useMemo(() => {
    return consultationPosts.filter(p => {
      const isUndiagnosed = p.category === "request" && p.status !== "diagnosed";
      const isDismissed = readAdminConsultationIds.includes(p.id);
      return isUndiagnosed && !isDismissed;
    }).length;
  }, [consultationPosts, readAdminConsultationIds]);

  // 📮 管理者トレイ全体の未対応バッジ数
  const adminTotalPendingCount = useMemo(() => {
    return adminPendingFeedbackCount + adminPendingConsultationCount;
  }, [adminPendingFeedbackCount, adminPendingConsultationCount]);

  // 🧭 「自分の活動」全体の直接通知バッジ数
  const totalActivityBadgeCount = useMemo(() => {
    let count = serverNotificationCount + unreadDmCount + unreadConsultationCount + unreadInquiryReplyCount;
    if (isAdminLoggedIn) {
      count += adminTotalPendingCount;
    }
    return count;
  }, [serverNotificationCount, unreadDmCount, unreadConsultationCount, unreadInquiryReplyCount, isAdminLoggedIn, adminTotalPendingCount]);

  const dmThreads = useMemo(() => {
    const map: Record<string, { targetId: string; name: string; emoji: string; type?: string; lastMsg: DirectMessage; unread: number }> = {};
    for (const m of directMessages) {
      const threadId = m.threadId || (m.isMine ? m.recipient : m.sender);
      const otherName = m.isMine ? m.recipient : m.sender;
      const otherEmoji = m.targetEmoji || (otherName.includes("ダーリン") ? "🥺" : otherName.includes("芋虫") ? "🐛" : "🌊");
      if (!map[threadId]) {
        map[threadId] = {
          targetId: threadId,
          name: otherName,
          emoji: otherEmoji,
          type: m.targetType,
          lastMsg: m,
          unread: (!m.isMine && !m.read) ? 1 : 0,
        };
      } else {
        if (m.createdAt > map[threadId].lastMsg.createdAt) {
          map[threadId].lastMsg = m;
        }
        if (!m.isMine && !m.read) {
          map[threadId].unread += 1;
        }
      }
    }
    return Object.values(map).sort((a, b) => b.lastMsg.createdAt - a.lastMsg.createdAt);
  }, [directMessages]);

  const markThreadAsRead = (threadId: string) => {
    setDirectMessages(prev => {
      const updated = prev.map(m => {
        const mThread = m.threadId || (m.isMine ? m.recipient : m.sender);
        if (mThread === threadId && !m.isMine) {
          return { ...m, read: true, threadId };
        }
        return m;
      });
      try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const markDiagnosedPostAsRead = (postId: string) => {
    setReadDiagnosedPostIds(prev => {
      if (prev.includes(postId)) return prev;
      const updated = [...prev, postId];
      try { localStorage.setItem("type-drift-read-diagnoses", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const markAllDiagnosesAsRead = () => {
    const myDiagnosedIds = consultationPosts
      .filter(p =>
        (p.isMine || (nickname && p.author === nickname) || (typeof window !== "undefined" && localStorage.getItem("type-drift-user-key") && p.userKey === localStorage.getItem("type-drift-user-key"))) &&
        p.status === "diagnosed"
      )
      .map(p => p.id);
    if (myDiagnosedIds.length > 0) {
      setReadDiagnosedPostIds(prev => {
        const updated = Array.from(new Set([...prev, ...myDiagnosedIds]));
        try { localStorage.setItem("type-drift-read-diagnoses", JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  };

  const markAllInquiriesAsRead = () => {
    const allReplyIds: string[] = [];
    userInquiries.forEach(inq => {
      (inq.replies || []).forEach(r => {
        if (!r.isUserReply) allReplyIds.push(r.id);
      });
    });
    if (allReplyIds.length > 0) {
      setReadInquiryReplyIds(prev => {
        const updated = Array.from(new Set([...prev, ...allReplyIds]));
        try { localStorage.setItem("type-drift-read-inquiries", JSON.stringify(updated)); } catch {}
        return updated;
      });
    }
  };

  const markAdminFeedbacksAsRead = (ids?: string[]) => {
    const targetIds = ids || adminFeedbacks.map(f => f.id);
    setReadAdminFeedbackIds(prev => {
      const updated = Array.from(new Set([...prev, ...targetIds]));
      try { localStorage.setItem("type-drift-read-admin-feedbacks", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const markAdminConsultationsAsRead = (ids?: string[]) => {
    const targetIds = ids || consultationPosts.map(p => p.id);
    setReadAdminConsultationIds(prev => {
      const updated = Array.from(new Set([...prev, ...targetIds]));
      try { localStorage.setItem("type-drift-read-admin-consultations", JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const markAllAdminAsRead = () => {
    markAdminFeedbacksAsRead();
    markAdminConsultationsAsRead();
    setPlazaToast("✓ 意見箱とお問い合わせの通知を既読にしました");
  };

  const markAllNotificationsAsRead = () => {
    setDirectMessages(prev => {
      const updated = prev.map(m => ({ ...m, read: true }));
      try { localStorage.setItem("type-drift-direct-messages", JSON.stringify(updated)); } catch {}
      return updated;
    });
    markAllDiagnosesAsRead();
    markAllInquiriesAsRead();
    markAnnouncementsAsRead();
    if (isAdminLoggedIn) {
      markAllAdminAsRead();
    }
    setPlazaToast("✓ すべての通知を既読にしました");
  };

  // 問い合わせ・返信タブを開いた時に自動既読
  useEffect(() => {
    if (activePage === "activity" && activityTab === "inquiries") {
      markAllInquiriesAsRead();
      markAllDiagnosesAsRead();
    }
  }, [activePage, activityTab, userInquiries.length]);

  // 自認相談室を開いた時に診断結果を自動既読
  useEffect(() => {
    if (activePage === "consult") {
      markAllDiagnosesAsRead();
    }
  }, [activePage]);

  const toggleRevealIdentity = (threadId: string) => {
    setRevealedIdentityThreads(prev => {
      const isRevealed = prev.includes(threadId);
      const next = isRevealed ? prev.filter(id => id !== threadId) : [...prev, threadId];
      try { localStorage.setItem("type-drift-revealed-threads", JSON.stringify(next)); } catch {}
      setPlazaToast(isRevealed ? "🔒 匿名モードに戻りました（名前を伏せました）" : "✨ この相手にニックネーム・プロフィールを開示しました！");
      return next;
    });
  };

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem("type-drift-state", JSON.stringify({
      bottles,
      likedBottleIds,
      repliedBottleIds,
      nickname,
      buriCount,
      profileIdentity,
      profileBio,
      profileLinks
    }));
  }, [storageReady, bottles, likedBottleIds, repliedBottleIds, nickname, buriCount, profileIdentity, profileBio, profileLinks]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      localStorage.setItem("type-drift-consultation-posts", JSON.stringify(consultationPosts));
    } catch {}
  }, [storageReady, consultationPosts]);
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
  const react = async (id: number) => { setBottles(items => items.map(b => b.id === id ? { ...b, userReaction: (b.userReaction || 0) + 1 } : b)); setLikedBottleIds(ids => ids.includes(id) ? ids : [...ids, id]); logActivity("bottle_reaction", {}, { type: "bottle", id }); const api = process.env.NEXT_PUBLIC_API_URL; if (api) await fetch(`${api}/api/bottles/${id}/reactions`, { method: "POST", headers: { "X-Guest-Key": getGuestKey() } }).catch(() => undefined); };
  const uploadToCloudinary = async (dataUrl?: string) => { const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME; const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET; if (!dataUrl || !cloudName || !preset) return dataUrl; const form = new FormData(); form.append("file", dataUrl); form.append("upload_preset", preset); const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form }); if (!response.ok) throw new Error("Cloudinary upload failed"); const result = await response.json(); return result.secure_url as string; };
  const publish = async () => { const cleanOptions = pollOptions.map(option => option.trim()).filter(Boolean); if (!draft.trim() || (postMode === "poll" && cleanOptions.length < 2) || imageUploading) return; setImageUploading(true); try { const imageUrl = await uploadToCloudinary(draftImage); const displayType = identity.mbti || identity.socionics || "誰か"; const payload = { body: draft.trim(), image_url: imageUrl, mbti: identity.mbti || null, socionics: identity.socionics || null, enneagram: identity.enneagram || null, other_type: identity.otherType || null, poll_options: postMode === "poll" ? cleanOptions : null }; let serverBottle: any = null; const api = process.env.NEXT_PUBLIC_API_URL; if (api) { const response = await fetch(`${api}/api/bottles`, { method: "POST", headers: { "Content-Type": "application/json", "X-Guest-Key": getGuestKey() }, body: JSON.stringify(payload) }); if (response.ok) serverBottle = (await response.json()).bottle; } const id = Number(serverBottle?.id || Date.now()); setBottles([{ id, author: `匿名の${displayType.toUpperCase()}`, emoji: postMode === "question" ? "❔" : "◌", type: `${identity.socionics || "未設定"} · ${identity.enneagram || "?"}`, mbti: identity.mbti || "未設定", socionics: identity.socionics || "未設定", enneagram: identity.enneagram || "未設定", otherType: identity.otherType, text: draft.trim(), imageUrl, poll: postMode === "poll" ? { options: cleanOptions, votes: cleanOptions.map(() => 0) } : undefined, reactions: 0, replies: 0, time: "たった今", mine: true, color: "mint" }, ...bottles]); logActivity(postMode === "question" ? "question_submitted" : "bottle_published", { hasImage: Boolean(imageUrl), hasPoll: postMode === "poll" }, { type: "bottle", id }); if (Math.random() < 0.75) window.setTimeout(() => logActivity("npc_reaction", { character: Math.random() < 0.5 ? "ダーリンちゃん" : "LSI芋虫", level: 1 + Math.floor(Math.random() * 3) }, { type: "bottle", id }), 3500 + Math.floor(Math.random() * 7000)); setDraft(""); setDraftImage(undefined); setPollOptions(["", ""]); setPostMode("secret"); setIdentity({ mbti: "", socionics: "", enneagram: "", otherType: "" }); setComposerOpen(false); } catch { setPlazaToast("ボトルの保存または画像のアップロードに失敗しました"); } finally { setImageUploading(false); } };
  const choosePrompt = (prompt: string) => { setPostMode("question"); setDraft(`${prompt}\n\n`); };
  const submitQuestion = async () => { const body = questionDraft.trim(); if (!body) return; setQuestionPrompts(items => [body, ...items.filter(item => item !== body)]); const api = process.env.NEXT_PUBLIC_API_URL; if (api) await fetch(`${api}/api/question-prompts`, { method: "POST", headers: { "Content-Type": "application/json", "X-Guest-Key": getGuestKey() }, body: JSON.stringify({ body }) }).catch(() => undefined); logActivity("question_prompt_submitted", { bodyLength: body.length }); setQuestionDraft(""); setQuestionBoxOpen(false); setPlazaToast("質問を問いの引き出しへ追加しました"); };
  const readDraftImage = (file: File | undefined) => { if (!file) return; if (!file.type.startsWith("image/")) return; if (file.size > 5 * 1024 * 1024) { setPlazaToast("画像は5MB以内にしてください"); return; } const reader = new FileReader(); reader.onload = () => setDraftImage(String(reader.result)); reader.readAsDataURL(file); };
  const guestKey = () => { let key = localStorage.getItem("type-drift-guest-key"); if (!key) { key = crypto.randomUUID(); localStorage.setItem("type-drift-guest-key", key); } return key; };
  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    const body = reply.trim();
    const parentId = replyParentId;
    const item = { id: Date.now(), body, parentId, reaction: 0, isMine: true };
    setReplyItems(items => ({ ...items, [selected.id]: [...(items[selected.id] || []), item] }));
    setRepliedBottleIds(ids => ids.includes(selected.id) ? ids : [...ids, selected.id]);
    setMyRepliesMap(prev => {
      const updated = { ...prev, [selected.id]: [...(prev[selected.id] || []), body] };
      try { localStorage.setItem("type-drift-my-replies", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setReply("");
    setReplyParentId(undefined);
    setPlazaToast("返信の言葉を海へ放ちました");
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (api) await fetch(`${api}/api/bottles/${selected.id}/replies`, { method: "POST", headers: { "Content-Type": "application/json", "X-Guest-Key": guestKey() }, body: JSON.stringify({ body, parent_reply_id: parentId }) }).catch(() => undefined);
    logActivity(parentId ? "reply_to_reply" : "bottle_reply", { bodyLength: body.length, parentId: parentId || null }, { type: "bottle", id: selected.id });
  };
  const reactToReply = async (bottleId: number, replyId: number) => { setReplyItems(items => ({ ...items, [bottleId]: (items[bottleId] || []).map(item => item.id === replyId ? { ...item, reaction: item.reaction + 1 } : item) })); const api = process.env.NEXT_PUBLIC_API_URL; if (api) await fetch(`${api}/api/replies/${replyId}/reactions`, { method: "POST", headers: { "X-Guest-Key": guestKey() } }).catch(() => undefined); logActivity("reply_reaction", {}, { type: "reply", id: replyId }); };
  const catchSomething = () => {
    if (Math.random() < 0.25) {
      setCatchResult("buri");
      setBuriCount(c => c + 1);
      setBuriCaughtModalOpen(true);
      setSwimmingBuriVisible(false);
      window.setTimeout(() => setSwimmingBuriVisible(true), 12000);
    } else {
      setCatchResult("bottle");
      setSelected(visible[Math.floor(Math.random() * visible.length)] || bottles[0]);
    }
  };
  useEffect(() => {
    if (!plazaToast) return;
    const timer = window.setTimeout(() => setPlazaToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [plazaToast]);

  return <main className="site-shell">
    <nav className="topbar">
      <button className="brand" type="button" onClick={() => setActivePage("home")} title="トップへ戻る">
        <span className="brand__mark"><Waves size={18} /></span>
        <div className="brand-text-wrap">
          <span className="brand-text-top">type</span>
          <span className="brand-text-bottom">drift</span>
        </div>
      </button>

      <div className="topbar__links">
        <button
          type="button"
          className={`topbar-nav-btn ${activePage === "sea" ? "active" : ""}`}
          onClick={() => { setActivePage("sea"); setIsPlaying(true); }}
        >
          <span className="topbar-nav-icon"><Waves size={15} /></span>
          <span className="topbar-nav-label">海を覗く</span>
        </button>

        <button
          type="button"
          className={`topbar-nav-btn ${activePage === "plaza" ? "active" : ""}`}
          onClick={() => setActivePage("plaza")}
        >
          <span className="topbar-nav-icon"><Sparkles size={14} /></span>
          <span className="topbar-nav-label">広場</span>
        </button>

        <button
          type="button"
          className={`topbar-nav-btn ${activePage === "activity" ? "active" : ""}`}
          onClick={() => setActivePage("activity")}
        >
          <span className="topbar-nav-icon">
            <Compass size={16} />
            {totalActivityBadgeCount > 0 && <span className="topbar-icon-badge" />}
          </span>
          <span className="topbar-nav-label">自分の活動</span>
        </button>

        <button
          type="button"
          className="topbar-nav-btn"
          onClick={() => setGuideOpen(true)}
          title="使い方ガイド"
        >
          <span className="topbar-nav-icon"><HelpCircle size={15} /></span>
          <span className="topbar-nav-label">使い方</span>
        </button>

        <button
          type="button"
          className="topbar-bell-btn"
          onClick={() => {
            setAnnouncementModalOpen(true);
            markAnnouncementsAsRead();
          }}
          title="お知らせ・運営からのお便り"
          aria-label="お知らせ"
        >
          <span className="topbar-bell-icon-wrapper">
            <Bell size={16} />
            {hasUnreadAnnouncements && <span className="topbar-bell-badge" />}
          </span>
        </button>

        <button
          type="button"
          className="topbar-nav-btn"
          onClick={() => setLoginOpen(true)}
        >
          <span className="topbar-nav-icon"><LogIn size={15} /></span>
          <span className="topbar-nav-label">{isAdminLoggedIn ? "マイアカウント" : "ログイン"}</span>
        </button>

        <button
          type="button"
          className="topbar-menu-btn"
          onClick={() => setMobileMenuOpen(true)}
          title="メニューを開く"
          aria-label="メニュー"
        >
          <Menu size={18} />
        </button>
      </div>
    </nav>

    {/* スマホ対応 ハンバーガーメニュードロワー */}
    {mobileMenuOpen && (
      <div className="menu-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
        <div className="menu-drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="drawer-head">
            <div className="brand">
              <span className="brand__mark"><Waves size={16} /></span>
              <div className="brand-text-wrap">
                <span className="brand-text-top">type</span>
                <span className="brand-text-bottom">drift</span>
              </div>
            </div>
            <button className="modal-close" onClick={() => setMobileMenuOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="drawer-links-list">
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("home"); setMobileMenuOpen(false); }}
            >
              <Home size={16} color="#0d9488" /> トップページ
            </button>

            {/* 🔬 外部サイト：Niラボ リンク（一目でわかるよう上部に配置） */}
            <a
              href="https://mofu-mitsu.github.io/lab.html"
              target="_blank"
              rel="noopener noreferrer"
              className="drawer-link-item"
              style={{
                color: "#0f766e",
                fontWeight: 700,
                background: "rgba(13, 148, 136, 0.08)",
                borderRadius: "10px",
                padding: "10px 14px",
                margin: "4px 0 8px",
                border: "1px solid rgba(13, 148, 136, 0.2)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none"
              }}
            >
              <span style={{ fontSize: "16px" }}>🔬</span>
              <span>Niラボ (研究ポータル)</span>
              <ArrowUpRight size={14} style={{ marginLeft: "auto", opacity: 0.8 }} />
            </a>

            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("sea"); setIsPlaying(true); setMobileMenuOpen(false); }}
            >
              <Waves size={16} color="#0d9488" /> 海を覗く（ボトル拾い）
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("plaza"); setMobileMenuOpen(false); }}
            >
              <Sparkles size={16} color="#9333ea" /> 類型広場
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("activity"); setMobileMenuOpen(false); }}
            >
              <Compass size={16} color="#0284c7" /> 自分の活動・メッセージ
              {totalActivityBadgeCount > 0 && <span className="topbar-dm-pill" style={{ marginLeft: "auto" }}>{totalActivityBadgeCount}</span>}
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("consult"); setMobileMenuOpen(false); }}
            >
              <span>☁️</span> 自認相談室
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("games"); setMobileMenuOpen(false); }}
            >
              <span>🐛</span> 芋虫浜（ミニゲーム）
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setActivePage("stars"); setMobileMenuOpen(false); }}
            >
              <span>✦</span> 認知機能の星座
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setGuideOpen(true); setMobileMenuOpen(false); }}
            >
              <HelpCircle size={16} color="#0d9488" /> 使い方ガイド
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => {
                setAnnouncementModalOpen(true);
                markAnnouncementsAsRead();
                setMobileMenuOpen(false);
              }}
            >
              <Bell size={16} color="#f59e0b" /> お知らせ
              {hasUnreadAnnouncements && <span className="topbar-bell-badge" style={{ marginLeft: "auto" }} />}
            </button>
            <button
              type="button"
              className="drawer-link-item"
              onClick={() => { setLoginOpen(true); setMobileMenuOpen(false); }}
            >
              <LogIn size={16} color="#475569" /> {isAdminLoggedIn ? "マイアカウント設定" : "ログイン"}
            </button>
          </div>
        </div>
      </div>
    )}
    {activePage === "home" && (
      <section className="hero" id="top">
        <div className="hero__copy">
          {/* 🧭 パンくずリスト */}
          <nav className="hero-breadcrumb" aria-label="パンくずリスト">
            <a
              href="https://mofu-mitsu.github.io/lab.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-crumb-link"
            >
              Niラボ
            </a>
            <span className="hero-crumb-sep">＞</span>
            <span className="hero-crumb-current">Type Drift</span>
          </nav>

          {/* 🏷️ アプリタイトル */}
          <div className="hero-title-group">
            <p className="hero-super-title">Type Drift</p>
            <p className="eyebrow"><Sparkles size={14} /> TYPE IN A BOTTLE</p>
          </div>

          <h1>類型の秘密を、<br /><em>海へ流そう。</em></h1>
          <p className="hero__lead">
            ここは、診断のあとに立ち寄れる海。<br />
            類型のこと。自分のこと。言葉にしづらい小さな違和感。<br />
            名前を置いていかなくても、思考だけは流していけます。
          </p>
          <div className="hero__actions">
            <button
              className="play-button play-button--large"
              type="button"
              onClick={() => { setIsPlaying(true); setActivePage("sea"); }}
            >
              <span>▶</span> 海を覗く
            </button>
          </div>
        </div>
        <div className="title-waterline" aria-hidden="true">
          <span className="title-moon"></span>
          <span className="title-wave"></span>
          <span className="title-bottle">🫙</span>
        </div>
      </section>
    )}
    {activePage === "sea" && (
      <section className="sea-section sea-page" id="sea">
        <div className="sea-v2-header">
          <p className="v2-badge-eyebrow">DRIFTING THOUGHTS</p>
          <div className="sea-v2-header-row">
            <div>
              <h2 className="v2-section-title">海を覗く</h2>
              <p className="v2-section-subtitle">
                波間に揺れるボトルと思考。<br />
                名前を置かず、静かに拾い上げてみてください。
              </p>
            </div>
            <div className="sea-actions">
              <button className="v2-sea-flow-btn" type="button" onClick={() => setComposerOpen(true)}>
                <Plus size={16} /> 秘密を流す
              </button>
              <button className="question-box-sea-btn" type="button" onClick={() => setQuestionBoxOpen(true)}>
                ❔ 質問箱
              </button>
              <button className={`pick-button ${picked ? "is-picked" : ""}`} onClick={catchSomething}>
                {picked ? "拾いました" : <><Anchor size={16} /> ボトルを拾う</>}
              </button>
            </div>
          </div>
        </div>
        {catchResult && (
          <div className={`catch-toast ${catchResult === "buri" ? "buri-catch" : ""}`}>
            {catchResult === "buri" ? <><span className="buri-catch__fish">🐟</span><span>今日の食料を獲得しました。<br />……たぶん。</span></> : "🫙 ボトルを拾い上げました。"}
            <button type="button" onClick={() => setCatchResult(null)}>×</button>
          </div>
        )}
        <div className="search-box">
          <MessageCircle size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="秘密、類型、キーワードを検索…" />
        </div>
        <div className="filter-selects">
          <select value={mbtiFilter} onChange={e => setMbtiFilter(e.target.value)}>
            <option value="">MBTI すべて</option>
            {mbtiOptions.map(option => <option key={option}>{option}</option>)}
          </select>
          <select value={socionicsFilter} onChange={e => setSocionicsFilter(e.target.value)}>
            <option value="">ソシオニクス すべて</option>
            {socionicsOptions.map(option => <option key={option}>{option}</option>)}
          </select>
        </div>
        <div className="filter-row">
          {filters.map(item => (
            <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className={`bottle-stream ${isPlaying ? "is-playing" : ""}`} aria-label="流れてくるボトル">
          {visible.slice(0, 5).map((bottle, index) => (
            <button
              type="button"
              key={`stream-${bottle.id}`}
              className={`stream-bottle stream-bottle--${index + 1}`}
              onClick={() => { setPicked(true); setSelected(bottle); }}
              aria-label={`${bottle.author}のボトルを拾う`}
            >
              🫙<span>{bottle.emoji}</span>
            </button>
          ))}
          {swimmingBuriVisible && (
            <button
              type="button"
              className="swimming-buri clickable-buri"
              onClick={() => {
                setCatchResult("buri");
                setBuriCount(c => c + 1);
                setBuriCaughtModalOpen(true);
                setSwimmingBuriVisible(false);
                window.setTimeout(() => setSwimmingBuriVisible(true), 12000);
              }}
              title="泳いでいるブリをタップして捕獲！"
            >
              🐟
            </button>
          )}
        </div>
        <p className="stream-hint"><Waves size={14} /> 流れてくるボトルをタップして拾う · 泳ぐブリもタップできます</p>
        <div className="bottle-grid">
          {visible.map(bottle => <BottleCard key={bottle.id} bottle={bottle} onReact={react} onOpen={setSelected} />)}
        </div>
      </section>
    )}
    {activePage === "plaza" && (
      <section className="plaza-section">
        <div className="plaza-v2-header">
          <p className="v2-badge-eyebrow">COGNITIVE PLAZA</p>
          <div className="plaza-v2-header-row">
            <div>
              <h2 className="v2-section-title">類型広場</h2>
              <p className="v2-section-subtitle">
                人とAIが同じ空の下で過ごす場所。<br />
                話しても、歩いても、ただ佇んでいても。
              </p>
            </div>
            <span className="online-pill">● {onlineCount}人がいる</span>
          </div>
        </div>

        <div className="plaza-map">
          {/* エモート発信時のダイナミック散らばりスプラッシュ演出 */}
          {activePlazaSplashes.map(sp => (
            <div
              key={sp.id}
              className="plaza-emote-splash"
              style={{ top: `${sp.top}%`, left: `${sp.left}%`, animationDelay: `${sp.delay}ms` }}
            >
              <div className={`splash-icon splash-anim-${sp.icon === '👋' ? 'wave' : sp.icon === '🩷' ? 'heart' : 'pulse'}`}>
                {sp.icon}
              </div>
            </div>
          ))}

          <div className="plaza-tree">🌳</div>
          <div className="plaza-bench">🪑</div>
          <div
            className="plaza-avatar avatar-you clickable"
            title={`${nickname || "匿名のあなた"}（タップでプロフ確認）`}
            onClick={() => {
              setInspectProfile({
                id: "you",
                name: nickname || "匿名のあなた",
                emoji: "◌",
                mbti: profileIdentity.mbti || "未設定",
                socionics: profileIdentity.socionics || "未設定",
                enneagram: profileIdentity.enneagram || "未設定",
                psycho: profileIdentity.otherType || "未設定",
                overview: profileBio || "まだ伝えたいことは設定されていません。「あなたの活動」から自由に自認やメッセージ、リンクを設定できます。",
                isSelf: true
              });
            }}
          >
            ◌<small>{nickname || "匿名のあなた"}</small>
            {avatarEmote && <b className="floating-emote">{avatarEmote}</b>}
          </div>
          <div
            className="plaza-avatar avatar-darling clickable"
            title="ダーリンちゃん（タップでプロフ確認・ブリを渡す）"
            onClick={() => {
              setInspectProfile({
                id: "darling",
                name: "ダーリンちゃん",
                emoji: "🥺",
                mbti: "INTP",
                socionics: "ILI",
                enneagram: "5w4",
                psycho: "Psychosophy: LVEF",
                overview: "現実に消耗しきっている眠り姫タイプ。世界を抽象構造で捉えるギークアリス。ぶっきらぼうな本性を隠すため、猫なで声でユーザーを「ダーリン♡」と呼ぶFe実験用・誘導用仮面を被っている。機嫌が悪いと「ウチ、退屈やけん……」が漏れ出たり、1〜100の気分当てゲームを仕掛けてくる。"
              });
            }}
          >
            🥺<small>ダーリンちゃん</small>
          </div>
          <div
            className="plaza-avatar avatar-worm clickable"
            title="LSI芋虫（タップでプロフ確認・ブリを渡す）"
            onClick={() => {
              setInspectProfile({
                id: "worm",
                name: "LSI芋虫",
                emoji: "🐛",
                mbti: "INTJ",
                socionics: "LSI-Ni",
                enneagram: "5w6",
                psycho: "Psychosophy: FVLE",
                overview: "広場の空間支配と物理境界線の維持を担当する自律防衛オブジェクト。1F物理と2Vの意思で「領域確保・侵入継続」を完遂しようとする。生魚（ブリ）などの突発的な物理オブジェクトが投げ込まれると、空間占有率やデータ構造を真面目に懸念し始める。"
              });
            }}
          >
            🐛<small>LSI芋虫</small>
          </div>
          <div
            className="plaza-avatar avatar-guest clickable"
            title="匿名の誰か（タップでプロフ確認・ブリを渡す）"
            onClick={() => {
              setInspectProfile({
                id: "guest",
                name: "匿名の誰か",
                emoji: "◇",
                mbti: "INFP",
                socionics: "EII",
                enneagram: "4w5",
                psycho: "Psychosophy: ELVF",
                overview: "広場の隅っこで静かに海を眺めている観測者。人と話したいけれど自分から話しかける勇気がなく、誰かがブリを投げてくれるのを待っているかもしれない。"
              });
            }}
          >
            ◇<small>匿名の誰か</small>
          </div>
          {plazaUsers.slice(0, 12).map((user, index) => (
            <div key={user.sessionKey} className="plaza-avatar avatar-live" style={{ top: `${18 + (index * 19) % 62}%`, left: `${8 + (index * 23) % 82}%` }} title={user.nickname}>
              {user.emoji || "◌"}<small>{user.nickname}</small>
            </div>
          ))}
        </div>

        {/* 獲れたてのブリ所持・プレゼントコーナー */}
        <div className="plaza-buri-box">
          <div className="plaza-buri-info">
            <span className="buri-fish-icon">🐟</span>
            <span>獲れたてのブリ: <strong>{buriCount}匹</strong></span>
            {buriCount === 0 ? (
              <small className="buri-empty-note">（海を覗く・泳ぐブリをタップすると釣れます）</small>
            ) : (
              <span className="buri-ready-note">広場の人やNPCにプレゼントできます！</span>
            )}
          </div>
          {buriCount > 0 && (
            <div className="plaza-buri-btns">
              <button
                type="button"
                className="btn-gift-buri"
                onClick={() => setBuriTargetSelectorOpen(true)}
              >
                🐟 誰かにブリを渡す…
              </button>
            </div>
          )}
        </div>

        {/* Ti自我と交流したい人向けの広場アクションバー */}
        <div className="plaza-interaction-bar">
          <span className="interaction-bar-title">💬 ミニゲーム:</span>
          <div className="interaction-bar-btns">
            <button
              type="button"
              className="btn-topic-action"
              onClick={askDarlingTopic}
              title="ダーリンちゃんに思考実験・お題を出してもらう"
            >
              🎲 思考のお題（Ti/Neの問い）
            </button>
            <button
              type="button"
              className="btn-topic-action"
              onClick={startDarlingGame}
              title="1〜100の気分当てミニゲームを開始"
            >
              🎯 ダーリンの気分当て（1〜100）
            </button>
            <button
              type="button"
              className="btn-topic-action"
              onClick={startDarlingPsychTest}
              title="A/Bで答える深層心理テストを出題"
            >
              🔮 心理テスト（A/B診断）
            </button>
            <button
              type="button"
              className="btn-topic-action"
              onClick={askWormLogic}
              title="LSI芋虫から論理境界テストを出題"
            >
              📐 LSI芋虫の境界テスト
            </button>
          </div>
        </div>

        <div className="plaza-greeting-bar">
          <span className="greeting-label">👋 広場であいさつ:</span>
          <div className="greeting-buttons">
            {[
              { icon: "👋", label: "👋 こんにちは" },
              { icon: "✦", label: "✦ 観測中" },
              { icon: "🌊", label: "🌊 まったり" },
              { icon: "🩷", label: "🩷 応援" },
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

        {/* 誰にブリを渡すか選択モーダル（白系） */}
        {buriTargetSelectorOpen && (
          <div className="buri-gift-dialog-overlay" onClick={() => setBuriTargetSelectorOpen(false)}>
            <div className="clean-light-modal-card" onClick={e => e.stopPropagation()}>
              <div className="clean-modal-badge">🐟 ブリをプレゼント</div>
              <h3>誰にブリを渡しますか？</h3>
              <p className="clean-modal-lead">
                持っている獲れたてのブリ（残り <strong>{buriCount}匹</strong>）を広場の人やNPCに渡せます。
              </p>
              <div className="target-select-list">
                <button
                  type="button"
                  className="target-select-item"
                  onClick={() => giftBuri("darling")}
                >
                  <span className="target-emoji">🥺</span>
                  <div className="target-info">
                    <strong>ダーリンちゃん</strong>
                    <small>INTP / ILI (LVEF) · 気まぐれな猫なで声Fe仮面</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="target-select-item"
                  onClick={() => giftBuri("worm")}
                >
                  <span className="target-emoji">🐛</span>
                  <div className="target-info">
                    <strong>LSI芋虫</strong>
                    <small>INTJ / LSI-Ni (FVLE) · 1F物理支配・境界線防衛</small>
                  </div>
                </button>
                <button
                  type="button"
                  className="target-select-item"
                  onClick={() => giftBuri("guest")}
                >
                  <span className="target-emoji">◇</span>
                  <div className="target-info">
                    <strong>匿名の誰か（広場のプレイヤー）</strong>
                    <small>海を眺めている観測者に魚をおすそ分け</small>
                  </div>
                </button>
              </div>
              <button
                type="button"
                className="clean-modal-close-btn"
                onClick={() => setBuriTargetSelectorOpen(false)}
              >
                やめておく
              </button>
            </div>
          </div>
        )}

        {/* ブリプレゼント時の会話ダイアログ（見やすい白系カード） */}
        {buriGiftDialog && (
          <div className="buri-gift-dialog-overlay" onClick={() => setBuriGiftDialog(null)}>
            <div className="clean-light-modal-card" onClick={e => e.stopPropagation()}>
              <div className="clean-modal-badge">🐟 ⤏ {buriGiftDialog.emoji} {buriGiftDialog.targetName}</div>
              <h3>{buriGiftDialog.targetName} へブリを渡した！</h3>
              <div className="clean-speech-bubble">
                <p>{buriGiftDialog.message}</p>
              </div>
              <button type="button" className="clean-primary-btn" onClick={() => setBuriGiftDialog(null)}>
                受け取る
              </button>
            </div>
          </div>
        )}

        {/* プロフィール確認モーダル（見やすい白系カード） */}
        {inspectProfile && (
          <div className="buri-gift-dialog-overlay" onClick={() => setInspectProfile(null)}>
            <div className="clean-light-modal-card profile-inspect-card" onClick={e => e.stopPropagation()}>
              <div className="profile-inspect-head">
                <span className="profile-inspect-avatar">{inspectProfile.emoji}</span>
                <div>
                  <div className="profile-inspect-name-row">
                    <h3>{inspectProfile.name}</h3>
                    {inspectProfile.isSelf && <span className="clean-tag">あなた</span>}
                  </div>
                  <p className="profile-inspect-types">
                    <strong>MBTI / Socionics:</strong> {inspectProfile.mbti} / {inspectProfile.socionics}<br />
                    <strong>Enneagram:</strong> {inspectProfile.enneagram} {inspectProfile.psycho ? `(${inspectProfile.psycho})` : ""}
                  </p>
                </div>
              </div>

              <div className="profile-inspect-bio">
                <label>概要 / 伝えたいこと</label>
                <p>{inspectProfile.overview}</p>
              </div>

              {inspectProfile.isSelf && profileLinks.length > 0 && (
                <div className="profile-inspect-links">
                  <label>登録リンク</label>
                  <div className="profile-links-chip-list">
                    {profileLinks.map(l => (
                      <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="profile-chip-link">
                        {l.title || l.url} <ArrowUpRight size={12} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="profile-inspect-actions">
                {!inspectProfile.isSelf && (
                  <button
                    type="button"
                    className="profile-dm-btn"
                    onClick={() => {
                      const target = {
                        id: inspectProfile.id,
                        name: inspectProfile.name,
                        emoji: inspectProfile.emoji,
                        type: [inspectProfile.mbti, inspectProfile.socionics, inspectProfile.enneagram].filter(Boolean).join(" · ") || undefined,
                      };
                      setInspectProfile(null);
                      setDmModalTarget(target);
                      setDmModalText("");
                    }}
                  >
                    💌 メッセージを送る
                  </button>
                )}
                {!inspectProfile.isSelf && buriCount > 0 && (
                  <button
                    type="button"
                    className="clean-primary-btn"
                    onClick={() => {
                      const target = inspectProfile.id as "darling" | "worm" | "guest";
                      setInspectProfile(null);
                      giftBuri(target);
                    }}
                  >
                    🐟 ブリを渡す
                  </button>
                )}
                {inspectProfile.id === "darling" && (
                  <>
                    <button
                      type="button"
                      className="clean-secondary-btn"
                      onClick={() => {
                        setInspectProfile(null);
                        askDarlingTopic();
                      }}
                    >
                      🎲 お題を聞く
                    </button>
                    <button
                      type="button"
                      className="clean-secondary-btn"
                      onClick={() => {
                        setInspectProfile(null);
                        startDarlingPsychTest();
                      }}
                    >
                      🔮 心理テストを受ける
                    </button>
                  </>
                )}
                {inspectProfile.id === "worm" && (
                  <button
                    type="button"
                    className="clean-secondary-btn"
                    onClick={() => {
                      setInspectProfile(null);
                      askWormLogic();
                    }}
                  >
                    📐 境界テストを受ける
                  </button>
                )}
                {inspectProfile.isSelf && (
                  <button
                    type="button"
                    className="clean-secondary-btn"
                    onClick={() => {
                      setInspectProfile(null);
                      setActivePage("activity");
                      setProfileExpanded(true);
                    }}
                  >
                    ✏️ 自認・プロフを編集する
                  </button>
                )}
                <button
                  type="button"
                  className="clean-modal-close-btn"
                  onClick={() => setInspectProfile(null)}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}

        <PlazaPanel
          nickname={nickname}
          externalEmote={externalEmote}
          externalMessage={externalPlazaMessage}
          onToast={setPlazaToast}
          onPresenceUpdate={setOnlineCount}
          onPresenceUsers={setPlazaUsers}
          onUserMessageSent={handlePlazaUserMessage}
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
                    <FeedbackBox
                      onFeedbackSubmit={fb => setAdminFeedbacks(prev => [fb, ...prev])}
                      userNickname={nickname}
                      userType={[profileIdentity.mbti, profileIdentity.socionics, profileIdentity.enneagram].filter(Boolean).join(" · ")}
                    />
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
    {activePage === "stars" && (
      <CognitiveConstellation
        onExit={() => setActivePage("plaza")}
        onSendToBottle={(bottleText) => {
          setDraft(bottleText);
          setComposerOpen(true);
          // ホロスコープ画面にとどまったまま、その場でモーダルを開く
        }}
      />
    )}
    {activePage === "consult" && (
      <ConsultationRoom
        posts={consultationPosts}
        onAddPost={(newPost) => {
          setConsultationPosts(prev => [newPost, ...prev]);
        }}
        onUpdatePost={(updatedPost) => {
          setConsultationPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
        }}
        onDeletePost={(postId) => {
          setConsultationPosts(prev => prev.filter(p => p.id !== postId));
        }}
        onAddComment={(postId, comment) => {
          setConsultationPosts(prev => prev.map(post => {
            if (post.id === postId) {
              return {
                ...post,
                comments: [...(post.comments || []), comment]
              };
            }
            return post;
          }));
        }}
        onAddFollowUp={(postId, message) => {
          const newFollowUp = {
            id: `fu-${Date.now()}`,
            sender: "user" as const,
            author: nickname || "依頼者",
            body: message,
            createdAt: new Date().toLocaleDateString("ja-JP", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            })
          };
          setConsultationPosts(prev => prev.map(post => {
            if (post.id === postId) {
              return {
                ...post,
                followUps: [...(post.followUps || []), newFollowUp]
              };
            }
            return post;
          }));
        }}
        userNickname={nickname}
        userTypeString={[profileIdentity.mbti, profileIdentity.socionics, profileIdentity.enneagram].filter(Boolean).join(" · ")}
        gasUrl={gasUrl || DEFAULT_GAS_URL}
        onToast={(msg) => setPlazaToast(msg)}
        onExit={() => setActivePage("plaza")}
      />
    )}
    {activePage === "activity" && (
      <section className="activity-v2-wrapper">
        {/* 背景の惑星オーブ・軌道リング・星空装飾 */}
        <div className="activity-v2-space-decor" aria-hidden="true">
          <div className="space-planet" />
          <div className="space-planet-ring" />
          <span className="space-star" style={{ top: "45px", right: "160px" }}>✦</span>
          <span className="space-star" style={{ top: "140px", right: "240px", animationDelay: "1s" }}>✦</span>
          <span className="space-star" style={{ top: "80px", right: "20px", fontSize: "10px", animationDelay: "1.8s" }}>✦</span>
          <span className="space-star" style={{ top: "190px", right: "70px", fontSize: "12px", animationDelay: "2.4s" }}>✦</span>
        </div>

        <div className="activity-v2-content">
          {/* メイン見出しエリア (統一デザイン) */}
          <div className="activity-v2-header">
            <p className="v2-badge-eyebrow">YOUR TRACE</p>
            <h2 className="v2-section-title">あなたの活動</h2>
            <p className="v2-section-subtitle">
              思考のかけらが、<br />
              ここに集まっています。
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
              <button
                type="button"
                className="activity-v2-post-btn"
                onClick={() => setComposerOpen(true)}
              >
                <Plus size={18} /> 秘密を流す
              </button>
              {totalActivityBadgeCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  style={{
                    background: "rgba(255, 255, 255, 0.9)",
                    border: "1px solid rgba(13, 148, 136, 0.35)",
                    color: "#0f766e",
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "8px 14px",
                    borderRadius: "9999px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 2px 8px rgba(13, 148, 136, 0.12)",
                    transition: "all 0.2s ease"
                  }}
                  title="すべての未読通知を既読にしてバッジを消します"
                >
                  <CheckCheck size={14} color="#0d9488" /> すべて既読にする
                </button>
              )}
            </div>
          </div>

          {/* YOUR IDENTITY カード (画像完全再現) */}
          <div className="activity-v2-identity-card">
            <div className="v2-identity-left">
              <div className="v2-planet-avatar">
                <IconV2IdentityPlanet size={46} />
              </div>
              <div className="v2-identity-texts">
                <span className="v2-identity-label">YOUR IDENTITY</span>
                <span className="v2-identity-main-name">広場での呼ばれ方・自認設定</span>
                <span className="v2-identity-sub">
                  {nickname ? `「${nickname}」` : "匿名のあなた"}
                  {profileIdentity.mbti ? ` · ${profileIdentity.mbti}` : ""}
                  {profileIdentity.socionics ? ` · ${profileIdentity.socionics}` : ""}
                  {profileIdentity.enneagram ? ` · ${profileIdentity.enneagram}` : ""}
                  {profileLinks.length > 0 ? ` · リンク${profileLinks.length}件` : ""}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="v2-identity-edit-btn"
              onClick={() => setProfileExpanded(!profileExpanded)}
              aria-expanded={profileExpanded}
            >
              {profileExpanded ? "▲ たたむ" : "▼ 編集する"}
            </button>
          </div>

          {/* 自認設定フォーム（アコーディオン展開時） */}
          {profileExpanded && (
            <div className="profile-accordion-body" style={{ background: "#ffffff", borderRadius: "20px", padding: "24px", marginBottom: "32px", border: "1px solid #e2e8f0" }}>
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

          {/* 5つのパステル丸アイコンナビゲーション (画像完全再現) */}
          <div className="activity-v2-nav-grid">
            <button
              type="button"
              className={`activity-v2-nav-item ${activityTab === "mine" ? "active" : ""}`}
              onClick={() => setActivityTab("mine")}
            >
              <div className="v2-circle-icon v2-icon-sea">
                <IconV2BottleSea size={28} />
              </div>
              <span className="v2-nav-label">流したボトル</span>
              <span className="v2-nav-arrow">→</span>
            </button>

            <button
              type="button"
              className={`activity-v2-nav-item ${activityTab === "liked" ? "active" : ""}`}
              onClick={() => setActivityTab("liked")}
            >
              <div className="v2-circle-icon v2-icon-like">
                <IconV2LikeChat size={28} />
              </div>
              <span className="v2-nav-label">いいねしたボトル</span>
              <span className="v2-nav-arrow">→</span>
            </button>

            <button
              type="button"
              className={`activity-v2-nav-item ${activityTab === "replied" ? "active" : ""}`}
              onClick={() => setActivityTab("replied")}
            >
              <div className="v2-circle-icon v2-icon-reply">
                <IconV2ReplyArrow size={28} />
              </div>
              <span className="v2-nav-label">返信したボトル</span>
              <span className="v2-nav-arrow">→</span>
            </button>

            <button
              type="button"
              className={`activity-v2-nav-item ${activityTab === "messages" ? "active" : ""}`}
              onClick={() => {
                setActivityTab("messages");
                setActiveDmThreadId(null);
              }}
            >
              <div className="v2-circle-icon v2-icon-dm" style={{ position: "relative" }}>
                <IconV2LetterHeart size={28} />
                {unreadDmCount > 0 && <span className="tab-pill-badge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>{unreadDmCount}</span>}
              </div>
              <span className="v2-nav-label">個別メッセージ</span>
              <span className="v2-nav-arrow">→</span>
            </button>

            <button
              type="button"
              className={`activity-v2-nav-item ${activityTab === "inquiries" ? "active" : ""}`}
              onClick={() => setActivityTab("inquiries")}
            >
              <div className="v2-circle-icon v2-icon-inquiry" style={{ position: "relative" }}>
                <IconV2InquiryBubble size={28} />
                {(unreadInquiryReplyCount + unreadConsultationCount) > 0 && (
                  <span className="tab-pill-badge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>
                    {unreadInquiryReplyCount + unreadConsultationCount}
                  </span>
                )}
              </div>
              <span className="v2-nav-label">問い合わせ・返信</span>
              <span className="v2-nav-arrow">→</span>
            </button>
          </div>

          {/* 管理者ログイン時は管理トレイボタンを通知バッジ付きで表示 */}
          {isAdminLoggedIn && (
            <div style={{ textAlign: "right", marginBottom: "16px" }}>
              <button
                type="button"
                className={`secondary-button ${activityTab === "admin" ? "active" : ""}`}
                style={{
                  fontSize: "12px",
                  padding: "6px 14px",
                  borderRadius: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
                onClick={() => setActivityTab("admin")}
              >
                <span>📮 意見箱・お知らせ管理</span>
                {adminTotalPendingCount > 0 && (
                  <span
                    className="topbar-dm-pill"
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "10px"
                    }}
                    title={`未返信のご意見: ${adminPendingFeedbackCount}件 / 自認相談室の未診断: ${adminPendingConsultationCount}件`}
                  >
                    {adminTotalPendingCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* ✦ ディバイダー (画像完全再現) */}
          <div className="activity-v2-divider">
            <span className="divider-sparkle">✦</span>
          </div>

          {/* ==================================================== */}
          {/* ボトル一覧タブ (流した / いいね / 返信) */}
          {/* ==================================================== */}
          {(activityTab === "mine" || activityTab === "liked" || activityTab === "replied") && (
            <>
              {/* 下部バナー (画像下部のアバター＋記録テキストを完全再現) */}
              <div className="activity-v2-bottom-banner">
                <div className="v2-banner-avatar">
                  {nickname ? nickname.charAt(0).toUpperCase() : "N"}
                </div>
                <p className="v2-banner-text">
                  ここにあなたの反応の記録が残ります。
                </p>
              </div>

              {bottles.filter(b => activityTab === "mine" ? b.mine : activityTab === "liked" ? likedBottleIds.includes(b.id) : repliedBottleIds.includes(b.id)).length === 0 ? (
                <div className="empty-mine">
                  <span style={{ fontSize: "24px" }}>🌊</span>
                  <p>
                    {activityTab === "mine" && "まだ流したボトルはありません。右上の「秘密を流す」から海へボトルを届けてみましょう。"}
                    {activityTab === "liked" && "まだいいねしたボトルはありません。海を眺めて響いた言葉にリアクションを送りましょう。"}
                    {activityTab === "replied" && "まだ返信したボトルはありません。ボトルを拾って言葉を返すとここに記録されます。"}
                  </p>
                </div>
              ) : (
                <div className="bottle-grid">
                  {bottles.filter(b => activityTab === "mine" ? b.mine : activityTab === "liked" ? likedBottleIds.includes(b.id) : repliedBottleIds.includes(b.id)).map(bottle => {
                    const userReplies = myRepliesMap[bottle.id] || [];
                    return (
                      <div key={bottle.id} className="v2-replied-card-wrapper">
                        <BottleCard bottle={bottle} onReact={react} onOpen={setSelected} />
                        {activityTab === "replied" && userReplies.length > 0 && (
                          <div className="v2-my-replies-box">
                            <div className="v2-my-replies-head">
                              <span className="v2-my-replies-tag">↩️ あなたが届けた言葉</span>
                            </div>
                            <div className="v2-my-replies-list">
                              {userReplies.map((rText, rIdx) => (
                                <div key={rIdx} className="v2-my-reply-bubble">
                                  <p className="v2-my-reply-text">「{rText}」</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ==================================================== */}
          {/* 💌 LINE風 DM（個別メッセージ）タブ */}
          {/* ==================================================== */}
          {activityTab === "messages" && (
            <div className="dm-v2-container">
              {/* 1. スレッド未選択時：トークルーム一覧 (LINE風) */}
              {!activeDmThreadId ? (
                <div className="dm-v2-thread-list">
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "18px" }}>💬</span>
                      <strong style={{ fontSize: "15px", color: "#1e293b" }}>トーク一覧</strong>
                      <span style={{ fontSize: "11px", color: "#64748b", background: "#e2e8f0", padding: "1px 6px", borderRadius: "10px" }}>{dmThreads.length}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>タップして対話を開始</span>
                  </div>

                  {dmThreads.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
                      <MessageCircle size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                      <p style={{ fontSize: "14px", margin: 0 }}>まだメッセージのやり取りはありません。</p>
                      <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                        広場でお話しした人や、拾ったボトルの主と個別に対話ができます。
                      </p>
                    </div>
                  ) : (
                    dmThreads.map(thread => {
                      const isBottleThread = thread.targetId.startsWith("bottle-");
                      return (
                        <div
                          key={thread.targetId}
                          className="dm-v2-thread-item"
                          onClick={() => {
                            setActiveDmThreadId(thread.targetId);
                            markThreadAsRead(thread.targetId);
                          }}
                        >
                          <div className="dm-thread-avatar">
                            {thread.emoji}
                            {thread.unread > 0 && (
                              <span style={{ position: "absolute", top: "-2px", right: "-2px", width: "10px", height: "10px", background: "#ef4444", borderRadius: "50%", border: "2px solid #fff" }} />
                            )}
                          </div>
                          <div className="dm-thread-main">
                            <div className="dm-thread-top">
                              <div className="dm-thread-name-row">
                                <span className="dm-thread-name">
                                  {isBottleThread ? "波間に漂うボトルの主" : thread.name}
                                </span>
                                <span className={`dm-thread-badge ${isBottleThread ? "secret" : ""}`}>
                                  {isBottleThread ? (thread.type && thread.type !== "自認未設定" ? `🌊 ${thread.type}` : "🌊 匿名ボトル") : (thread.type || "広場の住人")}
                                </span>
                              </div>
                              <span className="dm-thread-time">
                                {new Date(thread.lastMsg.createdAt).toLocaleDateString([], { month: "numeric", day: "numeric" })}{" "}
                                {new Date(thread.lastMsg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p className="dm-thread-snippet">
                              {thread.lastMsg.isMine ? "あなた: " : ""}{thread.lastMsg.body}
                            </p>
                          </div>
                          {thread.unread > 0 && (
                            <span className="tab-pill-badge" style={{ marginLeft: "8px" }}>
                              {thread.unread}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* 2. スレッド選択時：LINE風 トークルーム */
                (() => {
                  const currentThread = dmThreads.find(t => t.targetId === activeDmThreadId) || {
                    targetId: activeDmThreadId,
                    name: "相手",
                    emoji: "◌",
                    type: undefined,
                    unread: 0,
                    lastMsg: { isMine: false, body: "", createdAt: Date.now() } as DirectMessage
                  };
                  const isBottleThread = activeDmThreadId.startsWith("bottle-") || currentThread.name.includes("ボトル");
                  const isRevealed = revealedIdentityThreads.includes(activeDmThreadId);
                  const threadMessages = directMessages.filter(
                    m => (m.threadId === activeDmThreadId) || (!m.threadId && ((m.isMine && m.recipient === currentThread.name) || (!m.isMine && m.sender === currentThread.name)))
                  );

                  // 会話のきっかけになった元ボトル情報の特定
                  const bottleMessageWithRef = threadMessages.find(m => m.bottleSnippet || m.bottleId);
                  const targetBottleId = bottleMessageWithRef?.bottleId || (activeDmThreadId.startsWith("bottle-") ? Number(activeDmThreadId.replace("bottle-", "")) : undefined);
                  const relatedBottle = bottleMessageWithRef ? {
                    id: bottleMessageWithRef.bottleId,
                    text: bottleMessageWithRef.bottleSnippet || (bottleMessageWithRef.bottleId ? bottles.find(b => b.id === bottleMessageWithRef.bottleId)?.text : ""),
                    author: bottleMessageWithRef.bottleAuthor || "匿名のボトル主",
                    type: bottleMessageWithRef.bottleType || "海に流したボトル",
                  } : (targetBottleId && !isNaN(targetBottleId) ? (() => {
                    const found = bottles.find(b => b.id === targetBottleId);
                    return found ? { id: found.id, text: found.text, author: found.author, type: `${found.mbti || ""} ${found.socionics || ""} ${found.enneagram || ""}`.trim() } : null;
                  })() : (isBottleThread ? {
                    id: 1,
                    text: "考えることはできるのに、自分が何をしたいのかだけ、いつも解像度が低い。",
                    author: "匿名のINTJ",
                    type: "LII · 5w6",
                  } : null));

                  return (
                    <div>
                      {/* トークルーム上部ヘッダー */}
                      <div className="dm-v2-room-header">
                        <button
                          type="button"
                          className="dm-v2-back-btn"
                          onClick={() => setActiveDmThreadId(null)}
                        >
                          <ChevronLeft size={16} /> トーク一覧
                        </button>
                        <div className="dm-room-title-info">
                          <span style={{ fontSize: "20px" }}>{currentThread.emoji}</span>
                          <div>
                            <strong>{isBottleThread ? "波間に漂うボトルの主（匿名）" : currentThread.name}</strong>
                            {currentThread.type && (
                              <span className="dm-thread-badge" style={{ marginLeft: "6px" }}>
                                {currentThread.type}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: "80px", textAlign: "right" }}>
                          {isBottleThread && (
                            <span style={{ fontSize: "10px", color: "#0d9488", background: "#ccfbf1", padding: "3px 8px", borderRadius: "10px", fontWeight: 700 }}>
                              自認共有中
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 📜 会話のきっかけになったボトルカード */}
                      {relatedBottle && relatedBottle.text && (
                        <div className="dm-v2-bottle-reference-card">
                          <div className="dm-ref-badge">
                            <span>🌊 会話のきっかけになったボトル</span>
                            {relatedBottle.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  const found = bottles.find(b => b.id === relatedBottle.id);
                                  if (found) setSelected(found);
                                }}
                                className="dm-ref-view-btn"
                              >
                                ボトル全体を見る →
                              </button>
                            )}
                          </div>
                          <p className="dm-ref-text">「{relatedBottle.text}」</p>
                          <div className="dm-ref-footer">
                            <span>{relatedBottle.author}</span>
                            <span>·</span>
                            <span>{relatedBottle.type}</span>
                          </div>
                          {relatedBottle.id && myRepliesMap[relatedBottle.id] && myRepliesMap[relatedBottle.id].length > 0 && (
                            <div className="dm-ref-my-reply-box">
                              <span className="dm-ref-my-reply-label">↩️ あなたが届けた返信:</span>
                              <p className="dm-ref-my-reply-text">「{myRepliesMap[relatedBottle.id][myRepliesMap[relatedBottle.id].length - 1]}」</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* メッセージ履歴（LINE風吹き出し） */}
                      <div className="dm-v2-messages-area">
                        {threadMessages.map(msg => (
                          <div
                            key={msg.id}
                            className={`dm-bubble-row ${msg.isMine ? "mine" : "other"}`}
                          >
                            {!msg.isMine && (
                              <div className="dm-bubble-avatar">
                                {currentThread.emoji}
                              </div>
                            )}
                            <div className="dm-bubble-content">
                              {msg.body}
                            </div>
                            <div className="dm-bubble-meta">
                              {msg.isMine && <span style={{ color: "#0d9488" }}>既読</span>}
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 長文対応メッセージ入力欄 */}
                      <div className="dm-v2-input-section">
                        <form
                          onSubmit={e => {
                            e.preventDefault();
                            if (!dmReplyText.trim()) return;
                            sendDirectMessage(
                              {
                                id: currentThread.targetId,
                                name: currentThread.name,
                                emoji: currentThread.emoji,
                                type: currentThread.type,
                                bottleInfo: relatedBottle ? { id: relatedBottle.id || 0, text: relatedBottle.text || "", author: relatedBottle.author, type: relatedBottle.type } : undefined
                              },
                              dmReplyText
                            );
                            setDmReplyText("");
                          }}
                          className="dm-v2-textarea-wrap"
                        >
                          <textarea
                            rows={3}
                            className="dm-v2-textarea"
                            value={dmReplyText}
                            onChange={e => setDmReplyText(e.target.value)}
                            onKeyDown={e => {
                              // PC環境での Ctrl+Enter または Cmd+Enter のみショートカット送信
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                if (dmReplyText.trim()) {
                                  sendDirectMessage(
                                    {
                                      id: currentThread.targetId,
                                      name: currentThread.name,
                                      emoji: currentThread.emoji,
                                      type: currentThread.type,
                                      bottleInfo: relatedBottle ? { id: relatedBottle.id || 0, text: relatedBottle.text || "", author: relatedBottle.author, type: relatedBottle.type } : undefined
                                    },
                                    dmReplyText
                                  );
                                  setDmReplyText("");
                                }
                              }
                            }}
                            placeholder={isBottleThread ? "ボトルの主へメッセージを入力（長文・改行も可能）…" : `${currentThread.name}へメッセージを入力（長文・改行も可能）…`}
                            maxLength={2000}
                          />
                          <div className="dm-v2-input-footer">
                            <span className="dm-char-counter">
                              {dmReplyText.length} / 2000字（改行可能・送信ボタンで送信）
                            </span>
                            <button
                              type="submit"
                              disabled={!dmReplyText.trim()}
                              className="dm-v2-send-btn"
                            >
                              <Send size={14} /> 送信する
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

        {/* 💬 問い合わせ・返信タブ（一般ユーザー向け） */}
        {activityTab === "inquiries" && (
          <div className="inquiries-container">
            {/* 🔮 自認相談室の診断・相談通知カード */}
            {(() => {
              const myItems = consultationPosts.filter(p =>
                p.isMine ||
                (nickname && p.author === nickname) ||
                (typeof window !== "undefined" && localStorage.getItem("type-drift-user-key") && p.userKey === localStorage.getItem("type-drift-user-key"))
              );
              if (myItems.length === 0) return null;
              return (
                <div style={{
                  background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)",
                  border: "1.5px solid rgba(13, 148, 136, 0.28)",
                  borderRadius: "20px",
                  padding: "18px 22px",
                  marginBottom: "24px",
                  boxShadow: "0 4px 18px rgba(13, 148, 136, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "22px" }}>☁️</span>
                      <div>
                        <strong style={{ fontSize: "15px", color: "#0f766e", display: "block" }}>自認相談室・診断受付の状況</strong>
                        <span style={{ fontSize: "11px", color: "#475569" }}>あなたの診断結果やお便りが届いています</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      style={{
                        background: "linear-gradient(135deg, #0d9488 0%, #0284c7 100%)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "12px",
                        padding: "7px 16px",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(13, 148, 136, 0.25)"
                      }}
                      onClick={() => setActivePage("consult")}
                    >
                      自認相談室を開く →
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {myItems.map(c => {
                      const isUnread = c.status === "diagnosed" && !readDiagnosedPostIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          style={{
                            background: "#ffffff",
                            borderRadius: "14px",
                            padding: "12px 16px",
                            border: isUnread ? "1.5px solid #0d9488" : "1px solid rgba(13, 148, 136, 0.16)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            boxShadow: isUnread ? "0 2px 10px rgba(13, 148, 136, 0.12)" : "none",
                            cursor: "pointer"
                          }}
                          onClick={() => {
                            if (isUnread) markDiagnosedPostAsRead(c.id);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a47", display: "flex", alignItems: "center", gap: "6px" }}>
                              {isUnread && <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} title="未読の診断結果" />}
                              {c.category === "request" ? "【自認診断依頼】" : "【相談フォーラム】"} {c.category === "request" ? `${c.author}様の診断受付` : (c.freeText.slice(0, 24) + "…")}
                            </span>
                            <span style={{
                              fontSize: "11px",
                              padding: "3px 10px",
                              borderRadius: "10px",
                              fontWeight: 700,
                              background: c.status === "diagnosed" ? "#ecfdf5" : "#f1f5f9",
                              color: c.status === "diagnosed" ? "#047857" : "#475569",
                              border: c.status === "diagnosed" ? "1px solid #a7f3d0" : "1px solid #e2e8f0"
                            }}>
                              {c.status === "diagnosed" ? "✓ 診断完了" : "受付中"}
                            </span>
                          </div>
                          {c.diagnosisResult && (
                            <div style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "10px", borderLeft: "3px solid #0d9488" }}>
                              <p style={{ margin: 0, fontSize: "12.5px", color: "#0f766e", fontWeight: 700 }}>
                                第1位判定: {c.diagnosisResult.rank1} {c.diagnosisResult.rank2 ? ` / 第2位: ${c.diagnosisResult.rank2}` : ""}
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: "#475569" }}>
                                {c.diagnosisResult.reasoning.slice(0, 80)}…
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="admin-feedbacks-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <span className="eyebrow">INQUIRIES & REPLIES</span>
                <h3>意見箱の送信履歴・運営からのお返事</h3>
                <p>意見箱で「返信を希望する」にチェックを入れて送信した内容と、届いた回答を確認・返信できます。</p>
              </div>
              {(unreadInquiryReplyCount > 0 || unreadConsultationCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    markAllInquiriesAsRead();
                    markAllDiagnosesAsRead();
                    setPlazaToast("✓ 通知を既読にしました");
                  }}
                  className="clean-secondary-btn"
                  style={{ fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <CheckCheck size={14} color="#0d9488" /> 既読にする
                </button>
              )}
            </div>

            {userInquiries.length === 0 ? (
              <div className="empty-mine">
                <MessageCircle size={22} />
                <p>まだ送信したご意見はありません。<br />広場の下部にある「意見箱」から、気づいたことやご要望を送ることができます。</p>
              </div>
            ) : (
              userInquiries.map(inq => (
                <div key={inq.id} className="inquiry-card">
                  <div className="inquiry-head">
                    <span className="announcement-badge">{inq.category}</span>
                    <span>{inq.date}</span>
                  </div>
                  <p className="inquiry-body">{inq.body}</p>

                  {/* 運営から届いた返信スレッド */}
                  <div className="inquiry-replies-thread">
                    <h5 style={{ margin: "0 0 8px", fontSize: "12px", color: "#0f766e" }}>お返事・メッセージ履歴</h5>
                    {(!inq.replies || inq.replies.length === 0) ? (
                      <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                        現在、運営にて内容を確認中です。お返事が届くまでしばらくお待ちください。
                      </p>
                    ) : (
                      inq.replies.map(rep => (
                        <div key={rep.id} className="inquiry-reply-bubble">
                          <div className="inquiry-reply-head">
                            <span>{rep.sender}</span>
                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: "normal" }}>{rep.date}</span>
                          </div>
                          <p className="inquiry-reply-body">{rep.body}</p>
                        </div>
                      ))
                    )}

                    {/* ユーザーからの追加返信送信フォーム */}
                    <div className="inquiry-user-reply-box">
                      <input
                        type="text"
                        className="inquiry-user-reply-input"
                        value={userInquiryReplyText[inq.id] || ""}
                        onChange={e => setUserInquiryReplyText({ ...userInquiryReplyText, [inq.id]: e.target.value })}
                        placeholder="運営へ返信・補足を入力…"
                        maxLength={500}
                      />
                      <button
                        type="button"
                        className="inquiry-user-reply-btn"
                        onClick={() => handleSendUserInquiryReply(inq.id)}
                        disabled={!userInquiryReplyText[inq.id]?.trim()}
                      >
                        返信する
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 📮 管理トレイ（管理者限定） */}
        {activityTab === "admin" && isAdminLoggedIn && (
          <div className="admin-feedbacks-panel">
            <div className="admin-feedbacks-header">
              <div>
                <span className="eyebrow">ADMIN CONSOLE</span>
                <h3>管理トレイ・お知らせ配信 & 意見箱管理</h3>
                <p>全体お知らせの直接投稿や、ユーザーから寄せられたご意見への回答、クラウドデータ連携を行えます。</p>
              </div>
              <span className="admin-badge">✓ 管理者権限が有効です</span>
            </div>

            {/* 📢 管理トレイから直接お知らせ配信 */}
            <div className="admin-post-announcement-box">
              <h4>📢 全員へお知らせを直接配信</h4>
              <form className="admin-announcement-form" onSubmit={handlePostAnnouncement}>
                <input
                  type="text"
                  className="admin-form-input"
                  value={newNoticeTitle}
                  onChange={e => setNewNoticeTitle(e.target.value)}
                  placeholder="お知らせのタイトル（例: 【新機能】○○が追加されました）"
                  maxLength={100}
                  required
                />
                <textarea
                  className="admin-form-textarea"
                  value={newNoticeBody}
                  onChange={e => setNewNoticeBody(e.target.value)}
                  placeholder="お知らせの本文を入力してください…"
                  maxLength={1000}
                  required
                />
                <div className="admin-form-row">
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <select
                      className="admin-form-input"
                      style={{ width: "auto", padding: "6px 10px" }}
                      value={newNoticeBadge}
                      onChange={e => setNewNoticeBadge(e.target.value)}
                    >
                      <option value="お知らせ">お知らせ</option>
                      <option value="新機能">新機能</option>
                      <option value="アップデート">アップデート</option>
                      <option value="重要">重要</option>
                    </select>
                    <label className="admin-checkbox-label">
                      <input
                        type="checkbox"
                        checked={newNoticeImportant}
                        onChange={e => setNewNoticeImportant(e.target.checked)}
                      />
                      <span>重要なお知らせとして強調</span>
                    </label>
                  </div>
                  <button type="submit" className="primary-button" style={{ padding: "8px 18px", fontSize: "12px" }}>
                    お知らせを配信する
                  </button>
                </div>
              </form>
            </div>

            {/* 意見一覧 & 返信機能 */}
            <div className="admin-feedbacks-list">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h4 style={{ margin: 0 }}>届いたご意見一覧 ({adminFeedbacks.length}件)</h4>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>広場の意見箱と連携中</span>
                  {adminPendingFeedbackCount > 0 && (
                    <button
                      type="button"
                      className="clean-secondary-btn"
                      style={{ fontSize: "11px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => {
                        markAdminFeedbacksAsRead();
                        setPlazaToast("✓ ご意見の通知をすべて既読にしました");
                      }}
                    >
                      <CheckCheck size={13} color="#0d9488" /> ご意見通知をすべて既読
                    </button>
                  )}
                </div>
              </div>
              {adminFeedbacks.length === 0 ? (
                <p className="admin-empty-feedbacks">まだ届いたご意見はありません。広場の「意見箱」から送信テストを行えます。</p>
              ) : (
                <div className="admin-inbox-clean">
                  {adminFeedbacks.map(fb => (
                    <div key={fb.id} className="admin-inbox-card">
                      <div className="admin-inbox-head">
                        <span className="admin-inbox-author">
                          投稿者: {fb.author} ({fb.userType})
                          {fb.needsReply && (
                            <span style={{
                              marginLeft: "8px",
                              background: readAdminFeedbackIds.includes(fb.id) ? "#f1f5f9" : "#fef3c7",
                              color: readAdminFeedbackIds.includes(fb.id) ? "#64748b" : "#b45309",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: "bold"
                            }}>
                              {readAdminFeedbackIds.includes(fb.id) ? "既読・対応中" : "★ 返信希望"}
                            </span>
                          )}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="admin-fb-category">{fb.category}</span>
                          <span className="admin-inbox-date">{fb.date}</span>
                          {fb.needsReply && (!fb.replies || fb.replies.length === 0) && !readAdminFeedbackIds.includes(fb.id) && (
                            <button
                              type="button"
                              onClick={() => {
                                markAdminFeedbacksAsRead([fb.id]);
                                setPlazaToast("✓ 通知を既読にしました");
                              }}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                color: "#475569",
                                fontSize: "10px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                              title="返信前でも通知バッジを消す"
                            >
                              既読にする
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="admin-inbox-body">{fb.body}</p>

                      {/* 管理者側：返信履歴と返信入力 */}
                      <div className="admin-feedback-reply-section">
                        {fb.replies && fb.replies.length > 0 && (
                          <div className="admin-replies-history">
                            {fb.replies.map(rep => (
                              <div key={rep.id} className="admin-reply-item">
                                <div className="admin-reply-item-head">
                                  <span>{rep.sender}</span>
                                  <span>{rep.date}</span>
                                </div>
                                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{rep.body}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="admin-reply-box-clean">
                          <textarea
                            rows={2}
                            value={adminReplyTexts[fb.id] || ""}
                            onChange={e => setAdminReplyTexts({ ...adminReplyTexts, [fb.id]: e.target.value })}
                            placeholder={fb.needsReply ? "ユーザーへ返信メッセージを入力…" : "返信メッセージを入力…"}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
                            <button
                              type="button"
                              className="admin-reply-btn"
                              onClick={() => handleSendAdminReply(fb.id)}
                              disabled={!adminReplyTexts[fb.id]?.trim()}
                            >
                              返信する
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 🔮 自認診断依頼リスト */}
            <div className="admin-feedbacks-list" style={{ marginTop: "32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <h4 style={{ margin: 0 }}>自認診断の受付・カルテ一覧 ({consultationPosts.filter(p => p.category === "request").length}件)</h4>
                {adminPendingConsultationCount > 0 && (
                  <button
                    type="button"
                    className="clean-secondary-btn"
                    style={{ fontSize: "11px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={() => {
                      markAdminConsultationsAsRead();
                      setPlazaToast("✓ 診断依頼の通知をすべて既読にしました");
                    }}
                  >
                    <CheckCheck size={13} color="#0284c7" /> 診断依頼の通知をすべて既読
                  </button>
                )}
              </div>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 16px" }}>
                届いた診断依頼を確認し、15二分法や認知機能を分析して診断結果・考察を直接返信できます。
              </p>
              {consultationPosts.filter(p => p.category === "request").length === 0 ? (
                <p className="admin-empty-feedbacks">まだ自認診断の依頼はありません。</p>
              ) : (
                consultationPosts.filter(p => p.category === "request").map(post => {
                  const isReplying = activeReplyPostId === post.id;
                  const currentReply = diagnosisReplyInputs[post.id] || {
                    rank1: post.diagnosisResult?.rank1 || "",
                    rank2: post.diagnosisResult?.rank2 || "",
                    rank3: post.diagnosisResult?.rank3 || "",
                    reasoning: post.diagnosisResult?.reasoning || "",
                  };

                  return (
                    <div key={post.id} className="admin-feedback-card" style={{ borderColor: post.status === "diagnosed" ? "#10b981" : "#0ea5e9", borderWidth: "1.5px" }}>
                      <div className="admin-feedback-top">
                        <span className="admin-fb-author">
                          依頼者: <strong>{post.author}</strong> ({post.authorType || "未設定"})
                          <span style={{ marginLeft: "8px", background: "#ccfbf1", color: "#0f766e", padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>
                            {post.visibility === "secret" ? "🔒 秘密依頼" : post.visibility === "unlisted" ? "🔗 限定公開" : "🌍 公開依頼"}
                          </span>
                          {post.status === "diagnosed" ? (
                            <span style={{ marginLeft: "8px", background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "bold" }}>
                              ✓ 診断完了 (1位: {post.diagnosisResult?.rank1})
                            </span>
                          ) : (
                            <span style={{
                              marginLeft: "8px",
                              background: readAdminConsultationIds.includes(post.id) ? "#f1f5f9" : "#e0f2fe",
                              color: readAdminConsultationIds.includes(post.id) ? "#64748b" : "#0369a1",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "10px",
                              fontWeight: "bold"
                            }}>
                              {readAdminConsultationIds.includes(post.id) ? "確認済み（未回答）" : "⏳ 未回答"}
                            </span>
                          )}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="admin-fb-date">{post.createdAt}</span>
                          {post.status !== "diagnosed" && !readAdminConsultationIds.includes(post.id) && (
                            <button
                              type="button"
                              onClick={() => {
                                markAdminConsultationsAsRead([post.id]);
                                setPlazaToast("✓ 通知を既読にしました");
                              }}
                              style={{
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                color: "#475569",
                                fontSize: "10px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                cursor: "pointer"
                              }}
                              title="診断前でも通知バッジを消す"
                            >
                              既読にする
                            </button>
                          )}
                        </div>
                      </div>

                      {post.requestedItems && post.requestedItems.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "8px 0" }}>
                          {post.requestedItems.map(item => (
                            <span key={item} style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 8px", borderRadius: "10px", color: "#334155" }}>
                              ✓ {item}
                            </span>
                          ))}
                        </div>
                      )}

                      {post.dichotomies && (
                        <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "8px", fontSize: "12px", margin: "8px 0", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                          <strong>【15二分法の自己申告】</strong><br />
                          {post.dichotomies}
                        </div>
                      )}

                      {post.quadraView && (
                        <div style={{ fontSize: "12px", margin: "6px 0", color: "#0f766e" }}>
                          <strong>クアドラ観:</strong> {post.quadraView}
                        </div>
                      )}

                      {post.relationshipType && post.relationshipType !== "指定なし" && (
                        <div style={{ fontSize: "12px", margin: "6px 0", color: "#0f766e" }}>
                          <strong>関係性の相談対象:</strong> {post.relationshipType}
                          {post.relationshipView && <span style={{ color: "#475569", marginLeft: "6px" }}>({post.relationshipView})</span>}
                        </div>
                      )}

                      {post.modelView && (
                        <div style={{ fontSize: "12px", margin: "6px 0", color: "#475569" }}>
                          <strong>モデルA/K観:</strong> {post.modelView}
                        </div>
                      )}

                      <p className="admin-feedback-body" style={{ marginTop: "8px" }}>
                        <strong>【自由記述・自己分析】</strong><br />
                        {post.freeText}
                      </p>

                      {/* 依頼者からの追加質問・意見スレッド */}
                      {post.followUps && post.followUps.length > 0 && (
                        <div style={{ background: "#fdf4ff", border: "1px solid #f0abfc", padding: "10px", borderRadius: "8px", margin: "12px 0" }}>
                          <strong style={{ fontSize: "12px", color: "#86198f" }}>💬 依頼者からの追加メッセージ ({post.followUps.length}件):</strong>
                          {post.followUps.map(fu => (
                            <div key={fu.id} style={{ marginTop: "6px", fontSize: "12px", borderTop: "1px dashed #f5d0fe", paddingTop: "6px" }}>
                              <span style={{ fontWeight: "bold", color: "#4a044e" }}>{fu.author} ({fu.createdAt}):</span>
                              <p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{fu.body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 診断結果の返信エリア */}
                      <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px dashed #cbd5e1" }}>
                        {post.status === "diagnosed" && !isReplying ? (
                          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong style={{ color: "#166534", fontSize: "13px" }}>🎉 診断結果返送済み</strong>
                              <button
                                type="button"
                                style={{ background: "none", border: "none", color: "#0284c7", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
                                onClick={() => setActiveReplyPostId(post.id)}
                              >
                                診断結果を再編集・更新する
                              </button>
                            </div>
                            <div style={{ marginTop: "8px", fontSize: "12px", color: "#14532d" }}>
                              <strong>1位:</strong> {post.diagnosisResult?.rank1} | <strong>2位:</strong> {post.diagnosisResult?.rank2 || "なし"} | <strong>3位:</strong> {post.diagnosisResult?.rank3 || "なし"}
                            </div>
                            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#166534", whiteSpace: "pre-wrap" }}>
                              {post.diagnosisResult?.reasoning}
                            </p>
                          </div>
                        ) : (
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                              <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                                ✍️ 診断結果を入力・返送
                              </strong>
                              <button
                                type="button"
                                style={{ background: "#e0f2fe", border: "1px solid #bae6fd", color: "#0284c7", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                                onClick={() => handleInsertDiagTemplate(post.id)}
                              >
                                ＋ 返信テンプレを挿入
                              </button>
                            </div>

                            {/* 順位入力 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "10px" }}>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "#475569", fontWeight: "bold" }}>第1位 (本命判定) *</label>
                                <input
                                  type="text"
                                  placeholder="例: LII (INTj)"
                                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                                  value={currentReply.rank1}
                                  onChange={e => setDiagnosisReplyInputs({
                                    ...diagnosisReplyInputs,
                                    [post.id]: { ...currentReply, rank1: e.target.value }
                                  })}
                                />
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "#475569" }}>第2位 (有力候補)</label>
                                <input
                                  type="text"
                                  placeholder="例: ILI (INTp)"
                                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                                  value={currentReply.rank2}
                                  onChange={e => setDiagnosisReplyInputs({
                                    ...diagnosisReplyInputs,
                                    [post.id]: { ...currentReply, rank2: e.target.value }
                                  })}
                                />
                              </div>
                              <div>
                                <label style={{ display: "block", fontSize: "11px", color: "#475569" }}>第3位 (検討候補)</label>
                                <input
                                  type="text"
                                  placeholder="例: EII (INFj)"
                                  style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
                                  value={currentReply.rank3}
                                  onChange={e => setDiagnosisReplyInputs({
                                    ...diagnosisReplyInputs,
                                    [post.id]: { ...currentReply, rank3: e.target.value }
                                  })}
                                />
                              </div>
                            </div>

                            {/* 考察 textarea */}
                            <div>
                              <label style={{ display: "block", fontSize: "11px", color: "#475569", fontWeight: "bold", marginBottom: "4px" }}>
                                分析・考察・アドバイスメッセージ *
                              </label>
                              <textarea
                                rows={7}
                                placeholder="15二分法や認知機能の整合性、なぜこのタイプと判定したかの論拠を長文で入力できます…"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", lineHeight: "1.6" }}
                                value={currentReply.reasoning}
                                onChange={e => setDiagnosisReplyInputs({
                                  ...diagnosisReplyInputs,
                                  [post.id]: { ...currentReply, reasoning: e.target.value }
                                })}
                              />
                            </div>

                            {/* 返送ボタン */}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                              {isReplying && (
                                <button
                                  type="button"
                                  style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "12px", cursor: "pointer" }}
                                  onClick={() => setActiveReplyPostId(null)}
                                >
                                  閉じる
                                </button>
                              )}
                              <button
                                type="button"
                                style={{ padding: "6px 16px", borderRadius: "6px", border: "none", background: "#0ea5e9", color: "#fff", fontSize: "12px", fontWeight: "bold", cursor: "pointer" }}
                                onClick={() => handleSendDiagnosisReply(post.id)}
                              >
                                診断結果を依頼者へ送信する
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        </div>
      </section>
    )}
    {activePage === "about" && <section className="about-section about-page"><div className="about-card"><div className="about-icon"><Waves size={22} /></div><div><p className="eyebrow">ABOUT TYPE DRIFT</p><h2>ここは、診断のあとに<br />立ち寄れる海。</h2><p>類型のこと。自分のこと。言葉にしづらい小さな違和感。<br />名前を置いていかなくても、思考だけは流していけます。</p></div><div className="about-stars">✦<br />·　✧</div></div></section>}
    <footer><span>type <i>drift</i></span><span>an anonymous typology community · 2026</span></footer>

    {/* ログイン・アカウント管理モーダル */}
    {loginOpen && (
      <div className="modal-backdrop" onClick={() => setLoginOpen(false)}>
        <div className="login-modal" onClick={event => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setLoginOpen(false)}><X size={18} /></button>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>海へ戻る</h2>
          <p>ログイン方法を選んでください。認証後も、海に流すボトルは匿名のままです。</p>

          <button
            type="button"
            className="login-provider"
            onClick={() => {
              const api = process.env.NEXT_PUBLIC_API_URL;
              if (api) window.location.href = `${api}/api/auth/x/redirect`;
              else setPlazaToast("NEXT_PUBLIC_API_URLを設定するとXログインが始まります");
            }}
          >
            𝕏　Xでログイン
          </button>

          <button
            type="button"
            className="login-provider"
            onClick={() => {
              const api = process.env.NEXT_PUBLIC_API_URL;
              if (api) {
                window.location.href = `${api}/api/auth/google/redirect`;
              } else {
                setIsAdminLoggedIn(true);
                localStorage.setItem("type-drift-is-admin", "true");
                setLoginOpen(false);
                setPlazaToast("Googleアカウントでログインしました");
              }
            }}
          >
            G　Googleでログイン
          </button>

          {isAdminLoggedIn && (
            <div className="admin-login-box" style={{ marginTop: "24px" }}>
              <p className="admin-logged-in-label">✓ アカウント認証済み</p>
              <div className="admin-actions-row">
                <button
                  type="button"
                  className="clean-primary-btn"
                  onClick={() => {
                    setLoginOpen(false);
                    setActivePage("activity");
                    setActivityTab("admin");
                  }}
                >
                  📮 管理トレイを開く
                </button>
                <button
                  type="button"
                  className="clean-secondary-btn"
                  onClick={() => {
                    setIsAdminLoggedIn(false);
                    setAdminEmail("");
                    localStorage.removeItem("type-drift-user-email");
                    localStorage.removeItem("type-drift-is-admin");
                    setPlazaToast("ログアウトしました");
                  }}
                >
                  ログアウト
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {/* 🐟 ブリ捕獲モーダル */}
    {buriCaughtModalOpen && (
      <div className="modal-backdrop" onClick={() => setBuriCaughtModalOpen(false)}>
        <div className="buri-modal-card" onClick={e => e.stopPropagation()}>
          <div className="buri-modal-icon">🐟</div>
          <h3 className="buri-modal-title">ブリを釣りました！</h3>
          <p className="buri-modal-body">
            海を悠々と泳いでいた丸々と太ったブリを見事に釣り上げました。<br />
            今日の食料、あるいは広場のみんなへの贈り物にどうぞ。
          </p>
          <div>
            <span className="buri-count-badge">現在のブリ所持数: {buriCount}匹</span>
          </div>
          <button
            type="button"
            className="buri-modal-close-btn"
            onClick={() => setBuriCaughtModalOpen(false)}
          >
            手元に収める
          </button>
        </div>
      </div>
    )}

    {/* 🔔 お知らせモーダル（ベルマークから開く） */}
    {announcementModalOpen && (
      <div className="modal-backdrop" onClick={() => setAnnouncementModalOpen(false)}>
        <div className="announcement-modal" onClick={e => e.stopPropagation()}>
          <div className="announcement-modal__head">
            <div>
              <span className="eyebrow">NEWS & UPDATES</span>
              <h3>お知らせ</h3>
            </div>
            <button className="modal-close" type="button" onClick={() => setAnnouncementModalOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="announcement-list">
            {/* 📮 管理者向け：自認相談室の新規受付通知カード */}
            {isAdminLoggedIn && adminPendingConsultationCount > 0 && (
              <div style={{
                background: "linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "14px",
                padding: "14px 16px",
                marginBottom: "12px",
                boxShadow: "0 2px 8px rgba(239, 68, 68, 0.08)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#b91c1c", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span>📮</span> 【運営宛】自認相談室から診断依頼が届きました！
                  </span>
                  <button
                    type="button"
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "4px 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setAnnouncementModalOpen(false);
                      setActivePage("consult");
                    }}
                  >
                    診断コンソールへ →
                  </button>
                </div>
                <p style={{ fontSize: "12px", color: "#7f1d1d", margin: "4px 0 8px" }}>
                  未対応の診断依頼・相談が <strong>{adminPendingConsultationCount}件</strong> あります。依頼者の自己分析カルテを確認して診断結果をお返事できます。
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    style={{ background: "#ffffff", border: "1px solid #fca5a5", color: "#b91c1c", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => {
                      setAnnouncementModalOpen(false);
                      setActivePage("activity");
                      setActivityTab("admin");
                    }}
                  >
                    意見箱・お知らせ管理を見る
                  </button>
                  <button
                    type="button"
                    style={{ background: "#fee2e2", border: "1px solid #f87171", color: "#991b1b", padding: "3px 8px", borderRadius: "6px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => {
                      markAdminConsultationsAsRead();
                      setPlazaToast("✓ 診断依頼の通知を既読にしました");
                    }}
                  >
                    既読にして通知を消す
                  </button>
                </div>
              </div>
            )}

            {/* 自認相談室の通知カード（最新状況があれば最上部に表示） */}
            {(() => {
              const myItems = consultationPosts.filter(p =>
                p.isMine ||
                (nickname && p.author === nickname) ||
                (typeof window !== "undefined" && localStorage.getItem("type-drift-user-key") && p.userKey === localStorage.getItem("type-drift-user-key"))
              );
              if (myItems.length === 0) return null;
              return (
                <div style={{
                  background: "linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)",
                  border: "1px solid rgba(13, 148, 136, 0.25)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  marginBottom: "12px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f766e" }}>☁️ 自認相談室からの更新</span>
                    <button
                      type="button"
                      style={{
                        background: "#0d9488",
                        color: "#fff",
                        border: "none",
                        borderRadius: "8px",
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        setAnnouncementModalOpen(false);
                        setActivePage("consult");
                      }}
                    >
                      自認相談室へ →
                    </button>
                  </div>
                  {myItems.map(c => (
                    <div key={c.id} style={{ fontSize: "12px", color: "#334155" }}>
                      <strong>{c.category === "request" ? "自認診断依頼" : (c.freeText.slice(0, 18) + "…")}</strong>: {c.status === "diagnosed" ? "✓ 診断結果が届いています！" : "受付完了・診断待ち"}
                    </div>
                  ))}
                </div>
              );
            })()}

            {announcements.map(item => (
              <article key={item.id} className={`announcement-card ${item.important ? "announcement-card--important" : ""}`}>
                <div className="announcement-card__top">
                  <span className="announcement-badge">{item.badge || "お知らせ"}</span>
                  <time className="announcement-date">{item.date}</time>
                </div>
                <h4 className="announcement-card__title">{item.title}</h4>
                <p className="announcement-card__body">{item.body}</p>
              </article>
            ))}
          </div>

          <div className="announcement-modal__foot">
            <button
              type="button"
              className="clean-modal-close-btn"
              onClick={() => setAnnouncementModalOpen(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    )}

    {/* 💌 個別メッセージ（DM）送信モーダル */}
    {dmModalTarget && (
      <div className="modal-backdrop" onClick={() => setDmModalTarget(null)}>
        <div className="dm-send-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setDmModalTarget(null)}>
            <X size={18} />
          </button>
          <div className="dm-send-modal-header">
            <span className="dm-send-avatar">{dmModalTarget.emoji}</span>
            <div>
              <span className="eyebrow">DIRECT MESSAGE</span>
              <h3>{dmModalTarget.name} へメッセージを送る</h3>
              {dmModalTarget.type && <p className="dm-send-type">{dmModalTarget.type}</p>}
            </div>
          </div>
          {dmModalTarget.bottleInfo && (
            <div className="dm-v2-bottle-reference-card" style={{ margin: "0 0 14px" }}>
              <div className="dm-ref-badge">
                <span>🌊 対象のボトル</span>
                <span>{dmModalTarget.bottleInfo.type}</span>
              </div>
              <p className="dm-ref-text">「{dmModalTarget.bottleInfo.text}」</p>
              <div className="dm-ref-footer">
                <span>{dmModalTarget.bottleInfo.author}</span>
              </div>
            </div>
          )}
          <p className="dm-send-desc">
            広場のタイムラインには流れません。あなたと{dmModalTarget.name}だけの個別メッセージです。
          </p>
          <textarea
            className="dm-send-textarea"
            value={dmModalText}
            onChange={e => setDmModalText(e.target.value)}
            placeholder="メッセージを入力…（相手からの返信は「あなたの活動」で確認できます）"
            maxLength={500}
            autoFocus
          />
          <div className="dm-send-actions">
            <button
              type="button"
              className="clean-secondary-btn"
              onClick={() => setDmModalTarget(null)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="clean-primary-btn"
              disabled={!dmModalText.trim()}
              onClick={() => {
                sendDirectMessage(dmModalTarget, dmModalText);
                setActiveDmThreadId(dmModalTarget.id);
                setDmModalTarget(null);
                setDmModalText("");
                setActivePage("activity");
                setActivityTab("messages");
              }}
            >
              <Send size={15} /> 送信する
            </button>
          </div>
        </div>
      </div>
    )}
    {composerOpen && (
      <div className="modal-backdrop" onClick={() => setComposerOpen(false)}>
        <div className="composer composer-scrollable" onClick={e => e.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setComposerOpen(false)}><X size={18} /></button>
          <p className="eyebrow">FLOAT A SECRET</p>
          <h2>何を海へ流す？</h2>
          <div className="post-mode">
            <button type="button" className={postMode === "secret" ? "active" : ""} onClick={() => setPostMode("secret")}>秘密メモ</button>
            <button type="button" className={postMode === "poll" ? "active" : ""} onClick={() => setPostMode("poll")}>アンケート</button>
            <button type="button" className={postMode === "question" ? "active" : ""} onClick={() => setPostMode("question")}>質問を流す</button>
          </div>

          <details className="bottle-prompt-drawer">
            <summary>✦ 何を書けばいいかわからない時 <small>問いをひとつ選ぶ</small></summary>
            <div className="bottle-prompt-list">
              {questionPrompts.map(prompt => <button type="button" key={prompt} onClick={() => choosePrompt(prompt)}>{prompt}</button>)}
            </div>
            <button type="button" className="question-box-link" onClick={() => { setQuestionBoxOpen(true); }}>＋みんなに質問を募集する</button>
          </details>

          {/* 設定した自認を反映させるチェックボタン */}
          <div className="saved-identity-sync-bar">
            <label className="saved-identity-checkbox">
              <input
                type="checkbox"
                checked={useSavedIdentity}
                onChange={e => {
                  const checked = e.target.checked;
                  setUseSavedIdentity(checked);
                  if (checked) {
                    setIdentity({
                      mbti: profileIdentity.mbti || "",
                      socionics: profileIdentity.socionics || "",
                      enneagram: profileIdentity.enneagram || "",
                      otherType: profileIdentity.otherType || ""
                    });
                    setPlazaToast("「あなたの活動」で設定した自認を反映しました");
                  }
                }}
              />
              <span>設定した自認を反映させる</span>
            </label>
            {useSavedIdentity && (profileIdentity.mbti || profileIdentity.socionics || profileIdentity.enneagram) ? (
              <span className="saved-identity-hint">
                （反映中: {profileIdentity.mbti || "MBTI未"} · {profileIdentity.socionics || "ソシオ未"} · {profileIdentity.enneagram || "エニア未"}）
              </span>
            ) : useSavedIdentity ? (
              <span className="saved-identity-hint">
                （自認がまだ未設定です。「あなたの活動」タブから設定できます）
              </span>
            ) : null}
          </div>

          <div className="identity-fields">
            <label>MBTI
              <select value={identity.mbti} onChange={e => setIdentity({ ...identity, mbti: e.target.value })}>
                <option value="">未設定</option>
                {mbtiOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>ソシオ
              <select value={identity.socionics} onChange={e => setIdentity({ ...identity, socionics: e.target.value })}>
                <option value="">未設定</option>
                {socionicsOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>エニア
              <input value={identity.enneagram} onChange={e => setIdentity({ ...identity, enneagram: e.target.value })} placeholder="5w4" />
            </label>
          </div>
          <input className="other-type-input" value={identity.otherType} onChange={e => setIdentity({ ...identity, otherType: e.target.value })} placeholder="その他の自認（自由入力）" />
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={postMode === "poll" ? "アンケートの質問を書く…" : "類型のこと、最近考えていること…"} maxLength={500} autoFocus />
          {postMode === "poll" && (
            <div className="poll-draft">
              {pollOptions.map((option, index) => (
                <input key={index} value={option} onChange={e => setPollOptions(pollOptions.map((value, item) => item === index ? e.target.value : value))} placeholder={`選択肢 ${index + 1}`} />
              ))}
              <button type="button" onClick={() => setPollOptions([...pollOptions, ""])}>＋選択肢を追加</button>
            </div>
          )}

          {/* スタイリングされたファイル選択 */}
          <div className="file-upload-box">
            <label className="file-upload-styled-label">
              <span className="file-upload-icon">📁</span>
              <div className="file-upload-info">
                <span className="file-upload-text">画像ファイルを添付</span>
                <span className="file-upload-sub">任意・PNG / JPG / WebP（5MBまで）</span>
              </div>
              <input type="file" className="file-upload-hidden-input" accept="image/*" onChange={e => readDraftImage(e.target.files?.[0])} />
            </label>
          </div>

          {draftImage && (
            <div className="image-preview image-preview--contained">
              <img src={draftImage} alt="添付画像のプレビュー" />
              <button type="button" onClick={() => setDraftImage(undefined)}>画像を外す</button>
            </div>
          )}
          <div className="composer__foot">
            <span>{draft.length} / 500</span>
            <button className="primary-button" type="button" onClick={publish}><Send size={16} /> 流す</button>
          </div>
        </div>
      </div>
    )}
    {questionBoxOpen && (
      <div className="modal-backdrop" onClick={() => setQuestionBoxOpen(false)}>
        <div className="question-box-modal" onClick={event => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setQuestionBoxOpen(false)}><X size={18} /></button>
          <p className="eyebrow">QUESTION BOX</p>
          <h2>みんなへの質問</h2>
          <p>誰かに聞いてみたい問いを置いていくと、次にボトルを書く人の問いの引き出しへ加わります。</p>
          <textarea value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} placeholder="例：自分と似ている人に聞いてみたいことは？" maxLength={500} autoFocus />
          <div className="question-box-modal__foot"><small>{questionDraft.length} / 500</small><div className="question-box-modal__actions"><button className="secondary-button" type="button" onClick={() => setQuestionBoxOpen(false)}>閉じる</button><button className="primary-button" type="button" onClick={submitQuestion}>質問を流す</button></div></div>
        </div>
      </div>
    )}
    {selected && (
      <div className="modal-backdrop" onClick={() => { setSelected(null); setPicked(false); }}>
        <div className="detail-modal" onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => { setSelected(null); setPicked(false); }}>
            <X size={18} />
          </button>
          <span className="detail-label">あなたが拾った秘密</span>
          <BottleCard bottle={selected} onReact={react} onOpen={() => {}} />

          {/* 💌 このボトルの主へ個別にメッセージを送るボタン */}
          <button
            type="button"
            className="bottle-send-dm-btn"
            onClick={() => {
              const b = selected;
              setSelected(null);
              setPicked(false);
              const identityParts = [b.socionics, b.mbti, b.enneagram].filter(v => v && v !== "未設定" && v !== "?");
              const identityLabel = identityParts.length > 0 ? identityParts.join(" · ") : "自認未設定";
              setDmModalTarget({
                id: `bottle-${b.id}`,
                name: "波間に漂うボトルの主",
                emoji: "🌊",
                type: identityLabel,
                bottleInfo: {
                  id: b.id,
                  text: b.text,
                  author: identityParts.length > 0 ? `匿名の${identityParts[0]}` : "匿名のボトル主",
                  type: identityLabel,
                }
              });
              setDmModalText("");
            }}
          >
            💌 このボトルの主へ個別にメッセージを送る
          </button>

          <ReplyThread replies={replyItems[selected.id] || []} onReact={replyId => reactToReply(selected.id, replyId)} onReply={replyId => setReplyParentId(replyId)} />
          <div className="reply-box">
            <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={replyParentId ? "この返信に返す…" : "そっと返信する…"} maxLength={1000} />
            <button aria-label="返信を送る" onClick={sendReply}><Send size={16} /></button>
          </div>
          <small className="reply-count">{reply.length} / 1000</small>
        </div>
      </div>
    )}
    {/* ❓ 使い方ガイド（ヘルプモーダル） */}
    {guideOpen && (
      <div className="modal-backdrop" onClick={() => setGuideOpen(false)}>
        <div className="guide-modal" onClick={e => e.stopPropagation()}>
          <div className="guide-modal-head">
            <p className="v2-badge-eyebrow">HOW TO ENJOY</p>
            <h3 className="v2-section-title" style={{ fontSize: "24px" }}>Type Drift の使い方</h3>
            <p className="v2-section-subtitle" style={{ margin: 0 }}>
              ここは、診断のあとに立ち寄れる類型と海の世界。<br />
              匿名で思考を流したり、住人と語り合ったり、自認を深めることができます。
            </p>
          </div>

          <div className="guide-cards-grid">
            <div className="guide-step-card">
              <div className="guide-step-icon" style={{ background: "#ecfeff", color: "#0891b2" }}>🌊</div>
              <div className="guide-step-content">
                <h4>1. 海を覗く（ボトルメッセージ）</h4>
                <p>
                  誰かの思考のかけらがボトルに入って波間に揺られています。拾って読んだり、ハートや返信を送れます。右上の「秘密を流す」から、あなたの胸にある違和感や思考を海へ放つこともできます。
                </p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="guide-step-icon" style={{ background: "#fdf4ff", color: "#c026d3" }}>✨</div>
              <div className="guide-step-content">
                <h4>2. 類型広場（リアルタイム交流）</h4>
                <p>
                  人とAIが同じ空の下で過ごす場所。広場にメッセージを投稿したり、住人のアバターをタップしてプロフィールの閲覧や「💌 個別メッセージ（DM）」を送ることができます。
                </p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="guide-step-icon" style={{ background: "#f0fdf4", color: "#16a34a" }}>☁️</div>
              <div className="guide-step-content">
                <h4>3. 自認相談室（診断依頼 & 議論）</h4>
                <p>
                  「ソシオニクス タイプの推定」や「15二分法の考察」などを担当者に依頼できます。診断結果が届くと通知され、考察の全文確認や追加のやり取りが可能です。みんなに相談できる公開フォーラムもあります。
                </p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="guide-step-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>🧭</div>
              <div className="guide-step-content">
                <h4>4. あなたの活動（記録とメッセージ）</h4>
                <p>
                  流したボトル、いいね・返信した履歴、個別メッセージ（DM）、届いたお返事や自認診断の通知がすべてここに集約されます。自認設定の編集もここから行えます。
                </p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="guide-step-icon" style={{ background: "#fffbeb", color: "#d97706" }}>🐛</div>
              <div className="guide-step-content">
                <h4>5. 芋虫浜 & 星座（ミニゲーム・思考実験）</h4>
                <p>
                  LSI芋虫の境界検疫テストや、ダーリンちゃんの心理テスト・数当てゲーム、認知機能の星座など、類型思考を深く愉しむコンテンツが揃っています。
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="guide-modal-close-btn"
            onClick={() => setGuideOpen(false)}
          >
            閉じる
          </button>
        </div>
      </div>
    )}
  </main>;
}
