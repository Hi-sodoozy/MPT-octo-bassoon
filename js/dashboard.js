(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    renderWithFallback();
    return;
  }

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  let profile = null;
  let enrollment = null;
  let enrolledCourse = null;
  let availableCourses = [];
  let weekContent = [];
  let weekTaskCompletions = {};
  let currentUserId = null;

  function getCurrentWeek() {
    if (!enrollment?.start_date) return 1;
    const start = new Date(enrollment.start_date).getTime();
    const now = Date.now();
    const weeks = Math.floor((now - start) / MS_PER_WEEK) + 1;
    return Math.max(1, Math.min(12, weeks));
  }

  function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysUntilExam() {
    const exam = parseLocalDate(profile?.exam_date);
    if (!exam) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exam.setHours(0, 0, 0, 0);
    return Math.ceil((exam - today) / (1000 * 60 * 60 * 24));
  }

  async function load() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      const back = window.location.pathname + window.location.search;
      window.location.href = loginBase + '?redirect=' + encodeURIComponent(back);
      return;
    }
    currentUserId = user.id;
    loadWeekTaskCompletions();

    const [profileRes, enrollRes, coursesRes] = await Promise.all([
      client.from('profiles').select('*').eq('id', user.id).single(),
      client.from('enrollments').select('*, courses(*)').eq('user_id', user.id).eq('status', 'active').order('enrolled_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('courses').select('*').eq('is_open', true).order('start_date', { ascending: true })
    ]);

    profile = profileRes.data || null;
    enrollment = enrollRes.data || null;
    enrolledCourse = enrollment?.courses || null;
    availableCourses = coursesRes.data || [];

    if (enrollment?.course_id) {
      const { data: weeks } = await client.from('course_weeks').select('id,week_number').eq('course_id', enrollment.course_id);
      const weekMap = {};
      (weeks || []).forEach((w) => { weekMap[w.id] = w.week_number; });
      const weekIds = Object.keys(weekMap);
      if (weekIds.length) {
        const { data: contentData } = await client
          .from('week_content')
          .select('id,title,url,sort_order,week_id')
          .in('week_id', weekIds)
          .order('week_id')
          .order('sort_order');
        weekContent = (contentData || []).map((c) => ({
          ...c,
          course_weeks: { week_number: weekMap[c.week_id] || 1 }
        }));
      } else {
        weekContent = [];
      }
    } else {
      weekContent = [];
    }

    render();
  }

  function weekTaskStorageKey() {
    return `mypsychtraining:week-content-completions:${enrollment?.course_id || 'none'}:${currentUserId || 'anon'}`;
  }

  function loadWeekTaskCompletions() {
    weekTaskCompletions = {};
    try {
      const raw = localStorage.getItem(weekTaskStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') weekTaskCompletions = parsed;
    } catch (_) {
      weekTaskCompletions = {};
    }
  }

  function saveWeekTaskCompletions() {
    try {
      localStorage.setItem(weekTaskStorageKey(), JSON.stringify(weekTaskCompletions));
    } catch (_) {
      // Ignore storage failures (private mode/quota); UI will still work in-memory.
    }
  }

  function isWeekContentDone(contentId) {
    return !!weekTaskCompletions[String(contentId)];
  }

  function render() {
    const currentWeek = getCurrentWeek();
    const days = daysUntilExam();
    const first = window.ktrainAuth?.firstName
      ? window.ktrainAuth.firstName(profile)
      : ((profile?.full_name || '').trim().split(/\s+/)[0] || 'there');

    const countdownEl = document.getElementById('examCountdown');
    if (countdownEl) {
      if (days !== null) {
        if (days > 0) {
          countdownEl.textContent = days === 1 ? '1 day until your exam' : `${days} days until your exam`;
        } else if (days === 0) {
          countdownEl.textContent = 'Exam is today';
        } else {
          countdownEl.textContent = 'Exam date has passed';
        }
      } else {
        countdownEl.textContent = 'Your exam date is not set yet—it will appear here once your administrator adds it.';
      }
    }

    const nameEl = document.getElementById('dashboardUserName');
    if (nameEl) nameEl.textContent = first;

    const byWeek = {};
    weekContent.forEach(c => {
      const weekNum = c.course_weeks?.week_number ?? c.week_id;
      if (!byWeek[weekNum]) byWeek[weekNum] = [];
      byWeek[weekNum].push(c);
    });

    const weeksContainer = document.getElementById('courseWeeks');
    if (weeksContainer) {
      if (!enrollment) {
        weeksContainer.innerHTML = `
          <div class="course-week course-week--current">
            <div class="course-week-body" style="display:block;">
              <h3 style="margin-top:0;">You are not enrolled yet</h3>
              <p class="sidebar-todo-empty">Register for an upcoming course to unlock your dashboard and weekly outline.</p>
              ${availableCourses.length ? `
                <table class="admin-table">
                  <thead><tr><th>Course</th><th>Dates</th><th>Action</th></tr></thead>
                  <tbody>
                    ${availableCourses.map((c) => `
                      <tr>
                        <td>${escapeHtml(c.title || 'Untitled course')}</td>
                        <td>${escapeHtml((c.start_date || 'TBC') + (c.end_date ? ' to ' + c.end_date : ''))}</td>
                        <td><button type="button" class="btn btn-small js-register-course" data-id="${escapeHtml(c.id)}">Register</button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p class="sidebar-todo-empty">No upcoming courses are open yet.</p>'}
            </div>
          </div>
        `;
        weeksContainer.querySelectorAll('.js-register-course').forEach((btn) => {
          btn.addEventListener('click', () => registerCourse(btn.getAttribute('data-id')));
        });
        return;
      }
      weeksContainer.innerHTML = '';
      const titleEl = document.createElement('h3');
      titleEl.textContent = enrolledCourse?.title ? `Enrolled: ${enrolledCourse.title}` : 'Your enrolled course';
      titleEl.style.margin = '0 0 0.8rem';
      weeksContainer.appendChild(titleEl);
      for (let w = 1; w <= 12; w++) {
        const unlocked = w <= currentWeek;
        const isCurrent = w === currentWeek;
        const content = (byWeek[w] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const completedCount = content.reduce((acc, c) => acc + (isWeekContentDone(c.id) ? 1 : 0), 0);
        const totalCount = content.length;
        const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
        const weekEl = document.createElement('div');
        weekEl.className = 'course-week' + (isCurrent ? ' course-week--current' : '') + (!unlocked ? ' course-week--locked' : '');
        weekEl.innerHTML = `
          <button type="button" class="course-week-header" ${!unlocked ? 'disabled' : ''} aria-expanded="${isCurrent}">
            <span class="course-week-title">Week ${w}</span>
            ${!unlocked ? '<span class="course-week-badge">Locked</span>' : ''}
          </button>
          <div class="course-week-body" style="display: ${isCurrent ? 'block' : 'none'}">
            ${unlocked ? `
              <div class="week-progress-wrap" aria-live="polite">
                <div class="week-progress-meta">
                  <span>Progress</span>
                  <span>${completedCount}/${totalCount} complete</span>
                </div>
                <div class="week-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Week ${w} progress">
                  <span class="week-progress-fill" style="width:${pct}%"></span>
                </div>
              </div>
              ${content.map(c => `
              <div class="week-content-item week-content-task-row ${isWeekContentDone(c.id) ? 'week-content-task-row--done' : ''}">
                <input type="checkbox" class="week-content-check" data-content-id="${escapeHtml(c.id)}" ${isWeekContentDone(c.id) ? 'checked' : ''} aria-label="Mark ${escapeHtml(c.title)} complete" />
                <a href="${c.url || '#'}" class="week-content-link">${escapeHtml(c.title)}</a>
              </div>
            `).join('')}` : ''}
          </div>
        `;
        const header = weekEl.querySelector('.course-week-header');
        const body = weekEl.querySelector('.course-week-body');
        if (header && unlocked) {
          header.addEventListener('click', () => {
            const open = body.style.display === 'block';
            body.style.display = open ? 'none' : 'block';
            header.setAttribute('aria-expanded', !open);
          });
        }
        if (unlocked) {
          weekEl.querySelectorAll('.week-content-check').forEach((cb) => {
            cb.addEventListener('change', (event) => {
              toggleWeekContentTask(event.target.dataset.contentId, event.target.checked);
            });
          });
        }
        weeksContainer.appendChild(weekEl);
      }
    }

    const todosContainer = document.getElementById('sidebarTodos');
    if (todosContainer) {
      todosContainer.innerHTML = enrollment
        ? '<p class="sidebar-todo-empty">Use the week checklist above to track progress.</p>'
        : '<p class="sidebar-todo-empty">Register for a course to unlock your weekly tasks.</p>';
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function registerCourse(courseId) {
    if (!courseId || !currentUserId) return;
    const { error } = await client.from('enrollments').insert({
      user_id: currentUserId,
      course_id: courseId,
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10)
    });
    if (error) {
      alert(error.message || 'Could not register for course.');
      return;
    }
    await load();
  }

  async function toggleTodo() {
    // Legacy no-op, retained so older inline handlers don't break.
    render();
  }

  function toggleWeekContentTask(contentId, completed) {
    if (!contentId) return;
    const id = String(contentId);
    if (completed) {
      weekTaskCompletions[id] = true;
    } else {
      delete weekTaskCompletions[id];
    }
    saveWeekTaskCompletions();
    render();
  }

  function renderWithFallback() {
    document.getElementById('examCountdown') && (document.getElementById('examCountdown').textContent = 'Connect Supabase in js/supabase-config.js to load your course and exam countdown.');
    document.getElementById('dashboardUserName') && (document.getElementById('dashboardUserName').textContent = 'there');
    const weeksContainer = document.getElementById('courseWeeks');
    if (weeksContainer) {
      weeksContainer.innerHTML = '';
      for (let w = 1; w <= 12; w++) {
        const isCurrent = w === 1;
        const content = w === 1 ? [{ title: 'Overview' }, { title: 'Technique' }, { title: 'Question Bank' }] : [];
        const weekEl = document.createElement('div');
        weekEl.className = 'course-week' + (isCurrent ? ' course-week--current' : '');
        weekEl.innerHTML = `
          <button type="button" class="course-week-header" aria-expanded="${isCurrent}">
            <span class="course-week-title">Week ${w}</span>
          </button>
          <div class="course-week-body" style="display: ${isCurrent ? 'block' : 'none'}">
            ${content.map(c => `<div class="week-content-item"><a href="#" class="week-content-link">${c.title}</a></div>`).join('')}
          </div>
        `;
        const header = weekEl.querySelector('.course-week-header');
        const body = weekEl.querySelector('.course-week-body');
        header?.addEventListener('click', () => {
          const open = body.style.display === 'block';
          body.style.display = open ? 'none' : 'block';
          header.setAttribute('aria-expanded', !open);
        });
        weeksContainer.appendChild(weekEl);
      }
    }
    const todosContainer = document.getElementById('sidebarTodos');
    if (todosContainer) {
      todosContainer.innerHTML = `
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Review Overview</span></label>
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Practice Technique</span></label>
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Complete Question Bank tasks</span></label>
      `;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(e => { console.error(e); renderWithFallback(); }));
  } else {
    load().catch(e => { console.error(e); renderWithFallback(); });
  }
})();
