'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Send, Waves, RefreshCw } from 'lucide-react';

type ChainPageProps = {
  onBack: () => void;
  onToast: (message: string) => void;
};

type ChainState = {
  body: string;
  updated_at?: string;
};

function guestKey() {
  if (typeof window === 'undefined') return '';
  let key = localStorage.getItem('type-drift-guest-key');
  if (!key) {
    key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('type-drift-guest-key', key);
  }
  return key;
}

export default function ChainPage({ onBack, onToast }: ChainPageProps) {
  const [chain, setChain] = useState<ChainState>({ body: '海辺で、最初に見つけたのは' });
  const [addition, setAddition] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const api = process.env.NEXT_PUBLIC_API_URL;

  const loadChain = async () => {
    if (!api) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${api}/api/plaza/chain`, {
        credentials: 'include',
        headers: { 'X-Guest-Key': guestKey() },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`load failed (${response.status})`);
      const data = await response.json();
      if (data?.chain?.body) setChain(data.chain);
    } catch {
      onToast('ことばの寄せ波を読み込めませんでした。時間をおいて再読み込みしてください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadChain();
    // This page intentionally loads the shared chain once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const append = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = addition.trim();
    if (!body || saving) return;
    if (!api) {
      onToast('保存先APIが設定されていないため、追加できません。');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${api}/api/plaza/chain`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Guest-Key': guestKey() },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      const data = await response.json();
      if (data?.chain?.body) setChain(data.chain);
      setAddition('');
      onToast('ことばを寄せ波に追加しました 🌊');
    } catch {
      onToast('保存できませんでした。入力内容を残したまま、もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="chain-page" style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 64px' }}>
      <button type="button" onClick={onBack} className="ghost-button" style={{ marginBottom: 24 }}>
        <ArrowLeft size={16} /> 広場へ戻る
      </button>
      <div style={{ padding: 'clamp(24px, 5vw, 48px)', borderRadius: 28, border: '1px solid rgba(71,145,143,.18)', background: 'linear-gradient(145deg, rgba(255,255,255,.88), rgba(232,248,243,.92))', boxShadow: '0 18px 50px rgba(55,123,120,.08)' }}>
        <p className="eyebrow"><Waves size={14} /> COLLECTIVE WRITING</p>
        <h2 style={{ marginBottom: 10 }}>ことばの寄せ波</h2>
        <p style={{ color: '#71868a', lineHeight: 1.9, fontSize: 13 }}>
          みんなで少しずつ、ひとつの文章を育てていく場所。追加した言葉はNeonに保存され、別の端末からも読めます。
        </p>
        <div style={{ margin: '24px 0', padding: '24px', minHeight: 150, borderRadius: 18, background: '#fff', border: '1px solid rgba(71,145,143,.14)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: "'Noto Serif JP', serif", fontSize: 18, lineHeight: 2 }}>
          {loading ? '波の向こうから言葉を集めています…' : chain.body}
        </div>
        {chain.updated_at && <p style={{ color: '#91a5a3', fontSize: 11, marginTop: -12 }}>最終更新：{new Date(chain.updated_at).toLocaleString('ja-JP')}</p>}
        <form onSubmit={append} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="chain-addition" style={{ color: '#527b79', fontSize: 12, fontWeight: 700 }}>次に続く言葉（48文字以内）</label>
          <textarea id="chain-addition" value={addition} onChange={event => setAddition(event.target.value)} maxLength={48} rows={3} placeholder="この文章の続きを、自由に書いてみて…" style={{ width: '100%', resize: 'vertical', padding: 14, borderRadius: 14, border: '1px solid rgba(71,145,143,.25)', background: '#fff', color: '#22383e', lineHeight: 1.7 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#91a5a3', fontSize: 11 }}>{addition.length}/48文字</span>
            <button type="submit" className="primary-button" disabled={!addition.trim() || saving || loading}>
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              {saving ? '寄せています…' : 'ことばを寄せる'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
