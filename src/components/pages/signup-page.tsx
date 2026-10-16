"use client";

import { PrivyAuthCard } from "../auth/privy-auth-card";

export function SignupPage() {
  return (
    <PrivyAuthCard
      title="Créer votre compte"
      subtitle="Commencez gratuitement dès aujourd'hui"
      buttonLabel="S'inscrire / Se connecter"
    />
  );
}
