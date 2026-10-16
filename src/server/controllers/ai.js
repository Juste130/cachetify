const aiService = require('../services/ai');
const logger = require('../utils/logger');
const { PDFParse } = require('pdf-parse');
const { BadRequestError } = require('../utils/errors');
const { isLikelyPdf } = require('../utils/pdf-signature');

// A digitally-signed PDF (Adobe Sign, DocuSign, Acrobat...) embeds a signature dictionary
// whose /ByteRange entry is mandated by the PDF spec (ISO 32000) — searching the raw bytes
// for it is a reliable, well-established way to detect a REAL embedded digital signature
// without needing a full PDF-parsing library. This says nothing about a scanned wet-ink
// signature (that's just pixels in an image) — that case is left to the AI text heuristic,
// with a clearly lower confidence.
function hasEmbeddedDigitalSignature(buffer) {
    const raw = buffer.toString('latin1');
    return /\/ByteRange/.test(raw) && /\/(Sig|DocTimeStamp)\b/.test(raw);
}

async function generateContract(body) {
    const { templateType, partyAData, partyBData, additionalClauses, context } = body;
    if (!templateType || !partyAData || !partyBData) {
        throw new BadRequestError('Template type, party A data, and party B data are required');
    }
    const result = await aiService.generateContract(templateType, partyAData, partyBData, additionalClauses, context);
    return { message: 'Contract generated successfully', contract: result.content, suggestions: result.suggestions };
}

async function correctInput(body) {
    const { text, context } = body;
    if (!text) throw new BadRequestError('Text is required');
    const corrected = await aiService.correctInput(text, context);
    return { message: 'Input corrected successfully', corrected };
}

async function improveClause(body) {
    const { clause, context } = body;
    if (!clause) throw new BadRequestError('Clause is required');
    const result = await aiService.improveClause(clause, context);
    return { message: 'Clause improved successfully', improved: result.improved, explanation: result.explanation };
}

async function suggestClauses(body) {
    const { contractType, specificNeeds } = body;
    if (!contractType) throw new BadRequestError('Contract type is required');
    const clauses = await aiService.suggestClauses(contractType, specificNeeds);
    return { message: 'Clauses suggested successfully', clauses };
}

async function validateContract(body) {
    const { contractText, partyAData, partyBData } = body;
    if (!contractText) throw new BadRequestError('Contract text is required');
    // partyAData/partyBData sont optionnels : quand le formulaire de création les fournit,
    // le service masque en plus les champs personnels nominatifs avant l'envoi au modèle.
    const result = await aiService.validateContract(contractText, { partyAData, partyBData });
    return { message: 'Contract validated successfully', isValid: result.isValid, issues: result.issues, suggestions: result.suggestions };
}

/**
 * Analyze an imported PDF before it's saved as a draft: extract its text (best-effort — a
 * scanned PDF with no text layer simply yields nothing), detect an embedded digital
 * signature, and ask the AI for a best-effort read on the parties, whether the document
 * looks like a contract, and whether it appears already signed. Every signal here is a
 * suggestion for the UI to surface, never a fact the platform asserts on its own.
 */
async function analyzeImportedPdf(file) {
    if (!file) throw new BadRequestError('No file provided');
    const buffer = Buffer.from(await file.arrayBuffer());

    // The client-declared Content-Type is spoofable — this verifies the file's actual
    // bytes before it's parsed or, later, stored and served back through an iframe.
    if (!isLikelyPdf(buffer)) {
        throw new BadRequestError('Le fichier fourni ne semble pas être un PDF valide.');
    }

    const hasDigitalSignature = hasEmbeddedDigitalSignature(buffer);

    let extractedText = '';
    try {
        const parser = new PDFParse({ data: buffer });
        try {
            const result = await parser.getText();
            extractedText = result.text || '';
        } finally {
            await parser.destroy();
        }
    } catch (err) {
        // A malformed or unusual PDF failing to parse must not block the import — it just
        // means no AI-assisted suggestions are possible, same as a scanned PDF.
        logger.warn('PDF text extraction failed, continuing without it:', err.message);
    }

    const analysis = await aiService.analyzeImportedContract(extractedText);
    return { ...analysis, hasDigitalSignature, hasExtractedText: extractedText.trim().length > 0 };
}

async function resolveJurisdictionCity(body) {
    const { city, country, knownCities } = body;
    if (!city || !country || !Array.isArray(knownCities) || knownCities.length === 0) {
        throw new BadRequestError('city, country and a non-empty knownCities array are required');
    }
    return aiService.resolveJurisdictionCity(city, country, knownCities);
}

module.exports = {
    generateContract, correctInput, improveClause, suggestClauses,
    validateContract, analyzeImportedPdf, resolveJurisdictionCity,
};
