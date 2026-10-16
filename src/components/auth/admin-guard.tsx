"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/spinner";

interface AdminGuardProps {
    children: React.ReactNode;
}

/**
 * AdminGuard — Protection côté client des routes /admin/*
 *
 * Vérifie que l'utilisateur authentifié a bien le rôle ADMIN.
 * Si non, redirige immédiatement vers /dashboard.
 *
 * NOTE : Cette protection frontend est une UX-guard (évite le flash de contenu).
 * La vraie protection reste côté backend via le middleware `requireAdmin`.
 */
export function AdminGuard({ children }: AdminGuardProps) {
    const { user, isAuthenticated, isLoading } = useAuthStore();
    const router = useRouter();

    const isAdmin = user?.role === "ADMIN";

    useEffect(() => {
        // Attendre la fin du chargement avant de vérifier
        if (isLoading) return;

        if (!isAuthenticated) {
            router.replace("/login?callbackUrl=/admin");
            return;
        }

        if (!isAdmin) {
            // Utilisateur authentifié mais pas admin → rediriger discrètement
            router.replace("/dashboard");
        }
    }, [isLoading, isAuthenticated, isAdmin, router]);

    // Afficher un spinner pendant le chargement de la session
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Spinner size="xl" label="Vérification des permissions..." />
            </div>
        );
    }

    // Masquer le contenu si l'utilisateur n'est pas admin (évite le flash)
    if (!isAuthenticated || !isAdmin) {
        return null;
    }

    return <>{children}</>;
}
