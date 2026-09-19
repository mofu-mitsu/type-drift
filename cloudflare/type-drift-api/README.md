# type-drift-api

Render の Laravel API から Cloudflare Worker へ移行するための API。

現在の現行フロントで必要な公開 API は芋虫ランキングです。

## 必要な設定

Cloudflare Worker の Secret に Neon の接続文字列を登録します。

DATABASE_URL

Cloudflare は Neon に接続する方法として @neondatabase/serverless をサポートしています。Hyperdrive を使う構成にも変更できます。

## 移行手順

1. npm install で lockfile を生成
2. wrangler secret put DATABASE_URL
3. Worker をデプロイ
4. NEXT_PUBLIC_API_URL を Worker URL に変更
5. 本番で GET/POST /api/worm/ranking を確認
6. 問題なければ Render の type-drift-api を撤退対象にする

この Worker をデプロイするまでは、フロント側の Render URL は変更しません。
