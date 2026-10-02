import React from "react";

// 1. 流したボトル：美しいガラスのメッセージボトル + コルク栓 + 中の手紙 + 水面の波 + きらめき✦
export function IconV2BottleSea({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* 水面の優しい波 */}
      <path
        d="M4 27C7 26 10 27.5 13 27C16 26.5 18 25.5 21 26C24 26.5 26 27.5 29 27"
        stroke="#0d9488"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 29.5C11 29 14 30 17 29.5C20 29 22 28.5 25 29"
        stroke="#5eead4"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* ガラスボトル本体（斜めに傾いたメッセージボトル） */}
      <g transform="rotate(-25 15 16)">
        {/* コルク栓 */}
        <path
          d="M13.5 4H16.5V6.5H13.5Z"
          fill="#ccfbf1"
          stroke="#0f766e"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* ボトルの首（細いネック） */}
        <path
          d="M13 6.5H17V9H13Z"
          fill="#f0fdfa"
          stroke="#0d9488"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* ボトル肩〜胴体（丸みを帯びたガラス瓶） */}
        <path
          d="M13 9C10.5 10 9 12 9 15V22C9 23.6 10.3 25 12 25H18C19.7 25 21 23.6 21 22V15C21 12 19.5 10 17 9H13Z"
          fill="#f0fdfa"
          stroke="#0d9488"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* ボトル内の巻かれた手紙（メッセージスクロール） */}
        <path
          d="M12.5 16C12.5 14.8 13.5 14 15 14C16.5 14 17.5 14.8 17.5 16V22C17.5 22.8 16.8 23.5 16 23.5H14C13.2 23.5 12.5 22.8 12.5 22V16Z"
          fill="#99f6e4"
          stroke="#14b8a6"
          strokeWidth="1.2"
        />
        {/* 手紙を結ぶリボン・罫線 */}
        <line x1="12.5" y1="18.5" x2="17.5" y2="18.5" stroke="#0f766e" strokeWidth="1.4" />
        {/* ガラスのハイライト（光沢ライン） */}
        <path
          d="M10.8 14.5V20.5"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </g>

      {/* きらめき星 ✦ */}
      <path d="M25 5L25.8 7.2L28 8L25.8 8.8L25 11L24.2 8.8L22 8L24.2 7.2L25 5Z" fill="#0d9488" />
      <path d="M28 14L28.4 15.1L29.5 15.5L28.4 15.9L28 17L27.6 15.9L26.5 15.5L27.6 15.1L28 14Z" fill="#2dd4bf" />
    </svg>
  );
}

// 2. いいねしたボトル：吹き出しチャット + 星✦ (画像IMG_6024のパープル丸アイコン完全再現)
export function IconV2LikeChat({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* 丸みのあるチャットバブル */}
      <path
        d="M23 15C23 19.4 18.7 23 13.5 23C11.8 23 10.2 22.5 8.8 21.7L4.5 23.5L5.8 19.5C4.7 18.2 4 16.7 4 15C4 10.6 8.3 7 13.5 7C18.7 7 23 10.6 23 15Z"
        stroke="#9333ea"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 吹き出し内の3つのドット */}
      <circle cx="9.5" cy="15" r="1.2" fill="#9333ea" />
      <circle cx="13.5" cy="15" r="1.2" fill="#9333ea" />
      <circle cx="17.5" cy="15" r="1.2" fill="#9333ea" />
      {/* 右上のきらめき ✦ */}
      <path d="M25 5L25.8 7.2L28 8L25.8 8.8L25 11L24.2 8.8L22 8L24.2 7.2L25 5Z" fill="#a855f7" />
      <path d="M28 13L28.4 14.1L29.5 14.5L28.4 14.9L28 16L27.6 14.9L26.5 14.5L27.6 14.1L28 13Z" fill="#c084fc" />
    </svg>
  );
}

