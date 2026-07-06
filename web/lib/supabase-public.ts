// Public Supabase connection constants (URL + anon key) with hard-coded fallbacks,
// server-safe (NO "use client"). The anon key is public by design — mirrors the
// fallbacks in lib/supabase-browser.ts so server components (e.g. the community Q&A
// permalinks) can read public rows at BUILD time even when the NEXT_PUBLIC_* env
// vars aren't injected into the build (createClient throws on an empty key).

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://orzitfqmlvopujsoyigr.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yeml0ZnFtbHZvcHVqc295aWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTc5NzIsImV4cCI6MjA5NjU3Mzk3Mn0.NY4ZHzR3BAWUxm5as9Z054o8fwcfejAab9SIvduKlhM";
