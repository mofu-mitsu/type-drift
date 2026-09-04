# type-drift

## 類型の秘密メモ

診断のあとに立ち寄れる海。類型のこと、自分のこと、言葉にしづらい小さな違和感を、匿名のボトルに入れて流すコミュニティです。

## 現在できること（フロントエンド試作）

- 海を覗く / 流れてくるボトルをタップして拾う
- ボトルの検索、MBTI・ソシオニクスの絞り込み（大文字小文字を吸収）
- 秘密メモとアンケートの投稿、投票
- ボトルへの返信導線
- リアクションを重ねると赤→水色→黄色→オレンジ→緑→紫…と色が変化
- 投稿時の自認入力（MBTI / ソシオニクス / エニアグラム / その他自由入力）
- 任意の画像添付（現在はブラウザ内プレビュー。公開保存は次段階）
- 広場、ひとこと、エモート、ダーリンちゃん、LSI芋虫
- 芋虫浜（クリック・タップ・矢印キーで移動、葉っぱ接触で自動成長）
- 認知機能の星座、自認相談室
- ログインモーダルからX / Google OAuthの開始導線

## 現在の重要な制限

投稿・返信・投票・リアクションは、Next.jsのブラウザ内状態です。ページ更新で消えます。Laravel API接続後に、ユーザー・ボトル・返信・リアクション・投票をPostgreSQLへ永続化します。

画像はRenderのローカルディスクへ保存しません。公開版ではCloudinary / Cloudflare R2 / S3等へアップロードし、Laravel側には画像URLだけを保存する構成にします。

## 構成

- `Next.js`：Vercel。海のUI、アニメーション、投稿フォーム
- `Laravel 13 API`：Render。認証、コンテンツ、OAuth、将来の画像アップロードAPI
- `Neon PostgreSQL`：ユーザーとコンテンツの永続化
- `Qwen / Groq`：AIキャラクター用。自認相談室には接続しない方針

Vercelに次の環境変数を設定して再デプロイすると、フロントからLaravelへ接続できます。

```env
NEXT_PUBLIC_API_URL=https://type-drift-api.onrender.com
```

## Render環境変数

最低限必要なのは次の3つです。

```env
APP_KEY=base64:（Laravel形式の32バイト鍵）
DB_URL=（Neonの接続文字列）
APP_URL=https://type-drift-api.onrender.com
```

OAuthとAIを使う場合は、`FRONTEND_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`、`X_CLIENT_ID`、`X_CLIENT_SECRET`、`X_REDIRECT_URI`、`GROQ_API_KEY`もRenderへ設定します。

`APP_KEY`はランダム文字列ではなく、必ず`base64:`で始まるLaravel形式にします。Renderの現在の500エラーは、この鍵が不正なためCookie暗号化で発生しています。「Cannot modify header information」は二次的なエラーです。

## GAS / UptimeRobot

`GAS.txt`のURLは実サービス名へ置き換えます。

```js
const RENDER_HEALTH_URL = 'https://type-drift-api.onrender.com/api/health';
```

GASをWebアプリとして公開する必要はありません。スクリプト保存後、時間主導型トリガーを10分ごとに設定します。UptimeRobotは必須ではありませんが、障害通知が必要なら同じ`/api/health`をKeyword monitorで監視します。無料プランのスリープ回避を保証するものではありません。

## 起動

```bash
npm install
npm run dev
```

ローカルのPostgreSQLは、プロジェクトルートで `docker compose up -d postgres` を実行して起動できます。Next.jsをVercelへデプロイするだけならDockerは不要です。

## 今後の実装

1. Renderの`APP_KEY`を修正し、`/api/health`を200にする
2. LaravelのSanctum認証とボトル / 返信 / リアクション / 投票APIを接続
3. Cloudinary等の外部ストレージへ画像アップロードAPIを追加
4. OAuthの本番コールバックを確認
5. Reverb等で広場をリアルタイム化
6. 芋虫浜の他プレイヤー、NPC、ランキングを永続化
