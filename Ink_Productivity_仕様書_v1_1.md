# Ink Productivity 仕様書 v1.1
## Ink Inc. 所長・黒井葉跡

> **Ink Inc. presents** — AI Creation, Human Care. The Future Drawn Together.

---

## 更新履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026.06.22 | 初版作成（設計フェーズ） |
| v1.1 | 2026.06.23 | 完成版（全機能実装済み） |

---

## 1. プロダクト概要

| 項目 | 内容 |
|---|---|
| プロダクト名 | Ink Productivity |
| バージョン | v1.1 |
| 種別 | Webアプリ（内部ツール・個人利用） |
| ステータス | **✅ 稼働中** |
| アクセスURL | `http://100.65.206.126:8020` |
| ホスト | MAGICNUC AG1（Windows 11・NSSM自動起動） |
| 起動管理 | NSSM サービス名：`InkProductivity` |

---

## 2. 設計思想

VikunjaとSuper Productivityの二刀流構成（CalDAV連携）を検討したが、以下の理由から一本化した独自開発に切り替えた。

- CalDAV経由の同期でタスク階層が崩壊する既知の欠陥
- n8n・Vikunja・Super Productivityの3サービス連携は障害点が多すぎる
- UIが既製品のためInkブランドに統一できない
- Ink HabitのPython資産（SQLite・Ollama連携）をそのまま流用できる

---

## 3. 機能一覧

### 3.1 タスク管理

| 機能 | 詳細 |
|---|---|
| プロジェクト管理 | カラー付きプロジェクト作成・編集・削除 |
| タスク階層 | プロジェクト → タスク → サブタスク（2階層） |
| ステータス管理 | カンバン列と連動した日本語ステータス（未着手/実行中/保留中/完了 + カスタム） |
| 優先度 | 高・中・低 |
| 期日 | 日付指定・期限切れ警告 |
| 担当者 | 自由記述（対象ライバー名など） |
| 説明欄 | AIプロンプトのメモなどに活用 |
| メモ | タスクごとのメモ |
| 重要度・緊急度 | マトリックス用の2軸設定 |
| 受信トレイ | プロジェクト未設定タスクの自動収集 |
| 進捗% | プロジェクト別の完了率バー表示 |

### 3.2 カンバンボード

| 機能 | 詳細 |
|---|---|
| 列のカスタマイズ | 自由な名前・カラーで列を追加・編集・削除 |
| 列名=ステータス名 | 列名がそのままタスクのステータスになる設計 |
| ドラッグ&ドロップ | 列間移動でステータスを自動更新 |
| タスク追加 | 各列のフッターから直接タスクを追加 |
| タスク詳細 | カード上の「…」で詳細パネルを開く |
| タスク削除 | カード上の「✕」でモーダル確認後に削除 |

### 3.3 アイゼンハワーマトリックス

| 象限 | 重要度 | 緊急度 | 名称 |
|---|---|---|---|
| 第0象限 | 未設定 | 未設定 | 未設定 |
| 第1象限 | 高 | 高 | 緊急対応 |
| 第2象限 | 高 | 低 | 重点育成 |
| 第3象限 | 低 | 高 | 即断処理 |
| 第4象限 | 低 | 低 | 保留・断捨離 |

- ドラッグ&ドロップで象限間を移動 → 重要度・緊急度が自動更新
- タスク行にマトリックスバッジを表示（連動）
- タスク詳細パネルから直接設定可能

### 3.4 タイムトラッキング

| 機能 | 詳細 |
|---|---|
| クイックスタート | タスク名・見積もり時間を入力してすぐ開始 |
| マルチ計測 | 複数タスクの同時計測（配信しながら音楽制作など） |
| 見積もりvs実績 | 乖離をリアルタイム表示 |
| リマインダー | 同一タスク継続60分で通知（設定変更可） |
| 過去セッション追加 | 計測し忘れた記録を手動追加 |
| セッション編集 | タスク名・カテゴリ・プロジェクト・時刻・メモを編集 |
| セッション削除 | モーダル確認後に削除 |

