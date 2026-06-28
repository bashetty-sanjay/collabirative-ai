import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '../firebase';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userSettings, setUserSettings] = useState(null);

  // Load user settings from backend (Firestore) when user logs in
  const loadUserSettings = useCallback(async (user) => {
    if (!user) {
      setUserSettings(null);
      return;
    }
    try {
      const token = await user.getIdToken();
      const settings = await api.getUserSettings(token);
      setUserSettings(settings);
    } catch (err) {
      console.warn('Could not load user settings:', err);
      setUserSettings({ keys: {}, council_models: [], master_model: null });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      await loadUserSettings(user);
      setLoading(false);
    });
    return unsubscribe;
  }, [loadUserSettings]);

  const getIdToken = useCallback(async () => {
    if (!currentUser) throw new Error('Not authenticated');
    return currentUser.getIdToken();
  }, [currentUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
    setUserSettings(null);
  }, []);

  const refreshSettings = useCallback(() => loadUserSettings(currentUser), [currentUser, loadUserSettings]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      loading,
      userSettings,
      getIdToken,
      signOut,
      refreshSettings,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
