/* ── Ink Productivity — app.js ── */
'use strict';

// ── Service Worker登録（PWA） ─────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js')
      .catch(e => console.warn('SW登録失敗:', e));
  });
}

const API = '';

// ── ユーティリティ ────────────────────────────────
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function fmtSec(sec) {
  if (!sec) return '0分';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function toLocalDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// ── 汎用確認モーダル ──────────────────────────────
function showConfirm(title, msg, okLabel = '削除する') {
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = msg;
    document.getElementById('confirmOkBtn').textContent = okLabel;
    document.getElementById('confirmModal').style.display = 'flex';
    const ok     = document.getElementById('confirmOkBtn');
    const cancel = document.getElementById('confirmCancelBtn');
    function cleanup() {
      document.getElementById('confirmModal').style.display = 'none';
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
    }
    document.getElementById('confirmOkBtn').addEventListener('click', () => { cleanup(); resolve(true); }, { once: true });
    document.getElementById('confirmCancelBtn').addEventListener('click', () => { cleanup(); resolve(false); }, { once: true });
  });
}

// ── 時計 ──────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();
document.getElementById('todayDate').textContent =
  new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

// ── タブ切り替え（PC サイドバー + スマホ タブバー 共通）────
function switchTab(tabName) {
  document.querySelectorAll('.nav-btn,.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (tabName === 'today')    loadTodayTab();
  if (tabName === 'tasks')    loadTasksTab();
  if (tabName === 'mood')     loadMoodTab();
  if (tabName === 'journal')  loadJournalTab();
  if (tabName === 'kanban')   loadKanbanTab();
  if (tabName === 'matrix')   loadMatrixTab();
  if (tabName === 'analysis') loadAnalysisTab();
}
document.querySelectorAll('.nav-btn,.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── アクティブセッション管理 ──────────────────────
let elapsedTimers = {};

function startElapsedTimer(sessionId, startedAt, elId) {
  if (elapsedTimers[elId]) return;
  elapsedTimers[elId] = setInterval(() => {
    const el = document.getElementById(elId);
    if (!el) { clearInterval(elapsedTimers[elId]); delete elapsedTimers[elId]; return; }
    el.textContent = fmtSec(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  }, 1000);
}

async function refreshActiveSessions() {
  try {
    const sessions = await api('GET', '/api/sessions/active');
    await renderHeldSessions();
    const ind = document.getElementById('activeIndicator');
    if (sessions.length > 0) {
      ind.style.display = 'flex';
      document.getElementById('activeCount').textContent = sessions.length;
    } else {
      ind.style.display = 'none';
    }
    // 今日タブの計測中セクションも更新
    renderActiveSectionInToday(sessions);
    // スマホタブバーのバッジ更新
    const badge = document.getElementById('tabBadge');
    if (badge) {
      if (sessions.length > 0) {
        badge.textContent = sessions.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (_) {}
}
setInterval(refreshActiveSessions, 10000);
refreshActiveSessions();

function renderActiveSectionInToday(sessions) {
  const block = document.getElementById('activeSectionBlock');
  const list  = document.getElementById('activeSectionList');
  // 保留中のセッションを除外
  const heldBlock = document.getElementById('heldSectionBlock');
  const heldList  = document.getElementById('heldSectionList');
  const heldIds   = new Set(
    Array.from(heldList ? heldList.querySelectorAll('[data-resume-sid]') : [])
      .map(el => parseInt(el.dataset.resumeSid))
  );
  const activeSessions = sessions.filter(s => !heldIds.has(s.id));
  if (!activeSessions.length) { block.style.display = 'none'; list.innerHTML = ''; return; }
  block.style.display = 'block';
  const filteredSessions = activeSessions;
  sessions = filteredSessions;
  list.innerHTML = sessions.map(s => `
    <div class="active-card" id="acard-${s.id}">
      <div class="pulse-dot"></div>
      <div class="active-info">
        <div class="active-name">${s.name}</div>
        <div>
          <span class="active-elapsed" id="aelapsed-${s.id}">--</span>
          ${s.estimated_sec ? `<span class="active-est">見積 ${fmtSec(s.estimated_sec)}</span>` : ''}
        </div>
      </div>
      <button class="task-btn task-focus-btn" style="margin-right:4px" onclick="openFocusMode('${s.name}')" title="フォーカスモード">⊙</button>
      <button class="btn btn-hold" data-hold-sid="${s.id}" data-task-id="${s.task_id || ''}">⏸ 保留</button>
      <button class="btn btn-done-stop" data-done-sid="${s.id}" data-task-id="${s.task_id || ''}">✓ 完了</button>
    </div>
  `).join('');
  sessions.forEach(s => startElapsedTimer(s.id, s.started_at, `aelapsed-${s.id}`));
  // 保留ボタン：セッションを停止して経過時間を保存
  list.querySelectorAll('[data-hold-sid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid    = parseInt(btn.dataset.holdSid);
      const taskId = btn.dataset.taskId ? parseInt(btn.dataset.taskId) : null;
      const card   = btn.closest('.active-card');
      const nameEl = card?.querySelector('.active-name');
      const name   = nameEl ? nameEl.textContent.trim() : '';
      // タイマーを止めてカードを即座に非表示
      clearInterval(elapsedTimers[`aelapsed-${sid}`]);
      delete elapsedTimers[`aelapsed-${sid}`];
      if (card) card.style.display = 'none';
      // セッションを停止して経過時間を取得
      const res = await api('POST', '/api/sessions/stop', { session_id: sid });
      const elapsedSec = res.duration_sec || 0;
      // 保留状態をサーバーに保存
      await api('POST', '/api/sessions/hold', {
        session_id: sid, name, task_id: taskId, duration_sec: elapsedSec
      });
      // カンバンの「保留中」に自動移動
      if (taskId) {
        try {
          const cols = await api('GET', '/api/kanban/columns');
          const onHold = cols.find(c => ['保留中','保留','On Hold'].includes(c.name));
          if (onHold) await api('POST', `/api/tasks/${taskId}/status`, { status: onHold.name });
        } catch(_) {}
      }
      showToast(`⏸ 「${name}」を保留しました（${fmtSec(elapsedSec)}）`);
      await renderHeldSessions();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
    });
  });

  // 完了ボタン
  list.querySelectorAll('[data-done-sid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid    = parseInt(btn.dataset.doneSid);
      const taskId = btn.dataset.taskId ? parseInt(btn.dataset.taskId) : null;
      const res = await api('POST', '/api/sessions/stop', { session_id: sid });
      showToast(`✓ 完了しました（${fmtSec(res.duration_sec)}）`);
      clearInterval(elapsedTimers[`aelapsed-${sid}`]);
      delete elapsedTimers[`aelapsed-${sid}`];
      // カンバンの「完了」に自動移動
      if (taskId) {
        try {
          const cols = await api('GET', '/api/kanban/columns');
          const done = cols.find(c => ['完了','Done','Completed'].includes(c.name));
          if (done) await api('POST', `/api/tasks/${taskId}/status`, { status: done.name });
          // タスクを完了済みにする
          await api('POST', `/api/tasks/${taskId}/done`);
        } catch(_) {}
      }
      refreshActiveSessions();
      loadTodayTab();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
    });
  });
}

// ── 保留中セッションの表示 ───────────────────────────
async function renderHeldSessions() {
  const block = document.getElementById('heldSectionBlock');
  const list  = document.getElementById('heldSectionList');
  if (!block || !list) return;
  // APIから保留中セッションを取得
  const held = await api('GET', '/api/sessions/held').catch(() => []);
  list.innerHTML = '';
  if (!held.length) {
    block.style.display = 'none';
    return;
  }
  block.style.display = 'block';
  held.forEach(s => {
    const div = document.createElement('div');
    div.className = 'active-card held-card';
    div.id = `hcard-${s.session_id}`;
    div.style.borderColor = '#ffaa00';
    div.innerHTML = `
      <div class="pulse-dot" style="background:#ffaa00;animation:none"></div>
      <div class="active-info">
        <div class="active-name">${s.name}</div>
        <div><span style="color:#ffaa00;font-size:12px">⏸ 保留中 ${fmtSec(s.duration_sec || 0)}</span></div>
      </div>
      <button class="btn btn-primary" style="font-size:12px" data-resume-name="${s.name}" data-resume-task="${s.task_id || ''}" data-resume-sid="${s.session_id}" data-resume-elapsed="${s.duration_sec || 0}">▶ 再開</button>
      <button class="btn btn-done-stop" style="font-size:12px" data-held-done-sid="${s.session_id}" data-resume-task="${s.task_id || ''}">✓ 完了</button>
    `;
    list.appendChild(div);

    // 再開ボタン：新しいセッションを開始して保留前の経過時間から継続
    div.querySelector('[data-resume-sid]').addEventListener('click', async () => {
      const resumeBtn  = div.querySelector('[data-resume-sid]');
      const name       = resumeBtn.dataset.resumeName;
      const taskId     = resumeBtn.dataset.resumeTask || null;
      const elapsedSec = parseInt(resumeBtn.dataset.resumeElapsed || '0');
      await api('DELETE', `/api/sessions/held/${s.session_id}`);
      div.remove();
      // 新しいセッションを開始（保留前の経過時間を引き継ぐため開始時刻を調整）
      const fakeStart = new Date(Date.now() - elapsedSec * 1000).toISOString();
      const newRes = await api('POST', '/api/sessions/start', {
        name, task_id: taskId ? parseInt(taskId) : null
      });
      // started_atを調整して経過時間を引き継ぐ
      if (newRes && newRes.session_id) {
        await api('PUT', `/api/sessions/${newRes.session_id}`, { started_at: fakeStart }).catch(() => {});
      }
      if (taskId) {
        try {
          const cols = await api('GET', '/api/kanban/columns');
          const inP = cols.find(c => ['実行中','進行中'].includes(c.name));
          if (inP) await api('POST', `/api/tasks/${parseInt(taskId)}/status`, { status: inP.name });
        } catch(_) {}
      }
      showToast(`▶ 「${name}」を再開しました`);
      await refreshActiveSessions();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
    });

    // 保留から完了ボタン
    div.querySelector('[data-held-done-sid]').addEventListener('click', async () => {
      const taskId = div.querySelector('[data-resume-task]').dataset.resumeTask || null;
      await api('DELETE', `/api/sessions/held/${s.session_id}`);
      div.remove();
      if (taskId) {
        try {
          const cols = await api('GET', '/api/kanban/columns');
          const done = cols.find(c => ['完了','Done'].includes(c.name));
          if (done) await api('POST', `/api/tasks/${parseInt(taskId)}/status`, { status: done.name });
          await api('POST', `/api/tasks/${parseInt(taskId)}/done`);
        } catch(_) {}
      }
      showToast('✓ 完了しました');
      await refreshActiveSessions();
      loadTodayTab();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
    });
  });
}

