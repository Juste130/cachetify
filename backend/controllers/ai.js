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
    // latin1 keeps a 1:1 byte-to-char mapping — exactly what's needed to search for an
    // ASCII marker inside a binary PDF without corrupting multi-byte sequences.
    const raw = buffer.toString('latin1');
    return /\/ByteRange/.test(raw) && /\/(Sig|DocTimeStamp)\b/.test(raw);
}

/**
 * Generate contract
 */
exports.generateContract = async (req, res, next) => {
    try {
        const { templateType, partyAData, partyBData, additionalClauses, context } = req.body;

        if (!templateType || !partyAData || !partyBData) {
            return res.status(400).json({
                error: 'Template type, party A data, and party B data are required',
            });
        }

        const result = await aiService.generateContract(
            templateType,
            partyAData,
            partyBData,
            additionalClauses,
            context
        );

        res.json({
            message: 'Contract generated successfully',
            contract: result.content,
            suggestions: result.suggestions,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Correct input
 */
exports.correctInput = async (req, res, next) => {
    try {
        const { text, context } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const corrected = await aiService.correctInput(text, context);

        res.json({
            message: 'Input corrected successfully',
            corrected,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Improve clause
 */
exports.improveClause = async (req, res, next) => {
    try {
        const { clause, context } = req.body;

        if (!clause) {
            return res.status(400).json({ error: 'Clause is required' });
        }

        const result = await aiService.improveClause(clause, context);

        res.json({
            message: 'Clause improved successfully',
            improved: result.improved,
            explanation: result.explanation,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Suggest clauses
 */
exports.suggestClauses = async (req, res, next) => {
    try {
        const { contractType, specificNeeds } = req.body;

        if (!contractType) {
            return res.status(400).json({ error: 'Contract type is required' });
        }

        const clauses = await aiService.suggestClauses(contractType, specificNeeds);

        res.json({
            message: 'Clauses suggested successfully',
            clauses,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Validate contract
 */
exports.validateContract = async (req, res, next) => {
    try {
        const { contractText, partyAData, partyBData } = req.body;

        if (!contractText) {
            return res.status(400).json({ error: 'Contract text is required' });
        }

        // partyAData/partyBData sont optionnels : quand le formulaire de création les
        // fournit, le service masque en plus les champs personnels nominatifs avant l'envoi
        // au modèle (voir services/ai.js, validateContract).
        const result = await aiService.validateContract(contractText, { partyAData, partyBData });

        res.json({
            message: 'Contract validated successfully',
            isValid: result.isValid,
            issues: result.issues,
            suggestions: result.suggestions,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Analyze an imported PDF before it's saved as a draft: extract its text (best-effort —
 * a scanned PDF with no text layer simply yields nothing, which is fine), detect an
 * embedded digital signature, and ask the AI for a best-effort read on the parties, whether
 * the document looks like a contract, and whether it appears already signed. Every signal
 * here is a suggestion for the UI to surface, never a fact the platform asserts on its own.
 */
exports.analyzeImportedPdf = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new BadRequestError('No file provided');
        }
        // The route's multer fileFilter only checked the client-declared Content-Type
        // (spoofable) — this verifies the file's actual bytes before it's parsed or, later,
        // pinned to IPFS and served back through an iframe.
        if (!isLikelyPdf(req.file.buffer)) {
            throw new BadRequestError('Le fichier fourni ne semble pas être un PDF valide.');
        }

        const hasDigitalSignature = hasEmbeddedDigitalSignature(req.file.buffer);

        let extractedText = '';
        try {
            const parser = new PDFParse({ data: req.file.buffer });
            try {
                const result = await parser.getText();
                extractedText = result.text || '';
            } finally {
                await parser.destroy();
            }
        } catch (err) {
            // A malformed or unusual PDF failing to parse must not block the import — it
            // just means no AI-assisted suggestions are possible, same as a scanned PDF.
            logger.warn('PDF text extraction failed, continuing without it:', err.message);
        }

        const analysis = await aiService.analyzeImportedContract(extractedText);

        res.json({ ...analysis, hasDigitalSignature, hasExtractedText: extractedText.trim().length > 0 });
    } catch (error) {
        next(error);
    }
};

/**
 * Resolve which known jurisdiction seat city covers a free-text city
 */
exports.resolveJurisdictionCity = async (req, res, next) => {
    try {
        const { city, country, knownCities } = req.body;

        if (!city || !country || !Array.isArray(knownCities) || knownCities.length === 0) {
            return res.status(400).json({ error: 'city, country and a non-empty knownCities array are required' });
        }

        const result = await aiService.resolveJurisdictionCity(city, country, knownCities);

        res.json(result);
    } catch (error) {
        next(error);
    }
};
