// MemoTodo - メイン画面ロジック
// 旧 Flask REST API (fetch) 呼び出しを Wails の Go バインディングに置き換えたもの。

import * as App from '../wailsjs/go/main/App.js';
import { EventsOn } from '../wailsjs/runtime/runtime.js';

// #region 定数・状態
let _tab             = "pending"; // "pending" | "done"
let _openId          = null;      // 詳細を開いているメモID（null なら閉じている）
let _detailPattern   = "inline";  // "inline" | "modal"（起動時に設定から読み込む）
let _draggedId       = null;      // ドラッグ中の期日なしメモID
let _activeModalKind = null;      // 共有モーダル(tdDetailModal)の内容種別: "memo" | "recurring" | null
// #endregion

// #region エラー表示
function _errMsg(e) {
  return (e && e.message) ? e.message : String(e);
}
// #endregion

// #region モーダル外クリックでの破棄
function _bindOutsideDismiss(overlayEl, onDismiss) {
  let downOnOverlay = false;
  overlayEl.addEventListener("mousedown", (e) => { downOnOverlay = (e.target === overlayEl); });
  overlayEl.addEventListener("mouseup", (e) => {
    if (downOnOverlay && e.target === overlayEl) onDismiss();
    downOnOverlay = false;
  });
}
// #endregion

// #region ユーティリティ
function _escape(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _fmtDeadline(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const wd = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

function _previewText(text) {
  const lines = String(text ?? "").split("\n");
  return lines[0] + (lines.length > 1 ? "　…" : "");
}

function _toEditorHtml(memo) {
  if (!memo) return "";
  if (/<[a-z][\s\S]*>/i.test(memo)) return memo;
  return _escape(memo).replace(/\n/g, "<br>");
}

// リンククリックをアプリ外部（既定ブラウザ／ファイルエクスプローラ）で開く。
// contenteditable 内・リンク一覧のどちらからも使う共通ハンドラ。
function _wireExternalLinkOpeners(root) {
  root.querySelectorAll("a[href]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      App.OpenURL(a.getAttribute("href")).catch(() => {});
    });
  });
}
// #endregion

// #region API呼び出し（メモ）
async function _fetchTodos(status) {
  return App.GetTodos(status);
}

async function _fetchTodo(id) {
  return App.GetTodo(id);
}

async function _createTodo(payload) {
  return App.CreateTodo(payload);
}

async function _updateTodo(id, payload) {
  return App.UpdateTodo(id, payload);
}

async function _completeTodo(id) {
  return App.CompleteTodo(id);
}

async function _restoreTodo(id) {
  return App.RestoreTodo(id);
}

async function _deleteTodo(id) {
  return App.DeleteTodo(id);
}

async function _bulkDeleteDoneAll() {
  return App.BulkDeleteDoneTodos();
}

async function _reorderTodos(idOrder) {
  return App.ReorderTodos(idOrder);
}

async function _toggleImportant(id) {
  return App.ToggleImportant(id);
}
// #endregion

// #region 一覧描画
async function loadList() {
  const loading = document.getElementById("tdLoading");
  const empty   = document.getElementById("tdEmpty");
  const card    = document.getElementById("tdCard");
  const listNoDate = document.getElementById("tdListNoDate");
  const listDated  = document.getElementById("tdListDated");
  const noDateLabel = document.getElementById("tdNoDateLabel");
  const separator   = document.getElementById("tdSeparator");

  loading.style.display = "flex";
  empty.style.display   = "none";
  card.style.display    = "none";
  listNoDate.innerHTML  = "";
  listDated.innerHTML   = "";

  try {
    let todos = await _fetchTodos(_tab);
    todos = todos || [];

    if (_tab === "pending") {
      document.getElementById("tdBadgePending").textContent = todos.length;
    }

    loading.style.display = "none";

    if (todos.length === 0) {
      empty.style.display = "block";
      return;
    }
    card.style.display = "block";

    let noDate = todos.filter(t => !t.deadline);
    let dated  = todos.filter(t => t.deadline);

    if (_tab === "done") {
      const all = [...todos].sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
      noDate = all;
      dated = [];
    }

    noDateLabel.style.display = (_tab === "pending" && noDate.length && dated.length) ? "block" : "none";
    separator.style.display   = (_tab === "pending" && dated.length) ? "flex" : "none";

    noDate.forEach(todo => listNoDate.appendChild(_buildRow(todo, { draggable: _tab === "pending" })));
    dated.forEach(todo  => listDated.appendChild(_buildRow(todo, { draggable: false })));

  } catch (e) {
    loading.style.display = "none";
    listNoDate.innerHTML = `<div style="padding:24px;color:var(--accent);font-size:13px;">読み込みに失敗しました</div>`;
  }
}

