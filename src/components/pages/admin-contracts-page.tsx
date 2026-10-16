"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { contractsApi } from "@/lib/api/contracts";
import { formatReference } from "@/lib/utils/contractNaming";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { FileText, CheckCircle, Clock, AlertCircle, XCircle, Search, X, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

export function AdminContractsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const emailFilter = searchParams.get("email") || "";

    const [contracts, setContracts] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [summary, setSummary] = useState({ total: 0, byStatus: {} as Record<string, number>, thisMonth: 0 });
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchContracts = useCallback(async () => {
        setLoading(true);
        try {
            const [contractsRes, summaryRes] = await Promise.all([
                contractsApi.getAllContracts({
                    page,
                    limit: PAGE_SIZE,
                    email: emailFilter || undefined,
                    search: search || undefined,
                }),
                contractsApi.getAdminContractsSummary(),
            ]);
            const mappedContracts = contractsRes.contracts.map((c: any) => ({
                id: c.contractId || c.id,
                title: c.title || (c.metadata?.title) || "Sans titre",
                reference: c.reference,
                type: c.metadata?.type || "Standard",
                user: c.user?.email || "Inconnu",
                status: c.status?.toLowerCase() || 'pending',
                createdAt: c.createdAt,
                createdDate: new Date(c.createdAt).toLocaleDateString('fr-FR'),
                signedDate: c.status === 'ACTIVE' || c.status === 'COMPLETED' ? new Date(c.lastSync).toLocaleDateString('fr-FR') : null,
            }));
            setContracts(mappedContracts);
            setPagination({ total: contractsRes.pagination.total, pages: contractsRes.pagination.pages || 1 });
            setSummary(summaryRes);
        } catch (error) {
            console.error("Error fetching contracts:", error);
        } finally {
            setLoading(false);
        }
    }, [page, emailFilter, search]);

    useEffect(() => { fetchContracts(); }, [fetchContracts]);

    const signedTotal = (summary.byStatus['ACTIVE'] || 0) + (summary.byStatus['COMPLETED'] || 0);
    const pendingTotal = summary.byStatus['PENDING_SIGNATURES'] || 0;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "active":
            case "completed":
                return <Badge className="bg-[#4CAF50] text-white"><CheckCircle className="w-3 h-3 mr-1" />Signé</Badge>;
            case "pending_signatures":
                return <Badge className="bg-[#FFC107] text-[#212121]"><Clock className="w-3 h-3 mr-1" />En attente</Badge>;
            case "draft_waiting_signers":
            case "ready_to_deploy":
                return <Badge className="bg-[#9E9E9E] text-white"><FileText className="w-3 h-3 mr-1" />Brouillon</Badge>;
            case "disputed":
            case "terminated":
            case "cancelled":
                return <Badge className="bg-destructive text-white"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>;
            default:
                return <Badge><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
        }
    };

    return (
        <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="mb-2">Tous les contrats</h1>
                        <p className="text-muted-foreground">
                            Vue d'ensemble de tous les contrats de la plateforme
                        </p>
                    </div>
                </div>

                {/* Stats — totaux réels de la plateforme (jamais tronqués par la pagination de la liste ci-dessous) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Total contrats</p>
                        <p className="text-3xl">{summary.total}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Signés</p>
                        <p className="text-3xl">{signedTotal}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">En attente</p>
                        <p className="text-3xl">{pendingTotal}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Ce mois</p>
                        <p className="text-3xl">{summary.thisMonth}</p>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par titre..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10 bg-background"
                            />
                        </div>
                        {emailFilter && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FFC107]/10 border border-[#FFC107]/30 text-sm">
                                <span>Utilisateur : <strong>{emailFilter}</strong></span>
                                <button onClick={() => router.push('/admin/contracts')} aria-label="Retirer le filtre utilisateur">
                                    <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                                </button>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Contracts Table */}
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Titre</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Utilisateur</TableHead>
                                <TableHead>Créé le</TableHead>
                                <TableHead>Signé le</TableHead>
                                <TableHead>Statut</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-12">
                                        <Spinner size="md" label="Chargement des contrats…" />
                                    </TableCell>
                                </TableRow>
                            ) : contracts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        Aucun contrat ne correspond à ces critères.
                                    </TableCell>
                                </TableRow>
                            ) : contracts.map((contract) => (
                                <TableRow
                                    key={contract.id}
                                    className="cursor-pointer hover:bg-muted/50"
                                    onMouseEnter={() => router.prefetch(`/contract-details?id=${contract.id}`)}
                                    onClick={() => router.push(`/contract-details?id=${contract.id}`)}
                                >
                                    <TableCell className="font-medium">
                                        <p>{contract.title}</p>
                                        <p className="text-[10px] text-muted-foreground font-mono font-normal">{formatReference(contract.reference)}</p>
                                    </TableCell>
                                    <TableCell>{contract.type}</TableCell>
                                    <TableCell>{contract.user}</TableCell>
                                    <TableCell>{contract.createdDate}</TableCell>
                                    <TableCell>{contract.signedDate || '-'}</TableCell>
                                    <TableCell>{getStatusBadge(contract.status)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {pagination.pages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t border-border">
                            <p className="text-sm text-muted-foreground">
                                Page {page} sur {pagination.pages} — {pagination.total} contrat{pagination.total > 1 ? 's' : ''} au total
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                    <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
                                </Button>
                                <Button variant="outline" size="sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
                                    Suivant <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            </main>
    );
}