// 3. 返信したボトル：くるんと回る矢印 + 星✦ (画像IMG_6024のローズピンク丸アイコン完全再現)
export function IconV2ReplyArrow({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* くるんとしたリバース矢印 */}
      <path
        d="M13 9L7 15L13 21"
        stroke="#e11d48"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 15H17C21.4 15 25 18.6 25 23V24"
        stroke="#e11d48"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* きらめき ✦ */}
      <path d="M23 7L23.7 8.8L25.5 9.5L23.7 10.2L23 12L22.3 10.2L20.5 9.5L22.3 8.8L23 7Z" fill="#fb7185" />
      <path d="M10 5L10.4 6L11.4 6.4L10.4 6.8L10 7.8L9.6 6.8L8.6 6.4L9.6 6L10 5Z" fill="#fda4af" />
    </svg>
  );
}

// 4. 個別メッセージ：レター封筒 + 赤いハート❤️ (画像IMG_6024のイエロー丸アイコン完全再現)
export function IconV2LetterHeart({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* 封筒本体 */}
      <rect
        x="4"
        y="9"
        width="22"
        height="16"
        rx="3"
        stroke="#d97706"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 封筒の折り目 */}
      <path
        d="M4 11L15 19L26 11"
        stroke="#d97706"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 封筒から浮かぶ小さな赤いハート */}
      <path
        d="M24.5 4C23.2 4 22.1 4.8 21.7 5.9C21.3 4.8 20.2 4 18.9 4C17.3 4 16 5.3 16 6.9C16 9.4 21.7 13.5 21.7 13.5C21.7 13.5 27.4 9.4 27.4 6.9C27.4 5.3 26.1 4 24.5 4Z"
        fill="#ef4444"
        stroke="#b91c1c"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* きらめき */}
      <circle cx="7" cy="6" r="1" fill="#f59e0b" />
    </svg>
  );
}

// 5. 問い合わせ・返信：ドット入りチャットバブル (画像IMG_6024のブルー丸アイコン完全再現)
export function IconV2InquiryBubble({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* まあるいチャットバブル */}
      <path
        d="M16 5C9.9 5 5 9.5 5 15C5 17.5 6 19.7 7.7 21.4L6 26.5L11.5 24.8C12.9 25.3 14.4 25.6 16 25.6C22.1 25.6 27 21.1 27 15C27 9.5 22.1 5 16 5Z"
        stroke="#0284c7"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 3つのドット */}
      <circle cx="11.5" cy="15" r="1.5" fill="#0284c7" />
      <circle cx="16" cy="15" r="1.5" fill="#0284c7" />
      <circle cx="20.5" cy="15" r="1.5" fill="#0284c7" />
      {/* きらめき ✦ */}
      <path d="M26 4L26.6 5.4L28 6L26.6 6.6L26 8L25.4 6.6L24 6L25.4 5.4L26 4Z" fill="#38bdf8" />
    </svg>
  );
}

// 6. YOUR IDENTITY 惑星アバター：水色の惑星 + 軌道リング + 星✦ (画像IMG_6024完全再現)
export function IconV2IdentityPlanet({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* 軌道リング奥側 */}
      <path
        d="M9 28C6.5 25.5 8 21.5 13 18C19 13.8 28 11.5 35 12.8C38.5 13.5 40.5 15 41 17"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* 球体惑星本体（グラデーション） */}
      <circle cx="23" cy="24" r="14" fill="url(#planet_grad_v2)" />
      {/* 惑星の光沢ハイライト */}
      <path
        d="M14 19C16 14 22 12 28 14"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* 軌道リング手前側 */}
      <path
        d="M7 30C8.5 33 13 35.5 19 36.5C27 37.8 35.5 35 40 30C42.5 27 42 23.5 39 21"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M7 30C8.5 33 13 35.5 19 36.5C27 37.8 35.5 35 40 30C42.5 27 42 23.5 39 21"
        stroke="#38bdf8"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* 右上のきらめき星 ✦ */}
      <path d="M41 8L42 11L45 12L42 13L41 16L40 13L37 12L40 11L41 8Z" fill="#38bdf8" />
      <path d="M45 22L45.5 23.5L47 24L45.5 24.5L45 26L44.5 24.5L43 24L44.5 23.5L45 22Z" fill="#7dd3fc" />

      <defs>
        <radialGradient id="planet_grad_v2" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(18 19) rotate(50) scale(18)">
          <stop stopColor="#e0f2fe" />
          <stop offset="0.5" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#38bdf8" />
        </radialGradient>
      </defs>
    </svg>
  );
}