// ── サジェスト ────────────────────────────────────
let suggestions = [];
async function loadSuggestions() {
  suggestions = await api('GET', '/api/sessions/suggestions').catch(() => []);
}
loadSuggestions();

function bindSuggestions(inputEl, listEl) {
  inputEl.addEventListener('input', () => {
    const val = inputEl.value.trim().toLowerCase();
    if (!val) { listEl.classList.remove('open'); return; }
    const filtered = suggestions.filter(s => s.toLowerCase().includes(val));
    if (!filtered.length) { listEl.classList.remove('open'); return; }
    listEl.innerHTML = filtered.map(s => `<div class="suggestion-item">${s}</div>`).join('');
    listEl.classList.add('open');
  });
  listEl.addEventListener('click', e => {
    if (e.target.classList.contains('suggestion-item')) {
      inputEl.value = e.target.textContent;
      listEl.classList.remove('open');
    }
  });
  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) listEl.classList.remove('open');
  });
}
bindSuggestions(document.getElementById('quickTaskInput'), document.getElementById('suggestionsList'));

// ── 今日タブ ──────────────────────────────────────
async function loadTodayTab() {
  try {
    const data = await api('GET', '/api/report/today');
    document.getElementById('summaryTotalTime').textContent  = fmtSec(data.total_sec);
    document.getElementById('summarySessionCnt').textContent = data.session_cnt + '件';
    document.getElementById('summaryDoneTasks').textContent  = data.done_tasks + '件';

    const list = document.getElementById('todaySessionList');
    if (!data.sessions.length) {
      list.innerHTML = '<div class="empty-state"><img src="/static/Ink_Productivity.png" style="width:70px;opacity:.35;margin-bottom:8px"><br>まだ記録がありません</div>';
      return;
    }
    list.innerHTML = data.sessions.map(s => `
      <div class="session-item" data-sid="${s.id}">
        <span class="session-name">${s.name}</span>
        <span class="session-cat">${s.category}</span>
        <span class="session-dur">${fmtSec(s.duration_sec)}</span>
        <span class="session-time">${fmtTime(s.started_at)} - ${fmtTime(s.ended_at)}</span>
        <div class="session-actions">
          <button class="task-btn task-focus-btn session-focus-btn" data-name="${s.name}" title="フォーカスモード">⊙</button>
          <button class="task-btn session-edit-btn"
            data-sid="${s.id}" data-name="${s.name}"
            data-category="${s.category}"
            data-started-at="${s.started_at}"
            data-ended-at="${s.ended_at}"
            data-note="${s.note || ''}">編集</button>
          <button class="task-btn session-del-btn" data-sid="${s.id}" data-name="${s.name}">削除</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.session-focus-btn').forEach(btn => {
      btn.addEventListener('click', () => openFocusMode(btn.dataset.name));
    });
    list.querySelectorAll('.session-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openSessionEditModal(btn.dataset));
    });
    list.querySelectorAll('.session-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await showConfirm('記録を削除', `「${btn.dataset.name}」を削除しますか？`);
        if (!ok) return;
        await api('DELETE', `/api/sessions/${btn.dataset.sid}`);
        showToast('削除しました');
        loadTodayTab();
      });
    });
  } catch (e) { showToast('今日のデータ取得に失敗: ' + e.message); }
  await renderHeldSessions();
}
loadTodayTab();

// クイックスタート
document.getElementById('quickStartBtn').addEventListener('click', async () => {
  const name   = document.getElementById('quickTaskInput').value.trim();
  const estMin = parseInt(document.getElementById('quickEstMin').value) || null;
  if (!name) { showToast('タスク名を入力してください'); return; }
  try {
    const qres = await api('POST', '/api/sessions/start', { name, estimated_sec: estMin ? estMin * 60 : null });
    // カンバンの「実行中」に自動移動
    if (qres && qres.task_id) {
      try {
        const cols = await api('GET', '/api/kanban/columns');
        const inProgress = cols.find(c => ['実行中','進行中','In Progress'].includes(c.name));
        if (inProgress) await api('POST', `/api/tasks/${qres.task_id}/status`, { status: inProgress.name });
      } catch(_) {}
    }
    document.getElementById('quickTaskInput').value = '';
    document.getElementById('quickEstMin').value    = '';
    showToast(`「${name}」を開始しました`);
    refreshActiveSessions();
    loadTodayTab();
    loadSuggestions();
  } catch (e) { showToast('開始エラー: ' + e.message); }
});

// クイックスタート：Enterキーで開始
document.getElementById('quickTaskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('quickStartBtn').click();
});

// ── クイックタスク登録 ───────────────────────────────
async function loadQtaskProjects() {
  const sel = document.getElementById('qtaskProject');
  if (!sel) return;
  sel.innerHTML = '<option value="">プロジェクト未設定</option>';
  try {
    const projects = await api('GET', '/api/projects');
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  } catch (_) {}
}
loadQtaskProjects();
document.getElementById('qtaskSaveBtn').addEventListener('click', async () => {
  const name      = document.getElementById('qtaskName').value.trim();
  const due       = document.getElementById('qtaskDue').value || null;
  const projectId = parseInt(document.getElementById('qtaskProject').value) || null;
  const priority  = document.getElementById('qtaskPriority').value;
  if (!name) { showToast('タスク名を入力してください'); return; }
  try {
    await api('POST', '/api/tasks', {
      name,
      project_id:    projectId,
      priority,
      due_date:      due,
    });
    document.getElementById('qtaskName').value = '';
    document.getElementById('qtaskDue').value  = '';
    showToast(`「${name}」を登録しました`);
    if (document.getElementById('tab-tasks').classList.contains('active'))  loadTasksTab();
    if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
  } catch (e) { showToast('登録エラー: ' + e.message); }
});

// Enterキーで登録
document.getElementById('qtaskName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('qtaskSaveBtn').click();
});

// ── セッション編集モーダル ────────────────────────
async function openSessionEditModal(dataset) {
  document.getElementById('editSessionId').value       = dataset.sid;
  document.getElementById('editSessionName').value     = dataset.name || '';
  document.getElementById('editSessionCategory').value = dataset.category || 'その他';
  document.getElementById('editSessionNote').value     = dataset.note || '';
  document.getElementById('editSessionStart').value    = toLocalDT(dataset.startedAt || dataset['started-at']);
  document.getElementById('editSessionEnd').value      = toLocalDT(dataset.endedAt   || dataset['ended-at']);
  // プロジェクト一覧を読み込む
  const sel = document.getElementById('editSessionProject');
  sel.innerHTML = '<option value="">未設定</option>';
  try {
    const projects = await api('GET', '/api/projects');
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (String(p.id) === String(dataset.projectId || '')) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch (_) {}
  document.getElementById('sessionEditModal').style.display = 'flex';
}
document.getElementById('sessionEditCancelBtn').addEventListener('click', () => {
  document.getElementById('sessionEditModal').style.display = 'none';
});
document.getElementById('sessionEditSaveBtn').addEventListener('click', async () => {
  const sid      = parseInt(document.getElementById('editSessionId').value);
  const name     = document.getElementById('editSessionName').value.trim();
  const category = document.getElementById('editSessionCategory').value;
  const startVal = document.getElementById('editSessionStart').value;
  const endVal   = document.getElementById('editSessionEnd').value;
  if (!name) { showToast('タスク名を入力してください'); return; }
  const note      = document.getElementById('editSessionNote').value || null;
  const projectId = document.getElementById('editSessionProject').value || null;
  const body = { name, category, note };
  if (projectId)  body.task_id    = null; // セッションのproject紐付けはtask経由
  if (startVal)   body.started_at = new Date(startVal).toISOString();
  if (endVal)     body.ended_at   = new Date(endVal).toISOString();
  await api('PUT', `/api/sessions/${sid}`, body);
  document.getElementById('sessionEditModal').style.display = 'none';
  showToast('更新しました');
  loadTodayTab();
});

// 過去セッション追加モーダル（分析タブから呼ぶ用に残す）
document.getElementById('pastCancelBtn').addEventListener('click', () => {
  document.getElementById('pastModal').style.display = 'none';
});
document.getElementById('pastSaveBtn').addEventListener('click', async () => {
  const name  = document.getElementById('pastName').value.trim();
  const start = document.getElementById('pastStart').value;
  const end   = document.getElementById('pastEnd').value;
  if (!name || !start || !end) { showToast('すべての項目を入力してください'); return; }
  await api('POST', '/api/sessions/past', {
    name,
    started_at: new Date(start).toISOString(),
    ended_at:   new Date(end).toISOString(),
  });
  document.getElementById('pastModal').style.display = 'none';
  showToast('追加しました');
  loadTodayTab();
});

// ── タスクタブ ────────────────────────────────────
const PROJECT_COLORS = ['#7c6aff','#9b6aff','#ff6a9b','#ff6adb','#ff5f57','#ff8c42','#ffb86a','#ffd700','#6affcc','#6aff9b','#5fb3ff','#6ae8ff','#6b6b80','#a0a0b0','#ffffff'];

async function loadTasksTab() {
  try {
    const list    = document.getElementById('projectList');
    const openIds = new Set();
    list.querySelectorAll('.project-card.open').forEach(el => openIds.add(el.dataset.id));
    list.innerHTML = '';

    // 受信トレイ（プロジェクト未設定タスク）
    const inboxTasks = await api('GET', '/api/tasks?inbox=true');
    if (inboxTasks.length) {
      const inboxCard = buildProjectCard(
        { id: '__inbox__', name: '📥 受信トレイ', color: '#6b6b80', description: '' },
        inboxTasks,
        openIds.has('__inbox__')
      );
      list.appendChild(inboxCard);
    }

    const projects = await api('GET', '/api/projects');
    if (!projects.length && !inboxTasks.length) {
      list.innerHTML = '<div class="empty-state"><div class="lion-empty"><img src="/static/Ink_Productivity.png" style="width:80px;opacity:.4"></div>プロジェクトがありません<br><small>＋ プロジェクト ボタンで作成してください</small></div>';
      return;
    }
    // 並列でタスクを取得して高速化
    const tasksList = await Promise.all(
      projects.map(p => api('GET', `/api/tasks?project_id=${p.id}`))
    );
    projects.forEach((p, i) => {
      const card = buildProjectCard(p, tasksList[i], openIds.has(String(p.id)));
      list.appendChild(card);
    });
  } catch (e) { showToast('タスク取得エラー: ' + e.message); }
}

function buildProjectCard(project, tasks, isOpen = false) {
  const el = document.createElement('div');
  el.className = 'project-card' + (isOpen ? ' open' : '');
  el.dataset.id = project.id;

  const doneCnt  = tasks.filter(t => t.done).length;
  const totalCnt = tasks.length;
  const pct      = totalCnt > 0 ? Math.round(doneCnt / totalCnt * 100) : 0;

  el.innerHTML = `
    <div class="project-header">
      <div class="project-color" style="background:${project.color || '#7c6aff'}"></div>
      <span class="project-name">${project.name}</span>
      <span class="project-meta">${doneCnt}/${totalCnt} <span class="project-pct">${pct}%</span></span>
      <span class="project-arrow">▶</span>
    </div>
    <div class="project-progress" style="display:${totalCnt>0?'block':'none'}">
      <div class="project-progress-bar" style="width:${pct}%;background:${project.color||'#7c6aff'}"></div>
    </div>
    <div class="project-tasks" style="display:${isOpen ? 'block' : 'none'}">
      ${tasks.length ? tasks.map(t => buildTaskHTML(t)).join('') : '<div style="color:var(--muted);font-size:12px;padding:8px 0">タスクがありません</div>'}
    </div>
    <div class="project-footer">
      <button class="btn btn-ghost" style="font-size:12px" data-action="add-task"    data-pid="${project.id}">＋ タスク追加</button>
      <button class="btn btn-ghost" style="font-size:12px" data-action="edit-project" data-pid="${project.id}">編集</button>
      <button class="btn btn-ghost" style="font-size:12px" data-action="del-project"  data-pid="${project.id}">削除</button>
    </div>
  `;

  // 手動開閉のみ（ヘッダークリックだけ）
  el.querySelector('.project-header').addEventListener('click', e => {
    // フッターボタンのクリックが伝播してきた場合は無視
    if (e.target.closest('[data-action]')) return;
    const body = el.querySelector('.project-tasks');
    const open = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    el.classList.toggle('open', open);
  });

  // タスク追加
  el.querySelector('[data-action="add-task"]').addEventListener('click', e => {
    e.stopPropagation();
    openTaskModal(parseInt(e.target.dataset.pid), null);
  });

  // プロジェクト削除
  el.querySelector('[data-action="edit-project"]').addEventListener('click', e => {
    e.stopPropagation();
    openProjectModal(project);
  });
  el.querySelector('[data-action="del-project"]').addEventListener('click', async e => {
    e.stopPropagation();
    if (project.id === '__inbox__') {
      const ok = await showConfirm('受信トレイを空にする', '受信トレイのタスクをすべて削除しますか？');
      if (!ok) return;
      const inbox = await api('GET', '/api/tasks?inbox=true');
      for (const t of inbox) { await api('DELETE', `/api/tasks/${t.id}`); }
      showToast('受信トレイを空にしました');
      loadTasksTab();
      return;
    }
    const ok = await showConfirm('プロジェクトを削除', `「${project.name}」を削除しますか？\n配下のタスクとの紐付けも解除されます。`);
    if (!ok) return;
    await api('DELETE', `/api/projects/${project.id}`);
    showToast('削除しました');
    loadTasksTab();
  });

  // タスク操作（完了トグル・タイマー開始・サブタスク追加・削除）
  el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const tid    = parseInt(btn.dataset.tid);

    if (action === 'detail-task') {
      openTaskDetail(tid);
      return;
    }
    if (action === 'cycle-status') {
      // 動的列からサイクルを取得
      let cols = [];
      try { cols = (await api('GET', '/api/kanban/columns')).map(c => c.name); } catch(_) {}
      if (!cols.length) cols = ['未着手','実行中','保留中','完了'];
      const cur  = btn.dataset.status || cols[0];
      const idx  = cols.indexOf(cur);
      const next = cols[(idx + 1) % cols.length];
      await api('POST', `/api/tasks/${tid}/status`, { status: next });
      btn.dataset.status = next;
      btn.textContent    = next;
      const isDone = next === '完了';
      const check  = btn.closest('.task-item')?.querySelector('.task-check');
      const nameEl = btn.closest('.task-item')?.querySelector('.task-name');
      if (isDone) { check?.classList.add('done'); nameEl?.classList.add('done'); }
      else        { check?.classList.remove('done'); nameEl?.classList.remove('done'); }
      return;
    }
    if (action === 'focus-task') {
      openFocusMode(btn.dataset.name);
      return;
    }
    if (action === 'toggle') {
      await api('POST', `/api/tasks/${tid}/done`);
      // チェック状態だけ更新、開閉は維持
      const check = btn;
      const isDone = check.classList.toggle('done');
      const nameEl = check.closest('.task-item, .subtask-item')?.querySelector('.task-name');
      if (nameEl) nameEl.classList.toggle('done', isDone);
      // 完了時にアーカイブボタンを動的に追加/削除
      const taskItem = check.closest('.task-item, .subtask-item');
      if (taskItem) {
        const existingArc = taskItem.querySelector('[data-action="archive-task"]');
        if (isDone && !existingArc) {
          const arcBtn = document.createElement('button');
          arcBtn.className = 'task-btn';
          arcBtn.dataset.action = 'archive-task';
          arcBtn.dataset.tid = tid;
          arcBtn.title = 'アーカイブ';
          arcBtn.textContent = '↯';
          const delBtn = taskItem.querySelector('[data-action="del-task"]');
          if (delBtn) delBtn.before(arcBtn);
        } else if (!isDone && existingArc) {
          existingArc.remove();
        }
      }
      // カウンターも更新
      const doneNow = el.querySelectorAll('.task-check.done').length;
      const total   = el.querySelectorAll('.task-check').length;
      el.querySelector('.project-meta').textContent = `${doneNow}/${total}`;
    }
    if (action === 'start-task') {
      const name = btn.dataset.name;
      await api('POST', '/api/sessions/start', { name, task_id: tid });
      // カンバンを「実行中」に自動変更
      try {
        const cols = await api('GET', '/api/kanban/columns');
        const inProgress = cols.find(c => c.name === '実行中' || c.name === '進行中' || c.name === 'In Progress');
        if (inProgress) await api('POST', `/api/tasks/${tid}/status`, { status: inProgress.name });
      } catch(_) {}
      showToast(`「${name}」を開始しました`);
      refreshActiveSessions();
      loadTodayTab();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
    }
    if (action === 'add-sub') {
      openTaskModal(parseInt(btn.dataset.pid), tid);
    }
    if (action === 'archive-task') {
      await api('PUT', `/api/tasks/${tid}`, { archived: 1 });
      showToast('アーカイブしました');
      const openIds2 = new Set();
      document.querySelectorAll('.project-card.open').forEach(c => openIds2.add(c.dataset.id));
      const tasks2 = await api('GET', `/api/tasks?project_id=${project.id}`);
      const newCard2 = buildProjectCard(project, tasks2, openIds2.has(String(project.id)));
      el.replaceWith(newCard2);
      loadArchiveTab();
      if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
      return;
    }
    if (action === 'del-task') {
      const ok = await showConfirm('タスクを削除', 'このタスクを削除しますか？\nサブタスクも削除されます。');
      if (!ok) return;
      await api('DELETE', `/api/tasks/${tid}`);
      showToast('削除しました');
      const openIds = new Set();
      document.querySelectorAll('.project-card.open').forEach(c => openIds.add(c.dataset.id));
      if (project.id === '__inbox__') { loadTasksTab(); return; }
      const tasks2 = await api('GET', `/api/tasks?project_id=${project.id}`);
      const newCard = buildProjectCard(project, tasks2, openIds.has(String(project.id)));
      el.replaceWith(newCard);
    }
  });

  return el;
}

function buildTaskHTML(task) {

  const subs = (task.subtasks || []).map(s => `
    <div class="subtask-item">
      <div class="task-check ${s.done ? 'done' : ''}" data-action="toggle" data-tid="${s.id}"></div>
      <span class="task-name ${s.done ? 'done' : ''}">${s.name}</span>
      ${s.estimated_min ? `<span class="session-cat">${s.estimated_min}分</span>` : ''}
    </div>
  `).join('');
  const statusLabels = { todo:'未着手', in_progress:'実行中', on_hold:'保留中', done:'完了' };
  const matrixLabels = {
    'high-high': { label:'緊急対応', cls:'q1' },
    'high-low':  { label:'重点育成', cls:'q2' },
    'low-high':  { label:'即断処理', cls:'q3' },
    'low-low':   { label:'保留',     cls:'q4' },
  };
  const matrixKey    = task.importance && task.urgency ? `${task.importance}-${task.urgency}` : null;
  const matrixInfo   = matrixKey ? matrixLabels[matrixKey] : null;
  const status = task.status || 'todo';
  const statusClass = 'status-' + status;
  const statusLabel = statusLabels[status] || '未着手';
  return `
    <div class="task-item">
      <div class="task-check ${task.done ? 'done' : ''}" data-action="toggle" data-tid="${task.id}"></div>
      <span class="task-name ${task.done ? 'done' : ''}">${task.name}</span>
      <span class="status-badge ${statusClass}" data-action="cycle-status" data-tid="${task.id}" data-status="${status}">${statusLabel}</span>
      ${matrixInfo ? `<span class="matrix-mini-badge ${matrixInfo.cls}">${matrixInfo.label}</span>` : ''}

      ${task.estimated_min ? `<span class="session-cat">${task.estimated_min}分</span>` : ''}
      <div class="task-actions">
        <button class="task-btn task-focus-btn" data-action="focus-task" data-tid="${task.id}" data-name="${task.name}" title="フォーカスモード">⊙</button>
        <button class="task-btn" data-action="start-task"   data-tid="${task.id}" data-name="${task.name}">▶</button>
        <button class="task-btn" data-action="detail-task"  data-tid="${task.id}">…</button>
        <button class="task-btn" data-action="add-sub"      data-tid="${task.id}" data-pid="${task.project_id}">+</button>
        ${task.done ? `<button class="task-btn" data-action="archive-task" data-tid="${task.id}" title="アーカイブ">↯</button>` : ''}
        <button class="task-btn" data-action="del-task"     data-tid="${task.id}">✕</button>
      </div>
      ${task.assignee ? `<span class="task-assignee">𓀠 ${task.assignee}</span>` : ''}
    </div>
    ${subs}
  `;
}

// ── タスク詳細パネル ──────────────────────────────
let _detailTaskId = null;

async function openTaskDetail(taskId) {
  _detailTaskId = taskId;
  // DBから直接取得
  const tasks = await api('GET', '/api/tasks');
  // 全プロジェクトのタスクから検索
  let task = null;
  const projects = await api('GET', '/api/projects');
  for (const p of projects) {
    const pts = await api('GET', `/api/tasks?project_id=${p.id}`);
    task = pts.find(t => t.id === taskId);
    if (!task) {
      const subs = pts.flatMap(t => t.subtasks || []);
      task = subs.find(t => t.id === taskId);
    }
    if (task) break;
  }
  if (!task) {
    const inbox = await api('GET', '/api/tasks?inbox=true');
    task = inbox.find(t => t.id === taskId);
  }
  if (!task) { showToast('タスクが見つかりません'); return; }

  document.getElementById('detailTaskName').value           = task.name;
  document.getElementById('detailDescription').value        = task.description || '';
  document.getElementById('detailAssignee').value           = task.assignee    || '';

  document.getElementById('detailDueDate').value            = task.due_date    || '';
  document.getElementById('detailEstMin').value             = task.estimated_min || '';
  document.getElementById('detailCategory').value           = task.category    || 'その他';
  // 優先度は非表示
  document.getElementById('detailImportance').value         = task.importance  || 'low';
  document.getElementById('detailUrgency').value            = task.urgency     || 'low';
  document.getElementById('taskDetailModal').style.display  = 'flex';
}

document.getElementById('detailCancelBtn').addEventListener('click', () => {
  document.getElementById('taskDetailModal').style.display = 'none';
  _detailTaskId = null;
});

document.getElementById('detailSaveBtn').addEventListener('click', async () => {
  if (!_detailTaskId) return;
  const body = {
    name:          document.getElementById('detailTaskName').value.trim() || undefined,
    description:   document.getElementById('detailDescription').value || null,
    assignee:      document.getElementById('detailAssignee').value    || null,
    due_date:      document.getElementById('detailDueDate').value     || null,
    estimated_min: parseInt(document.getElementById('detailEstMin').value) || null,
    category:      document.getElementById('detailCategory').value,
    priority:      document.getElementById('detailPriority').value,
    importance:    document.getElementById('detailImportance').value,
    urgency:       document.getElementById('detailUrgency').value,
  };
  await api('PUT', `/api/tasks/${_detailTaskId}`, body);
  document.getElementById('taskDetailModal').style.display = 'none';
  showToast('更新しました');
  _detailTaskId = null;
  loadTasksTab();
  if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
  if (document.getElementById('tab-matrix').classList.contains('active')) loadMatrixTab();
});

// プロジェクト作成モーダル
function openProjectModal(project = null) {
  document.getElementById('projectName').value = project ? project.name : '';
  document.getElementById('projectDesc').value = project ? (project.description || '') : '';
  document.getElementById('projectModal').dataset.editId = project ? project.id : '';
  document.querySelector('#projectModal .modal-title').textContent = project ? 'プロジェクトを編集' : 'プロジェクトを作成';
  document.getElementById('projectSaveBtn').textContent = project ? '更新' : '作成';
  const picks = document.getElementById('colorPicks');
  picks.innerHTML = PROJECT_COLORS.map((c) =>
    `<div class="color-pick ${project ? c===project.color : c===PROJECT_COLORS[0] ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  picks.querySelectorAll('.color-pick').forEach(p => {
    p.addEventListener('click', () => {
      picks.querySelectorAll('.color-pick').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
    });
  });
  document.getElementById('projectModal').style.display = 'flex';
  setTimeout(() => document.getElementById('projectName').focus(), 100);
}
document.getElementById('newProjectBtn').addEventListener('click', () => openProjectModal());
document.getElementById('projectCancelBtn').addEventListener('click', () => {
  document.getElementById('projectModal').style.display = 'none';
});
document.getElementById('projectSaveBtn').addEventListener('click', async () => {
  const btn = document.getElementById('projectSaveBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  const name   = document.getElementById('projectName').value.trim();
  const desc   = document.getElementById('projectDesc').value.trim();
  const color  = document.querySelector('#colorPicks .color-pick.selected')?.dataset.color || '#7c6aff';
  const editId = document.getElementById('projectModal').dataset.editId;
  if (!name) { showToast('プロジェクト名を入力してください'); btn.disabled = false; return; }
  if (editId) {
    await api('PUT', `/api/projects/${editId}`, { name, description: desc, color });
    showToast('更新しました');
  } else {
    await api('POST', '/api/projects', { name, description: desc, color });
    showToast('プロジェクトを作成しました');
  }
  document.getElementById('projectModal').style.display = 'none';
  btn.disabled = false;
  loadTasksTab();
});

// タスク作成モーダル
async function openTaskModal(projectId, parentId) {
  document.getElementById('taskProjectId').value   = projectId || '';
  document.getElementById('taskParentId').value    = parentId  || '';
  document.getElementById('taskName').value        = '';
  document.getElementById('taskCategory').value   = '';
  document.getElementById('taskPriority').value   = 'medium';
  document.getElementById('taskDueDate').value    = '';
  document.getElementById('taskEstMin').value     = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskAssignee').value   = '';
  document.getElementById('taskImportance').value = 'low';
  document.getElementById('taskUrgency').value    = 'low';

  // プロジェクト選択を毎回読み込む
  const projSel = document.getElementById('taskModalProject');
  projSel.innerHTML = '<option value="">プロジェクト未設定</option>';
  try {
    const projects = await api('GET', '/api/projects');
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (projectId && parseInt(p.id) === parseInt(projectId)) opt.selected = true;
      projSel.appendChild(opt);
    });
  } catch(_) {}
  projSel.onchange = () => {
    document.getElementById('taskProjectId').value = projSel.value;
  };

  document.getElementById('taskModal').style.display = 'flex';
}
document.getElementById('taskCancelBtn').addEventListener('click', () => {
  document.getElementById('taskModal').style.display = 'none';
});
document.getElementById('taskSaveBtn').addEventListener('click', async () => {
  const name      = document.getElementById('taskName').value.trim();
  const projectId = parseInt(document.getElementById('taskProjectId').value) || null;
  const parentId  = parseInt(document.getElementById('taskParentId').value)  || null;
  if (!name) { showToast('タスク名を入力してください'); return; }
  await api('POST', '/api/tasks', {
    name,
    project_id:    projectId,
    parent_id:     parentId,
    category:      document.getElementById('taskCategory').value     || null,
    priority:      document.getElementById('taskPriority').value,
    due_date:      document.getElementById('taskDueDate').value       || null,
    estimated_min: parseInt(document.getElementById('taskEstMin').value) || null,
    description:   document.getElementById('taskDescription').value   || null,
    assignee:      document.getElementById('taskAssignee').value      || null,
    importance:    document.getElementById('taskImportance').value    || 'low',
    urgency:       document.getElementById('taskUrgency').value       || 'low',
  });
  document.getElementById('taskModal').style.display = 'none';
  showToast('タスクを追加しました');
  loadTasksTab();
  if (document.getElementById('tab-kanban').classList.contains('active')) loadKanbanTab();
});

