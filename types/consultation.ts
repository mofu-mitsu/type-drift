export interface ConsultationComment {
  id: string;
  author: string;
  authorType?: string;
  userKey?: string;
  body: string;
  createdAt: string;
  reaction?: number;
}

export interface DiagnosisResult {
  rank1: string; // 1位
  rank2?: string; // 2位
  rank3?: string; // 3位
  reasoning: string; // 考察・根拠
  diagnosedAt: string;
  diagnosedBy: string;
}

export interface ConsultationPost {
  id: string;
  category: "forum" | "request"; // "forum" = みんなに自認相談, "request" = 自認診断を依頼
  author: string;
  authorType?: string;
  userKey?: string; // 投稿者のブラウザ固有キー（本人判定・編集・削除用）
  isMine?: boolean; // ローカル作成フラグ
  createdAt: string;
  updatedAt?: string;
  
  // 自認公開設定
  visibility: "public" | "unlisted" | "secret"; // "public" = 全体公開, "unlisted" = 一覧非表示（リンク・ID指定のみ）, "secret" = 完全非公開（診断受付のみ）

  // 基本情報
  mbti?: string;
  socionics?: string;
  enneagram?: string;
  otherType?: string;

  // 診断希望チェックボックス (request時)
  requestedItems?: string[]; // 例: ["MBTI", "ソシオニクス", "15の二分法", "クアドラ", "モデルA/K", "関係性"]

  // テンプレート各項目
  dichotomies?: string; // 15二分法のテキスト記述
  quadraView?: string; // クアドラ観の記述
  relationshipType?: string; // 関係性の種類選択（双対、鏡像、活性化、衝突など）
  relationshipView?: string; // 関係性観の自由記述
  modelView?: string; // モデルA / モデルK観の記述
  freeText: string; // 自由記述・現在悩んでいること・自己分析

  // コメント一覧 (forum時)
  comments?: ConsultationComment[];
  status?: "open" | "diagnosed"; // 診断ステータス: "open" (受付中/回答待ち) | "diagnosed" (診断完了)
  
  // 診断者からの診断結果
  diagnosisResult?: DiagnosisResult;

  // 診断結果返却後の追加のやり取り（質問・意見）
  followUps?: Array<{
    id: string;
    sender: "user" | "admin";
    author: string;
    body: string;
    createdAt: string;
  }>;
}

export const INITIAL_CONSULTATION_POSTS: ConsultationPost[] = [
  {
    id: "consult-sample-1",
    category: "forum",
    author: "思索する漂流者",
    authorType: "INTJ / LII 疑い",
    createdAt: "2026/09/20 21:15",
    visibility: "public",
    mbti: "INTJ",
    socionics: "LII",
    enneagram: "5w6",
    otherType: "FVLE",
    dichotomies: "【内向/外向】極めて内向。一人で思索を深める時間を最優先します。\n【直感/感覚】直感優位。抽象的な理論体系の整合性を追究します。\n【論理/倫理】論理優先。感情的な迎合よりも、構造の客観的真偽や破綻のなさを重視します。\n【合理/非合理】目的志向で秩序を好む合理（LII）傾向。ILI特有の無気力な諦観や『何をやっても無駄』という達観はなく、むしろ正しく強固な論理フレームワークを最後まで構築したい衝動があります。",
    quadraView: "アルファの知的探求や純粋な論理構築の場に強い安心感を持ちます。ガンマの現実的・実利的な視点も理解できますが、諦めずに体系を突き詰める姿勢はアルファ寄りです。",
    relationshipType: "双対関係（ESE）",
    relationshipView: "情緒豊かで生活の温かみをもたらしてくれる人と接すると、自分の固い頭が解きほぐされる感覚があります。",
    modelView: "主導Ti（内向論理）による厳密な整合性チェックと、Ni的な将来見通しが同時に動いている感覚があり、INTJとLIIの重なりについて考えています。",
    freeText: "INTJかつソシオニクスLIIという組み合わせについて考察したいです。ILIに見られるような受動的な諦観がなく、目的意識を持って論理体系を完成させようとする場合、このタイプ配置が一番腑に落ちるのですが、皆さんの見解をお聞きしたいです。",
    comments: [
      {
        id: "c-1",
        author: "客観の観測者",
        authorType: "ILE",
        body: "非常に共感します。ILIなら『どうせ変えられない』という諦観や時間的省力化（Ni/Te）が前面に出ますが、諦めずに体系の美しさと目的を追究するのはまさに主導TiのLIIですね。INTJ（目的志向・構築的）とLIIの組み合わせは極めて自然です。",
        createdAt: "2026/09/20 22:04"
      }
    ]
  },
  {
    id: "consult-sample-2",
    category: "request",
    author: "海辺の迷い人",
    authorType: "自認模索中",
    createdAt: "2026/09/21 08:30",
    visibility: "public",
    mbti: "INFJ?",
    socionics: "IEI / EII",
    enneagram: "4w5",
    requestedItems: ["ソシオニクス", "15の二分法", "モデルA/K"],
    dichotomies: "【情緒/構成】他者の感情の機微には敏感ですが、自分から表出するのは苦手（情緒型）。\n【民主/貴族】集団の階層や肩書きよりも個々の独自性に惹かれます。",
    quadraView: "ベータの熱量には圧倒されがちで、デルタの人道的で静かな受容空間を好みます。",
    relationshipType: "活性化関係 (LSE/SLE)",
    relationshipView: "現実を動かす力強い人に助けられることが多いですが、威圧感を感じることもあります。",
    modelView: "Feの扱いについて、外界の感情を整えたいのか、内面的な倫理（Fi）を重んじているのかの区別が難しいです。",
    freeText: "自分の本質がデルタEIIなのか、ベータIEIなのか、人為的なセッション的視点から客観的に紐解いていただきたいです。よろしくお願いいたします。",
    status: "open",
    comments: []
  }
];
