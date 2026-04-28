(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    document.getElementById('adminUsers') && (document.getElementById('adminUsers').innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>');
    return;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function load() {
    const ok = await window.ktrainAdminGuard?.init();
    if (!ok) return;
    const { data: { user } } = await client.auth.getUser();
    const viewerProfile = user ? await (window.ktrainAuth?.getProfile ? window.ktrainAuth.getProfile(user.id) : client.from('profiles').select('*').eq('id', user.id).single().then(r => r.data)) : null;
    const viewerIsSuper = !!viewerProfile?.is_super_admin;

    const [usersRes, enrollRes] = await Promise.all([
      client.from('profiles').select('id, full_name, email, phone, college_id, role, exam_date, admin_access_enabled, is_super_admin').order('full_name'),
      client.from('enrollments').select('user_id, course_id, start_date')
    ]);

    const enrollments = (enrollRes.data || []).filter(e => e.course_id === 'meq-12');
    const enrolledIds = new Set(enrollments.map(e => e.user_id));
    const users = (usersRes.data || []).map(p => ({
      ...p,
      enrolled: enrolledIds.has(p.id),
      start_date: enrollments.find(e => e.user_id === p.id)?.start_date
    }));

    const usersEl = document.getElementById('adminUsers');
    if (!usersEl) return;

    usersEl.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>College ID</th><th>Exam date</th>${viewerIsSuper ? '<th>Role</th><th>Access</th>' : ''}<th>Enrolled</th><th>Start date</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${escapeHtml(u.full_name || '—')}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>${escapeHtml(u.phone || '—')}</td>
              <td>${escapeHtml(u.college_id || '—')}</td>
              <td class="admin-exam-cell">
                <input type="date" class="admin-exam-input" data-user-id="${escapeHtml(u.id)}" value="${u.exam_date ? escapeHtml(String(u.exam_date).slice(0, 10)) : ''}" />
                <button type="button" class="btn btn-secondary btn-small js-save-exam" data-user-id="${escapeHtml(u.id)}">Save</button>
              </td>
              ${viewerIsSuper ? `
                <td>
                  ${u.is_super_admin
                    ? '<strong>Super Admin</strong>'
                    : `<select class="course-admin-input js-role-select" data-user-id="${escapeHtml(u.id)}">
                        <option value="user"${u.role === 'user' ? ' selected' : ''}>user</option>
                        <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
                      </select>`}
                </td>
                <td>
                  ${u.is_super_admin
                    ? '<span>Always allowed</span>'
                    : `<label><input type="checkbox" class="js-admin-access" data-user-id="${escapeHtml(u.id)}" ${u.admin_access_enabled ? 'checked' : ''} /> Admin access granted</label>`}
                </td>
              ` : ''}
              <td>${u.enrolled ? 'Yes' : 'No'}</td>
              <td>${u.start_date ? u.start_date : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    usersEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-save-exam');
      if (!btn || !usersEl.contains(btn)) return;
      const row = btn.closest('tr');
      const input = row && row.querySelector('.admin-exam-input');
      const exam_date = input && input.value ? input.value : null;
      const id = btn.getAttribute('data-user-id');
      if (!id) return;
      const patch = { exam_date };
      if (viewerIsSuper) {
        const roleSelect = row.querySelector('.js-role-select');
        const accessCheck = row.querySelector('.js-admin-access');
        if (roleSelect) patch.role = roleSelect.value;
        if (accessCheck) patch.admin_access_enabled = !!accessCheck.checked;
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
      setTimeout(() => { btn.textContent = prev; }, 2000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
  } else {
    load().catch(console.error);
  }
})();
