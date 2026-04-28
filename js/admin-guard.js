/**
 * Ensures user is logged in.
 * Access defaults to super-admin only.
 */
(function () {
  window.ktrainAdminGuard = {
    async init(options) {
      const client = window.ktrainSupabase || window.ktrainAuth?.client;
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      const requireSuperOnly = options?.superOnly !== false;
      const redirectDenied = options?.redirectDenied || (typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.dashboard() : 'dashboard/');

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

      const profile = window.ktrainAuth?.getProfile
        ? await window.ktrainAuth.getProfile(user.id)
        : (await client.from('profiles').select('*').eq('id', user.id).single()).data;
      const isSuper = !!profile?.is_super_admin;
      if (requireSuperOnly && !isSuper) {
        document.body.innerHTML = '<p>Access denied.</p><a href="' + redirectDenied + '">Back to dashboard</a>';
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
