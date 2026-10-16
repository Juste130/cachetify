/**
 * Signatory role codes shared by the creation wizard and the contract details page.
 * These must match the on-chain role enum (see ContractManager) and
 * backend/prisma/schema.prisma's ContractSignatory.role.
 *
 * Previously the two pages kept separate, drifting mappings (role 1 read as
 * "Co-Signataire" at creation but "Signataire" on the details page, and role 3
 * wasn't mapped at all on the details page).
 */
export const SIGNATORY_ROLE_LABELS: Record<number, string> = {
  0: "Créateur",
  1: "Co-Signataire",
  2: "Témoin",
  3: "Représentant légal",
};

export function signatoryRoleLabel(role: number): string {
  return SIGNATORY_ROLE_LABELS[role] ?? "Signataire";
}
