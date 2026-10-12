import axios, { AxiosInstance, AxiosError } from 'axios';

// Same app now — frontend and API are same-origin, so a relative baseURL (empty string)
// is correct in every environment without a separate env var to keep in sync.
const API_URL = '';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    withCredentials: true, // Important pour les cookies httpOnly
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add auth token from cookie
apiClient.interceptors.request.use(
    (config) => {
        // Le token JWT sera automatiquement envoyé via httpOnly cookie
        // Pas besoin de l'ajouter manuellement
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - Handle errors and token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Les endpoints d'auth eux-memes ne doivent JAMAIS passer par ce mecanisme.
        // Un 401 sur /api/auth/privy signifie "ce jeton Privy n'a pas ete verifie" — la
        // bonne reaction est de reessayer avec un jeton Privy FRAIS (gere par
        // syncPrivySession, qui reappelle getAccessToken()), pas de rafraichir une session
        // backend totalement differente et sans rapport. C'est exactement ce bug qui a
        // provoque un vrai incident : une premiere tentative de connexion Privy pour un
        // NOUVEAU compte echouait avec 401 (jeton pas encore propage cote SDK Privy), ce
        // bloc rafraichissait silencieusement l'ANCIENNE session encore active (celle d'un
        // autre compte, jamais deconnectee), et l'app continuait de servir des donnees de
        // cette ancienne session pendant les secondes ou la vraie tentative etait rejouee —
        // affichant le mauvais profil/role le temps que la nouvelle connexion aboutisse.
        const isAuthEndpoint = typeof originalRequest?.url === 'string' && originalRequest.url.startsWith('/api/auth/');

        // Si erreur 401 et pas déjà en train de retry
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
            originalRequest._retry = true;

            try {
                // Tenter de refresh le token
                await axios.post(
                    `${API_URL}/api/auth/refresh`,
                    {},
                    { withCredentials: true }
                );

                // Retry la requête originale
                return apiClient(originalRequest);
            } catch (refreshError) {
                // Si refresh échoue, la session est réellement morte côté backend.
                // On DOIT nettoyer l'état persisté ici, sinon login-page.tsx va lire
                // un "isAuthenticated: true" périmé et nous renvoyer aussitôt vers
                // /dashboard, recréant la boucle infinie login <-> dashboard.
                if (typeof window !== 'undefined' &&
                    !window.location.pathname.includes('/login') &&
                    !window.location.pathname.includes('/signup') &&
                    window.location.pathname !== '/') {
                    localStorage.removeItem('auth-storage');
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;

// Helper pour gérer les erreurs API
export const handleApiError = (error: any): string => {
    if (error.response?.data?.error) {
        return error.response.data.error;
    }
    if (error.message) {
        return error.message;
    }
    return 'Une erreur est survenue';
};