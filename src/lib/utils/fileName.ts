/**
 * Turns a human-readable contract title (e.g. "CDI — Jean Dupont / Sophie Martin") into a
 * name safe to use as an actual file name — on disk (PDF download), in a multipart upload
 * (IPFS pin), and in the `Content-Disposition` header the IPFS gateway derives from it.
 *
 * `/` in particular is not cosmetic here: the title format itself uses "/" between the two
 * parties' names, so using it unsanitized directly as a file name embeds a path separator
 * (invalid on Windows, ambiguous in a Content-Disposition filename) right in the visible
 * name of every contract with two named parties.
 */
export function toSafeFileName(title: string, maxLength = 120): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "-") // characters invalid in a Windows file name
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Contrat").slice(0, maxLength);
}
