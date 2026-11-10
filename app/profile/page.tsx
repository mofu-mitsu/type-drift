'use client';

import { useEffect, useState } from "react";
import { ArrowUpRight, ExternalLink, Waves } from "lucide-react";

type PublicLink = { id?: string; title: string; url: string };
type SharedProfile = {
  name: string;
  mbti: string;
  socionics: string;
  enneagram: string;
  otherType: string;
  bio: string;
  image: string;
  links: PublicLink[];
};

const emptyProfile: SharedProfile = {
  name: "匿名の誰か", mbti: "", socionics: "", enneagram: "", otherType: "", bio: "", image: "", links: [],
};

export default function PublicProfilePage() {
  const [profile, setProfile] = useState<SharedProfile>(emptyProfile);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setFromPayload = (data: Partial<SharedProfile>) => {
      const links = Array.isArray(data.links) ? data.links.filter((item): item is PublicLink =>
        !!item && typeof item.title === "string" && typeof item.url === "string" && /^https?:\/\//i.test(item.url)
      ).slice(0, 12) : [];
      const image = typeof data.image === "string" && /^https?:\/\//i.test(data.image) ? data.image : "";
      setProfile({
        name: typeof data.name === "string" && data.name ? data.name : "匿名の誰か",
        mbti: data.mbti || "",
        socionics: data.socionics || "",
        enneagram: data.enneagram || "",
        otherType: data.otherType || "",
        bio: data.bio || "",
        image,
        links,
      });
    };
    const shareId = params.get("share");
    if (shareId) {
      void fetch(`/api/share/${encodeURIComponent(shareId)}`, { cache: "no-store" })
        .then(response => { if (!response.ok) throw new Error(`Share lookup failed: ${response.status}`); return response.json(); })
        .then(result => {
          if (result.kind !== "profile") throw new Error("Wrong share type");
          setFromPayload(result.payload || {});
        })
        .catch(error => console.error("[Type Drift] shared profile lookup failed", error));
      return;
    }
    let links: PublicLink[] = [];
    try {
      const parsed = JSON.parse(params.get("links") || "[]");
      if (Array.isArray(parsed)) links = parsed.filter((item): item is PublicLink =>
        item && typeof item.title === "string" && typeof item.url === "string" && /^https?:\/\//i.test(item.url)
      ).slice(0, 12);
    } catch {}
    setFromPayload({
      name: params.get("name") || "匿名の誰か",
      mbti: params.get("mbti") || "",
      socionics: params.get("socionics") || "",
      enneagram: params.get("enneagram") || "",
      otherType: params.get("otherType") || "",
      bio: params.get("bio") || "",
      image: params.get("image") || "",
      links,
    });
  }, []);

  const types = [
    ["MBTI", profile.mbti],
    ["ソシオニクス", profile.socionics],
    ["エニアグラム", profile.enneagram],
    ["その他", profile.otherType],
  ].filter((item) => item[1]);

  return (
    <main className="public-profile-page">
      <header className="public-profile-topbar">
        <a className="public-profile-brand" href="/" aria-label="Type Drift ホーム">
          <span className="public-profile-brand-mark"><Waves size={19} /></span>
          <span>Type Drift</span>
        </a>
        <span className="public-profile-eyebrow">PUBLIC PROFILE</span>
      </header>

      <section className="public-profile-wrap">
        <div className="public-profile-card">
          <div className="public-profile-card-glow" aria-hidden="true" />
          <div className="public-profile-card-heading">
            <span className="public-profile-kicker">PROFILE CARD</span>
            <span className="public-profile-wave" aria-hidden="true">🌊</span>
          </div>
          <div className="public-profile-person">
            {profile.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="public-profile-avatar" src={profile.image} alt="" />
            ) : (
              <div className="public-profile-avatar public-profile-avatar-fallback" aria-hidden="true">
                {(profile.name || "◌").slice(0, 1)}
              </div>
            )}
            <div className="public-profile-name-wrap">
              <p className="public-profile-label">これは</p>
              <h1>{profile.name}</h1>
              <p className="public-profile-label">さんのプロフィールです</p>
            </div>
          </div>

          <div className="public-profile-type-grid">
            {types.length ? types.map(([label, value]) => (
              <div className="public-profile-type" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            )) : (
              <div className="public-profile-no-types">自認はまだ設定されていません</div>
            )}
          </div>

          {profile.bio && (
            <section className="public-profile-bio">
              <h2>ABOUT ME</h2>
              <p>{profile.bio}</p>
            </section>
          )}

          {profile.links.length > 0 && (
            <section className="public-profile-links">
              <h2>LINKS</h2>
              <div className="public-profile-link-list">
                {profile.links.map((link, index) => (
                  <a className="public-profile-link-button" href={link.url} target="_blank" rel="noopener noreferrer" key={link.id || link.url || index}>
                    <span className="public-profile-link-symbol"><ExternalLink size={16} /></span>
                    <span>{link.title}</span>
                    <ArrowUpRight className="public-profile-link-arrow" size={17} />
                  </a>
                ))}
              </div>
            </section>
          )}

          <div className="public-profile-footer">
            <span>海のように広がる、類型と個性の場所。</span>
            <span>TYPE DRIFT · PROFILE</span>
          </div>
        </div>

        <section className="public-profile-cta">
          <span className="public-profile-cta-icon"><Waves size={22} /></span>
          <p className="public-profile-cta-overline">FIND YOUR OWN TYPE</p>
          <h2>あなたも、Type Driftを始める。</h2>
          <p>自認を記録したり、広場で誰かと話したり。あなたらしい居場所を見つけよう。</p>
          <a className="public-profile-cta-button" href="/">
            Type Driftを始める <ArrowUpRight size={18} />
          </a>
        </section>
        <p className="public-profile-note">このカードは共有されたプロフィール情報を表示しています。</p>
      </section>
    </main>
  );
}
