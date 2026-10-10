"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { StatusBadge } from "../ui/status-badge";

import { Spinner } from "../ui/spinner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { contractsApi } from "@/lib/api/contracts";
import { ipfsApi } from "@/lib/api/ipfs";
import { getEffectiveStatus, getStatusBadgeVariant } from "@/lib/contract-status";
import { formatReference } from "@/lib/utils/contractNaming";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreVertical,
  FileText,
  Download,
  Archive,
  Trash2,
  AlertCircle
} from "lucide-react";

// "Resigned" has no dedicated chip: no on-chain function ever sets that status today (see
// ContractManager.sol), so it would always show a permanent, confusing "0" — the label and
// badge still handle it correctly if that ever changes, it just isn't worth a filter yet.
const STATUS_FILTERS: { label: string; id: string }[] = [
  { label: 'Tous', id: 'all' },
  { label: 'Brouillons', id: 'draft' },
  { label: 'En attente', id: 'pending' },
  { label: 'Signés', id: 'signed' },
  { label: 'Complétés', id: 'completed' },
  { label: 'Litiges', id: 'disputed' },
  { label: 'Résiliés', id: 'terminated' },
  { label: 'Annulés', id: 'cancelled' },
  { label: 'Expirés', id: 'expired' },
];

export function ContractsPage() {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  // Unfiltered by status, paged through in full — filtering and the chip counts both happen
  // client-side below, across every grouped category (not just what the API's exact-match
  // status param could express), so they need the complete set, not a truncated first page.
  // This was previously capped at a flat `limit: 50`: any contract beyond that was silently
  // invisible, and the chip counts (computed from that same truncated array) quietly went
  // wrong past 50 too. A personal "my contracts" list is bounded by one account's real usage
  // (unlike the platform-wide admin list), so paging through it in full — capped at 20 pages /
  // 2000 contracts as a sanity ceiling, not a expected real limit — stays cheap and correct
  // without needing new server-side filtering.
  const { data: contracts = [], isLoading, error } = useQuery({
    queryKey: ['contracts', 'cached', 'all'],
    queryFn: async () => {
      const first = await contractsApi.getCachedContracts({ page: 1, limit: 100 });
      const all = [...first.contracts];
      const totalPages = Math.min(first.pagination.pages || 1, 20);
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) => contractsApi.getCachedContracts({ page: i + 2, limit: 100 }))
        );
        for (const r of rest) all.push(...r.contracts);
      }
      return all;
    },
  });

  const statusCounts = contracts.reduce<Record<string, number>>((acc, c) => {
    const key = getStatusBadgeVariant(getEffectiveStatus(c));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const filteredContracts = contracts.filter((contract) => {
    const matchesStatus = filterStatus === "all" || getStatusBadgeVariant(getEffectiveStatus(contract)) === filterStatus;
    const matchesSearch = contract.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="mb-2">Mes contrats</h1>
            <p className="text-muted-foreground">
              Gérez tous vos contrats en un seul endroit
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

        {/* Filters and Search */}
        <Card className="p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((btn) => {
                const count = btn.id === 'all' ? contracts.length : (statusCounts[btn.id] || 0);
                // Hide empty categories past "Tous" — a wall of permanently-zero chips
                // (Litiges, Résiliés...) is just clutter for an account that's never had one.
                if (btn.id !== 'all' && count === 0) return null;
                return (
                  <Button
                    key={btn.id}
                    variant={filterStatus === btn.id ? "default" : "outline"}
                    onClick={() => setFilterStatus(btn.id)}
                    className={`gap-1.5 ${filterStatus === btn.id ? "bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]" : ""}`}
                  >
                    {btn.label}
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${filterStatus === btn.id ? "bg-[#212121]/10" : "bg-muted-foreground/10"}`}>
                      {count}
                    </span>
                  </Button>
                );
              })}
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Rechercher par titre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-input-background"
              />
            </div>
          </div>
        </Card>

        {/* Contracts Table */}
        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center bg-card rounded-lg border">
            <Spinner size="lg" label="Récupération de vos contrats..." />
          </div>
        ) : error ? (
          <Card className="p-12 text-center text-destructive">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" />
            <p>Erreur lors du chargement des contrats.</p>
          </Card>
        ) : filteredContracts.length > 0 ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Date de création</TableHead>
                  <TableHead>IPFS CID</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.map((contract) => (
                  <TableRow
                    key={contract.id}
                    className="cursor-pointer hover:bg-muted/50"
                    // Une ligne de tableau ne peut pas être un <Link> (pas de <a> valide autour
                    // d'un <tr>), donc elle n'a jamais le prefetch automatique au survol que
                    // next/link offre — router.prefetch() reproduit ce même comportement à la
                    // main : la page de détail est déjà en mémoire côté client au moment du
                    // clic, au lieu de partir d'une navigation à froid.
                    onMouseEnter={() => router.prefetch(`/contract-details?id=${contract.contractId ?? contract.id}`)}
                    onClick={() => router.push(`/contract-details?id=${contract.contractId ?? contract.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#FFC107] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{contract.title}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{formatReference(contract.reference)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(contract.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs opacity-60">
                      {contract.ipfsHash ? `${contract.ipfsHash.slice(0, 10)}...` : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={getStatusBadgeVariant(getEffectiveStatus(contract)) as any} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/contract-details?id=${contract.contractId ?? contract.id}`)}>
                            <FileText className="w-4 h-4 mr-2" />
                            Détails
                          </DropdownMenuItem>
                          {contract.ipfsHash && (
                            // Les documents ne sont plus publiés sur une passerelle IPFS
                            // publique depuis le chiffrement (voir A1, mémoire chapitre 2) —
                            // cette route interne les déchiffre pour un participant
                            // authentifié. Un lien Pinata brut ici ne servirait plus rien.
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              window.open(ipfsApi.getPublicUrl(contract.ipfsHash), '_blank');
                            }}>
                              <Download className="w-4 h-4 mr-2" />
                              Voir le document
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                            <Archive className="w-4 h-4 mr-2" />
                            Archiver (bientôt disponible)
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer (bientôt disponible)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="mb-2">Aucun contrat trouvé</h3>
              <p className="text-muted-foreground mb-6">
                Commencez par créer votre premier contrat avec
                l'aide de notre IA sécurisée.
              </p>
              <Link href="/create-contract">
                <Button
                  className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Créer un contrat
                </Button>
              </Link>
            </div>
          </Card>
        )}
    </main>
  );
}