// ── スケジュールビュー ────────────────────────────
(function initSchedule() {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const fmt = d => d.toISOString().slice(0,10);
  document.getElementById('scheduleStart').value = fmt(today);
  document.getElementById('scheduleEnd').value   = fmt(nextWeek);
})();

document.getElementById('scheduleSearchBtn').addEventListener('click', async () => {
  const start    = document.getElementById('scheduleStart').value;
  const end      = document.getElementById('scheduleEnd').value;
  const noDate   = document.getElementById('scheduleNoDate').checked;
  const overdue  = document.getElementById('scheduleOverdue').checked;
  const result   = document.getElementById('scheduleResult');
  result.innerHTML = '<span class="spinner"></span>';

  try {
    const projects  = await api('GET', '/api/projects');
    const today     = new Date().toISOString().slice(0,10);
    let matched     = [];

    for (const p of projects) {
      const tasks = await api('GET', `/api/tasks?project_id=${p.id}`);
      const flat  = tasks.flatMap(t => [t, ...(t.subtasks||[])]);
      for (const t of flat) {
        if (t.done) continue;
        const due = t.due_date;
        let include = false;

        if (due) {
          // 期間内
          if ((!start || due >= start) && (!end || due <= end)) include = true;
          // 期限切れ
          if (overdue && due < today) include = true;
        } else {
          // 日付なし
          if (noDate) include = true;
        }

        if (include) {
          matched.push({ ...t, project_name: p.name, project_color: p.color });
        }
      }
    }

    // 受信トレイも検索
    const inbox = await api('GET', '/api/tasks?inbox=true');
    for (const t of inbox) {
      if (t.done) continue;
      const due = t.due_date;
      let include = false;
      if (due) {
        if ((!start || due >= start) && (!end || due <= end)) include = true;
        if (overdue && due < today) include = true;
      } else {
        if (noDate) include = true;
      }
      if (include) matched.push({ ...t, project_name: '受信トレイ', project_color: '#6b6b80' });
    }

    // 日付順ソート（日付なしは末尾）
    matched.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    if (!matched.length) {
      result.innerHTML = '<div class="empty-state" style="padding:20px"><img src="/static/Ink_Productivity.png" style="width:50px;opacity:.35;margin-bottom:6px"><br>該当するタスクがありません</div>';
      return;
    }

    const todayStr = new Date().toISOString().slice(0,10);
    result.innerHTML = matched.map(t => {
      const isOverdue = t.due_date && t.due_date < todayStr;
      const cls = isOverdue ? 'overdue' : (!t.due_date ? 'no-date' : '');
      const dueLabel = t.due_date
        ? `<span class="schedule-due ${isOverdue?'overdue':''}">${t.due_date}${isOverdue?' ⚠':''}` + '</span>'
        : '<span class="schedule-due" style="color:var(--muted)">日付なし</span>';
      return `<div class="schedule-item ${cls}">
        <div class="task-check ${t.done?'done':''}" style="pointer-events:none"></div>
        <span class="schedule-task-name">${t.name}</span>
        ${dueLabel}
        <span class="schedule-project" style="color:${t.project_color}">${t.project_name}</span>
      </div>`;
    }).join('');
  } catch(e) {
    result.innerHTML = '<div style="color:var(--danger);font-size:13px">取得エラー: ' + e.message + '</div>';
  }
});

