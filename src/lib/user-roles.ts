/** Shared by every screen that displays a user's role — app-sidebar.tsx used to keep its
 *  own private copy while settings-page.tsx showed the raw Prisma enum ("USER", "ADMIN")
 *  straight from the API, an inconsistency a French-speaking, non-technical user would
 *  read as a display bug rather than a deliberate choice. */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  USER: "Utilisateur",
  VIEWER: "Observateur",
};

export function roleLabel(role: string | undefined | null): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role;
}