function _buildRow(todo, opts) {
  const wrap = document.createElement("div");
  wrap.className = "td-row-wrap";
  wrap.dataset.id = todo.id;

  const row = document.createElement("div");
  row.className = "td-row";
  if (_tab === "done") row.classList.add("is-done");
  if (todo.is_overdue && _tab === "pending") row.classList.add("is-overdue");
  if (todo.is_important) row.classList.add("is-important");

  const isOpen = _openId === todo.id;
  const isOpenInline = isOpen && _detailPattern === "inline";

  let dragHandleHtml = "";
  if (opts.draggable) {
    dragHandleHtml = `
      <div class="td-drag-handle" draggable="true" title="ドラッグして並び替え">
        <i class="bi bi-grip-vertical"></i>
      </div>`;
  }

  const checkboxChecked = _tab === "done";
  const checkboxHtml = `
    <div class="td-checkbox ${checkboxChecked ? "is-checked" : ""}" data-action="toggle-done" title="${checkboxChecked ? "未完了に戻す" : "完了にする"}">
      ${checkboxChecked ? '<i class="bi bi-check-lg"></i>' : ""}
    </div>`;

  let titleHtml;
  if (isOpenInline) {
    titleHtml = `<textarea class="td-row-title-input" data-role="draft-title" rows="1" placeholder="メモを入力">${_escape(todo.title)}</textarea>`;
  } else {
    titleHtml = `<div class="td-row-title" data-action="toggle-detail">${_escape(_previewText(todo.title))}</div>`;
  }

  const starIcon  = todo.is_important ? "bi-star-fill" : "bi-star";
  const starTitle = todo.is_important ? "重要を解除" : "重要にする";

  const metaIcons = `
    ${todo.reminder_enabled ? `<span class="td-meta-icon" title="リマインダーあり"><i class="bi bi-bell"></i></span>` : ""}
    ${todo.memo && todo.memo.trim() ? `<span class="td-meta-icon" title="詳細メモあり"><i class="bi bi-journal-text"></i></span>` : ""}
  `;

  const deadlineHtml = todo.deadline
    ? `<span class="td-deadline-chip ${todo.is_overdue && _tab === "pending" ? "is-overdue" : (todo.is_near && _tab === "pending" ? "is-near" : "")}">${_fmtDeadline(todo.deadline)}</span>`
    : "";

  row.innerHTML = `
    ${dragHandleHtml}
    ${checkboxHtml}
    <div class="td-row-main">
      ${titleHtml}
    </div>
    <div class="td-row-side">
      ${metaIcons}
      <button class="td-icon-btn td-btn-important ${todo.is_important ? "is-active" : ""}" data-action="toggle-important" title="${starTitle}">
        <i class="bi ${starIcon}"></i>
      </button>
      ${deadlineHtml}
      <button class="td-icon-btn td-chevron" data-action="toggle-detail" title="詳細">
        <i class="bi ${isOpen ? "bi-chevron-up" : "bi-chevron-down"}"></i>
      </button>
    </div>
  `;

  wrap.appendChild(row);

  if (isOpenInline) {
    const detail = document.createElement("div");
    detail.className = "td-detail-inline";
    detail.innerHTML = _detailFormHtml(todo);
    wrap.appendChild(detail);
    _wireDetailForm(detail, todo);
  }

  _wireRowEvents(row, wrap, todo, opts);
  return wrap;
}

function _wireRowEvents(row, wrap, todo, opts) {
  row.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      try {
        if (action === "toggle-done") {
          if (_tab === "pending") await _completeTodo(todo.id);
          else await _restoreTodo(todo.id);
          loadList();
        } else if (action === "toggle-important") {
          await _toggleImportant(todo.id);
          loadList();
        } else if (action === "toggle-detail") {
          toggleDetail(todo.id);
        }
      } catch (err) {
        alert(_errMsg(err) || "操作に失敗しました");
      }
    });
  });

  // ドラッグ&ドロップ（期日なしメモの手動並び替え）
  if (opts.draggable) {
    const handle = row.querySelector(".td-drag-handle");
    if (handle) {
      handle.addEventListener("dragstart", (e) => {
        _draggedId = todo.id;
        e.dataTransfer.effectAllowed = "move";
      });
    }
    wrap.addEventListener("dragover", (e) => {
      if (_draggedId == null) return;
      e.preventDefault();
    });
    wrap.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (_draggedId == null || _draggedId === todo.id) return;
      const container = document.getElementById("tdListNoDate");
      const ids = Array.from(container.children).map(c => parseInt(c.dataset.id, 10));
      const fromIdx = ids.indexOf(_draggedId);
      const toIdx   = ids.indexOf(todo.id);
      if (fromIdx < 0 || toIdx < 0) return;
      ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
      _draggedId = null;
      await _reorderTodos(ids);
      loadList();
    });
  }
}
// #endregion

// #region 詳細フォーム（インライン展開／モーダル共通）
function toggleDetail(todoId) {
  if (_openId === todoId) {
    closeDetail();
    return;
  }
  _openId = todoId;
  if (_detailPattern === "modal") {
    openDetailModal(todoId);
  } else {
    loadList();
  }
}

function closeDetail() {
  _openId = null;
  closeDetailModal();
  if (_tab) loadList();
}

async function openDetailModal(todoId) {
  const overlay = document.getElementById("tdDetailOverlay");
  const modal   = document.getElementById("tdDetailModal");
  const body    = document.getElementById("tdDetailModalBody");
  try {
    const todo = await _fetchTodo(todoId);
    body.innerHTML = _detailFormHtml(todo, { modal: true });
    _wireDetailForm(body, todo, { modal: true });
    _activeModalKind = "memo";
    overlay.style.display = "block";
    modal.style.display   = "flex";
  } catch (e) {
    alert("メモの読み込みに失敗しました");
    closeDetail();
  }
}

function closeDetailModal() {
  _activeModalKind = null;
  document.getElementById("tdDetailOverlay").style.display = "none";
  document.getElementById("tdDetailModal").style.display   = "none";
}

