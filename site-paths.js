/**
 * Resolves site links when pages live in subfolders (e.g. login/index.html).
 * On <html>: data-site-root="" at site root, data-site-root=".." one level deep.
 */
(function () {
  function base() {
    const r = document.documentElement.getAttribute('data-site-root');
    if (r == null || r === '') return '';
    return String(r).replace(/\/?$/, '');
  }

  function join(part) {
    const b = base();
    const p = (part || '').replace(/^\//, '');
    if (!p) return b ? b + '/' : './';
    return (b ? b + '/' : '') + p;
  }

  window.ktrainPaths = {
    home: () => join(''),
    login: () => join('login/'),
    signup: () => join('signup/'),
    dashboard: () => join('dashboard/'),
    admin: () => join('admin/'),
    meq: () => join('meq/'),
    adminSignin: () => join('admin-signin/'),
    profile: () => join('profile/'),
    courseAdmin: () => join('meq-course/'),
    meqCourse: () => join('meq-course/'),
    adminStudents: () => join('admin/students/'),
    meqQuestionBankAdmin: () => join('meq-question-bank-admin/'),
    meqQuestionBankStudent: () => join('meq-question-bank/')
  };

  document.addEventListener('DOMContentLoaded', function () {
    var year = String(new Date().getFullYear());
    document.querySelectorAll('.js-current-year').forEach(function (el) {
      el.textContent = year;
    });
  });
})();
