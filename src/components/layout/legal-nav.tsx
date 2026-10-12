"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/utils";

const LEGAL_PAGES = [
  { href: "/legal/cgu", label: "Conditions générales" },
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/mentions-legales", label: "Mentions légales" },
];

/**
 * The three /legal/* pages previously only linked to each other via the footer at the very
 * bottom of the page — reachable, but only after scrolling past a long document each time.
 * This pill switcher sits at the top of every legal page instead, so moving between them
 * doesn't cost a full scroll round-trip.
 */
export function LegalNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 mb-8" aria-label="Documents légaux">
      {LEGAL_PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition-colors",
              active
                ? "bg-[#212121] text-white border-[#212121]"
                : "border-border text-muted-foreground hover:border-[#FFC107] hover:text-foreground"
            )}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