function _detailFormHtml(todo, opts) {
  opts = opts || {};
  const deadline = todo.deadline || "";
  const reminderEnabled = !!todo.reminder_enabled;
  const reminderAt = todo.reminder_at ? todo.reminder_at.slice(0, 16) : "";
  const memoHtml = _toEditorHtml(todo.memo || "");
  const isDone = todo.status === "done";

  return `
    ${opts.modal ? `<textarea class="td-detail-title-input" data-role="draft-title" rows="1" placeholder="メモを入力">${_escape(todo.title)}</textarea>` : ""}
    <div class="td-detail-grid">
      <label class="td-field">
        <span class="td-detail-label">期日</span>
        <input type="date" class="td-input" data-role="deadline" value="${_escape(deadline)}">
      </label>
      <label class="td-field">
        <span class="td-detail-label">リマインダー</span>
        <div class="td-reminder-row">
          <label class="td-toggle">
            <input type="checkbox" data-role="reminder-enabled" ${reminderEnabled ? "checked" : ""}>
            <span class="td-toggle-track"></span>
          </label>
          <input type="datetime-local" class="td-input" data-role="reminder-at" value="${_escape(reminderAt)}" ${reminderEnabled ? "" : "disabled"}>
        </div>
      </label>
    </div>

    <div class="td-field">
      <span class="td-detail-label">詳細メモ</span>
      <div class="td-editor-wrap">
        <div class="td-editor-toolbar">
          <button class="td-editor-btn" data-cmd="bold" title="太字 (Ctrl+B)" type="button"><b>B</b></button>
          <button class="td-editor-btn" data-cmd="red" title="赤文字" type="button"><span style="color:#CC0000;font-weight:700;font-size:12px">赤</span></button>
          <button class="td-editor-btn" data-cmd="link" title="リンク挿入" type="button"><i class="bi bi-link-45deg"></i></button>
          <div class="td-editor-sep"></div>
          <button class="td-editor-btn" data-cmd="image" title="クリップボードから画像を貼り付け" type="button"><i class="bi bi-image"></i></button>
        </div>
        <div class="td-editor" data-role="memo-editor" contenteditable="true" placeholder="背景・参考リンクなど" spellcheck="false">${memoHtml}</div>
      </div>
    </div>

    <div class="td-links" data-role="links" style="display:none;">
      <div class="td-detail-label">検出されたリンク</div>
      <div data-role="link-list"></div>
    </div>

    <div class="td-detail-footer">
      <div class="td-detail-footer-left">
        <button class="td-btn td-btn-ghost-danger td-btn-sm" data-action="delete">
          <i class="bi bi-trash3"></i> 削除
        </button>
        ${isDone
          ? `<button class="td-btn td-btn-ghost-success td-btn-sm" data-action="restore"><i class="bi bi-arrow-counterclockwise"></i> 未完了に戻す</button>`
          : `<button class="td-btn td-btn-ghost-success td-btn-sm" data-action="complete"><i class="bi bi-check-lg"></i> 完了にする</button>`}
      </div>
      <div class="td-detail-footer-right">
        ${opts.modal ? `<button class="td-btn td-btn-secondary" data-action="discard">変更を破棄</button>` : ""}
        <button class="td-btn td-btn-primary" data-action="save">保存</button>
      </div>
    </div>
  `;
}

function _wireDetailForm(container, todo, opts) {
  opts = opts || {};

  const linksWrap = container.querySelector('[data-role="links"]');
  const linkList  = container.querySelector('[data-role="link-list"]');
  const memoEditor = container.querySelector('[data-role="memo-editor"]');
  _renderLinks(linksWrap, linkList, todo.links || []);

  _initEditor(memoEditor);

  const reminderCb = container.querySelector('[data-role="reminder-enabled"]');
  const reminderDt = container.querySelector('[data-role="reminder-at"]');
  reminderCb.addEventListener("change", () => {
    reminderDt.disabled = !reminderCb.checked;
    if (reminderCb.checked && !reminderDt.value) {
      const deadline = container.querySelector('[data-role="deadline"]').value;
      const base = deadline || new Date().toISOString().slice(0, 10);
      reminderDt.value = `${base}T00:00`;
    }
  });
  const _showPicker = () => { try { reminderDt.showPicker(); } catch (e) {} };
  reminderDt.addEventListener("focus", _showPicker);
  reminderDt.addEventListener("click", _showPicker);

  const titleInput = container.querySelector('[data-role="draft-title"]')
    || document.querySelector(`.td-row-wrap[data-id="${todo.id}"] [data-role="draft-title"]`);

  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      try {
        if (action === "save") {
          const payload = {
            title: (titleInput ? titleInput.value : todo.title).trim() || todo.title,
            memo: memoEditor.innerHTML,
            deadline: container.querySelector('[data-role="deadline"]').value || null,
            reminder_enabled: reminderCb.checked,
            reminder_at: (reminderCb.checked && reminderDt.value) ? reminderDt.value + ":00" : null,
          };
          await _updateTodo(todo.id, payload);
          closeDetail();
        } else if (action === "discard") {
          closeDetail();
        } else if (action === "delete") {
          if (!confirm("このメモを削除しますか？")) return;
          await _deleteTodo(todo.id);
          closeDetail();
        } else if (action === "complete") {
          await _completeTodo(todo.id);
          closeDetail();
        } else if (action === "restore") {
          await _restoreTodo(todo.id);
          closeDetail();
        }
      } catch (err) {
        alert(_errMsg(err) || "操作に失敗しました");
      }
    });
  });
}

function _renderLinks(wrap, listEl, links) {
  if (!wrap || !listEl) return;
  if (!links || links.length === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  listEl.innerHTML = links.map(link => {
    if (link.type === "url") {
      return `<div class="td-link-item"><i class="bi bi-link-45deg"></i>
        <a href="${_escape(link.value)}">${_escape(link.value)}</a></div>`;
    }
    return `<div class="td-link-item"><i class="bi bi-folder2"></i>
      <span class="td-link-path" data-path="${_escape(link.value)}" title="クリックして開く">${_escape(link.value)}</span></div>`;
  }).join("");

  _wireExternalLinkOpeners(listEl);

  listEl.querySelectorAll(".td-link-path").forEach(el => {
    el.addEventListener("click", async () => {
      let path = el.dataset.path;
      if (path.startsWith("file://")) path = decodeURIComponent(path.slice(7));
      try {
        await App.OpenLocalPath(path);
      } catch (e) {
        alert(_errMsg(e) || "パスを開けませんでした");
      }
    });
  });
}
// #endregion

// #region メモエディタ（詳細メモ：リッチテキスト）
function _initEditor(editorEl) {
  editorEl.closest(".td-editor-wrap")?.querySelectorAll("[data-cmd]").forEach(btn => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      editorEl.focus();
      const cmd = btn.dataset.cmd;
      if (cmd === "bold") {
        document.execCommand("bold");
      } else if (cmd === "red") {
        document.execCommand("foreColor", false, "#CC0000");
      } else if (cmd === "link") {
        const sel = window.getSelection();
        const def = sel && !sel.isCollapsed ? sel.toString() : "";
        const url = prompt("URLを入力:", def.startsWith("http") ? def : "https://");
        if (url) {
          document.execCommand("createLink", false, url);
          _wireExternalLinkOpeners(editorEl);
        }
      } else if (cmd === "image") {
        _pasteImageFromClipboard(editorEl);
      }
    });
  });

  editorEl.addEventListener("paste", async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(item => item.type.startsWith("image/"));
    if (!imgItem) return;
    e.preventDefault();
    const blob = imgItem.getAsFile();
    await _uploadAndInsertImage(blob, editorEl);
  });
}

