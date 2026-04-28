(function () {
  const client = window.ktrainSupabase;
  const COURSE_ID = 'meq-12';

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  let weekIdByNumber = {};
  let rootEl = null;

  async function load() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const base = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.meqCourse() : 'meq-course/';
      const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      const target = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      window.location.href = login + '?redirect=' + encodeURIComponent(target);
      return;
    }

    const { data: weeks, error: wErr } = await client.from('course_weeks').select('id, week_number').eq('course_id', COURSE_ID);
    if (wErr) {
      rootEl && (rootEl.innerHTML = '<p class="course-admin-error">' + escapeHtml(wErr.message) + '</p>');
      return;
    }

    weekIdByNumber = {};
    (weeks || []).forEach(w => { weekIdByNumber[w.week_number] = w.id; });

    const { data: rows, error: cErr } = await client
      .from('week_content')
      .select('id, title, url, sort_order, week_id, course_weeks(week_number)')
      .order('sort_order');

    if (cErr) {
      rootEl && (rootEl.innerHTML = '<p class="course-admin-error">' + escapeHtml(cErr.message) + '</p>');
      return;
    }

    const byWeek = {};
    (rows || []).forEach(c => {
      const w = c.course_weeks?.week_number;
      if (w == null) return;
      if (!byWeek[w]) byWeek[w] = [];
      byWeek[w].push(c);
    });

    render(byWeek);
  }

  function render(byWeek) {
    if (!rootEl) return;
    let html = '';
    for (let w = 1; w <= 12; w++) {
      const items = (byWeek[w] || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      html += `
        <div class="admin-week course-admin-week" data-week-num="${w}">
          <h3>Week ${w}</h3>
          <div class="admin-week-content">
            ${items.length ? items.map(c => `
              <div class="course-admin-item" data-id="${escapeAttr(c.id)}">
                <div class="course-admin-fields">
                  <label class="course-admin-label">Title
                    <input type="text" class="course-admin-input ca-title" value="${escapeAttr(c.title)}" />
                  </label>
                  <label class="course-admin-label">Link URL
                    <input type="url" class="course-admin-input ca-url" value="${escapeAttr(c.url || '')}" placeholder="https://…" />
                  </label>
                </div>
                <div class="course-admin-actions">
                  <button type="button" class="btn btn-small js-ca-save">Save</button>
                  <button type="button" class="btn btn-secondary btn-small js-ca-delete">Remove</button>
                </div>
              </div>
            `).join('') : '<p class="admin-placeholder">No items yet. Add one below.</p>'}
            <button type="button" class="btn btn-secondary btn-small js-ca-add" data-week="${w}">+ Add item</button>
          </div>
        </div>
      `;
    }
    rootEl.innerHTML = html;
  }

  async function onSave(btn) {
    const item = btn.closest('.course-admin-item');
    if (!item) return;
    const id = item.getAttribute('data-id');
    const title = item.querySelector('.ca-title')?.value.trim();
    const urlRaw = item.querySelector('.ca-url')?.value.trim();
    if (!title) {
      alert('Please enter a title.');
      return;
    }
    btn.disabled = true;
    const { error } = await client.from('week_content').update({
      title,
      url: urlRaw || null
    }).eq('id', id);
    btn.disabled = false;
    if (error) {
      alert(error.message);
      return;
    }
    const prev = btn.textContent;
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = prev; }, 1500);
  }

  async function onDelete(btn) {
    const item = btn.closest('.course-admin-item');
    if (!item || !confirm('Remove this item from the course?')) return;
    const id = item.getAttribute('data-id');
    btn.disabled = true;
    const { error } = await client.from('week_content').delete().eq('id', id);
    btn.disabled = false;
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  async function onAdd(btn) {
    const w = parseInt(btn.getAttribute('data-week'), 10);
    const weekId = weekIdByNumber[w];
    if (!weekId) {
      alert('Week is not set up in the database. Run the schema seed for course_weeks.');
      return;
    }
    const weekEl = btn.closest('.course-admin-week');
    const existing = weekEl ? weekEl.querySelectorAll('.course-admin-item').length : 0;
    btn.disabled = true;
    const { error } = await client.from('week_content').insert({
      week_id: weekId,
      title: 'New item',
      url: null,
      sort_order: existing * 10
    });
    btn.disabled = false;
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('.js-ca-save')) onSave(t.closest('.js-ca-save'));
    else if (t.closest('.js-ca-delete')) onDelete(t.closest('.js-ca-delete'));
    else if (t.closest('.js-ca-add')) onAdd(t.closest('.js-ca-add'));
  }

  if (!client) {
    const el = document.getElementById('courseAdminContent');
    if (el) el.innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>';
    return;
  }

  rootEl = document.getElementById('courseAdminContent');
  if (!rootEl) return;

  rootEl.addEventListener('click', onClick);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
  } else {
    load().catch(console.error);
  }
})();
