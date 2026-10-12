/**
 * Privy's email login collects only an email + OTP — no name — so the app has always had to
 * fall back to something when a user hasn't set one. The raw email local-part ("dev.banca")
 * read wrong: lowercase, dotted, clearly not a name. This turns it into something that at
 * least resembles one ("Dev Banca") until the user sets a real one in Paramètres > Profil
 * (the "Nom complet" field already exists there — this is only the fallback shown before
 * they do).
 */
export function prettifyEmailPrefix(email: string): string {
  const prefix = email.split("@")[0] || "";
  const words = prefix
    .replace(/[._+-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(" ") : "Utilisateur";
}

/** The one place that decides what to call a user — prefer their own chosen name, then a
 *  prettified email, then a neutral fallback. Never the raw, unformatted email prefix. */
export function getDisplayName(user: { profileData?: { name?: string } | null; email?: string | null } | null | undefined): string {
  const name = user?.profileData?.name?.trim();
  if (name) return name;
  if (user?.email) return prettifyEmailPrefix(user.email);
  return "Utilisateur";
}