// AI分解
document.getElementById('aiDecomposeBtn').addEventListener('click', async () => {
  const goal  = document.getElementById('aiGoalInput').value.trim();
  const model = document.getElementById('aiModelSelect').value;
  if (!goal)  { showToast('ゴールを入力してください'); return; }
  if (!model) { showToast('モデルを選択してください'); return; }
  const btn = document.getElementById('aiDecomposeBtn');
  btn.disabled = true; btn.textContent = '分解中…';
  try {
    const result = await api('POST', '/api/ai/decompose', { goal, model });
    renderAIPreview(result);
  } catch (e) {
    showToast('AI分解エラー: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '分解';
  }
});

let aiDecomposeResult = null;
function renderAIPreview(result) {
  aiDecomposeResult = result;
  let html = `<div class="ai-preview-project">📁 ${result.project_name}</div>`;
  for (const t of (result.tasks || [])) {
    html += `<div class="ai-task-row">
      <div class="ai-task-name">▸ ${t.name}</div>
      <div class="ai-task-meta">${t.category||'その他'} / ${t.estimated_min ? t.estimated_min+'分' : '未設定'}</div>
      ${(t.subtasks||[]).map(s=>`<div class="ai-sub-row">　└ ${s.name} ${s.estimated_min?'('+s.estimated_min+'分)':''}</div>`).join('')}
    </div>`;
  }
  document.getElementById('aiPreview').innerHTML = html;
  document.getElementById('aiPreview').style.display = 'block';
  document.getElementById('aiActions').style.display = 'flex';
}
document.getElementById('aiCancelBtn').addEventListener('click', () => {
  document.getElementById('aiPreview').style.display = 'none';
  document.getElementById('aiActions').style.display = 'none';
  aiDecomposeResult = null;
});
document.getElementById('aiRegisterBtn').addEventListener('click', async () => {
  if (!aiDecomposeResult) return;
  const projectId = await api('POST', '/api/projects', { name: aiDecomposeResult.project_name }).then(r => r.id);
  await api('POST', '/api/tasks/bulk', { project_id: projectId, tasks: aiDecomposeResult.tasks });
  showToast(`「${aiDecomposeResult.project_name}」を登録しました`);
  document.getElementById('aiPreview').style.display = 'none';
  document.getElementById('aiActions').style.display = 'none';
  document.getElementById('aiGoalInput').value = '';
  aiDecomposeResult = null;
  loadTasksTab();
});

// ── 分析タブ ──────────────────────────────────────
async function loadAnalysisTab() {
  try {
    const data = await api('GET', '/api/report/weekly');
    const el   = document.getElementById('weeklySummary');
    const cats = Object.entries(data.by_category || {}).sort((a, b) => b[1] - a[1]);
    el.innerHTML = `
      <div class="weekly-row"><span class="weekly-label">総活動時間</span><span class="weekly-val">${fmtSec(data.total_sec)}</span></div>
      <div class="weekly-row"><span class="weekly-label">セッション数</span><span class="weekly-val">${data.session_cnt}件</span></div>
      ${cats.map(([cat, sec]) => `<div class="weekly-row"><span class="weekly-label">${cat}</span><span class="weekly-val">${fmtSec(sec)}</span></div>`).join('')}
    `;
  } catch (_) {}
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('lionStart').value = today;
  document.getElementById('lionEnd').value   = today;
}

document.getElementById('lionMode').addEventListener('change', function () {
  document.getElementById('lionModel').style.display = this.value === 'ollama' ? 'inline-block' : 'none';
});
document.getElementById('lionBtn').addEventListener('click', async () => {
  const result = document.getElementById('lionResult');
  result.innerHTML = '<span class="spinner"></span> 分析中…';
  try {
    const data = await api('POST', '/api/ai/lion-eye', {
      mode:        document.getElementById('lionMode').value,
      model:       document.getElementById('lionModel').value || null,
      range_start: document.getElementById('lionStart').value,
      range_end:   document.getElementById('lionEnd').value,
    });
    result.textContent = data.content;
  } catch (e) { result.textContent = '分析エラー: ' + e.message; }
});

// ── 設定タブ ──────────────────────────────────────
async function loadModels() {
  const models = await api('GET', '/api/ai/models').catch(() => []);
  ['aiModelSelect','lionModel','defaultModelSelect'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    models.forEach(m => { const o = document.createElement('option'); o.value = o.textContent = m; sel.appendChild(o); });
    if (cur) sel.value = cur;
  });
}
loadModels();

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  showToast('設定を保存しました');
});

