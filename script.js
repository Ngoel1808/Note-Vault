/* ============================================================
   NOTE VAULT PREMIUM — script.js v3.0
   Full state management, CRUD, theming, search, drag-drop
   ============================================================ */

/* ────────────────────────────────────────────────────────────
   STATE MANAGER
──────────────────────────────────────────────────────────── */
const NV = {
  VERSION: '3.0',

  KEYS: {
    NOTES:    'nv3_notes',
    USER:     'nv3_user',
    SESSION:  'nv3_session',
    THEME:    'nv3_theme',
    SEARCHES: 'nv3_searches',
    SETTINGS: 'nv3_settings',
    VER:      'nv3_version',
  },

  /* ---------- Bootstrap / init ---------- */
  init() {
    this._purge();
    this._applyTheme();
    this._bindThemeToggles();
  },

  _purge() {
    if (localStorage.getItem(this.KEYS.VER) !== this.VERSION) {
      const theme = localStorage.getItem(this.KEYS.THEME);
      [this.KEYS.NOTES, this.KEYS.USER, this.KEYS.SESSION, this.KEYS.SEARCHES].forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem(this.KEYS.SESSION);
      if (theme) localStorage.setItem(this.KEYS.THEME, theme);
      localStorage.setItem(this.KEYS.VER, this.VERSION);
    }
  },

  /* ---------- Theme ---------- */
  _applyTheme() {
    const t = localStorage.getItem(this.KEYS.THEME) || 'light';
    document.documentElement.setAttribute('data-theme', t);
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.classList.toggle('on', t === 'dark');
    });
  },

  toggleTheme() {
    const cur = localStorage.getItem(this.KEYS.THEME) || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    localStorage.setItem(this.KEYS.THEME, next);
    this._applyTheme();
    Toast.show('info', next === 'dark' ? '🌙 Dark Mode On' : '☀️ Light Mode On');
  },

  _bindThemeToggles() {
    document.addEventListener('click', e => {
      if (e.target.closest('.theme-toggle')) this.toggleTheme();
    });
  },

  /* ---------- Session ---------- */
  isLoggedIn() {
    return !!(localStorage.getItem(this.KEYS.SESSION) || sessionStorage.getItem(this.KEYS.SESSION));
  },

  login(name, email, password, remember) {
    const user = { name, email, avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) };
    const store = remember ? localStorage : sessionStorage;
    store.setItem(this.KEYS.SESSION, JSON.stringify(user));
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
    return user;
  },

  register(name, email) {
    const user = { name, email, avatar: name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) };
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
    return user;
  },

  logout() {
    if (typeof AuthAPI !== 'undefined') {
      AuthAPI.logout();
      return;
    }
    localStorage.removeItem(this.KEYS.SESSION);
    sessionStorage.removeItem(this.KEYS.SESSION);
    window.location.href = 'index.html';
  },

  getUser() {
    if (typeof AuthAPI !== 'undefined') {
      const u = AuthAPI.getUser();
      if (u) return { name: u.full_name, email: u.email, avatar: u.profile_image || u.full_name[0].toUpperCase() };
    }
    const raw = localStorage.getItem(this.KEYS.USER) || sessionStorage.getItem(this.KEYS.SESSION);
    try { return raw ? JSON.parse(raw) : { name: 'User', email: '', avatar: 'U' }; }
    catch { return { name: 'User', email: '', avatar: 'U' }; }
  },

  /* ---------- Notes CRUD ---------- */
  getNotes() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.NOTES) || '[]'); }
    catch { return []; }
  },

  _saveNotes(notes) { localStorage.setItem(this.KEYS.NOTES, JSON.stringify(notes)); },

  createNote(data) {
    const notes = this.getNotes();
    const note = {
      id:       'n' + Date.now(),
      title:    (data.title || '').trim(),
      content:  (data.content || '').trim(),
      category: data.category || 'other',
      tags:     data.tags || [],
      priority: data.priority || 'medium',
      color:    data.color || null,
      archived: false,
      favorite: false,
      pinned:   false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    notes.unshift(note);
    this._saveNotes(notes);
    this._addActivity(`Created note "${note.title}"`);
    return note;
  },

  updateNote(id, updates) {
    const notes = this.getNotes();
    const i = notes.findIndex(n => n.id === id);
    if (i === -1) return null;
    notes[i] = { ...notes[i], ...updates, updatedAt: new Date().toISOString() };
    this._saveNotes(notes);
    return notes[i];
  },

  deleteNote(id) {
    const notes = this.getNotes().filter(n => n.id !== id);
    this._saveNotes(notes);
    this._addActivity('Deleted a note');
  },

  toggleFavorite(id) {
    const note = this.getNotes().find(n => n.id === id);
    if (!note) return;
    const updated = this.updateNote(id, { favorite: !note.favorite });
    this._addActivity(updated.favorite ? `⭐ Favorited "${updated.title}"` : `Removed favorite "${updated.title}"`);
    return updated;
  },

  togglePin(id) {
    const note = this.getNotes().find(n => n.id === id);
    if (!note) return;
    return this.updateNote(id, { pinned: !note.pinned });
  },

  toggleArchive(id) {
    const note = this.getNotes().find(n => n.id === id);
    if (!note) return;
    const updated = this.updateNote(id, { archived: !note.archived });
    this._addActivity(updated.archived ? `📦 Archived "${updated.title}"` : `Unarchived "${updated.title}"`);
    return updated;
  },

  getStats() {
    const notes = this.getNotes();
    return {
      total:    notes.filter(n => !n.archived).length,
      archived: notes.filter(n => n.archived).length,
      favorite: notes.filter(n => n.favorite && !n.archived).length,
      pinned:   notes.filter(n => n.pinned && !n.archived).length,
      categories: [...new Set(notes.filter(n => !n.archived).map(n => n.category))].length,
    };
  },

  /* ---------- Search ---------- */
  searchNotes(query = '', filter = 'active', category = 'all', priority = 'all') {
    let notes = this.getNotes();
    if (filter === 'active')   notes = notes.filter(n => !n.archived);
    if (filter === 'archived') notes = notes.filter(n =>  n.archived);
    if (filter === 'favorite') notes = notes.filter(n =>  n.favorite && !n.archived);
    if (filter === 'pinned')   notes = notes.filter(n =>  n.pinned   && !n.archived);
    if (category !== 'all')    notes = notes.filter(n =>  n.category === category);
    if (priority !== 'all')    notes = notes.filter(n =>  n.priority === priority);
    if (query) {
      const q = query.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    // Pinned first
    return [...notes.filter(n => n.pinned), ...notes.filter(n => !n.pinned)];
  },

  /* ---------- Recent Searches ---------- */
  getRecentSearches() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.SEARCHES) || '[]'); }
    catch { return []; }
  },

  addRecentSearch(q) {
    if (!q.trim()) return;
    let searches = this.getRecentSearches().filter(s => s !== q);
    searches.unshift(q);
    searches = searches.slice(0, 8);
    localStorage.setItem(this.KEYS.SEARCHES, JSON.stringify(searches));
  },

  /* ---------- Activity ---------- */
  _addActivity(msg) {
    const key = 'nv3_activity';
    let acts = [];
    try { acts = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    acts.unshift({ msg, time: new Date().toISOString() });
    acts = acts.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(acts));
  },

  getActivity() {
    try { return JSON.parse(localStorage.getItem('nv3_activity') || '[]'); }
    catch { return []; }
  },

  /* ---------- Settings ---------- */
  getSettings() {
    const def = { notifications: true, theme: 'light', compactView: false };
    try { return { ...def, ...JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || '{}') }; }
    catch { return def; }
  },
  saveSettings(updates) {
    const s = this.getSettings();
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify({ ...s, ...updates }));
  },
};

