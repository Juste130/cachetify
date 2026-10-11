"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usersApi, AdminUser } from "@/lib/api/users";
import { useAuthStore } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InviteUserDialog } from "@/components/shared/invite-user-dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, MoreVertical, Shield, Edit, Eye, Loader2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 20;

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", USER: "Éditeur", VIEWER: "Visionneur" };
const KYC_LABEL: Record<string, string> = { NOT_VERIFIED: "Non vérifié", PENDING: "En cours", VERIFIED: "Vérifié", FAILED: "Échec" };

function mapUser(u: AdminUser) {
    return {
        raw: u,
        id: u.id,
        name: u.profileData?.name || "Inconnu",
        email: u.email,
        avatar: (u.profileData?.name || u.email).substring(0, 2).toUpperCase(),
        role: ROLE_LABEL[u.role] || u.role,
        status: u.isActive ? "active" : "suspended",
        contracts: u._count?.contracts || 0,
        joinedDate: new Date(u.createdAt).toLocaleDateString("fr-FR"),
        walletAddress: u.wallet?.publicAddress || null,
        kycStatus: u.kycStatus,
    };
}

type MappedUser = ReturnType<typeof mapUser>;

export function AdminUsersPage() {
    const router = useRouter();
    const { user: currentUser } = useAuthStore();
    const { notifySuccess, notifyError } = useNotifications();

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [kycFilter, setKycFilter] = useState("all");
    const [page, setPage] = useState(1);

    const [users, setUsers] = useState<MappedUser[]>([]);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, admins: 0 });
    const [loading, setLoading] = useState(true);

    const [profileUser, setProfileUser] = useState<MappedUser | null>(null);
    const [roleUser, setRoleUser] = useState<MappedUser | null>(null);
    const [pendingRole, setPendingRole] = useState<"ADMIN" | "USER" | "VIEWER">("USER");
    const [promotionConfirmed, setPromotionConfirmed] = useState(false);
    const [roleSaving, setRoleSaving] = useState(false);
    const [suspendTarget, setSuspendTarget] = useState<MappedUser | null>(null);
    const [suspendActionLoading, setSuspendActionLoading] = useState(false);

    // Debounce the free-text search so we don't refetch on every keystroke.
    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const [usersRes, summaryRes] = await Promise.all([
                usersApi.getAllUsers({
                    page,
                    limit: PAGE_SIZE,
                    role: roleFilter === "all" ? undefined : roleFilter.toUpperCase(),
                    kycStatus: kycFilter === "all" ? undefined : kycFilter,
                    search: search || undefined,
                }),
                usersApi.getUsersSummary(),
            ]);
            setUsers(usersRes.users.map(mapUser));
            setPagination({ total: usersRes.pagination.total, pages: usersRes.pagination.pages || 1 });
            setSummary(summaryRes);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    }, [page, roleFilter, kycFilter, search]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const openRoleDialog = (u: MappedUser) => {
        setRoleUser(u);
        setPendingRole(u.raw.role);
        setPromotionConfirmed(false);
    };

    // Promoting someone to Admin hands them full administrative control of the platform —
    // that deserves a deliberate, explicit acknowledgement, not just a Select + click.
    // Changing between USER and VIEWER carries no such risk and stays a single click.
    const isPromotionToAdmin = roleUser ? roleUser.raw.role !== 'ADMIN' && pendingRole === 'ADMIN' : false;
    const canSaveRole = !isPromotionToAdmin || promotionConfirmed;

    const handleSaveRole = async () => {
        if (!roleUser || !canSaveRole) return;
        setRoleSaving(true);
        try {
            await usersApi.updateUserRole(roleUser.id, pendingRole);
            notifySuccess("Rôle mis à jour", `${roleUser.name} est maintenant ${ROLE_LABEL[pendingRole]}.`);
            setRoleUser(null);
            fetchUsers();
        } catch (err: any) {
            notifyError("Échec de la mise à jour", err.message || "Une erreur est survenue.");
        } finally {
            setRoleSaving(false);
        }
    };

    const handleConfirmSuspendToggle = async () => {
        if (!suspendTarget) return;
        setSuspendActionLoading(true);
        try {
            if (suspendTarget.status === "active") {
                await usersApi.deactivateUser(suspendTarget.id);
                notifySuccess("Utilisateur suspendu", `${suspendTarget.name} n'a plus accès à la plateforme.`);
            } else {
                await usersApi.activateUser(suspendTarget.id);
                notifySuccess("Utilisateur réactivé", `${suspendTarget.name} a de nouveau accès à la plateforme.`);
            }
            setSuspendTarget(null);
            fetchUsers();
        } catch (err: any) {
            notifyError("Échec de l'action", err.message || "Une erreur est survenue.");
        } finally {
            setSuspendActionLoading(false);
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case "Admin": return "bg-[#9C27B0] text-white";
            case "Éditeur": return "bg-[#FFC107] text-[#212121]";
            case "Visionneur": return "bg-[#9E9E9E] text-white";
            default: return "bg-muted text-foreground";
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case "Admin": return <Shield className="w-3 h-3 mr-1" />;
            case "Éditeur": return <Edit className="w-3 h-3 mr-1" />;
            case "Visionneur": return <Eye className="w-3 h-3 mr-1" />;
            default: return null;
        }
    };

    return (
        <>
            <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="mb-2">Gestion des utilisateurs</h1>
                        <p className="text-muted-foreground">
                            Gérez tous les utilisateurs de la plateforme
                        </p>
                    </div>
                    <InviteUserDialog />
                </div>

                {/* Stats — totaux réels de la plateforme, indépendants de la pagination/recherche ci-dessous */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Total utilisateurs</p>
                        <p className="text-3xl">{summary.total}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Utilisateurs actifs</p>
                        <p className="text-3xl">{summary.active}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Administrateurs</p>
                        <p className="text-3xl">{summary.admins}</p>
                    </Card>
                    <Card className="p-6">
                        <p className="text-sm text-muted-foreground mb-2">Suspendus</p>
                        <p className="text-3xl">{summary.suspended}</p>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par email..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10 bg-background"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-full md:w-[200px] bg-background">
                                <SelectValue placeholder="Filtrer par rôle" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Tous les rôles</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="user">Éditeur</SelectItem>
                                <SelectItem value="viewer">Visionneur</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={kycFilter} onValueChange={(v) => { setKycFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-full md:w-[200px] bg-background">
                                <SelectValue placeholder="Filtrer par identité" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Identité — tous statuts</SelectItem>
                                <SelectItem value="VERIFIED">Vérifiée</SelectItem>
                                <SelectItem value="PENDING">En cours</SelectItem>
                                <SelectItem value="NOT_VERIFIED">Non vérifiée</SelectItem>
                                <SelectItem value="FAILED">Échec</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </Card>

                {/* Users Table */}
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Utilisateur</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Rôle</TableHead>
                                <TableHead>Identité</TableHead>
                                <TableHead>Contrats</TableHead>
                                <TableHead>Inscrit le</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12">
                                        <Spinner size="md" label="Chargement des utilisateurs…" />
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                        Aucun utilisateur ne correspond à ces critères.
                                    </TableCell>
                                </TableRow>
                            ) : users.map((user) => {
                                const isSelf = user.id === currentUser?.id;
                                return (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-[#4CAF50] text-white">
                                                        {user.avatar}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span>{user.name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge className={getRoleBadgeColor(user.role)}>
                                                {getRoleIcon(user.role)}
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    user.kycStatus === "VERIFIED" ? "border-green-500/30 text-green-600" :
                                                    user.kycStatus === "PENDING" ? "border-blue-500/30 text-blue-500" :
                                                    user.kycStatus === "FAILED" ? "border-destructive/30 text-destructive" :
                                                    "border-border text-muted-foreground"
                                                }
                                            >
                                                {KYC_LABEL[user.kycStatus] || user.kycStatus}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{user.contracts}</TableCell>
                                        <TableCell>{user.joinedDate}</TableCell>
                                        <TableCell>
                                            {user.status === 'active' ? (
                                                <Badge className="bg-[#4CAF50] text-white">Actif</Badge>
                                            ) : (
                                                <Badge className="bg-destructive text-white">Suspendu</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm">
                                                        <MoreVertical className="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setProfileUser(user)}>Voir le profil</DropdownMenuItem>
                                                    <DropdownMenuItem disabled={isSelf} onClick={() => openRoleDialog(user)}>
                                                        {isSelf ? "Modifier le rôle (impossible sur soi-même)" : "Modifier le rôle"}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => router.push(`/admin/contracts?email=${encodeURIComponent(user.email)}`)}>
                                                        Voir les contrats
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-destructive"
                                                        disabled={isSelf}
                                                        onClick={() => setSuspendTarget(user)}
                                                    >
                                                        {isSelf ? "Suspendre (impossible sur soi-même)" : user.status === 'active' ? 'Suspendre' : 'Activer'}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {pagination.pages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t border-border">
                            <p className="text-sm text-muted-foreground">
                                Page {page} sur {pagination.pages} — {pagination.total} utilisateur{pagination.total > 1 ? 's' : ''} au total
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

            {/* Voir le profil */}
            <Dialog open={!!profileUser} onOpenChange={(open) => !open && setProfileUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Profil utilisateur</DialogTitle>
                    </DialogHeader>
                    {profileUser && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="w-14 h-14">
                                    <AvatarFallback className="bg-[#4CAF50] text-white text-lg">{profileUser.avatar}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{profileUser.name}</p>
                                    <p className="text-sm text-muted-foreground">{profileUser.email}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-muted-foreground mb-1">Rôle</p>
                                    <Badge className={getRoleBadgeColor(profileUser.role)}>{profileUser.role}</Badge>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Statut</p>
                                    {profileUser.status === 'active' ? (
                                        <Badge className="bg-[#4CAF50] text-white">Actif</Badge>
                                    ) : (
                                        <Badge className="bg-destructive text-white">Suspendu</Badge>
                                    )}
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Inscrit le</p>
                                    <p>{profileUser.joinedDate}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Contrats</p>
                                    <p>{profileUser.contracts}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground mb-1">Identité</p>
                                    <p>{KYC_LABEL[profileUser.kycStatus] || profileUser.kycStatus}</p>
                                </div>
                            </div>
                            {profileUser.walletAddress && (
                                <div className="text-sm">
                                    <p className="text-muted-foreground mb-1">Adresse du portefeuille</p>
                                    <p className="font-mono text-xs bg-muted px-2 py-1.5 rounded break-all">{profileUser.walletAddress}</p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Modifier le rôle */}
            <Dialog open={!!roleUser} onOpenChange={(open) => !open && setRoleUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modifier le rôle</DialogTitle>
                        <DialogDescription>
                            {roleUser && `Changer le rôle de ${roleUser.name} (${roleUser.email}).`}
                        </DialogDescription>
                    </DialogHeader>
                    <Select value={pendingRole} onValueChange={(v) => { setPendingRole(v as any); setPromotionConfirmed(false); }}>
                        <SelectTrigger className="bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="USER">Éditeur</SelectItem>
                            <SelectItem value="VIEWER">Visionneur</SelectItem>
                        </SelectContent>
                    </Select>

                    {isPromotionToAdmin && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                            <div className="space-y-2">
                                <p className="text-sm text-foreground">
                                    Un administrateur a accès à la gestion de tous les utilisateurs, tous les contrats, et aux contrôles d'urgence de la plateforme (pause du smart contract). C'est une action importante.
                                </p>
                                <div className="flex items-center gap-2">
                                    <Checkbox id="confirm-promotion" checked={promotionConfirmed} onCheckedChange={(c) => setPromotionConfirmed(c === true)} />
                                    <Label htmlFor="confirm-promotion" className="text-sm font-normal cursor-pointer">
                                        Je confirme vouloir accorder les droits d'administrateur à ce compte
                                    </Label>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button onClick={handleSaveRole} disabled={roleSaving || !canSaveRole} className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]">
                            {roleSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isPromotionToAdmin ? "Confirmer la promotion en Admin" : "Enregistrer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Suspendre / Activer — confirmation, car ça coupe l'accès immédiatement */}
            <AlertDialog open={!!suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {suspendTarget?.status === 'active' ? 'Suspendre cet utilisateur ?' : 'Réactiver cet utilisateur ?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {suspendTarget?.status === 'active'
                                ? `${suspendTarget?.name} (${suspendTarget?.email}) perdra immédiatement l'accès à la plateforme, y compris avec une session déjà ouverte.`
                                : `${suspendTarget?.name} (${suspendTarget?.email}) retrouvera immédiatement l'accès à la plateforme.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={suspendActionLoading}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleConfirmSuspendToggle(); }}
                            disabled={suspendActionLoading}
                            className={suspendTarget?.status === 'active' ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
                        >
                            {suspendActionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {suspendTarget?.status === 'active' ? 'Suspendre' : 'Activer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
