/**
 * Layout Admin — Appliqué à toutes les routes /admin/*
 *
 * Le composant AdminGuard est appliqué ici au niveau du layout de groupe.
 * Cela signifie que toutes les sous-routes (/admin/users, /admin/contracts, etc.)
 * bénéficient automatiquement de la protection sans avoir à l'importer dans chaque page.
 */
import { AdminGuard } from "@/components/auth/admin-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <AdminGuard>{children}</AdminGuard>;
}
