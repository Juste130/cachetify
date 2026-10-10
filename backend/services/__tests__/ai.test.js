/**
 * Tests du service de rédaction et de vérification de conformité par l'IA — le module qui
 * porte les objectifs OS3 (rédaction assistée) et une partie d'OS4 (import de documents) du
 * mémoire. Comme pour incident.test.js, ce sont des tests unitaires du SERVICE lui-même :
 * l'appel réseau à Groq est simulé (jest.mock('groq-sdk')), on ne teste donc pas la qualité
 * du texte produit par le modèle (cela relève du protocole d'évaluation E1/E2, avec de vraies
 * données), mais la logique déterministe du service — construction du prompt, extraction des
 * champs de la réponse, et surtout les garde-fous anti-hallucination d'analyzeImportedContract.
 */
const mockCreate = jest.fn();
jest.mock('groq-sdk', () => {
    return jest.fn().mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
    }));
});
jest.mock('../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('../../config', () => ({ config: { groqApiKey: 'test-key', groqModel: 'test-model' } }));

const aiService = require('../ai');

function mockChatResponse(content) {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content } }] });
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('buildContractPrompt', () => {
    it("inclut la liste des articles obligatoires propre au type de contrat", () => {
        const prompt = aiService.buildContractPrompt('cdi', { type: 'individual' }, { type: 'company' }, [], '');
        expect(prompt).toContain("Préambule & identification des parties (employeur et salarié)");
        expect(prompt).toContain('Rupture du contrat');
    });

    it("retombe sur le squelette générique pour un type de contrat inconnu", () => {
        const prompt = aiService.buildContractPrompt('type_inexistant', {}, {}, [], '');
        expect(prompt).toContain('Objet du contrat');
        expect(prompt).not.toContain('CNSS');
    });

    it("ajoute les clauses additionnelles demandées par l'utilisateur", () => {
        const prompt = aiService.buildContractPrompt('freelance', {}, {}, ['Clause de propriété du code source'], '');
        expect(prompt).toContain('CLAUSES ADDITIONNELLES REQUISES');
        expect(prompt).toContain('Clause de propriété du code source');
    });

    it("n'affiche pas la section des clauses additionnelles si aucune n'est fournie", () => {
        const prompt = aiService.buildContractPrompt('nda', {}, {}, [], '');
        expect(prompt).not.toContain('CLAUSES ADDITIONNELLES REQUISES');
    });
});

describe('extractClauseSuggestions', () => {
    it("retient les lignes qui commencent un article, dans la limite de cinq", () => {
        const content = [
            'CONTRAT DE PRESTATION',
            '',
            'Article 1 - Objet',
            'Texte de l\'article.',
            'Article 2 - Durée',
            'Article 3 - Rémunération',
            'Article 4 - Confidentialité',
            'Article 5 - Résiliation',
            'Article 6 - Droit applicable',
        ].join('\n');
        const suggestions = aiService.extractClauseSuggestions(content);
        expect(suggestions).toHaveLength(5);
        expect(suggestions[0]).toBe('Article 1 - Objet');
    });
});

describe('parseImprovement', () => {
    it("sépare la clause améliorée de son explication", () => {
        const result = "AMÉLIORATION: Le prestataire livre le rapport sous 5 jours ouvrés.\nEXPLICATION: Délai chiffré, plus vérifiable qu'un délai vague.";
        const [improved, explanation] = aiService.parseImprovement(result);
        expect(improved).toBe('Le prestataire livre le rapport sous 5 jours ouvrés.');
        expect(explanation).toBe("Délai chiffré, plus vérifiable qu'un délai vague.");
    });

    it("renvoie le texte brut si le format attendu n'est pas respecté", () => {
        const [improved, explanation] = aiService.parseImprovement('texte libre sans balises');
        expect(improved).toBe('texte libre sans balises');
        expect(explanation).toBe('');
    });
});

