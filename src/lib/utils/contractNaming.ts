import { toSafeFileName } from "./fileName";

/**
 * Shared naming rules for a contract's title, reference and file names — the single place
 * these are built, so the wizard, the details/list pages, the certificate generator and the
 * IPFS upload all produce the exact same result instead of each having its own drifting copy.
 *
 * `contract.reference` (a Postgres-sequence integer, see schema.prisma) is the ONLY thing
 * this app relies on for guaranteed uniqueness between two documents — `title` alone can
 * (and does) collide: same contract type, same signatories, same day produces an identical
 * descriptive title. The reference never collides, even under concurrent creation.
 */

/** "CTF-000042" — zero-padded to 6 digits, which comfortably outlives any realistic volume
 *  without ever looking visually inconsistent next to an early "CTF-000001". */
export function formatReference(reference: number): string {
  return `CTF-${String(reference).padStart(6, "0")}`;
}

/**
 * Renders the list of parties/signatories for a title. More than 2 names is a real case
 * (a witness, an additional co-signer beyond the two named parties) — spelling out every
 * name past a handful makes a title unreadable in a table cell, so this collapses beyond
 * a fixed threshold instead of growing without bound.
 */
export function buildPartiesLabel(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= 2) return clean.join(" / ");
  if (clean.length <= 3) return clean.join(", ");
  const shown = clean.slice(0, 2);
  return `${shown.join(", ")} +${clean.length - 2} autres`;
}

/** dd/mm/yyyy — the everyday French date format used throughout the rest of the app's UI. */
function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** yyyy-mm-dd — sorts chronologically as a plain string, which is exactly what a file name
 *  sitting in a folder alongside others needs (a locale date format does not). */
function formatFileDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The descriptive title shown on screen — NOT guaranteed unique by itself (see module doc).
 * Always pair it with formatReference(reference) wherever it's the only identifying text on
 * screen (tables, headers) rather than relying on it alone.
 */
export function buildContractTitle(params: {
  documentType: string;
  partyNames: string[];
  createdAt: Date;
}): string {
  const parties = buildPartiesLabel(params.partyNames);
  const base = parties ? `${params.documentType} — ${parties}` : params.documentType;
  return `${base} (${formatDisplayDate(params.createdAt)})`;
}

/** The full display string — title plus the one thing that actually guarantees uniqueness. */
export function buildContractDisplayName(params: {
  title: string;
  reference: number;
}): string {
  return `${params.title} · Réf. ${formatReference(params.reference)}`;
}

/**
 * File name base (no extension) for both the certificate PDF download and the file pinned to
 * IPFS — unified so the two no longer follow two different, undocumented conventions. Date in
 * yyyy-mm-dd (sorts naturally in a folder) and the reference always included: two contracts a
 * user downloads today, same type, same parties, must never produce the same file name on
 * their disk and silently overwrite one another.
 */
export function buildContractFileBaseName(params: {
  documentType: string;
  partyNames: string[];
  createdAt: Date;
  reference: number;
}): string {
  const parties = buildPartiesLabel(params.partyNames);
  const base = parties ? `${params.documentType} — ${parties}` : params.documentType;
  const raw = `${base} — ${formatFileDate(params.createdAt)} — ${formatReference(params.reference)}`;
  return toSafeFileName(raw, 160);
}
