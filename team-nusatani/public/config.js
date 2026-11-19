// Team Nusatani – runtime configuration (public values only, no secrets!)
// supabaseUrl / supabaseAnonKey: Supabase dashboard → Project Settings → API
//   (the "anon" / "publishable" key is meant to be public; access is protected by RLS)
// vapidPublicKey: public half of the Web Push key pair (optional, see README)
// Leave supabaseUrl empty to run the built-in demo with sample data.
window.TEAM_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  vapidPublicKey: '',
};
