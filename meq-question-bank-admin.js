(function () {
  const client = window.ktrainSupabase;
  const rootId = 'meqQbAdminRoot';
  let allRows = [];

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

  function parseTags(input) {
    return (input || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .filter((t, i, arr) => arr.indexOf(t) === i);
  }

  function tagsToText(tags) {
    return (Array.isArray(tags) ? tags : []).join(', ');
  }

  async function load() {
    const root = document.getElementById(rootId);
    if (!client || !root) return;
    if (!await window.ktrainAdminGuard?.init()) return;

    const { data, error } = await client.from('meq_questions').select('*').order('sort_order', { ascending: true });
    if (error) {
      root.innerHTML = '<p class="course-admin-error">' + escapeHtml(error.message) + '</p>';
      return;
    }
    allRows = data || [];
    render(root, allRows);
  }

  function render(root, rows, selectedTag) {
    const tagSet = new Set();
    (allRows || []).forEach((q) => (q.tags || []).forEach((t) => tagSet.add(t)));
    const tagOptions = ['<option value="">All tags</option>']
      .concat(Array.from(tagSet).sort().map((t) => `<option value="${escapeAttr(t)}"${selectedTag === t ? ' selected' : ''}>${escapeHtml(t)}</option>`))
      .join('');

    const items = rows.map((q) => `
      <div class="qb-admin-item" data-id="${escapeAttr(q.id)}">
        <label class="qb-admin-label">Question</label>
        <textarea class="qb-admin-textarea qb-stem" rows="5">${escapeHtml(q.stem || q.prompt_text || '')}</textarea>
        <label class="qb-admin-label">Tags (comma separated)</label>
        <input type="text" class="course-admin-input qb-tags" value="${escapeAttr(tagsToText(q.tags))}" placeholder="e.g. psychosis, risk, capacity" />
        <label class="qb-admin-label">Model answer</label>
        <textarea class="qb-admin-textarea qb-model" rows="8">${escapeHtml(q.model_answer || '')}</textarea>
        <div class="qb-admin-row">
          <label class="qb-admin-check"><input type="checkbox" class="qb-pub" ${q.is_published ? 'checked' : ''} /> Published (visible to students)</label>
          <div class="qb-admin-actions">
            <button type="button" class="btn btn-small js-qb-save">Save</button>
            <button type="button" class="btn btn-secondary btn-small js-qb-del">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    root.innerHTML = `
      <div class="qb-admin-toolbar">
        <label class="qb-admin-label">Filter by tag</label>
        <select id="qbAdminTagFilter" class="course-admin-input">${tagOptions}</select>
      </div>
      ${items}
      <p class="qb-admin-add-wrap"><button type="button" id="qbAddNew" class="btn btn-secondary">+ Add question</button></p>
    `;
  }

  async function onSave(btn) {
    const wrap = btn.closest('.qb-admin-item');
    if (!wrap) return;
    const id = wrap.getAttribute('data-id');
    const stem = wrap.querySelector('.qb-stem')?.value.trim();
    const tags = parseTags(wrap.querySelector('.qb-tags')?.value || '');
    const model_answer = wrap.querySelector('.qb-model')?.value.trim() || null;
    const is_published = !!wrap.querySelector('.qb-pub')?.checked;
    if (!stem) {
      alert('Question text cannot be empty.');
      return;
    }
    btn.disabled = true;
    const { error } = await client
      .from('meq_questions')
      .update({ stem, prompt_text: stem, tags, model_answer, is_published })
      .eq('id', id);
    btn.disabled = false;
    if (error) {
      alert(error.message);
      return;
    }
    const t = btn.textContent;
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = t; }, 1500);
  }

  async function onDelete(btn) {
    const wrap = btn.closest('.qb-admin-item');
    if (!wrap || !confirm('Delete this question permanently?')) return;
    const id = wrap.getAttribute('data-id');
    btn.disabled = true;
    const { error } = await client.from('meq_questions').delete().eq('id', id);
    btn.disabled = false;
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById(rootId);
    if (!root) return;

    root.addEventListener('click', async (e) => {
      if (e.target.id === 'qbAddNew') {
        const btn = e.target;
        btn.disabled = true;
        const { error } = await client.from('meq_questions').insert({
          stem: 'New question',
          prompt_text: 'New question',
          tags: [],
          model_answer: '',
          is_published: false,
          sort_order: Math.floor(Date.now() / 1000)
        });
        btn.disabled = false;
        if (error) {
          alert(error.message);
          return;
        }
        await load();
        return;
      }
      if (e.target.id === 'qbAdminTagFilter') {
        const selected = e.target.value;
        const rows = selected ? allRows.filter((q) => (q.tags || []).includes(selected)) : allRows;
        render(root, rows, selected);
        return;
      }
      if (e.target.closest('.js-qb-save')) onSave(e.target.closest('.js-qb-save'));
      if (e.target.closest('.js-qb-del')) onDelete(e.target.closest('.js-qb-del'));
    });

    root.addEventListener('change', (e) => {
      if (e.target.id !== 'qbAdminTagFilter') return;
      const selected = e.target.value;
      const rows = selected ? allRows.filter((q) => (q.tags || []).includes(selected)) : allRows;
      render(root, rows, selected);
    });

    load().catch(console.error);
  });
})();
