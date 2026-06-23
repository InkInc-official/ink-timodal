#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ink Productivity — ai_client.py
Ollama連携・タスク分解・LION EYE分析
Ink Habit worker.py から移植・拡張
"""

import json
import datetime
import urllib.request
import urllib.error
from database import get_con


OLLAMA_BASE = "http://localhost:11434"


# ── Ollamaモデル一覧 ──────────────────────────────
def get_ollama_models() -> list:
    try:
        with urllib.request.urlopen(f'{OLLAMA_BASE}/api/tags', timeout=3) as r:
            data = json.loads(r.read())
        return [m['name'] for m in data.get('models', [])]
    except Exception:
        return []


# ── テキスト生成 ──────────────────────────────────
def ollama_generate(model: str, prompt: str) -> str:
    payload = json.dumps({
        'model':  model,
        'prompt': prompt,
        'stream': False
    }).encode()
    req = urllib.request.Request(
        f'{OLLAMA_BASE}/api/generate',
        data=payload,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return data.get('response', '')


# ── タスク自動分解 ────────────────────────────────
DECOMPOSE_SYSTEM_PROMPT = """あなたはタスク分解アシスタントです。
以下のゴールをエピック→タスク→サブタスクの階層に分解してください。
JSONのみを返してください。余分な説明・前置き・コードブロック記号は不要です。

