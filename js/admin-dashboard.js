(function () {
  function getClient() {
    return window.ktrainSupabase || window.ktrainAuth?.client || null;
  }

  let currentUserId = null;
  let viewerIsSuper = false;
  let allProfiles = [];
  let allCourses = [];
  let allEnrollments = [];

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function hasAdminAccess(p) {
    return !!p?.is_super_admin || p?.role === 'admin';
  }

  function roleLabel(p) {
    if (p?.is_super_admin) return 'Super Admin';
    if (p?.role === 'admin') return 'Admin';
    if (p?.role === 'alumni') return 'Alumni';
    return 'Student';
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
              <td>${roleLabel(p)}</td>
              <td>${(!viewerIsSuper || p.id === currentUserId) ? '<span>Current user</span>' : `<button type="button" class="btn btn-secondary btn-small js-demote-admin" data-id="${escapeHtml(p.id)}">Demote</button>`}</td>
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
    if (query) rows = rows.filter((p) => (p.full_name || '').toLowerCase().includes(query) || (p.email || '').toLowerCase().includes(query));
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
              <td>${roleLabel(p)}</td>
              <td>
                ${!viewerIsSuper ? '<span>Restricted</span>' : `
                  <select class="course-admin-input js-role-target" data-id="${escapeHtml(p.id)}">
                    <option value="user"${(p.role !== 'admin' && p.role !== 'alumni' && !p.is_super_admin) ? ' selected' : ''}>Student</option>
                    <option value="alumni"${p.role === 'alumni' ? ' selected' : ''}>Alumni</option>
                    <option value="admin"${(p.role === 'admin' && !p.is_super_admin) ? ' selected' : ''}>Admin</option>
                    <option value="super"${p.is_super_admin ? ' selected' : ''}>Super Admin</option>
                  </select>
                  <button type="button" class="btn btn-secondary btn-small js-apply-role" data-id="${escapeHtml(p.id)}">Apply</button>
                `}
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
    if (targetRole === 'alumni') patch = { role: 'alumni', admin_access_enabled: false, is_super_admin: false };
    if (targetRole === 'admin') patch = { role: 'admin', admin_access_enabled: true, is_super_admin: false };
    if (targetRole === 'super') patch = { role: 'admin', admin_access_enabled: true, is_super_admin: true };
    const { error } = await client.from('profiles').update(patch).eq('id', id);
    if (error) throw error;
    await loadData();
  }

  async function loadData() {
    const client = getClient();
    if (!client) throw new Error('Supabase client is not available.');
    const [profilesRes, coursesRes, enrollmentsRes] = await Promise.all([
      client.from('profiles').select('id, full_name, email, phone, college_id, role, is_super_admin, admin_access_enabled').order('full_name'),
      client.from('courses').select('id, title, slug, description, start_date, end_date, is_open').order('start_date', { ascending: true }),
      client.from('enrollments').select('id, user_id, course_id, status, enrolled_at, profiles(full_name,email,phone,college_id), courses(title,slug)').order('enrolled_at', { ascending: false })
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (coursesRes.error) throw coursesRes.error;
    if (enrollmentsRes.error) throw enrollmentsRes.error;
    allProfiles = profilesRes.data || [];
    allCourses = coursesRes.data || [];
    allEnrollments = enrollmentsRes.data || [];
    renderAdminList();
    renderCourses();
    renderEnrollments();
    renderUserDirectory();
  }

  function renderCourses() {
    const root = document.getElementById('adminCourseRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="profile-form" style="max-width: 780px;">
        <div class="profile-form-row"><label for="courseTitle">Title</label><input id="courseTitle" type="text" placeholder="e.g. MEQ Intensive 2026" /></div>
        <div class="profile-form-row"><label for="courseSlug">Slug</label><input id="courseSlug" type="text" placeholder="e.g. meq-intensive-2026" /></div>
        <div class="profile-form-row"><label for="courseDescription">Description</label><input id="courseDescription" type="text" placeholder="Short course summary" /></div>
        <div class="profile-form-row"><label for="courseStart">Start date</label><input id="courseStart" type="date" /></div>
        <div class="profile-form-row"><label for="courseEnd">End date</label><input id="courseEnd" type="date" /></div>
        <div class="profile-form-row"><label><input id="courseOpen" type="checkbox" checked /> Open for registration</label></div>
        <button type="button" class="btn btn-small js-create-course">Create course</button>
      </div>
      ${allCourses.length ? `
        <table class="admin-table" style="margin-top:1rem;">
          <thead><tr><th>Title</th><th>Slug</th><th>Dates</th><th>Open</th><th>Action</th></tr></thead>
          <tbody>
            ${allCourses.map((c) => `
              <tr>
                <td><input class="course-admin-input js-course-title" data-id="${escapeHtml(c.id)}" value="${escapeHtml(c.title || '')}" /></td>
                <td><input class="course-admin-input js-course-slug" data-id="${escapeHtml(c.id)}" value="${escapeHtml(c.slug || '')}" /></td>
                <td>
                  <input type="date" class="course-admin-input js-course-start" data-id="${escapeHtml(c.id)}" value="${escapeHtml(c.start_date || '')}" />
                  <input type="date" class="course-admin-input js-course-end" data-id="${escapeHtml(c.id)}" value="${escapeHtml(c.end_date || '')}" />
                </td>
                <td><input type="checkbox" class="js-course-open" data-id="${escapeHtml(c.id)}" ${c.is_open ? 'checked' : ''} /></td>
                <td><button type="button" class="btn btn-secondary btn-small js-save-course" data-id="${escapeHtml(c.id)}">Save</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="admin-placeholder">No courses yet.</p>'}
    `;
  }

  function renderEnrollments() {
    const root = document.getElementById('adminEnrollmentRoot');
    if (!root) return;
    if (!allEnrollments.length) {
      root.innerHTML = '<p class="admin-placeholder">No enrollments yet.</p>';
      return;
    }
    root.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Student</th><th>Email</th><th>Phone</th><th>College ID</th><th>Course</th><th>Status</th><th>Enrolled</th></tr></thead>
        <tbody>
          ${allEnrollments.map((e) => `
            <tr>
              <td>${escapeHtml(e.profiles?.full_name || '—')}</td>
              <td>${escapeHtml(e.profiles?.email || '—')}</td>
              <td>${escapeHtml(e.profiles?.phone || '—')}</td>
              <td>${escapeHtml(e.profiles?.college_id || '—')}</td>
              <td>${escapeHtml(e.courses?.title || e.course_id || '—')}</td>
              <td>${escapeHtml(e.status || 'active')}</td>
              <td>${escapeHtml((e.enrolled_at || '').slice(0, 10))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function init() {
    const ok = await window.ktrainAdminGuard?.init({ superOnly: false });
    if (!ok) return;
    const client = getClient();
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    currentUserId = user.id;
    const viewer = await client.from('profiles').select('is_super_admin').eq('id', currentUserId).maybeSingle();
    viewerIsSuper = !!viewer?.data?.is_super_admin;

    try {
      await loadData();
    } catch (err) {
      const msg = err?.message || String(err);
      const listRoot = document.getElementById('adminAccountListRoot');
      const dirRoot = document.getElementById('adminUserDirectoryRoot');
      const errHtml = '<p class="course-admin-error" role="alert">Could not load user list: ' + escapeHtml(msg) + '</p>';
      if (listRoot) listRoot.innerHTML = errHtml;
      if (dirRoot) dirRoot.innerHTML = errHtml;
    }

    document.getElementById('adminUserSearch')?.addEventListener('input', renderUserDirectory);
    document.getElementById('adminCourseRoot')?.addEventListener('click', async (e) => {
      const client = getClient();
      if (!client) return;
      const createBtn = e.target.closest('.js-create-course');
      if (createBtn) {
        createBtn.disabled = true;
        try {
          const title = document.getElementById('courseTitle')?.value.trim();
          const slug = document.getElementById('courseSlug')?.value.trim();
          const description = document.getElementById('courseDescription')?.value.trim();
          const start_date = document.getElementById('courseStart')?.value || null;
          const end_date = document.getElementById('courseEnd')?.value || null;
          const is_open = !!document.getElementById('courseOpen')?.checked;
          if (!title || !slug) throw new Error('Course title and slug are required.');
          const { error } = await client.from('courses').insert({ title, slug, description: description || null, start_date, end_date, is_open });
          if (error) throw error;
          await loadData();
        } catch (err) {
          alert(err?.message || 'Failed to create course.');
        } finally {
          createBtn.disabled = false;
        }
        return;
      }
      const saveBtn = e.target.closest('.js-save-course');
      if (!saveBtn) return;
      saveBtn.disabled = true;
      try {
        const id = saveBtn.getAttribute('data-id');
        const title = document.querySelector('.js-course-title[data-id="' + id + '"]')?.value.trim();
        const slug = document.querySelector('.js-course-slug[data-id="' + id + '"]')?.value.trim();
        const start_date = document.querySelector('.js-course-start[data-id="' + id + '"]')?.value || null;
        const end_date = document.querySelector('.js-course-end[data-id="' + id + '"]')?.value || null;
        const is_open = !!document.querySelector('.js-course-open[data-id="' + id + '"]')?.checked;
        const { error } = await client.from('courses').update({ title, slug, start_date, end_date, is_open }).eq('id', id);
        if (error) throw error;
        await loadData();
      } catch (err) {
        alert(err?.message || 'Failed to save course.');
      } finally {
        saveBtn.disabled = false;
      }
    });
    document.getElementById('adminUserDirectoryRoot')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-apply-role');
      if (!btn || !viewerIsSuper) return;
      btn.disabled = true;
      try {
        const row = btn.closest('tr');
        const select = row?.querySelector('.js-role-target');
        await setRoleById(btn.getAttribute('data-id'), select?.value || 'user');
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

  }

  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
})();