// ════════════════════════════════════════
// フォーカスモード
// ════════════════════════════════════════
let focusMode      = 'flow';
let focusTimer     = null;
let focusRunning   = false;
let focusSeconds   = 0;
let pomodoroPhase  = 'work';  // 'work' | 'break'
let pomodoroCount  = 0;
const POMODORO_WORK  = 25 * 60;
const POMODORO_BREAK =  5 * 60;

function openFocusMode(taskName = '') {
  document.getElementById('focusTaskLabel').textContent = taskName || 'タスク未選択';
  document.getElementById('focusOverlay').style.display = 'flex';
  resetFocus();
}

function fmtFocusSec(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateFocusDisplay() {
  const clock = document.getElementById('focusClock');
  const sub   = document.getElementById('focusSub');
  if (focusMode === 'flow') {
    clock.textContent = fmtFocusSec(focusSeconds);
    sub.textContent   = '';
  } else if (focusMode === 'pomodoro') {
    clock.textContent = fmtFocusSec(focusSeconds);
    const phaseLabel  = pomodoroPhase === 'work' ? '🔥 作業中' : '☕ 休憩中';
    sub.textContent   = phaseLabel;
    document.getElementById('focusPomodoroPhase').textContent = phaseLabel;
    document.getElementById('focusPomodoroCount').textContent = `セット: ${pomodoroCount + 1}/4`;
  } else {
    const min = parseInt(document.getElementById('focusCountdownMin').value) || 25;
    const total = min * 60;
    const remaining = total - focusSeconds;
    clock.textContent = fmtFocusSec(Math.max(0, remaining));
    if (remaining <= 0) {
      stopFocus();
      showToast('カウントダウン終了！');
      clock.textContent = '00:00';
    }
  }
}

function startFocus() {
  if (focusRunning) return;
  focusRunning = true;
  document.getElementById('focusStartBtn').style.display = 'none';
  document.getElementById('focusStopBtn').style.display  = 'inline-block';
  focusTimer = setInterval(() => {
    focusSeconds++;
    if (focusMode === 'pomodoro') {
      const limit = pomodoroPhase === 'work' ? POMODORO_WORK : POMODORO_BREAK;
      if (focusSeconds >= limit) {
        focusSeconds = 0;
        if (pomodoroPhase === 'work') {
          pomodoroPhase = 'break';
          showToast('☕ 休憩タイムです！');
        } else {
          pomodoroPhase = 'work';
          pomodoroCount = Math.min(pomodoroCount + 1, 3);
          showToast('🔥 作業再開！');
        }
      }
    }
    updateFocusDisplay();
  }, 1000);
}

function stopFocus() {
  if (!focusRunning) return;
  focusRunning = false;
  clearInterval(focusTimer);
  focusTimer = null;
  document.getElementById('focusStartBtn').style.display = 'inline-block';
  document.getElementById('focusStopBtn').style.display  = 'none';
}

function resetFocus() {
  stopFocus();
  focusSeconds  = 0;
  pomodoroPhase = 'work';
  pomodoroCount = 0;
  updateFocusDisplay();
  document.getElementById('focusPomodoroInfo').style.display    =
    focusMode === 'pomodoro' ? 'flex' : 'none';
  document.getElementById('focusCountdownInput').style.display  =
    focusMode === 'countdown' ? 'flex' : 'none';
}

// タブ切り替え
document.querySelectorAll('.focus-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.focus-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    focusMode = tab.dataset.mode;
    resetFocus();
  });
});

