/**
 * Shared SHA-256 helpers — used both when a contract is created (create-contract-page.tsx,
 * to fingerprint the text or the uploaded file before it's pinned to IPFS) and when it's
 * signed (kyc-signature-modal.tsx, to verify the displayed content still matches that
 * fingerprint). Kept in one place so the two call sites can't silently drift apart.
 */

async function digestToHex(data: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  return digestToHex(encoder.encode(text));
}

/**
 * Déclenche le téléchargement d'un fichier texte contenant EXACTEMENT `text`, encodé en
 * UTF-8 sans BOM — les mêmes octets que computeSHA256(text) aurait hachés. Utilisé pour
 * donner à l'utilisateur un fichier qu'il peut garder et redéposer plus tard sur la page
 * publique de vérification pour prouver que le contrat n'a pas été modifié (voir
 * "Vérifier un fichier" dans public-verify-page.tsx). Ne jamais faire transiter `text` par
 * un composant d'affichage (rendu markdown, mise en forme...) avant cet appel : la moindre
 * transformation change les octets, donc l'empreinte, et le fichier ne correspondrait plus.
 */
export function downloadTextForVerification(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function computeFileSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return digestToHex(buffer);
}

/**
 * Empreinte d'octets déjà en mémoire (le certificat PDF tout juste généré, avant même son
 * téléchargement) — utilisé pour le dépôt automatique du certificat (voir
 * buildCertificatePdfBytes dans pdfGenerator.ts et contract-details-page.tsx).
 */
export async function computeBytesSHA256(bytes: Uint8Array): Promise<string> {
  // TS's DOM lib now pins BufferSource to Uint8Array<ArrayBuffer> specifically; a plain
  // Uint8Array (as returned by pdf-lib, jsPDF, etc.) is typed Uint8Array<ArrayBufferLike>,
  // which is always backed by a real ArrayBuffer in practice in this codebase (never a
  // SharedArrayBuffer) — narrowing the assertion is safe here.
  return digestToHex(bytes as Uint8Array<ArrayBuffer>);
}

/**
 * Re-fetches a file already pinned on IPFS and hashes its actual bytes — used at signature
 * time to verify what the gateway serves right now still matches the fingerprint computed
 * at import. Returns null on any failure (network, CORS, gateway hiccup) instead of
 * throwing: a failed fetch is not proof of tampering, so it must never be treated the same
 * as an actual mismatch by the caller.
 */
export async function computeRemoteFileSHA256(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return await digestToHex(buffer);
  } catch {
    return null;
  }
}
