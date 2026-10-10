"use client";

import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { AiBadge } from "../ui/ai-badge";
import { Input } from "../ui/input";
import {
  Briefcase,
  Users,
  Home,
  FileSignature,
  Plus,
  Search,
  LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TemplateSelector } from "@/components/contract/templateSelector";
import { CONTRACT_TEMPLATES } from "@/lib/contract-templates";

// Purely cosmetic — the actual list of supported contract types (fields, prompt content)
// lives in @/lib/contract-templates and is shared with the creation wizard.
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  cdi: Briefcase,
  cdd: Briefcase,
  freelance: Users,
  location: Home,
  nda: FileSignature,
  commercial: Briefcase,
  custom: FileSignature,
};

// Kept disabled for now: this page duplicated the template picker already built into the
// create-contract wizard's step 1 without adding anything the wizard doesn't already do,
// and "Mes modèles personnalisés" was a permanent dead empty state. Rather than delete the
// gallery code, it's gated behind this flag so it's a one-line flip once this page has a
// real reason to exist (e.g. actual custom template management, usage stats, search).
const GALLERY_ENABLED: boolean = false;

export function TemplatesPage() {
  const router = useRouter();

  const aiTemplates = CONTRACT_TEMPLATES.filter((t) => t.id !== "custom").map((t) => ({
    id: t.id,
    name: t.name,
    icon: TEMPLATE_ICONS[t.id] ?? FileSignature,
    description: t.description,
  }));

  if (!GALLERY_ENABLED) {
    return (
      <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300 flex items-center justify-center" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        <Card className="p-12 text-center max-w-md">
          <FileSignature className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="mb-2">Modèles de contrats</h1>
          <p className="text-muted-foreground mb-6">
            Cette page arrive prochainement. Pour créer un contrat, utilisez directement le bouton ci-dessous : le choix du type de contrat s'y fait déjà à la première étape.
          </p>
          <Link href="/create-contract">
            <Button className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]">
              <Plus className="w-5 h-5 mr-2" />
              Créer un contrat
            </Button>
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="mb-2">Modèles de contrats</h1>
            <p className="text-muted-foreground">
              Utilisez nos modèles générés par IA ou créez les vôtres
            </p>
          </div>
          <Link href="/create-contract">
            <Button
              className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
            >
              <Plus className="w-5 h-5 mr-2" />
              Créer un modèle
            </Button>
          </Link>
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Rechercher un modèle..."
            className="pl-10 bg-card"
          />
        </div>

        {/* AI Templates */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2>Modèles générés par IA</h2>
            <AiBadge />
          </div>

          <TemplateSelector
            templates={aiTemplates.map(t => ({ ...t, isAi: true }))}
            onSelect={(tpl) => router.push(`/create-contract?template=${tpl.id}`)}
          />
        </div>

        {/* Custom Templates — not implemented yet; shown as an honest "coming soon" rather
            than a dead-empty table with buttons that would never do anything. */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <h2>Mes modèles personnalisés</h2>
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-muted text-muted-foreground">
              Bientôt disponible
            </span>
          </div>

          <Card className="p-12 text-center">
            <Plus className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="mb-2">Bientôt disponible</h3>
            <p className="text-muted-foreground">
              La création de modèles personnalisés arrive prochainement. En attendant, utilisez l'un des modèles générés par IA ci-dessus.
            </p>
          </Card>
        </div>
      </main>
  );
}
