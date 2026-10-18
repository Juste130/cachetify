"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuthStore } from "@/hooks/useAuth";
import { syncPrivySession, privySessionMatchesStore } from "@/lib/utils/privySync";
import { Button } from "../ui/button";

/**
 * "inline" : boutons côte à côte (en-têtes desktop) ; sous `sm`, seul le bouton principal
 * reste visible, les deux ouvrant de toute façon la même fenêtre de connexion Privy.
 * "stacked" : boutons pleine largeur l'un sous l'autre, pour le menu mobile de LandingHeader.
 */
export function AuthAwareCta({ variant = "inline" }: { variant?: "inline" | "stacked" }) {
  const stacked = variant === "stacked";
  const { ready, authenticated, login, user: privyUser, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { isAuthenticated, sessionVerified, privyLogin, user: storeUser } = useAuthStore();
  const router = useRouter();
  const [loginTriggered, setLoginTriggered] = useState(false);
  const syncStarted = useRef(false);
  const syncAttempts = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const isUserLoggedIn = ready && authenticated && isAuthenticated;

  // Ne redirige vers /dashboard que si LA CONNEXION A ETE DECLENCHEE ICI — sinon
  // ce composant (monte sur toutes les pages marketing/legal via LandingHeader et
  // LegalHeader) renverrait vers le dashboard n'importe quel visiteur deja
  // connecte qui consulte simplement une page publique.
  //
  // Et seulement une fois la session backend VERIFIEE pendant ce chargement de page
  // (sessionVerified), pas sur la foi du seul `isAuthenticated` : celui-ci est persiste en
  // localStorage et peut etre reste a true d'une session dont le cookie a expire. Rediriger
  // sur cette valeur perimee envoyait sur /dashboard sans session valide : ProtectedRoute
  // echouait sa verification et renvoyait sur /login, qui resynchronisait puis revenait au
  // dashboard (attente longue et page de login affichee pour rien). On synchronise donc ici
  // si besoin, avant de naviguer.
  useEffect(() => {
    if (!loginTriggered || !ready || !authenticated || !privyUser) return;

    const sessionMatches = privySessionMatchesStore(privyUser, storeUser?.email);
    if (isAuthenticated && sessionVerified && sessionMatches) {
      router.push("/dashboard");
      return;
    }

    if (syncStarted.current) return;
    syncStarted.current = true;
    syncAttempts.current += 1;
    // Echec reel : la page de connexion dediee sait reessayer et afficher un etat clair.
    const fallBackToLogin = () => router.push("/login?callbackUrl=%2Fdashboard");

    syncPrivySession({ user: privyUser, wallets, getAccessToken, privyLogin })
      .then((synced) => {
        if (synced) return; // sessionVerified passe a true : cet effet redirige au prochain rendu
        // false = rien n'a tourne (synchronisation deja en cours dans AuthInitializer, ou
        // jeton/email pas encore disponibles juste apres la connexion). Si l'autre
        // synchronisation reussit, sessionVerified fera rediriger ; sinon on reessaie ici.
        if (syncAttempts.current >= 10) return fallBackToLogin();
        setTimeout(() => {
          syncStarted.current = false;
          setRetryTick((tick) => tick + 1);
        }, 1000);
      })
      .catch((error) => {
        console.error("[AuthAwareCta] Failed to sync session:", error);
        fallBackToLogin();
      });
  }, [loginTriggered, ready, authenticated, privyUser, storeUser, isAuthenticated, sessionVerified, wallets, getAccessToken, privyLogin, router, retryTick]);

  const handleAuth = () => {
    setLoginTriggered(true);
    if (ready && !authenticated) {
      login();
    }
  };

  // Entre la fin de la connexion Privy et l'arrivee sur le dashboard, le bouton montre que
  // quelque chose se passe au lieu de rester inerte.
  const connecting = loginTriggered && ready && authenticated;

  if (isUserLoggedIn && !connecting) {
    return (
      <Link href="/dashboard" className={stacked ? "w-full" : undefined}>
        <Button className={`bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] font-medium ${stacked ? "w-full" : ""}`}>
          Accéder à mon espace
        </Button>
      </Link>
    );
  }

  if (connecting) {
    return (
      <Button
        disabled
        className={`bg-[#FFC107] text-[#212121] font-medium disabled:opacity-80 ${stacked ? "w-full" : ""}`}
      >
        Connexion en cours…
      </Button>
    );
  }

  return (
    <div className={stacked ? "flex flex-col gap-2 w-full" : "flex items-center gap-3"}>
      <Button
        variant={stacked ? "outline" : "ghost"}
        onClick={handleAuth}
        disabled={!ready}
        className={stacked ? "w-full" : "hidden sm:inline-flex"}
      >
        Se connecter
      </Button>
      <Button
        onClick={handleAuth}
        disabled={!ready}
        className={`bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] font-medium ${stacked ? "w-full" : ""}`}
      >
        Commencer gratuitement
      </Button>
    </div>
  );
}
