(function () {
  function getClient() {
    return window.ktrainSupabase || window.ktrainAuth?.client || null;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function load() {
    const client = getClient();
    const usersEl = document.getElementById('adminUsers');
    if (!client) {
      if (usersEl) usersEl.innerHTML = '<p class="course-admin-error">Configure Supabase in js/supabase-config.js</p>';
      return;
    }
    const ok = await window.ktrainAdminGuard?.init({ superOnly: true });
    if (!ok) return;
    const { data: { user } } = await client.auth.getUser();
    const viewerRes = user ? await client.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle() : { data: null };
    const viewerIsSuper = !!viewerRes?.data?.is_super_admin;
    if (!viewerIsSuper) return;

    const usersRes = await client.from('profiles').select('id, full_name, email, phone, college_id, role, exam_date, is_super_admin, admin_access_enabled').order('full_name');
    if (usersRes.error) throw usersRes.error;
    const users = usersRes.data || [];

    if (!usersEl) return;
    const admins = users.filter((u) => u.is_super_admin || u.role === 'admin');
    const students = users.filter((u) => !u.is_super_admin && u.role !== 'admin');

    usersEl.innerHTML = `
      <h3>Admins</h3>
      ${admins.length ? `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>${admins.map((u) => `<tr><td>${escapeHtml(u.full_name || '—')}</td><td>${escapeHtml(u.email || '—')}</td><td>${u.is_super_admin ? 'Super Admin' : 'Admin'}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="admin-placeholder">No admins yet.</p>'}

      <h3 style="margin-top:1.5rem;">Students</h3>
      ${students.length ? `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>College ID</th><th>Exam date</th><th>Role</th></tr></thead>
        <tbody>
          ${students.map((u) => `
            <tr>
              <td>${escapeHtml(u.full_name || '—')}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>${escapeHtml(u.phone || '—')}</td>
              <td>${escapeHtml(u.college_id || '—')}</td>
              <td class="admin-exam-cell">
                <input type="date" class="admin-exam-input" data-user-id="${escapeHtml(u.id)}" value="${u.exam_date ? escapeHtml(String(u.exam_date).slice(0, 10)) : ''}" />
                <button type="button" class="btn btn-secondary btn-small js-save-exam" data-user-id="${escapeHtml(u.id)}">Save</button>
              </td>
              <td>
                <select class="course-admin-input js-role-select" data-user-id="${escapeHtml(u.id)}">
                  <option value="user"${u.role === 'user' ? ' selected' : ''}>student</option>
                  <option value="alumni"${u.role === 'alumni' ? ' selected' : ''}>alumni</option>
                  <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
                  <option value="super"${u.is_super_admin ? ' selected' : ''}>super admin</option>
                </select>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : '<p class="admin-placeholder">No students yet.</p>'}
    `;

    usersEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-save-exam');
      if (!btn || !usersEl.contains(btn)) return;
      const row = btn.closest('tr');
      const input = row?.querySelector('.admin-exam-input');
      const roleSelect = row?.querySelector('.js-role-select');
      const id = btn.getAttribute('data-user-id');
      if (!id) return;

      const patch = { exam_date: input?.value || null };
      if (roleSelect?.value === 'super') {
        patch.role = 'admin';
        patch.admin_access_enabled = true;
        patch.is_super_admin = true;
      } else if (roleSelect?.value === 'admin') {
        patch.role = 'admin';
        patch.admin_access_enabled = true;
        patch.is_super_admin = false;
      } else if (roleSelect?.value === 'alumni') {
        patch.role = 'alumni';
        patch.admin_access_enabled = false;
        patch.is_super_admin = false;
      } else {
        patch.role = 'user';
        patch.admin_access_enabled = false;
        patch.is_super_admin = false;
      }

      const prev = btn.textContent;
      btn.disabled = true;
      const { error } = await client.from('profiles').update(patch).eq('id', id);
      btn.disabled = false;
      if (error) {
        alert(error.message);
        return;
      }
      btn.textContent = 'Saved';
      setTimeout(() => { btn.textContent = prev; }, 1200);
      await load();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
  } else {
    load().catch(console.error);
  }
})();
