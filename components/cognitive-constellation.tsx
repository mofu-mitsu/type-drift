"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, RefreshCw, ArrowLeft, Send, Download, Share2, Check } from "lucide-react";

export type CelestialBody = {
  id: string;
  symbol: string;
  name: string;
  role: string;
  meaning: string;
  detail: string;
  x: number; // % 0-100
  y: number; // % 0-100
  angle: number; // 0-360
  radius: number; // distance from center %
  size: number;
  color: string;
  glow: string;
  isMain?: boolean;
};

type AspectLine = {
  from: CelestialBody;
  to: CelestialBody;
  aspectType: "conjunction" | "trine" | "sextile" | "opposition";
  color: string;
};

const CELESTIAL_PRESETS: Record<string, { symbol: string; name: string; role: string; meaning: string; detail: string; color: string; glow: string; size: number }> = {
  sun: {
    symbol: "☀️",
    name: "太陽",
    role: "中心となる思考",
    meaning: "意志と自己の視座",
    detail: "あなたの思考宇宙の中心を照らす恒星。ブレない自己の軸と、あらゆる判断の基準点となります。",
    color: "#ffd97d",
    glow: "rgba(255, 217, 125, 0.5)",
    size: 28
  },
  moon: {
    symbol: "🌙",
    name: "月",
    role: "無意識に出る反応",
    meaning: "直感と安心の引力",
    detail: "中心星の周囲を穏やかに巡る潜在星。言葉になる前の感情や、ひとり静かに過ごす時間の手触りを司ります。",
    color: "#d4ebf2",
    glow: "rgba(212, 235, 242, 0.5)",
    size: 22
  },
  mercury: {
    symbol: "☿",
    name: "水星",
    role: "情報処理・分析",
    meaning: "概念の分解と伝達",
    detail: "高速で軌道を周回する知性の星。複雑な情報を明快に言語化し、外の世界へと繋ぐ役割を果たします。",
    color: "#a4d8d4",
    glow: "rgba(164, 216, 212, 0.45)",
    size: 19
  },
  venus: {
    symbol: "♀",
    name: "金星",
    role: "好み・価値判断",
    meaning: "美意識と調和",
    detail: "引力によって心地よいものを引き寄せる星。あなたが自然と惹かれてしまう世界観や美意識の基準です。",
    color: "#f7c5cc",
    glow: "rgba(247, 197, 204, 0.45)",
    size: 21
  },
  mars: {
    symbol: "♂",
    name: "火星",
    role: "行動・突破",
    meaning: "現実への介入と意志",
    detail: "強い推進力を持つ星。頭の中のアイデアを現実の形にするため、一歩を踏み出すエネルギーを与えます。",
    color: "#f5a782",
    glow: "rgba(245, 167, 130, 0.45)",
    size: 20
  },
  jupiter: {
    symbol: "♃",
    name: "木星",
    role: "思考の広がり・発展",
    meaning: "可能性の拡張と俯瞰",
    detail: "大きな重力で視野を広げる星。目の前の枠組みを超えて、遥か遠くの可能性を見渡す視座を与えます。",
    color: "#e8c39e",
    glow: "rgba(232, 195, 158, 0.45)",
    size: 26
  },
  saturn: {
    symbol: "♄",
    name: "土星",
    role: "制約・構造化",
    meaning: "秩序と持続可能な骨組み",
    detail: "美しい環を携えた星。曖昧な思考に明確な輪郭とルールを与え、確固たる構造へと結晶化させます。",
    color: "#cfc199",
    glow: "rgba(207, 193, 153, 0.45)",
    size: 24
  },
  node: {
    symbol: "☊",
    name: "ノード",
    role: "向かいやすい未来",
    meaning: "潜在的な引力と兆し",
    detail: "軌道が交差する結節点。まだ見ぬ未来の展開を無意識に察知し、探求の指針を示します。",
    color: "#c6bbf8",
    glow: "rgba(198, 187, 248, 0.5)",
    size: 19
  },
  star: {
    symbol: "🌟",
    name: "固有の恒星",
    role: "独自の静寂",
    meaning: "孤高の思索と純度",
    detail: "他者の常識や枠組みから独立した恒星。誰にも侵されない、あなただけの深い思索の空間です。",
    color: "#fff1ba",
    glow: "rgba(255, 241, 186, 0.55)",
    size: 23
  }
};