async function _pasteImageFromClipboard(editorEl) {
  try {
    const clipItems = await navigator.clipboard.read();
    for (const item of clipItems) {
      const imgType = item.types.find(t => t.startsWith("image/"));
      if (imgType) {
        const blob = await item.getType(imgType);
        await _uploadAndInsertImage(blob, editorEl);
        return;
      }
    }
    alert("クリップボードに画像がありません");
  } catch (e) {
    alert("クリップボードへのアクセスに失敗しました");
  }
}

async function _uploadAndInsertImage(blob, editorEl) {
  try {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imgUrl = await App.SaveImage(ev.target.result);
        editorEl.focus();
        document.execCommand("insertHTML", false, `<img src="${imgUrl}" alt="">`);
      } catch (err) {
        alert(_errMsg(err) || "画像の保存に失敗しました");
      }
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    alert("画像のアップロードに失敗しました");
  }
}
// #endregion

// #region クイック入力
function _initQuickInput() {
  const input = document.getElementById("tdQuickInput");

  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 220) + "px";
  };
  input.addEventListener("input", autoResize);

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.altKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      try {
        await _createTodo({ title: text });
        input.value = "";
        autoResize();
        loadList();
      } catch (err) {
        alert(_errMsg(err) || "登録に失敗しました");
      } finally {
        input.disabled = false;
      }
    }
  });
}

function focusQuickInput() {
  const input = document.getElementById("tdQuickInput");
  if (!input) return;
  // 完了済みタブを開いていた場合は未完了タブへ戻す
  if (_tab !== "pending") {
    document.querySelector('.td-tab[data-tab="pending"]')?.click();
  }
  input.focus();
}
// #endregion

// #region 定期タスク：バッジ・パネル
async function _fetchRecurringPanel() {
  return App.GetRecurringPanel();
}

async function _fetchRecurringAll() {
  return App.GetRecurringTasks();
}

async function _toggleRecurring(id) {
  return App.ToggleRecurringTask(id);
}

async function _deleteRecurring(id) {
  return App.DeleteRecurringTask(id);
}

function _recurringMetaLabel(t) {
  const periodLabel = { weekly: "週ごと", monthly: "月ごと", yearly: "年ごと" };
  const weekdays    = ["月", "火", "水", "木", "金", "土", "日"];
  let meta = periodLabel[t.period_type] || t.period_type;
  if (t.period_type === "weekly") {
    meta += `（毎週${weekdays[parseInt(t.period_value, 10)] || t.period_value}曜）`;
  } else if (t.period_type === "monthly") {
    meta += `（毎月${t.period_value}日）`;
  } else if (t.period_type === "yearly") {
    const [m, d] = t.period_value.split("-");
    meta += `（毎年${parseInt(m, 10)}月${parseInt(d, 10)}日）`;
  }
  if (!t.is_active) meta += "・停止中";
  return meta;
}

async function refreshRecurringBadge() {
  try {
    const data = await _fetchRecurringPanel();
    const yellow = document.getElementById("tdBadgeYellow");
    const red    = document.getElementById("tdBadgeRed");
    yellow.textContent = data.badge.current;
    yellow.style.display = data.badge.current > 0 ? "flex" : "none";
    red.textContent = data.badge.overdue;
    red.style.display = data.badge.overdue > 0 ? "flex" : "none";
    return data;
  } catch (e) {
    return null;
  }
}

let _recurringOpenId = null; // インライン展開中のタスクID（"new"=新規追加）。null なら何も開いていない

async function renderRecurringPanel() {
  const data = await refreshRecurringBadge();
  const overdueBlock = document.getElementById("tdRecurringOverdueBlock");
  const overdueList  = document.getElementById("tdRecurringOverdueList");
  const currentList  = document.getElementById("tdRecurringCurrentList");
  const emptyEl      = document.getElementById("tdRecurringEmpty");
  const allListEl    = document.getElementById("tdRecurringAllList");
  const allEmptyEl   = document.getElementById("tdRecurringAllEmpty");
  const addInline    = document.getElementById("tdRecurringAddInline");

  if (!data) return;

  const overdue = data.overdue || [];
  const current = data.current || [];

  overdueList.innerHTML = "";
  currentList.innerHTML = "";
  allListEl.innerHTML   = "";

  if (overdue.length) {
    overdueBlock.style.display = "block";
    overdue.forEach(t => overdueList.appendChild(_buildRecurringRow(t, "overdue")));
  } else {
    overdueBlock.style.display = "none";
  }

  if (current.length) {
    emptyEl.style.display = "none";
    current.forEach(t => currentList.appendChild(_buildRecurringRow(t, "current")));
  } else {
    emptyEl.style.display = overdue.length ? "none" : "block";
  }

  const shownIds = new Set([...overdue.map(t => t.id), ...current.map(t => t.id)]);
  try {
    const allTasks = (await _fetchRecurringAll() || []).filter(t => !shownIds.has(t.id));
    if (allTasks.length) {
      allEmptyEl.style.display = "none";
      allTasks.forEach(t => allListEl.appendChild(_buildRecurringRow(t, "all")));
    } else {
      allEmptyEl.style.display = "block";
    }
  } catch (e) {
    console.error("定期タスク一覧取得失敗", e);
  }

  if (_recurringOpenId === "new" && _detailPattern === "inline") {
    addInline.innerHTML = `<div class="td-recurring-detail-inline">${_recurringDetailFormHtml(null, {})}</div>`;
    _wireRecurringDetailForm(addInline, null);
  } else {
    addInline.innerHTML = "";
  }
}

