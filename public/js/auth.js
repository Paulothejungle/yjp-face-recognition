// ============================================================
// AUTH.JS — Login, Guard, Logout, Token management
// ============================================================
const API = '';

const Auth = {
  getToken: () => localStorage.getItem('yjp_token'),
  getUser: () => JSON.parse(localStorage.getItem('yjp_user') || 'null'),
  getRole: () => localStorage.getItem('yjp_role'),
  isLoggedIn: () => !!localStorage.getItem('yjp_token'),

  save(token, role, user) {
    localStorage.setItem('yjp_token', token);
    localStorage.setItem('yjp_role', role);
    if (user) localStorage.setItem('yjp_user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('yjp_token');
    localStorage.removeItem('yjp_role');
    localStorage.removeItem('yjp_user');
  },

  async apiCall(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {})
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        Auth.clear();
        window.location.replace('/login.html');
      }
      throw new Error(data.error || 'Request gagal');
    }
    return data;
  },

  async login(email, password) {
    const data = await this.apiCall('POST', '/api/auth/login', { email, password });
    this.save(data.token, data.role, data.user);
    return data;
  },

  logout() {
    this.clear();
    window.location.replace('/login.html');
  },

  // Guard: redirect jika belum login
  requireAuth(redirectTo = '/login.html') {
    if (!this.isLoggedIn()) {
      window.location.replace(redirectTo);
      return false;
    }
    return true;
  },

  // Guard: redirect jika bukan admin
  requireAdmin() {
    if (!this.requireAuth()) return false;
    if (this.getRole() !== 'admin') {
      window.location.replace('/absensi.html');
      return false;
    }
    return true;
  },

  // Redirect setelah login berdasarkan role
  redirectByRole(forcedRole = null) {
    const role = forcedRole || this.getRole();
    window.location.replace(role === 'admin' ? '/index.html' : '/absensi.html');
  }
};

// ============================================================
// TOAST — Notifikasi popup
// ============================================================
function showToast(type, title, msg, duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.4s forwards';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ============================================================
// CLOCK — Jam & tanggal real-time
// ============================================================
function startClock(el) {
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// RENDER NAVBAR
// ============================================================
function renderNavbar(activePage) {
  const user = Auth.getUser();
  const role = Auth.getRole();
  const initial = user?.name ? user.name[0].toUpperCase() : '?';

  const adminLinks = role === 'admin' ? `
    <a href="/index.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      <span>Dashboard</span>
    </a>
    <a href="/admin.html" class="nav-link ${activePage === 'admin' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span>Admin</span>
    </a>
    <a href="/laporan.html" class="nav-link ${activePage === 'laporan' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      <span>Laporan</span>
    </a>
  ` : `
    <a href="/riwayat.html" class="nav-link ${activePage === 'riwayat' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>Riwayat</span>
    </a>
  `;

  return `
    <nav class="navbar">
      <a href="${role === 'admin' ? '/index.html' : '/absensi.html'}" class="navbar-brand">
        <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:white;">Y</div>
        <div class="navbar-brand-text">
          <span class="company">PT. YUDANTA JAYA PUTRA</span>
          <span class="tagline">SISTEM ABSENSI</span>
        </div>
      </a>
      <div class="navbar-nav">
        ${adminLinks}
        <a href="/absensi.html" class="nav-link ${activePage === 'absensi' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Absensi</span>
        </a>
      </div>
      <div class="navbar-user" style="display:flex;align-items:center;gap:12px;">
        <div style="text-align:right;display:none;" class="user-info-text" id="nav-user-info">
          <div style="font-size:13px;font-weight:600;">${user?.name || 'User'}</div>
          <div style="font-size:11px;color:var(--text-3);">${role === 'admin' ? '👑 Admin' : '👤 Karyawan'}</div>
        </div>
        <div class="user-avatar" title="${user?.name}" style="cursor:default;">
          ${user?.photo_url ? `<img src="${user.photo_url}" alt="${user.name}">` : initial}
        </div>
        <button type="button" id="nav-btn-logout" class="btn btn-ghost btn-sm" style="padding:6px 12px;color:#ef4444;border-color:var(--border);display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span class="logout-text">Logout</span>
        </button>
      </div>
    </nav>
  `;
}

window.Auth = Auth;
window.showToast = showToast;
window.startClock = startClock;
window.renderNavbar = renderNavbar;

// Mencegah user menggunakan back button untuk kembali ke halaman setelah logout
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    window.location.reload();
  }
});

// Event Delegation untuk tombol logout agar aman dari blokir CSP
document.addEventListener('click', function(e) {
  const logoutBtn = e.target.closest('#nav-btn-logout');
  if (logoutBtn) {
    Auth.clear();
    window.location.replace('/login.html');
  }
});