/* ────────────────────────────────────────────────────────────
   TOAST
──────────────────────────────────────────────────────────── */
const Toast = {
  container: null,

  _ensure() {
    if (!this.container) {
      this.container = document.getElementById('toastStack');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastStack';
        document.body.appendChild(this.container);
      }
    }
  },

  show(type = 'info', title = '', message = '', duration = 4000) {
    this._ensure();
    const icons = { success: 'fa-circle-check', danger: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = `toast-v2 ${type}`;
    el.innerHTML = `
      <div class="toast-icon-wrap"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
      <div class="toast-content">
        <div class="toast-title-v2">${title}</div>
        ${message ? `<div class="toast-msg-v2">${message}</div>` : ''}
      </div>
      <button class="toast-close-v2" onclick="this.closest('.toast-v2').remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    this.container.appendChild(el);
    if (duration > 0) setTimeout(() => this._dismiss(el), duration);
  },

  _dismiss(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('exit');
    setTimeout(() => el.remove(), 320);
  },

  success(title, msg)  { this.show('success', title, msg); },
  error(title, msg)    { this.show('danger',  title, msg); },
  warning(title, msg)  { this.show('warning', title, msg); },
  info(title, msg)     { this.show('info',    title, msg); },
};

/* ────────────────────────────────────────────────────────────
   LOADER
──────────────────────────────────────────────────────────── */
const Loader = {
  show() { document.getElementById('loaderOverlay')?.classList.add('show'); },
  hide() { document.getElementById('loaderOverlay')?.classList.remove('show'); },
};

/* ────────────────────────────────────────────────────────────
   DATE UTILS
──────────────────────────────────────────────────────────── */
const Fmt = {
  ago(iso) {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 60000)    return 'just now';
    if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    if (diff < 604800000)return `${Math.floor(diff/86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
  },
  full(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  },
  time(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  },
};

/* ────────────────────────────────────────────────────────────
   CATEGORY / BADGE HELPERS
──────────────────────────────────────────────────────────── */
const Cat = {
  badgeClass(cat) {
    return { work:'badge-work', personal:'badge-personal', ideas:'badge-ideas', study:'badge-study', other:'badge-other' }[cat] || 'badge-other';
  },
  accentColor(cat) {
    return { work:'#4F46E5', personal:'#06B6D4', ideas:'#F59E0B', study:'#22C55E', other:'#64748B' }[cat] || '#64748B';
  },
  label(cat) {
    return { work:'Work', personal:'Personal', ideas:'Ideas', study:'Study', other:'Other' }[cat] || cat;
  },
  emoji(cat) {
    return { work:'💼', personal:'👤', ideas:'💡', study:'📚', other:'🏷️' }[cat] || '🏷️';
  },
};

const Prio = {
  label(p) { return { high:'High', medium:'Medium', low:'Low' }[p] || p; },
  color(p) { return { high:'#EF4444', medium:'#F59E0B', low:'#22C55E' }[p] || '#64748B'; },
};

/* ────────────────────────────────────────────────────────────
   HTML ESCAPE
──────────────────────────────────────────────────────────── */
function esc(text) {
  const d = document.createElement('div');
  d.textContent = text || '';
  return d.innerHTML;
}

/* ────────────────────────────────────────────────────────────
   RENDER NOTE CARD
──────────────────────────────────────────────────────────── */
function renderNoteCard(note, delay = 0) {
  const div = document.createElement('div');
  div.className = `note-card-v2${note.pinned ? ' pinned' : ''} masonry-item`;
  div.dataset.id = note.id;
  div.style.animationDelay = `${delay * 0.05}s`;
  div.setAttribute('draggable', 'true');

  const accentColor = Cat.accentColor(note.category);
  const tags = (note.tags || []).slice(0, 3).map(t => `<span class="note-tag">#${esc(t)}</span>`).join('');

  div.innerHTML = `
    <div class="note-card-accent" style="background:linear-gradient(90deg,${accentColor},${accentColor}88)"></div>
    <div class="note-card-top">
      <span class="note-category-badge-v2 ${Cat.badgeClass(note.category)}">${Cat.emoji(note.category)} ${Cat.label(note.category)}</span>
      <div style="display:flex;align-items:center;gap:4px">
        <span class="priority-dot ${note.priority || 'medium'}" title="Priority: ${Prio.label(note.priority)}"></span>
      </div>
    </div>
    <div class="note-title-v2">${esc(note.title) || '<em style="opacity:.4">Untitled</em>'}</div>
    <div class="note-preview-v2">${esc(note.content) || '<em style="opacity:.35">No content yet...</em>'}</div>
    ${tags ? `<div class="note-tags-row">${tags}</div>` : ''}
    <div class="note-footer-v2">
      <span class="note-date-v2"><i class="fa-regular fa-clock"></i> ${Fmt.ago(note.updatedAt)}</span>
      <div class="note-actions-v2">
        <button class="note-action-icon fav${note.favorite ? ' active' : ''}" data-id="${note.id}" data-action="fav" title="${note.favorite ? 'Unfavorite' : 'Favorite'}">
          <i class="fa-${note.favorite ? 'solid' : 'regular'} fa-star"></i>
        </button>
        <button class="note-action-icon pin${note.pinned ? ' active' : ''}" data-id="${note.id}" data-action="pin" title="${note.pinned ? 'Unpin' : 'Pin'}">
          <i class="fa-solid fa-thumbtack${note.pinned ? '' : ' fa-rotate-90'}"></i>
        </button>
        <button class="note-action-icon edit" data-id="${note.id}" data-action="edit" title="Edit">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="note-action-icon archive" data-id="${note.id}" data-action="archive" title="${note.archived ? 'Unarchive' : 'Archive'}">
          <i class="fa-solid fa-${note.archived ? 'box-open' : 'box-archive'}"></i>
        </button>
        <button class="note-action-icon delete" data-id="${note.id}" data-action="delete" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;

  // Drag events
  div.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', note.id);
    div.classList.add('dragging');
    setTimeout(() => div.style.opacity = '0.4', 0);
  });
  div.addEventListener('dragend', () => {
    div.classList.remove('dragging');
    div.style.opacity = '';
  });

  return div;
}

/* ────────────────────────────────────────────────────────────
   SIDEBAR MANAGER
──────────────────────────────────────────────────────────── */
const Sidebar = {
  open() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('show');
  },
  close() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
  },
  toggle() { document.getElementById('sidebar')?.classList.contains('open') ? this.close() : this.open(); },

  populateUser() {
    const user = NV.getUser();
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user.name);
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user.email);
    document.querySelectorAll('[data-user-avatar]').forEach(el => el.textContent = user.avatar || 'U');
  },

  updateBadge() {
    const stats = NV.getStats();
    const badge = document.getElementById('notesBadge');
    if (badge) badge.textContent = stats.total;
  },
};

/* ────────────────────────────────────────────────────────────
   VALIDATOR
──────────────────────────────────────────────────────────── */
const Valid = {
  email(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
  minLen(v, n) { return v.trim().length >= n; },
  pwStrength(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  },
};

/* ────────────────────────────────────────────────────────────
   MODAL MANAGER
──────────────────────────────────────────────────────────── */
const Modal = {
  open(id) {
    const overlay = document.getElementById(id);
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },
  close(id) {
    const overlay = document.getElementById(id);
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  },
  closeAll() {
    document.querySelectorAll('.modal-v2-overlay.open').forEach(el => el.classList.remove('open'));
    document.body.style.overflow = '';
  },
};

/* ────────────────────────────────────────────────────────────
   SEARCH ENGINE (topbar)
──────────────────────────────────────────────────────────── */
const Search = {
  input: null,
  dropdown: null,
  currentQuery: '',

  init() {
    this.input = document.getElementById('topbarSearch');
    this.dropdown = document.getElementById('searchDropdown');
    if (!this.input) return;

    this.input.addEventListener('input', debounce(() => this._handleInput(), 250));
    this.input.addEventListener('focus', () => this._showDropdown());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Escape') this._hideDropdown();
      if (e.key === 'Enter' && this.currentQuery) {
        NV.addRecentSearch(this.currentQuery);
        this._hideDropdown();
        if (typeof renderNotes === 'function') {
          searchQuery = this.currentQuery;
          renderNotes();
        } else {
          window.location.href = `notes.html?q=${encodeURIComponent(this.currentQuery)}`;
        }
      }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.topbar-search-wrap')) this._hideDropdown();
    });
  },

  _handleInput() {
    this.currentQuery = this.input.value.trim();
    if (this.currentQuery.length < 1) {
      this._renderRecents();
      return;
    }
    const results = NV.searchNotes(this.currentQuery, 'active').slice(0, 5);
    this._renderResults(results);
  },

  _showDropdown() {
    if (!this.dropdown) return;
    if (this.input.value.trim()) this._handleInput();
    else this._renderRecents();
    this.dropdown.classList.add('show');
  },

  _hideDropdown() { this.dropdown?.classList.remove('show'); },

  _renderRecents() {
    if (!this.dropdown) return;
    const recents = NV.getRecentSearches();
    if (!recents.length) { this.dropdown.innerHTML = '<div style="padding:12px;font-size:0.82rem;color:var(--text-subtle);text-align:center">No recent searches</div>'; return; }
    this.dropdown.innerHTML = `
      <div class="search-section-label">Recent Searches</div>
      ${recents.map(s => `
        <div class="search-result-item" onclick="Search._selectSearch('${esc(s)}')">
          <div class="search-result-icon" style="background:rgba(100,116,139,0.1)"><i class="fa-solid fa-clock-rotate-left" style="color:var(--text-subtle)"></i></div>
          <div class="search-result-title">${esc(s)}</div>
        </div>
      `).join('')}
    `;
    this.dropdown.classList.add('show');
  },

  _renderResults(notes) {
    if (!this.dropdown) return;
    if (!notes.length) {
      this.dropdown.innerHTML = '<div style="padding:12px;font-size:0.82rem;color:var(--text-subtle);text-align:center">No results found</div>';
      return;
    }
    const q = this.currentQuery;
    this.dropdown.innerHTML = `
      <div class="search-section-label">Notes — ${notes.length} result${notes.length !== 1 ? 's' : ''}</div>
      ${notes.map(n => `
        <div class="search-result-item" onclick="Search._selectNote('${n.id}', '${esc(q)}')">
          <div class="search-result-icon" style="background:rgba(79,70,229,0.08)">${Cat.emoji(n.category)}</div>
          <div>
            <div class="search-result-title">${esc(n.title) || 'Untitled'}</div>
            <div class="search-result-meta">${Cat.label(n.category)} · ${Fmt.ago(n.updatedAt)}</div>
          </div>
        </div>
      `).join('')}
    `;
  },

  _selectSearch(q) {
    if (this.input) this.input.value = q;
    this.currentQuery = q;
    NV.addRecentSearch(q);
    this._hideDropdown();
    if (typeof renderNotes === 'function') { searchQuery = q; renderNotes(); }
    else window.location.href = `notes.html?q=${encodeURIComponent(q)}`;
  },

  _selectNote(id, q) {
    NV.addRecentSearch(q);
    this._hideDropdown();
    // Navigate to notes page and pre-select note
    window.location.href = `notes.html?highlight=${id}`;
  },
};

/* ────────────────────────────────────────────────────────────
   TAGS MANAGER (for create/edit modal)
──────────────────────────────────────────────────────────── */
const TagsManager = {
  tags: [],
  container: null,
  input: null,

  init(containerId) {
    this.tags = [];
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.input = this.container.querySelector('.tags-input');
    this.input?.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && this.input.value.trim()) {
        e.preventDefault();
        this.addTag(this.input.value.trim().replace(',', ''));
      }
      if (e.key === 'Backspace' && !this.input.value && this.tags.length) {
        this.removeTag(this.tags[this.tags.length - 1]);
      }
    });
    this.container.addEventListener('click', () => this.input?.focus());
  },

  addTag(text) {
    const t = text.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!t || this.tags.includes(t) || this.tags.length >= 5) return;
    this.tags.push(t);
    this._renderTags();
    if (this.input) this.input.value = '';
  },

  removeTag(t) {
    this.tags = this.tags.filter(x => x !== t);
    this._renderTags();
  },

  setTags(arr) {
    this.tags = arr || [];
    this._renderTags();
  },

  getTags() { return this.tags; },

  _renderTags() {
    if (!this.container) return;
    const existingTags = this.container.querySelectorAll('.tag-item');
    existingTags.forEach(el => el.remove());
    this.tags.forEach(t => {
      const el = document.createElement('span');
      el.className = 'tag-item';
      el.innerHTML = `#${t} <span class="tag-remove" data-tag="${t}">✕</span>`;
      el.querySelector('.tag-remove').addEventListener('click', e => {
        e.stopPropagation();
        this.removeTag(t);
      });
      this.container.insertBefore(el, this.input);
    });
  },
};

