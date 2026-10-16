import { ReactNode, isValidElement } from "react";
import { LegalHeader } from "../layout/legal-header";
import { LegalNav } from "../layout/legal-nav";
import { ReadingProgressBar } from "../layout/reading-progress-bar";
import { LandingFooter } from "../layout/landing-footer";
import { Badge } from "../ui/badge";
import { AlertTriangle, AlertCircle } from "lucide-react";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
  /** True when THIS specific clause is explicitly unfinished in its own text (e.g. "à
   *  préciser", "à compléter") — distinct from the page-wide draft banner below, since not
   *  every section is equally unfinished and a single global warning can't say which is
   *  which. Surfaced both in the sommaire and right next to the section's own heading. */
  incomplete?: boolean;
}

interface LegalPageProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (isValidElement(node)) return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

function IncompleteBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="outline" className={`border-destructive/40 text-destructive gap-1 ${className}`}>
      <AlertCircle className="w-3 h-3" /> Clause incomplète
    </Badge>
  );
}

/**
 * Shared shell for the /legal/* pages. These are placeholders, not finished legal documents —
 * Cachetify had no Terms of Service, Privacy Policy, or Mentions légales at all before this
 * page existed (a real gap for a platform producing legally binding contracts and collecting
 * PII). The honest fix is to say so plainly rather than publish AI-drafted text as if a lawyer
 * had reviewed it; each page's own sections state what governs the platform for now and what
 * is still pending.
 *
 * Takes structured `sections` rather than freeform children — the sommaire, the per-section
 * anchors, and the reading-time estimate all need to know where each section starts and ends,
 * which freeform JSX children can't expose.
 */
export function LegalPage({ title, updatedAt, sections }: LegalPageProps) {
  const wordCount = sections.reduce(
    (total, s) => total + extractText(s.content).trim().split(/\s+/).filter(Boolean).length,
    0
  );
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));
  const incompleteCount = sections.filter((s) => s.incomplete).length;

  return (
    <div className="min-h-screen bg-background">
      <LegalHeader />
      <ReadingProgressBar />
      <main className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <LegalNav />

        <h1 className="mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Dernière mise à jour : {updatedAt} · Environ {readingMinutes} min de lecture
        </p>

        <div className="flex items-start gap-3 p-4 rounded-lg border border-[#FFC107]/30 bg-[#FFC107]/5 mb-6">
          <AlertTriangle className="w-5 h-5 text-[#FFC107] shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ce document est en cours de rédaction par un professionnel du droit et n'a pas encore
            été formellement validé. Il reflète l'intention actuelle de Cachetify, mais ne doit
            pas être considéré comme définitif tant que cette mention n'aura pas été retirée.
            {incompleteCount > 0 && (
              <>
                {" "}
                {incompleteCount} section{incompleteCount > 1 ? "s" : ""} {incompleteCount > 1 ? "sont" : "est"}{" "}
                spécifiquement marquée{incompleteCount > 1 ? "s" : ""}{" "}
                <span className="font-semibold text-destructive">Clause incomplète</span> ci-dessous —
                le reste de ce brouillon est plus stable, en attente de validation juridique globale.
              </>
            )}
          </p>
        </div>

        <nav aria-label="Sommaire" className="mb-10 p-4 rounded-lg border border-border bg-muted/30">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Sommaire</p>
          <ol className="space-y-2 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex items-center gap-2 text-foreground hover:text-[#FFC107] transition-colors">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="flex-1">{s.title}</span>
                  {s.incomplete && <IncompleteBadge className="text-[9px] px-1.5 py-0 shrink-0" />}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="prose prose-sm max-w-none text-foreground space-y-10 leading-relaxed">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="!mb-0">{s.title}</h2>
                {s.incomplete && <IncompleteBadge className="text-[10px]" />}
              </div>
              {s.content}
            </section>
          ))}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
