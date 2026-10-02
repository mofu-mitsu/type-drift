'use client';

import { useEffect, useState } from 'react';
import { 
  Users, 
  FileText, 
  Send, 
  MessageSquare, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckSquare, 
  HelpCircle,
  Sparkles,
  ArrowRight,
  Info,
  Edit3,
  Trash2,
  Share2,
  CheckCircle2,
  Clock,
  Award,
  CornerDownRight,
  ExternalLink
} from 'lucide-react';
import { ConsultationPost, ConsultationComment, DiagnosisResult } from '@/types/consultation';
import { logActivity, logConsultation } from '@/lib/activity-log';

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxIpODHuVqaJBArR-YWSbFzznc7Ils6xmI8Lyu50yxJ9LNLj9z3fhBcXyLC2HoXBQ3s/exec";

const DICHOTOMIES_TEMPLATE = `【内向/外向】：
【直感/感覚】：
【論理/倫理】：
【合理/非合理】：
【周辺性/中心性】：
【情緒/構成】：
【主観/客観】：
【戦略/戦術】：
【利益/資源】：
【静的/動的】：
【民主主義/貴族主義】：
【質問/宣言】：
【先見/臨機】：
【確信/熟慮】：
【肯定/否定】：`;

const RELATIONSHIP_OPTIONS = [
  "指定なし",
  "双対関係 (Duality)",
  "活性化関係 (Activation)",
  "鏡像関係 (Mirror)",
  "同一関係 (Identity)",
  "半双対関係 (Semi-Duality)",
  "幻影関係 (Mirage)",
  "超自我関係 (Super-Ego)",
  "衝突関係 (Conflict)",
  "準同一関係 (Quasi-Identity)",
  "共鳴・対照関係 (Contrary / Extinguishment)",
  "要求・監督関係 (Supervision)",
  "恩恵・受託関係 (Benefit)",
];

const DIAGNOSIS_ITEMS = [
  "MBTIの特定・検証",
  "ソシオニクス タイプの推定",
  "ソシオ15二分法 (レーニン二分法)",
  "所属クアドラの判定 (アルファ/ベータ/ガンマ/デルタ)",
  "モデルA / モデルK による認知機能配置",
  "エニアグラム / トライタイプ / 本能のサブタイプ",
  "関係性 (双対・衝突・鏡像等) の相性観測",
];

interface ConsultationRoomProps {
  posts: ConsultationPost[];
  onAddPost: (post: ConsultationPost) => void;
  onUpdatePost: (post: ConsultationPost) => void;
  onDeletePost: (postId: string) => void;
  onAddComment: (postId: string, comment: ConsultationComment) => void;
  onUpdateComment?: (postId: string, comment: ConsultationComment) => void;
  onDeleteComment?: (postId: string, commentId: string) => void;
  onReactComment?: (postId: string, commentId: string) => void;
  onAddFollowUp?: (postId: string, message: string) => void;
  userNickname: string;
  userTypeString: string;
  gasUrl: string;
  onToast: (message: string) => void;
  onExit: () => void;
  sharedPostId?: string | null;
}

