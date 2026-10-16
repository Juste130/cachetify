"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuth";
import { useWeb3 } from "@/contexts/web3-context";

/**
 * Déconnexion complète et réelle : nettoie la session applicative (cookies
 * httpOnly backend) ET déconnecte Privy (wallet inclus), puis redirige vers
 * /login. Les deux étapes sont indépendantes l'une de l'autre : si l'une
 * échoue, l'utilisateur est quand même déconnecté et redirigé.
 */
export function useLogout() {
    const router = useRouter();
    const storeLogout = useAuthStore((state) => state.logout);
    const { disconnect } = useWeb3();

    const logout = useCallback(async () => {
        try {
            await storeLogout();
        } catch {
            // storeLogout gère déjà ses propres erreurs et nettoie le state local
        }
        try {
            disconnect();
        } catch {
            // Privy peut lever si déjà déconnecté ou non initialisé, sans conséquence
        }
        router.push("/login");
    }, [storeLogout, disconnect, router]);

    return { logout };
}
