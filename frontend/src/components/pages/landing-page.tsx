import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { LandingHeader } from "../layout/landing-header";
import { LandingFooter } from "../layout/landing-footer";
import { Zap, Shield, Smile, Brain } from "lucide-react";
import { AiBadge } from "../ui/ai-badge";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { SealMark } from "../layout/seal-mark";

export function LandingPage() {
  const features = [
    {
      icon: Zap,
      title: "Rapidité",
      description: "Créez et signez vos contrats en quelques minutes grâce à l'IA"
    },
    {
      icon: Shield,
      title: "Sécurité",
      description: "Vos données sont chiffrées et vos contrats ancrés sur la blockchain"
    },
    {
      icon: Smile,
      title: "Simplicité",
      description: "Interface intuitive, aucune formation requise"
    }
  ];

  const howItWorks = [
    {
      step: "1",
      title: "Rédigez ou Importez",
      description: "Générez un contrat sur mesure avec notre IA spécialisée (Droit OHADA/Bénin) ou importez directement votre propre PDF."
    },
    {
      step: "2",
      title: "Invitez et Signez",
      description: "Ajoutez les adresses emails de vos signataires. Ils signent numériquement après une vérification d'identité sécurisée."
    },
    {
      step: "3",
      title: "Sécurisation Blockchain",
      description: "Votre contrat est chiffré et conservé en sécurité ; son empreinte et ses signatures sont ancrées sur la blockchain pour garantir leur intégrité."
    }
  ];

  const faqs = [
    {
      question: "Comment fonctionne la génération de contrats par IA ?",
      answer: "Notre IA analyse vos besoins et génère automatiquement un contrat conforme aux normes juridiques. Vous n'avez qu'à remplir un formulaire simple avec les informations clés, et l'IA rédige le document complet en quelques secondes."
    },
    {
      question: "Mes données sont-elles sécurisées ?",
      answer: "Vos données sont chiffrées, et chaque contrat est ancré sur Polygon, un réseau blockchain public, ce qui garantit l'intégrité et la traçabilité de tous vos contrats."
    },
    {
      question: "Puis-je personnaliser les modèles générés par l'IA ?",
      answer: "Oui, tous les contrats générés peuvent être modifiés selon vos besoins. L'IA propose une base solide que vous pouvez ajuster avec notre éditeur intuitif."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-[#FFC107]/10 px-4 py-2 rounded-full mb-6">
              <AiBadge />
              <span className="text-sm">Propulsé par l'intelligence artificielle</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl mb-6 max-w-4xl mx-auto">
              Simplifiez la gestion de vos contrats
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Créez, signez et gérez tous vos contrats en un seul endroit.
              L'IA rédige vos documents en quelques secondes.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button
                  className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] px-8 py-6"
                >
                  Commencer gratuitement
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button
                  variant="outline"
                  className="px-8 py-6"
                >
                  Comment ça marche
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-14 flex justify-center">
            {/* A generic stock photo mislabeled "Dashboard Cachetify" used to sit here — not
                an actual screenshot of the product, and full-width enough to dominate the hero.
                This is an honest illustration instead: it doesn't claim to be product UI, and
                stays a supporting visual rather than the first thing a visitor's eye lands on. */}
            <div className="relative w-full max-w-sm">
              <div className="absolute -inset-3 bg-gradient-to-br from-[#FFC107]/15 to-transparent rounded-3xl blur-xl" aria-hidden="true" />
              <div className="relative bg-card border border-border rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contrat de prestation</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#4CAF50] bg-[#4CAF50]/10 px-2 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4CAF50]" /> Signé
                  </span>
                </div>
                <div className="space-y-2 mb-5">
                  <div className="h-2.5 bg-muted rounded w-full" />
                  <div className="h-2.5 bg-muted rounded w-11/12" />
                  <div className="h-2.5 bg-muted rounded w-4/5" />
                  <div className="h-2.5 bg-muted rounded w-full" />
                  <div className="h-2.5 bg-muted rounded w-3/5" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <SealMark className="w-7 h-7 shrink-0" />
                    <span className="text-[11px] text-muted-foreground font-mono">Ancré · Polygon</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">a3f9…c21e</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="mb-4">Pourquoi choisir Cachetify ?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Une solution complète pour transformer votre gestion de contrats
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="p-8 text-center hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 mx-auto mb-4 bg-[#FFC107]/10 rounded-2xl flex items-center justify-center">
                    <Icon className="w-8 h-8 text-[#FFC107]" />
                  </div>
                  <h3 className="mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 mb-4">
                <Brain className="w-6 h-6 text-[#9C27B0]" />
                <AiBadge />
              </div>

              <h2 className="mb-6">Rédaction automatique par IA</h2>

              <p className="text-muted-foreground mb-6">
                Notre intelligence artificielle avancée analyse vos besoins et génère
                automatiquement des contrats professionnels conformes aux normes juridiques.
              </p>

              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#4CAF50]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[#4CAF50]">✓</span>
                  </div>
                  <div>
                    <h4 className="mb-1">Génération instantanée</h4>
                    <p className="text-sm text-muted-foreground">
                      Créez un contrat complet en moins de 30 secondes
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#4CAF50]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[#4CAF50]">✓</span>
                  </div>
                  <div>
                    <h4 className="mb-1">Conformité juridique</h4>
                    <p className="text-sm text-muted-foreground">
                      Tous les contrats respectent la législation en vigueur
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#4CAF50]/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[#4CAF50]">✓</span>
                  </div>
                  <div>
                    <h4 className="mb-1">Personnalisation facile</h4>
                    <p className="text-sm text-muted-foreground">
                      Modifiez et ajustez chaque clause selon vos besoins
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-[#9C27B0]/10 to-[#FFC107]/10 rounded-2xl p-8 border border-border">
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-8 h-8 text-[#9C27B0]" />
                  <div className="flex-1">
                    <div className="h-2 bg-[#9C27B0]/20 rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-[#9C27B0] animate-pulse"></div>
                    </div>
                  </div>
                </div>
                <p className="text-[#9C27B0] text-sm mb-4">IA rédige votre contrat...</p>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded w-full"></div>
                  <div className="h-3 bg-muted rounded w-5/6"></div>
                  <div className="h-3 bg-muted rounded w-4/6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="how-it-works" className="py-20 bg-muted px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="mb-4 text-3xl font-bold">Comment ça marche ?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Un processus simple en trois étapes pour créer, faire signer et sécuriser vos documents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-border -translate-y-1/2 z-0" />
            
            {howItWorks.map((item, index) => (
              <Card key={index} className="p-8 text-center relative z-10 bg-background border-2 hover:border-[#FFC107] transition-colors">
                <div className="w-12 h-12 mx-auto mb-6 bg-[#FFC107] text-[#212121] rounded-full flex items-center justify-center font-bold text-xl shadow-lg">
                  {item.step}
                </div>
                <h3 className="mb-4 text-xl font-semibold">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="mb-4">Questions fréquentes</h2>
            <p className="text-muted-foreground">
              Tout ce que vous devez savoir sur Cachetify
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border border-border rounded-lg px-6">
                <AccordionTrigger>{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#FFC107] to-[#FFB300]">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-[#212121] mb-6">
            Prêt à simplifier vos contrats ?
          </h2>
          <p className="text-[#212121]/80 text-xl mb-8">
            Rejoignez les entreprises et indépendants qui font confiance à Cachetify
          </p>
          <Link href="/signup">
            <Button
              className="bg-[#212121] text-white hover:bg-[#212121]/90 px-8 py-6"
            >
              Commencer gratuitement
            </Button>
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
