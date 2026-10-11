import QRCode from "qrcode";
import { buildContractFileBaseName } from "./contractNaming";

interface PDFData {
    title: string;
    content: string;
    sha256Hash: string;
    contractId?: number;
    draftId?: string;
    /** Jeton public non devinable (publicToken) : c'est vers /verify/<publicToken> que pointe
     *  le code QR, jamais vers contractId ni draftId — voir mémoire, chapitre 2, section
     *  Sécurité et protection des données. */
    publicToken?: string;
    /** The type segment used to build the file name ("CDI", "Bail commercial"...) — the same
     *  concept as contract.metadata.type, kept separate from the full `title` string so the
     *  file name can be rebuilt from its actual parts (type, parties, date, reference)
     *  instead of just reusing the on-screen title verbatim. */
    documentType: string;
    /** Platform-wide sequential number (see schema.prisma ContractCache.reference) — the
     *  only thing guaranteeing two contracts never produce the same file name. */
    reference: number;
    parties: {
        partyA: { name: string; email: string };
        partyB: { name: string; email: string };
    };
    signatories: any[];
    status: string;
    createdAt: string;
    /** True for an imported document (vs. AI-generated) — see the branch below: an
     *  imported PDF's actual content is never reproduced here (reformatting a third-party
     *  legal document risks introducing a discrepancy with what was actually signed), and
     *  the "sha256Hash" field for one is really our internal storage reference, not a raw hex
     *  digest — both need different handling from the AI-generated case. */
    isExternalPdf?: boolean;
    /** This app's own authenticated, same-origin proxy for the original file
     *  (ipfsApi.getProxyUrl) — only meaningful when isExternalPdf. Used to actually fetch the
     *  original document's bytes so they can be merged with the certificate below into one
     *  downloadable file, the same way the on-screen preview (PdfPreviewFrame) already
     *  fetches it, and for the same reason: reliable regardless of a public gateway's CORS
     *  policy. */
    proxyUrl?: string;
    /** True when the import-time analysis (create-contract-page.tsx) flagged that this file
     *  already looked signed before it was ever uploaded to Cachetify — see the dated
     *  disclaimer this triggers below. Only meaningful when isExternalPdf. */
    priorSignatureDetected?: boolean;
}

/**
 * Déclenche le téléchargement de `bytes` sous le nom `fileName` — séparé de
 * buildCertificatePdfBytes ci-dessous pour que le dépôt automatique du certificat (voir
 * contract-details-page.tsx) puisse obtenir les octets SANS déclencher de téléchargement.
 */
export function downloadBytes(bytes: Uint8Array, fileName: string): void {
    // See the matching comment in hash.ts's computeBytesSHA256 — same TS/DOM typing papercut.
    const blobUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(blobUrl);
}

/**
 * Construit le certificat (et, pour un import, le fusionne avec le document original) et
 * renvoie ses octets bruts — sans jamais déclencher de téléchargement. C'est cette fonction
 * que le dépôt automatique du certificat officiel appelle (voir contract-details-page.tsx) :
 * elle a besoin des octets pour calculer leur empreinte et les envoyer au serveur, pas
 * d'un fichier posé sur le disque de l'utilisateur. generateCertifiedPDF, plus bas,
 * l'utilise aussi pour le téléchargement manuel — un seul et même PDF dans les deux cas.
 */