export default function ConsultationRoom({
  posts,
  onAddPost,
  onUpdatePost,
  onDeletePost,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onReactComment,
  onAddFollowUp,
  userNickname,
  userTypeString,
  gasUrl,
  onToast,
  onExit,
  sharedPostId = null,
}: ConsultationRoomProps) {
  const activeGasUrl = gasUrl || DEFAULT_GAS_URL;

  // モード切替: "forum" (みんなに相談) | "request" (自認診断を依頼)
  const [activeTab, setActiveTab] = useState<"forum" | "request">("forum");
  
  // 投稿・編集作成フォームの開閉
  const [isPosting, setIsPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  useEffect(() => {
    if (sharedPostId) setExpandedPostId(sharedPostId);
  }, [sharedPostId]);

  // フォーム入力State
  const [authorName, setAuthorName] = useState(userNickname || "");
  const [authorType, setAuthorType] = useState(userTypeString || "");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "secret">("secret");
  const [mbti, setMbti] = useState("");
  const [socionics, setSocionics] = useState("");
  const [enneagram, setEnneagram] = useState("");
  const [otherType, setOtherType] = useState("");
  const [requestedItems, setRequestedItems] = useState<string[]>([
    "ソシオニクス タイプの推定",
    "ソシオ15二分法 (レーニン二分法)"
  ]);
  const [dichotomiesText, setDichotomiesText] = useState("");
  const [quadraView, setQuadraView] = useState("");
  const [relationshipType, setRelationshipType] = useState("指定なし");
  const [relationshipView, setRelationshipView] = useState("");
  const [modelView, setModelView] = useState("");
  const [freeText, setFreeText] = useState("");

  // 長文コメント入力State (投稿IDごと)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [editingComment, setEditingComment] = useState<{ postId: string; comment: ConsultationComment } | null>(null);
  
  // 診断結果への追加質問・意見State (依頼IDごと)
  const [followUpInputs, setFollowUpInputs] = useState<Record<string, string>>({});

  // 削除インライン確認State (iframeでwindow.confirmがブロックされる対策)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // ゲストキーの取得
  const getGuestKey = () => {
    if (typeof window === "undefined") return "";
    let key = localStorage.getItem("type-drift-guest-key");
    if (!key) {
      key = `guest-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem("type-drift-guest-key", key);
    }
    return key;
  };

  const guestKey = getGuestKey();

  // 自分が投稿したかどうかの判定
  const isMyPost = (post: ConsultationPost) => {
    if (post.userKey && guestKey && post.userKey === guestKey) return true;
    if (userNickname && post.author === userNickname) return true;
    return false;
  };

  // 15二分法テンプレ挿入
  const handleInsertDichotomyTemplate = () => {
    setDichotomiesText(DICHOTOMIES_TEMPLATE);
    onToast("15二分法の記述用テンプレートを挿入しました");
  };

  const toggleRequestedItem = (item: string) => {
    setRequestedItems(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  // 編集開始
  const handleStartEdit = (post: ConsultationPost) => {
    setEditingPostId(post.id);
    setAuthorName(post.author);
    setAuthorType(post.authorType || "");
    setVisibility(post.visibility);
    setMbti(post.mbti || "");
    setSocionics(post.socionics || "");
    setEnneagram(post.enneagram || "");
    setOtherType(post.otherType || "");
    setRequestedItems(post.requestedItems || []);
    setDichotomiesText(post.dichotomies || "");
    setQuadraView(post.quadraView || "");
    setRelationshipType(post.relationshipType || "指定なし");
    setRelationshipView(post.relationshipView || "");
    setModelView(post.modelView || "");
    setFreeText(post.freeText);
    setIsPosting(true);
  };

  // 削除実行処理（iframeでwindow.confirmがブロックされるのを回避）
  const executeDelete = (postId: string) => {
    setConfirmingDeleteId(null);
    onDeletePost(postId);

    // GASへ削除通知
    try {
      fetch(activeGasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "delete_consultation",
          id: postId,
          userKey: guestKey
        })
      }).catch(() => {});
    } catch {}

    onToast("投稿を取り下げました");
  };

  // 新規投稿 or 編集保存
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeText.trim() && !dichotomiesText.trim()) {
      onToast("自由記述または15二分法の内容を入力してください");
      return;
    }

    if (editingPostId) {
      // 既存投稿の更新
      const target = posts.find(p => p.id === editingPostId);
      if (target) {
        const updatedPost: ConsultationPost = {
          ...target,
          author: authorName.trim() || target.author,
          authorType: authorType.trim() || [mbti, socionics, enneagram].filter(Boolean).join(" · ") || target.authorType,
          visibility: activeTab === "request" ? visibility : "public",
          mbti: mbti.trim(),
          socionics: socionics.trim(),
          enneagram: enneagram.trim(),
          otherType: otherType.trim(),
          requestedItems: activeTab === "request" ? requestedItems : undefined,
          dichotomies: dichotomiesText.trim(),
          quadraView: quadraView.trim(),
          relationshipType: relationshipType !== "指定なし" ? relationshipType : undefined,
          relationshipView: relationshipView.trim(),
          modelView: modelView.trim(),
          freeText: freeText.trim(),
          updatedAt: new Date().toLocaleDateString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })
        };

        onUpdatePost(updatedPost);

        // GASへ更新通知
        try {
          fetch(activeGasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "edit_consultation",
              id: updatedPost.id,
              userKey: guestKey,
              dichotomies: updatedPost.dichotomies,
              notes: updatedPost.freeText
            })
          }).catch(() => {});
        } catch {}

        onToast("内容を修正・保存しました");
      }
      setEditingPostId(null);
    } else {
      // 新規作成
      const newPost: ConsultationPost = {
        id: `consult-${Date.now()}`,
        category: activeTab,
        author: authorName.trim() || "匿名の思索者",
        authorType: authorType.trim() || [mbti, socionics, enneagram].filter(Boolean).join(" · ") || "未設定",
        userKey: guestKey,
        createdAt: new Date().toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }),
        visibility: activeTab === "request" ? visibility : "public",
        mbti: mbti.trim(),
        socionics: socionics.trim(),
        enneagram: enneagram.trim(),
        otherType: otherType.trim(),
        requestedItems: activeTab === "request" ? requestedItems : undefined,
        dichotomies: dichotomiesText.trim(),
        quadraView: quadraView.trim(),
        relationshipType: relationshipType !== "指定なし" ? relationshipType : undefined,
        relationshipView: relationshipView.trim(),
        modelView: modelView.trim(),
        freeText: freeText.trim(),
        status: "open",
        comments: []
      };

      onAddPost(newPost);
      logActivity("consultation_thread_created", { category: newPost.category, bodyLength: newPost.freeText.length }, { type: "consultation", id: newPost.id });
      logConsultation({ externalId: newPost.id, entryType: "thread", category: newPost.category, body: newPost.freeText, payload: newPost as unknown as Record<string, unknown> });

      // 自認診断依頼の場合はGAS受付窓口へ送信
      if (activeTab === "request") {
        try {
          fetch(activeGasUrl, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "diagnosis_request",
              id: newPost.id,
              nickname: newPost.author,
              userKey: guestKey,
              currentIdentity: [newPost.mbti, newPost.socionics, newPost.enneagram, newPost.otherType].filter(Boolean).join(" / "),
              visibility: newPost.visibility === "secret" ? "完全非公開（診断受付のみ）" : newPost.visibility === "unlisted" ? "一覧非表示" : "全体公開",
              requestItems: newPost.requestedItems,
              dichotomies: newPost.dichotomies,
              quadra: newPost.quadraView,
              relationship: `${newPost.relationshipType || ""} ${newPost.relationshipView || ""}`.trim(),
              model: newPost.modelView,
              notes: newPost.freeText
            })
          }).catch(() => {});
        } catch {}
        onToast("自認診断シートを受付窓口へ送信しました。丁寧に読み解き、診断結果をお返しします。");
      } else {
        onToast("相談掲示板に投稿しました。みんなの仮説を待ちましょう。");
      }
    }

    // フォームリセット
    setIsPosting(false);
    setFreeText("");
    setDichotomiesText("");
    setQuadraView("");
    setRelationshipView("");
    setModelView("");
  };

  // コメント送信 (forum)
  const handleSendComment = (postId: string) => {
    const text = commentInputs[postId]?.trim();
    if (!text) return;

    const newComment: ConsultationComment = {
      id: `c-${Date.now()}`,
      author: userNickname || "匿名の誰か",
      authorType: userTypeString || undefined,
      userKey: guestKey,
      body: text,
      createdAt: new Date().toLocaleDateString("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
      reaction: 0
    };

    onAddComment(postId, newComment);
    logActivity("consultation_reply_created", { bodyLength: text.length }, { type: "consultation", id: postId });
    logConsultation({ externalId: newComment.id, parentExternalId: postId, entryType: "reply", body: text, payload: newComment as unknown as Record<string, unknown> });
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));
    onToast("考察コメントを投稿しました");
  };

  const shareConsultation = async (post: ConsultationPost) => {
    const url = `${window.location.origin}/?page=consult&thread=${encodeURIComponent(post.id)}`;
    const text = `自認相談室「${post.authorType || "自認模索中"}」の相談を読む · Type Drift`;
    try {
      if (navigator.share) await navigator.share({ title: text, text: post.freeText.slice(0, 120), url });
      else await navigator.clipboard.writeText(url);
      onToast("相談室へのリンクを共有しました");
    } catch {
      // share dialog cancellation is not an error worth showing
    }
  };

  // 診断結果への追加質問・意見送信 (request)
  const handleSendFollowUp = (postId: string) => {
    const text = followUpInputs[postId]?.trim();
    if (!text) return;

    if (onAddFollowUp) {
      onAddFollowUp(postId, text);
    }
    logActivity("consultation_followup_created", { bodyLength: text.length }, { type: "consultation", id: postId });
    logConsultation({ externalId: `fu-${Date.now()}`, parentExternalId: postId, entryType: "followup", body: text });

    // GASへ追加質問を送信
    try {
      fetch(activeGasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "add_followup",
          id: postId,
          author: userNickname || "依頼者",
          userKey: guestKey,
          body: text
        })
      }).catch(() => {});
    } catch {}

    setFollowUpInputs(prev => ({ ...prev, [postId]: "" }));
    onToast("追加の質問・意見を担当者へ送信しました");
  };

  // 診断結果の共有（Web Share API + #typedrift）
  const handleShareResult = async (post: ConsultationPost) => {
    if (!post.diagnosisResult) return;
    const r = post.diagnosisResult;
    const shareTitle = "自認診断結果 | Type Drift";
    const shareText = `【自認診断結果】\n第1位判定: ${r.rank1}${r.rank2 ? `\n第2位判定: ${r.rank2}` : ""}${r.rank3 ? `\n第3位判定: ${r.rank3}` : ""}\n\n海と類型が交差する匿名コミュニティ「Type Drift」で自認診断を受けました。\n#typedrift`;
    const shareUrl = typeof window !== "undefined" ? window.location.origin : "";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        onToast("共有しました！");
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      onToast("診断結果テキストをクリップボードにコピーしました！ (#typedrift)");
    }
  };

  // 表示フィルタ
  // forum: みんなの相談スレッド一覧
  // request: 他人の依頼一覧は非表示！自分が投稿した依頼シートのみ表示！
  const forumPosts = posts.filter(p => p.category === "forum");
  const myRequestPosts = posts.filter(p => p.category === "request" && isMyPost(p));

  return (
    <div className="consult-redesign-container">
      {/* 上部ヘッダー */}
      <div className="consult-header">
        <div className="consult-header-left">
          <button type="button" className="consult-back-btn" onClick={onExit}>
            ← 広場へ戻る
          </button>
          <div className="consult-titles">
            <p className="v2-badge-eyebrow" style={{ margin: "0 0 4px" }}>TYPOLOGY CONSULTATION</p>
            <h2 className="v2-section-title">自認相談室</h2>
          </div>
        </div>

        <button 
          type="button" 
          className="consult-primary-btn"
          onClick={() => {
            setEditingPostId(null);
            setFreeText("");
            setDichotomiesText("");
            setIsPosting(true);
          }}
        >
          {activeTab === "forum" ? (
            <><MessageSquare size={16} /> 相談スレッドを立てる</>
          ) : (
            <><Sparkles size={16} /> 診断依頼シートを書く</>
          )}
        </button>
      </div>

      {/* 趣旨説明バナー */}
      <div className="consult-concept-banner">
        <div className="consult-concept-icon">
          <Users size={22} />
        </div>
        <div className="consult-concept-text">
          <strong>機械的な判定ではなく、人為的なニュアンスを紐解く場所</strong>
          <p>
            診断テストの自動判定では捉えきれない、言葉の選び方・日常の違和感・認知の微細な癖を、類型好き同士や診断担当者が人為的にじっくり考え合う相談室です。
          </p>
        </div>
      </div>

      {/* タブナビゲーション */}
      <div className="consult-tabs">
        <button
          type="button"
          className={`consult-tab ${activeTab === "forum" ? "active" : ""}`}
          onClick={() => { setActiveTab("forum"); setIsPosting(false); setEditingPostId(null); }}
        >
          <Users size={16} />
          <span>みんなに相談</span>
          <small>掲示板形式で仮説を交換</small>
        </button>
        <button
          type="button"
          className={`consult-tab ${activeTab === "request" ? "active" : ""}`}
          onClick={() => { setActiveTab("request"); setIsPosting(false); setEditingPostId(null); }}
        >
          <FileText size={16} />
          <span>自認診断を依頼</span>
          <small>個別シートで担当者へ分析依頼</small>
        </button>
      </div>

      {/* 投稿フォームモーダル・アコーディオン */}
      {isPosting && (
        <div className="consult-form-card">
          <div className="consult-form-head">
            <div>
              <h3>
                {editingPostId 
                  ? "✏️ 相談・依頼内容を修正する" 
                  : activeTab === "forum" 
                    ? "💬 みんなに自認を相談するスレッド" 
                    : "✨ 自認診断依頼シート"}
              </h3>
              <p>
                {activeTab === "forum"
                  ? "類型好きのみんなに読んでもらい、コメントや仮説を募集します。"
                  : "送信されたシートは診断受付窓口に安全に記録され、類型診断者によって丁寧に読み解かれます。"}
              </p>
            </div>
            <button 
              type="button" 
              className="consult-form-close" 
              onClick={() => { setIsPosting(false); setEditingPostId(null); }}
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="consult-form-body">
            {/* 1. 基本情報 */}
            <div className="consult-section-block">
              <div className="consult-section-title">
                <span className="step-num">1</span>
                <h4>基本情報</h4>
              </div>
              <div className="consult-grid-fields">
                <div className="consult-field">
                  <label>ニックネーム</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={e => setAuthorName(e.target.value)}
                    placeholder="匿名でも構いません"
                    maxLength={20}
                  />
                </div>
                <div className="consult-field">
                  <label>現在の自認 (MBTI)</label>
                  <input
                    type="text"
                    value={mbti}
                    onChange={e => setMbti(e.target.value)}
                    placeholder="例: INTP または 模索中"
                    maxLength={20}
                  />
                </div>
                <div className="consult-field">
                  <label>ソシオニクス</label>
                  <input
                    type="text"
                    value={socionics}
                    onChange={e => setSocionics(e.target.value)}
                    placeholder="例: LII / ILI 迷い"
                    maxLength={20}
                  />
                </div>
                <div className="consult-field">
                  <label>エニアグラム</label>
                  <input
                    type="text"
                    value={enneagram}
                    onChange={e => setEnneagram(e.target.value)}
                    placeholder="例: 5w6 または 4w5"
                    maxLength={20}
                  />
                </div>
                <div className="consult-field">
                  <label>その他 (サイコソフィ等)</label>
                  <input
                    type="text"
                    value={otherType}
                    onChange={e => setOtherType(e.target.value)}
                    placeholder="例: FVLE, LVEF など"
                    maxLength={30}
                  />
                </div>
              </div>
            </div>

            {/* 診断依頼モード専用: 依頼項目 */}
            {activeTab === "request" && (
              <>
                <div className="consult-section-block">
                  <div className="consult-section-title">
                    <span className="step-num">2</span>
                    <h4>希望する診断項目（複数選択可）</h4>
                  </div>
                  <div className="consult-checkbox-grid">
                    {DIAGNOSIS_ITEMS.map(item => (
                      <button
                        type="button"
                        key={item}
                        className={`diag-check-chip ${requestedItems.includes(item) ? "active" : ""}`}
                        onClick={() => toggleRequestedItem(item)}
                      >
                        <CheckSquare size={14} />
                        <span>{item}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 15二分法の記述 */}
            <div className="consult-section-block">
              <div className="consult-section-title-between">
                <div className="consult-section-title">
                  <span className="step-num">{activeTab === "request" ? "4" : "2"}</span>
                  <h4>ソシオ15二分法（テキスト記述）</h4>
                </div>
                <button
                  type="button"
                  className="consult-template-btn"
                  onClick={handleInsertDichotomyTemplate}
                >
                  ＋ 15二分法テンプレを自動挿入
                </button>
              </div>
              <p className="consult-field-hint">
                選択肢の記号だけでなく、「内向/外向」「直感/感覚」「論理/倫理」「周辺性/中心性」「情緒/構成」など、ご自身の感覚をテキストで自由に記述できます。
              </p>
              <textarea
                className="consult-textarea font-mono"
                rows={7}
                value={dichotomiesText}
                onChange={e => setDichotomiesText(e.target.value)}
                placeholder="上記のテンプレ挿入ボタンを押すか、気になる二分法をピックアップして記入してください…"
              />
            </div>

            {/* クアドラ観 & 関係性 & モデル観 */}
            <div className="consult-section-block">
              <div className="consult-section-title">
                <span className="step-num">{activeTab === "request" ? "5" : "3"}</span>
                <h4>クアドラ観 & 関係性</h4>
              </div>
              <div className="consult-grid-fields">
                <div className="consult-field">
                  <label>クアドラ観 (アルファ・ベータ・ガンマ・デルタの親近感/違和感)</label>
                  <input
                    type="text"
                    value={quadraView}
                    onChange={e => setQuadraView(e.target.value)}
                    placeholder="例: アルファの穏やかな知的雑談は好きだが、ガンマの独立性にも共感する"
                  />
                </div>
                <div className="consult-field">
                  <label>関係性の種類 (双対・活性化・鏡像・衝突など)</label>
                  <select
                    className="consult-select"
                    value={relationshipType}
                    onChange={e => setRelationshipType(e.target.value)}
                  >
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="consult-field" style={{ marginTop: "12px" }}>
                <label>関係性や相性に関する具体的なエピソード・実感</label>
                <textarea
                  className="consult-textarea"
                  rows={2}
                  value={relationshipView}
                  onChange={e => setRelationshipView(e.target.value)}
                  placeholder="例: 身近な◯◯タイプの人といる時の安心感や、すれ違いのパターンなど…"
                />
              </div>
            </div>

            {/* モデルA / モデルK観 */}
            <div className="consult-section-block">
              <div className="consult-section-title">
                <span className="step-num">{activeTab === "request" ? "6" : "4"}</span>
                <h4>モデルA / モデルK による認知機能配置の所見</h4>
              </div>
              <textarea
                className="consult-textarea"
                rows={2}
                value={modelView}
                onChange={e => setModelView(e.target.value)}
                placeholder="主導機能（Ti/Ni等）の確信度や、脆弱機能（PoLR）の苦手意識、無意識に使ってしまう機能など…"
              />
            </div>

            {/* 自由記述 */}
            <div className="consult-section-block">
              <div className="consult-section-title">
                <span className="step-num">{activeTab === "request" ? "7" : "5"}</span>
                <h4>自由記述・相談したいこと・自己分析</h4>
              </div>
              <textarea
                className="consult-textarea"
                rows={5}
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                placeholder="今一番迷っていること、類型に関する日頃の違和感、他者の意見を聞いてみたいポイントなどを自由にお書きください…"
                required
              />
            </div>

            {/* 送信フッター */}
            <div className="consult-form-footer">
              <button
                type="button"
                className="consult-cancel-btn"
                onClick={() => { setIsPosting(false); setEditingPostId(null); }}
              >
                キャンセル
              </button>
              <button type="submit" className="consult-submit-btn">
                <Send size={16} />
                {editingPostId 
                  ? "修正内容を保存する" 
                  : activeTab === "forum" 
                    ? "みんなに相談を投稿する" 
                    : "自認診断依頼を送信する"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =======================================================
          TAB 1: みんなに相談（forum）スレッド一覧
          ======================================================= */}
      {activeTab === "forum" && (
        <div className="consult-list-section">
          <div className="consult-list-header">
            <h3>💬 みんなの相談スレッド</h3>
            <span className="consult-count">{forumPosts.length} 件</span>
          </div>

          {forumPosts.length === 0 ? (
            <div className="consult-empty">
              <HelpCircle size={32} />
              <p>まだ相談スレッドがありません。<br />最初の相談シートを投稿してみませんか？</p>
            </div>
          ) : (
            <div className="consult-cards-grid">
              {forumPosts.map(post => {
                const isExpanded = expandedPostId === post.id;
                const mine = isMyPost(post);
                return (
                  <article key={post.id} className="consult-card">
                    {/* カードヘッダー */}
                    <div className="consult-card-head">
                      <div className="consult-card-author-info">
                        <span className="consult-avatar">💭</span>
                        <div>
                          <div className="consult-name-row">
                            <strong>{post.author}</strong>
                            <span className="consult-type-tag">{post.authorType || "自認模索中"}</span>
                            {mine && <span className="consult-mine-badge">あなた</span>}
                          </div>
                          <time className="consult-date">
                            {post.createdAt}
                            {post.updatedAt && <span style={{ marginLeft: "6px", color: "#94a3b8" }}>({post.updatedAt} 編集済)</span>}
                          </time>
                        </div>
                      </div>

                      {/* 自分の投稿なら編集・削除ボタン */}
                      <div className="consult-card-actions">
                        <button type="button" className="consult-action-icon-btn" title="この相談へのリンクを共有" onClick={() => void shareConsultation(post)}>
                          <Share2 size={14} /> 共有
                        </button>
                      {mine && (
                        <div className="consult-card-actions">
                          {confirmingDeleteId === post.id ? (
                            <div className="consult-delete-confirm-pop">
                              <span>本当に削除しますか？</span>
                              <button
                                type="button"
                                className="consult-confirm-delete-btn"
                                onClick={() => executeDelete(post.id)}
                              >
                                削除する
                              </button>
                              <button
                                type="button"
                                className="consult-cancel-delete-btn"
                                onClick={() => setConfirmingDeleteId(null)}
                              >
                                やめる
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="consult-action-icon-btn"
                                title="投稿を修正・編集"
                                onClick={() => handleStartEdit(post)}
                              >
                                <Edit3 size={14} /> 編集
                              </button>
                              <button
                                type="button"
                                className="consult-action-icon-btn delete"
                                title="投稿を取り下げ・削除"
                                onClick={() => setConfirmingDeleteId(post.id)}
                              >
                                <Trash2 size={14} /> 削除
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      </div>
                    </div>

                    {/* 相談の本文 */}
                    <div className="consult-card-body">
                      <p className="consult-body-text">{post.freeText}</p>
                    </div>

                    {/* 詳細アコーディオン */}
                    {isExpanded && (
                      <div className="consult-expanded-details">
                        {post.dichotomies && (
                          <div className="expanded-detail-section">
                            <h5>15二分法の記述</h5>
                            <pre className="detail-pre-text">{post.dichotomies}</pre>
                          </div>
                        )}

                        {post.quadraView && (
                          <div className="expanded-detail-section">
                            <h5>クアドラ観</h5>
                            <p>{post.quadraView}</p>
                          </div>
                        )}

                        {(post.relationshipType || post.relationshipView) && (
                          <div className="expanded-detail-section">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <h5 style={{ margin: 0 }}>関係性の所見・実感</h5>
                              {post.relationshipType && post.relationshipType !== "指定なし" && (
                                <span className="relationship-badge">
                                  ❤️ {post.relationshipType}
                                </span>
                              )}
                            </div>
                            {post.relationshipView && (
                              <div className="relationship-detail-box">
                                <h6>💬 エピソード・感覚</h6>
                                <p>{post.relationshipView}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {post.modelView && (
                          <div className="expanded-detail-section">
                            <h5>モデルA / モデルK観</h5>
                            <p>{post.modelView}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* アコーディオン開閉ボタン */}
                    <div className="consult-card-toggle-row">
                      <button
                        type="button"
                        className="consult-toggle-btn"
                        onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                      >
                        {isExpanded ? "詳細シートを閉じる ↑" : "15二分法や各項目を展開する ↓"}
                      </button>
                    </div>

                    {/* コメント・考察セクション（長文対応textarea） */}
                    <div className="consult-comments-section">
                      <div className="consult-comments-head">
                        <MessageSquare size={14} />
                        <span>みんなの考察・返信 ({post.comments?.length || 0})</span>
                      </div>

                      {post.comments && post.comments.length > 0 && (
                        <div className="consult-comments-list">
                          {post.comments.map(c => (
                            <div key={c.id} className="consult-comment-item">
                              <div className="consult-comment-head">
                                <span className="comment-author">
                                  {c.author} {c.authorType ? `(${c.authorType})` : ""}
                                </span>
                                <time className="comment-date">{c.createdAt}</time>
                              </div>
                              {editingComment?.comment.id === c.id ? (
                                <div className="consult-comment-edit-row">
                                  <textarea value={editingComment.comment.body} onChange={e => setEditingComment({ ...editingComment, comment: { ...editingComment.comment, body: e.target.value } })} />
                                  <button type="button" onClick={() => { onUpdateComment?.(post.id, editingComment.comment); logConsultation({ externalId: editingComment.comment.id, parentExternalId: post.id, entryType: "reply", body: editingComment.comment.body, payload: { ...editingComment.comment, edited: true } }); setEditingComment(null); }}>保存</button>
                                  <button type="button" onClick={() => setEditingComment(null)}>取消</button>
                                </div>
                              ) : (
                                <>
                                  <p className="comment-body" style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
                                  <div className="consult-comment-tools">
                                    <button type="button" onClick={() => { onReactComment?.(post.id, c.id); logConsultation({ externalId: `reaction-${c.id}-${Date.now()}`, parentExternalId: post.id, entryType: "reply", body: "reaction", payload: { commentId: c.id, kind: "reaction" } }); }}>♡ {c.reaction ? `+${c.reaction}` : "反応"}</button>
                                    {c.userKey === guestKey && <>
                                      <button type="button" onClick={() => setEditingComment({ postId: post.id, comment: c })}>編集</button>
                                      <button type="button" onClick={() => onDeleteComment?.(post.id, c.id)}>削除</button>
                                    </>}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 長文コメント入力エリア */}
                      <div className="consult-comment-input-block">
                        <textarea
                          rows={3}
                          className="consult-comment-textarea"
                          value={commentInputs[post.id] || ""}
                          onChange={e => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                          placeholder="この自認についての考察、視点、仮説を長文で入力できます（改行可）…"
                          maxLength={1500}
                        />
                        <div className="consult-comment-footer">
                          <span className="comment-char-count">
                            {(commentInputs[post.id] || "").length} / 1500文字
                          </span>
                          <button
                            type="button"
                            className="consult-comment-send-btn"
                            onClick={() => handleSendComment(post.id)}
                            disabled={!commentInputs[post.id]?.trim()}
                          >
                            <Send size={13} /> 考察を投稿する
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =======================================================
          TAB 2: 自認診断を依頼（request）
          ※ 他人の依頼一覧は非表示！自分が送信したシートのみ表示！
          ======================================================= */}
      {activeTab === "request" && (
        <div className="consult-my-requests-section">
          <div className="consult-request-hero-box">
            <div className="hero-box-left">
              <Award size={28} className="hero-box-icon" />
              <div>
                <h3>個別自認診断カルテ</h3>
                <p>
                  15二分法や認知機能、クアドラの傾向をもとに、診断担当者があなた独自の類型と思考の辻褄を客観的に分析・判定します。
                </p>
              </div>
            </div>
            {!isPosting && (
              <button
                type="button"
                className="consult-primary-btn"
                onClick={() => {
                  setEditingPostId(null);
                  setFreeText("");
                  setDichotomiesText("");
                  setIsPosting(true);
                }}
              >
                <Sparkles size={16} /> 診断依頼シートを書く
              </button>
            )}
          </div>

          <div className="consult-list-header" style={{ marginTop: "24px" }}>
            <h3>あなたの依頼カルテ・診断履歴</h3>
            <span className="consult-count">{myRequestPosts.length} 件</span>
          </div>

          {myRequestPosts.length === 0 ? (
            <div className="consult-empty">
              <HelpCircle size={32} />
              <p>
                まだ診断依頼を送信していません。<br />
                上の「診断依頼シートを書く」から、15二分法や自認の迷いを送ってみましょう。
              </p>
            </div>
          ) : (
            <div className="consult-my-cards-list">
              {myRequestPosts.map(post => {
                const isDiagnosed = post.status === "diagnosed" && post.diagnosisResult;
                const result = post.diagnosisResult;
                const isExpanded = expandedPostId === post.id;

                return (
                  <article key={post.id} className="consult-my-card">
                    {/* カード上部 */}
                    <div className="consult-card-head">
                      <div className="consult-card-author-info">
                        <span className="consult-avatar">✨</span>
                        <div>
                          <div className="consult-name-row">
                            <strong>{post.author} さんのカルテ</strong>
                            <span className="consult-type-tag">{post.authorType || "自認模索中"}</span>
                          </div>
                          <time className="consult-date">
                            受付日時: {post.createdAt}
                            {post.updatedAt && <span style={{ marginLeft: "6px", color: "#94a3b8" }}>({post.updatedAt} 修正済)</span>}
                          </time>
                        </div>
                      </div>

                      <div className="consult-head-badges">
                        {isDiagnosed ? (
                          <span className="consult-badge-diagnosed">
                            <CheckCircle2 size={13} /> 診断結果が届いています
                          </span>
                        ) : (
                          <span className="consult-badge-waiting">
                            <Clock size={13} /> 受付完了・分析をお待ちください
                          </span>
                        )}

                        <div className="consult-card-actions">
                          {confirmingDeleteId === post.id ? (
                            <div className="consult-delete-confirm-pop">
                              <span>カルテを取り下げますか？</span>
                              <button
                                type="button"
                                className="consult-confirm-delete-btn"
                                onClick={() => executeDelete(post.id)}
                              >
                                取り下げる
                              </button>
                              <button
                                type="button"
                                className="consult-cancel-delete-btn"
                                onClick={() => setConfirmingDeleteId(null)}
                              >
                                やめる
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="consult-action-icon-btn"
                                title="依頼シートを修正"
                                onClick={() => handleStartEdit(post)}
                              >
                                <Edit3 size={14} /> 修正
                              </button>
                              <button
                                type="button"
                                className="consult-action-icon-btn delete"
                                title="依頼を取り下げ"
                                onClick={() => setConfirmingDeleteId(post.id)}
                              >
                                <Trash2 size={14} /> 取り下げ
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 診断結果が返却されている場合のハイライトエリア */}
                    {isDiagnosed && result && (
                      <div className="consult-result-box">
                        <div className="consult-result-header">
                          <div className="result-header-title">
                            <Award size={20} />
                            <h4>担当者からの類型判定結果</h4>
                          </div>
                          <time className="result-date">回答日: {result.diagnosedAt} (担当: {result.diagnosedBy})</time>
                        </div>

                        {/* 1位/2位/3位の順位表示 */}
                        <div className="consult-ranking-row">
                          <div className="rank-card rank-card-1">
                            <span className="rank-label">第1位 本命判定</span>
                            <span className="rank-value">{result.rank1}</span>
                          </div>
                          {result.rank2 && (
                            <div className="rank-card rank-card-2">
                              <span className="rank-label">第2位 有力候補</span>
                              <span className="rank-value">{result.rank2}</span>
                            </div>
                          )}
                          {result.rank3 && (
                            <div className="rank-card rank-card-3">
                              <span className="rank-label">第3位 検討候補</span>
                              <span className="rank-value">{result.rank3}</span>
                            </div>
                          )}
                        </div>

                        {/* 考察・根拠の本文 */}
                        <div className="result-reasoning-block">
                          <h5>【考察・認知機能と二分法の分析】</h5>
                          <p style={{ whiteSpace: "pre-wrap" }}>{result.reasoning}</p>
                        </div>

                        {/* 診断結果の共有・アクションボタン */}
                        <div className="result-share-actions">
                          <button
                            type="button"
                            className="result-share-btn"
                            onClick={() => handleShareResult(post)}
                          >
                            <Share2 size={15} /> 判定結果を共有する
                          </button>
                        </div>

                        {/* 追加の質問・意見スレッド */}
                        <div className="follow-up-section">
                          <div className="follow-up-title">
                            <CornerDownRight size={14} />
                            <span>診断結果への追加質問・感想スレッド</span>
                          </div>

                          {post.followUps && post.followUps.length > 0 && (
                            <div className="follow-up-messages-list">
                              {post.followUps.map(fu => (
                                <div key={fu.id} className="follow-up-msg-item">
                                  <div className="fu-head">
                                    <strong>{fu.author}</strong>
                                    <time>{fu.createdAt}</time>
                                  </div>
                                  <p style={{ whiteSpace: "pre-wrap" }}>{fu.body}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="follow-up-input-block">
                            <textarea
                              rows={2}
                              value={followUpInputs[post.id] || ""}
                              onChange={e => setFollowUpInputs({ ...followUpInputs, [post.id]: e.target.value })}
                              placeholder="判定結果について追加で質問したいことや感想があればご記入ください…"
                              className="follow-up-textarea"
                            />
                            <button
                              type="button"
                              className="follow-up-send-btn"
                              onClick={() => handleSendFollowUp(post.id)}
                              disabled={!followUpInputs[post.id]?.trim()}
                            >
                              <Send size={13} /> 追加メッセージを送る
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 送信した依頼シートの内容 */}
                    <div className="consult-my-sheet-preview">
                      <div className="my-sheet-label">あなたの提出内容</div>
                      <p className="consult-body-text">{post.freeText}</p>
                    </div>

                    {/* 詳細トグル */}
                    {isExpanded && (
                      <div className="consult-expanded-details">
                        {post.requestedItems && post.requestedItems.length > 0 && (
                          <div className="expanded-detail-section">
                            <h5>希望した診断項目</h5>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {post.requestedItems.map(i => (
                                <span key={i} className="diag-chip-item">{i}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {post.dichotomies && (
                          <div className="expanded-detail-section">
                            <h5>15二分法の記述</h5>
                            <pre className="detail-pre-text">{post.dichotomies}</pre>
                          </div>
                        )}

                        {post.quadraView && (
                          <div className="expanded-detail-section">
                            <h5>クアドラ観</h5>
                            <p>{post.quadraView}</p>
                          </div>
                        )}

                        {(post.relationshipType || post.relationshipView) && (
                          <div className="expanded-detail-section">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <h5 style={{ margin: 0 }}>関係性の所見・実感</h5>
                              {post.relationshipType && post.relationshipType !== "指定なし" && (
                                <span className="relationship-badge">
                                  ❤️ {post.relationshipType}
                                </span>
                              )}
                            </div>
                            {post.relationshipView && (
                              <div className="relationship-detail-box">
                                <h6>💬 エピソード・感覚</h6>
                                <p>{post.relationshipView}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {post.modelView && (
                          <div className="expanded-detail-section">
                            <h5>モデルA / モデルK観</h5>
                            <p>{post.modelView}</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="consult-card-toggle-row">
                      <button
                        type="button"
                        className="consult-toggle-btn"
                        onClick={() => setExpandedPostId(isExpanded ? null : post.id)}
                      >
                        {isExpanded ? "提出詳細を閉じる ↑" : "提出した15二分法・各項目を確認する ↓"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
