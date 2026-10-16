"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AuthAwareCta } from "./auth-aware-cta";
import { SealMark } from "./seal-mark";

const NAV_LINKS = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#how-it-works", label: "Comment ça marche" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  // Sous `lg` (tablettes comprises), la nav et les deux boutons ne tiennent pas sur une
  // ligne : ils passent dans un menu déroulant ouvert par le bouton hamburger.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <SealMark className="w-8 h-8 shrink-0" />
            <span className="text-[#FFC107] text-lg font-bold tracking-tight">Cachetify</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-foreground hover:text-[#FFC107] transition-colors">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:block">
            <AuthAwareCta />
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-foreground hover:bg-muted transition-colors"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="landing-mobile-menu" className="lg:hidden border-t border-border bg-white">
          <nav className="container mx-auto px-4 sm:px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="py-3 px-2 rounded-md text-foreground hover:bg-muted hover:text-[#FFC107] transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 mt-2 border-t border-border">
              <AuthAwareCta variant="stacked" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
