(function () {
  const client = window.ktrainSupabase;
  const rootId = 'meqQbStudentRoot';
  const DEFAULT_EXAM_SECONDS = 2.5 * 60 * 60;

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

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i += 1) {
      const v = arguments[i];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return '';
  }

  function pathNoQuery() {
    return window.location.pathname.endsWith('/') ? window.location.pathname : (window.location.pathname + '/');
  }

  function getQuery() {
    return new URLSearchParams(window.location.search);
  }

  function setQuery(nextParams) {
    const p = new URLSearchParams();
    Object.keys(nextParams).forEach((k) => {
      if (nextParams[k]) p.set(k, nextParams[k]);
    });
    const q = p.toString();
    window.location.href = pathNoQuery() + (q ? ('?' + q) : '');
  }

  function formatTimer(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
  }

  function hasAnswered(submissionText) {
    return typeof submissionText === 'string' && submissionText.trim().length > 0;
  }

  async function requireUser(root) {
    if (!client || !root) return null;
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      window.location.href = login + '?redirect=' + encodeURIComponent(pathNoQuery() + window.location.search);
      return null;
    }
    return user;
  }

  async function fetchData(userId) {
    const [qRes, sRes] = await Promise.all([
      client.from('meq_questions').select('*').eq('is_published', true).order('sort_order', { ascending: true }),
      client.from('meq_question_submissions').select('question_id, response_text').eq('user_id', userId)
    ]);
    return { qRes, sRes };
  }

  function pickRandomUnanswered(questions, byQ) {
    const pool = questions.filter((q) => !hasAnswered(byQ[q.id]));
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  async function renderMain(root, user, questions, byQ) {
    const tagSet = new Set();
    questions.forEach((q) => (q.tags || []).forEach((t) => tagSet.add(t)));
    const tagOptions = ['<option value="">All tags</option>']
      .concat(Array.from(tagSet).sort().map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`))
      .join('');

    root.innerHTML = `
      <div class="qb-student-toolbar">
        <div>
          <label class="qb-admin-label">Filter by tags</label>
          <input id="qbTagInput" class="course-admin-input" placeholder="e.g. psychosis, risk" />
        </div>
        <div>
          <label class="qb-admin-label">&nbsp;</label>
          <select id="qbTagSelect" class="course-admin-input">${tagOptions}</select>
        </div>
        <button type="button" id="qbRandomBtn" class="btn">Random Question</button>
        <button type="button" id="qbPracticeBtn" class="btn btn-secondary">Practice Exam</button>
      </div>
      <div id="qbStudentList"></div>
    `;

    const listEl = root.querySelector('#qbStudentList');
    const inputEl = root.querySelector('#qbTagInput');
    const selectEl = root.querySelector('#qbTagSelect');

    function renderList() {
      const freeTextTags = parseTags(inputEl.value);
      const selected = selectEl.value;
      const rows = questions.filter((q) => {
        const qTags = q.tags || [];
        if (selected && !qTags.includes(selected)) return false;
        if (freeTextTags.length && !freeTextTags.every((t) => qTags.includes(t))) return false;
        return true;
      });
      listEl.innerHTML = rows.map((q, idx) => {
        const stem = firstNonEmpty(q.stem, q.prompt_text);
        const done = hasAnswered(byQ[q.id]);
        const subtleTag = (q.tags && q.tags[0]) ? q.tags[0] : '';
        return `
          <article class="qb-student-card ${done ? 'qb-student-card--done' : ''}" data-id="${escapeAttr(q.id)}">
            <div class="qb-student-meta">
              <h3 class="qb-student-num">Question ${idx + 1}</h3>
              ${subtleTag ? `<span class="qb-student-tag-inline">${escapeHtml(subtleTag)}</span>` : ''}
            </div>
            <div class="qb-student-stem">${escapeHtml(stem).replace(/\n/g, '<br />')}</div>
            <button type="button" class="btn btn-small js-qb-choose">${done ? 'View or edit your answer' : 'Choose this question'}</button>
          </article>
        `;
      }).join('') || '<p class="qb-student-empty">No questions match this filter.</p>';
    }

    renderList();
    inputEl.addEventListener('input', renderList);
    selectEl.addEventListener('change', renderList);

    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-qb-choose');
      if (!btn) return;
      const id = btn.closest('.qb-student-card')?.getAttribute('data-id');
      if (!id) return;
      setQuery({ question: id });
    });

    root.querySelector('#qbRandomBtn').addEventListener('click', () => {
      const picked = pickRandomUnanswered(questions, byQ);
      if (!picked) {
        alert('No unanswered questions left.');
        return;
      }
      setQuery({ question: picked.id });
    });

    root.querySelector('#qbPracticeBtn').addEventListener('click', () => {
      setQuery({ practice: '1' });
    });
  }

  async function saveResponse(userId, questionId, text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      alert('Please write an answer before saving.');
      return { ok: false };
    }
    const { error } = await client.from('meq_question_submissions').upsert({
      user_id: userId,
      question_id: questionId,
      response_text: trimmed
    }, { onConflict: 'user_id,question_id' });
    if (error) {
      alert(error.message);
      return { ok: false };
    }
    return { ok: true };
  }

  async function renderQuestionDetail(root, user, question, savedText) {
    const stem = firstNonEmpty(question.stem, question.prompt_text);
    root.innerHTML = `
      <p><a href="${pathNoQuery()}">← Back to question bank</a></p>
      <article class="qb-student-card" data-id="${escapeAttr(question.id)}">
        <div class="qb-student-meta">
          <h3 class="qb-student-num">Question</h3>
          ${(question.tags && question.tags[0]) ? `<span class="qb-student-tag-inline">${escapeHtml(question.tags[0])}</span>` : ''}
        </div>
        <div class="qb-student-stem">${escapeHtml(stem).replace(/\n/g, '<br />')}</div>
        <label class="qb-admin-label">Your response</label>
        <textarea class="qb-admin-textarea qb-response" rows="10" placeholder="Write your answer here…">${escapeHtml(savedText || '')}</textarea>
        <button type="button" class="btn btn-small js-qb-save-response">Save response</button>
      </article>
    `;

    root.querySelector('.js-qb-save-response').addEventListener('click', async (e) => {
      const btn = e.target;
      const text = root.querySelector('.qb-response')?.value || '';
      btn.disabled = true;
      const res = await saveResponse(user.id, question.id, text);
      btn.disabled = false;
      if (!res.ok) return;
      const prev = btn.textContent;
      btn.textContent = 'Saved';
      setTimeout(() => {
        btn.textContent = prev;
        setQuery({});
      }, 1000);
    });
  }

  async function renderPractice(root, user, questions, byQ) {
    const unanswered = questions.filter((q) => !hasAnswered(byQ[q.id]));
    const chosen = unanswered.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    if (!chosen.length) {
      root.innerHTML = `<p><a href="${pathNoQuery()}">← Back to question bank</a></p><p class="qb-student-empty">No unanswered questions are available for a practice exam.</p>`;
      return;
    }

    root.innerHTML = `
      <p><a href="${pathNoQuery()}">← Back to question bank</a></p>
      <div class="qb-practice-head">
        <h2>Practice exam</h2>
        <div class="qb-practice-timer-wrap">
          <div class="qb-timer-line">
            <div id="qbPracticeTimer" class="qb-practice-timer">${formatTimer(DEFAULT_EXAM_SECONDS)}</div>
            <button type="button" id="qbTimerEdit" class="btn btn-secondary qb-timer-edit-btn">Edit</button>
          </div>
          <div class="qb-practice-controls">
            <button type="button" class="btn btn-small" id="qbTimerStart">Start</button>
            <button type="button" class="btn btn-small btn-secondary" id="qbTimerPause">Pause</button>
            <button type="button" class="btn btn-small btn-secondary" id="qbTimerStop">Stop</button>
            <button type="button" class="btn btn-small btn-secondary" id="qbTimerReset">Reset</button>
          </div>
        </div>
      </div>
      <div id="qbPracticeWrap" class="qb-practice-wrap">
        ${chosen.map((q, i) => `
          <article class="qb-student-card" data-id="${escapeAttr(q.id)}">
            <div class="qb-student-meta">
              <h3 class="qb-student-num">Question ${i + 1}</h3>
              ${(q.tags && q.tags[0]) ? `<span class="qb-student-tag-inline">${escapeHtml(q.tags[0])}</span>` : ''}
            </div>
            <div class="qb-student-stem">${escapeHtml(firstNonEmpty(q.stem, q.prompt_text)).replace(/\n/g, '<br />')}</div>
            <label class="qb-admin-label">Answer</label>
            <textarea class="qb-admin-textarea qb-practice-answer" rows="8">${escapeHtml(byQ[q.id] || '')}</textarea>
            <button type="button" class="btn btn-small js-qb-practice-save">Save</button>
          </article>
        `).join('')}
      </div>
      <div id="qbTimesUpPopup" class="qb-timesup-popup" hidden>Times up</div>
    `;

    root.querySelector('#qbPracticeWrap').addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-qb-practice-save');
      if (!btn) return;
      const card = btn.closest('.qb-student-card');
      const qid = card?.getAttribute('data-id');
      if (!qid) return;
      const text = card.querySelector('.qb-practice-answer')?.value || '';
      btn.disabled = true;
      const res = await saveResponse(user.id, qid, text);
      btn.disabled = false;
      if (!res.ok) return;
      const prev = btn.textContent;
      btn.textContent = 'Saved';
      setTimeout(() => { btn.textContent = prev; }, 1200);
    });

    let baseSeconds = DEFAULT_EXAM_SECONDS;
    let remaining = baseSeconds;
    let ticker = null;
    const timerEl = root.querySelector('#qbPracticeTimer');
    const wrapEl = root.querySelector('#qbPracticeWrap');
    const popupEl = root.querySelector('#qbTimesUpPopup');

    function paintTimer() { timerEl.textContent = formatTimer(remaining); }
    function stopTimer() { if (ticker) clearInterval(ticker); ticker = null; }
    function onTimesUp() {
      stopTimer();
      popupEl.hidden = false;
      wrapEl.classList.add('qb-practice-wrap--timesup');
      setTimeout(() => {
        popupEl.hidden = true;
        wrapEl.classList.remove('qb-practice-wrap--timesup');
      }, 5000);
    }

    root.querySelector('#qbTimerStart').addEventListener('click', () => {
      if (ticker || remaining <= 0) return;
      ticker = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          remaining = 0;
          paintTimer();
          onTimesUp();
          return;
        }
        paintTimer();
      }, 1000);
    });
    root.querySelector('#qbTimerPause').addEventListener('click', stopTimer);
    root.querySelector('#qbTimerStop').addEventListener('click', stopTimer);
    root.querySelector('#qbTimerReset').addEventListener('click', () => {
      stopTimer();
      remaining = baseSeconds;
      paintTimer();
    });
    root.querySelector('#qbTimerEdit').addEventListener('click', () => {
      const currentMins = Math.round(baseSeconds / 60);
      const v = window.prompt('Set timer length in minutes:', String(currentMins));
      if (v == null) return;
      const mins = Number(v);
      if (!Number.isFinite(mins) || mins <= 0) {
        alert('Please enter a valid number of minutes.');
        return;
      }
      stopTimer();
      baseSeconds = Math.round(mins * 60);
      remaining = baseSeconds;
      paintTimer();
    });
  }

  async function load() {
    const root = document.getElementById(rootId);
    const user = await requireUser(root);
    if (!user) return;
    const { qRes, sRes } = await fetchData(user.id);

    if (qRes.error) {
      root.innerHTML = '<p class="course-admin-error">' + escapeHtml(qRes.error.message) + '</p>';
      return;
    }

    const byQ = {};
    (sRes.data || []).forEach((s) => { byQ[s.question_id] = s.response_text; });
    const qs = qRes.data || [];
    if (!qs.length) {
      root.innerHTML = '<p class="qb-student-empty">No practice questions are available yet.</p>';
      return;
    }
    const query = getQuery();
    const qid = query.get('question');
    const practice = query.get('practice') === '1';

    if (practice) {
      await renderPractice(root, user, qs, byQ);
      return;
    }
    if (qid) {
      const q = qs.find((x) => x.id === qid);
      if (!q) {
        setQuery({});
        return;
      }
      await renderQuestionDetail(root, user, q, byQ[q.id] || '');
      return;
    }
    await renderMain(root, user, qs, byQ);
  }

  document.addEventListener('DOMContentLoaded', () => load().catch(console.error));
})();
