"use client";

import { PrivyAuthCard } from "../auth/privy-auth-card";

export function LoginPage() {
  return (
    <PrivyAuthCard
      title="Bon retour !"
      subtitle="Connectez-vous à votre compte de manière sécurisée"
      buttonLabel="Se connecter / S'inscrire"
    />
  );
}