function _buildRecurringRow(task, variant) {
  const wrap = document.createElement("div");
  wrap.className = "td-recurring-row-wrap";
  wrap.dataset.id = task.id;

  const row = document.createElement("div");
  if (variant === "all") {
    row.className = `td-recurring-all-row ${task.is_active ? "" : "is-paused"}`;
    row.innerHTML = `
      <div class="td-recurring-all-info">
        <div class="td-recurring-all-title">${_escape(task.title)}</div>
        <div class="td-recurring-all-meta">${_escape(_recurringMetaLabel(task))}</div>
      </div>
      <div class="td-recurring-all-actions">
        <button class="td-icon-btn" data-action="delete-recurring" title="削除"><i class="bi bi-trash3"></i></button>
      </div>`;
  } else if (variant === "overdue") {
    row.className = "td-recurring-occ-row is-overdue";
    row.innerHTML = `
      <div class="td-recurring-occ-info">
        <div class="td-recurring-occ-title">${_escape(task.title)}</div>
        <div class="td-recurring-occ-meta">${_fmtDeadline(task.current_deadline)} 期限・未完了</div>
      </div>
      <button class="td-btn td-btn-secondary td-btn-sm" data-action="toggle-recurring">完了にする</button>`;
  } else {
    row.className = "td-recurring-occ-row";
    row.innerHTML = `
      <div class="td-checkbox ${task.status === "done" ? "is-checked" : ""}" data-action="toggle-recurring">
        ${task.status === "done" ? '<i class="bi bi-check-lg"></i>' : ""}
      </div>
      <div class="td-recurring-occ-info ${task.status === "done" ? "is-done" : ""}">
        <div class="td-recurring-occ-title">${_escape(task.title)}</div>
      </div>
      <span class="td-recurring-occ-freq">${_fmtDeadline(task.current_deadline)}</span>`;
  }

  wrap.appendChild(row);

  row.querySelectorAll('[data-action="toggle-recurring"]').forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await _toggleRecurring(task.id);
        renderRecurringPanel();
      } catch (err) {
        alert(_errMsg(err) || "操作に失敗しました");
      }
    });
  });
  row.querySelectorAll('[data-action="delete-recurring"]').forEach(el => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("この定期タスクを削除しますか？")) return;
      try {
        await _deleteRecurring(task.id);
        renderRecurringPanel();
      } catch (err) {
        alert(_errMsg(err) || "削除に失敗しました");
      }
    });
  });
  row.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="toggle-recurring"], [data-action="delete-recurring"]')) return;
    openRecurringDetail(task.id);
  });

  if (_recurringOpenId === task.id) {
    const detail = document.createElement("div");
    detail.className = "td-recurring-detail-inline";
    detail.innerHTML = _recurringDetailFormHtml(task, {});
    wrap.appendChild(detail);
    _wireRecurringDetailForm(detail, task);
  }

  return wrap;
}

function _initRecurringPanel() {
  const tab      = document.getElementById("tdRecurringTab");
  const overlay  = document.getElementById("tdRecurringOverlay");
  const panel    = document.getElementById("tdRecurringPanel");
  const btnClose = document.getElementById("tdBtnRecurringClose");

  function open() {
    overlay.style.display = "block";
    panel.classList.add("is-open");
    renderRecurringPanel();
  }
  function close() {
    overlay.style.display = "none";
    panel.classList.remove("is-open");
    _recurringOpenId = null;
    _activeModalKind = null;
    document.getElementById("tdDetailOverlay").style.display = "none";
    document.getElementById("tdDetailModal").style.display   = "none";
  }

  tab.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  _bindOutsideDismiss(overlay, close);

  document.getElementById("tdBtnRecurringAdd").addEventListener("click", () => openRecurringDetail(null));
}
// #endregion

// #region 定期タスクの追加・編集（メインメモと同じくインライン／モーダル共用）
function _weekdayOptionsHtml(selected) {
  const names = ["月", "火", "水", "木", "金", "土", "日"];
  return names.map((n, i) => `
    <label class="td-weekday-btn">
      <input type="radio" name="tdRecurringWeekday" value="${i}" ${String(i) === String(selected) ? "checked" : ""}>
      <span>${n}</span>
    </label>
  `).join("");
}

