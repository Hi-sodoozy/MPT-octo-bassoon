(function () {
  if (typeof supabase === 'undefined') return;

  const client = window.ktrainSupabase || supabase.createClient(
    window.SUPABASE_URL || '',
    window.SUPABASE_ANON_KEY || ''
  );
  if (!window.ktrainSupabase && client) window.ktrainSupabase = client;

  function normalizeNetworkError(error) {
    const msg = error?.message || '';
    if (/failed to fetch/i.test(msg)) {
      return new Error('Network error reaching Supabase. Check internet, ad-block/VPN/firewall, and that this site is served over http(s) (not file://).');
    }
    return error;
  }

  function setLinkAccess(hrefs, visible) {
    hrefs.forEach((href) => {
      document.querySelectorAll('a[href="' + href + '"]').forEach((a) => {
        const li = a.closest('li');
        if (li) li.style.display = visible ? '' : 'none';
      });
    });
  }

  function applyAccessVisibility(profile) {
    const isSuper = !!profile?.is_super_admin;
    const isLoggedIn = !!profile;
    const hasAdminAccess = !!(window.ktrainAuth && window.ktrainAuth.hasAdminAccess && profile && window.ktrainAuth.hasAdminAccess(profile));
    // Hide auth entry links once signed in.
    setLinkAccess(['login/', '../login/', '../../login/'], !isLoggedIn);
    setLinkAccess(['signup/', '../signup/', '../../signup/'], !isLoggedIn);
    setLinkAccess(['admin/', '../admin/', '../../admin/'], hasAdminAccess);
    setLinkAccess(['meq-course/', '../meq-course/', '../../meq-course/', 'course-admin/', '../course-admin/'], isSuper);
  }

  function setupFooterLogout(session) {
    const rows = document.querySelectorAll('.footer-account-row');
    rows.forEach((row) => { row.hidden = !session?.user; });
    document.querySelectorAll('.js-footer-logout').forEach((btn) => {
      if (btn.dataset.boundLogout === '1') return;
      btn.dataset.boundLogout = '1';
      btn.addEventListener('click', async () => {
        try {
          await window.ktrainAuth.signOut();
        } finally {
          const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
          window.location.href = login;
        }
      });
    });
  }

  window.ktrainAuth = {
    client,

    /** First word of full_name for greetings; falls back to "there" if empty. */
    firstName(profile) {
      const raw = (profile?.full_name || '').trim();
      if (!raw) return 'there';
      return raw.split(/\s+/)[0];
    },

    async getSession() {
      const { data: { session } } = await client.auth.getSession();
      return session;
    },

    async getProfile(userId) {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
      if (error) return null;
      return data;
    },

    isSuperAdmin(profile) {
      return !!profile?.is_super_admin;
    },

    hasAdminAccess(profile) {
      return this.isSuperAdmin(profile) || (profile?.role === 'admin' && profile?.admin_access_enabled === true);
    },

    async updateProfile(userId, fields) {
      const { full_name, phone, college_id } = fields;
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (phone !== undefined) patch.phone = phone;
      if (college_id !== undefined) patch.college_id = college_id;
      const { data, error } = await client.from('profiles').update(patch).eq('id', userId).select().single();
      if (error) throw error;
      return data;
    },

    async signUp({ email, password, full_name, phone, college_id }) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const { data, error } = await client.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name, phone, college_id }
        }
      });
      if (error) throw normalizeNetworkError(error);
      if (data.user && data.session) {
        const { error: upsertError } = await client.from('profiles').upsert({
          id: data.user.id,
          full_name: full_name || data.user.user_metadata?.full_name,
          email: data.user.email,
          phone: phone || data.user.user_metadata?.phone,
          college_id: college_id || data.user.user_metadata?.college_id,
          role: 'user'
        }, { onConflict: 'id' });
        if (upsertError) {
          console.warn('Profile upsert skipped:', upsertError.message);
        }
      }
      return data;
    },

    async signIn(email, password) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) throw normalizeNetworkError(error);
      if (!data?.session) throw new Error('Login succeeded but no active session was returned. Confirm your email address, then try again.');
      return data;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback);
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await client.auth.getSession();
    setupFooterLogout(session);
    if (!session?.user) {
      applyAccessVisibility(null);
      return;
    }
    const profile = await window.ktrainAuth.getProfile(session.user.id);
    applyAccessVisibility(profile);
  });

  client.auth.onAuthStateChange(async (_event, session) => {
    setupFooterLogout(session);
    if (!session?.user) {
      applyAccessVisibility(null);
      return;
    }
    const profile = await window.ktrainAuth.getProfile(session.user.id);
    applyAccessVisibility(profile);
  });
})();