/* ────────────────────────────────────────────────────────────
   NOTE MODAL (Create / Edit)
──────────────────────────────────────────────────────────── */
let _editingNoteId = null;
let _selectedPriority = 'medium';

function openCreateModal() {
  _editingNoteId = null;
  _selectedPriority = 'medium';
  document.getElementById('noteModalTitle').innerHTML = '<i class="fa-solid fa-plus"></i> New Note';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteCategory').value = 'personal';
  document.getElementById('noteEditor').innerHTML = '';
  TagsManager.init('tagsContainer');
  _initPrioritySelector('medium');
  Modal.open('noteModal');
  setTimeout(() => document.getElementById('noteTitle')?.focus(), 200);
}

function openEditModal(id) {
  const note = NV.getNotes().find(n => n.id === id);
  if (!note) return;
  _editingNoteId = id;
  _selectedPriority = note.priority || 'medium';
  document.getElementById('noteModalTitle').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Note';
  document.getElementById('noteTitle').value = note.title;
  document.getElementById('noteCategory').value = note.category;
  document.getElementById('noteEditor').innerHTML = esc(note.content).replace(/\n/g, '<br>');
  TagsManager.init('tagsContainer');
  TagsManager.setTags(note.tags || []);
  _initPrioritySelector(note.priority || 'medium');
  Modal.open('noteModal');
}

