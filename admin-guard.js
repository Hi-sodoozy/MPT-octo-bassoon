/**
 * Ensures user is logged in.
 * Access is open to any authenticated account.
 */
(function () {
  window.ktrainAdminGuard = {
    async init(options) {
      const client = window.ktrainSupabase || window.ktrainAuth?.client;
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';

      if (!client) {
        const el = document.getElementById('adminGuardRoot');
        if (el) {
          el.hidden = false;
          el.removeAttribute('hidden');
          el.innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>';
        }
        return false;
      }

      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        const target = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
        window.location.href = loginBase + '?redirect=' + encodeURIComponent(target);
        return false;
      }

      const el = document.getElementById('adminGuardRoot');
      if (el) {
        el.hidden = false;
        el.removeAttribute('hidden');
      }
      return true;
    }
  };
})();
