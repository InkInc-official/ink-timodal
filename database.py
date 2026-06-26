#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ink Productivity — database.py
SQLite操作・DB初期化・カテゴリ判定・タスク正規化
Ink Habit worker.py から移植・拡張
"""

import sqlite3
import datetime
from pathlib import Path

# ── パス ─────────────────────────────────────────
import os
APP_DIR = Path(__file__).parent
_db_env = os.environ.get('DB_PATH', '')
DB_PATH = Path(_db_env) if _db_env else APP_DIR / "ink_productivity.db"


# ── DB初期化 ──────────────────────────────────────
def init_db():
    con = get_con()
    cur = con.cursor()
    cur.executescript('''
    CREATE TABLE IF NOT EXISTS projects (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT,
        color       TEXT    DEFAULT '#7c6aff',
        created_at  TEXT    NOT NULL,
        archived    INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    INTEGER,
        parent_id     INTEGER,
        name          TEXT    NOT NULL,
        category      TEXT    NOT NULL DEFAULT 'その他',
        priority      TEXT    NOT NULL DEFAULT 'medium',
        due_date      TEXT,
        estimated_min INTEGER,
        note          TEXT,
        description   TEXT,
        assignee      TEXT,
        status        TEXT    DEFAULT 'todo',
        importance    TEXT,
        urgency       TEXT,
        done          INTEGER DEFAULT 0,
        created_at    TEXT    NOT NULL,
        done_at       TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (parent_id)  REFERENCES tasks(id)
    );

    -- 既存DBへのカラム追加（初回のみ実行）
    

    CREATE TABLE IF NOT EXISTS sessions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id       INTEGER,
        name          TEXT    NOT NULL,
        category      TEXT    NOT NULL DEFAULT 'その他',
        started_at    TEXT    NOT NULL,
        ended_at      TEXT,
        duration_sec  INTEGER,
        estimated_sec INTEGER,
        note          TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  INTEGER NOT NULL,
        fired_at    TEXT    NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        range_start TEXT    NOT NULL,
        range_end   TEXT    NOT NULL,
        mode        TEXT    NOT NULL,
        model       TEXT,
        content     TEXT    NOT NULL,
        created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kanban_columns (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        name      TEXT    NOT NULL UNIQUE,
        position  INTEGER NOT NULL DEFAULT 0,
        color     TEXT    DEFAULT '#7c6aff'
    );

    CREATE TABLE IF NOT EXISTS moods (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        score      INTEGER NOT NULL CHECK(score BETWEEN 0 AND 4),
        note       TEXT,
        recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journals (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT,
        content    TEXT NOT NULL,
        prompt     TEXT,
        recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_fixed (
        task_name   TEXT PRIMARY KEY,
        category    TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    ''')
    con.commit()
    # 既存DBへの追加カラム対応（既にある場合は無視）
    for col, typedef in [
        ('description', 'TEXT'),
        ('assignee',    'TEXT'),
        ('status',      'TEXT'),
        ('importance',  'TEXT'),
        ('urgency',     'TEXT'),
    ]:
        try:
            con.execute(f'ALTER TABLE tasks ADD COLUMN {col} {typedef}')
            con.commit()
        except Exception:
            pass
    # NULLステータスのタスクを「未着手」に設定
    try:
        con.execute("UPDATE tasks SET status='未着手' WHERE status IS NULL OR status=''")
        con.commit()
    except Exception:
        pass

    # 既存の英語ステータスを日本語にマイグレーション
    status_map = {
        'todo':        '未着手',
        'in_progress': '実行中',
        'on_hold':     '保留中',
        'done':        '完了',
    }
    for eng, jpn in status_map.items():
        try:
            con.execute(f"UPDATE tasks SET status=? WHERE status=?", (jpn, eng))
        except Exception:
            pass
    con.commit()

    # カンバン列の初期データ（なければ挿入）
    default_cols = [('未着手', 0, '#6b6b80'), ('実行中', 1, '#7c6aff'),
                    ('保留中', 2, '#ffb86a'), ('完了',   3, '#6affcc')]
    for name, pos, color in default_cols:
        try:
            con.execute(
                "INSERT OR IGNORE INTO kanban_columns (name, position, color) VALUES (?,?,?)",
                (name, pos, color)
            )
        except Exception:
            pass
    con.commit()
    con.close()


# ── 接続 ──────────────────────────────────────────
def get_con():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


# ── カテゴリ自動判定 ──────────────────────────────
CATEGORY_KEYWORDS = {
    '配信':    ['配信', 'ライブ', 'iriam', 'twitch', 'youtube', '本番', 'live'],
    '制作':    ['イラスト', '音楽', '動画', '編集', 'ai', '制作', '作曲', '作詞',
                'デザイン', '歌詞', 'suno', 'seaart', 'spell'],
    '事務':    ['事務', 'メール', '請求', '管理', '書類', 'ink memory', 'ink triage',
                'notion', 'discord', 'bot', '更新'],
    'リサーチ': ['調べ', 'リサーチ', '勉強', '読書', '学習', '検索', '情報収集'],
    '休憩':    ['休憩', '食事', '散歩', '休み', '昼食', '夕食', '睡眠']
}

TASK_ALIASES = {
    'ライブ':       '配信',
    'live配信':     '配信',
    'iriam配信':    'IRIAM配信',
    '作曲':         'AI音楽制作',
    '音楽制作':     'AI音楽制作',
    '楽曲制作':     'AI音楽制作',
    'イラスト制作': 'AIイラスト制作',
    'お絵描き':     'AIイラスト制作',
}


def detect_category(name: str) -> str:
    n = name.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in n for k in keywords):
            return cat
    return 'その他'


def normalize_task_name(name: str) -> str:
    n_lower = name.lower().strip()
    for alias, canonical in TASK_ALIASES.items():
        if alias in n_lower:
            return canonical
    return name.strip()


def save_fixed_category(task_name: str, category: str):
    """タスク名のカテゴリを固定登録（次回以降この名前は必ずこのカテゴリ）"""
    con = get_con()
    cur = con.cursor()
    cur.execute('''
        INSERT INTO category_fixed (task_name, category, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(task_name) DO UPDATE SET category=excluded.category, updated_at=excluded.updated_at
    ''', (task_name, category, datetime.datetime.now().isoformat()))
    con.commit()
    con.close()


def get_learned_category(name: str) -> str:
    con = get_con()
    cur = con.cursor()
    # 1. 固定カテゴリを最優先
    cur.execute('SELECT category FROM category_fixed WHERE task_name=?', (name,))
    row = cur.fetchone()
    if row:
        con.close()
        return row['category']
    # 2. 過去セッションから学習
    cur.execute('''
        SELECT category FROM sessions
        WHERE name = ? AND ended_at IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 1
    ''', (name,))
    row = cur.fetchone()
    con.close()
    if row:
        return row['category']
    return detect_category(name)


# ── 汎用CRUD ──────────────────────────────────────
def db_insert(table: str, data: dict) -> int:
    con = get_con()
    cur = con.cursor()
    keys   = ', '.join(data.keys())
    places = ', '.join(['?'] * len(data))
    cur.execute(f'INSERT INTO {table} ({keys}) VALUES ({places})', list(data.values()))
    row_id = cur.lastrowid
    con.commit()
    con.close()
    return row_id


def db_update(table: str, data: dict, where: dict):
    con = get_con()
    cur = con.cursor()
    sets  = ', '.join([f'{k}=?' for k in data])
    conds = ' AND '.join([f'{k}=?' for k in where])
    params = list(data.values()) + list(where.values())
    cur.execute(f'UPDATE {table} SET {sets} WHERE {conds}', params)
    con.commit()
    con.close()


def db_delete(table: str, where: dict):
    con = get_con()
    cur = con.cursor()
    conds  = ' AND '.join([f'{k}=?' for k in where])
    params = list(where.values())
    cur.execute(f'DELETE FROM {table} WHERE {conds}', params)
    con.commit()
    con.close()


# ── プロジェクト ──────────────────────────────────
def get_projects(archived: bool = False) -> list:
    con = get_con()
    cur = con.cursor()
    cur.execute(
        'SELECT * FROM projects WHERE archived=? ORDER BY created_at DESC',
        (1 if archived else 0,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def create_project(name: str, description: str = '', color: str = '#7c6aff') -> int:
    return db_insert('projects', {
        'name':        name,
        'description': description,
        'color':       color,
        'created_at':  datetime.datetime.now().isoformat(),
        'archived':    0
    })


def update_project(project_id: int, data: dict):
    db_update('projects', data, {'id': project_id})


def delete_project(project_id: int):
    # 配下タスクをすべて削除（受信トレイに流れないようにする）
    con = get_con()
    cur = con.cursor()
    cur.execute('DELETE FROM tasks WHERE project_id=?', (project_id,))
    cur.execute('DELETE FROM projects WHERE id=?', (project_id,))
    con.commit()
    con.close()


# ── タスク ────────────────────────────────────────
def get_tasks(project_id: int = None, done: int = None) -> list:
    con = get_con()
    cur = con.cursor()
    sql    = 'SELECT * FROM tasks WHERE 1=1'
    params = []
    if project_id is not None:
        sql += ' AND project_id=?'
        params.append(project_id)
    if done is not None:
        sql += ' AND done=?'
        params.append(done)
    sql += ' ORDER BY done ASC, priority DESC, created_at ASC'
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def get_task(task_id: int) -> dict:
    con = get_con()
    cur = con.cursor()
    cur.execute('SELECT * FROM tasks WHERE id=?', (task_id,))
    row = cur.fetchone()
    con.close()
    return dict(row) if row else None


def create_task(
    name: str,
    project_id: int = None,
    parent_id: int = None,
    category: str = None,
    priority: str = 'medium',
    due_date: str = None,
    estimated_min: int = None,
    note: str = None,
    description: str = None,
    assignee: str = None,
    status: str = None
) -> int:
    name = normalize_task_name(name)
    if not category:
        category = get_learned_category(name)
    return db_insert('tasks', {
        'project_id':    project_id,
        'parent_id':     parent_id,
        'name':          name,
        'category':      category,
        'priority':      priority,
        'due_date':      due_date,
        'estimated_min': estimated_min,
        'note':          note,
        'description':   description,
        'assignee':      assignee,
        'status':        status or '未着手',
        'done':          0,
        'created_at':    datetime.datetime.now().isoformat(),
    })


def toggle_task_done(task_id: int) -> bool:
    task = get_task(task_id)
    if not task:
        return False
    new_done = 0 if task['done'] else 1
    update_data = {'done': new_done}
    if new_done:
        update_data['done_at'] = datetime.datetime.now().isoformat()
    else:
        update_data['done_at'] = None
    db_update('tasks', update_data, {'id': task_id})
    return bool(new_done)


def delete_task(task_id: int):
    # サブタスクも削除
    con = get_con()
    cur = con.cursor()
    cur.execute('DELETE FROM tasks WHERE parent_id=?', (task_id,))
    cur.execute('DELETE FROM tasks WHERE id=?', (task_id,))
    con.commit()
    con.close()


def bulk_create_tasks(project_id: int, tasks: list) -> list:
    """AI分解結果の一括登録"""
    created_ids = []
    for t in tasks:
        task_id = create_task(
            name=t.get('name', ''),
            project_id=project_id,
            category=t.get('category'),
            priority=t.get('priority', 'medium'),
            estimated_min=t.get('estimated_min'),
            description=t.get('description'),
            assignee=t.get('assignee'),
        )
        created_ids.append(task_id)
        for sub in t.get('subtasks', []):
            sub_id = create_task(
                name=sub.get('name', ''),
                project_id=project_id,
                parent_id=task_id,
                estimated_min=sub.get('estimated_min'),
            )
            created_ids.append(sub_id)
    return created_ids


# ── セッション（タイムトラッキング） ─────────────────
def start_session(name: str, task_id: int = None, estimated_sec: int = None) -> tuple:
    name     = normalize_task_name(name)
    category = get_learned_category(name)
    now      = datetime.datetime.now().isoformat()
    session_id = db_insert('sessions', {
        'task_id':       task_id,
        'name':          name,
        'category':      category,
        'started_at':    now,
        'estimated_sec': estimated_sec,
    })
    return session_id, category, now


def stop_session(session_id: int) -> int:
    now = datetime.datetime.now().isoformat()
    con = get_con()
    cur = con.cursor()
    cur.execute('SELECT started_at FROM sessions WHERE id=?', (session_id,))
    row = cur.fetchone()
    con.close()
    if not row:
        return None
    started      = datetime.datetime.fromisoformat(row['started_at'])
    ended        = datetime.datetime.fromisoformat(now)
    duration_sec = max(0, int((ended - started).total_seconds()))
    db_update('sessions', {
        'ended_at':     now,
        'duration_sec': duration_sec
    }, {'id': session_id})
    return duration_sec


def get_active_sessions() -> list:
    con = get_con()
    cur = con.cursor()
    cur.execute('SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at ASC')
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def get_sessions(date_from: str = None, date_to: str = None, limit: int = 100) -> list:
    con = get_con()
    cur = con.cursor()
    sql    = 'SELECT * FROM sessions WHERE ended_at IS NOT NULL'
    params = []
    if date_from:
        sql += ' AND started_at >= ?'
        params.append(date_from)
    if date_to:
        sql += ' AND started_at <= ?'
        params.append(date_to + 'T23:59:59')
    sql += ' ORDER BY started_at DESC LIMIT ?'
    params.append(limit)
    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def add_past_session(
    name: str, category: str,
    started_at: str, ended_at: str,
    task_id: int = None
) -> int:
    name = normalize_task_name(name)
    if not category:
        category = get_learned_category(name)
    start_dt     = datetime.datetime.fromisoformat(started_at)
    end_dt       = datetime.datetime.fromisoformat(ended_at)
    duration_sec = max(0, int((end_dt - start_dt).total_seconds()))
    return db_insert('sessions', {
        'task_id':      task_id,
        'name':         name,
        'category':     category,
        'started_at':   started_at,
        'ended_at':     ended_at,
        'duration_sec': duration_sec,
    })


def cleanup_orphan_sessions():
    con = get_con()
    cur = con.cursor()
    now = datetime.datetime.now().isoformat()
    cur.execute('SELECT id, started_at FROM sessions WHERE ended_at IS NULL')
    rows = cur.fetchall()
    for row in rows:
        started  = datetime.datetime.fromisoformat(row['started_at'])
        ended    = datetime.datetime.fromisoformat(now)
        duration = max(0, int((ended - started).total_seconds()))
        cur.execute(
            'UPDATE sessions SET ended_at=?, duration_sec=? WHERE id=?',
            (now, duration, row['id'])
        )
    con.commit()
    con.close()
    return len(rows)


def get_task_suggestions() -> list:
    con = get_con()
    cur = con.cursor()
    cur.execute('''
        SELECT name, COUNT(*) as cnt
        FROM sessions
        GROUP BY name
        ORDER BY cnt DESC
        LIMIT 10
    ''')
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return [r['name'] for r in rows]


# ── ムードトラッカー ──────────────────────────────
def save_mood(score: int, note: str = None) -> int:
    return db_insert('moods', {
        'score':       score,
        'note':        note,
        'recorded_at': datetime.datetime.now().isoformat(),
    })

def get_moods(limit: int = 30) -> list:
    con = get_con()
    cur = con.cursor()
    cur.execute('SELECT * FROM moods ORDER BY recorded_at DESC LIMIT ?', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows

def get_today_mood() -> dict:
    today = datetime.date.today().isoformat()
    con = get_con()
    cur = con.cursor()
    cur.execute(
        'SELECT * FROM moods WHERE recorded_at >= ? ORDER BY recorded_at DESC LIMIT 1',
        (today,)
    )
    row = cur.fetchone()
    con.close()
    return dict(row) if row else None

def get_mood_stats(days: int = 30) -> list:
    since = (datetime.date.today() - datetime.timedelta(days=days)).isoformat()
    con = get_con()
    cur = con.cursor()
    cur.execute(
        'SELECT * FROM moods WHERE recorded_at >= ? ORDER BY recorded_at ASC',
        (since,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


# ── ジャーナリング ──────────────────────────────────
def save_journal(content: str, title: str = None, prompt: str = None) -> int:
    return db_insert('journals', {
        'title':       title,
        'content':     content,
        'prompt':      prompt,
        'recorded_at': datetime.datetime.now().isoformat(),
    })

def get_journals(limit: int = 20, date_from: str = None) -> list:
    con = get_con()
    cur = con.cursor()
    if date_from:
        cur.execute(
            'SELECT * FROM journals WHERE recorded_at >= ? ORDER BY recorded_at DESC LIMIT ?',
            (date_from, limit)
        )
    else:
        cur.execute('SELECT * FROM journals ORDER BY recorded_at DESC LIMIT ?', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows

def get_journal(journal_id: int) -> dict:
    con = get_con()
    cur = con.cursor()
    cur.execute('SELECT * FROM journals WHERE id=?', (journal_id,))
    row = cur.fetchone()
    con.close()
    return dict(row) if row else None

def delete_journal(journal_id: int):
    db_delete('journals', {'id': journal_id})


# ── 今日のサマリー ────────────────────────────────
def get_today_summary() -> dict:
    today = datetime.date.today().isoformat()
    con   = get_con()
    cur   = con.cursor()
    cur.execute('''
        SELECT * FROM sessions
        WHERE started_at >= ? AND ended_at IS NOT NULL
        ORDER BY started_at ASC
    ''', (today,))
    sessions = [dict(r) for r in cur.fetchall()]

    cur.execute('SELECT COUNT(*) as cnt FROM tasks WHERE done=1 AND done_at >= ?', (today,))
    done_today = cur.fetchone()['cnt']
    con.close()

    total_sec = sum(s['duration_sec'] or 0 for s in sessions)
    by_cat    = {}
    for s in sessions:
        cat       = s['category']
        by_cat[cat] = by_cat.get(cat, 0) + (s['duration_sec'] or 0)

    return {
        'date':        today,
        'total_sec':   total_sec,
        'session_cnt': len(sessions),
        'done_tasks':  done_today,
        'by_category': by_cat,
        'sessions':    sessions,
    }


# ── 週次サマリー ──────────────────────────────────
def get_weekly_summary() -> dict:
    today     = datetime.date.today()
    week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()
    sessions  = get_sessions(date_from=week_start, limit=500)
    total_sec = sum(s['duration_sec'] or 0 for s in sessions)
    by_cat    = {}
    by_day    = {}
    for s in sessions:
        cat        = s['category']
        by_cat[cat] = by_cat.get(cat, 0) + (s['duration_sec'] or 0)
        day         = s['started_at'][:10]
        by_day[day] = by_day.get(day, 0) + (s['duration_sec'] or 0)
    return {
        'week_start':  week_start,
        'total_sec':   total_sec,
        'session_cnt': len(sessions),
        'by_category': by_cat,
        'by_day':      by_day,
    }
