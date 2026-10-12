import { Badge } from "./badge";

interface StatusBadgeProps {
  status: "pending" | "signed" | "completed" | "archived" | "expired" | "draft" | "cancelled" | "disputed" | "terminated" | "resigned";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variants: Record<StatusBadgeProps["status"], string> = {
    pending: "bg-[#FFC107] text-[#212121]",
    signed: "bg-[#4CAF50] text-white",
    completed: "bg-[#4CAF50] text-white",
    archived: "bg-[#9E9E9E] text-white",
    expired: "bg-[#d4183d] text-white",
    draft: "bg-[#E3F2FD] text-[#212121]",
    cancelled: "bg-[#9E9E9E] text-white",
    disputed: "bg-[#d4183d] text-white",
    terminated: "bg-[#d4183d] text-white",
    resigned: "bg-[#d4183d] text-white",
  };

  const labels: Record<StatusBadgeProps["status"], string> = {
    pending: "En attente",
    signed: "Signé",
    completed: "Complété",
    archived: "Archivé",
    expired: "Expiré",
    draft: "Brouillon",
    cancelled: "Annulé",
    disputed: "Litige en cours",
    terminated: "Résilié",
    resigned: "Démission",
  };

  return (
    <Badge className={`${variants[status]} hover:opacity-90 ${className || ''}`}>
      {labels[status]}
    </Badge>
  );
}
