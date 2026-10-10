"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { StatCard } from "../ui/stat-card";
import { StatusBadge } from "../ui/status-badge";
import { Spinner } from "../ui/spinner";
import { FileText, Clock, CheckCircle2, AlertCircle, TrendingUp, Plus, Settings, ShieldAlert, XCircle, FileClock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Link from "next/link";
import { useAuthStore } from "@/hooks/useAuth";
import { contractsApi } from "@/lib/api/contracts";
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import { fr } from 'date-fns/locale';
import { getDisplayName } from "@/lib/utils/displayName";
import { getEffectiveStatus, getStatusBadgeVariant } from "@/lib/contract-status";
import { InviteUserDialog } from "@/components/shared/invite-user-dialog";
import { UserPlus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { IdentityVerificationModal } from "@/components/kyc/identity-verification-modal";

// Statuts qui nécessitent encore une action de l'utilisateur (inscription des
// signataires, déploiement, ou signature) — cohérent avec le badge "En attente"
// affiché ailleurs dans l'app (ex. liste des contrats).
const NEEDS_ACTION_STATUSES = ['DRAFT_WAITING_SIGNERS', 'READY_TO_DEPLOY', 'PENDING_SIGNATURES'];

export function DashboardPage() {
  const { user } = useAuthStore();
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const { data: contractsData, isLoading, error } = useQuery({
    queryKey: ['contracts', 'cached'],
    queryFn: () => contractsApi.getCachedContracts({ limit: 10 }),
  });

  const contracts = contractsData?.contracts || [];

  // Comptes exacts (indépendants de la pagination de la liste ci-dessus, qui
  // ne charge que les 10 contrats les plus récents et sous-compterait les
  // stats au-delà de ce seuil).
  const { data: summary } = useQuery({
    queryKey: ['contracts', 'summary'],
    queryFn: () => contractsApi.getContractsSummary(),
  });

  const byStatus = summary?.byStatus || {};
  const pendingCount = NEEDS_ACTION_STATUSES.reduce((sum, status) => sum + (byStatus[status] || 0), 0);
  const activeCount = byStatus['ACTIVE'] || 0;
  const completedCount = byStatus['COMPLETED'] || 0;
  const totalCount = summary?.total || 0;

  const stats = [
    {
      title: "Contrats en attente",
      value: pendingCount,
      icon: Clock,
      iconColor: "#FFC107",
      trend: { value: "Nécessite action", isPositive: false }
    },
    {
      title: "Contrats Actifs",
      value: activeCount,
      icon: CheckCircle2,
      iconColor: "#4CAF50",
      trend: { value: "Total: " + totalCount, isPositive: true }
    },
    {
      // "IPFS" names an implementation detail this audience has no reason to know — the
      // point they actually care about (their documents are safely, permanently stored)
      // survives the rename; the acronym doesn't need to.
      title: "Documents sécurisés",
      value: summary?.withIpfs || 0,
      icon: FileText,
      iconColor: "#2196F3",
      trend: { value: "Stockage permanent", isPositive: true }
    },
    {
      // "Engagement" didn't say what was actually being measured — the number is the share
      // of contracts that made it to Active/Completed, which "Taux de finalisation" names
      // directly instead of requiring the reader to guess from a vague business-speak label.
      title: "Taux de finalisation",
      value: totalCount > 0 ? `${Math.round(((activeCount + completedCount) / totalCount) * 100)}%` : "0%",
      icon: TrendingUp,
      iconColor: "#9C27B0",
      trend: { value: `${activeCount + completedCount} sur ${totalCount} contrat${totalCount > 1 ? "s" : ""}`, isPositive: true }
    }
  ];

  // Status -> the icon/color shown next to a Recent Activities row. Previously a 2-letter
  // avatar built from the contract TITLE ("Ma" for "Ma Société SAS / Jean Dupont") — it read
  // as a person's initials (that's what an Avatar normally means) but was never a person, and
  // duplicated information the StatusBadge right next to it already carried more accurately.
  // This shows the one thing an avatar-shaped slot can usefully add here: status at a glance.
  const ACTIVITY_ICON_CONFIG: Record<string, { icon: typeof Clock; bg: string; color: string }> = {
    draft: { icon: FileClock, bg: "#E3F2FD", color: "#1565C0" },
    pending: { icon: Clock, bg: "#FFC107", color: "#212121" },
    signed: { icon: CheckCircle2, bg: "#4CAF50", color: "#FFFFFF" },
    completed: { icon: CheckCircle2, bg: "#4CAF50", color: "#FFFFFF" },
    cancelled: { icon: XCircle, bg: "#9E9E9E", color: "#FFFFFF" },
    disputed: { icon: ShieldAlert, bg: "#d4183d", color: "#FFFFFF" },
    terminated: { icon: XCircle, bg: "#d4183d", color: "#FFFFFF" },
    resigned: { icon: XCircle, bg: "#d4183d", color: "#FFFFFF" },
    expired: { icon: Clock, bg: "#9E9E9E", color: "#FFFFFF" },
  };

  // Was collapsed to a binary signed/created, so a disputed or terminated contract showed
  // up here with the same "pending" badge as one still waiting on a signature — actively
  // misleading about what state it's really in. Uses the same status mapping as every other
  // contract list in the app instead of a one-off simplification specific to this card.
  const recentActivities = contracts.slice(0, 5).map(c => ({
    id: c.id,
    badgeStatus: getStatusBadgeVariant(getEffectiveStatus(c)),
    contract: c.title,
    time: formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: fr }),
  }));

  const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const now = new Date();
  const chartData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const count = contracts.filter(c => {
      const created = new Date(c.createdAt);
      return created.getFullYear() === d.getFullYear() && created.getMonth() === d.getMonth();
    }).length;
    return { month: MONTH_LABELS[d.getMonth()], contrats: count };
  });

  return (
    <>
      <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="mb-2">Bonjour, {getDisplayName(user)} 👋</h1>
            <p className="text-muted-foreground">
              Voici un aperçu de vos contrats aujourd'hui
            </p>
          </div>
          <Link href="/create-contract">
            <Button
              className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nouveau contrat
            </Button>
          </Link>
        </div>

        {/* Framed as a benefit, not a warning — dismissible in spirit (it just stops
            appearing once VERIFIED, no "hide forever" needed since it's a small, calm card
            rather than an interruption). The sidebar badge covers "I want to do this from
            any other page"; this card covers "I want to be told this is worth doing at all". */}
        {user && user.kycStatus !== "VERIFIED" && (
          <Card className="p-5 mb-8 border-primary/20 bg-primary/5 flex items-center gap-4 flex-wrap">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="font-semibold text-sm">Renforcez la valeur légale de vos signatures</p>
              <p className="text-xs text-muted-foreground">
                {user.kycStatus === "PENDING"
                  ? "Vérification en cours — vous serez prévenu dès que c'est prêt."
                  : "Une seule vérification d'identité, valable pour tous vos contrats futurs."}
              </p>
            </div>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
              onClick={() => setShowVerifyModal(true)}
              disabled={user.kycStatus === "PENDING"}
            >
              {user.kycStatus === "PENDING" ? "En cours..." : "Vérifier mon identité"}
            </Button>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" label="Chargement de vos données..." />
          </div>
        ) : error ? (
          <Card className="p-8 text-center text-destructive">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" />
            <p>Erreur lors de la récupération des contrats. Veuillez réessayer.</p>
          </Card>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat, index) => (
                <StatCard key={index} {...stat} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Recent Activities */}
              <Card className="lg:col-span-2 p-6">
                <h3 className="mb-6">Activités récentes</h3>
                {recentActivities.length > 0 ? (
                  <div className="space-y-4">
                    {recentActivities.map((activity) => {
                      const iconConfig = ACTIVITY_ICON_CONFIG[activity.badgeStatus] || ACTIVITY_ICON_CONFIG.pending;
                      const ActivityIcon = iconConfig.icon;
                      return (
                        <div key={activity.id} className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: iconConfig.bg }}
                          >
                            <ActivityIcon className="w-5 h-5" style={{ color: iconConfig.color }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{activity.contract}</p>
                            <p className="text-xs text-muted-foreground">{activity.time}</p>
                          </div>
                          <StatusBadge status={activity.badgeStatus as any} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucune activité récente. Créez votre premier contrat pour commencer !
                  </div>
                )}
              </Card>

              {/* Quick Actions */}
              <Card className="p-6">
                <h3 className="mb-6">Actions rapides</h3>
                <div className="space-y-3">
                  <Link href="/create-contract">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nouveau contrat
                    </Button>
                  </Link>
                  <Link href="/templates">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Voir les modèles
                    </Button>
                  </Link>
                  {/* Every account gets its blockchain wallet automatically at signup
                      (embedded, Privy-managed) — there is nothing for the user to
                      "configure". A generic settings shortcut replaces the old
                      "Configurer mon wallet" button, which pointed at a wallet-connection
                      flow (MetaMask-style) this app doesn't actually have. */}
                  <Link href="/settings">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Paramètres du compte
                    </Button>
                  </Link>
                  <InviteUserDialog
                    trigger={
                      <Button variant="outline" className="w-full justify-start">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Inviter un collaborateur
                      </Button>
                    }
                  />
                </div>
              </Card>
            </div>

            {/* Attention-needed: signature-flow items (an inscription, deployment or
                signature the user can act on right now) plus disputes (nothing to click to
                "resolve" directly, but the single most urgent thing to be aware of — a
                dispute was previously invisible on the dashboard entirely, surfaced only by
                digging into the contract's own page). Disputes sort first and get a red
                left border + alert icon so they read as a different kind of urgency than a
                routine "waiting on a signature" item. */}
            <Card className="p-6 mb-8">
              <h3 className="mb-6">Contrats nécessitant votre attention</h3>
              {(() => {
                const pendingItems = contracts.filter(c => NEEDS_ACTION_STATUSES.includes(c.status));
                const disputedItems = contracts.filter(c => getEffectiveStatus(c) === 'DISPUTED');
                const attentionItems = [...disputedItems, ...pendingItems].slice(0, 4);

                if (attentionItems.length === 0) {
                  return (
                    <div className="text-center py-4 text-muted-foreground">
                      Tout est à jour ! Aucun document en attente.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {attentionItems.map((contract) => {
                      const isDisputed = getEffectiveStatus(contract) === 'DISPUTED';
                      return (
                        <Link href={`/contract-details?id=${contract.contractId ?? contract.id}`} key={contract.id}>
                          <div
                            className={`flex items-center gap-4 p-4 rounded-lg hover:bg-muted/80 cursor-pointer transition-colors ${
                              isDisputed ? "bg-destructive/5 border-l-4 border-destructive" : "bg-muted"
                            }`}
                          >
                            {isDisputed && <ShieldAlert className="w-5 h-5 text-destructive shrink-0" />}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{contract.title}</p>
                              <p className="text-xs text-muted-foreground">
                                Créé le {new Date(contract.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <StatusBadge status={isDisputed ? "disputed" : "pending"} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>

            {/* Progress Chart — a 6-month trend line is meaningless (and looks broken: one
                dot on an otherwise flat axis) for a brand-new account with a contract or two.
                Below this threshold, an encouraging empty state replaces it; the chart only
                earns its place once there's enough history to actually show a trend. */}
            <Card className="p-6">
              <h3 className="mb-6">Progression mensuelle</h3>
              {totalCount < 3 ? (
                <div className="text-center py-12">
                  <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                  <h4 className="mb-2">Pas encore assez d'historique</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    La tendance de vos contrats apparaîtra ici une fois que vous en aurez créé quelques-uns de plus.
                  </p>
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                      <XAxis dataKey="month" stroke="#9E9E9E" />
                      <YAxis stroke="#9E9E9E" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #E5E5E5',
                          borderRadius: '8px'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="contrats"
                        stroke="#FFC107"
                        strokeWidth={3}
                        dot={{ fill: '#FFC107', r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </>
        )}
      </main>
      <IdentityVerificationModal open={showVerifyModal} onClose={() => setShowVerifyModal(false)} />
    </>
  );
}