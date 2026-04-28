(function () {
  function getClient() {
    return window.ktrainSupabase || window.ktrainAuth?.client || null;
  }

  let currentUserId = null;
  let viewerIsSuper = false;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  let allProfiles = [];

  function hasAdminAccess(p) {
    return !!p?.is_super_admin || p?.role === 'admin';
  }

  function renderAdminList() {
    const root = document.getElementById('adminAccountListRoot');
    if (!root) return;
    const admins = allProfiles.filter(hasAdminAccess);
    if (!admins.length) {
      root.innerHTML = '<p class="admin-placeholder">No admins yet.</p>';
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
                ${(!viewerIsSuper || p.id === currentUserId)
                  ? '<span>Current user</span>'
                  : `<button type="button" class="btn btn-secondary btn-small js-demote-admin" data-id="${escapeHtml(p.id)}">Demote</button>`}
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
      root.innerHTML = '<p class="admin-placeholder">No students/admins yet.</p>';
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
                ${!viewerIsSuper
                  ? '<span>Restricted</span>'
                  : `<select class="course-admin-input js-role-target" data-id="${escapeHtml(p.id)}">
                      <option value="user"${(!hasAdminAccess(p)) ? ' selected' : ''}>Student</option>
                      <option value="admin"${(p.role === 'admin' && !p.is_super_admin) ? ' selected' : ''}>Admin</option>
                      <option value="super"${p.is_super_admin ? ' selected' : ''}>Super Admin</option>
                    </select>
                    <button type="button" class="btn btn-secondary btn-small js-apply-role" data-id="${escapeHtml(p.id)}">Apply</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function setRoleById(id, targetRole) {
    const client = getClient();
    let patch = { role: 'user', admin_access_enabled: false, is_super_admin: false };
    if (targetRole === 'admin') patch = { role: 'admin', admin_access_enabled: true, is_super_admin: false };
    if (targetRole === 'super') patch = { role: 'admin', admin_access_enabled: true, is_super_admin: true };
    const { error } = await client.from('profiles').update(patch).eq('id', id);
    if (error) throw error;
    await loadData();
  }

  async function loadData() {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not available.');
    const { data, error } = await client
      .from('profiles')
      .select('id, full_name, email, role, is_super_admin, admin_access_enabled')
      .order('full_name');
    if (error) throw error;
    allProfiles = data || [];
    renderAdminList();
    renderUserDirectory();
  }

  async function init() {
    const ok = await window.ktrainAdminGuard?.init({ superOnly: true });
    if (!ok) return;
    const client = getClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    currentUserId = user?.id || null;
    const viewer = await client.from('profiles').select('is_super_admin').eq('id', currentUserId).maybeSingle();
    viewerIsSuper = !!viewer?.data?.is_super_admin;
    if (!viewerIsSuper) return;

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
      const btn = e.target.closest('.js-apply-role');
      if (!btn || !viewerIsSuper) return;
      btn.disabled = true;
      try {
        const row = btn.closest('tr');
        const select = row?.querySelector('.js-role-target');
        const targetRole = select?.value || 'user';
        await setRoleById(btn.getAttribute('data-id'), targetRole);
      } catch (err) {
        alert(err.message || 'Failed to update role.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('adminAccountListRoot')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-demote-admin');
      if (!btn || !viewerIsSuper) return;
      const id = btn.getAttribute('data-id');
      if (!id || id === currentUserId) return;
      if (!confirm('Demote this account to student?')) return;
      btn.disabled = true;
      try {
        await setRoleById(id, 'user');
      } catch (err) {
        alert(err.message || 'Failed to demote admin.');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('adminInviteForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!viewerIsSuper) return;
      const msg = document.getElementById('adminInviteMessage');
      if (msg) msg.textContent = '';
      const email = (document.getElementById('adminInviteEmail')?.value || '').trim().toLowerCase();
      const user = allProfiles.find((p) => (p.email || '').toLowerCase() === email);
      if (!user) {
        if (msg) msg.textContent = 'No registered user found with that email.';
        return;
      }
      try {
        await setRoleById(user.id, 'admin');
        if (msg) msg.textContent = 'Admin access granted.';
      } catch (err) {
        if (msg) msg.textContent = err.message || 'Invite failed.';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
})();
