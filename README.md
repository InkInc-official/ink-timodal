# 🖤 Ink Productivity

**タスク管理 × 時間計測 × AI分解 — Personal Productivity Tool by Ink Inc.**

> AI Creation, Human Care. The Future Drawn Together.

[![version](https://img.shields.io/badge/version-1.0.0-7c6aff)](#)
[![python](https://img.shields.io/badge/Python-3.10%2B-blue)](#)
[![license](https://img.shields.io/badge/license-MIT-green)](#)

---

## 概要

Ink ProductivityはInk Habitの後継として設計された、MAGICNUC常駐型のPersonal Productivity Toolです。VikunjaとSuper Productivityの二刀流構成を一本化し、Inkブランドに統一した完全自作ツールです。

### 主な機能

| カテゴリ | 機能 |
|---|---|
| **タスク管理** | プロジェクト・タスク・サブタスク2階層・優先度・期日・担当者・説明・ステータス管理 |
| **カンバン** | 列のカスタマイズ・ドラッグ&ドロップ・列名=ステータス名で連動 |
| **マトリックス** | アイゼンハワーマトリックス・第0象限（未設定）・ドラッグ&ドロップ配置 |
| **タイムトラッキング** | クイックスタート・マルチ計測・見積もりvs実績・リマインダー・過去セッション追加 |
| **フォーカスモード** | フロータイム・ポモドーロ（25分+5分）・カウントダウン |
| **AI機能** | Ollamaによるタスク自動分解・カテゴリ自動判定・固定学習・LION EYE傾向分析 |
| **スケジュール** | 期間指定・期限切れ・日付なしタスクの絞り込み表示 |
| **分析** | 週次レポート・カテゴリ別集計・LION EYE（基本/LLMモード） |
| **多端末対応** | Tailscale経由でPC・スマホどこからでもアクセス・スマホ下部タブバー・PWA対応 |

---

## 必要な環境

- **Python** 3.10以上
- **Ollama** — https://ollama.com/
- **MAGICNUC AG1**（Tailscale接続済み・Windows 11）

---

## セットアップ

### 1. Ollamaと推奨モデルの準備

```powershell
# Windowsの場合はhttps://ollama.com/からインストーラーをダウンロード
ollama pull gemma2:9b
ollama pull qwen2.5:7b
```

### 2. 依存パッケージのインストール

```powershell
cd C:\Users\espre\ink-productivity
pip install -r requirements.txt
```

### 3. 起動

```powershell
uvicorn main:app --host 0.0.0.0 --port 8020
```

### 4. アクセス

```
# ローカル
http://localhost:8020

# Tailscale経由（全端末共通）
http://100.65.206.126:8020
```

---

## 自動起動設定（NSSM・推奨）

NSSMを使ってWindowsサービスとして登録することで、PC起動時に自動で立ち上がります。

```powershell
# NSSMのインストール
winget install nssm

# サービス登録（GUIが開く）
nssm install InkProductivity
```

GUIの設定値：

| 項目 | 値 |
|---|---|
| Path | `C:\Users\espre\AppData\Local\Programs\Python\Python312\Scripts\uvicorn.exe` |
| Startup directory | `C:\Users\espre\ink-productivity` |
| Arguments | `main:app --host 0.0.0.0 --port 8020` |

```powershell
# サービス開始
nssm start InkProductivity

# 再起動
nssm restart InkProductivity

# 停止
nssm stop InkProductivity
```

---

## ファイル構成

```
ink-productivity/
├── main.py                  # FastAPIサーバー本体・全APIエンドポイント
├── database.py              # SQLite操作・DB初期化・カテゴリ学習
├── ai_client.py             # Ollama連携・AI分解・LION EYE分析
├── ink_productivity.db      # SQLiteデータベース（自動生成・gitignore対象）
├── requirements.txt
├── README.md
└── frontend/
    ├── index.html           # メイン画面（全タブ・全モーダル）
    ├── style.css            # スタイル（ダークテーマ・レスポンシブ）
    ├── app.js               # フロントエンドロジック
    ├── manifest.json        # PWAマニフェスト
    ├── sw.js                # Service Worker
    └── Ink_Productivity.png # アプリアイコン（gitignore対象）
```

---

## DBスキーマ概要

| テーブル | 用途 |
|---|---|
| `projects` | プロジェクト管理 |
| `tasks` | タスク・サブタスク（importance/urgency/status含む） |
| `sessions` | タイムトラッキング記録 |
| `kanban_columns` | カンバン列定義（名前=ステータス名） |
| `category_fixed` | カテゴリ固定学習データ |
| `reports` | LION EYE分析結果 |

---

## Ink Habitからのデータ移行

```python
import sqlite3

src = sqlite3.connect('ink_habit.db')
dst = sqlite3.connect('ink_productivity.db')
src_cur = src.cursor()
dst_cur = dst.cursor()

src_cur.execute('SELECT * FROM sessions')
rows = src_cur.fetchall()
for row in rows:
    dst_cur.execute('''
        INSERT OR IGNORE INTO sessions
        (id, name, category, started_at, ended_at, duration_sec, estimated_sec)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (row[0], row[1], row[2], row[3], row[4], row[5], row[6]))

dst.commit()
src.close()
dst.close()
print(f'{len(rows)}件のセッションを移行しました')
```

---

## ライセンス

© 2026 黒井葉跡 / Ink Inc. — MIT License

---

*Ink Inc. | AI Creation, Human Care. The Future Drawn Together.*
*https://inkinc-hp.vercel.app/*