function _recurringDetailFormHtml(task, opts) {
  opts = opts || {};
  const isNew = !task;
  const t = task || { title: "", period_type: "weekly", period_value: "0", memo: "", is_active: 1 };
  const [ym, yd] = t.period_type === "yearly" ? t.period_value.split("-") : ["1", "1"];

  return `
    ${opts.modal ? `<div class="td-detail-label" style="font-size:16px;font-weight:700;color:var(--text-primary);">${isNew ? "定期タスクを追加" : "定期タスクを編集"}</div>` : ""}
    <div class="td-field">
      <span class="td-detail-label">タイトル <span class="td-required">*</span></span>
      <input type="text" class="td-input" data-role="r-title" maxlength="200" value="${_escape(t.title)}" placeholder="定期タスクのタイトル">
      <div class="td-error" data-role="r-title-error" style="display:none;">タイトルを入力してください</div>
    </div>
    <div class="td-field">
      <span class="td-detail-label">周期 <span class="td-required">*</span></span>
      <select class="td-input" data-role="r-period-type">
        <option value="weekly" ${t.period_type === "weekly" ? "selected" : ""}>週ごと（曜日）</option>
        <option value="monthly" ${t.period_type === "monthly" ? "selected" : ""}>月ごと（日付）</option>
        <option value="yearly" ${t.period_type === "yearly" ? "selected" : ""}>年ごと（月日）</option>
      </select>
    </div>
    <div class="td-field" data-role="r-weekly-field" style="display:${t.period_type === "weekly" ? "" : "none"};">
      <span class="td-detail-label">曜日</span>
      <div class="td-weekday-row">${_weekdayOptionsHtml(t.period_type === "weekly" ? t.period_value : "0")}</div>
    </div>
    <div class="td-field" data-role="r-monthly-field" style="display:${t.period_type === "monthly" ? "" : "none"};">
      <span class="td-detail-label">毎月 <span class="td-required">*</span> 日</span>
      <input type="number" class="td-input td-input-sm" data-role="r-month-day" min="1" max="31" value="${t.period_type === "monthly" ? t.period_value : 1}">
    </div>
    <div class="td-field" data-role="r-yearly-field" style="display:${t.period_type === "yearly" ? "" : "none"};">
      <span class="td-detail-label">毎年</span>
      <div class="td-yearly-row">
        <input type="number" class="td-input td-input-sm" data-role="r-year-month" min="1" max="12" value="${parseInt(ym, 10)}">
        <span class="td-yearly-sep">月</span>
        <input type="number" class="td-input td-input-sm" data-role="r-year-day" min="1" max="31" value="${parseInt(yd, 10)}">
        <span class="td-yearly-sep">日</span>
      </div>
    </div>
    <div class="td-field">
      <span class="td-detail-label">メモ</span>
      <textarea class="td-input td-textarea" data-role="r-memo" rows="2" placeholder="メモ（省略可）">${_escape(t.memo || "")}</textarea>
    </div>
    <div class="td-detail-footer">
      <div class="td-detail-footer-left">
        ${isNew ? "" : `
          <button class="td-btn td-btn-ghost-danger td-btn-sm" data-action="r-delete"><i class="bi bi-trash3"></i> 削除</button>
          <button class="td-btn td-btn-ghost td-btn-sm" data-action="r-toggle-active">
            <i class="bi ${t.is_active ? "bi-pause" : "bi-play"}"></i> ${t.is_active ? "一時停止" : "再開"}
          </button>
        `}
      </div>
      <div class="td-detail-footer-right">
        <button class="td-btn td-btn-secondary" data-action="r-cancel">キャンセル</button>
        <button class="td-btn td-btn-primary" data-action="r-save">保存</button>
      </div>
    </div>
  `;
}

function _wireRecurringDetailForm(container, task) {
  const isNew = !task;
  const periodType   = container.querySelector('[data-role="r-period-type"]');
  const weeklyField  = container.querySelector('[data-role="r-weekly-field"]');
  const monthlyField = container.querySelector('[data-role="r-monthly-field"]');
  const yearlyField  = container.querySelector('[data-role="r-yearly-field"]');

  periodType.addEventListener("change", () => {
    const v = periodType.value;
    weeklyField.style.display  = v === "weekly"  ? "" : "none";
    monthlyField.style.display = v === "monthly" ? "" : "none";
    yearlyField.style.display  = v === "yearly"  ? "" : "none";
  });

  function getPeriodValue() {
    const pt = periodType.value;
    if (pt === "weekly") {
      const checked = container.querySelector("input[name='tdRecurringWeekday']:checked");
      return checked ? checked.value : "0";
    }
    if (pt === "monthly") return String(container.querySelector('[data-role="r-month-day"]').value);
    const m = String(container.querySelector('[data-role="r-year-month"]').value).padStart(2, "0");
    const d = String(container.querySelector('[data-role="r-year-day"]').value).padStart(2, "0");
    return `${m}-${d}`;
  }

  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      try {
        if (action === "r-cancel") {
          closeRecurringDetail();
        } else if (action === "r-save") {
          const title = container.querySelector('[data-role="r-title"]').value.trim();
          const errEl = container.querySelector('[data-role="r-title-error"]');
          if (!title) { errEl.style.display = "block"; return; }
          errEl.style.display = "none";
          const body = {
            title,
            period_type: periodType.value,
            period_value: getPeriodValue(),
            memo: container.querySelector('[data-role="r-memo"]').value.trim(),
          };
          if (isNew) await App.CreateRecurringTask(body);
          else await App.UpdateRecurringTask(task.id, body);
          closeRecurringDetail();
        } else if (action === "r-delete") {
          if (!confirm("この定期タスクを削除しますか？")) return;
          await _deleteRecurring(task.id);
          closeRecurringDetail();
        } else if (action === "r-toggle-active") {
          await App.UpdateRecurringTask(task.id, { is_active: !task.is_active });
          closeRecurringDetail();
        }
      } catch (err) {
        alert(_errMsg(err) || "操作に失敗しました");
      }
    });
  });
}