describe('parseValidation', () => {
    it("sépare les problèmes des suggestions et retire la numérotation", () => {
        const result = [
            'PROBLÈMES:',
            '- Aucune clause de résiliation',
            '1. Montant du loyer non précisé',
            'SUGGESTIONS:',
            '- Ajouter une clause de résiliation avec préavis',
        ].join('\n');
        const { issues, suggestions } = aiService.parseValidation(result);
        expect(issues).toEqual(['Aucune clause de résiliation', 'Montant du loyer non précisé']);
        expect(suggestions).toEqual(['Ajouter une clause de résiliation avec préavis']);
    });

    it("renvoie des listes vides si le modèle ne suit pas le format demandé", () => {
        const { issues, suggestions } = aiService.parseValidation('réponse hors format');
        expect(issues).toEqual([]);
        expect(suggestions).toEqual([]);
    });

    it("reconnaît les titres de section même avec une emphase Markdown et un espace avant les deux-points", () => {
        // Constaté en pratique avec gpt-oss-120b : "**PROBLÈMES :**" au lieu de "PROBLÈMES:"
        // demandé — l'ancienne regex, trop stricte, faisait alors disparaître silencieusement
        // des problèmes réellement identifiés par le modèle (voir mémoire, chapitre 3).
        const result = [
            '**PROBLÈMES :**',
            '- **Article 5 absent** : aucune disposition sur le salaire',
            '**SUGGESTIONS :**',
            '- Insérer un article Rémunération',
        ].join('\n');
        const { issues, suggestions } = aiService.parseValidation(result);
        expect(issues).toEqual(['Article 5 absent : aucune disposition sur le salaire']);
        expect(suggestions).toEqual(['Insérer un article Rémunération']);
    });
});

describe('minimisation des données personnelles (besoin non fonctionnel Confidentialité)', () => {
    const partyA = { name: 'Jean DOSSOU', email: 'jean.dossou@example.com', phone: '+229 97 00 00 00', address: 'Cotonou, Bénin' };
    const partyB = { name: 'ACME SARL', email: 'contact@acme.bj', rccm: 'RB/COT/2020/B1234' };

    it("generateContract n'envoie jamais le nom ni le courriel réels des parties au modèle", async () => {
        mockChatResponse('CONTRAT ENTRE [[PARTIE_A_NOM]] ET [[PARTIE_B_NOM]]\n\nArticle 1 - Objet\nAccord entre [[PARTIE_A_NOM]] ([[PARTIE_A_COURRIEL]]) et [[PARTIE_B_NOM]].');
        await aiService.generateContract('freelance', partyA, partyB, [], '');

        const sentContent = mockCreate.mock.calls[0][0].messages[1].content;
        expect(sentContent).not.toContain('Jean DOSSOU');
        expect(sentContent).not.toContain('jean.dossou@example.com');
        expect(sentContent).not.toContain('ACME SARL');
        expect(sentContent).toContain('[[PARTIE_A_NOM]]');
    });

    it("generateContract réinsère les vraies coordonnées dans le contrat renvoyé à l'utilisateur", async () => {
        mockChatResponse('CONTRAT ENTRE [[PARTIE_A_NOM]] ET [[PARTIE_B_NOM]]\n\nArticle 1 - Objet\nAccord entre [[PARTIE_A_NOM]] ([[PARTIE_A_COURRIEL]]) et [[PARTIE_B_NOM]].');
        const result = await aiService.generateContract('freelance', partyA, partyB, [], '');

        expect(result.content).toContain('Jean DOSSOU');
        expect(result.content).toContain('jean.dossou@example.com');
        expect(result.content).toContain('ACME SARL');
        expect(result.content).not.toContain('[[PARTIE_A_NOM]]');
    });

    it("validateContract masque les coordonnées des parties quand le formulaire les fournit", async () => {
        mockChatResponse('PROBLÈMES:\n- Le représentant de [[PARTIE_B_NOM]] n\'est pas identifié\nSUGGESTIONS:\n');
        const contractText = 'Entre Jean DOSSOU (jean.dossou@example.com) et ACME SARL, il est convenu ce qui suit.';

        await aiService.validateContract(contractText, { partyAData: partyA, partyBData: partyB });

        const sentContent = mockCreate.mock.calls[0][0].messages[1].content;
        expect(sentContent).not.toContain('Jean DOSSOU');
        expect(sentContent).not.toContain('ACME SARL');
    });

    it("validateContract réinsère les vraies valeurs dans les problèmes renvoyés à l'utilisateur", async () => {
        mockChatResponse("PROBLÈMES:\n- Le représentant de [[PARTIE_B_NOM]] n'est pas identifié\nSUGGESTIONS:\n");
        const contractText = 'Entre Jean DOSSOU (jean.dossou@example.com) et ACME SARL, il est convenu ce qui suit.';

        const result = await aiService.validateContract(contractText, { partyAData: partyA, partyBData: partyB });

        expect(result.issues[0]).toContain('ACME SARL');
        expect(result.issues[0]).not.toContain('[[PARTIE_B_NOM]]');
    });

    it("validateContract masque un courriel détecté dans le texte libre même sans données de formulaire", async () => {
        mockChatResponse('PROBLÈMES:\nSUGGESTIONS:\n');
        const contractText = 'Contactez le prestataire à inconnu@ailleurs.com pour toute question.';

        await aiService.validateContract(contractText);

        const sentContent = mockCreate.mock.calls[0][0].messages[1].content;
        expect(sentContent).not.toContain('inconnu@ailleurs.com');
        expect(sentContent).toContain('[[COURRIEL_DETECTE_1]]');
    });
});

