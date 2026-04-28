(function () {
  const client = window.ktrainSupabase;
  const COURSE_LABELS = {
    'meq-12': 'MEQ 12-week programme'
  };

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  async function load() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : '../login/';
      const back = window.location.pathname + window.location.search;
      window.location.href = login + '?redirect=' + encodeURIComponent(back);
      return;
    }

    const [profileRes, enrollRes] = await Promise.all([
      client.from('profiles').select('*').eq('id', user.id).single(),
      client.from('enrollments').select('course_id, start_date').eq('user_id', user.id)
    ]);

    const profile = profileRes.data;
    const enrollments = enrollRes.data || [];

    document.getElementById('profileEmail') && (document.getElementById('profileEmail').textContent = user.email || '—');

    const fn = document.getElementById('full_name');
    const ph = document.getElementById('phone');
    const cid = document.getElementById('college_id');
    if (fn) fn.value = profile?.full_name || '';
    if (ph) ph.value = profile?.phone || '';
    if (cid) cid.value = profile?.college_id || '';

    const examEl = document.getElementById('profileExamReadonly');
    if (examEl) {
      examEl.textContent = profile?.exam_date
        ? formatDate(profile.exam_date)
        : 'Not set yet—your administrator will add this.';
    }

    const enrollEl = document.getElementById('profileEnrollments');
    if (enrollEl) {
      if (!enrollments.length) {
        enrollEl.innerHTML = '<p class="profile-enroll-empty">You are not enrolled in a course yet. Contact your administrator if this is unexpected.</p>';
      } else {
        enrollEl.innerHTML = enrollments.map(e => `
          <div class="profile-enroll-card">
            <div class="profile-enroll-title">${escapeHtml(COURSE_LABELS[e.course_id] || e.course_id)}</div>
            <div class="profile-enroll-meta">Started <strong>${formatDate(e.start_date)}</strong></div>
          </div>
        `).join('');
      }
    }
  }

  async function save(e) {
    e.preventDefault();
    const errEl = document.getElementById('profileError');
    const okEl = document.getElementById('profileSaved');
    if (errEl) errEl.textContent = '';
    if (okEl) okEl.textContent = '';

    const { data: { user } } = await client.auth.getUser();
    if (!user || !window.ktrainAuth?.updateProfile) return;

    try {
      await window.ktrainAuth.updateProfile(user.id, {
        full_name: document.getElementById('full_name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        college_id: document.getElementById('college_id').value.trim()
      });
      if (okEl) okEl.textContent = 'Saved.';
      setTimeout(() => { if (okEl) okEl.textContent = ''; }, 3000);
    } catch (x) {
      if (errEl) errEl.textContent = x.message || 'Could not save.';
    }
  }

  if (!client) {
    const pe = document.getElementById('profileError');
    if (pe) pe.textContent = 'Configure Supabase in js/supabase-config.js';
    return;
  }

  document.getElementById('profileForm')?.addEventListener('submit', save);

  document.getElementById('profileFooterLogout')?.addEventListener('click', async () => {
    if (window.ktrainAuth) await window.ktrainAuth.signOut();
    const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : '../login/';
    window.location.href = login;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
  } else {
    load().catch(console.error);
  }
})();
