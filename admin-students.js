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
    const ok = await window.ktrainAdminGuard?.init();
    if (!ok) return;
    const { data: { user } } = await client.auth.getUser();
    const viewerRoleRes = user
      ? await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : { data: null };
    const viewerIsAdmin = viewerRoleRes?.data?.role === 'admin';

    let users = [];
    let enrolledIds = new Set();
    let startDateByUser = {};
    const usersRes = await client.from('profiles').select('id, full_name, email, phone, college_id, role, exam_date').order('full_name');
    if (usersRes.error) throw usersRes.error;
    users = usersRes.data || [];

    const enrollRes = await client.from('enrollments').select('user_id, course_id, start_date');
    if (!enrollRes.error) {
      const enrollments = (enrollRes.data || []).filter((e) => e.course_id === 'meq-12');
      enrolledIds = new Set(enrollments.map((e) => e.user_id));
      startDateByUser = enrollments.reduce((acc, e) => {
        acc[e.user_id] = e.start_date;
        return acc;
      }, {});
    }

    users = users.map((p) => ({
      ...p,
      enrolled: enrolledIds.has(p.id),
      start_date: startDateByUser[p.id] || null
    }));

    if (!usersEl) return;
    const admins = users.filter((u) => u.role === 'admin');
    const students = users.filter((u) => u.role !== 'admin');

    usersEl.innerHTML = `
      <h3>Admins</h3>
      ${admins.length ? `
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            ${admins.map((u) => `
              <tr>
                <td>${escapeHtml(u.full_name || '—')}</td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td>Admin</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="admin-placeholder">No admins yet.</p>'}

      <h3 style="margin-top:1.5rem;">Students</h3>
      ${students.length ? `
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>College ID</th><th>Exam date</th><th>Role</th><th>Enrolled</th><th>Start date</th></tr></thead>
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
                  ${viewerIsAdmin ? `<select class="course-admin-input js-role-select" data-user-id="${escapeHtml(u.id)}">
                    <option value="user"${u.role === 'user' ? ' selected' : ''}>student</option>
                    <option value="admin"${u.role === 'admin' ? ' selected' : ''}>admin</option>
                  </select>` : 'Student'}
                </td>
                <td>${u.enrolled ? 'Yes' : 'No'}</td>
                <td>${u.start_date ? u.start_date : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="admin-placeholder">No students yet.</p>'}
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
      if (viewerIsAdmin) {
        const roleSelect = row.querySelector('.js-role-select');
        if (roleSelect) patch.role = roleSelect.value;
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
      await load();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
  } else {
    load().catch(console.error);
  }
})();
