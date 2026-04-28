(function () {
  function getClient() {
    return window.ktrainSupabase || window.ktrainAuth?.client || null;
  }

  let currentUserId = null;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  let allProfiles = [];

  function hasAdminAccess(p) {
    return !!p?.is_super_admin || (p?.role === 'admin' && p?.admin_access_enabled === true);
  }

  function renderAdminList() {
    const root = document.getElementById('adminAccountListRoot');
    if (!root) return;
    const admins = allProfiles.filter(hasAdminAccess);
    if (!admins.length) {
      root.innerHTML = '<p class="admin-placeholder">No admins found.</p>';
      return;
    }
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Action</th></tr></thead>
        <tbody>
          ${admins.map((p) => `
            <tr>
              <td>${escapeHtml(p.full_name || '—')}</td>
              <td>${escapeHtml(p.email || '—')}</td>
              <td>${p.is_super_admin ? 'Super Admin' : 'Admin'}</td>
              <td>
                ${p.is_super_admin
                  ? '<span>Protected</span>'
                  : (p.id === currentUserId
                    ? '<span>Current user</span>'
                    : `<button type="button" class="btn btn-secondary btn-small js-demote-admin" data-id="${escapeHtml(p.id)}">Demote to student</button>`)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderUserDirectory() {
    const root = document.getElementById('adminUserDirectoryRoot');
    const query = (document.getElementById('adminUserSearch')?.value || '').trim().toLowerCase();
    if (!root) return;
    let rows = allProfiles.slice();
    if (query) {
      rows = rows.filter((p) => (p.full_name || '').toLowerCase().includes(query) || (p.email || '').toLowerCase().includes(query));
    }
    if (!rows.length) {
      root.innerHTML = '<p class="admin-placeholder">No users match this search.</p>';
      return;
    }
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Current role</th><th>Action</th></tr></thead>
        <tbody>
          ${rows.map((p) => `
            <tr>
              <td>${escapeHtml(p.full_name || '—')}</td>
              <td>${escapeHtml(p.email || '—')}</td>
              <td>${p.is_super_admin ? 'Super Admin' : (hasAdminAccess(p) ? 'Admin' : 'Student')}</td>
              <td>
                ${hasAdminAccess(p)
                  ? '<span>Already admin</span>'
                  : `<button type="button" class="btn btn-secondary btn-small js-promote-admin" data-id="${escapeHtml(p.id)}">Promote to admin</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function promoteById(id) {
    const client = getClient();
    const { error } = await client.from('profiles').update({
      role: 'admin',
      admin_access_enabled: true
    }).eq('id', id);
    if (error) throw error;
    await loadData();
  }

  async function demoteById(id) {
    const client = getClient();
    const { error } = await client.from('profiles').update({
      role: 'user',
      admin_access_enabled: false
    }).eq('id', id);
    if (error) throw error;
    await loadData();
  }

  async function loadData() {
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, email, role, admin_access_enabled, is_super_admin')
      .order('full_name');
    if (error) throw error;
    allProfiles = data || [];
    renderAdminList();
    renderUserDirectory();
  }

  async function init() {
    const client = getClient();
    if (!client) return;
    const ok = await window.ktrainAdminGuard?.init();
    if (!ok) return;
    const { data: { user } } = await client.auth.getUser();
    currentUserId = user?.id || null;

    try {
      await loadData();
    } catch (err) {
      const msg = err?.message || String(err);
      const listRoot = document.getElementById('adminAccountListRoot');
      const dirRoot = document.getElementById('adminUserDirectoryRoot');
      const errHtml = '<p class="course-admin-error" role="alert">Could not load user list: ' + escapeHtml(msg) + '</p>';
      if (listRoot) listRoot.innerHTML = errHtml;
      if (dirRoot) dirRoot.innerHTML = errHtml;
      console.error(err);
    }

    document.getElementById('adminUserSearch')?.addEventListener('input', renderUserDirectory);

    document.getElementById('adminUserDirectoryRoot')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-promote-admin');
      if (!btn) return;
      btn.disabled = true;
      try {
        await promoteById(btn.getAttribute('data-id'));
      } catch (err) {
        alert(err.message || 'Failed to promote user.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('adminAccountListRoot')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-demote-admin');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id || id === currentUserId) return;
      if (!confirm('Demote this admin to student?')) return;
      btn.disabled = true;
      try {
        await demoteById(id);
      } catch (err) {
        alert(err.message || 'Failed to demote admin.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('adminInviteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('adminInviteMessage');
      if (msg) msg.textContent = '';
      const email = (document.getElementById('adminInviteEmail')?.value || '').trim().toLowerCase();
      const user = allProfiles.find((p) => (p.email || '').toLowerCase() === email);
      if (!user) {
        if (msg) msg.textContent = 'No registered user found with that email.';
        return;
      }
      if (hasAdminAccess(user)) {
        if (msg) msg.textContent = 'That user already has admin access.';
        return;
      }
      try {
        await promoteById(user.id);
        if (msg) msg.textContent = 'Admin access granted.';
      } catch (err) {
        if (msg) msg.textContent = err.message || 'Invite failed.';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
})();