async function openRecurringDetail(taskId) {
  if (_detailPattern === "modal") {
    let task = null;
    if (taskId != null) {
      try {
        task = await App.GetRecurringTask(taskId);
      } catch (e) {
        alert("定期タスクの読み込みに失敗しました");
        return;
      }
    }
    const overlay = document.getElementById("tdDetailOverlay");
    const modal   = document.getElementById("tdDetailModal");
    const body    = document.getElementById("tdDetailModalBody");
    body.innerHTML = _recurringDetailFormHtml(task, { modal: true });
    _wireRecurringDetailForm(body, task);
    _activeModalKind = "recurring";
    overlay.style.display = "block";
    modal.style.display   = "flex";
  } else {
    _recurringOpenId = taskId == null ? "new" : taskId;
    await renderRecurringPanel();
    const anchor = taskId == null
      ? document.getElementById("tdRecurringAddInline")
      : document.querySelector(`.td-recurring-row-wrap[data-id="${taskId}"]`);
    anchor?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function closeRecurringDetail() {
  _recurringOpenId = null;
  _activeModalKind = null;
  document.getElementById("tdDetailOverlay").style.display = "none";
  document.getElementById("tdDetailModal").style.display   = "none";
  renderRecurringPanel();
}
// #endregion

// #region 定期タスク通知設定モーダル（表示日数）
function _initRecurringNotifyModal() {
  const overlay = document.getElementById("tdRecurringNotifyOverlay");
  const modal   = document.getElementById("tdRecurringNotifyModal");
  const btnOpen = document.getElementById("tdBtnRecurringNotifySettings");
  const btnClose = document.getElementById("tdRecurringNotifyClose");
  const btnCancel = document.getElementById("tdRecurringNotifyCancel");
  const btnSave = document.getElementById("tdRecurringNotifySave");
  const fWeekly  = document.getElementById("tdRNotifyWeekly");
  const fMonthly = document.getElementById("tdRNotifyMonthly");
  const fYearly  = document.getElementById("tdRNotifyYearly");

  async function open() {
    try {
      const settings = await App.GetSettings();
      const days = settings.recurring_display_days || {};
      fWeekly.value  = days.weekly ?? 3;
      fMonthly.value = days.monthly ?? 7;
      fYearly.value  = days.yearly ?? 14;
    } catch (e) {
      fWeekly.value = 3; fMonthly.value = 7; fYearly.value = 14;
    }
    overlay.style.display = "block";
    modal.style.display   = "flex";
  }

  function close() {
    overlay.style.display = "none";
    modal.style.display   = "none";
  }

  btnOpen.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  btnCancel.addEventListener("click", close);
  _bindOutsideDismiss(overlay, close);

  btnSave.addEventListener("click", async () => {
    try {
      await App.SaveSettings({
        recurring_display_days: {
          weekly: parseInt(fWeekly.value, 10) || 0,
          monthly: parseInt(fMonthly.value, 10) || 0,
          yearly: parseInt(fYearly.value, 10) || 0,
        },
      });
      close();
      renderRecurringPanel();
    } catch (e) {
      alert(_errMsg(e) || "保存に失敗しました");
    }
  });
}
// #endregion

// #region アプリ設定モーダル
function _initSettingsModal() {
  const overlay = document.getElementById("tdSettingsOverlay");
  const modal   = document.getElementById("tdSettingsModal");
  const btnOpen = document.getElementById("tdBtnSettings");
  const btnClose = document.getElementById("tdSettingsClose");
  const btnCancel = document.getElementById("tdSettingsCancel");
  const btnSave = document.getElementById("tdSettingsSave");
  const patternWrap = document.getElementById("tdSettingsPattern");
  const timesWrap = document.getElementById("tdSettingsNotifyTimes");
  const btnAddTime = document.getElementById("tdSettingsAddTime");

  let pattern = _detailPattern;
  let times = [];

  function renderPattern() {
    patternWrap.querySelectorAll(".td-segmented-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.value === pattern);
    });
  }

  function renderTimes() {
    timesWrap.innerHTML = times.map((t, i) => `
      <div class="td-notify-time-row">
        <input type="time" class="td-input" data-idx="${i}" value="${_escape(t)}">
        <button type="button" class="td-icon-btn" data-remove="${i}" title="削除"><i class="bi bi-x"></i></button>
      </div>
    `).join("");
    timesWrap.querySelectorAll("[data-idx]").forEach(inp => {
      inp.addEventListener("change", () => { times[parseInt(inp.dataset.idx, 10)] = inp.value; });
    });
    timesWrap.querySelectorAll("[data-remove]").forEach(btn => {
      btn.addEventListener("click", () => {
        times.splice(parseInt(btn.dataset.remove, 10), 1);
        renderTimes();
      });
    });
  }

  patternWrap.querySelectorAll(".td-segmented-btn").forEach(btn => {
    btn.addEventListener("click", () => { pattern = btn.dataset.value; renderPattern(); });
  });

  btnAddTime.addEventListener("click", () => { times.push("09:00"); renderTimes(); });

  async function open() {
    try {
      const settings = await App.GetSettings();
      pattern = settings.detail_pattern || "inline";
      times   = [...(settings.notify_times || [])];
    } catch (e) {
      pattern = _detailPattern;
      times = [];
    }
    renderPattern();
    renderTimes();
    overlay.style.display = "block";
    modal.style.display   = "flex";
  }

  function close() {
    overlay.style.display = "none";
    modal.style.display   = "none";
  }

  btnOpen.addEventListener("click", open);
  btnClose.addEventListener("click", close);
  btnCancel.addEventListener("click", close);
  _bindOutsideDismiss(overlay, close);

  btnSave.addEventListener("click", async () => {
    try {
      await App.SaveSettings({ detail_pattern: pattern, notify_times: times });
      _detailPattern = pattern;
      closeDetail();
      close();
    } catch (e) {
      alert(_errMsg(e) || "保存に失敗しました");
    }
  });
}
// #endregion

// #region 通知トースト（リマインダー・定期通知）
// 旧実装の別プロセス・別ウィンドウのポップアップ（popup_server.py）を、
// 単一ウィンドウ内のオーバーレイに置き換えたもの。ユーザーが手動で閉じるまで
// （定期通知は10秒のタイムアウトで）残る、という挙動自体は再現する。
let _toastTimer = null;

function _closeToast() {
  const toast = document.getElementById("tdToast");
  toast.style.display = "none";
  toast.innerHTML = "";
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
}

function _showToast(html, timeoutSec) {
  const toast = document.getElementById("tdToast");
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  toast.innerHTML = html;
  toast.style.display = "block";
  toast.querySelectorAll('[data-toast-action="close"]').forEach(el => {
    el.addEventListener("click", _closeToast);
  });
  if (timeoutSec) {
    _toastTimer = setTimeout(_closeToast, timeoutSec * 1000);
  }
}

function _renderReminderToast(todo) {
  const nowDate = new Date().toISOString().slice(0, 10);
  const isOverdue = todo.reminder_at && todo.reminder_at.slice(0, 10) < nowDate;
  const dt = todo.reminder_at ? todo.reminder_at.slice(0, 16).replace("T", " ") : "";

  const html = `
    <div class="td-toast-header">
      <span class="td-toast-label">リマインダー</span>
      <button class="td-toast-close" data-toast-action="close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="td-toast-body">
      <div class="td-toast-title">${_escape(todo.title)}</div>
      ${todo.reminder_at ? `
        <div class="td-toast-meta ${isOverdue ? "is-overdue" : ""}">
          <i class="bi bi-clock"></i> ${dt}${isOverdue ? "（期限切れ）" : ""}
        </div>` : ""}
    </div>
    <div class="td-toast-snooze-row">
      <span class="td-toast-snooze-label">スヌーズ</span>
      <button class="td-btn-snooze" data-snooze="30">+30分</button>
      <button class="td-btn-snooze" data-snooze="60">+1時間</button>
      <button class="td-btn-snooze" data-snooze="tomorrow">明日朝9時</button>
    </div>
    <div class="td-toast-actions">
      <button class="td-btn td-btn-primary" data-toast-action="detail">詳細を見る</button>
      <button class="td-btn td-btn-secondary" data-toast-action="close">閉じる</button>
    </div>
  `;
  _showToast(html, null);

  const toast = document.getElementById("tdToast");
  toast.querySelectorAll("[data-snooze]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        await App.SnoozeReminder(todo.id, btn.dataset.snooze);
      } catch (e) {}
      _closeToast();
    });
  });
  toast.querySelector('[data-toast-action="detail"]').addEventListener("click", () => {
    _closeToast();
    document.querySelector('.td-tab[data-tab="pending"]')?.click();
    toggleDetail(todo.id);
  });
}