describe('validateContract (essai E2 : vérification de conformité)', () => {
    it("relève une omission signalée par le modèle et la classe en isValid=false", async () => {
        mockChatResponse('PROBLÈMES:\n- Absence de clause de résiliation\nSUGGESTIONS:\n- Ajouter un article de résiliation');
        const result = await aiService.validateContract('Texte du contrat sans article de résiliation.');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Absence de clause de résiliation');
    });

    it("marque isValid=true quand aucun problème n'est relevé", async () => {
        mockChatResponse('PROBLÈMES:\nSUGGESTIONS:\n');
        const result = await aiService.validateContract('Texte de contrat complet.');
        expect(result.isValid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it("tronque le contrat soumis à 9000 caractères avant de l'envoyer au modèle", async () => {
        mockChatResponse('PROBLÈMES:\nSUGGESTIONS:\n');
        const longContract = 'A'.repeat(20000);
        await aiService.validateContract(longContract);
        const sentContent = mockCreate.mock.calls[0][0].messages[1].content;
        expect(sentContent.length).toBeLessThan(9200);
    });
});

describe("analyzeImportedContract (garde-fous anti-hallucination)", () => {
    const sourceText = "Contrat entre Jean DOSSOU (jean.dossou@example.com) et la société ACME SARL, RCCM RB/COT/2020/B1234.";

    it("rejette un courriel halluciné qui n'apparaît pas mot pour mot dans le texte source", async () => {
        mockChatResponse(JSON.stringify({
            parties: [{ name: 'Jean DOSSOU', email: 'invente@ailleurs.com', type: 'individual' }],
            looksLikeContract: true, looksLikeContractConfidence: 'high',
            mentionsExistingSignature: false, signatureConfidence: 'low', signatureExcerpt: null,
            documentType: { knownType: null, suggestedLabel: 'Contrat' },
        }));
        const result = await aiService.analyzeImportedContract(sourceText);
        expect(result.parties[0].email).toBe('');
    });

    it("retient un courriel qui apparaît réellement dans le texte source", async () => {
        mockChatResponse(JSON.stringify({
            parties: [{ name: 'Jean DOSSOU', email: 'jean.dossou@example.com', type: 'individual' }],
            looksLikeContract: true, looksLikeContractConfidence: 'high',
            mentionsExistingSignature: false, signatureConfidence: 'low', signatureExcerpt: null,
            documentType: { knownType: null, suggestedLabel: null },
        }));
        const result = await aiService.analyzeImportedContract(sourceText);
        expect(result.parties[0].email).toBe('jean.dossou@example.com');
    });

    it("rejette un numéro RCCM halluciné, absent du texte source", async () => {
        mockChatResponse(JSON.stringify({
            parties: [{ name: 'ACME SARL', type: 'company', rccm: 'RB/COT/1999/A9999' }],
            looksLikeContract: true, looksLikeContractConfidence: 'medium',
            mentionsExistingSignature: false, signatureConfidence: 'low', signatureExcerpt: null,
            documentType: { knownType: null, suggestedLabel: null },
        }));
        const result = await aiService.analyzeImportedContract(sourceText);
        expect(result.parties[0].rccm).toBe('');
    });

    it("renvoie une réponse neutre sur un texte vide, sans appeler le modèle", async () => {
        const result = await aiService.analyzeImportedContract('   ');
        expect(result.parties).toEqual([]);
        expect(result.looksLikeContract).toBeNull();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("renvoie une réponse neutre si le modèle échoue, sans faire échouer l'import", async () => {
        mockCreate.mockRejectedValueOnce(new Error('Groq indisponible'));
        const result = await aiService.analyzeImportedContract(sourceText);
        expect(result.parties).toEqual([]);
        expect(result.documentType).toEqual({ knownType: null, suggestedLabel: null });
    });
});
