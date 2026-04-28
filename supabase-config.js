// Replace with your Supabase project URL and anon key (Project Settings → API)
const SUPABASE_URL = 'https://fnpiwsjyrswtlesaymru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZucGl3c2p5cnN3dGxlc2F5bXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTY0ODUsImV4cCI6MjA5Mjg5MjQ4NX0.S0UJMoKHSOwUYbvnsAsM4_kkTxSn7LJOnM80zQ4kjrs';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.ktrainSupabase = typeof supabase !== 'undefined'
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
