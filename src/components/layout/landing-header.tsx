import Link from "next/link";
import { AuthAwareCta } from "./auth-aware-cta";
import { SealMark } from "./seal-mark";

export function LandingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <SealMark className="w-8 h-8 shrink-0" />
            <span className="text-[#FFC107] text-lg font-bold tracking-tight">Cachetify</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-foreground hover:text-[#FFC107] transition-colors">
              Fonctionnalités
            </a>
            <a href="#how-it-works" className="text-foreground hover:text-[#FFC107] transition-colors">
              Comment ça marche
            </a>
            <a href="#faq" className="text-foreground hover:text-[#FFC107] transition-colors">
              FAQ
            </a>
          </nav>

          <AuthAwareCta />
        </div>
      </div>
    </header>
  );
}
