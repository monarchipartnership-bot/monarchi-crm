import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchProfile } from '../lib/api/profile';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // null = not checked yet, true/false once resolved — AuthGate uses this to
  // force a first-time user through SetPassword before the rest of the app.
  const [passwordSet, setPasswordSet] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  useEffect(() => {
    if (!email) { setPasswordSet(null); setProfileLoading(false); return; }
    setProfileLoading(true);
    fetchProfile(email)
      .then((p) => setPasswordSet(Boolean(p?.password_set)))
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
    refreshPasswordSet,
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
