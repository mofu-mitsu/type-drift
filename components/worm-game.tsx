'use client';

import { useEffect, useState, useRef, useCallback } from "react";

type Position = { x: number; y: number };

export default function WormGame({ onExit }: { onExit: () => void }) {
  const STAGE_SIZE = 2000;
  const SPEED = 4;
  const SPACING = 6;
  const MAX_HISTORY = 300;
  
  const [score, setScore] = useState(0);
  const [length, setLength] = useState(3);
  const [foods, setFoods] = useState<Position[]>([]);
  
  const requestRef = useRef<number>(0);
  const headPosRef = useRef<Position>({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 });
  const directionRef = useRef<{ x: number, y: number }>({ x: 1, y: 0 });
  const historyRef = useRef<Position[]>(Array(MAX_HISTORY).fill({ x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 }));
  const [renderTrigger, setRenderTrigger] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 初期キャベツ配置
  useEffect(() => {
    const initialFoods = Array.from({ length: 50 }).map(() => ({
      x: Math.random() * STAGE_SIZE,
      y: Math.random() * STAGE_SIZE
    }));
    setFoods(initialFoods);
  }, []);

  // キャベツランダム追加
  useEffect(() => {
    const interval = setInterval(() => {
      setFoods(prev => {
        if (prev.length > 100) return prev;
        return [...prev, { x: Math.random() * STAGE_SIZE, y: Math.random() * STAGE_SIZE }];
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // ゲームループ
  const update = useCallback(() => {
    const head = headPosRef.current;
    const dir = directionRef.current;
    
    const newX = Math.max(0, Math.min(STAGE_SIZE, head.x + dir.x * SPEED));
    const newY = Math.max(0, Math.min(STAGE_SIZE, head.y + dir.y * SPEED));
    const newHead = { x: newX, y: newY };
    
    headPosRef.current = newHead;
    
    historyRef.current.unshift(newHead);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.pop();
    }
    
    setRenderTrigger(prev => prev + 1);
    
    setFoods(prev => {
      let eaten = false;
      const nextFoods = prev.filter(food => {
        const dx = food.x - newHead.x;
        const dy = food.y - newHead.y;
        if (dx * dx + dy * dy < 35 * 35) {
          eaten = true;
          return false;
        }
        return true;
      });
      
      if (eaten) {
        setScore(s => s + 1);
        setLength(l => Math.min(l + 1, Math.floor(MAX_HISTORY / SPACING) - 1));
      }
      return nextFoods;
    });

    requestRef.current = requestAnimationFrame(update);
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  // マウス/タッチ移動処理
  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      directionRef.current = { x: dx / dist, y: dy / dist };
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, [handlePointerMove]);
  
  // キーボード操作
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const moves: Record<string, [number, number]> = { 
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] 
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        directionRef.current = { x: move[0], y: move[1] };
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const head = headPosRef.current;
  const stageStyle = {
    width: `${STAGE_SIZE}px`,
    height: `${STAGE_SIZE}px`,
    transform: `translate(calc(50% - ${head.x}px), calc(50% - ${head.y}px))`
  };

  const isFlipped = directionRef.current.x > 0;

  return (
    <section className="activity-section game-page">
      <p className="eyebrow">WORM BEACH</p>
      <h2>芋虫浜 <small className="score-label">🥬 {score}</small></h2>
      
      <div 
        ref={containerRef}
        className="worm-game" 
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '400px', 
          overflow: 'hidden',
          background: 'radial-gradient(circle at 20% 35%, #fff2b9 0 3px, transparent 4px), radial-gradient(circle at 75% 65%, #fff2b9 0 3px, transparent 4px), #a9d9c5'
        }}
      >
        <div className="game-stage" style={{ position: 'absolute', top: 0, left: 0, transition: 'none', ...stageStyle }}>
          {foods.map((food, i) => (
            <div key={i} style={{ position: 'absolute', left: food.x, top: food.y, fontSize: '27px', transform: 'translate(-50%, -50%)', zIndex: 1 }}>
              🥬
            </div>
          ))}
          
          {Array.from({ length }).map((_, index) => {
            const histIndex = Math.min((index + 1) * SPACING, historyRef.current.length - 1);
            const pos = historyRef.current[histIndex];
            if (!pos) return null;
            return (
              <i key={`body-${index}`} style={{ position: 'absolute', left: pos.x, top: pos.y, fontSize: '24px', transform: 'translate(-50%, -50%)', fontStyle: 'normal', zIndex: 2 }}>
                🟢
              </i>
            );
          })}
          
          <span style={{ 
            position: 'absolute', 
            left: head.x, 
            top: head.y, 
            fontSize: '32px', 
            transform: `translate(-50%, -50%) scaleX(${isFlipped ? -1 : 1})`, 
            zIndex: 10 
          }}>
            🐛
          </span>
        </div>
        <p style={{ position: 'absolute', bottom: '16px', left: '20px', margin: 0, zIndex: 20, color: '#57877c', fontFamily: "'DM Mono', monospace", fontSize: '9px' }}>
          画面をタップ・クリックした方向、または矢印キーで移動 · マップは無限大です
        </p>
      </div>
      
      <button className="play-button" type="button" onClick={onExit}>← 広場へ戻る</button>
    </section>
  );
}