function _initPrioritySelector(current) {
  _selectedPriority = current;
  document.querySelectorAll('.priority-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.priority === current);
  });
}

function saveNote() {
  const title   = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteEditor').innerText.trim();
  const cat     = document.getElementById('noteCategory').value;
  const tags    = TagsManager.getTags();
  const priority = _selectedPriority;

  if (!title && !content) {
    Toast.warning('Title or content required', 'Please add something before saving.');
    return;
  }

  const saveBtn = document.getElementById('saveNoteBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  setTimeout(() => {
    if (_editingNoteId) {
      NV.updateNote(_editingNoteId, { title, content, category: cat, tags, priority });
      Toast.success('Note updated!', `"${title || 'Note'}" has been saved.`);
    } else {
      NV.createNote({ title, content, category: cat, tags, priority });
      Toast.success('Note created!', `"${title || 'Note'}" has been added.`);
    }
    Modal.close('noteModal');
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Note';
    if (typeof renderNotes === 'function') renderNotes();
    if (typeof loadDashboard === 'function') loadDashboard();
    Sidebar.updateBadge();
  }, 500);
}

/* ────────────────────────────────────────────────────────────
   DELETE MODAL
──────────────────────────────────────────────────────────── */
let _deleteNoteId = null;

function openDeleteModal(id) {
  _deleteNoteId = id;
  const note = NV.getNotes().find(n => n.id === id);
  const titleEl = document.getElementById('deleteNoteNameDisplay');
  if (titleEl && note) titleEl.textContent = `"${note.title || 'this note'}"`;
  Modal.open('deleteModal');
}

