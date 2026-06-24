# 🖤 Ink Timodal

**Time × Mood × Journal × Task — ADHDクリエイターのための完全ローカル自己観察ツール**

> AI Creation, Human Care. The Future Drawn Together. — Ink Inc.

[![version](https://img.shields.io/badge/version-2.0.0-7c6aff)](#)
[![license](https://img.shields.io/badge/license-MIT-green)](#)
[![docker](https://img.shields.io/badge/docker-ready-blue)](#)

---

## デモ

セルフホスト版のデモはこちらから確認できます（開発者の環境で動作中）：

👉 **https://inkinc-official.github.io/ink-timodal**

※ 個人サーバーで動作しているため、メンテナンス中は繋がらない場合があります。

---

## なぜ作ったか

VikunjaとSuper Productivityの二刀流構成（CalDAV連携）を検討したが、以下の理由から自作に切り替えた。

- CalDAV経由の同期でタスク階層が崩壊する既知の欠陥
- Super Productivityの見積もり表示バグなど動作の不安定さ
- 既製品UIではブランドに統一できない
- **ADHDの過集中防止**という独自の設計思想を実現できない
- ムードトラッカー・ジャーナリングとの統合が既製品では不可能

「TodoアプリではなくADHDクリエイターの自己観察ツール」というコンセプトはこの経緯から生まれた。

---

## コンセプト

あなたの思考・感情・作業記録は、あなたのデバイスの外に出ません。
GoogleもOpenAIも見ていません。AIも自分のPCで動きます。
ここは完全にあなただけの空間です。

精神保健福祉士10年以上の経験を持つ開発者が設計した、ADHDや過集中傾向のあるクリエイター向けの自己管理ツールです。

### 一般的なTodoアプリとの違い

| | 一般的なTodoアプリ | Ink Timodal |
|---|---|---|
| 目的 | 「何をやるか」の管理 | 「何をどれだけやったか」の記録 |
| ADHD対応 | なし | 過集中防止リマインダー |
| AI | クラウドAPI | **完全ローカル（Ollama）** |
| 気分記録 | なし | 月の満ち欠けで記録 |
| プライバシー | クラウド送信 | **完全ローカル保存** |
| 料金 | 有料が多い | **完全無料** |

---

## 主な機能

| 機能 | 説明 |
|---|---|
| **タスク管理** | プロジェクト・カンバン・アイゼンハワーマトリックス |
| **タイムトラッキング** | 作業時間の計測・過集中防止リマインダー |
| **フォーカスモード** | フロータイム・ポモドーロ・カウントダウン |
| **AI分解** | ローカルLLMでタスクを自動分解 |
| **LION EYE** | 事実ベースの傾向分析（褒めない・叱らない） |
| **ムードトラッカー** | 月の満ち欠けで気分を記録 |
| **ジャーナリング** | AIプロンプト付きの日記機能 |
| **完全ローカル** | データは自分のサーバーにのみ保存 |

---

## セットアップ

### 必要なもの

- **Docker** — https://docs.docker.com/get-docker/
- **無料ドメイン（HTTPS化する場合）** — https://www.duckdns.org

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/InkInc-official/ink-timodal.git
cd ink-timodal

# セットアップスクリプトを実行（Linux/Mac）
chmod +x setup.sh
./setup.sh
```

Windowsの場合は手動セットアップをご覧ください。

### 手動セットアップ

```bash
# 1. 設定ファイルを作成
cp .env.example .env
# .envを編集してドメイン・トークン・メールを入力

# 2. 起動
docker compose up -d

# 3. 証明書取得（DuckDNSを使う場合）
docker compose run --rm certbot certonly \
  --manual --preferred-challenges dns \
  --email your@email.com --agree-tos --no-eff-email \
  -d your-domain.duckdns.org
```

### Ollamaモデルのダウンロード（AI機能を使う場合）

```bash
docker compose exec ollama ollama pull gemma2:9b
```

---

## HTTPS化について

### 光回線・固定回線の場合（推奨）

DuckDNS + Let's Encryptで無料のHTTPSが使えます。`setup.sh` が自動で設定します。

### au 5G HOME・モバイル回線の場合

キャリアのCGNATによりポート開放ができません。Cloudflare Tunnelをお使いください。

```bash
# Linux/Macの場合
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# トンネル起動（ポート開放不要・HTTPS自動）
cloudflared tunnel --url http://localhost:8020
```

表示された `https://xxxx.trycloudflare.com` のURLでアクセスできます。

> **注意**: Quick Tunnelは再起動のたびURLが変わります。固定URLが必要な場合はGitHub PagesとCloudflared systemdサービスを組み合わせる方法をお試しください。

---

## アーキテクチャ

```
ブラウザ（PC・スマホ）
↓ HTTPS
Nginx（リバースプロキシ）
↓
FastAPI（Ink Timodal本体）
↓              ↓
SQLite         Ollama（ローカルLLM）
（データ）
```

---

## ライセンス

MIT License — © 2026 黒井葉跡 / Ink Inc.

---

## Ink Inc.について

**AI Creation, Human Care. The Future Drawn Together.**

AIによる創造と人によるケアを両立するライバー事務所です。
「無料でもここまでできる」を体現するためにすべてのツールを無料で公開しています。

- Web: https://inkinc-hp.vercel.app/
- X: https://x.com/InkInc_Info
- GitHub: https://github.com/InkInc-official
