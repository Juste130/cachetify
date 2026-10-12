import Link from "next/link";
import { AuthAwareCta } from "./auth-aware-cta";
import { SealMark } from "./seal-mark";

/**
 * A dedicated header for /legal/* pages — NOT LandingHeader. LandingHeader's nav
 * (#features/#how-it-works/#faq) only resolves on the landing page itself; clicked from a
 * legal document, those links yanked the reader to "/#features" and out of the document they
 * were reading. AuthAwareCta is kept (it already does the right thing either way: "Accéder à
 * mon espace" when logged in, "Se connecter"/"Commencer gratuitement" otherwise) — only the
 * marketing nav in the middle is dropped.
 */
export function LegalHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <SealMark className="w-8 h-8 shrink-0" />
            <span className="text-[#FFC107] text-lg font-bold tracking-tight">Cachetify</span>
          </Link>
          <AuthAwareCta />
        </div>
      </div>
    </header>
  );
}
