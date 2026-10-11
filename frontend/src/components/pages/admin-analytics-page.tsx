"use client";

import { useState, useEffect } from "react";
import apiClient from "@/lib/api/client";
import { analyticsApi, MonthlyStat } from "@/lib/api/analytics";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Users, FileText, CheckCircle } from "lucide-react";

export function AdminAnalyticsPage() {
    const [stats, setStats] = useState({ totalUsers: 0, totalContracts: 0, signedContracts: 0 });
    const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
    const [userGrowthPercent, setUserGrowthPercent] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartsLoading, setChartsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // "FINALIZED" n'est pas un statut valide (voir l'enum ContractStatus :
                // DRAFT_WAITING_SIGNERS | READY_TO_DEPLOY | DRAFT | PENDING_SIGNATURES |
                // ACTIVE | COMPLETED | CANCELLED | DISPUTED | TERMINATED | RESIGNED) — un
                // contrat est considéré "signé" une fois toutes les signatures collectées,
                // ce qui correspond aux statuts ACTIVE et COMPLETED. On utilise `total` de
                // chaque requête filtrée par statut (comptage exact côté serveur) plutôt que
                // de filtrer un tableau de contrats, qui serait tronqué par la pagination.
                const [usersRes, contractsRes, activeRes, completedRes] = await Promise.all([
                    apiClient.get('/api/users?limit=1'),
                    apiClient.get('/api/contracts/admin/all?limit=1'),
                    apiClient.get('/api/contracts/admin/all?limit=1&status=ACTIVE'),
                    apiClient.get('/api/contracts/admin/all?limit=1&status=COMPLETED'),
                ]);
                const totalContracts = contractsRes.data.pagination?.total || 0;
                const signedContracts =
                    (activeRes.data.pagination?.total || 0) + (completedRes.data.pagination?.total || 0);
                setStats({
                    totalUsers: usersRes.data.pagination?.total || 0,
                    totalContracts,
                    signedContracts,
                });
            } catch (error) {
                console.error('Error fetching analytics:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    useEffect(() => {
        const fetchMonthly = async () => {
            try {
                const res = await analyticsApi.getMonthlyStats(6);
                setMonthly(res.months);
                setUserGrowthPercent(res.userGrowthPercent);
            } catch (error) {
                console.error('Error fetching monthly analytics:', error);
            } finally {
                setChartsLoading(false);
            }
        };
        fetchMonthly();
    }, []);

    return (
        <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
                <div className="mb-8">
                    <h1 className="mb-2">Analytics</h1>
                    <p className="text-muted-foreground">
                        Statistiques et tendances de la plateforme
                    </p>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#4CAF50]/10 flex items-center justify-center">
                                <Users className="w-6 h-6 text-[#4CAF50]" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Utilisateurs totaux</p>
                                <p className="text-2xl font-bold">{loading ? '…' : stats.totalUsers}</p>
                                <p className="text-xs text-[#4CAF50] flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    En direct
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#FFC107]/10 flex items-center justify-center">
                                <FileText className="w-6 h-6 text-[#FFC107]" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Contrats créés</p>
                                <p className="text-2xl font-bold">{loading ? '…' : stats.totalContracts}</p>
                                <p className="text-xs text-[#4CAF50] flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    En direct
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#9C27B0]/10 flex items-center justify-center">
                                <CheckCircle className="w-6 h-6 text-[#9C27B0]" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Taux de signature</p>
                                <p className="text-2xl font-bold">
                                    {loading ? '…' : stats.totalContracts > 0
                                        ? `${Math.round((stats.signedContracts / stats.totalContracts) * 100)}%`
                                        : 'N/A'}
                                </p>
                                <p className="text-xs text-[#4CAF50] flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" />
                                    En direct
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-[#2196F3]/10 flex items-center justify-center">
                                <TrendingUp className="w-6 h-6 text-[#2196F3]" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Croissance utilisateurs</p>
                                <p className="text-2xl font-bold">
                                    {chartsLoading ? '…' : userGrowthPercent === null ? 'N/A' : `${userGrowthPercent > 0 ? '+' : ''}${userGrowthPercent}%`}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    {userGrowthPercent !== null && (userGrowthPercent >= 0
                                        ? <TrendingUp className="w-3 h-3 text-[#4CAF50]" />
                                        : <TrendingDown className="w-3 h-3 text-destructive" />)}
                                    vs mois dernier
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Charts — données réelles issues de /api/analytics/monthly (nouveaux comptes,
                    contrats créés/signés, connexions), plus aucune donnée fictive codée en dur. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <Card className="p-6">
                        <h3 className="mb-4">Croissance des utilisateurs</h3>
                        {chartsLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <Spinner size="md" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={monthly}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="users" name="Nouveaux utilisateurs" stroke="#FFC107" strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </Card>

                    <Card className="p-6">
                        <h3 className="mb-4">Contrats créés vs signés</h3>
                        {chartsLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <Spinner size="md" />
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthly}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="contractsCreated" name="Créés" fill="#FFC107" />
                                    <Bar dataKey="contractsSigned" name="Signés" fill="#4CAF50" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Card>
                </div>

                {/* Affluence — activité de connexion par mois (une entrée par connexion réussie),
                    le proxy le plus honnête disponible pour "fréquentation" sans mettre en place
                    un tracker de pages vues dédié (qui soulèverait des questions de vie privée/
                    consentement distinctes de ce chantier). */}
                <Card className="p-6">
                    <h3 className="mb-1">Affluence — connexions par mois</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                        Nombre de connexions réussies à la plateforme, par mois.
                    </p>
                    {chartsLoading ? (
                        <div className="h-[280px] flex items-center justify-center">
                            <Spinner size="md" />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={monthly}>
                                <defs>
                                    <linearGradient id="affluenceFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2196F3" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="#2196F3" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Area type="monotone" dataKey="logins" name="Connexions" stroke="#2196F3" fill="url(#affluenceFill)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </Card>
            </main>
    );
}
