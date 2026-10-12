"use client";

import { useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuthStore } from "@/hooks/useAuth";
import { syncPrivySession, privySessionMatchesStore } from "@/lib/utils/privySync";

/**
 * AuthInitializer — Synchronise la session Privy avec le backend au démarrage, et à chaque
 * fois qu'on se retrouve authentifié côté Privy mais pas côté backend (ex. cookie de session
 * expiré alors que Privy est toujours connecté). Monté globalement (voir app/providers.tsx),
 * donc actif sur toutes les pages — y compris /login et /signup, où `usePrivySync` fait le
 * même travail en plus de la redirection : voir `syncPrivySession` pour le verrou partagé qui
 * empêche les deux de se déclencher en même temps sur ces pages.
 *
 * Le check `isAuthenticated` seul ne suffit pas : si quelqu'un se déconnecte puis se
 * reconnecte avec un AUTRE compte Privy dans le même navigateur avant que ce store n'ait eu
 * l'occasion de se réinitialiser, `isAuthenticated` peut rester vrai pour la session
 * PRÉCÉDENTE — ce composant, tournant sur chaque page protégée, considérerait alors "déjà
 * synchronisé" et ne rebrancherait jamais le nouveau compte Privy au backend : l'utilisateur
 * resterait connecté avec le profil, le rôle et les permissions de la personne précédente,
 * silencieusement. `privySessionMatchesStore` compare les emails pour détecter exactement ce
 * cas et force une resynchronisation au lieu de faire confiance au flag périmé.
 */
export function AuthInitializer() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { isAuthenticated, privyLogin, user: storeUser } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      if (!ready) return;
      if (!authenticated || !user) return;
      if (isAuthenticated && privySessionMatchesStore(user, storeUser?.email)) return; // Déjà synchronisé, même personne

      try {
        await syncPrivySession({ user, wallets, getAccessToken, privyLogin });
      } catch (error) {
        console.error("[AuthInitializer] Failed to sync session:", error);
        // Erreur silencieuse — l'utilisateur sera redirigé vers /login par ProtectedRoute
      }
    };

    initAuth();
  }, [ready, authenticated, user, isAuthenticated, storeUser, privyLogin, wallets, getAccessToken]);

  return null;
}