function _renderPeriodicToast(payload) {
  const { count, recurring_overdue: recurringOverdue, near_deadline_days: nearDeadlineDays } = payload;

  const html = `
    <div class="td-toast-header">
      <span class="td-toast-label">MemoTodo リマインド</span>
      <button class="td-toast-close" data-toast-action="close"><i class="bi bi-x-lg"></i></button>
    </div>
    <div class="td-toast-body">
      ${recurringOverdue > 0 ? `
        <div class="td-toast-overdue-block">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span>期限が切れた定期タスクが ${recurringOverdue} 件あります</span>
        </div>` : ""}
      ${count > 0 ? `
        <div class="td-toast-near-block">
          <i class="bi bi-calendar-check"></i>
          <div>
            <div class="td-toast-near-main">期日が近いものが ${count} 件あります</div>
            <div class="td-toast-near-meta">営業日 ${nearDeadlineDays} 日以内（超過分を含む）</div>
          </div>
        </div>` : ""}
    </div>
    <div class="td-toast-actions">
      <button class="td-btn td-btn-primary" data-toast-action="list">一覧を開く</button>
      <button class="td-btn td-btn-secondary" data-toast-action="close">閉じる</button>
    </div>
  `;
  _showToast(html, 10);

  const toast = document.getElementById("tdToast");
  toast.querySelector('[data-toast-action="list"]').addEventListener("click", () => {
    _closeToast();
    document.querySelector('.td-tab[data-tab="pending"]')?.click();
  });
}

function _initNotifications() {
  EventsOn("todo:reminder", (payload) => {
    if (payload && payload.todo) _renderReminderToast(payload.todo);
  });
  EventsOn("todo:periodic", (payload) => {
    if (payload) _renderPeriodicToast(payload);
  });
  EventsOn("todo:focus-quick-input", () => {
    focusQuickInput();
  });
}
// #endregion

// #region インライン展開の詳細フォーム：空きスペースクリックで閉じる
// モーダル方式は元々オーバーレイのクリックで閉じられる（保存はしない＝破棄）ため、
// インライン方式でも同じ操作感になるよう、開いている行の外側をクリックしたら
// 保存せずに閉じる。ドラッグ操作中（テキスト選択を伴う場合がある）は誤閉じしないよう、
// mousedown 時点で対象を記録しておき、click イベント側で最終判定する。
let _outsideClickArmed = false;

document.addEventListener("mousedown", (e) => {
  _outsideClickArmed = true;
}, true);

document.addEventListener("click", (e) => {
  if (!_outsideClickArmed) return;
  _outsideClickArmed = false;

  if (_detailPattern !== "inline") return;

  if (_openId != null) {
    const wrap = document.querySelector(`.td-row-wrap[data-id="${_openId}"]`);
    if (wrap && !wrap.contains(e.target)) {
      closeDetail();
    }
  }

  if (_recurringOpenId != null) {
    const panel = document.getElementById("tdRecurringPanel");
    // パネル自体の外側クリックは既存の _bindOutsideDismiss(tdRecurringOverlay) 側に任せる
    if (panel && panel.contains(e.target)) {
      const rWrap = _recurringOpenId === "new"
        ? document.getElementById("tdRecurringAddInline")
        : document.querySelector(`.td-recurring-row-wrap[data-id="${_recurringOpenId}"]`);
      if (rWrap && !rWrap.contains(e.target)) {
        closeRecurringDetail();
      }
    }
  }
});
// #endregion

// #region イベント登録
document.addEventListener("DOMContentLoaded", async () => {

  try {
    const settings = await App.GetSettings();
    _detailPattern = settings.detail_pattern || "inline";
  } catch (e) {
    _detailPattern = "inline";
  }

  document.querySelectorAll(".td-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".td-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      _tab = tab.dataset.tab;
      _openId = null;
      closeDetailModal();
      document.getElementById("tdBulkDeleteBar").style.display = _tab === "done" ? "flex" : "none";
      document.getElementById("tdQuickInputWrap").style.display = _tab === "pending" ? "block" : "none";
      loadList();
    });
  });

  document.getElementById("tdBtnBulkDeleteAll").addEventListener("click", async () => {
    if (!confirm("完了済みのメモをすべて削除しますか？\nこの操作は元に戻せません。")) return;
    try {
      await _bulkDeleteDoneAll();
      loadList();
    } catch (e) {
      alert(_errMsg(e) || "削除に失敗しました");
    }
  });

  // メモ／定期タスク共用の詳細モーダル：外側クリックで変更を破棄する
  _bindOutsideDismiss(document.getElementById("tdDetailOverlay"), () => {
    if (_activeModalKind === "recurring") closeRecurringDetail();
    else if (_activeModalKind === "memo") closeDetail();
  });

  _initQuickInput();
  _initRecurringPanel();
  _initRecurringNotifyModal();
  _initSettingsModal();
  _initNotifications();

  loadList();
  refreshRecurringBadge();
});
// #endregion
