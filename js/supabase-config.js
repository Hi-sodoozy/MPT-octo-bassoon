// Replace with your Supabase project URL and anon key (Project Settings → API)
const SUPABASE_URL = 'https://zgnksccpbqqxqhdfmpqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnbmtzY2NwYnFxeHFoZGZtcHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODg4ODMsImV4cCI6MjA4Nzk2NDg4M30.GE3iK8tlz724MZEa_UUSy7eqMnTcDP0iXMWhIuG5bbo';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.ktrainSupabase = typeof supabase !== 'undefined'
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
