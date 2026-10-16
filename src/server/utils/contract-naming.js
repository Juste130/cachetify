/**
 * Backend mirror of frontend/src/lib/utils/contractNaming.ts — same rules, so a title built
 * server-side (the blockchain-sync fallback for a contract our own saveDraft/markDraftDeployed
 * flow never recorded) looks exactly like one built by the creation wizard, instead of being a
 * generic English placeholder that stays wrong forever once created.
 */

/** "CTF-000042" — zero-padded to 6 digits. */
function formatReference(reference) {
    return `CTF-${String(reference).padStart(6, '0')}`;
}

/** More than 2 names collapses past a threshold — see the frontend copy of this function for
 *  the full rationale (a title with every signatory spelled out becomes unreadable). */
function buildPartiesLabel(names) {
    const clean = (names || []).map((n) => (n || '').trim()).filter(Boolean);
    if (clean.length === 0) return '';
    if (clean.length <= 2) return clean.join(' / ');
    if (clean.length <= 3) return clean.join(', ');
    const shown = clean.slice(0, 2);
    return `${shown.join(', ')} +${clean.length - 2} autres`;
}

function formatDisplayDate(date) {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildContractTitle({ documentType, partyNames, createdAt }) {
    const parties = buildPartiesLabel(partyNames);
    const base = parties ? `${documentType} — ${parties}` : documentType;
    return `${base} (${formatDisplayDate(createdAt)})`;
}

module.exports = { formatReference, buildPartiesLabel, buildContractTitle };
