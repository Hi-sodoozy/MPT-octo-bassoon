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

  async function directPasswordSignIn(email, password) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const url = String(window.SUPABASE_URL || '').replace(/\/$/, '') + '/auth/v1/token?grant_type=password';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      const text = await res.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
      if (!res.ok) {
        const msg = body?.msg || body?.message || 'Invalid login credentials';
        throw new Error(msg);
      }
      if (!body?.access_token || !body?.refresh_token) {
        throw new Error('Login succeeded but no active session was returned.');
      }
      const { data, error } = await client.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token
      });
      if (error) throw error;
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Login is taking too long. Please try again.');
      }
      throw normalizeNetworkError(error);
    } finally {
      clearTimeout(timer);
    }
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

    // Safety net: hide any admin links from non-admin users even if markup varies.
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a.getAttribute('href') || '').toLowerCase();
      const isAdminLink = href === 'admin/' || href === '../admin/' || href === '../../admin/' || href.endsWith('/admin/');
      if (!isAdminLink) return;
      const host = a.closest('li') || a;
      host.style.display = hasAdminAccess ? '' : 'none';
    });
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

  async function ensureProfileRow(user) {
    if (!user?.id) return null;
    const fallbackName = user.user_metadata?.full_name || null;
    const fallbackPhone = user.user_metadata?.phone || null;
    const fallbackCollege = user.user_metadata?.college_id || null;
    const { data, error } = await client
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email || null,
        full_name: fallbackName,
        phone: fallbackPhone,
        college_id: fallbackCollege
      }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) throw error;
    return data;
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
      return this.isSuperAdmin(profile) || profile?.role === 'admin';
    },

    async updateProfile(userId, fields) {
      const { full_name, phone, college_id } = fields;
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (phone !== undefined) patch.phone = phone;
      if (college_id !== undefined) patch.college_id = college_id;
      const { data, error } = await client.from('profiles').upsert({
        id: userId,
        ...patch
      }, { onConflict: 'id' }).select().single();
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
          role: 'student'
        }, { onConflict: 'id' });
        if (upsertError) {
          console.warn('Profile upsert skipped:', upsertError.message);
        }
      }
      return data;
    },

    async signIn(email, password) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const data = await directPasswordSignIn(normalizedEmail, password);
      if (!data?.session) throw new Error('Login succeeded but no active session was returned. Confirm your email address, then try again.');
      ensureProfileRow(data.user || data.session?.user).catch((x) => {
        console.warn('Profile bootstrap skipped:', x?.message || x);
      });
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
    let profile = await window.ktrainAuth.getProfile(session.user.id);
    if (!profile) {
      try {
        profile = await ensureProfileRow(session.user);
      } catch (_) {
        profile = null;
      }
    }
    applyAccessVisibility(profile);
  });

  client.auth.onAuthStateChange(async (_event, session) => {
    setupFooterLogout(session);
    if (!session?.user) {
      applyAccessVisibility(null);
      return;
    }
    let profile = await window.ktrainAuth.getProfile(session.user.id);
    if (!profile) {
      try {
        profile = await ensureProfileRow(session.user);
      } catch (_) {
        profile = null;
      }
    }
    applyAccessVisibility(profile);
  });
})();
