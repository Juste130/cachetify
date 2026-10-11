"use client";

import { useState, useEffect } from "react";
import apiClient from "@/lib/api/client";
import { useAuthStore } from "@/hooks/useAuth";
import { useContract } from "@/hooks/useContract";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Server, AlertCircle, CheckCircle, Activity, XCircle, Loader2, PauseCircle, PlayCircle, GitCompareArrows } from "lucide-react";

interface SyncHealthCheck {
    checkedAt: string;
    onChainTotal: number;
    cachedTotal: number;
    drifted: boolean;
}

export function AdminSystemPage() {
    const [apiStatus, setApiStatus] = useState<'loading' | 'online' | 'offline'>('loading');
    const [dbStatus, setDbStatus] = useState<'loading' | 'online' | 'offline'>('loading');
    const [pauseState, setPauseState] = useState<{ paused: boolean; pausedAt: number; owner: string; emergencyAdmin: string } | null>(null);
    const [chainStatus, setChainStatus] = useState<'loading' | 'online' | 'offline'>('loading');
    const [syncHealth, setSyncHealth] = useState<SyncHealthCheck | null | undefined>(undefined);
    const [pauseReason, setPauseReason] = useState("");
    const [pauseConfirmText, setPauseConfirmText] = useState("");
    const [pauseActionLoading, setPauseActionLoading] = useState(false);
    const [pauseActionError, setPauseActionError] = useState<string | null>(null);
    const { user } = useAuthStore();
    const { getPauseState, emergencyPause, resumeContractPlatform } = useContract();

    const isAdmin = user?.role === 'ADMIN';

    useEffect(() => {
        // Deux appels distincts plutôt qu'un seul partagé : /health ne touche jamais la
        // base (route Express pure, voir server.js), alors que /api/users passe par Prisma.
        // Avec un seul appel commun, une base de données en panne faisait passer "API
        // Backend" et "Base de données" hors ligne ensemble — impossible de savoir laquelle
        // des deux avait vraiment un problème alors que l'écran suggère deux diagnostics
        // séparés.
        const checkHealth = async () => {
            try {
                await apiClient.get('/health');
                setApiStatus('online');
            } catch {
                setApiStatus('offline');
            }
            try {
                await apiClient.get('/api/users?limit=1');
                setDbStatus('online');
            } catch {
                setDbStatus('offline');
            }
        };
        checkHealth();

        // Latest result from the sync-health scheduler (services/sync-health.js, runs every
        // 15min server-side) — not a live check triggered by loading this page, just its most
        // recent finding, so this call is cheap regardless of how often an admin refreshes.
        apiClient.get('/api/contracts/admin/sync-health')
            .then((res) => setSyncHealth(res.data.latest))
            .catch(() => setSyncHealth(null));
    }, []);

    const refreshPauseState = async () => {
        setChainStatus('loading');
        try {
            const state = await getPauseState();
            setPauseState(state);
            setChainStatus('online');
        } catch {
            setChainStatus('offline');
        }
    };

    useEffect(() => {
        refreshPauseState();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePauseToggle = async () => {
        if (!pauseReason.trim() || pauseConfirmText.trim().toUpperCase() !== "CONFIRMER") return;
        setPauseActionLoading(true);
        setPauseActionError(null);
        try {
            if (pauseState?.paused) {
                await resumeContractPlatform(pauseReason);
            } else {
                await emergencyPause(pauseReason);
            }
            setPauseReason("");
            setPauseConfirmText("");
            await refreshPauseState();
        } catch (err: any) {
            // The contract itself is the real gate (onlyAuthorizedPauser / onlyOwnerOrEmergencyAdmin) —
            // a wallet that isn't actually authorized on-chain reverts here rather than silently "succeeding".
            setPauseActionError(err?.reason || err?.message || "Action refusée par le smart contract.");
        } finally {
            setPauseActionLoading(false);
        }
    };

    const StatusBadge = ({ status }: { status: 'loading' | 'online' | 'offline' }) => {
        if (status === 'loading') return <Badge className="bg-gray-400 text-white">Chargement…</Badge>;
        if (status === 'online') return <Badge className="bg-[#4CAF50] text-white"><CheckCircle className="w-3 h-3 mr-1" />En ligne</Badge>;
        return <Badge className="bg-destructive text-white"><XCircle className="w-3 h-3 mr-1" />Hors ligne</Badge>;
    };

    return (
        <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
                <div className="mb-8">
                    <h1 className="mb-2">Paramètres système</h1>
                    <p className="text-muted-foreground">
                        Configuration et gestion du système
                    </p>
                </div>

                {/* System Status */}
                <Card className="p-6 mb-6">
                    <h3 className="mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        État du système
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                            <div>
                                <p className="text-sm text-muted-foreground">API Backend</p>
                                <p className="font-medium">{apiStatus === 'online' ? 'Opérationnel' : apiStatus === 'loading' ? 'Vérification…' : 'Inaccessible'}</p>
                            </div>
                            <StatusBadge status={apiStatus} />
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                            <div>
                                <p className="text-sm text-muted-foreground">Blockchain</p>
                                <p className="font-medium">
                                    {chainStatus !== 'online' ? (chainStatus === 'loading' ? 'Vérification…' : 'Inaccessible')
                                        : pauseState?.paused ? 'En pause' : 'Opérationnel'}
                                </p>
                            </div>
                            {chainStatus === 'online' && pauseState?.paused ? (
                                <Badge className="bg-[#FFC107] text-[#212121]"><PauseCircle className="w-3 h-3 mr-1" />En pause</Badge>
                            ) : (
                                <StatusBadge status={chainStatus} />
                            )}
                        </div>
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                            <div>
                                <p className="text-sm text-muted-foreground">Base de données</p>
                                <p className="font-medium">{dbStatus === 'online' ? 'Sain' : dbStatus === 'loading' ? 'Vérification…' : 'Erreur'}</p>
                            </div>
                            <StatusBadge status={dbStatus} />
                        </div>
                    </div>
                </Card>

                {/* Sync health — on-chain contract count vs ContractCache, see services/sync-health.js */}
                <Card className="p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <GitCompareArrows className="w-5 h-5" />
                        <h3>Synchronisation blockchain ↔ cache</h3>
                    </div>
                    {syncHealth === undefined ? (
                        <p className="text-sm text-muted-foreground">Chargement…</p>
                    ) : syncHealth === null ? (
                        <p className="text-sm text-muted-foreground">
                            Aucune vérification enregistrée pour l'instant — le premier passage du planificateur (au démarrage du serveur) n'a pas encore eu lieu.
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div className="bg-muted p-4 rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-1">Contrats sur la blockchain</p>
                                    <p className="font-medium tabular-nums">{syncHealth.onChainTotal}</p>
                                </div>
                                <div className="bg-muted p-4 rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-1">Contrats en cache</p>
                                    <p className="font-medium tabular-nums">{syncHealth.cachedTotal}</p>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                                    <div>
                                        <p className="text-sm text-muted-foreground">État</p>
                                        <p className="font-medium">{syncHealth.drifted ? "Désynchronisé" : "Synchronisé"}</p>
                                    </div>
                                    {syncHealth.drifted ? (
                                        <Badge className="bg-destructive text-white"><AlertCircle className="w-3 h-3 mr-1" />Écart détecté</Badge>
                                    ) : (
                                        <Badge className="bg-[#4CAF50] text-white"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>
                                    )}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Dernière vérification : {new Date(syncHealth.checkedAt).toLocaleString('fr-FR')}.
                                {syncHealth.drifted && " Un écart signifie que l'écouteur d'événements a manqué au moins un contrat créé sur la chaîne — vérifiez les logs serveur (blockchain-sync.js)."}
                            </p>
                        </>
                    )}
                </Card>

                {/* Emergency Admin — read-only, real on-chain addresses */}
                <Card className="p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Shield className="w-5 h-5 text-[#9C27B0]" />
                        <h3>Administration d'urgence du smart contract</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="bg-muted p-4 rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Owner</p>
                            <p className="font-mono text-xs break-all">{pauseState?.owner || (chainStatus === 'loading' ? 'Chargement…' : 'Indisponible')}</p>
                        </div>
                        <div className="bg-muted p-4 rounded-lg">
                            <p className="text-sm text-muted-foreground mb-1">Emergency Admin</p>
                            <p className="font-mono text-xs break-all">{pauseState?.emergencyAdmin || (chainStatus === 'loading' ? 'Chargement…' : 'Indisponible')}</p>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Transférer ces rôles (setEmergencyAdmin, addAuthorizedPauser) est une action rare et sensible —
                        à faire directement via une interaction blockchain (ex. interface du smart contract), pas depuis un bouton de cette page.
                    </p>
                </Card>

                {/* Real pause/resume — gated by the ADMIN app role, enforced for real by the contract's own modifiers */}
                <Card className="p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <PauseCircle className="w-5 h-5 text-destructive" />
                        <h3>Pause d'urgence de la plateforme</h3>
                    </div>
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-muted-foreground">
                                Bloque immédiatement la création, la signature, l'escrow et les litiges pour <strong>tous les contrats</strong>
                                — pas seulement celui que vous consultez. Réservé à un incident réel (bug critique, fonds à risque).
                            </p>
                        </div>
                    </div>
                    {!isAdmin ? (
                        <p className="text-sm text-muted-foreground">Réservé aux comptes administrateurs.</p>
                    ) : (
                        <div className="space-y-3">
                            <textarea
                                value={pauseReason}
                                onChange={(e) => setPauseReason(e.target.value)}
                                placeholder="Justification (1-200 caractères, exigée par le smart contract)..."
                                className="w-full p-2 rounded-lg border border-border bg-input-background text-sm min-h-[70px]"
                                maxLength={200}
                            />
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">
                                    Tapez <strong>CONFIRMER</strong> pour activer le bouton ci-dessous — cette action touche l'ensemble des contrats de la plateforme.
                                </label>
                                <input
                                    type="text"
                                    value={pauseConfirmText}
                                    onChange={(e) => setPauseConfirmText(e.target.value)}
                                    placeholder="CONFIRMER"
                                    className="w-full p-2 rounded-lg border border-border bg-input-background text-sm"
                                />
                            </div>
                            <Button
                                variant={pauseState?.paused ? "default" : "destructive"}
                                onClick={handlePauseToggle}
                                disabled={pauseActionLoading || !pauseReason.trim() || pauseConfirmText.trim().toUpperCase() !== "CONFIRMER" || chainStatus !== 'online'}
                                className="gap-2"
                            >
                                {pauseActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : pauseState?.paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                                {pauseState?.paused ? "Reprendre la plateforme" : "Mettre en pause la plateforme"}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Votre wallet connecté doit être l'owner, l'emergency admin, ou un pauser autorisé — sinon la
                                transaction sera rejetée par le smart contract lui-même.
                            </p>
                            {pauseActionError && (
                                <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{pauseActionError}</p>
                            )}
                        </div>
                    )}
                </Card>

                {/* Feature Flags — none of these are backed by a real toggle yet */}
                <Card className="p-6 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                        <h3>Fonctionnalités</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-muted text-muted-foreground">Bientôt disponible</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                        Ces bascules ne sont pas encore reliées à un contrôle réel côté serveur — les fonctionnalités listées
                        sont actuellement toujours actives pour tous les utilisateurs.
                    </p>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between opacity-60">
                            <div>
                                <h4 className="mb-1">Génération IA</h4>
                                <p className="text-sm text-muted-foreground">
                                    Activer la génération automatique de contrats par IA
                                </p>
                            </div>
                            <Switch disabled defaultChecked />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between opacity-60">
                            <div>
                                <h4 className="mb-1">Signature électronique</h4>
                                <p className="text-sm text-muted-foreground">
                                    Permettre la signature électronique des contrats
                                </p>
                            </div>
                            <Switch disabled defaultChecked />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between opacity-60">
                            <div>
                                <h4 className="mb-1">Blockchain</h4>
                                <p className="text-sm text-muted-foreground">
                                    Enregistrer les contrats sur la blockchain
                                </p>
                            </div>
                            <Switch disabled defaultChecked />
                        </div>
                    </div>
                </Card>

                {/* Maintenance Mode — not backed by anything yet, shown as unavailable rather than fake */}
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-1">
                        <Server className="w-5 h-5 text-[#FFC107]" />
                        <h3>Mode maintenance</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-muted text-muted-foreground ml-1">Bientôt disponible</span>
                    </div>
                    <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-muted-foreground">
                                Pas encore implémenté côté serveur — ce contrôle n'a aucun effet pour l'instant. Pour un
                                incident réel touchant les transactions blockchain, utilisez la pause d'urgence ci-dessus.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between opacity-60">
                        <div>
                            <h4 className="mb-1">Activer le mode maintenance</h4>
                            <p className="text-sm text-muted-foreground">
                                La plateforme sera inaccessible aux utilisateurs
                            </p>
                        </div>
                        <Switch disabled />
                    </div>
                </Card>
            </main>
    );
}
