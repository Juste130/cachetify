"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuthStore } from "@/hooks/useAuth";
import { syncPrivySession, privySessionMatchesStore } from "@/lib/utils/privySync";

// Only ever send people to a path inside our own app — a redirect/callbackUrl value
// come from a URL query string, so treating it as trustworthy without this check would
// let a crafted invitation-style link send a just-authenticated user to an external site.
function safeInternalPath(path: string | null): string | null {
    if (!path) return null;
    return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

/**
 * Logique partagée entre /login et /signup : les deux pages ne sont que des
 * variantes de texte autour du même flux "connexion Privy -> sync backend".
 *
 * syncInProgress empêche des appels privyLogin() concurrents/en rafale pendant
 * la création du wallet embarqué Privy (le tableau `wallets` change plusieurs
 * fois juste après la connexion, ce qui peut redéclencher l'effet de sync en
 * boucle si on ne s'en protège pas).
 */
export function usePrivySync() {
    const { ready, authenticated, login, user, getAccessToken } = usePrivy();
    const { wallets } = useWallets();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { privyLogin, isAuthenticated, user: storeUser } = useAuthStore();
    const [isSyncing, setIsSyncing] = useState(false);
    const syncInProgress = useRef(false);
    const autoLoginTriggered = useRef(false);

    // "isAuthenticated" alone isn't enough: it can be stale-true from a PREVIOUS
    // person's session in this same browser if they switch Privy identity without our
    // store getting a chance to clear first. Comparing emails catches that — see
    // privySessionMatchesStore for the full story.
    const sessionMatches = privySessionMatchesStore(user, storeUser?.email);

    // /signup links use "redirect" (see sendDraftInvitationEmail), /login uses
    // "callbackUrl" (see ProtectedRoute/AdminGuard) — both are honored here so an
    // invited signatory lands back on the contract they were invited to instead of
    // a generic dashboard, no matter which of the two page ever forwarded them.
    const destination = safeInternalPath(searchParams.get("redirect") || searchParams.get("callbackUrl")) || "/dashboard";

    // Si déjà authentifié PARTOUT (et que c'est bien la MÊME personne des deux côtés),
    // rediriger vers la destination demandée (ou dashboard). Sans le check sessionMatches,
    // un isAuthenticated resté vrai pour la session PRECEDENTE (ex. l'admin) enverrait
    // silencieusement une nouvelle identité Privy droit dans l'ancienne session backend.
    useEffect(() => {
        if (ready && authenticated && user && isAuthenticated && sessionMatches) {
            router.replace(destination);
        }
    }, [ready, authenticated, user, isAuthenticated, sessionMatches, router, destination]);

    // Auto-sync si déjà authentifié via Privy mais pas backend — OU si le backend pense
    // encore être authentifié comme quelqu'un d'autre (sessionMatches === false). Le verrou
    // anti-concurrence vit dans syncPrivySession() (partagé avec AuthInitializer, monté
    // globalement et donc actif en même temps que ce hook sur /login et /signup) —
    // syncInProgress ici n'évite que les ré-entrées de CETTE instance pendant l'attente,
    // pas les deux mécanismes entre eux.
    useEffect(() => {
        const autoSync = async () => {
            if (ready && authenticated && user && (!isAuthenticated || !sessionMatches) && !syncInProgress.current) {
                syncInProgress.current = true;
                setIsSyncing(true);
                try {
                    const synced = await syncPrivySession({ user, wallets, getAccessToken, privyLogin });
                    if (synced) {
                        router.replace(destination);
                    } else {
                        setIsSyncing(false);
                    }
                } catch (error) {
                    console.error("Error syncing with backend:", error);
                    setIsSyncing(false);
                } finally {
                    syncInProgress.current = false;
                }
            }
        };

        autoSync();
        // `wallets` retiré des dépendances : ce tableau change plusieurs fois pendant
        // la création du wallet embarqué et redéclenchait cet effet en rafale.
        // `wallets` est lu depuis la closure au moment de l'exécution, ce qui suffit ici.
    }, [ready, authenticated, user, isAuthenticated, sessionMatches, privyLogin, router, destination, getAccessToken]);

    const handleLogin = () => {
        if (ready && !authenticated) {
            login();
        }
    };

    // /login et /signup ouvrent desormais la modale Privy toutes seules au chargement —
    // le bouton de PrivyAuthCard reste affiche comme filet de securite (popup bloquee,
    // ou modale fermee par erreur par l'utilisateur) plutot que de re-ouvrir en boucle.
    useEffect(() => {
        if (ready && !authenticated && !autoLoginTriggered.current) {
            autoLoginTriggered.current = true;
            login();
        }
    }, [ready, authenticated, login]);

    return { ready, isSyncing, handleLogin };
}