function confirmDelete() {
  if (!_deleteNoteId) return;
  NV.deleteNote(_deleteNoteId);
  _deleteNoteId = null;
  Modal.close('deleteModal');
  Toast.error('Deleted', 'The note has been permanently removed.');
  if (typeof renderNotes === 'function') renderNotes();
  if (typeof loadDashboard === 'function') loadDashboard();
  Sidebar.updateBadge();
}

/* ────────────────────────────────────────────────────────────
   NOTE ACTIONS DISPATCHER
──────────────────────────────────────────────────────────── */
function handleNoteAction(id, action) {
  switch (action) {
    case 'edit':    openEditModal(id); break;
    case 'delete':  openDeleteModal(id); break;
    case 'fav': {
      const updated = NV.toggleFavorite(id);
      Toast.success(updated.favorite ? '⭐ Favorited' : 'Removed from favorites');
      if (typeof renderNotes === 'function') renderNotes();
      break;
    }
    case 'pin': {
      const updated = NV.togglePin(id);
      Toast.info(updated.pinned ? '📌 Pinned' : 'Unpinned');
      if (typeof renderNotes === 'function') renderNotes();
      break;
    }
    case 'archive': {
      const updated = NV.toggleArchive(id);
      Toast.info(updated.archived ? '📦 Archived' : 'Unarchived');
      if (typeof renderNotes === 'function') renderNotes();
      break;
    }
  }
  Sidebar.updateBadge();
}

/* ────────────────────────────────────────────────────────────
   RICH TEXT EDITOR TOOLBAR
──────────────────────────────────────────────────────────── */
function initRichEditor() {
  document.querySelectorAll('.editor-tool-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      document.execCommand(cmd, false, val);
      document.getElementById('noteEditor')?.focus();
      btn.classList.toggle('active', document.queryCommandState(cmd));
    });
  });

  const editor = document.getElementById('noteEditor');
  editor?.addEventListener('keyup', () => {
    document.querySelectorAll('.editor-tool-btn[data-cmd]').forEach(btn => {
      btn.classList.toggle('active', document.queryCommandState(btn.dataset.cmd));
    });
  });
}