document.getElementById('focusStartBtn').addEventListener('click', startFocus);
document.getElementById('focusStopBtn').addEventListener('click',  stopFocus);
document.getElementById('focusResetBtn').addEventListener('click', resetFocus);
document.getElementById('focusCloseBtn').addEventListener('click', () => {
  stopFocus();
  document.getElementById('focusOverlay').style.display = 'none';
});

// クイックスタートからフォーカスモードを開く
document.getElementById('quickStartBtn').addEventListener('click', () => {});  // 既存と競合しないようダミー

// ════════════════════════════════════════
// アイゼンハワーマトリックス
// ════════════════════════════════════════
const Q_IMP_URG = {
  q0: { importance: null,   urgency: null   },
  q1: { importance: 'high', urgency: 'high' },
  q2: { importance: 'high', urgency: 'low'  },
  q3: { importance: 'low',  urgency: 'high' },
  q4: { importance: 'low',  urgency: 'low'  },
};

let _dragTaskId = null;

function buildMatrixTaskItem(t) {
  const div = document.createElement('div');
  div.className = 'matrix-task-item';
  div.dataset.tid = t.id;
  div.draggable = true;
  div.innerHTML = `
    <span class="matrix-task-name">${t.name}</span>
    ${t.project_name ? `<span class="matrix-task-project" style="color:${t.project_color||'var(--muted)'}">${t.project_name}</span>` : ''}
    <button class="matrix-del-btn" title="削除">✕</button>
  `;
  // 詳細ボタン（名前クリック）
  div.querySelector('.matrix-task-name').addEventListener('click', e => {
    e.stopPropagation();
    openTaskDetail(parseInt(div.dataset.tid));
  });
  // 削除ボタン
  div.querySelector('.matrix-del-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const ok = await showConfirm('タスクを削除', `「${t.name}」を削除しますか？`);
    if (!ok) return;
    await api('DELETE', `/api/tasks/${t.id}`);
    showToast('削除しました');
    loadMatrixTab();
    // タスクタブが開いていれば再読み込み
    if (document.getElementById('tab-tasks').classList.contains('active')) loadTasksTab();
  });
  div.addEventListener('dragstart', e => {
    _dragTaskId = t.id;
    e.dataTransfer.effectAllowed = 'move';
  });
  div.addEventListener('dragend', () => { _dragTaskId = null; });
  return div;
}

async function loadMatrixTab() {
  try {
    const data = await api('GET', '/api/tasks/matrix');
    const qMap = { q0:'matrixQ0', q1:'matrixQ1', q2:'matrixQ2', q3:'matrixQ3', q4:'matrixQ4' };
    for (const [q, elId] of Object.entries(qMap)) {
      const el    = document.getElementById(elId);
      const tasks = data[q] || [];
      el.innerHTML = '';
      if (!tasks.length) {
        el.innerHTML = '<div class="matrix-empty">タスクなし</div>';
        continue;
      }
      tasks.forEach(t => el.appendChild(buildMatrixTaskItem(t)));
    }
  } catch (e) { showToast('マトリックス取得エラー: ' + e.message); }
}

// ドロップ処理（グローバル関数としてHTMLから呼ばれる）
window.onMatrixDrop = async function(e, targetQ) {
  e.preventDefault();
  if (!_dragTaskId) return;
  const { importance, urgency } = Q_IMP_URG[targetQ];

  // q0（未設定）の場合はimportance/urgencyをnull文字列ではなく
  // 空文字列で送り、サーバー側でNULLに変換する
  const body = {
    importance: importance || '',
    urgency:    urgency    || '',
  };

  await api('PUT', `/api/tasks/${_dragTaskId}`, body);
  _dragTaskId = null;
  showToast('マトリックスを更新しました');
  loadMatrixTab();
};

document.getElementById('matrixRefreshBtn')?.addEventListener('click', loadMatrixTab);

// ════════════════════════════════════════
// カンバンボード
// ════════════════════════════════════════
const KANBAN_COLORS = ['#7c6aff','#ff6a9b','#6affcc','#ffb86a','#ff5f57','#5fb3ff','#6b6b80'];
let _kanbanDragTaskId   = null;
// 保留中のセッション管理
let _heldSessions = {};  // { sid: { id, name, task_id, held_at, duration_sec } }
let _kanbanDragTaskName = '';

