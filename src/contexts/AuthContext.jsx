import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchProfile } from '../lib/api/profile';
import { logActivity } from '../lib/api/activityLog';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // null = not checked yet, true/false once resolved — AuthGate uses this to
  // force a first-time user through SetPassword before the rest of the app.
  const [passwordSet, setPasswordSet] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  // Shared profile row (name, photo, position, ...) — kept here rather than
  // re-fetched per component so TopBar's avatar/name update the moment
  // Account.jsx saves, without needing a full page reload.
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Only a real sign-in, not a session restored from storage on load
      // (that fires INITIAL_SESSION instead) — see "Останні дії" on /account.
      if (event === 'SIGNED_IN' && newSession?.user?.email) {
        logActivity('account', 'login', { userAgent: navigator.userAgent }, newSession.user.email);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const email = session?.user?.email ?? null;

  function refreshPasswordSet() {
    if (!email) return Promise.resolve();
    return fetchProfile(email)
      .then((p) => setPasswordSet(Boolean(p?.password_set)))
      .catch(() => setPasswordSet(false));
  }

  function refreshProfile() {
    if (!email) return Promise.resolve();
    return fetchProfile(email)
      .then((p) => setProfile(p))
      .catch(() => {});
  }

  useEffect(() => {
    if (!email) { setPasswordSet(null); setProfile(null); setProfileLoading(false); return; }
    setProfileLoading(true);
    fetchProfile(email)
      .then((p) => { setPasswordSet(Boolean(p?.password_set)); setProfile(p); })
      .catch(() => setPasswordSet(false))
      .finally(() => setProfileLoading(false));
  }, [email]);

  const value = {
    session,
    user: session?.user ?? null,
    email,
    loading,
    passwordSet,
    profileLoading,
    profile,
    refreshPasswordSet,
    refreshProfile,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