type Props = {
  onExit: () => void;
  onSendToBottle?: (text: string) => void;
};

export default function CognitiveConstellation({ onExit, onSendToBottle }: Props) {
  // ステップ管理:
  // 1: "orbit" (大きな円を描く)
  // 2: "place_star" (宇宙の好きな場所をタップして星を置く)
  // 3: "choose_spark" (生まれた星から直感で光をひとつ選ぶ)
  // 4: "result" (ホロスコープ完成・探索・保存)
  const [step, setStep] = useState<"orbit" | "place_star" | "choose_spark" | "result">("orbit");

  // 天体リストとアスペクト線
  const [celestials, setCelestials] = useState<CelestialBody[]>([]);
  const [aspectLines, setAspectLines] = useState<AspectLine[]>([]);
  const [selectedBody, setSelectedBody] = useState<CelestialBody | null>(null);

  // ステップ1: 円を描くキャンバス
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<{ x: number; y: number }[]>([]);
  const [orbitMetrics, setOrbitMetrics] = useState<{ radius: number; centerX: number; centerY: number } | null>(null);

  // ステップ3: 選択用スパーク
  const [sparks, setSparks] = useState<{ id: number; symbol: string; label: string; x: number; y: number; presetKey: string }[]>([]);

  // リアルタイム時間帯
  const [timeState, setTimeState] = useState<{ label: string; themeClass: string; timeStr: string }>({
    label: "夜の深宇宙",
    themeClass: "sky-night",
    timeStr: ""
  });

  // 流星
  const [meteors, setMeteors] = useState<{ id: number; top: number; left: number; duration: number }[]>([]);

  // トースト・共有完了通知
  const [toastMsg, setToastMsg] = useState("");

  // 時間帯計算
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes().toString().padStart(2, "0");
      const timeStr = `${h.toString().padStart(2, "0")}:${m}`;

      if (h >= 5 && h < 10) {
        setTimeState({ label: "黎明の空", themeClass: "sky-dawn", timeStr });
      } else if (h >= 10 && h < 17) {
        setTimeState({ label: "静穏の碧空", themeClass: "sky-day", timeStr });
      } else if (h >= 17 && h < 20) {
        setTimeState({ label: "黄昏の茜宙", themeClass: "sky-twilight", timeStr });
      } else {
        setTimeState({ label: "深淵の星夜", themeClass: "sky-night", timeStr });
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // 流星
  useEffect(() => {
    const meteorTimer = setInterval(() => {
      if (Math.random() < 0.65) {
        const id = Date.now();
        const top = Math.random() * 35;
        const left = Math.random() * 65;
        const duration = 1.0 + Math.random() * 0.9;
        setMeteors(prev => [...prev.slice(-2), { id, top, left, duration }]);
        setTimeout(() => {
          setMeteors(prev => prev.filter(m => m.id !== id));
        }, duration * 1000);
      }
    }, 4000);
    return () => clearInterval(meteorTimer);
  }, []);

  // キャンバス解像度とコンテナサイズの同期
  useEffect(() => {
    if (step !== "orbit") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [step]);

  // キャンバス描画（ステップ1の円）
  useEffect(() => {
    if (step !== "orbit") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (drawnPoints.length > 1) {
      ctx.strokeStyle = "rgba(133, 208, 181, 0.9)";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 14;
      ctx.shadowColor = "rgba(133, 208, 181, 0.95)";

      ctx.beginPath();
      ctx.moveTo(drawnPoints[0].x, drawnPoints[0].y);
      for (let i = 1; i < drawnPoints.length; i++) {
        ctx.lineTo(drawnPoints[i].x, drawnPoints[i].y);
      }
      ctx.stroke();
    }
  }, [drawnPoints, step]);

  // ① 円の判定（指を離したときに評価）
  const evaluateDrawnCircle = (pts: { x: number; y: number }[]) => {
    if (pts.length < 10) return false;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    const width = maxX - minX;
    const height = maxY - minY;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const dist = Math.hypot(start.x - end.x, start.y - end.y);

    // 円の直径が70px以上あり、十分なストロークがあるか
    const isBigEnough = width > 70 && height > 70;
    const isClosedOrLong = dist < Math.max(width, height) * 0.8 || pts.length > 18;

    if (isBigEnough && isClosedOrLong) {
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radius = (width + height) / 4;
      setOrbitMetrics({ radius, centerX, centerY });
      return true;
    }
    return false;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (step !== "orbit") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setDrawnPoints([{ x, y }]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || step !== "orbit") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawnPoints(prev => [...prev, { x, y }]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || step !== "orbit") return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDrawing(false);

    // 指/マウスを離した時に円の完成を判定
    if (evaluateDrawnCircle(drawnPoints)) {
      setToastMsg("軌道を検出しました ✨ 思考の星を配置できます");
      setTimeout(() => {
        setToastMsg("");
        setStep("place_star");
      }, 850);
    } else {
      if (drawnPoints.length > 3) {
        setToastMsg("もう少し大きくぐるっと円を描いてみてね 💫");
      }
      setTimeout(() => {
        setDrawnPoints([]);
      }, 600);
    }
  };

  // ② 星を置く（タップで恒星誕生）
  const handleStageClickToPlace = (e: React.MouseEvent<HTMLDivElement>) => {
    if (step !== "place_star") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const percentX = (clickX / rect.width) * 100;
    const percentY = (clickY / rect.height) * 100;

    // 中心からの距離と角度
    const dx = percentX - 50;
    const dy = percentY - 50;
    const distFromCenter = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    // 位置によってメイン天体を決定
    let mainKey = "sun";
    if (distFromCenter < 15) {
      mainKey = "sun"; // 中心に置いた＝確固たる意志・中核
    } else if (distFromCenter > 32) {
      mainKey = "star"; // 外側に置いた＝孤高の視座・独自の恒星
    } else {
      mainKey = Math.abs(dx) > Math.abs(dy) ? "saturn" : "jupiter"; // 構造または俯瞰
    }

    const preset = CELESTIAL_PRESETS[mainKey];
    const primaryStar: CelestialBody = {
      id: `${mainKey}-${Date.now()}`,
      symbol: preset.symbol,
      name: preset.name,
      role: preset.role,
      meaning: preset.meaning,
      detail: preset.detail,
      x: percentX,
      y: percentY,
      angle: (angle + 360) % 360,
      radius: distFromCenter,
      size: preset.size,
      color: preset.color,
      glow: preset.glow,
      isMain: true
    };

    setCelestials([primaryStar]);
    setToastMsg(`恒星【${preset.symbol} ${preset.name}】が誕生しました！`);

    // ③ 選択用の共鳴スパークを周りに展開
    const sparkPresets = [
      { key: "moon", label: "直感の月" },
      { key: "mercury", label: "知性の水星" },
      { key: "venus", label: "美意識の金星" },
      { key: "mars", label: "突破の火星" }
    ];

    const newSparks = sparkPresets.map((sp, idx) => {
      const sparkAngle = ((angle + (idx + 1) * 75) * Math.PI) / 180;
      const sparkDist = 18 + idx * 4;
      const sx = Math.max(15, Math.min(85, percentX + Math.cos(sparkAngle) * sparkDist));
      const sy = Math.max(15, Math.min(85, percentY + Math.sin(sparkAngle) * sparkDist));
      const def = CELESTIAL_PRESETS[sp.key];
      return {
        id: idx,
        symbol: def.symbol,
        label: sp.label,
        x: sx,
        y: sy,
        presetKey: sp.key
      };
    });

    setSparks(newSparks);

    setTimeout(() => {
      setToastMsg("");
      setStep("choose_spark");
    }, 800);
  };

  // ③ 星（光）をひとつ選ぶ
  const handleSelectSpark = (spark: typeof sparks[0]) => {
    if (step !== "choose_spark") return;

    const chosenPreset = CELESTIAL_PRESETS[spark.presetKey];
    const chosenBody: CelestialBody = {
      id: `${spark.presetKey}-${Date.now()}`,
      symbol: chosenPreset.symbol,
      name: chosenPreset.name,
      role: chosenPreset.role,
      meaning: chosenPreset.meaning,
      detail: chosenPreset.detail,
      x: spark.x,
      y: spark.y,
      angle: Math.random() * 360,
      radius: 25,
      size: chosenPreset.size,
      color: chosenPreset.color,
      glow: chosenPreset.glow
    };

    // 連鎖して他の天体たちもホロスコープ調に配置
    const remainingKeys = ["node", "asteroid", "jupiter", "saturn", "mercury", "venus"]
      .filter(k => k !== spark.presetKey && k !== celestials[0]?.id.split("-")[0])
      .slice(0, 3);

    const companionBodies: CelestialBody[] = remainingKeys.map((key, i) => {
      const def = CELESTIAL_PRESETS[key] || CELESTIAL_PRESETS.node;
      const compAngle = ((spark.x * 3 + i * 110 + 40) % 360) * (Math.PI / 180);
      const compRadius = 24 + i * 10;
      const cx = 50 + Math.cos(compAngle) * compRadius;
      const cy = 50 + Math.sin(compAngle) * (compRadius * 0.9);
      return {
        id: `${key}-${Date.now() + i + 1}`,
        symbol: def.symbol,
        name: def.name,
        role: def.role,
        meaning: def.meaning,
        detail: def.detail,
        x: Math.max(12, Math.min(88, cx)),
        y: Math.max(14, Math.min(86, cy)),
        angle: (compAngle * 180) / Math.PI,
        radius: compRadius,
        size: def.size * 0.9,
        color: def.color,
        glow: def.glow
      };
    });

    const allBodies = [...celestials, chosenBody, ...companionBodies];
    setCelestials(allBodies);

    // アスペクトライン（星座線）を結ぶ
    const lines: AspectLine[] = [];
    if (allBodies.length >= 2) {
      lines.push({ from: allBodies[0], to: allBodies[1], aspectType: "trine", color: "rgba(133, 208, 181, 0.7)" });
    }
    if (allBodies.length >= 3) {
      lines.push({ from: allBodies[1], to: allBodies[2], aspectType: "sextile", color: "rgba(255, 217, 125, 0.7)" });
    }
    if (allBodies.length >= 4) {
      lines.push({ from: allBodies[0], to: allBodies[3], aspectType: "conjunction", color: "rgba(198, 187, 248, 0.65)" });
      lines.push({ from: allBodies[2], to: allBodies[allBodies.length - 1], aspectType: "opposition", color: "rgba(247, 197, 204, 0.6)" });
    }
    setAspectLines(lines);

    // ④ 宇宙完成へ
    setSelectedBody(chosenBody);
    setToastMsg("思考宇宙が共鳴し、ホロスコープが展開されました ✨");
    setTimeout(() => {
      setToastMsg("");
      setStep("result");
    }, 700);
  };

  // 宇宙タイトル
  const getHoroscopeTitle = () => {
    const main = celestials[0];
    const sub = celestials[1];
    if (!main) return "思考の未観測星図";
    if (main.name === "太陽") return "中心意志と覚醒のホロスコープ";
    if (main.name === "固有の恒星") return "孤高の探求と純度のホロスコープ";
    if (main.name === "土星") return "結晶構造と秩序のホロスコープ";
    return `${main.name}と${sub ? sub.name : "星々"}が織りなす思考ホロスコープ`;
  };

  // 🎨 高解像度ホロスコープ画像の保存（PNGダウンロード）
  const handleDownloadImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 背景宇宙グラデーション
    const bgGrad = ctx.createRadialGradient(600, 600, 50, 600, 600, 750);
    bgGrad.addColorStop(0, "#192841");
    bgGrad.addColorStop(0.5, "#0d1728");
    bgGrad.addColorStop(1, "#060a14");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1200, 1200);

    // 星雲
    ctx.fillStyle = "rgba(133, 208, 181, 0.12)";
    ctx.beginPath();
    ctx.arc(450, 450, 320, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(198, 187, 248, 0.14)";
    ctx.beginPath();
    ctx.arc(750, 700, 360, 0, Math.PI * 2);
    ctx.fill();

    // ホロスコープ外周サークル
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(600, 600, 460, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(133, 208, 181, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(600, 600, 400, 0, Math.PI * 2);
    ctx.arc(600, 600, 240, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 12の度数マーカー
    for (let i = 0; i < 12; i++) {
      const rad = (i * 30 * Math.PI) / 180;
      const x1 = 600 + Math.cos(rad) * 440;
      const y1 = 600 + Math.sin(rad) * 440;
      const x2 = 600 + Math.cos(rad) * 460;
      const y2 = 600 + Math.sin(rad) * 460;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // アスペクトライン
    aspectLines.forEach(line => {
      const fx = (line.from.x / 100) * 1200;
      const fy = (line.from.y / 100) * 1200;
      const tx = (line.to.x / 100) * 1200;
      const ty = (line.to.y / 100) * 1200;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    });

    // 天体描画
    celestials.forEach(c => {
      const cx = (c.x / 100) * 1200;
      const cy = (c.y / 100) * 1200;

      // グロー
      ctx.fillStyle = c.glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.fill();

      // 星ノード
      ctx.fillStyle = "#0d1728";
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // シンボル文字
      ctx.fillStyle = "#ffffff";
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.symbol, cx, cy);

      // ラベル
      ctx.fillStyle = "#e0f2ee";
      ctx.font = "bold 16px monospace";
      ctx.fillText(c.name, cx, cy + 42);
    });

    // タイトルと装飾ヘッダー
    ctx.textAlign = "center";
    ctx.fillStyle = "#85d0b5";
    ctx.font = "bold 20px monospace";
    ctx.fillText("TYPE DRIFT · COGNITIVE HOROSCOPE", 600, 80);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px 'Noto Serif JP', serif";
    ctx.fillText(getHoroscopeTitle(), 600, 135);

    // 下部フッター
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "16px monospace";
    const nowStr = new Date().toLocaleDateString("ja-JP");
    ctx.fillText(`Observed on ${nowStr} · Anonymous Typology Sea`, 600, 1140);

    // 画像ダウンロード
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `type-drift-horoscope-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    setToastMsg("星図画像を保存しました 📷✨");
    setTimeout(() => setToastMsg(""), 3000);
  };

  // 🔗 共有機能
  const handleShare = async () => {
    const title = getHoroscopeTitle();
    const shareData = {
      title: `${title} | Type Drift`,
      text: `私の思考宇宙【${title}】を観測しました。診断ではなく、宇宙に星を置いて生まれたホロスコープです。🌌✨`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setToastMsg("共有しました！");
      } catch {
        // キャンセル時は何もしない
      }
    } else {
      try {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        setToastMsg("共有文とURLをコピーしました 📋");
      } catch {
        setToastMsg("URLのコピーに対応していません");
      }
    }
    setTimeout(() => setToastMsg(""), 3000);
  };

  // ボトルへ流す
  const handleSendToBottle = () => {
    const title = getHoroscopeTitle();
    const celestialNames = celestials.map(c => `${c.symbol}${c.name}`).join(" · ");
    const text = `【思考宇宙のホロスコープを観測しました】\n🌌 星図: ${title}\n🪐 観測天体: ${celestialNames}\n${selectedBody ? `✦ 注目天体 [${selectedBody.symbol} ${selectedBody.name}]: ${selectedBody.role}（${selectedBody.meaning}）` : ""}\n\n診断の点数ではなく、宇宙に置いた星の配置から生まれたホロスコープを海へ流します。`;
    if (onSendToBottle) {
      onSendToBottle(text);
    }
  };

  // もう一度観測
  const handleReset = () => {
    setStep("orbit");
    setCelestials([]);
    setAspectLines([]);
    setSelectedBody(null);
    setDrawnPoints([]);
    setOrbitMetrics(null);
    setSparks([]);
  };

  return (
    <div className={`constellation-space ${timeState.themeClass}`}>
      <div className="space-nebula" aria-hidden="true" />
      <div className="space-stars-bg" aria-hidden="true" />

      {/* 流星 */}
      {meteors.map(m => (
        <div
          key={m.id}
          className="shooting-star"
          style={{ top: `${m.top}%`, left: `${m.left}%`, animationDuration: `${m.duration}s` }}
          aria-hidden="true"
        />
      ))}

      {/* 上部ヘッダー */}
      <header className="space-header">
        <button type="button" className="space-back-btn" onClick={onExit}>
          <ArrowLeft size={16} /> 広場へ戻る
        </button>
        <div className="space-title-badge">
          <Sparkles size={14} className="sparkle-icon" />
          <span>COGNITIVE HOROSCOPE</span>
          <span className="space-time-pill">{timeState.label} · {timeState.timeStr}</span>
        </div>
      </header>

      {/* 通知トースト */}
      {toastMsg && (
        <div className="gimmick-toast">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* メイン宇宙キャンバスステージ */}
      <div
        ref={stageRef}
        className={`space-stage stage-step-${step}`}
        onClick={step === "place_star" ? handleStageClickToPlace : undefined}
      >
        {/* ホロスコープ幾何学リング */}
        <div className="horoscope-disc" aria-hidden="true">
          <div className="disc-outer-ring" />
          <div className="disc-middle-ring" />
          <div className="disc-inner-ring" />
          <div className="disc-axis-1" />
          <div className="disc-axis-2" />
          {/* 12の度数マーク */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
            <span
              key={deg}
              className="disc-degree-mark"
              style={{ transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-260px)` }}
            >
              ·
            </span>
          ))}
        </div>

        {/* アスペクト線（SVG） */}
        <svg className="constellation-svg" aria-hidden="true">
          {aspectLines.map((line, idx) => (
            <g key={`aspect-${idx}`}>
              <line
                x1={`${line.from.x}%`}
                y1={`${line.from.y}%`}
                x2={`${line.to.x}%`}
                y2={`${line.to.y}%`}
                stroke={line.color}
                strokeWidth="2"
                strokeDasharray="5 5"
                className="aspect-svg-line"
              />
              <line
                x1={`${line.from.x}%`}
                y1={`${line.from.y}%`}
                x2={`${line.to.x}%`}
                y2={`${line.to.y}%`}
                stroke={line.color}
                strokeWidth="6"
                filter="blur(3px)"
                opacity="0.4"
              />
            </g>
          ))}
        </svg>

        {/* 誕生した天体たち */}
        {celestials.map(body => {
          const isSelected = selectedBody?.id === body.id;
          return (
            <button
              key={body.id}
              type="button"
              className={`celestial-node ${body.isMain ? "is-main-star" : ""} ${isSelected ? "is-selected" : ""}`}
              style={{
                left: `${body.x}%`,
                top: `${body.y}%`,
                borderColor: body.color,
                boxShadow: `0 0 24px ${body.glow}`
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBody(body);
              }}
            >
              <span className="celestial-symbol">{body.symbol}</span>
              <span className="celestial-halo" style={{ background: body.glow }} />
              <span className="celestial-label">{body.name}</span>
            </button>
          );
        })}

        {/* ① 円を描くステップ */}
        {step === "orbit" && (
          <div
            className="orbit-full-screen-layer"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <canvas ref={canvasRef} width={800} height={600} className="orbit-full-canvas" />

            {/* ガイドサークル（大きな円） */}
            <div className="orbit-guide-circle">
              <div className="orbit-pulse-ring" />
              <div className="orbit-guide-content">
                <span className="step-tag">STEP 1</span>
                <h2>大きな円を描いてください</h2>
                <p>
                  この円の中で、指やマウスをぐるっと回してドラッグ。<br />
                  あなたの描いた円から、思考宇宙のベース軌道が生成されます。
                </p>
                <button
                  type="button"
                  className="orbit-skip-link"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOrbitMetrics({ radius: 140, centerX: 400, centerY: 300 });
                    setToastMsg("思考宇宙の軌道を生成しました ✨");
                    setStep("place_star");
                    setTimeout(() => setToastMsg(""), 2000);
                  }}
                >
                  軌道を自動生成して次へ →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ② 星を置くステップ */}
        {step === "place_star" && (
          <div className="gimmick-prompt-overlay">
            <div className="gimmick-prompt-card">
              <span className="step-tag">STEP 2</span>
              <h2>宇宙の好きな場所をタップ</h2>
              <p>
                宇宙空間のどこでも構いません。<br />
                直感で選んだ位置に、あなたの原初の恒星が誕生します。
              </p>
            </div>
          </div>
        )}

        {/* ③ 星（光）をひとつ選ぶステップ */}
        {step === "choose_spark" && (
          <>
            <div className="gimmick-prompt-overlay">
              <div className="gimmick-prompt-card">
                <span className="step-tag">STEP 3</span>
                <h2>惹かれる光をひとつタップ</h2>
                <p>恒星の周囲に生まれた4つの光から、直感で選んでください。</p>
              </div>
            </div>

            {/* 選択用のスパークたち */}
            {sparks.map(sp => (
              <button
                key={sp.id}
                type="button"
                className="spark-choice-btn"
                style={{ left: `${sp.x}%`, top: `${sp.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectSpark(sp);
                }}
              >
                <span className="spark-choice-symbol">{sp.symbol}</span>
                <span className="spark-choice-label">{sp.label}</span>
                <span className="spark-choice-aura" />
              </button>
            ))}
          </>
        )}
      </div>

      {/* ④ 宇宙完成（ホロスコープ結果パネル：宇宙ステージの真下に展開） */}
      {step === "result" && (
        <div className="horoscope-result-panel horoscope-result-panel--below">
          <div className="horoscope-head">
            <div className="horoscope-titles">
              <span className="eyebrow">YOUR COGNITIVE HOROSCOPE</span>
              <h2>{getHoroscopeTitle()}</h2>
            </div>
            <div className="horoscope-actions-top">
              <button type="button" className="btn-icon" onClick={handleDownloadImage} title="星図画像を保存">
                <Download size={15} /> <span>画像保存</span>
              </button>
              <button type="button" className="btn-icon" onClick={handleShare} title="星図を共有">
                <Share2 size={15} /> <span>共有</span>
              </button>
            </div>
          </div>

          {selectedBody && (
            <div className="celestial-detail-box">
              <div className="detail-box-head">
                <span className="detail-symbol" style={{ color: selectedBody.color }}>
                  {selectedBody.symbol}
                </span>
                <div>
                  <h4>{selectedBody.name} <small>{selectedBody.role}</small></h4>
                  <span className="detail-meaning">{selectedBody.meaning}</span>
                </div>
              </div>
              <p className="detail-text">{selectedBody.detail}</p>
            </div>
          )}

          <div className="horoscope-bottom-actions">
            <button type="button" className="btn-primary" onClick={handleSendToBottle}>
              <Send size={15} /> 観測記録をボトルに流す
            </button>
            <button type="button" className="btn-secondary" onClick={handleReset}>
              <RefreshCw size={15} /> 新しい宇宙を創る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