### 3.5 フォーカスモード

| モード | 詳細 |
|---|---|
| フロータイム | シンプルなストップウォッチ |
| ポモドーロ | 25分作業→5分休憩のサイクル・セット数表示 |
| カウントダウン | 任意の時間を指定して逆算 |

タスク行・計測中カード・今日タブのセッション行の「⊙」ボタンから起動。

### 3.6 AI機能

| 機能 | 詳細 |
|---|---|
| タスク自動分解 | 自然言語のゴールを入力→Ollamaがタスクツリーを生成→プレビュー確認→一括登録 |
| カテゴリ自動判定 | キーワードベースで自動分類 |
| カテゴリ固定学習 | 編集で変更したカテゴリを次回以降に固定 |
| LION EYE | 事実ベースの傾向分析（感情・評価・アドバイスなし） |
| 推奨モデル | gemma2:9b（日本語対応・速度バランス良） |

### 3.7 スケジュール・分析

| 機能 | 詳細 |
|---|---|
| 今後の予定 | 期間指定・日付なし・期限切れタスクの絞り込み表示 |
| 今日のサマリー | 総活動時間・セッション数・完了タスク数 |
| 週次レポート | 週単位の時間集計・カテゴリ別内訳 |
| LION EYE分析 | 基本モード（自動集計）またはOllamaモード |

### 3.8 クイックタスク登録

今日タブからタスク名・期日・プロジェクト・優先度をサッと入力して登録。タイマーを開始せずにタスクをストックする動線。

---

## 4. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JS |
| バックエンド | FastAPI（Python） |
| データベース | SQLite |
| LLM | Ollama（MAGICNUC常駐） |
| 推奨モデル | gemma2:9b / qwen2.5:7b |
| ホスティング | MAGICNUC AG1（uvicorn + NSSM） |
| VPN | Tailscale |
| PWA | manifest.json + Service Worker |

---

## 5. システム構成

```
[スマホブラウザ]  ─────────────────┐
[メインPC ブラウザ] ── Tailscale ──→ MAGICNUC AG1 (100.65.206.126)
[LinuxPC ブラウザ]  ─────────────────┘
                                    │
                            ┌───────┴────────┐
                            │  FastAPI :8020  │
                            │  NSSM自動起動   │
                            └───────┬────────┘
                                    │
                      ┌─────────────┼─────────────┐
                      │             │             │
                   SQLite        Ollama        frontend/
              (ink_productivity.db)  (:11434)  (HTML/CSS/JS)
```

---

## 6. DBスキーマ

### projects
| カラム | 型 | 内容 |
|---|---|---|
| id | INTEGER PK | 主キー |
| name | TEXT | プロジェクト名 |
| description | TEXT | 説明 |
| color | TEXT | カラー |
| created_at | TEXT | 作成日時 |
| archived | INTEGER | アーカイブフラグ |

### tasks
| カラム | 型 | 内容 |
|---|---|---|
| id | INTEGER PK | 主キー |
| project_id | INTEGER FK | プロジェクト |
| parent_id | INTEGER FK | 親タスク（サブタスク用） |
| name | TEXT | タスク名 |
| category | TEXT | カテゴリ |
| priority | TEXT | 優先度（high/medium/low） |
| status | TEXT | ステータス（カンバン列名と連動） |
| importance | TEXT | 重要度（high/low/NULL） |
| urgency | TEXT | 緊急度（high/low/NULL） |
| due_date | TEXT | 期日 |
| estimated_min | INTEGER | 見積もり時間（分） |
| note | TEXT | メモ |
| description | TEXT | 説明 |
| assignee | TEXT | 担当者・対象ライバー |
| done | INTEGER | 完了フラグ |
| created_at | TEXT | 作成日時 |
| done_at | TEXT | 完了日時 |

