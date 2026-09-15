import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Type Drift — 類型の秘密メモ';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 84px',
          background: 'linear-gradient(135deg, #f7f3ea 0%, #d9efec 100%)',
          color: '#22383e',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, letterSpacing: 7, color: '#438f94' }}>
          TYPE DRIFT
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700 }}>
            類型の秘密メモ
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: '#658b8b' }}>
            診断のあとに立ち寄れる海。
          </div>
          <div style={{ display: 'flex', fontSize: 23, color: '#769393' }}>
            名前を置いていかなくても、思考だけは流していけます。
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 22, color: '#6ba3a0' }}>
          MBTI · SOCIONICS · ENNEAGRAM
        </div>
      </div>
    ),
    { ...size }
  );
}
