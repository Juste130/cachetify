import { prettifyEmailPrefix } from "@/lib/utils/displayName";

/**
 * Shared by `AuthInitializer` (mounted globally, keeps the backend session in sync with
 * Privy on every page) and `usePrivySync` (used by /login and /signup, which additionally
 * redirects once synced). Both used to duplicate this exact logic independently, each with
 * its own local "already syncing" guard — since they're two separate component instances,
 * those local guards never protected against EACH OTHER, so on a page where both mounted at
 * once (/login, /signup — AuthInitializer is global) a first-time sign-in could fire two
 * concurrent privyLogin() calls. `inFlight` here is a MODULE-level flag, shared across every
 * caller regardless of which component invoked it, closing that gap.
 */
let inFlight = false;

interface PrivyUserLike {
    id: string;
    email?: { address?: string } | null;
    google?: { email?: string; name?: string | null } | null;
    wallet?: { address?: string } | null;
}

interface PrivyWalletLike {
    walletClientType: string;
    address: string;
}

interface SyncPrivySessionArgs {
    user: PrivyUserLike;
    wallets: PrivyWalletLike[];
    getAccessToken: () => Promise<string | null>;
    privyLogin: (
        data: { privyId?: string; email: string; walletAddress?: string; profileData?: any },
        token: string
    ) => Promise<void>;
}

export function getPrivyEmail(user: PrivyUserLike | null | undefined): string | undefined {
    return user?.email?.address || user?.google?.email || undefined;
}

/**
 * Whether the currently Privy-authenticated identity actually matches the account our
 * store believes is signed in. This is the check that was MISSING before: both
 * AuthInitializer and usePrivySync only ever asked "does our store already say
 * isAuthenticated?" — never "does it say authenticated as the SAME person Privy is
 * showing right now?". If a user logs out and back in as someone else in the same
 * browser (or switches Privy identity without our Zustand store having a chance to
 * clear first), `isAuthenticated` can stay stale-true from the PREVIOUS person's
 * session: the sync effect below would then skip re-syncing entirely (gated on
 * `!isAuthenticated`), and the "already synced, redirect" effect would send the new
 * Privy identity straight into the OLD person's still-live backend session — wrong
 * profile, wrong role, wrong permissions, silently. Comparing emails catches exactly
 * that case and forces a fresh sync instead of trusting the stale flag.
 */
export function privySessionMatchesStore(privyUser: PrivyUserLike | null | undefined, storeUserEmail: string | null | undefined): boolean {
    const privyEmail = getPrivyEmail(privyUser);
    if (!privyEmail || !storeUserEmail) return true; // nothing to compare yet — not a detected mismatch
    return privyEmail.toLowerCase() === storeUserEmail.toLowerCase();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Returns true if a sync actually ran (and presumably succeeded), false if skipped
 *  (already in flight elsewhere, or no email — not errors to surface, the caller just
 *  tries again on its next render). Propagates a genuine failure after retries.
 *
 * Retries once on a token/verification failure, fetching a FRESH token each attempt:
 * right after a brand-new Privy login (fresh OTP, no prior session in this browser),
 * `getAccessToken()` can transiently hand back a token the Privy SDK hasn't fully
 * propagated server-side yet — verifyAuthToken then rejects it with a generic error
 * ("Cannot read properties of undefined (reading 'id')"), confirmed from a real incident.
 * A short backoff and a fresh token resolve it; no retry helps a real invalid token, so
 * this stays capped at one extra attempt rather than looping indefinitely.
 */
export async function syncPrivySession({ user, wallets, getAccessToken, privyLogin }: SyncPrivySessionArgs): Promise<boolean> {
    if (inFlight) return false;
    inFlight = true;
    try {
        const email = getPrivyEmail(user);
        if (!email) return false;

        // No smart wallet to prioritize: useWallets() only returns embedded/external EOA
        // wallets. Gas is covered by Privy's native sponsorship on this same EOA.
        const eoaWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
        const walletAddress = eoaWallet?.address || user.wallet?.address;

        // Privy's email login collects no name at all (just email + OTP) — when there's no
        // Google name either, this is the only default we can offer; prettified so it reads
        // as a name ("Dev Banca") rather than a raw, lowercase, dotted email local-part. The
        // user can still set a real one any time in Paramètres > Profil.
        const profileData = { name: user.google?.name || prettifyEmailPrefix(email) };

        for (let attempt = 1; attempt <= 2; attempt++) {
            const token = await getAccessToken();
            if (!token) return false;
            try {
                await privyLogin({ privyId: user.id, email, walletAddress, profileData }, token);
                return true;
            } catch (err) {
                if (attempt === 2) throw err;
                await sleep(800);
            }
        }
        return false;
    } finally {
        inFlight = false;
    }
}
