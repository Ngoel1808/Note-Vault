/**
 * api.js — Note Vault Frontend API Client
 * Communicates with the Flask backend. Falls back to localStorage when offline.
 */

const API_BASE = 'http://localhost:5000/api';

/* ────────────────────────────────────────────────────────────
   TOKEN HELPERS
──────────────────────────────────────────────────────────── */
const Token = {
  get()           { return localStorage.getItem('nv_access_token'); },
  getRefresh()    { return localStorage.getItem('nv_refresh_token'); },
  set(access, refresh) {
    localStorage.setItem('nv_access_token', access);
    if (refresh) localStorage.setItem('nv_refresh_token', refresh);
  },
  clear() {
    localStorage.removeItem('nv_access_token');
    localStorage.removeItem('nv_refresh_token');
    localStorage.removeItem('nv_user');
  },
  saveUser(user)  { localStorage.setItem('nv_user', JSON.stringify(user)); },
  getUser()       { try { return JSON.parse(localStorage.getItem('nv_user') || 'null'); } catch { return null; } },
};

/* ────────────────────────────────────────────────────────────
   BASE FETCH WRAPPER
──────────────────────────────────────────────────────────── */
async function apiFetch(method, path, body = null, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Token.get()) headers['Authorization'] = `Bearer ${Token.get()}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res  = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    // Backend unreachable — signal caller to use offline mode
    return { ok: false, status: 0, data: { message: 'Backend unavailable', offline: true } };
  }
}

/* ────────────────────────────────────────────────────────────
   AUTH API
──────────────────────────────────────────────────────────── */
const AuthAPI = {

  async register(fullName, email, password) {
    const res = await apiFetch('POST', '/auth/register', { full_name: fullName, email, password }, false);
    if (res.ok) {
      Token.set(res.data.data.access_token, res.data.data.refresh_token);
      Token.saveUser(res.data.data.user);
    }
    return res;
  },

  async login(email, password) {
    const res = await apiFetch('POST', '/auth/login', { email, password }, false);
    if (res.ok) {
      Token.set(res.data.data.access_token, res.data.data.refresh_token);
      Token.saveUser(res.data.data.user);
    }
    return res;
  },

  async loginWithGoogle(credential) {
    const res = await apiFetch('POST', '/auth/google', { credential }, false);
    if (res.ok) {
      Token.set(res.data.data.access_token, res.data.data.refresh_token);
      Token.saveUser(res.data.data.user);
    }
    return res;
  },

  // GitHub OAuth: just redirect — backend handles the flow
  loginWithGitHub() {
    window.location.href = `http://localhost:5000/api/auth/github`;
  },

  // Called after GitHub callback redirect (picks token from URL params)
  handleGitHubCallback() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const provider = params.get('provider');
    if (token && provider === 'github') {
      Token.set(token, params.get('refresh'));
      const user = {
        full_name:     decodeURIComponent(params.get('name') || ''),
        email:         params.get('email') || '',
        profile_image: params.get('avatar') || '',
        auth_provider: 'github',
      };
      Token.saveUser(user);
      // Clean URL and redirect to dashboard
      window.history.replaceState({}, document.title, window.location.pathname);
      return { ok: true, user };
    }
    const oauthError = params.get('error');
    if (oauthError) return { ok: false, error: oauthError };
    return null;
  },

  async logout() {
    await apiFetch('POST', '/auth/logout');
    Token.clear();
    window.location.href = 'index.html';
  },

  async changePassword(currentPassword, newPassword) {
    return apiFetch('POST', '/auth/change-password', { current_password: currentPassword, new_password: newPassword });
  },

  async forgotPassword(email) {
    return apiFetch('POST', '/auth/forgot-password', { email }, false);
  },

  async resetPassword(token, newPassword) {
    return apiFetch('POST', '/auth/reset-password', { token, new_password: newPassword }, false);
  },

  async me() {
    return apiFetch('GET', '/auth/me');
  },

  isLoggedIn() {
    return !!Token.get();
  },

  getUser() {
    return Token.getUser();
  },
};

/* ────────────────────────────────────────────────────────────
   NOTES API
──────────────────────────────────────────────────────────── */
const NotesAPI = {

  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('GET', `/notes/${qs ? '?' + qs : ''}`);
  },

  async get(id) {
    return apiFetch('GET', `/notes/${id}`);
  },

  async create(data) {
    return apiFetch('POST', '/notes/', data);
  },

  async update(id, data) {
    return apiFetch('PUT', `/notes/${id}`, data);
  },

  async delete(id) {
    return apiFetch('DELETE', `/notes/${id}`);
  },

  async archive(id)   { return apiFetch('PUT', `/notes/archive/${id}`); },
  async unarchive(id) { return apiFetch('PUT', `/notes/unarchive/${id}`); },
  async favorite(id)  { return apiFetch('PUT', `/notes/favorite/${id}`); },
  async unfavorite(id){ return apiFetch('PUT', `/notes/unfavorite/${id}`); },
  async pin(id)       { return apiFetch('PUT', `/notes/pin/${id}`); },
  async unpin(id)     { return apiFetch('PUT', `/notes/unpin/${id}`); },

  async archived()   { return apiFetch('GET', '/notes/archived'); },
  async favorites()  { return apiFetch('GET', '/notes/favorites'); },

  async search(query, categoryId = null) {
    let qs = `q=${encodeURIComponent(query)}`;
    if (categoryId) qs += `&category_id=${categoryId}`;
    return apiFetch('GET', `/search/?${qs}`);
  },
};

/* ────────────────────────────────────────────────────────────
   CATEGORIES API
──────────────────────────────────────────────────────────── */
const CategoriesAPI = {
  async list()            { return apiFetch('GET', '/categories/'); },
  async create(data)      { return apiFetch('POST', '/categories/', data); },
  async update(id, data)  { return apiFetch('PUT', `/categories/${id}`, data); },
  async delete(id)        { return apiFetch('DELETE', `/categories/${id}`); },
};

/* ────────────────────────────────────────────────────────────
   DASHBOARD API
──────────────────────────────────────────────────────────── */
const DashboardAPI = {
  async stats()  { return apiFetch('GET', '/dashboard/stats'); },
  async recent() { return apiFetch('GET', '/dashboard/recent'); },
};

/* ────────────────────────────────────────────────────────────
   GOOGLE IDENTITY SERVICES LOADER
──────────────────────────────────────────────────────────── */
const GoogleAuth = {
  clientId: null,   // Set from meta tag or window.GOOGLE_CLIENT_ID

  init(clientId, onSuccess) {
    if (!clientId || !window.google) return;
    this.clientId = clientId;
    google.accounts.id.initialize({
      client_id: clientId,
      callback:  async (response) => {
        const result = await AuthAPI.loginWithGoogle(response.credential);
        if (result.ok) onSuccess(result.data.data);
        else Toast.error('Google Sign-In Failed', result.data.message || 'Try again.');
      },
      auto_select: false,
    });
  },

  renderButton(elementId, theme = 'outline', size = 'large') {
    const el = document.getElementById(elementId);
    if (!el || !window.google) return;
    google.accounts.id.renderButton(el, {
      theme, size, text: 'signin_with', shape: 'rectangular',
      logo_alignment: 'left',
    });
  },

  prompt() {
    if (window.google) google.accounts.id.prompt();
  },
};
