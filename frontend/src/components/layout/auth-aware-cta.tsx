"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAuthStore } from "@/hooks/useAuth";
import { Button } from "../ui/button";

export function AuthAwareCta() {
  const { ready, authenticated, login } = usePrivy();
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [loginTriggered, setLoginTriggered] = useState(false);

  const isUserLoggedIn = ready && authenticated && isAuthenticated;

  // Ne redirige vers /dashboard que si LA CONNEXION A ETE DECLENCHEE ICI — sinon
  // ce composant (monte sur toutes les pages marketing/legal via LandingHeader et
  // LegalHeader) renverrait vers le dashboard n'importe quel visiteur deja
  // connecte qui consulte simplement une page publique.
  useEffect(() => {
    if (loginTriggered && isUserLoggedIn) {
      router.push("/dashboard");
    }
  }, [loginTriggered, isUserLoggedIn, router]);

  const handleAuth = () => {
    setLoginTriggered(true);
    if (ready && !authenticated) {
      login();
    }
  };

  if (isUserLoggedIn) {
    return (
      <Link href="/dashboard">
        <Button className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] font-medium">
          Accéder à mon espace
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" onClick={handleAuth} disabled={!ready}>
        Se connecter
      </Button>
      <Button
        onClick={handleAuth}
        disabled={!ready}
        className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] font-medium"
      >
        Commencer gratuitement
      </Button>
    </div>
  );
}