function buildKanbanCard(task) {
  const today = new Date().toISOString().slice(0,10);
  const isOverdue = task.due_date && task.due_date < today && task.status !== '完了';


  const div = document.createElement('div');
  div.className   = 'kanban-card';
  div.draggable   = true;
  div.dataset.tid = task.id;
  div.innerHTML = `
    <div class="kanban-card-actions">
      <button class="kanban-card-btn"     data-action="detail">…</button>
      <button class="kanban-card-btn del" data-action="delete">✕</button>
    </div>
    <div class="kanban-card-name">${task.name}</div>
    <div class="kanban-card-meta">
      ${task.project_name ? `<span class="kanban-card-project" style="color:${task.project_color||'var(--muted)'}">${task.project_name}</span>` : ''}
      ${task.due_date ? `<span class="kanban-card-due ${isOverdue?'overdue':''}">${task.due_date}${isOverdue?' ⚠':''}</span>` : ''}

    </div>
  `;
  div.addEventListener('dragstart', e => {
    _kanbanDragTaskId   = task.id;
    _kanbanDragTaskName = task.name;
    e.dataTransfer.effectAllowed = 'move';
  });
  div.addEventListener('dragend', () => { _kanbanDragTaskId = null; });
  div.querySelector('[data-action="detail"]').addEventListener('click', e => {
    e.stopPropagation();
    openTaskDetail(task.id);
  });
  div.querySelector('[data-action="delete"]').addEventListener('click', async e => {
    e.stopPropagation();
    const ok = await showConfirm('タスクを削除', `「${task.name}」を削除しますか？`);
    if (!ok) return;
    await api('DELETE', `/api/tasks/${task.id}`);
    showToast('削除しました');
    loadKanbanTab();
  });
  return div;
}

function buildKanbanCol(col, tasks) {
  const div = document.createElement('div');
  div.className   = 'kanban-col';
  div.dataset.col = col.name;
  div.innerHTML = `
    <div class="kanban-col-header">
      <div class="kanban-col-dot" style="background:${col.color}"></div>
      <span class="kanban-col-name">${col.name}</span>
      <span class="kanban-col-count">${tasks.length}</span>
      <button class="kanban-col-menu" data-col-id="${col.id}" data-col-name="${col.name}" title="列の設定">⋯</button>
    </div>
    <div class="kanban-col-body" id="kanbanBody-${col.id}"
         ondragover="event.preventDefault();this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="onKanbanDrop(event,'${col.name}',${col.id})">
    </div>
    <div class="kanban-col-footer">
      <button class="kanban-add-task-btn" data-col-name="${col.name}">＋ タスクを追加</button>
    </div>
  `;

  const body = div.querySelector(`#kanbanBody-${col.id}`);
  if (!tasks.length) {
    body.innerHTML = '<div class="kanban-empty">タスクなし</div>';
  } else {
    tasks.forEach(t => body.appendChild(buildKanbanCard(t)));
  }

  // 列メニュー
  div.querySelector('.kanban-col-menu').addEventListener('click', e => {
    e.stopPropagation();
    openKanbanColModal(col);
  });

  // タスク追加ボタン
  div.querySelector('.kanban-add-task-btn').addEventListener('click', async () => {
    openTaskModal(null, null);
  });

  return div;
}

async function loadKanbanTab() {
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('GET', '/api/kanban/tasks');
    board.innerHTML = '';
    data.columns.forEach(col => {
      const tasks = data.tasks[col.name] || [];
      board.appendChild(buildKanbanCol(col, tasks));
    });
  } catch(e) {
    board.innerHTML = `<div style="color:var(--danger);font-size:13px">取得エラー: ${e.message}</div>`;
  }
}

// カンバンのドロップ処理
window.onKanbanDrop = async function(e, colName, colId) {
  e.preventDefault();
  document.getElementById(`kanbanBody-${colId}`)?.classList.remove('drag-over');
  if (!_kanbanDragTaskId) return;
  const taskId   = _kanbanDragTaskId;
  const taskName = _kanbanDragTaskName;
  await api('POST', `/api/tasks/${taskId}/status`, { status: colName });

  // 「実行中」に移動→計測を自動開始
  const inProgressNames = ['実行中','進行中','In Progress'];
  const onHoldNames     = ['保留中','保留','On Hold'];
  const doneNames       = ['完了','Done','Completed'];

  if (inProgressNames.includes(colName)) {
    // すでに計測中でなければ開始
    const active = await api('GET', '/api/sessions/active').catch(() => []);
    const already = active.find(s => s.task_id === taskId);
    if (!already) {
      await api('POST', '/api/sessions/start', { name: taskName, task_id: taskId }).catch(() => {});
      showToast(`▶ 「${taskName}」の計測を開始しました`);
    }
  } else if (onHoldNames.includes(colName) || doneNames.includes(colName)) {
    // 計測中なら停止
    const active = await api('GET', '/api/sessions/active').catch(() => []);
    const running = active.find(s => s.task_id === taskId);
    if (running) {
      await api('POST', '/api/sessions/stop', { session_id: running.id }).catch(() => {});
      if (doneNames.includes(colName)) {
        await api('POST', `/api/tasks/${taskId}/done`).catch(() => {});
      }
      showToast(`「${taskName}」→ ${colName}`);
    }
  }

  showToast(`「${taskName}」→ ${colName}`);
  _kanbanDragTaskId = null;
  refreshActiveSessions();
  loadTodayTab();
  loadKanbanTab();
  if (document.getElementById('tab-tasks').classList.contains('active')) loadTasksTab();
};