### sessions
| カラム | 型 | 内容 |
|---|---|---|
| id | INTEGER PK | 主キー |
| task_id | INTEGER FK | 紐づけタスク |
| name | TEXT | 作業名 |
| category | TEXT | カテゴリ |
| started_at | TEXT | 開始日時 |
| ended_at | TEXT | 終了日時 |
| duration_sec | INTEGER | 実績時間（秒） |
| estimated_sec | INTEGER | 見積もり時間（秒） |
| note | TEXT | メモ |

### kanban_columns
| カラム | 型 | 内容 |
|---|---|---|
| id | INTEGER PK | 主キー |
| name | TEXT UNIQUE | 列名（=ステータス名） |
| position | INTEGER | 表示順 |
| color | TEXT | カラー |

### category_fixed
| カラム | 型 | 内容 |
|---|---|---|
| task_name | TEXT PK | タスク名 |
| category | TEXT | 固定カテゴリ |
| updated_at | TEXT | 更新日時 |

---

## 7. API一覧

### プロジェクト
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/projects | 一覧取得 |
| POST | /api/projects | 作成 |
| PUT | /api/projects/{id} | 更新 |
| DELETE | /api/projects/{id} | 削除（配下タスクも削除） |

### タスク
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/tasks | 一覧（project_id/inbox/doneフィルタ可） |
| GET | /api/tasks/matrix | マトリックス用4象限分類 |
| POST | /api/tasks | 作成 |
| PUT | /api/tasks/{id} | 更新 |
| POST | /api/tasks/{id}/done | 完了トグル |
| POST | /api/tasks/{id}/status | ステータス更新 |
| DELETE | /api/tasks/{id} | 削除（サブタスクも削除） |
| POST | /api/tasks/bulk | AI分解結果一括登録 |

### カンバン
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/kanban/columns | 列一覧 |
| POST | /api/kanban/columns | 列作成 |
| PUT | /api/kanban/columns/{id} | 列更新 |
| DELETE | /api/kanban/columns/{id} | 列削除 |
| GET | /api/kanban/tasks | カンバン用タスク一覧 |

### セッション
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/sessions | 一覧 |
| GET | /api/sessions/active | アクティブセッション |
| GET | /api/sessions/suggestions | サジェスト |
| POST | /api/sessions/start | 開始 |
| POST | /api/sessions/stop | 停止 |
| POST | /api/sessions/past | 過去セッション追加 |
| PUT | /api/sessions/{id} | 更新 |
| DELETE | /api/sessions/{id} | 削除 |

### AI
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/ai/models | Ollamaモデル一覧 |
| POST | /api/ai/decompose | タスク自動分解 |
| POST | /api/ai/lion-eye | LION EYE分析 |

### レポート・設定
| メソッド | パス | 内容 |
|---|---|---|
| GET | /api/report/today | 今日のサマリー |
| GET | /api/report/weekly | 週次レポート |

---

## 8. UI構成

### PC（サイドバー）
```
今日 / タスク / カンバン / マトリックス / 分析 / 設定
```

### スマホ（下部タブバー）
```
今日 / タスク / カンバン / MX / 分析 / 設定
```

### モーダル一覧
- 確認ダイアログ（汎用）
- プロジェクト作成
- タスク作成
- タスク詳細パネル
- セッション編集
- 過去セッション追加
- カンバン列追加・編集
- フォーカスモード（全画面オーバーレイ）

---

## 9. 既知の制約

| 項目 | 内容 |
|---|---|
| オフライン時 | TailscaleかローカルLAN必須 |
| HTTPS | HTTP運用のためPWAアイコンがブラウザによって表示されない場合がある |
| SQLite同時書き込み | 個人利用のため問題なし |
| Ollama応答時間 | MAGICNUC負荷状況により変動（目標15秒以内） |

---

## 10. 将来の拡張候補

- Cloudflare Tunnelによるhttps化（PWAアイコン問題の根本解決）
- Ink Memoryとのライバー情報連携
- Googleカレンダーへの期日エクスポート
- ガントチャート
- 繰り返しタスク

---

*Ink Inc. | AI Creation, Human Care. The Future Drawn Together.*
*© 2026 黒井葉跡*
