import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api/auth';
import { usersApi, User } from '@/lib/api/users';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    // True once THIS session has verified the session live with the backend (via checkAuth
    // or privyLogin) — deliberately NOT persisted (see partialize below). `isAuthenticated`
    // alone can't tell ProtectedRoute apart "verified live a moment ago" from "just what
    // localStorage said on a cold load" (which is exactly the stale-flag case its own
    // one-check-per-load guard exists to catch — see protected-route.tsx). This lets
    // ProtectedRoute skip a redundant re-check right after a fresh Privy login without
    // reopening that bug: on every fresh page load this always starts false again.
    sessionVerified: boolean;

    // Actions
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    privyLogin: (data: { privyId?: string; email: string; walletAddress?: string; profileData?: any }, token: string) => Promise<void>;
    setUser: (user: User) => void;
    clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            // Starts true, not false: right after a reload, whether the session is valid
            // is genuinely unknown until checkAuth() resolves — it is not yet "logged out".
            // ProtectedRoute below renders nothing while `!isAuthenticated`, so a `false`
            // default here made it flash a blank page on every reload of a protected route,
            // for the one render before the checkAuth() effect had a chance to flip this.
            isLoading: true,
            error: null,
            sessionVerified: false,

            logout: async () => {
                set({ isLoading: true });
                try {
                    await authApi.logout();
                    set({
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        sessionVerified: false
                    });
                    // Rediriger vers Home ou Login possible ici ou dans le composant
                } catch {
                    // Même si l'API échoue, on logout localement
                    set({
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        sessionVerified: false
                    });
                }
            },

            checkAuth: async () => {
                set({ isLoading: true });
                try {
                    const response = await usersApi.getProfile();
                    set({
                        user: response.user as any,
                        isAuthenticated: true,
                        isLoading: false,
                        sessionVerified: true
                    });
                } catch (error) {
                    // Si la session backend expire mais Privy est toujours connecté
                    // on doit resynchroniser ou forcer une nouvelle connexion
                    console.warn('Backend authentication failed. Session may have expired.', error);
                    set({
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        sessionVerified: false,
                        error: 'Votre session a expiré. Veuillez vous reconnecter.'
                    });
                }
            },

            privyLogin: async (data, token) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await authApi.privyAuth(data, token);
                    set({
                        user: response.user as any,
                        isAuthenticated: true,
                        isLoading: false,
                        sessionVerified: true
                    });
                } catch (error: any) {
                    set({
                        error: error.message || 'Erreur lors de la connexion avec Privy',
                        isLoading: false
                    });
                    throw error;
                }
            },

            // Met à jour l'utilisateur sans passer par isLoading : contrairement à
            // checkAuth(), qui déclenche le spinner plein écran de ProtectedRoute,
            // ceci sert aux mises à jour silencieuses (ex. formulaire de profil) où
            // l'appel API a déjà renvoyé l'utilisateur à jour.
            setUser: (user: User) => set({ user }),

            clearError: () => set({ error: null }),
        }),
        {
            name: 'auth-storage',
            // On ne stocke que le user (sans tokens car ils sont dans les cookies httpOnly)
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);
