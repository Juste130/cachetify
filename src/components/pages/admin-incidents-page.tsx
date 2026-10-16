"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { incidentsApi, AdminIncident } from "@/lib/api/incidents";
import { DISPUTE_REASON_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/contract-incidents";
import { useNotifications } from "@/hooks/useNotifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Gavel, PauseCircle, Loader2 } from "lucide-react";

export function AdminIncidentsPage() {
    const router = useRouter();
    const { notifySuccess, notifyError } = useNotifications();

    const [incidents, setIncidents] = useState<AdminIncident[]>([]);
    const [loading, setLoading] = useState(true);
    const [target, setTarget] = useState<AdminIncident | null>(null);
    const [resolution, setResolution] = useState("");
    const [resolving, setResolving] = useState(false);

    const fetchIncidents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await incidentsApi.listOpen();
            setIncidents(res.incidents);
        } catch (error) {
            console.error("Error fetching incidents:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

    const openResolveDialog = (incident: AdminIncident) => {
        setTarget(incident);
        setResolution("");
    };

    const handleResolve = async () => {
        if (!target || !resolution.trim()) return;
        setResolving(true);
        try {
            const contractUrlId = target.contract.contractId ?? target.contract.id;
            await incidentsApi.resolve(String(contractUrlId), target.id, resolution.trim());
            notifySuccess("Incident résolu", `${target.contract.title} — les parties ont été notifiées.`);
            setTarget(null);
            fetchIncidents();
        } catch (err: any) {
            notifyError("Échec de la résolution", err.message || "Une erreur est survenue.");
        } finally {
            setResolving(false);
        }
    };

    return (
        <>
            <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
                <div className="mb-8">
                    <h1 className="mb-2">Litiges</h1>
                    <p className="text-muted-foreground">
                        Litiges et pauses en attente de médiation, tous contrats confondus
                    </p>
                </div>

                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Contrat</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Motif</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead>Signalé le</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-12">
                                        <Spinner size="md" label="Chargement des litiges…" />
                                    </TableCell>
                                </TableRow>
                            ) : incidents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        Aucun litige ou pause en attente — tout est calme.
                                    </TableCell>
                                </TableRow>
                            ) : incidents.map((incident) => (
                                <TableRow key={incident.id}>
                                    <TableCell
                                        className="font-medium cursor-pointer hover:underline"
                                        onMouseEnter={() => router.prefetch(`/contract-details?id=${incident.contract.contractId ?? incident.contract.id}`)}
                                        onClick={() => router.push(`/contract-details?id=${incident.contract.contractId ?? incident.contract.id}`)}
                                    >
                                        {incident.contract.title}
                                    </TableCell>
                                    <TableCell>
                                        {incident.type === "DISPUTE" ? (
                                            <Badge className="bg-destructive text-white"><Gavel className="w-3 h-3 mr-1" />Litige</Badge>
                                        ) : (
                                            <Badge className="bg-[#FFC107] text-[#212121]"><PauseCircle className="w-3 h-3 mr-1" />Pause</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{DISPUTE_REASON_LABELS[incident.reason]}</TableCell>
                                    <TableCell className="max-w-xs truncate" title={incident.description}>{incident.description}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
                                    </TableCell>
                                    <TableCell>{new Date(incident.createdAt).toLocaleDateString('fr-FR')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" variant="outline" onClick={() => openResolveDialog(incident)}>
                                            Résoudre
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </main>

            <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Résoudre l'incident</DialogTitle>
                        <DialogDescription>
                            {target && `${target.contract.title} — ${DISPUTE_REASON_LABELS[target.reason]}. Toutes les parties seront notifiées de cette résolution.`}
                        </DialogDescription>
                    </DialogHeader>
                    {target && (
                        <div className="p-3 rounded-lg bg-muted text-sm">
                            {target.description}
                        </div>
                    )}
                    <Textarea
                        placeholder="Expliquez la décision de médiation (envoyé aux parties)..."
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button onClick={handleResolve} disabled={resolving || !resolution.trim()} className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]">
                            {resolving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirmer la résolution
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
