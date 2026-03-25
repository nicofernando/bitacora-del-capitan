import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    store.initialize();
  }, []);

  return {
    session: store.session,
    user: store.user,
    profile: store.profile,
    isLoading: store.isLoading,
    isApproved: store.isApproved,
    isAuthenticated: !!store.session,
    isOnboarded: store.profile?.onboarding_completed ?? false,
    fetchProfile: store.fetchProfile,
    updateProfile: store.updateProfile,
    signOut: store.signOut,
  };
}
