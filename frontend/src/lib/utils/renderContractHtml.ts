/**
 * Renders the plain-text contract convention (see backend/services/ai.js: first non-empty
 * line = title, "Article N / Chapitre / Préambule / Annexe" lines = section headers, blank
 * lines separate paragraphs) into a small, self-contained HTML document.
 *
 * This is what actually gets pinned to IPFS (see create-contract-page.tsx) — a plain .txt
 * file opened directly from a gateway link renders as an unstyled wall of text in a
 * monospace font, which read as "the wrong/broken format" even once it stopped being a raw
 * JSON blob. A self-contained HTML file (inline CSS, no external requests) opens as an
 * actual formatted document from any browser, with no dependency on this app being loaded.
 */
const SECTION_HEADER_RE = /^(article\s+\d+|chapitre\b|titre\s+[ivx\d]|préambule\b|annexe\s*\d*)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderContractToHtml(content: string, documentTitle: string): string {
  const lines = content.split("\n");
  const bodyParts: string[] = [];
  let titleConsumed = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    bodyParts.push(`<p>${paragraphBuffer.map(escapeHtml).join("<br>")}</p>`);
    paragraphBuffer = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!titleConsumed && trimmed !== "" && !SECTION_HEADER_RE.test(trimmed)) {
      titleConsumed = true;
      bodyParts.push(`<h1>${escapeHtml(trimmed)}</h1>`);
      continue;
    }
    if (trimmed !== "") titleConsumed = true;

    if (SECTION_HEADER_RE.test(trimmed) && trimmed.length < 140) {
      flushParagraph();
      bodyParts.push(`<h2>${escapeHtml(trimmed)}</h2>`);
    } else if (trimmed === "") {
      flushParagraph();
    } else {
      paragraphBuffer.push(trimmed);
    }
  }
  flushParagraph();

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 48px 24px;
    background: #EEF0EF;
    color: #15181D;
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1.65;
  }
  .doc {
    max-width: 720px;
    margin: 0 auto;
    background: #FFFFFF;
    border: 1px solid #D7D4CA;
    border-radius: 4px;
    padding: 56px 64px;
    box-shadow: 0 1px 2px rgba(21,24,29,0.06), 0 8px 24px -12px rgba(21,24,29,0.12);
  }
  h1 {
    font-size: 22px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0 0 32px;
    padding-bottom: 20px;
    border-bottom: 2px solid #D7D4CA;
  }
  h2 {
    font-size: 15px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #D7D4CA;
  }
  p {
    font-size: 14.5px;
    margin: 0 0 14px;
    text-align: justify;
  }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #D7D4CA;
    font-family: 'Courier New', monospace;
    font-size: 10.5px;
    color: #7A828C;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="doc">
    ${bodyParts.join("\n    ")}
    <p class="footer">Document généré et certifié par Cachetify — intégrité vérifiable par empreinte SHA-256.</p>
  </div>
</body>
</html>
`;
}
