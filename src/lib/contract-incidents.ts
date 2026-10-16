/**
 * Labels for the off-chain incident system (disputes/holds) — entirely off-chain, see
 * backend/services/incident.js. ContractManager.sol has no dispute mechanism at all (hors
 * périmètre du mémoire).
 */
export type IncidentType = "DISPUTE" | "HOLD";

export type IncidentReason =
  | "NON_PAYMENT"
  | "POOR_QUALITY_WORK"
  | "DELAYS_IN_PERFORMANCE"
  | "BREACH_OF_CONFIDENTIALITY"
  | "INTELLECTUAL_PROPERTY_DISPUTE"
  | "MUTUAL_TIMEOUT"
  | "OTHER";

export type IncidentStatus = "OPEN" | "ACCEPTED_ACTIVE" | "REJECTED" | "RESOLVED" | "WITHDRAWN";

export const DISPUTE_REASON_LABELS: Record<IncidentReason, string> = {
  NON_PAYMENT: "Non-paiement",
  POOR_QUALITY_WORK: "Qualité insuffisante du travail",
  DELAYS_IN_PERFORMANCE: "Retard d'exécution",
  BREACH_OF_CONFIDENTIALITY: "Violation de confidentialité",
  INTELLECTUAL_PROPERTY_DISPUTE: "Litige de propriété intellectuelle",
  MUTUAL_TIMEOUT: "Pause négociée",
  OTHER: "Autre",
};

/** Reasons offered when raising a DISPUTE (adversarial — MUTUAL_TIMEOUT doesn't belong here). */
export const DISPUTE_REASONS: IncidentReason[] = [
  "NON_PAYMENT",
  "POOR_QUALITY_WORK",
  "DELAYS_IN_PERFORMANCE",
  "BREACH_OF_CONFIDENTIALITY",
  "INTELLECTUAL_PROPERTY_DISPUTE",
  "OTHER",
];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  OPEN: "Ouvert",
  ACCEPTED_ACTIVE: "Pause active",
  REJECTED: "Refusé",
  RESOLVED: "Résolu",
  WITHDRAWN: "Retiré",
};