/* ────────────────────────────────────────────────────────────
   SKELETON SCREENS
──────────────────────────────────────────────────────────── */
function renderSkeletonNotes(container, count = 6) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'masonry-item';
    el.innerHTML = `
      <div class="note-card-v2" style="gap:12px;pointer-events:none">
        <div class="skeleton" style="height:18px;width:60%"></div>
        <div class="skeleton skeleton-title" style="width:85%"></div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div class="skeleton skeleton-text" style="width:100%"></div>
          <div class="skeleton skeleton-text" style="width:90%"></div>
          <div class="skeleton skeleton-text" style="width:75%"></div>
        </div>
        <div class="skeleton" style="height:1px;width:100%"></div>
        <div style="display:flex;justify-content:space-between">
          <div class="skeleton" style="height:12px;width:80px"></div>
          <div style="display:flex;gap:4px">
            <div class="skeleton" style="width:28px;height:28px;border-radius:7px"></div>
            <div class="skeleton" style="width:28px;height:28px;border-radius:7px"></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(el);
  }
}

/* ────────────────────────────────────────────────────────────
   RIPPLE EFFECT
──────────────────────────────────────────────────────────── */
function addRipple(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  btn.style.setProperty('--rx', `${e.clientX - rect.left}px`);
  btn.style.setProperty('--ry', `${e.clientY - rect.top}px`);
  btn.classList.remove('rippling');
  void btn.offsetWidth; // reflow
  btn.classList.add('rippling');
  setTimeout(() => btn.classList.remove('rippling'), 600);
}

/* ────────────────────────────────────────────────────────────
   DEBOUNCE
──────────────────────────────────────────────────────────── */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ────────────────────────────────────────────────────────────
   ──────── PAGE INITIALIZERS ─────────────────────────────────
──────────────────────────────────────────────────────────── */

/* ════════ LANDING ════════ */
function initLanding() {
  // Navbar scroll effect
  const nav = document.getElementById('landingNav');
  window.addEventListener('scroll', () => nav?.classList.toggle('scrolled', window.scrollY > 60));

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

  // Intersection Observer for section animations
  const obs = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('anim-fade-up'); obs.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.observe-anim').forEach(el => obs.observe(el));
}

/* ════════ AUTH ════════ */
function initAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.form)?.classList.add('active');
    });
  });

  // Check for ?tab param
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'register') {
    document.querySelector('[data-form="registerForm"]')?.click();
  }

  // Login
  document.getElementById('loginFormEl')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPw').value;
    const remember = document.getElementById('loginRemember')?.checked;

    let ok = true;
    if (!Valid.email(email)) { showAuthError('loginEmailErr', 'Enter a valid email address'); ok = false; } else hideAuthError('loginEmailErr');
    if (!pw) { showAuthError('loginPwErr', 'Password is required'); ok = false; } else hideAuthError('loginPwErr');
    if (!ok) return;

    const btn = document.getElementById('loginSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    // Retrieve registered user
    const savedUser = (() => { try { return JSON.parse(localStorage.getItem(NV.KEYS.USER) || '{}'); } catch { return {}; } })();
    const displayName = savedUser.name || email.split('@')[0];

    setTimeout(() => {
      NV.login(displayName, email, pw, remember);
      Toast.success('Welcome back!', `Signed in as ${email}`);
      setTimeout(() => window.location.href = 'dashboard.html', 800);
    }, 900);
  });

  // Register
  document.getElementById('registerFormEl')?.addEventListener('submit', e => {
    e.preventDefault();
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pw    = document.getElementById('regPw').value;
    const cpw   = document.getElementById('regCpw').value;

    let ok = true;
    if (!Valid.minLen(name, 2)) { showAuthError('regNameErr', 'Enter your full name'); ok = false; } else hideAuthError('regNameErr');
    if (!Valid.email(email))    { showAuthError('regEmailErr', 'Enter a valid email'); ok = false; } else hideAuthError('regEmailErr');
    if (!Valid.minLen(pw, 8))   { showAuthError('regPwErr', 'Password must be 8+ characters'); ok = false; } else hideAuthError('regPwErr');
    if (pw !== cpw)             { showAuthError('regCpwErr', 'Passwords do not match'); ok = false; } else hideAuthError('regCpwErr');
    if (!ok) return;

    const btn = document.getElementById('regSubmitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

    setTimeout(() => {
      NV.register(name, email);
      Toast.success('Account created!', 'Please sign in to continue.');
      setTimeout(() => {
        document.querySelector('[data-form="loginForm"]')?.click();
        document.getElementById('loginEmail').value = email;
        btn.disabled = false; btn.innerHTML = 'Create Account <i class="fa-solid fa-arrow-right"></i>';
      }, 900);
    }, 1000);
  });

  // Password strength
  document.getElementById('regPw')?.addEventListener('input', function() {
    const strength = Valid.pwStrength(this.value);
    const bars = document.querySelectorAll('.pw-bar');
    const colors = ['', '#EF4444', '#F59E0B', '#3B82F6', '#22C55E'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    bars.forEach((bar, i) => { bar.style.background = i < strength ? colors[strength] : ''; });
    const label = document.getElementById('pwStrengthLabel');
    if (label) { label.textContent = this.value ? labels[strength] : ''; label.style.color = colors[strength]; }
  });

  // Password toggles
  document.querySelectorAll('[data-toggle-pw]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePw);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      btn.querySelector('i')?.classList.toggle('fa-eye');
      btn.querySelector('i')?.classList.toggle('fa-eye-slash');
    });
  });
}

function showAuthError(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('show'); } }
function hideAuthError(id)      { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

/* ════════ DASHBOARD ════════ */
function loadDashboard() {
  Sidebar.populateUser();
  Sidebar.updateBadge();
  loadStats();
  loadRecentNotes();
  loadActivityTimeline();
  buildMiniCharts();
  loadWelcomeGreeting();
}

function loadWelcomeGreeting() {
  const user = NV.getUser();
  const el = document.getElementById('welcomeGreeting');
  if (!el) return;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  el.textContent = `${greet}, ${user.name.split(' ')[0]}! 👋`;
}

function loadStats() {
  const stats = NV.getStats();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statTotal', stats.total);
  set('statArchived', stats.archived);
  set('statFavorite', stats.favorite);
  set('statCategories', stats.categories);
}

function loadRecentNotes() {
  const container = document.getElementById('recentNotesGrid');
  if (!container) return;
  const notes = NV.searchNotes('', 'active').slice(0, 4);
  container.innerHTML = '';
  if (!notes.length) {
    container.innerHTML = `
      <div class="empty-state-v2" style="grid-column:1/-1">
        <div class="empty-icon-ring">📝</div>
        <div class="empty-title-v2">No notes yet</div>
        <div class="empty-desc-v2">Create your first note to get started on your productivity journey!</div>
        <button class="btn-primary-v2" onclick="openCreateModal()"><i class="fa-solid fa-plus"></i> Create Note</button>
      </div>`;
    return;
  }
  notes.forEach((note, i) => {
    const card = renderNoteCard(note, i);
    card.classList.remove('masonry-item');
    container.appendChild(card);
  });
  bindNoteCardEvents(container);
}

function loadActivityTimeline() {
  const container = document.getElementById('activityTimeline');
  if (!container) return;
  const acts = NV.getActivity();
  if (!acts.length) {
    container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-subtle);text-align:center;padding:16px">No activity yet</p>';
    return;
  }
  const colors = ['#4F46E5','#8B5CF6','#22C55E','#F59E0B','#EF4444'];
  container.innerHTML = acts.slice(0, 8).map((a, i) => `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${colors[i % colors.length]}"></div>
      <div>
        <div class="timeline-title">${esc(a.msg)}</div>
        <div class="timeline-time">${Fmt.ago(a.time)} · ${Fmt.time(a.time)}</div>
      </div>
    </div>
  `).join('');
}

function buildMiniCharts() {
  document.querySelectorAll('.mini-sparkline').forEach(chart => {
    const bars = Array.from({ length: 7 }, () => Math.floor(Math.random() * 80) + 20);
    const max = Math.max(...bars);
    const color = chart.dataset.color || '#4F46E5';
    chart.innerHTML = bars.map(h => `<div class="spark-bar" style="height:${(h/max)*100}%;background:${color}"></div>`).join('');
  });
}

function initDashboard() {
  initSidebarNav();
  loadDashboard();
  Search.init();
  bindRipples();
  // Open create modal from quick action
  document.getElementById('dashCreateBtn')?.addEventListener('click', openCreateModal);
}

/* ════════ NOTES PAGE ════════ */
let searchQuery = '';
let activeFilter = 'active';
let activeCategory = 'all';
let activePriority = 'all';
let viewMode = 'masonry';

function initNotes() {
  initSidebarNav();
  Sidebar.populateUser();
  Sidebar.updateBadge();
  Search.init();
  bindRipples();

  // URL params
  const params = new URLSearchParams(window.location.search);
  if (params.get('filter'))    { activeFilter = params.get('filter'); highlightFilterPill(activeFilter); }
  if (params.get('category'))  { activeCategory = params.get('category'); const sel = document.getElementById('catFilter'); if (sel) sel.value = activeCategory; }
  if (params.get('q'))         { searchQuery = params.get('q'); const inp = document.getElementById('notesSearch'); if (inp) inp.value = searchQuery; }
  if (params.get('highlight')) { scrollToNote(params.get('highlight')); }

  // Skeleton then render
  const grid = document.getElementById('notesGrid');
  if (grid) {
    renderSkeletonNotes(grid, 6);
    setTimeout(() => renderNotes(), 600);
  }

  // FAB
  document.getElementById('fabBtn')?.addEventListener('click', openCreateModal);
  document.getElementById('fabBtn2')?.addEventListener('click', openCreateModal);

  // Filters
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeFilter = pill.dataset.filter;
      highlightFilterPill(activeFilter);
      renderNotes();
    });
  });

  // Category
  document.getElementById('catFilter')?.addEventListener('change', e => {
    activeCategory = e.target.value;
    renderNotes();
  });

  // Priority
  document.getElementById('prioFilter')?.addEventListener('change', e => {
    activePriority = e.target.value;
    renderNotes();
  });

  // Search
  const searchInput = document.getElementById('notesSearch');
  searchInput?.addEventListener('input', debounce(() => {
    searchQuery = searchInput.value.trim();
    renderNotes();
  }, 300));

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewMode));
      renderNotes();
    });
  });

  // Priority selector in modal
  document.querySelectorAll('.priority-option').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedPriority = btn.dataset.priority;
      document.querySelectorAll('.priority-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected', btn.dataset.priority);
    });
  });

  // Modal events
  document.getElementById('saveNoteBtn')?.addEventListener('click', saveNote);
  document.getElementById('cancelNoteBtn')?.addEventListener('click', () => Modal.close('noteModal'));
  document.getElementById('deleteConfirmBtn')?.addEventListener('click', confirmDelete);
  document.getElementById('deleteCancelBtn')?.addEventListener('click', () => Modal.close('deleteModal'));

  // Note card grid delegate
  document.getElementById('notesGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn) { e.stopPropagation(); handleNoteAction(btn.dataset.id, btn.dataset.action); }
  });

  initRichEditor();
}

function renderNotes() {
  const container = document.getElementById('notesGrid');
  if (!container) return;
  const notes = NV.searchNotes(searchQuery, activeFilter, activeCategory, activePriority);

  container.innerHTML = '';

  // Update count
  const countEl = document.getElementById('notesCount');
  if (countEl) countEl.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;

  if (!notes.length) {
    const emoji = searchQuery ? '🔍' : activeFilter === 'archived' ? '📦' : activeFilter === 'favorite' ? '⭐' : '📝';
    const title = searchQuery ? 'No results found' : activeFilter === 'archived' ? 'No archived notes' : activeFilter === 'favorite' ? 'No favorites yet' : 'Your notes will appear here';
    const desc  = searchQuery ? `No notes match "${esc(searchQuery)}"` : 'Create your first note to get started!';
    container.innerHTML = `
      <div class="empty-state-v2" style="grid-column:1/-1">
        <div class="empty-icon-ring">${emoji}</div>
        <div class="empty-title-v2">${title}</div>
        <div class="empty-desc-v2">${desc}</div>
        ${!searchQuery && activeFilter === 'active' ? '<button class="btn-primary-v2" id="emptyCreateBtn"><i class="fa-solid fa-plus"></i> Create Note</button>' : ''}
      </div>`;
    document.getElementById('emptyCreateBtn')?.addEventListener('click', openCreateModal);
    return;
  }

  // Apply view mode
  if (viewMode === 'masonry') {
    container.style.cssText = '';
    container.className = 'masonry-grid';
    notes.forEach((note, i) => container.appendChild(renderNoteCard(note, i)));
  } else {
    container.className = '';
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px';
    notes.forEach((note, i) => {
      const card = renderNoteCard(note, i);
      card.style.marginBottom = '0';
      container.appendChild(card);
    });
  }

  bindNoteCardEvents(container);
}

function highlightFilterPill(filter) {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === filter);
  });
}

function bindNoteCardEvents(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleNoteAction(btn.dataset.id, btn.dataset.action);
    });
  });
}

function scrollToNote(id) {
  setTimeout(() => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--primary)'; setTimeout(() => el.style.outline = '', 2000); }
  }, 800);
}

/* ════════ SETTINGS ════════ */
function initSettings() {
  initSidebarNav();
  Sidebar.populateUser();
  Sidebar.updateBadge();

  // Populate user info
  const user = NV.getUser();
  const settingsName   = document.getElementById('settingsName');
  const settingsEmail  = document.getElementById('settingsEmail');
  const settingsAvatar = document.getElementById('settingsAvatarText');
  if (settingsName)   settingsName.value  = user.name;
  if (settingsEmail)  settingsEmail.value = user.email;
  if (settingsAvatar) settingsAvatar.textContent = user.avatar || 'U';

  // Settings nav tabs
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      item.classList.add('active');
      document.getElementById(item.dataset.panel)?.style.removeProperty('display');
    });
  });

  // Save profile
  document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
    const name  = settingsName?.value.trim();
    const email = settingsEmail?.value.trim();
    if (!name) { Toast.warning('Name required', 'Please enter your name.'); return; }
    if (!Valid.email(email)) { Toast.warning('Invalid email', 'Please enter a valid email.'); return; }
    NV.saveSettings({ name, email });
    const updated = { ...NV.getUser(), name, email, avatar: name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) };
    localStorage.setItem(NV.KEYS.USER, JSON.stringify(updated));
    Sidebar.populateUser();
    if (settingsAvatar) settingsAvatar.textContent = updated.avatar;
    Toast.success('Profile saved!', 'Your profile has been updated.');
  });

  // Password change
  document.getElementById('changePwBtn')?.addEventListener('click', () => {
    const np = document.getElementById('newPw').value;
    const cp = document.getElementById('confirmNewPw').value;
    if (!Valid.minLen(np, 8)) { Toast.warning('Weak password', 'Password must be 8+ characters.'); return; }
    if (np !== cp) { Toast.warning('Mismatch', 'Passwords do not match.'); return; }
    Toast.success('Password updated!');
    document.getElementById('newPw').value = '';
    document.getElementById('confirmNewPw').value = '';
  });

  // Theme selection
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const theme = opt.dataset.theme;
      localStorage.setItem(NV.KEYS.THEME, theme);
      NV._applyTheme();
    });
  });

  // Mark current theme
  const currentTheme = localStorage.getItem(NV.KEYS.THEME) || 'light';
  document.querySelector(`.theme-option[data-theme="${currentTheme}"]`)?.classList.add('selected');

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => NV.logout());

  Search.init();
}

/* ════════ SHARED SIDEBAR NAV ════════ */
function initSidebarNav() {
  const burger = document.getElementById('sidebarBurger');
  const overlay = document.getElementById('sidebarOverlay');
  burger?.addEventListener('click', () => Sidebar.toggle());
  overlay?.addEventListener('click', () => Sidebar.close());
  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', () => NV.logout()));

  // Theme toggle in sidebar
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.classList.toggle('on', (localStorage.getItem(NV.KEYS.THEME) || 'light') === 'dark');
  });
}

/* ════════ BIND RIPPLES ════════ */
function bindRipples() {
  document.querySelectorAll('.ripple-btn').forEach(btn => btn.addEventListener('click', addRipple));
}

/* ════════ DOMContentLoaded ════════ */
document.addEventListener('DOMContentLoaded', () => {
  NV.init();

  const page = document.body.dataset.page;
  switch (page) {
    case 'landing':   initLanding();   break;
    case 'auth':      initAuth();      break;
    case 'dashboard': initDashboard(); break;
    case 'notes':     initNotes();     break;
    case 'settings':  initSettings();  break;
  }

  // Modal close on overlay click
  document.querySelectorAll('.modal-v2-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) Modal.closeAll();
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') Modal.closeAll();
  });
});
