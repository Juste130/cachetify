/**
 * A client-declared `Content-Type: application/pdf` is trivially spoofable — multer's
 * `fileFilter` only ever sees that header, never the file's actual bytes, so it accepts
 * anything sent with the right label. This checks the file's own leading bytes instead: the
 * PDF spec (ISO 32000) requires the file to start with "%PDF-" (sometimes preceded by a
 * short binary marker some producers add, so this scans the first KB rather than requiring
 * an exact offset-0 match). A file that fails this check isn't a PDF regardless of what
 * Content-Type it was uploaded with — reject it before it's pinned to IPFS and served back
 * to users through an unsandboxed iframe.
 */
function isLikelyPdf(buffer) {
    if (!buffer || buffer.length < 5) return false;
    const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
    return head.includes('%PDF-');
}

module.exports = { isLikelyPdf };
