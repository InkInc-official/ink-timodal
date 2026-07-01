#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ink Productivity — main.py
FastAPI サーバー本体
起動: uvicorn main:app --host 0.0.0.0 --port 8010 --reload
"""

import datetime
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

import database as db
import ai_client as ai

# ── 起動処理 ──────────────────────────────────────
db.init_db()
cleaned = db.cleanup_orphan_sessions()
print(f"[Ink Productivity] 起動完了 — 孤立セッション {cleaned}件 を自動終了しました")

app = FastAPI(title="Ink Productivity", version="1.0.0")

# ── 静的ファイル配信 ──────────────────────────────
FRONTEND_DIR = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.get("/static/manifest.json")
def manifest():
    return FileResponse(str(FRONTEND_DIR / "manifest.json"), media_type="application/manifest+json")

@app.get("/static/sw.js")
def sw():
    return FileResponse(str(FRONTEND_DIR / "sw.js"), media_type="application/javascript")


# ── Pydantic モデル ───────────────────────────────
class ProjectCreate(BaseModel):
    name:        str
    description: Optional[str] = ''
    color:       Optional[str] = '#7c6aff'

class ProjectUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    color:       Optional[str] = None
    archived:    Optional[int] = None

class TaskCreate(BaseModel):
    name:          str
    project_id:    Optional[int]  = None
    parent_id:     Optional[int]  = None
    category:      Optional[str]  = None
    priority:      Optional[str]  = 'medium'
    due_date:      Optional[str]  = None
    estimated_min: Optional[int]  = None
    note:          Optional[str]  = None
    description:   Optional[str]  = None
    assignee:      Optional[str]  = None
    status:        Optional[str]  = None
    importance:    Optional[str]  = None
    urgency:       Optional[str]  = None

class TaskUpdate(BaseModel):
    name:          Optional[str] = None
    category:      Optional[str] = None
    priority:      Optional[str] = None
    due_date:      Optional[str] = None
    estimated_min: Optional[int] = None
    note:          Optional[str] = None
    description:   Optional[str] = None
    assignee:      Optional[str] = None
    status:        Optional[str] = None
    importance:    Optional[str] = None
    urgency:       Optional[str] = None
    done:          Optional[int] = None

class SessionStart(BaseModel):
    name:          str
    task_id:       Optional[int] = None
    estimated_sec: Optional[int] = None

class SessionStop(BaseModel):
    session_id: int

class SessionUpdate(BaseModel):
    name:       Optional[str] = None
    category:   Optional[str] = None
    note:       Optional[str] = None
    started_at: Optional[str] = None
    ended_at:   Optional[str] = None

class PastSession(BaseModel):
    name:       str
    category:   Optional[str] = None
    started_at: str
    ended_at:   str
    task_id:    Optional[int] = None

class DecomposeRequest(BaseModel):
    model: str
    goal:  str

class LionEyeRequest(BaseModel):
    mode:        str = 'basic'
    model:       Optional[str] = None
    range_start: str
    range_end:   str

class KanbanColumnCreate(BaseModel):
    name:     str
    color:    Optional[str] = '#7c6aff'

class KanbanColumnUpdate(BaseModel):
    name:     Optional[str] = None
    color:    Optional[str] = None
    position: Optional[int] = None

class MoodCreate(BaseModel):
    score: int
    note:  Optional[str] = None

class JournalCreate(BaseModel):
    content: str
    title:   Optional[str] = None
    prompt:  Optional[str] = None

class JournalUpdate(BaseModel):
    content: Optional[str] = None
    title:   Optional[str] = None

class BulkTaskCreate(BaseModel):
    project_id: int
    tasks:      list

# ── アクティブセッション管理（リマインダー用） ────────
active_sessions = {}
reminder_timers = {}

def _load_active_sessions():
    for s in db.get_active_sessions():
        active_sessions[s['id']] = s

_load_active_sessions()

def _schedule_reminder(session_id: int, minutes: int = 60):
    def fire():
        s = active_sessions.get(session_id)
        if not s:
            return
        started = datetime.datetime.fromisoformat(s['started_at'])
        elapsed = int((datetime.datetime.now() - started).total_seconds() / 60)
        print(f"[Reminder] 「{s['name']}」を開始してから {elapsed} 分が経過しています。")
        _schedule_reminder(session_id, minutes)
    t = threading.Timer(minutes * 60, fire)
    t.daemon = True
    t.start()
    reminder_timers[session_id] = t

def _clear_reminder(session_id: int):
    t = reminder_timers.pop(session_id, None)
    if t:
        t.cancel()


# ═══════════════════════════════════════════════════
# プロジェクト API
# ═══════════════════════════════════════════════════

@app.get("/api/projects")
def list_projects(archived: int = 0):
    return db.get_projects(archived=bool(archived))

@app.post("/api/projects", status_code=201)
def create_project(body: ProjectCreate):
    project_id = db.create_project(body.name, body.description or '', body.color or '#7c6aff')
    return {"id": project_id, "message": "作成しました"}

@app.put("/api/projects/{project_id}")
def update_project(project_id: int, body: ProjectUpdate):
    data = {k: v for k, v in body.dict().items() if v is not None}
    if not data:
        raise HTTPException(400, "更新データがありません")
    db.update_project(project_id, data)
    return {"message": "更新しました"}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int):
    db.delete_project(project_id)
    return {"message": "削除しました"}


# ═══════════════════════════════════════════════════
# タスク API
# ═══════════════════════════════════════════════════

@app.get("/api/tasks")
def list_tasks(project_id: Optional[int] = None, done: Optional[int] = None, inbox: bool = False):
    if inbox:
        # プロジェクト未割り当てタスク（受信トレイ）
        con = db.get_con()
        cur = con.cursor()
        cur.execute("SELECT * FROM tasks WHERE project_id IS NULL AND parent_id IS NULL AND done=0 ORDER BY created_at DESC")
        rows = [dict(r) for r in cur.fetchall()]
        con.close()
        for r in rows:
            r['subtasks'] = []
        return rows
    tasks = db.get_tasks(project_id=project_id, done=done)
    parents  = [t for t in tasks if not t['parent_id']]
    children = [t for t in tasks if t['parent_id']]
    for p in parents:
        p['subtasks'] = [c for c in children if c['parent_id'] == p['id']]
    return parents


@app.get("/api/tasks/matrix")
def get_matrix():
    """アイゼンハワーマトリックス用：全未完了タスクを4象限＋未設定に分類して返す"""
    con = db.get_con()
    cur = con.cursor()
    cur.execute("""
        SELECT t.*, p.name as project_name, p.color as project_color
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.done = 0 AND t.parent_id IS NULL
        ORDER BY t.created_at ASC
    """)
    tasks = [dict(r) for r in cur.fetchall()]
    con.close()
    matrix = { 'q0': [], 'q1': [], 'q2': [], 'q3': [], 'q4': [] }
    for t in tasks:
        imp = t.get('importance')
        urg = t.get('urgency')
        # importance/urgencyが未設定（NULL）のタスクは第0象限へ
        if not imp or not urg:
            matrix['q0'].append(t)
        elif imp == 'high' and urg == 'high':
            matrix['q1'].append(t)
        elif imp == 'high' and urg == 'low':
            matrix['q2'].append(t)
        elif imp == 'low' and urg == 'high':
            matrix['q3'].append(t)
        else:
            matrix['q4'].append(t)
    return matrix

@app.post("/api/tasks", status_code=201)
def create_task(body: TaskCreate):
    task_id = db.create_task(
        name=body.name,
        project_id=body.project_id,
        parent_id=body.parent_id,
        category=body.category,
        priority=body.priority or 'medium',
        due_date=body.due_date,
        estimated_min=body.estimated_min,
        note=body.note,
        description=body.description,
        assignee=body.assignee,
        status=body.status,
        importance=body.importance,
        urgency=body.urgency,
    )
    return {"id": task_id, "message": "作成しました"}

@app.put("/api/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdate):
    nullable = {'importance', 'urgency'}
    data = {}
    for k, v in body.dict().items():
        if k == 'archived':
            # archivedは0/1の整数として明示的に処理
            if v is not None:
                data[k] = int(v)
        elif k in nullable:
            data[k] = None if v == '' else v
        elif v is not None:
            data[k] = v
    if not data:
        raise HTTPException(400, "更新データがありません")
    import logging
    logging.warning(f"update_task {task_id}: {data}")
    db.db_update('tasks', data, {'id': task_id})
    return {"message": "更新しました", "data": data}

@app.post("/api/tasks/{task_id}/done")
def toggle_done(task_id: int):
    done = db.toggle_task_done(task_id)
    return {"done": done}

@app.post("/api/tasks/{task_id}/status")
def update_status(task_id: int, body: dict):
    import datetime as _dt
    status = body.get('status', '')
    if not status:
        raise HTTPException(400, "ステータスを指定してください")
    done_keywords = ('done', '完了', 'finished', 'completed')
    done = 1 if status.lower() in done_keywords else 0
    update_data = {'status': status, 'done': done}
    if done:
        update_data['done_at'] = _dt.datetime.now().isoformat()
    else:
        update_data['done_at'] = None
    db.db_update('tasks', update_data, {'id': task_id})
    return {"status": status}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    db.delete_task(task_id)
    return {"message": "削除しました"}

@app.post("/api/tasks/bulk", status_code=201)
def bulk_create(body: BulkTaskCreate):
    ids = db.bulk_create_tasks(body.project_id, body.tasks)
    return {"ids": ids, "count": len(ids)}


# ═══════════════════════════════════════════════════
# カンバン列 API
# ═══════════════════════════════════════════════════

@app.get("/api/kanban/columns")
def list_columns():
    con = db.get_con()
    cur = con.cursor()
    cur.execute("SELECT * FROM kanban_columns ORDER BY position ASC")
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows

@app.post("/api/kanban/columns", status_code=201)
def create_column(body: KanbanColumnCreate):
    con = db.get_con()
    cur = con.cursor()
    cur.execute("SELECT MAX(position) as mp FROM kanban_columns")
    row = cur.fetchone()
    pos = (row['mp'] or 0) + 1
    cur.execute(
        "INSERT INTO kanban_columns (name, position, color) VALUES (?,?,?)",
        (body.name, pos, body.color or '#7c6aff')
    )
    col_id = cur.lastrowid
    con.commit()
    con.close()
    return {"id": col_id, "message": "作成しました"}

@app.put("/api/kanban/columns/{col_id}")
def update_column(col_id: int, body: KanbanColumnUpdate):
    data = {k: v for k, v in body.dict().items() if v is not None}
    if not data:
        raise HTTPException(400, "更新データがありません")
    db.db_update('kanban_columns', data, {'id': col_id})
    return {"message": "更新しました"}

@app.delete("/api/kanban/columns/{col_id}")
def delete_column(col_id: int):
    con = db.get_con()
    cur = con.cursor()
    cur.execute("SELECT name FROM kanban_columns WHERE id=?", (col_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "列が見つかりません")
    # その列のタスクを「未着手」に移動
    cur.execute("UPDATE tasks SET status='未着手' WHERE status=?", (row['name'],))
    cur.execute("DELETE FROM kanban_columns WHERE id=?", (col_id,))
    con.commit()
    con.close()
    return {"message": "削除しました"}

@app.get("/api/kanban/tasks")
def get_kanban_tasks():
    """カンバン用：全未完了タスクをステータス別に返す"""
    con = db.get_con()
    cur = con.cursor()
    # 列一覧
    cur.execute("SELECT * FROM kanban_columns ORDER BY position ASC")
    columns = [dict(r) for r in cur.fetchall()]
    # タスク一覧
    cur.execute("""
        SELECT t.*, p.name as project_name, p.color as project_color
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.parent_id IS NULL AND t.archived=0
        ORDER BY t.created_at ASC
    """)
    tasks = [dict(r) for r in cur.fetchall()]
    con.close()
    result = {}
    for col in columns:
        result[col['name']] = [t for t in tasks if t.get('status') == col['name']]
    return {"columns": columns, "tasks": result}

# ═══════════════════════════════════════════════════
# セッション API
# ※ 固定パス（/active, /start, /stop, /past, /suggestions）を
#   動的パス（/{session_id}）より先に定義する
# ═══════════════════════════════════════════════════

@app.get("/api/sessions")
def list_sessions(
    date_from: Optional[str] = None,
    date_to:   Optional[str] = None,
    limit:     int = 100
):
    return db.get_sessions(date_from=date_from, date_to=date_to, limit=limit)

@app.get("/api/sessions/active")
def list_active():
    sessions = db.get_active_sessions()
    held_ids = set(_held_sessions.keys())
    return [s for s in sessions if s['id'] not in held_ids]

@app.get("/api/sessions/suggestions")
def get_suggestions():
    return db.get_task_suggestions()

@app.post("/api/sessions/start", status_code=201)
def start_session(body: SessionStart):
    session_id, category, started_at = db.start_session(
        name=body.name,
        task_id=body.task_id,
        estimated_sec=body.estimated_sec,
    )
    active_sessions[session_id] = {
        'id':         session_id,
        'name':       body.name,
        'category':   category,
        'started_at': started_at,
    }
    _schedule_reminder(session_id)
    return {
        "session_id": session_id,
        "task_id":    body.task_id,
        "category":   category,
        "started_at": started_at,
    }

@app.post("/api/sessions/stop")
def stop_session(body: SessionStop):
    duration_sec = db.stop_session(body.session_id)
    if duration_sec is None:
        raise HTTPException(404, "セッションが見つかりません")
    active_sessions.pop(body.session_id, None)
    _clear_reminder(body.session_id)
    return {"duration_sec": duration_sec}

@app.post("/api/sessions/past", status_code=201)
def add_past(body: PastSession):
    session_id = db.add_past_session(
        name=body.name,
        category=body.category or '',
        started_at=body.started_at,
        ended_at=body.ended_at,
        task_id=body.task_id,
    )
    return {"session_id": session_id}

@app.put("/api/sessions/{session_id}")
def update_session(session_id: int, body: SessionUpdate):
    data = {k: v for k, v in body.dict().items() if v is not None}
    if not data:
        raise HTTPException(400, "更新データがありません")
    # duration_secを再計算（started_at/ended_atが変わった場合）
    if body.started_at or body.ended_at:
        con = db.get_con()
        cur = con.cursor()
        cur.execute('SELECT started_at, ended_at FROM sessions WHERE id=?', (session_id,))
        row = cur.fetchone()
        con.close()
        if row:
            s = body.started_at or row['started_at']
            e = body.ended_at   or row['ended_at']
            if s and e:
                import datetime as _dt
                dur = max(0, int((_dt.datetime.fromisoformat(e) - _dt.datetime.fromisoformat(s)).total_seconds()))
                data['duration_sec'] = dur
    db.db_update('sessions', data, {'id': session_id})
    # カテゴリが変更された場合は固定学習として保存
    if body.category and body.name:
        db.save_fixed_category(body.name, body.category)
    elif body.category:
        con = db.get_con()
        cur = con.cursor()
        cur.execute('SELECT name FROM sessions WHERE id=?', (session_id,))
        row = cur.fetchone()
        con.close()
        if row:
            db.save_fixed_category(row['name'], body.category)
    return {"message": "更新しました"}

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int):
    db.db_delete('sessions', {'id': session_id})
    active_sessions.pop(session_id, None)
    _clear_reminder(session_id)
    return {"message": "削除しました"}


# ═══════════════════════════════════════════════════
# レポート API
# ═══════════════════════════════════════════════════

@app.get("/api/report/today")
def today_report():
    return db.get_today_summary()

@app.get("/api/report/weekly")
def weekly_report():
    return db.get_weekly_summary()


# ═══════════════════════════════════════════════════
# 保留中セッション API
# ═══════════════════════════════════════════════════

_held_sessions = {}  # { session_id: { name, task_id, duration_sec } }

@app.post("/api/sessions/hold")
def hold_session(body: dict):
    session_id   = body.get('session_id')
    name         = body.get('name', '')
    task_id      = body.get('task_id')
    duration_sec = body.get('duration_sec', 0)
    _held_sessions[session_id] = {
        'session_id':  session_id,
        'name':        name,
        'task_id':     task_id,
        'duration_sec': duration_sec,
    }
    return {"message": "保留しました"}

@app.get("/api/sessions/held")
def get_held_sessions():
    return list(_held_sessions.values())

@app.delete("/api/sessions/held/{session_id}")
def remove_held_session(session_id: int):
    _held_sessions.pop(session_id, None)
    return {"message": "削除しました"}

# ═══════════════════════════════════════════════════
# アーカイブ・検索 API
# ═══════════════════════════════════════════════════

@app.post("/api/tasks/archive/run")
def run_archive():
    archived = db.run_auto_archive()
    deleted  = db.run_auto_delete()
    return {"archived": archived, "deleted": deleted}

@app.get("/api/tasks/archived")
def get_archived(limit: int = 100, offset: int = 0, search: str = ''):
    return db.get_archived_tasks(limit=limit, offset=offset, search=search)

@app.delete("/api/tasks/archived/{task_id}")
def delete_archived(task_id: int):
    db.db_delete('tasks', {'id': task_id})
    return {"message": "削除しました"}

@app.post("/api/tasks/archived/{task_id}/restore")
def restore_archived(task_id: int):
    db.db_update('tasks', {'archived': 0, 'done': 0, 'done_at': None}, {'id': task_id})
    return {"message": "復元しました"}

@app.get("/api/tasks/search")
def search_tasks(q: str = '', include_done: int = 1, include_archived: int = 0):
    if not q:
        return []
    return db.search_tasks(q, bool(include_done), bool(include_archived))

# ═══════════════════════════════════════════════════
# ムード API
# ═══════════════════════════════════════════════════

@app.get("/api/mood/today")
def get_today_mood():
    return db.get_today_mood() or {}

@app.get("/api/mood/history")
def get_mood_history(limit: int = 30):
    return db.get_moods(limit=limit)

@app.get("/api/mood/stats")
def get_mood_stats(days: int = 30):
    return db.get_mood_stats(days=days)

@app.delete("/api/mood/{mood_id}")
def delete_mood(mood_id: int):
    db.db_delete('moods', {'id': mood_id})
    return {"message": "削除しました"}

@app.post("/api/mood", status_code=201)
def save_mood(body: MoodCreate):
    if not 0 <= body.score <= 4:
        raise HTTPException(400, "スコアは0〜4で指定してください")
    mood_id = db.save_mood(body.score, body.note)
    return {"id": mood_id, "message": "記録しました"}


# ═══════════════════════════════════════════════════
# ジャーナル API
# ═══════════════════════════════════════════════════

@app.get("/api/journals")
def list_journals(limit: int = 20, date_from: Optional[str] = None):
    return db.get_journals(limit=limit, date_from=date_from)

@app.get("/api/journals/{journal_id}")
def get_journal(journal_id: int):
    j = db.get_journal(journal_id)
    if not j:
        raise HTTPException(404, "日記が見つかりません")
    return j

@app.post("/api/journals", status_code=201)
def create_journal(body: JournalCreate):
    journal_id = db.save_journal(
        content=body.content,
        title=body.title,
        prompt=body.prompt,
    )
    return {"id": journal_id, "message": "保存しました"}

@app.put("/api/journals/{journal_id}")
def update_journal(journal_id: int, body: JournalUpdate):
    data = {k: v for k, v in body.dict().items() if v is not None}
    if not data:
        raise HTTPException(400, "更新データがありません")
    db.db_update('journals', data, {'id': journal_id})
    return {"message": "更新しました"}

@app.delete("/api/journals/{journal_id}")
def delete_journal(journal_id: int):
    db.delete_journal(journal_id)
    return {"message": "削除しました"}

# ═══════════════════════════════════════════════════
# AI API
# ═══════════════════════════════════════════════════

@app.get("/api/ai/models")
def get_models():
    return ai.get_ollama_models()

@app.post("/api/ai/decompose")
def decompose(body: DecomposeRequest):
    try:
        result = ai.decompose_task(body.model, body.goal)
        return result
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"AI分解エラー: {str(e)}")

@app.post("/api/ai/lion-eye")
def lion_eye(body: LionEyeRequest):
    content = ai.generate_lion_eye(
        mode=body.mode,
        model=body.model,
        range_start=body.range_start,
        range_end=body.range_end,
    )
    db.db_insert('reports', {
        'range_start': body.range_start,
        'range_end':   body.range_end,
        'mode':        body.mode,
        'model':       body.model or '',
        'content':     content,
        'created_at':  datetime.datetime.now().isoformat(),
    })
    return {"content": content}
