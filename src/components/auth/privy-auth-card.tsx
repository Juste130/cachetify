"use client";

import Link from "next/link";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Spinner } from "../ui/spinner";
import { usePrivySync } from "@/hooks/usePrivySync";

interface PrivyAuthCardProps {
    title: string;
    subtitle: string;
    buttonLabel: string;
}

/**
 * Carte de connexion/inscription partagée entre /login et /signup : les deux
 * pages ne diffèrent que par leur texte, le flux Privy est identique.
 */
export function PrivyAuthCard({ title, subtitle, buttonLabel }: PrivyAuthCardProps) {
    const { ready, isSyncing, handleLogin } = usePrivySync();

    if (isSyncing) {
        // Same bare, card-free, bg-background layout as ProtectedRoute's own session-check
        // fallback and the /dashboard route's loading.tsx — the redirect that follows a
        // successful sync hands off directly into one of those two screens, so matching the
        // shape here (rather than a boxed Card on bg-muted) makes the whole login-to-dashboard
        // sequence read as one continuous loading state instead of a jarring style switch.
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 p-4">
                <Link href="/" className="inline-block">
                    <h1 className="text-[#FFC107] text-2xl font-bold">Cachetify</h1>
                </Link>
                <Spinner size="xl" label="Synchronisation de votre compte..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block">
                        <h1 className="text-[#FFC107] mb-2 text-2xl font-bold">Cachetify</h1>
                    </Link>
                    <h2 className="mb-2">{title}</h2>
                    <p className="text-muted-foreground">{subtitle}</p>
                </div>

                <div className="space-y-6">
                    {!ready && (
                        <div className="text-center text-sm text-amber-500 mb-4">
                            ⏳ Chargement de Privy...
                        </div>
                    )}
                    <Button
                        type="button"
                        disabled={!ready}
                        onClick={handleLogin}
                        className="w-full bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] py-6 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {buttonLabel}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground mt-4">
                        L'authentification est gérée de manière sécurisée par Privy. Aucun mot de passe n'est requis.
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                        En continuant, vous acceptez les{" "}
                        <Link href="/legal/cgu" className="underline hover:text-[#FFC107]">Conditions générales</Link>
                        {" "}et la{" "}
                        <Link href="/legal/confidentialite" className="underline hover:text-[#FFC107]">Politique de confidentialité</Link>
                        {" "}de Cachetify.
                    </p>
                </div>
            </Card>
        </div>
    );
}
