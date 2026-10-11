"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Switch } from "../ui/switch";
import { Separator } from "../ui/separator";
import { useAuthStore } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useWeb3 } from "@/contexts/web3-context";
import { useLogout } from "@/hooks/useLogout";
import { usersApi } from "@/lib/api/users";
import { roleLabel } from "@/lib/user-roles";
import {
  User,
  Brain,
  Lock,
  Bell,
  Shield,
  Wallet,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
} from "lucide-react";

function getChainName(id: number | null) {
  switch (id) {
    case 1: return "Ethereum";
    case 137: return "Polygon";
    case 80002: return "Polygon Amoy Testnet";
    default: return "Réseau inconnu";
  }
}

export function SettingsPage() {
  const [selectedSection, setSelectedSection] = useState("profile");
  const { user, setUser } = useAuthStore();
  const { logout } = useLogout();
  const { account, balance, chainId, isConnected } = useWeb3();
  const { notifySuccess, notifyError } = useNotifications();
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const sections = [
    { id: "profile", label: "Profil", icon: User },
    { id: "wallet", label: "Portefeuille", icon: Wallet },
    { id: "ai", label: "Préférences IA", icon: Brain },
    { id: "security", label: "Sécurité", icon: Lock },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setMessage(null);
    try {
      const formData = new FormData(e.currentTarget as HTMLFormElement);
      const name = formData.get('name') as string;
      const { user: updatedUser } = await usersApi.updateProfile({ name });
      setUser(updatedUser); // Mise à jour silencieuse, sans passer par le spinner plein écran de checkAuth()
      setMessage({ text: "Profil mis à jour avec succès !", type: 'success' });
      notifySuccess("Profil mis à jour", "Vos informations ont été enregistrées avec succès.");
    } catch (err: any) {
      const errMsg = err.response?.data?.error || "Erreur lors de la mise à jour";
      setMessage({ text: errMsg, type: 'error' });
      notifyError("Erreur de mise à jour", errMsg);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        <h1 className="mb-8">Paramètres du compte</h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <Card className="p-4 h-fit">
            <nav className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${selectedSection === section.id
                      ? 'bg-[#FFC107] text-[#212121]'
                      : 'hover:bg-muted'
                      }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* Content */}
          <div className="lg:col-span-3 space-y-6">
            {message && (
              <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <p className="text-sm">{message.text}</p>
              </div>
            )}

            {/* Profile Section */}
            {selectedSection === "profile" && (
              <Card className="p-6">
                <h2 className="mb-6">Profil</h2>

                <form onSubmit={handleUpdateProfile}>
                  <div className="flex items-center gap-6 mb-8">
                    <Avatar className="w-24 h-24">
                      <AvatarFallback className="bg-[#FFC107] text-[#212121] text-2xl font-bold">
                        {user?.email?.[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nom complet</Label>
                      <Input id="name" name="name" defaultValue={user?.profileData?.name || ""} className="bg-input-background" />
                    </div>

                    <div className="space-y-2">
                      <Label>Email (non modifiable)</Label>
                      <Input defaultValue={user?.email} disabled className="bg-muted opacity-60" />
                    </div>

                    <div className="space-y-2">
                      <Label>Rôle</Label>
                      <Input key={user?.role} defaultValue={roleLabel(user?.role)} disabled className="bg-muted opacity-60" />
                    </div>
                  </div>

                  <div className="flex justify-end mt-6">
                    <Button
                      type="submit"
                      disabled={isUpdating}
                      className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
                    >
                      {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Enregistrer les modifications
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Wallet Section — this app auto-provisions an embedded, Privy-managed wallet
                for every account at signup (see providers.tsx: embeddedWallets.createOnLogin
                = 'users-without-wallets'), with gas covered by native sponsorship. There is
                no separate MetaMask-style "connect a wallet" step, so the previous copy —
                a "Connecter mon Wallet" CTA and "Aucun wallet connecté, vous devez connecter
                un wallet comme MetaMask" — described a flow this app doesn't have. The only
                two real states here are "already provisioned" (the normal case, shown as
                soon as the session is authenticated) and "still being created" (a brief
                transient moment right after signup), never "please go connect one yourself". */}
            {selectedSection === "wallet" && (
              <Card className="p-6">
                <h2 className="mb-6">Portefeuille</h2>
                <p className="text-muted-foreground mb-8">
                  Un portefeuille numérique sécurisé a été créé automatiquement pour votre compte — il sert à signer vos contrats sur la blockchain. Aucune action de votre part n'est nécessaire.
                </p>

                {isConnected ? (
                  <div className="space-y-6">
                    <div className="p-6 bg-muted rounded-xl border border-border">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium text-lg">Portefeuille actif</p>
                          <p className="text-sm text-muted-foreground">{getChainName(chainId)}</p>
                        </div>
                      </div>

                      <details className="group">
                        <summary className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5 mb-2">
                          Détails techniques
                          <span className="transition-transform group-open:rotate-180">▾</span>
                        </summary>
                        <div className="space-y-3 pt-2 border-t border-border/50">
                          <div className="flex items-center justify-between text-sm py-2 border-b border-border/50">
                            <span className="text-muted-foreground">Adresse</span>
                            <span className="font-mono text-xs bg-card px-2 py-1 rounded break-all">{account}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm py-2 border-b border-border/50">
                            <span className="text-muted-foreground">Solde</span>
                            <span className="font-bold">{balance ? parseFloat(balance).toFixed(4) : "0.0000"} MATIC</span>
                          </div>
                          <div className="flex items-center justify-between text-sm py-2">
                            <span className="text-muted-foreground">Chain ID</span>
                            <span>{chainId}</span>
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-4">
                      <Shield className="w-6 h-6 text-primary mt-1" />
                      <div>
                        <p className="text-sm font-medium">Sécurité</p>
                        <p className="text-xs text-muted-foreground">
                          Votre clé privée n'est jamais stockée sur nos serveurs. Les frais de transaction sont pris en charge par Cachetify — vous n'avez jamais besoin d'acheter de cryptomonnaie.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Loader2 className="w-10 h-10 text-[#FFC107] animate-spin mx-auto mb-6" />
                    <h3 className="mb-2">Préparation de votre portefeuille...</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      Cela ne prend que quelques secondes. Si ce message persiste, essayez de rafraîchir la page.
                    </p>
                  </div>
                )}
              </Card>
            )}

            {/* AI Preferences Section — the two switches below used to be `defaultChecked`
                with no `onCheckedChange` and no backend concept of a per-user AI
                preference at all: every contract generation and every compliance check
                always runs, unconditionally, for every user (see backend/services/ai.js /
                controllers/ai.js — nothing there reads a per-user flag). Toggling them did
                nothing beyond a visual flip that reset on reload. Rather than leave a
                switch a user can flip with no effect (or silently wire up a preference the
                backend still wouldn't honor), they're marked unimplemented — same honest
                "Bientôt disponible" language already used for the model selector right
                below, and elsewhere in the app (templates page, admin feature flags). */}
            {selectedSection === "ai" && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Brain className="w-6 h-6 text-[#9C27B0]" />
                  <h2>Préférences IA</h2>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between opacity-60">
                    <div className="flex-1">
                      <h4 className="mb-1 flex items-center gap-2">
                        Suggestions automatiques
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">Bientôt disponible</span>
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        L'IA propose des améliorations pendant la rédaction. Actuellement toujours active pour tous les comptes — ce réglage ne fait encore rien.
                      </p>
                    </div>
                    <Switch checked disabled />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between opacity-60">
                    <div className="flex-1">
                      <h4 className="mb-1 flex items-center gap-2">
                        Vérification juridique
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">Bientôt disponible</span>
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        L'IA vérifie la conformité juridique des contrats. Actuellement toujours active pour tous les comptes — ce réglage ne fait encore rien.
                      </p>
                    </div>
                    <Switch checked disabled />
                  </div>

                  <div className="space-y-2">
                    <Label>Modèle IA</Label>
                    <div className="w-full p-2.5 rounded-lg border border-border bg-muted/50 text-sm flex items-center justify-between">
                      <span className="font-medium">GPT-OSS 120B (via Groq)</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Configuré par l'administrateur</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Le choix du modèle par utilisateur n'est pas encore disponible — tous les contrats sont générés avec ce modèle pour le moment.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Security Section */}
            {selectedSection === "security" && (
              <Card className="p-6">
                <h2 className="mb-6">Sécurité</h2>

                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <KeyRound className="w-6 h-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Authentification gérée par Privy</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ce compte n'a pas de mot de passe : la connexion se fait via votre email
                        et votre wallet, gérés de bout en bout par Privy. Il n'y a rien à
                        configurer ici — la sécurité de votre compte dépend uniquement de
                        l'accès à cet email et à ce wallet.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Email du compte</Label>
                    <Input defaultValue={user?.email} disabled className="bg-muted opacity-60" />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="mb-1">Déconnexion</h4>
                      <p className="text-sm text-muted-foreground">
                        Met fin à votre session Cachetify et déconnecte votre wallet Privy sur cet appareil.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => { void logout(); }}
                      className="text-destructive hover:text-destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Se déconnecter
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Notifications Section — both switches previously had no onCheckedChange and
                the "Enregistrer" button below had no onClick at all: clicking it did
                nothing, no request was ever sent, yet the button visually promised a save
                exactly like the Profile section's real one does. Two different underlying
                truths here, so two different honest treatments instead of one blanket
                "coming soon": signature alerts are real and already working (in-app +
                email, unconditionally, for every relevant party — see blockchain-sync.js /
                contract.js) but not yet possible to opt out of per-user; the newsletter
                toggle has no backend behind it at all (no marketing email system exists in
                this codebase) and is the one that's genuinely unbuilt. */}
            {selectedSection === "notifications" && (
              <Card className="p-6">
                <h2 className="mb-6">Notifications</h2>

                <div className="space-y-6">
                  <div className="flex items-center justify-between opacity-60">
                    <div className="flex-1">
                      <h4 className="mb-1">Alertes de signature</h4>
                      <p className="text-sm text-muted-foreground">
                        Être prévenu quand une partie signe un contrat. Toujours actif — la désactivation individuelle n'est pas encore disponible.
                      </p>
                    </div>
                    <Switch checked disabled />
                  </div>
                  <div className="flex items-center justify-between opacity-60">
                    <div className="flex-1">
                      <h4 className="mb-1 flex items-center gap-2">
                        Newsletters et mises à jour
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">Bientôt disponible</span>
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Recevoir nos actualités et nouveaux modèles
                      </p>
                    </div>
                    <Switch disabled />
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
    </main>
  );
}