出力スキーマ:
{
  "project_name": "プロジェクト名",
  "tasks": [
    {
      "name": "タスク名",
      "category": "配信|制作|事務|リサーチ|休憩|その他",
      "priority": "high|medium|low",
      "estimated_min": 数値（分）,
      "subtasks": [
        { "name": "サブタスク名", "estimated_min": 数値 }
      ]
    }
  ]
}"""


def decompose_task(model: str, goal: str) -> dict:
    prompt = f"{DECOMPOSE_SYSTEM_PROMPT}\n\nゴール: {goal}"
    raw = ollama_generate(model, prompt)

    # JSONブロックの抽出
    raw = raw.strip()
    if raw.startswith('```'):
        lines = raw.split('\n')
        raw   = '\n'.join(lines[1:-1]) if lines[-1].strip() == '```' else '\n'.join(lines[1:])

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"AIの応答をJSONとして解析できませんでした: {e}\n応答: {raw[:200]}")

    # スキーマ検証
    if 'tasks' not in result:
        raise ValueError("AIの応答に 'tasks' キーがありません")

    return result


# ── LION EYE 分析 ─────────────────────────────────
def build_lion_eye_prompt(range_start: str, range_end: str) -> str | None:
    con = get_con()
    cur = con.cursor()
    cur.execute('''
        SELECT id, name, category, started_at, ended_at, duration_sec, estimated_sec
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
          AND ended_at IS NOT NULL
        ORDER BY started_at
    ''', (range_start, range_end + 'T23:59:59'))
    sessions = [dict(r) for r in cur.fetchall()]
    con.close()

    if not sessions:
        return None

    by_cat  = {}
    by_name = {}
    for s in sessions:
        cat  = s['category']
        name = s['name']
        dur  = s['duration_sec'] or 0
        by_cat[cat] = by_cat.get(cat, 0) + dur
        if name not in by_name:
            by_name[name] = {'count': 0, 'total_sec': 0, 'estimated_sec_list': []}
        by_name[name]['count']     += 1
        by_name[name]['total_sec'] += dur
        if s['estimated_sec']:
            by_name[name]['estimated_sec_list'].append(s['estimated_sec'])

    # 並行セッション
    concurrent_pairs = []
    for i, s1 in enumerate(sessions):
        for s2 in sessions[i+1:]:
            s1_end = s1['ended_at'] or ''
            s2_end = s2['ended_at'] or ''
            if s1['started_at'] < s2_end and s1_end > s2['started_at']:
                pair = tuple(sorted([s1['name'], s2['name']]))
                if pair not in concurrent_pairs:
                    concurrent_pairs.append(pair)

    # 時間帯
    hour_counts = {}
    for s in sessions:
        h = datetime.datetime.fromisoformat(s['started_at']).hour
        hour_counts[h] = hour_counts.get(h, 0) + 1
    peak_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None

    # 見積もり精度
    estimate_diffs = []
    for name, data in by_name.items():
        ests = data['estimated_sec_list']
        if ests and data['count'] > 0:
            avg_est    = sum(ests) / len(ests)
            avg_actual = data['total_sec'] / data['count']
            estimate_diffs.append((name, (avg_actual - avg_est) / 60))

    total_sec = sum(s['duration_sec'] or 0 for s in sessions)
    lines = [
        f'分析期間: {range_start} 〜 {range_end}',
        f'総活動時間: {total_sec//3600}時間{(total_sec%3600)//60}分',
        f'セッション数: {len(sessions)}件',
        '', '【カテゴリ別時間】'
    ]
    for cat, sec in sorted(by_cat.items(), key=lambda x: -x[1]):
        lines.append(f'  {cat}: {sec//3600}時間{(sec%3600)//60}分')

    lines += ['', '【タスク別実績（回数・平均時間）】']
    for name, data in sorted(by_name.items(), key=lambda x: -x[1]['count']):
        avg = data['total_sec'] // data['count'] if data['count'] else 0
        lines.append(f'  「{name}」: {data["count"]}回 / 平均{avg//60}分')

    if concurrent_pairs:
        lines += ['', '【同時並行が確認されたタスクの組み合わせ】']
        for a, b in concurrent_pairs:
            lines.append(f'  「{a}」×「{b}」')

    if peak_hour is not None:
        lines += ['', f'【最多開始時間帯】{peak_hour}時台（{hour_counts[peak_hour]}件）']

    if estimate_diffs:
        lines += ['', '【見積もりと実績の差（平均）】']
        for name, diff in estimate_diffs:
            sign = '+' if diff >= 0 else ''
            lines.append(f'  「{name}」: {sign}{diff:.0f}分')

    data_text = '\n'.join(lines)

    return f'''以下の活動記録データを分析し、事実のみを日本語で出力してください。

ルール：
- 感情・評価・アドバイス・励ましは一切禁止
- 各項目は必ず「→ 」で始める
- 1項目につき1文、40字以内
- 出力は5〜7項目のみ。前置き・後書き・説明は不要
- 見積もりデータがない場合はその項目を省略する
- 「〜過多」「〜不足」などの評価語は使わず、数値や事実で表現する

データ：
{data_text}'''


def generate_lion_eye(mode: str, model: str, range_start: str, range_end: str) -> str:
    prompt = build_lion_eye_prompt(range_start, range_end)
    if not prompt:
        return 'この期間に記録されたセッションがありません。'
    try:
        if mode == 'ollama' and model:
            return ollama_generate(model, prompt)
        return _basic_lion_eye(range_start, range_end)
    except Exception as e:
        return f'LION EYE 生成エラー: {str(e)}'


def _basic_lion_eye(range_start: str, range_end: str) -> str:
    con = get_con()
    cur = con.cursor()
    cur.execute('''
        SELECT name, category, started_at, ended_at, duration_sec, estimated_sec
        FROM sessions
        WHERE started_at >= ? AND started_at <= ?
          AND ended_at IS NOT NULL
        ORDER BY started_at
    ''', (range_start, range_end + 'T23:59:59'))
    sessions = [dict(r) for r in cur.fetchall()]
    con.close()

    if not sessions:
        return 'この期間に記録されたセッションがありません。'

    results   = []
    total_sec = sum(s['duration_sec'] or 0 for s in sessions)
    results.append(f'→ 総活動時間は{total_sec//3600}時間{(total_sec%3600)//60}分、{len(sessions)}セッション。')

    by_cat = {}
    for s in sessions:
        cat = s['category']
        by_cat[cat] = by_cat.get(cat, 0) + (s['duration_sec'] or 0)
    top_cat = max(by_cat, key=by_cat.get)
    results.append(f'→ 最多カテゴリは「{top_cat}」（{by_cat[top_cat]//3600}時間{(by_cat[top_cat]%3600)//60}分）。')

    by_name = {}
    for s in sessions:
        by_name[s['name']] = by_name.get(s['name'], 0) + 1
    top_task = max(by_name, key=by_name.get)
    results.append(f'→ 最多タスクは「{top_task}」（{by_name[top_task]}回）。')

    hour_counts = {}
    for s in sessions:
        h = datetime.datetime.fromisoformat(s['started_at']).hour
        hour_counts[h] = hour_counts.get(h, 0) + 1
    peak = max(hour_counts, key=hour_counts.get)
    results.append(f'→ 最多開始時間帯は{peak}時台（{hour_counts[peak]}件）。')

    concurrent = 0
    for i, s1 in enumerate(sessions):
        for s2 in sessions[i+1:]:
            if s1['ended_at'] and s2['ended_at']:
                if s1['started_at'] < s2['ended_at'] and s1['ended_at'] > s2['started_at']:
                    concurrent += 1
    if concurrent > 0:
        results.append(f'→ 並行セッションが{concurrent}件確認された。')

    diffs = []
    for s in sessions:
        if s['estimated_sec'] and s['duration_sec']:
            diffs.append(s['duration_sec'] - s['estimated_sec'])
    if diffs:
        avg_diff = sum(diffs) / len(diffs)
        sign = '+' if avg_diff >= 0 else ''
        results.append(f'→ 見積もりと実績の平均差は{sign}{avg_diff/60:.0f}分。')

    return '\n'.join(results)
