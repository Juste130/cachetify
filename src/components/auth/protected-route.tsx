"use client";

import { useEffect, useRef, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { Spinner } from '../ui/spinner';
import { KycFirstPrompt } from '@/components/kyc/kyc-first-prompt';
import { AppSidebar } from '@/components/layout/app-sidebar';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/how-it-works'];
// Prefix-matched rather than exact: /verify/[id] is a dynamic route, and every id under it
// must be reachable without an account — that's the entire point of the QR code printed on
// a downloaded certificate (a third party scanning it has no Cachetify login).
const PUBLIC_PATH_PREFIXES = ['/verify/'];

function isPublicPath(pathname: string) {
    return PUBLIC_PATHS.includes(pathname) || PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

// Protégé, mais volontairement affiché plein écran, sans la barre latérale (vue de lecture
// d'un document signé, sans distraction) — comportement déjà en place avant ce refactor.
const NO_SIDEBAR_PATH_PREFIXES = ['/contract-view'];

function isNoSidebarPath(pathname: string) {
    return NO_SIDEBAR_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

interface ProtectedRouteProps {
    children: ReactNode;
    requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
    const { user, isAuthenticated, isLoading, checkAuth, sessionVerified, loggedOutByUser } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const hasChecked = useRef(false);

    // Vérifie TOUJOURS la session une fois par chargement d'app sur une route
    // protégée — peu importe ce que dit l'état persisté (localStorage). Ce dernier
    // n'est qu'un indice d'affichage optimiste, jamais une preuve de session valide.
    // (Le retrait de "!isAuthenticated" de cette condition est LE correctif qui
    // empêche la boucle login <-> dashboard : sans lui, un flag "isAuthenticated:true"
    // périmé en localStorage empêchait toute revérification côté serveur.)
    //
    // `sessionVerified` (jamais persisté — voir useAuth.ts) distingue ce cas d'un autre :
    // arriver ici juste après un login Privy réussi sur /login, qui vient TOUT JUSTE de
    // vérifier la session en direct auprès du backend (privyLogin) une fraction de seconde
    // plus tôt. Comme /login est un chemin public, cet effet ne s'était encore jamais
    // déclenché — sans ce garde-fou, il rappelait checkAuth() une deuxième fois pour rien
    // (même utilisateur, même réponse), remettant isLoading à true et réaffichant un plein
    // écran de chargement juste après celui du login. Sur un chargement d'app à froid,
    // sessionVerified redémarre toujours à false, donc la revérification a bien lieu comme
    // avant.
    useEffect(() => {
        if (!hasChecked.current && !isPublicPath(pathname)) {
            hasChecked.current = true;
            if (!sessionVerified) checkAuth();
        }
    }, [checkAuth, pathname, sessionVerified]);

    // Redirect logic
    useEffect(() => {
        if (!isLoading && !isAuthenticated && !isPublicPath(pathname)) {
            // Déconnexion volontaire : retour à l'accueil, pas vers /login qui rouvrirait
            // aussitôt la fenêtre Privy (voir loggedOutByUser dans useAuth.ts). Session
            // expirée ou lien profond sans session : /login, qui ramène ensuite ici.
            router.replace(loggedOutByUser ? '/' : `/login?callbackUrl=${encodeURIComponent(pathname)}`);
        }
        if (isAuthenticated && requireAdmin && user?.role !== 'ADMIN') {
            router.replace('/dashboard');
        }
    }, [isAuthenticated, isLoading, user, requireAdmin, router, pathname, loggedOutByUser]);

    // Only block render (show spinner) on protected routes while loading
    if (isLoading && !isPublicPath(pathname)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Spinner size="xl" label="Chargement de votre session..." />
            </div>
        );
    }

    // Don't flash protected content before redirect
    if (!isAuthenticated && !isPublicPath(pathname)) {
        return null;
    }

    // AppSidebar (et tout ce qu'elle embarque, dont la cloche de notifications et son polling)
    // vit ICI, une seule fois, au lieu d'être réinstanciée par chacune des pages qui l'utilisent
    // — sans quoi chaque navigation démontait et remontait toute la barre latérale, avec un
    // nouvel appel réseau pour les notifications à chaque fois. Next.js garde ce composant
    // monté d'une navigation à l'autre puisqu'il ne fait plus partie de l'arbre remplacé par
    // le routeur (voir la doc App Router sur les "shared layouts" pendant une transition
    // client). /contract-view reste volontairement plein écran, sans barre latérale.
    const showSidebar = !isPublicPath(pathname) && !isNoSidebarPath(pathname);

    return (
        <>
            {showSidebar ? (
                <div className="flex min-h-screen bg-muted">
                    <AppSidebar />
                    {children}
                </div>
            ) : (
                children
            )}
            <KycFirstPrompt />
        </>
    );
}