// カンバン列追加・編集モーダル
function openKanbanColModal(col = null) {
  const title = document.getElementById('kanbanColModalTitle');
  const idEl  = document.getElementById('kanbanColId');
  const nameEl = document.getElementById('kanbanColName');
  title.textContent = col ? '列を編集' : '列を追加';
  idEl.value        = col ? col.id : '';
  nameEl.value      = col ? col.name : '';

  const picks = document.getElementById('kanbanColorPicks');
  picks.innerHTML = KANBAN_COLORS.map(c =>
    `<div class="color-pick ${col && col.color===c ? 'selected' : c==='#7c6aff'&&!col ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  picks.querySelectorAll('.color-pick').forEach(p => {
    p.addEventListener('click', () => {
      picks.querySelectorAll('.color-pick').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
    });
  });
  document.getElementById('kanbanColModal').style.display = 'flex';
}

document.getElementById('kanbanAddColBtn')?.addEventListener('click', () => openKanbanColModal());
document.getElementById('kanbanRefreshBtn')?.addEventListener('click', loadKanbanTab);
document.getElementById('kanbanColCancelBtn')?.addEventListener('click', () => {
  document.getElementById('kanbanColModal').style.display = 'none';
});
document.getElementById('kanbanColSaveBtn')?.addEventListener('click', async () => {
  const id    = document.getElementById('kanbanColId').value;
  const name  = document.getElementById('kanbanColName').value.trim();
  const color = document.querySelector('#kanbanColorPicks .color-pick.selected')?.dataset.color || '#7c6aff';
  if (!name) { showToast('列名を入力してください'); return; }
  if (id) {
    await api('PUT', `/api/kanban/columns/${id}`, { name, color });
    showToast('更新しました');
  } else {
    await api('POST', '/api/kanban/columns', { name, color });
    showToast(`列「${name}」を追加しました`);
  }
  document.getElementById('kanbanColModal').style.display = 'none';
  loadKanbanTab();
});

// ════════════════════════════════════════
// ムードトラッカー
// ════════════════════════════════════════
const MOOD_LABELS = ['新月', '三日月', '半月', '十三夜', '満月'];
const MOOD_DESCS  = ['最悪', '悪い', '普通', '良い', '最高'];
let _selectedMood = null;

function moonImg(score, size = 28) {
  return `<img src="/static/icons/moon${score}.svg" style="width:${size}px;height:${size}px">`;
}

async function loadMoodTab() {
  // 今日のムード
  const today = await api('GET', '/api/mood/today').catch(() => null);
  const todayEl = document.getElementById('moodToday');
  if (today && today.id) {
    todayEl.innerHTML = `今日の最新記録：${moonImg(today.score, 20)} <span style="color:var(--ink1)">${MOOD_LABELS[today.score]}</span>（${MOOD_DESCS[today.score]}）<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${today.recorded_at.slice(11,16)}</span>${today.note ? ` — ${today.note}` : ''}`;
    // 選択済みを反映
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.score) === today.score);
    });
    _selectedMood = today.score;
  } else {
    todayEl.innerHTML = 'まだ今日の記録がありません';
  }

  // 履歴
  const history = await api('GET', '/api/mood/history?limit=30').catch(() => []);
  const histEl  = document.getElementById('moodHistory');
  if (!history.length) {
    histEl.innerHTML = '<div class="empty-state" style="padding:20px"><img src="/static/Ink_Productivity.png" style="width:50px;opacity:.35;margin-bottom:6px"><br>まだ記録がありません</div>';
    return;
  }
  histEl.innerHTML = history.map(m => `
    <div class="mood-history-item" data-mid="${m.id}">
      <span class="mood-history-moon">${moonImg(m.score, 28)}</span>
      <span class="mood-history-label">${MOOD_LABELS[m.score]}</span>
      <span class="mood-history-date">${m.recorded_at.slice(0,10)} ${m.recorded_at.slice(11,16)}</span>
      <span class="mood-history-note">${m.note || ''}</span>
      <button class="mood-del-btn" data-mid="${m.id}">✕</button>
    </div>
  `).join('');

  histEl.querySelectorAll('.mood-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await showConfirm('記録を削除', 'このムード記録を削除しますか？');
      if (!ok) return;
      await api('DELETE', `/api/mood/${btn.dataset.mid}`);
      showToast('削除しました');
      loadMoodTab();
    });
  });
}

// ムードボタン選択
document.getElementById('moodSelector')?.addEventListener('click', e => {
  const btn = e.target.closest('.mood-btn');
  if (!btn) return;
  _selectedMood = parseInt(btn.dataset.score);
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
});

// ムード保存
document.getElementById('moodSaveBtn')?.addEventListener('click', async () => {
  if (_selectedMood === null) { showToast('気分を選んでください'); return; }
  const note = document.getElementById('moodNote').value.trim() || null;
  await api('POST', '/api/mood', { score: _selectedMood, note });
  document.getElementById('moodNote').value = '';
  showToast(`${MOOD_LABELS[_selectedMood]}（${MOOD_DESCS[_selectedMood]}）を記録しました`);
  loadMoodTab();
});

// ════════════════════════════════════════
// ジャーナリング
// ════════════════════════════════════════
const AI_PROMPTS = [
  '今日一番集中できた瞬間はいつでしたか？',
  '今日やり残したことと、その理由を書いてみましょう。',
  '今日の自分を一言で表すとしたら？',
  '今感じているモヤモヤを、そのまま書いてみましょう。',
  '今日の小さな達成を3つ書いてみましょう。',
  '明日の自分に一言メッセージを送るとしたら？',
  '今日のエネルギーはどこから来ていましたか？',
  '今日誰かに感謝したいことはありましたか？',
  '今週やりたいことで、まだできていないことは？',
  '今の気持ちを天気で表すとしたら何ですか？',
  '今日避けていたことはありましたか？なぜ？',
  '最近ずっと気になっていることを書いてみましょう。',
];

async function loadJournalTab() {
  const journals = await api('GET', '/api/journals?limit=20').catch(() => []);
  const list = document.getElementById('journalList');
  if (!journals.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px"><img src="/static/Ink_Productivity.png" style="width:60px;opacity:.35;margin-bottom:8px"><br>まだ日記がありません<br><small>＋ 新しい日記 から始めてみましょう</small></div>';
    return;
  }
  list.innerHTML = journals.map(j => `
    <div class="journal-card" data-jid="${j.id}">
      <div class="journal-card-header">
        <span class="journal-card-title">${j.title || '無題'}</span>
        <span class="journal-card-date">${j.recorded_at.slice(0,10)} ${j.recorded_at.slice(11,16)}</span>
        <button class="journal-card-del" data-jid="${j.id}">✕</button>
      </div>
      <div class="journal-card-preview">${j.content.replace(/\n/g,' ')}</div>
    </div>
  `).join('');

  list.querySelectorAll('.journal-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('journal-card-del')) return;
      openJournalModal(parseInt(card.dataset.jid));
    });
  });
  list.querySelectorAll('.journal-card-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await showConfirm('日記を削除', 'この日記を削除しますか？');
      if (!ok) return;
      await api('DELETE', `/api/journals/${btn.dataset.jid}`);
      showToast('削除しました');
      loadJournalTab();
    });
  });
}

async function openJournalModal(journalId = null) {
  const titleEl   = document.getElementById('journalModalTitle');
  const idEl      = document.getElementById('journalId');
  const titleInput = document.getElementById('journalTitle');
  const contentEl = document.getElementById('journalContent');
  const promptBar = document.getElementById('journalPromptBar');

  promptBar.style.display = 'none';

  if (journalId) {
    const j = await api('GET', `/api/journals/${journalId}`);
    titleEl.textContent  = '日記を編集';
    idEl.value           = j.id;
    titleInput.value     = j.title || '';
    contentEl.value      = j.content;
    if (j.prompt) {
      document.getElementById('journalPromptText').textContent = j.prompt;
      promptBar.style.display = 'block';
    }
  } else {
    titleEl.textContent = '新しい日記';
    idEl.value          = '';
    titleInput.value    = '';
    contentEl.value     = '';
  }
  document.getElementById('journalModal').style.display = 'flex';
  setTimeout(() => contentEl.focus(), 100);
}

document.getElementById('newJournalBtn')?.addEventListener('click', () => openJournalModal());

document.getElementById('journalCancelBtn')?.addEventListener('click', () => {
  document.getElementById('journalModal').style.display = 'none';
});

// AIプロンプトボタン
document.getElementById('journalPromptBtn')?.addEventListener('click', () => {
  const prompt = AI_PROMPTS[Math.floor(Math.random() * AI_PROMPTS.length)];
  document.getElementById('journalPromptText').textContent = prompt;
  document.getElementById('journalPromptBar').style.display = 'block';
  document.getElementById('journalContent').focus();
});

// ジャーナル保存
document.getElementById('journalSaveBtn')?.addEventListener('click', async () => {
  const id      = document.getElementById('journalId').value;
  const title   = document.getElementById('journalTitle').value.trim() || null;
  const content = document.getElementById('journalContent').value.trim();
  const prompt  = document.getElementById('journalPromptBar').style.display !== 'none'
    ? document.getElementById('journalPromptText').textContent : null;
  if (!content) { showToast('本文を入力してください'); return; }
  if (id) {
    await api('PUT', `/api/journals/${id}`, { title, content });
  } else {
    await api('POST', '/api/journals', { title, content, prompt });
  }
  document.getElementById('journalModal').style.display = 'none';
  showToast('保存しました');
  loadJournalTab();
});

// ════════════════════════════════════════
// タスク検索
// ════════════════════════════════════════
let _searchTimer = null;
document.getElementById('taskSearchInput')?.addEventListener('input', e => {
  clearTimeout(_searchTimer);
  const q = e.target.value.trim();
  const results = document.getElementById('taskSearchResults');
  if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
  _searchTimer = setTimeout(async () => {
    const includeDone = document.getElementById('searchIncludeDone').checked ? 1 : 0;
    const tasks = await api('GET', `/api/tasks/search?q=${encodeURIComponent(q)}&include_done=${includeDone}`).catch(() => []);
    if (!tasks.length) {
      results.innerHTML = '<div class="empty-state" style="padding:16px">見つかりませんでした</div>';
      results.style.display = 'block';
      return;
    }
    results.innerHTML = tasks.map(t => `
      <div class="search-result-item" data-tid="${t.id}">
        <div class="search-result-name ${t.done ? 'done-text' : ''}">${t.name}</div>
        <div class="search-result-meta">
          ${t.project_name ? `<span style="color:${t.project_color||'var(--muted)'}">${t.project_name}</span>` : ''}
          <span class="status-badge">${t.status || '未着手'}</span>
          ${t.done ? '<span style="color:var(--ink2)">✓ 完了</span>' : ''}
        </div>
      </div>
    `).join('');
    results.style.display = 'block';
    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        openTaskDetail(parseInt(el.dataset.tid));
      });
    });
  }, 300);
});

document.getElementById('searchIncludeDone')?.addEventListener('change', () => {
  document.getElementById('taskSearchInput').dispatchEvent(new Event('input'));
});

// ════════════════════════════════════════
// アーカイブ
// ════════════════════════════════════════
async function loadArchiveTab(search = '') {
  const list = document.getElementById('archiveList');
  list.innerHTML = '<div style="padding:20px;color:var(--muted)">読み込み中...</div>';
  const url = search ? `/api/tasks/archived?search=${encodeURIComponent(search)}` : '/api/tasks/archived';
  const tasks = await api('GET', url).catch(() => []);
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state" style="padding:40px">アーカイブされたタスクはありません</div>';
    return;
  }
  list.innerHTML = tasks.map(t => `
    <div class="archive-item">
      <div class="archive-item-info">
        <div class="archive-item-name">${t.name}</div>
        <div class="archive-item-meta">
          ${t.project_name ? `<span style="color:${t.project_color||'var(--muted)'}">${t.project_name}</span>` : ''}
          <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${t.done_at ? t.done_at.slice(0,10) : ''}</span>
        </div>
      </div>
      <div class="archive-item-actions">
        <button class="btn btn-ghost" style="font-size:12px" data-restore="${t.id}">↩ 復元</button>
        <button class="btn btn-ghost" style="font-size:12px;color:var(--danger)" data-delete-arc="${t.id}">削除</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api('POST', `/api/tasks/archived/${btn.dataset.restore}/restore`);
      showToast('復元しました');
      loadArchiveTab(document.getElementById('archiveSearchInput').value);
    });
  });
  list.querySelectorAll('[data-delete-arc]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('完全削除', 'このタスクを完全に削除しますか？元に戻せません。');
      if (!ok) return;
      await api('DELETE', `/api/tasks/archived/${btn.dataset.deleteArc}`);
      showToast('削除しました');
      loadArchiveTab(document.getElementById('archiveSearchInput').value);
    });
  });
}

// アーカイブ検索
let _archiveTimer = null;
document.getElementById('archiveSearchInput')?.addEventListener('input', e => {
  clearTimeout(_archiveTimer);
  _archiveTimer = setTimeout(() => loadArchiveTab(e.target.value.trim()), 300);
});

// アーカイブ実行ボタン
document.getElementById('runArchiveBtn')?.addEventListener('click', async () => {
  const res = await api('POST', '/api/tasks/archive/run');
  showToast(`アーカイブ: ${res.archived}件 / 削除: ${res.deleted}件`);
  loadArchiveTab();
});
