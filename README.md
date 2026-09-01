# type-drift

## 類型の秘密メモ

誰にも言えない類型の話を、匿名のボトルに入れて海へ流す、Next.js製のフロントエンドプロトタイプです。

現在はローカル状態で以下を体験できます。

- ボトル一覧と類型フィルター
- 「ボトルを拾う」のランダム体験
- リアクションの追加
- 秘密メモの投稿モーダル
- 返信導線
- 🥺 ダーリンちゃん / 🐛 LSI芋虫のAIキャラクター漂着

## 起動

```bash
npm install
npm run dev
```

## 今後の構成

- `Next.js`：海のUI、アニメーション、投稿・返信操作
- `Laravel API`：Sanctum認証、ボトル、返信、リアクション、通報、AIキャラクター制御
- `PostgreSQL`：ユーザーとコンテンツの永続化
- `Qwen系API`：AIキャラクターの返信生成

ローカルのPostgreSQLは、プロジェクトルートで `docker compose up -d postgres` を実行して起動できます。Next.jsをVercelへデプロイする際、Dockerは不要です。DockerはLaravelとPostgreSQLのローカル開発環境として使います。

フロントエンドはVercelへのGit連携デプロイと相性がよく、Laravel APIは別ホストに配置して環境変数で接続する形を想定しています。