export async function buildCertificatePdfBytes(data: PDFData): Promise<{ bytes: Uint8Array; fileName: string }> {
    // Dynamically import jsPDF to avoid Next.js server-side 'core-js' / 'canvg' errors
    const { jsPDF } = await import("jspdf");
    
    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = margin;

    // Helper to add a new page when needed
    const checkPageBreak = (neededHeight = 10) => {
        if (yPos + neededHeight > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            yPos = margin;
        }
    };

    // jsPDF's standard fonts (Helvetica here) only support WinAnsiEncoding — a fixed
    // 256-ish-glyph table. When `to8bitStream` (jsPDF internals) meets ANY character
    // outside that table, it doesn't just drop or mis-measure that one glyph: it silently
    // re-encodes the ENTIRE string as 2-bytes-per-character UCS-2BE, which a single-byte
    // standard font then renders as garbage — every character shows with a phantom
    // "ghost" character before it (the widened, spaced-out look) and, since the doubled
    // byte count blows past the width jsPDF wrapped the line for, the tail of the line
    // renders past the page's right edge and is invisible — silent, total content loss for
    // the rest of that line. Confirmed by regenerating a real AI contract and tracing the
    // exact culprits: U+2011 (non-breaking hyphen, used in "cinquante‑cinq") and U+202F
    // (narrow no-break space, used before "%") — both valid, common French typography that
    // the AI (and a human pasting from Word) can easily produce, and neither is in
    // WinAnsiEncoding. Anything outside the confirmed-safe set (ASCII + Latin-1 Supplement,
    // plus WinAnsi's specific upper-range typographic slots — smart quotes, en/em dash,
    // ellipsis, bullet, œ/Œ, trademark — all of which DID render correctly in testing) is
    // replaced here, rather than waiting to discover the next character that breaks this.
    const WINANSI_SAFE_EXTRAS = new Set([
        0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
        0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
        0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
    ]);
    // \u escapes throughout -- these are invisible/near-invisible characters,
    // spelling them out literally in source would be unreadable and impossible to review/diff.
    const HYPHEN_LIKE = /[\u2010\u2011\u2012]/g; // hyphen, non-breaking hyphen, figure dash
    const SPACE_LIKE = /[\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g; // en/em/thin/narrow-nbsp/ideographic space, BOM
    const ZERO_WIDTH = /[\u200B\u200C\u200D]/g; // zero-width space/non-joiner/joiner -- meant to be invisible, drop entirely
    const sanitizeForPdf = (text: string) => {
        return Array.from(
            text.replace(HYPHEN_LIKE, "-").replace(SPACE_LIKE, " ").replace(ZERO_WIDTH, "")
        )
            .map((ch) => {
                const code = ch.codePointAt(0) || 0;
                return code <= 0xff || WINANSI_SAFE_EXTRAS.has(code) ? ch : " ";
            })
            .join("");
    };

    // jsPDF's splitTextToSize only breaks on whitespace — a single unbroken token longer
    // than the printable width (a SHA-256 hash, an IPFS CID, a long URL) sails straight
    // past the right margin instead of wrapping, which is exactly what caused visible
    // overflow in the generated PDF. Force a breakable point into any such token before
    // handing the text to splitTextToSize.
    const breakLongTokens = (text: string, maxCharsPerChunk = 45) => {
        return text
            .split(" ")
            .map((word) => {
                if (word.length <= maxCharsPerChunk) return word;
                const chunks = [];
                for (let i = 0; i < word.length; i += maxCharsPerChunk) {
                    chunks.push(word.slice(i, i + maxCharsPerChunk));
                }
                return chunks.join(" ");
            })
            .join(" ");
    };

    // Helper for multi-line text
    const addText = (text: string, fontSize = 12, isBold = false, color = [0, 0, 0]) => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(breakLongTokens(sanitizeForPdf(text)), pageWidth - margin * 2);
        for (const line of lines) {
            checkPageBreak(fontSize * 0.5);
            doc.text(line, margin, yPos);
            yPos += fontSize * 0.45;
        }
    };

    // 1. Header — was RGB(156,39,176) = #9C27B0, the app's secondary AI-accent purple, used
    // here by mistake for the primary wordmark (that color means "AI" everywhere else in the
    // app — the sparkle/AiBadge, the "Préférences IA" section — not the brand itself). The
    // brand's actual accent is #FFC107 gold, but gold text directly on this white page would
    // repeat the same near-illegible contrast problem already found and fixed in the email
    // header (~1.6:1) — worse here on a document meant to be printed/read in grayscale. Ink
    // (#212121, the app's own dark-text token) is what a certified document's letterhead
    // should look like anyway: legible, printer-safe, and it's already the exact color used
    // for the destination heading of the "Bientôt disponible"-free parts of Cachetify's own UI.
    doc.setTextColor(33, 33, 33);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Cachetify", margin, yPos);
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
        data.isExternalPdf ? "Certificat de signature — technologie Blockchain" : "Document certifié par technologie Blockchain",
        pageWidth - margin - (data.isExternalPdf ? 95 : 75),
        yPos
    );
    yPos += 12;
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 12;

    // 2. Title
    addText(data.title.toUpperCase(), 16, true, [30, 30, 30]);
    yPos += 6;

    // 3. Body — an imported PDF's actual content is deliberately NEVER reproduced here.
    // Reformatting a third-party legal document into this renderer's own layout risks
    // introducing a discrepancy between what this certificate shows and what was actually
    // signed (the original file, byte for byte). Instead, this is a genuine certificate:
    // it points to the original document rather than attempting to recreate it.
    if (data.isExternalPdf) {
        addText("Ce certificat atteste la signature électronique du document importé suivant :", 10, false, [60, 60, 60]);
        yPos += 4;
        checkPageBreak(10);
        addText(data.title, 12, true, [30, 30, 30]);
        yPos += 6;
        addText("Le document original, tel qu'importé, est joint intégralement à la suite de ce certificat — ce certificat n'en est pas une copie ni un résumé.", 9, false, [90, 90, 90]);
        // The blockchain anchor date below is when Cachetify's signature transaction was
        // recorded — for a document that already carried a signature/date before it was ever
        // imported, that is NOT the same as the date the parties actually signed on paper (or
        // elsewhere). Conflating the two on a certificate meant to prove authenticity would be
        // actively misleading, so both are shown, explicitly labeled as distinct.
        if (data.priorSignatureDetected) {
            yPos += 6;
            checkPageBreak(14);
            addText("Ce document semblait déjà porter une signature avant son import sur Cachetify. La date d'ancrage blockchain ci-dessous correspond à la date de cet ancrage — pas nécessairement à la date de signature originale indiquée sur le document lui-même, qu'il convient de vérifier directement dans le fichier ci-dessus.", 8, false, [180, 100, 20]);
        }
    } else if (data.content) {
        const lines = data.content.split('\n');
        const sectionHeaderRe = /^(article\s+\d+|chapitre\b|titre\s+[ivx\d]|préambule\b|annexe\s*\d*)/i;
        let titleConsumed = false;
        for (const line of lines) {
            const trimmed = line.trim();

            if (!titleConsumed && trimmed !== '' && !line.startsWith('#') && !sectionHeaderRe.test(trimmed)) {
                titleConsumed = true;
                yPos += 4;
                checkPageBreak(10);
                addText(trimmed.toUpperCase(), 13, true, [30, 30, 30]);
                yPos += 2;
                continue;
            }
            if (trimmed !== '') titleConsumed = true;

            if (sectionHeaderRe.test(trimmed) && trimmed.length < 140) {
                yPos += 3;
                checkPageBreak(9);
                addText(trimmed, 11, true, [50, 50, 50]);
                yPos += 1;
            } else if (line.startsWith('# ')) {
                yPos += 4;
                checkPageBreak(10);
                addText(line.slice(2).trim().toUpperCase(), 13, true, [30, 30, 30]);
                yPos += 2;
            } else if (line.startsWith('## ')) {
                yPos += 3;
                checkPageBreak(9);
                addText(line.slice(3).trim(), 11, true, [50, 50, 50]);
                yPos += 1;
            } else if (line.startsWith('### ')) {
                yPos += 2;
                addText(line.slice(4).trim(), 10, true, [70, 70, 70]);
            } else if (/^[-*•]\s/.test(line)) {
                const text = '• ' + line.replace(/^[-*•]\s/, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
                addText(text, 10, false, [60, 60, 60]);
            } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
                yPos += 2;
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, yPos, pageWidth - margin, yPos);
                yPos += 4;
            } else if (/^\s*\|.*\|\s*$/.test(line)) {
                // Leftover Markdown table row (legacy content only) — render as plain text
                // instead of literal pipes; the AI no longer draws signature tables.
                const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
                const isSeparatorRow = cells.every((c) => /^:?-+:?$/.test(c));
                if (!isSeparatorRow && cells.length > 0) {
                    addText(cells.join('   —   '), 10, false, [60, 60, 60]);
                }
            } else if (line.trim() === '') {
                yPos += 3;
            } else {
                // Strip any leftover inline markdown (**bold**, *italic*)
                const clean = line
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/__([^_]+)__/g, '$1')
                    .replace(/`([^`]+)`/g, '$1');
                addText(clean, 10, false, [60, 60, 60]);
            }
        }
    }

    yPos += 10;

    // 4. Signatories
    checkPageBreak(30);
    addText("ÉTAT DES SIGNATURES :", 11, true, [30, 30, 30]);
    yPos += 3;
    addText(`Statut : ${data.status}`, 9, false, [80, 80, 80]);
    data.signatories.forEach((s) => {
        let sigStatus = "Non signé";
        if (s.hasSigned) sigStatus = "Signé on-chain";
        if (s.isRegistered) sigStatus = "Inscrit";
        addText(`• ${s.name || s.email} : ${sigStatus}`, 9, false, [80, 80, 80]);
    });

    yPos += 10;

    // 5. Security Footer
    checkPageBreak(60);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    addText("CERTIFICAT D'INTÉGRITÉ NUMÉRIQUE", 8, true, [130, 130, 130]);
    yPos += 1;
    // The hash is a single long unbroken token — exactly the case addText's
    // breakLongTokens() exists for; a raw doc.text() call here (the previous code) had no
    // width constraint at all and ran straight off the page edge.
    //
    // Toujours la vraie empreinte SHA-256 du fichier (jamais notre référence de stockage
    // interne), qu'il soit importé ou rédigé par l'IA — c'est cette même valeur que la page
    // publique de vérification compare avec le fichier déposé par un tiers.
    addText(`Empreinte SHA-256 : ${data.sha256Hash}`, 8, false, [130, 130, 130]);
    if (data.contractId) {
        addText(`Ancrage Blockchain : Polygon Amoy (ID: ${data.contractId})`, 8, false, [130, 130, 130]);
    } else {
        addText(`Ancrage Blockchain : En attente de déploiement`, 8, false, [130, 130, 130]);
    }
    addText(`Horodatage : ${new Date(data.createdAt).toLocaleString('fr-FR')}`, 8, false, [130, 130, 130]);
    yPos += 3;
    // Precisely what the blockchain transaction proves, spelled out rather than left
    // implicit — it attests which wallet transacted and when, not a cryptographic signature
    // of the document's content by that wallet; content integrity is what the fingerprint
    // above, ancrée sur la blockchain, établit.
    addText("Portée de la preuve : la transaction blockchain atteste qu'un portefeuille identifié a validé ce contrat à l'horodatage indiqué. L'intégrité du contenu repose sur l'empreinte ci-dessus, elle-même inscrite sur la blockchain.", 7, false, [150, 150, 150]);
    yPos += 4;
    // Factually true only for an AI-generated contract — an imported document was never
    // drafted by the platform's AI, saying otherwise here would be a false statement on a
    // legal certificate.
    if (!data.isExternalPdf) {
        addText("Ce contrat a été rédigé avec l'assistance d'une intelligence artificielle. Il ne constitue pas un avis juridique.", 7, false, [150, 150, 150]);
    }

    // QR Code — points to the public, unauthenticated verification page (no Cachetify
    // account needed to scan and confirm this certificate), not the private contract page.
    // Always publicToken (never contractId/draftId, both guessable/enumerable) — see the
    // Sécurité et protection des données section of the mémoire.
    try {
        const verifyUrl = `${window.location.origin}/verify/${data.publicToken || data.contractId || data.draftId}`;
        const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 80 });
        doc.addImage(qrDataUrl, "PNG", pageWidth - margin - 28, yPos - 16, 28, 28);
    } catch (e) {
        console.error("Failed to generate QR code", e);
    }

    // Rebuilt from its actual parts (type, every signatory, creation date, reference) rather
    // than reusing the on-screen `title` verbatim — see buildContractFileBaseName. The
    // reference is what actually guarantees this never collides with another certificate:
    // two contracts CAN otherwise share an identical type/parties/day.
    const fileBaseName = buildContractFileBaseName({
        documentType: data.documentType,
        partyNames: data.signatories.map((s) => s.name).filter(Boolean),
        createdAt: new Date(data.createdAt),
        reference: data.reference,
    });

    // For an AI-generated contract the certificate already IS the full document (its content
    // was reproduced above) — nothing to merge it with, its own bytes are the result.
    if (!data.isExternalPdf || !data.proxyUrl) {
        return { bytes: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer), fileName: `${fileBaseName}.pdf` };
    }

    // For an imported PDF, hand back one single file — the original pages followed by this
    // certificate page(s) — instead of a bare certificate that forces the reader to go find
    // the original document separately. This never touches the original file's own bytes or
    // its certified hash (still checked/compared exactly as before at signing time,
    // elsewhere) — it's assembled fresh from two already-verified pieces, not a new artifact
    // stored or hashed anywhere by this function itself.
    try {
        const [{ PDFDocument }, originalRes] = await Promise.all([
            import("pdf-lib"),
            fetch(data.proxyUrl, { credentials: "include" }),
        ]);
        if (!originalRes.ok) throw new Error(`HTTP ${originalRes.status}`);
        const originalBytes = await originalRes.arrayBuffer();

        const merged = await PDFDocument.create();
        const originalDoc = await PDFDocument.load(originalBytes);
        const certDoc = await PDFDocument.load(doc.output("arraybuffer"));

        for (const page of await merged.copyPages(originalDoc, originalDoc.getPageIndices())) {
            merged.addPage(page);
        }
        for (const page of await merged.copyPages(certDoc, certDoc.getPageIndices())) {
            merged.addPage(page);
        }

        return { bytes: await merged.save(), fileName: `${fileBaseName}.pdf` };
    } catch (error) {
        // Original document unreachable (network hiccup, server down) — fall back to the
        // certificate alone rather than leaving the caller with nothing at all.
        console.error("Failed to merge original document with certificate, using certificate only:", error);
        return { bytes: new Uint8Array(doc.output("arraybuffer") as ArrayBuffer), fileName: `${fileBaseName}.pdf` };
    }
}

/**
 * Génère le certificat ET le télécharge immédiatement — utilisé par le bouton de
 * téléchargement manuel (contract-details-page.tsx). Le dépôt automatique du certificat
 * officiel, lui, appelle buildCertificatePdfBytes directement : il a besoin des octets, pas
 * d'un fichier pose sur le disque de l'utilisateur.
 */
export async function generateCertifiedPDF(data: PDFData): Promise<void> {
    const { bytes, fileName } = await buildCertificatePdfBytes(data);
    downloadBytes(bytes, fileName);
}
