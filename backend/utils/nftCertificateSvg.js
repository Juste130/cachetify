/**
 * Renders the visual "image" for a ContractNFT proof, served by GET /api/nft/:tokenId/image.svg
 * and referenced from the metadata JSON's `image` field. Plain SVG rather than a rasterized
 * PNG — no canvas/image library dependency, and it stays crisp at any size a wallet renders it.
 *
 * This is a certificate of signature, not a collectible: the fields shown (title, token id,
 * mint date, signer count, status, a short document hash) are exactly what getContractProof()
 * exposes on-chain, so nothing here claims more than the contract itself can back up.
 */

function escapeXml(str) {
    return String(str ?? '').replace(/[<>&'"]/g, (c) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
    }[c]));
}

function truncate(str, max) {
    const s = String(str ?? '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * @param {{ tokenId: number, title?: string|null, timestamp: number, isActive: boolean, signerCount: number, ipfsHash: string }} params
 * @returns {string} A complete, self-contained SVG document.
 */
function renderCertificateSvg({ tokenId, title, timestamp, isActive, signerCount, ipfsHash }) {
    const safeTitle = escapeXml(truncate(title || `Contrat #${tokenId}`, 40));
    const dateLabel = escapeXml(
        new Date(timestamp * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    );
    const statusLabel = isActive ? 'ACTIF' : 'CLOS / RÉSILIÉ';
    const statusColor = isActive ? '#2E7A57' : '#8791A5';
    const shortHash = escapeXml(truncate(ipfsHash || '', 30));
    const signerLabel = `${signerCount} signataire${signerCount > 1 ? 's' : ''} enregistré${signerCount > 1 ? 's' : ''}`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="Certificat de signature Cachetify">
  <rect width="600" height="600" fill="#182238"/>
  <rect x="24" y="24" width="552" height="552" rx="6" fill="none" stroke="#A9701B" stroke-width="1.5"/>
  <rect x="40" y="40" width="520" height="520" rx="3" fill="none" stroke="#33405E" stroke-width="1"/>

  <text x="300" y="108" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="15" letter-spacing="4" fill="#E2A959">CERTIFICAT DE SIGNATURE</text>
  <text x="300" y="136" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="12" fill="#AEB6CC">Cachetify · Preuve ancrée sur Polygon</text>

  <line x1="140" y1="168" x2="460" y2="168" stroke="#33405E" stroke-width="1"/>

  <text x="300" y="268" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-weight="600" fill="#F3EFE3">${safeTitle}</text>

  <text x="300" y="320" text-anchor="middle" font-family="'Courier New', monospace" font-size="12.5" fill="#AEB6CC">Certificat #${tokenId} · ${signerLabel}</text>
  <text x="300" y="344" text-anchor="middle" font-family="'Courier New', monospace" font-size="12.5" fill="#AEB6CC">Ancré le ${dateLabel}</text>

  <rect x="228" y="378" width="144" height="30" rx="15" fill="${statusColor}" opacity="0.16"/>
  <text x="300" y="398" text-anchor="middle" font-family="'Courier New', monospace" font-size="11.5" letter-spacing="2" fill="${statusColor}">${statusLabel}</text>

  <line x1="140" y1="456" x2="460" y2="456" stroke="#33405E" stroke-width="1"/>
  <text x="300" y="480" text-anchor="middle" font-family="'Courier New', monospace" font-size="10.5" fill="#767E92">${shortHash}</text>

  <text x="300" y="548" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="11.5" fill="#767E92">Vérifiable publiquement, indépendamment de Cachetify</text>
</svg>`;
}

module.exports = { renderCertificateSvg, escapeXml, truncate };
