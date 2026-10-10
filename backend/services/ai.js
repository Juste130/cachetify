const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { config } = require('../config');
const { AppError } = require('../utils/errors');

// Structure des articles imposée au LLM, par type de contrat. Chaque type de contrat
// obéit à un régime juridique différent (droit du travail pour CDI/CDD, droit du bail
// pour une location, etc.) : un même squelette générique pour tous les types produit un
// contrat qui ne répond pas aux mentions propres à chaque régime.
const TEMPLATE_SECTIONS = {
    cdi: [
        "Préambule & identification des parties (employeur et salarié)",
        "Objet du contrat et intitulé du poste occupé",
        "Date d'entrée en fonction et période d'essai",
        "Durée du contrat (indéterminée) et lieu de travail",
        "Rémunération (salaire brut, périodicité) et affiliation à la sécurité sociale (CNSS ou régime équivalent)",
        "Durée du travail, horaires et congés",
        "Obligations de l'employeur et du salarié",
        "Confidentialité et propriété intellectuelle des travaux réalisés",
        "Clause de non-concurrence, le cas échéant",
        "Rupture du contrat (démission, licenciement, préavis, indemnités)",
        "Droit applicable et mode de résolution des litiges",
        "Signatures et date",
    ],
    cdd: [
        "Préambule & identification des parties (employeur et salarié)",
        "Objet du contrat et intitulé du poste occupé",
        "Motif légal du recours au CDD et durée déterminée (dates de début et de fin précises)",
        "Période d'essai",
        "Rémunération (salaire brut, périodicité) et affiliation à la sécurité sociale (CNSS ou régime équivalent)",
        "Obligations de l'employeur et du salarié",
        "Confidentialité",
        "Conditions de renouvellement et risque de requalification en CDI",
        "Rupture anticipée du contrat",
        "Droit applicable et mode de résolution des litiges",
        "Signatures et date",
    ],
    freelance: [
        "Préambule & identification des parties (client et prestataire indépendant)",
        "Objet de la prestation et livrables attendus",
        "Durée de la mission et calendrier d'exécution",
        "Rémunération, modalités et échéancier de paiement",
        "Statut d'indépendance du prestataire (absence de lien de subordination)",
        "Propriété intellectuelle des livrables",
        "Confidentialité",
        "Obligations et garanties du prestataire",
        "Résiliation",
        "Droit applicable et mode de résolution des litiges",
        "Signatures et date",
    ],
    location: [
        "Préambule & identification des parties (bailleur et locataire)",
        "Désignation et description du bien loué",
        "Durée du bail et date de prise d'effet",
        "Loyer, charges et modalités de paiement",
        "Dépôt de garantie",
        "État des lieux d'entrée et de sortie",
        "Obligations du bailleur et du locataire",
        "Résiliation et délai de préavis",
        "Droit applicable et juridiction compétente",
        "Signatures et date",
    ],
    nda: [
        "Préambule & identification des parties (partie divulgatrice et partie réceptrice)",
        "Objet et définition des informations confidentielles couvertes",
        "Obligations de confidentialité et de non-divulgation",
        "Exceptions à l'obligation de confidentialité",
        "Durée de l'obligation de confidentialité, y compris après la fin du contrat",
        "Restitution ou destruction des informations à l'issue du contrat",
        "Sanctions en cas de manquement",
        "Droit applicable et mode de résolution des litiges",
        "Signatures et date",
    ],
    commercial: [
        "Préambule & identification des parties",
        "Objet du contrat commercial",
        "Durée et conditions de renouvellement",
        "Obligations réciproques des parties",
        "Conditions financières et modalités de paiement",
        "Propriété intellectuelle, le cas échéant",
        "Confidentialité",
        "Résiliation",
        "Droit applicable et mode de résolution des litiges",
        "Signatures et date",
    ],
    custom: [
        "Préambule & identification des parties",
        "Objet du contrat",
        "Durée et date d'entrée en vigueur",
        "Obligations de chaque partie",
        "Conditions financières et modalités de paiement",
        "Confidentialité",
        "Résiliation",
        "Droit applicable et juridiction compétente",
        "Signatures et date",
    ],
};

// Clauses transverses attendues dans un contrat solide, quel que soit son type,
// et trop souvent oubliées d'un squelette générique.
const STANDARD_CLAUSES_REMINDER = `Sauf si le type de contrat les rend manifestement hors sujet, prévois aussi, en les intégrant dans les articles les plus pertinents plutôt qu'en vrac à la fin :
- une clause de force majeure ;
- une clause de protection des données personnelles des parties ;
- une clause de cession du contrat (le contrat est-il cessible à un tiers, sous quelles conditions) ;
- une clause de mise en demeure préalable à toute action en justice ;
- la langue faisant foi en cas de traduction ;
- dans l'article sur le droit applicable, précise si le litige doit être porté devant les juridictions compétentes ou peut faire l'objet d'une médiation/arbitrage, plutôt que de te contenter d'un renvoi vague.`;

// Champs personnels d'une partie, et le marqueur neutre qui les remplace avant tout envoi
// au service d'IA (un tiers externe) — voir le besoin non fonctionnel "Confidentialité"
// (mémoire, chapitre 2, section Sécurité et protection des données).
const PARTY_PII_FIELDS = [
    ['name', 'NOM'],
    ['email', 'COURRIEL'],
    ['phone', 'TELEPHONE'],
    ['address', 'ADRESSE'],
    ['rccm', 'RCCM'],
    ['ifu', 'IFU'],
    ['legalRepName', 'REPRESENTANT'],
    ['legalRepTitle', 'QUALITE_REPRESENTANT'],
    ['dateOfBirth', 'DATE_NAISSANCE'],
];

// Repère, en secours, un courriel ou un numéro de téléphone qui traînerait dans un texte
// libre sans venir d'un champ de formulaire connu (ex: un contrat importé puis retapé à la
// main). Complète le marquage nominatif ci-dessus, ne le remplace pas.
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?\d[\s.-]?){8,15}/g;

class AIService {
    constructor() {
        this.client = new Groq({ apiKey: config.groqApiKey });
        // Modèle Groq gratuit (voir GROQ_MODEL dans .env pour le changer)
        this.model = config.groqModel;
    }

    // ─── Méthode interne centrale ────────────────────────────────────────────────
    async _chat(messages, options = {}) {
        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.max_tokens ?? 4096,
        });
        return completion.choices[0]?.message?.content?.trim() || '';
    }

    // ─── Correction d'un input utilisateur ──────────────────────────────────────
    async correctInput(text, context) {
        try {
            const content = await this._chat([
                {
                    role: 'system',
                    content: 'Tu es un expert juridique. Tu retournes UNIQUEMENT le texte reformulé, sans guillemets, sans explications et sans markdown.',
                },
                {
                    role: 'user',
                    content: `Corrige et reformule ce texte pour qu'il soit professionnel et adapté à un contrat juridique.\nChamp concerné : ${context}\nTexte à corriger : "${text}"`,
                },
            ], { max_tokens: 512 });

            logger.info('Input corrected successfully');
            return content;
        } catch (error) {
            logger.error('Error correcting input:', error);
            throw new AppError('Failed to correct input', 500);
        }
    }

    // ─── Minimisation des données personnelles avant envoi au service d'IA ──────
    // Remplace les champs personnels d'une partie par un marqueur neutre (ex: "[[PARTIE_A
    // NOM]]"), pour que le texte réellement envoyé au tiers externe (Groq) ne contienne ni
    // nom, ni courriel, ni adresse. entries sert ensuite à réinsérer les vraies valeurs dans
    // la réponse reçue.
    maskPartyData(partyData, label) {
        const masked = { ...partyData };
        const entries = [];
        for (const [field, tag] of PARTY_PII_FIELDS) {
            const value = partyData?.[field];
            if (typeof value === 'string' && value.trim().length >= 2) {
                const marker = `[[${label}_${tag}]]`;
                entries.push({ value: value.trim(), marker });
                masked[field] = marker;
            }
        }
        return { masked, entries };
    }

    // Les valeurs les plus longues d'abord : une valeur courte contenue dans une valeur plus
    // longue (ex: un prénom qui apparaît aussi dans une adresse) ne doit pas la fragmenter.
    maskText(text, entries) {
        let out = text;
        for (const { value, marker } of [...entries].sort((a, b) => b.value.length - a.value.length)) {
            out = out.split(value).join(marker);
        }
        return out;
    }

    unmaskText(text, entries) {
        let out = text;
        for (const { value, marker } of entries) {
            out = out.split(marker).join(value);
        }
        return out;
    }

    // Filet de sécurité pour validateContract : un contrat peut contenir un courriel ou un
    // numéro de téléphone qui ne correspond à aucun champ de formulaire connu (contrat
    // importé, retapé à la main). Remplace ce qui ressemble à ces motifs par un marqueur
    // générique, réversible de la même façon que maskPartyData.
    maskFreeTextPii(text) {
        const entries = [];
        let i = 0;
        let out = text.replace(EMAIL_PATTERN, (match) => {
            i += 1;
            const marker = `[[COURRIEL_DETECTE_${i}]]`;
            entries.push({ value: match, marker });
            return marker;
        });
        let j = 0;
        out = out.replace(PHONE_PATTERN, (match) => {
            // Un motif de 8 à 15 chiffres espacés capture aussi des références de contrat ou
            // des montants (ex: "10 000 000 FCFA") — on ne masque que s'il y a au moins 8
            // chiffres réels, pour limiter les faux positifs sur ces cas.
            const digits = match.replace(/\D/g, '');
            if (digits.length < 8) return match;
            j += 1;
            const marker = `[[TELEPHONE_DETECTE_${j}]]`;
            entries.push({ value: match, marker });
            return marker;
        });
        return { masked: out, entries };
    }

    // ─── Génération d'un contrat complet ────────────────────────────────────────
    async generateContract(templateType, partyAData, partyBData, additionalClauses, context) {
        try {
            const { masked: maskedA, entries: entriesA } = this.maskPartyData(partyAData, 'PARTIE_A');
            const { masked: maskedB, entries: entriesB } = this.maskPartyData(partyBData, 'PARTIE_B');
            const maskEntries = [...entriesA, ...entriesB];

            const prompt = this.buildContractPrompt(templateType, maskedA, maskedB, additionalClauses, context);

            const rawContent = await this._chat([
                {
                    role: 'system',
                    // Le public cible ne connaît pas le Markdown — un contrat truffé de #, **
                    // et de tableaux en | est illisible tel quel pour lui, et le renderer
                    // maison de l'app ne sait de toute façon pas afficher un tableau Markdown
                    // (d'où le bloc signature qui s'affichait cassé). Texte brut uniquement.
                    content: 'Tu es un avocat d\'affaires expert. Tu rédiges des contrats juridiques professionnels, structurés et complets, en TEXTE BRUT et en français courant compréhensible par un non-juriste. N\'utilise JAMAIS de syntaxe Markdown ni aucun langage de balisage : pas de #, pas de **, pas de *, pas de _, pas de `, pas de tableaux avec des |. Tu n\'ajoutes aucun commentaire en dehors du contrat lui-même.',
                },
                { role: 'user', content: prompt },
            ], { temperature: 0.2, max_tokens: 6000 });
            // Groq compte le prompt + max_tokens contre la limite TPM du palier gratuit
            // (8000 tokens/minute pour ce modèle) — pas seulement ce qui est réellement
            // généré. 8192 dépassait systématiquement ce plafond dès que le prompt
            // dépassait ~0 token utile, faisant échouer TOUTE génération de contrat
            // (voir logs backend, "Request too large... Limit 8000, Requested 9040").
            // 6000 laisse ~2000 tokens de marge pour le prompt (largement suffisant : les
            // sections imposées + rappel de clauses standards font quelques centaines de
            // tokens) tout en restant assez généreux pour un contrat complet en Markdown.

            const content = this.unmaskText(rawContent, maskEntries);
            const suggestions = this.extractClauseSuggestions(content);

            logger.info(`Contract generated for template: ${templateType}`);
            return { content, suggestions };
        } catch (error) {
            logger.error('Error generating contract:', error);
            throw new AppError('Failed to generate contract', 500);
        }
    }

    // ─── Amélioration d'une clause ───────────────────────────────────────────────
    async improveClause(clause, context) {
        try {
            const text = await this._chat([
                {
                    role: 'system',
                    content: 'Tu es un expert juridique. Tu améliores des clauses contractuelles, en TEXTE BRUT (jamais de Markdown : pas de #, **, *, `, ni de tableaux avec des |). Tu réponds toujours avec le format :\nAMÉLIORATION: [la clause améliorée]\nEXPLICATION: [explication courte]',
                },
                {
                    role: 'user',
                    content: `Améliore ce texte juridique pour le rendre plus clair et précis, en conservant sa structure en articles et son format texte brut (aucun symbole Markdown).\n${context ? `Contexte: ${context}\n` : ''}Texte original:\n${clause}`,
                },
            ], { max_tokens: 2048 });

            const [improved, explanation] = this.parseImprovement(text);
            logger.info('Clause improved successfully');
            return { improved, explanation };
        } catch (error) {
            logger.error('Error improving clause:', error);
            throw new AppError('Failed to improve clause', 500);
        }
    }

    // ─── Suggestion de clauses ───────────────────────────────────────────────────
    async suggestClauses(contractType, specificNeeds) {
        try {
            const content = await this._chat([
                {
                    role: 'system',
                    content: 'Tu es un expert juridique. Tu fournis uniquement une liste de clauses, une par ligne, sans numérotation ni explication.',
                },
                {
                    role: 'user',
                    content: `Suggère 5 clauses juridiques importantes pour un contrat de type "${contractType}".\n${specificNeeds ? `Besoins spécifiques: ${specificNeeds.join(', ')}` : ''}`,
                },
            ], { max_tokens: 1024 });

            const clauses = content
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map(line => line.replace(/^[-*•\d\.]+\s*/, '').trim())
                .slice(0, 5);

            logger.info(`Suggested ${clauses.length} clauses for ${contractType}`);
            return clauses;
        } catch (error) {
            logger.error('Error suggesting clauses:', error);
            throw new AppError('Failed to suggest clauses', 500);
        }
    }

    // ─── Validation d'un contrat ─────────────────────────────────────────────────
    // partyAData/partyBData sont optionnels : quand l'appelant les fournit (le formulaire de
    // création les a déjà en mémoire au moment de l'appel), ils permettent de masquer les
    // mêmes champs personnels que generateContract. Dans tous les cas, un filet de sécurité
    // (maskFreeTextPii) masque en plus tout courriel ou numéro de téléphone détecté dans le
    // texte libre, même s'il ne vient d'aucun champ connu (contrat importé, retapé à la main).
    async validateContract(contractText, { partyAData, partyBData } = {}) {
        try {
            const maskEntries = [];
            if (partyAData) maskEntries.push(...this.maskPartyData(partyAData, 'PARTIE_A').entries);
            if (partyBData) maskEntries.push(...this.maskPartyData(partyBData, 'PARTIE_B').entries);

            const maskedFull = this.maskText(contractText, maskEntries);
            const { masked: maskedTruncated, entries: freeTextEntries } = this.maskFreeTextPii(maskedFull.substring(0, 9000));
            const allEntries = [...maskEntries, ...freeTextEntries];

            const text = await this._chat([
                {
                    role: 'system',
                    content: 'Tu es un expert juridique. Tu analyses des contrats et réponds toujours avec le format exact :\nPROBLÈMES:\n- [liste]\nSUGGESTIONS:\n- [liste]',
                },
                {
                    role: 'user',
                    // 9000 caractères (~2300 tokens) laissent largement la place à un contrat
                    // complet généré par cette même IA (un contrat réel généré fait ~6150
                    // caractères) tout en restant sous la limite TPM du palier Groq gratuit
                    // (8000 tokens/minute, prompt + max_tokens compris — voir generateContract).
                    // L'ancienne limite de 3000 tronquait silencieusement la moitié d'un
                    // contrat normal (résiliation, juridiction, clause de signature jamais
                    // vérifiées) alors que cette étape est présentée à l'utilisateur comme
                    // obligatoire et complète.
                    content: `Analyse ce contrat et identifie les problèmes de conformité et les suggestions d'amélioration :\n\n${maskedTruncated}`,
                },
            ], { max_tokens: 2048, temperature: 0 });

            const { issues, suggestions } = this.parseValidation(this.unmaskText(text, allEntries));
            logger.info('Contract validation completed');

            return {
                isValid: issues.length === 0,
                issues,
                suggestions,
            };
        } catch (error) {
            logger.error('Error validating contract:', error);
            throw new AppError('Failed to validate contract', 500);
        }
    }

    // ─── Résolution de ressort judiciaire ───────────────────────────────────────
    /**
     * Une ville saisie librement par l'utilisateur (ex: "Calavi") peut relever d'un
     * tribunal dont le siège est ailleurs (ex: Cotonou). Demande au LLM laquelle des villes
     * sièges connues couvre réellement la ville saisie. Best-effort : ne jette jamais,
     * renvoie coveringCity=null si le modèle n'est pas sûr — c'est à l'appelant de
     * présenter ça comme une suggestion, jamais comme une vérité imposée.
     */
    async resolveJurisdictionCity(cityInput, country, knownCities) {
        try {
            const text = await this._chat([
                {
                    role: 'system',
                    content: 'Tu es un expert en organisation judiciaire d\'Afrique de l\'Ouest. Réponds UNIQUEMENT avec un objet JSON strict, sans aucun texte autour, sans markdown : {"coveringCity": "<une ville EXACTEMENT recopiée depuis la liste fournie, ou null si aucune ne correspond ou si tu n\'es pas sûr>", "confidence": "high" | "medium" | "low"}',
                },
                {
                    role: 'user',
                    content: `Pays : ${country}\nVille saisie par l'utilisateur : ${cityInput}\nVilles sièges de juridiction connues dans ce pays : ${knownCities.join(', ')}\n\nQuelle ville de cette liste couvre le ressort judiciaire (tribunal de première instance ou de commerce) de la ville saisie ? Si la ville saisie est elle-même dans la liste, ou si aucune ville de la liste ne la couvre de façon fiable, réponds coveringCity: null.`,
                },
            ], { max_tokens: 128, temperature: 0 });

            const parsed = JSON.parse(text.replace(/```json|```/gi, '').trim());
            const coveringCity = knownCities.includes(parsed.coveringCity) ? parsed.coveringCity : null;
            const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low';

            return { coveringCity, confidence };
        } catch (error) {
            logger.error('Error resolving jurisdiction city:', error);
            return { coveringCity: null, confidence: 'low' };
        }
    }

    // ─── Analyse d'un document importé (PDF) ────────────────────────────────────
    /**
     * Best-effort, jamais bloquant : à partir du texte extrait d'un PDF importé, tente de
     * repérer les parties nommées (nom + email, seulement si l'email apparaît vraiment dans
     * le texte — jamais inventé), si le document ressemble à un contrat, et s'il semble déjà
     * signé. Chaque signal porte son propre niveau de confiance ; c'est à l'appelant de le
     * présenter comme une suggestion à confirmer, jamais comme un fait établi. N'importe
     * quelle échec (texte vide, PDF scanné sans couche de texte, erreur réseau) renvoie des
     * valeurs neutres plutôt que de faire échouer tout l'import.
     */
    async analyzeImportedContract(extractedText) {
        const empty = {
            parties: [],
            looksLikeContract: null,
            looksLikeContractConfidence: 'low',
            mentionsExistingSignature: false,
            signatureConfidence: 'low',
            signatureExcerpt: null,
            documentType: { knownType: null, suggestedLabel: null },
        };
        if (!extractedText || !extractedText.trim()) return empty;

        try {
            const text = await this._chat([
                {
                    role: 'system',
                    // The known-type vocabulary here (cdi/cdd/freelance/location/nda/commercial)
                    // must stay the exact same ids as TEMPLATE_SECTIONS above and
                    // CONTRACT_TEMPLATES on the frontend — one shared "document type" concept
                    // used whether it comes from an explicit template choice or, here, a guess
                    // from imported text, instead of two vocabularies that can drift apart.
                    content: 'Tu analyses le texte extrait d\'un document PDF importé sur une plateforme de contrats. Réponds UNIQUEMENT avec un objet JSON strict, sans texte autour, sans markdown, exactement dans cette forme : {"parties": [{"name": "<nom complet>", "email": "<email>", "type": "company"|"individual"|null, "rccm": "<numéro RCCM tel qu\'il apparaît dans le texte, ou chaîne vide>", "ifu": "<numéro IFU tel qu\'il apparaît dans le texte, ou chaîne vide>", "legalRepName": "<nom du représentant légal tel qu\'il apparaît, ou chaîne vide>", "legalRepTitle": "<qualité du représentant légal (ex. Gérant, Directeur Général), ou chaîne vide>", "dateOfBirthText": "<date de naissance telle qu\'elle apparaît littéralement dans le texte, ou chaîne vide>", "dateOfBirthIso": "<la même date normalisée au format AAAA-MM-JJ, ou chaîne vide si dateOfBirthText est vide>"}], "looksLikeContract": true|false, "looksLikeContractConfidence": "high"|"medium"|"low", "mentionsExistingSignature": true|false, "signatureConfidence": "high"|"medium"|"low", "signatureExcerpt": "<courte phrase du texte qui l\'indique, ou null>", "documentType": {"knownType": "cdi"|"cdd"|"freelance"|"location"|"nda"|"commercial"|null, "suggestedLabel": "<court libellé en français du type de document si aucune valeur connue ne correspond, ex. \'Bail commercial\', \'Reconnaissance de dette\', ou null si un knownType a été choisi>"}}. Règles strictes : n\'invente JAMAIS un email, un numéro RCCM/IFU, un nom/qualité de représentant légal ou une date de naissance qui n\'apparaît pas mot pour mot (ou chiffre pour chiffre) dans le texte fourni — si l\'information n\'est pas littéralement présente, laisse le champ correspondant vide (chaîne vide), ne devine jamais. "type" est une classification (pas une transcription) : mets "company" si la partie est clairement une société/entreprise (SARL, SA, SAS, mention RCCM/IFU, "la société"...), "individual" si c\'est clairement une personne physique (Monsieur/Madame, "né(e) le"...), null si ce n\'est pas déterminable. Les champs rccm/ifu/legalRepName/legalRepTitle ne concernent que les parties de type "company" ; dateOfBirthText/dateOfBirthIso ne concernent que les parties de type "individual" — laisse-les vides sinon. Limite la liste "parties" aux personnes ou entités clairement identifiées comme parties au contrat (pas les témoins, pas les tiers mentionnés en passant), au maximum 4. Pour documentType : choisis knownType UNIQUEMENT s\'il correspond vraiment (un CDI n\'est pas un CDD, une location n\'est pas un commercial) ; sinon knownType est null et suggestedLabel donne un libellé court (2-4 mots) et précis du type réel de document.',
                },
                {
                    role: 'user',
                    content: `Texte extrait du document (peut être tronqué ou partiellement illisible) :\n\n${extractedText.substring(0, 6000)}`,
                },
            ], { max_tokens: 1536, temperature: 0 });

            const parsed = JSON.parse(text.replace(/```json|```/gi, '').trim());
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
            // Same discipline as the email check just below: a value the model claims came
            // from the document is only trusted once its own literal source excerpt is
            // verified to actually occur in the extracted text — a hallucinated RCCM/IFU/
            // legal-rep name would otherwise misidentify a real company on a real contract.
            const verifiedText = (v) => typeof v === 'string' && v.trim() && extractedText.includes(v.trim()) ? v.trim() : '';
            const parties = Array.isArray(parsed.parties)
                ? parsed.parties
                    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
                    .slice(0, 4)
                    .map((p) => {
                        // Deuxième garde-fou côté serveur, au cas où le modèle n'aurait pas
                        // respecté la consigne : un email halluciné qui ne figure pas dans le
                        // texte source est pire qu'aucun email (invitation envoyée à la
                        // mauvaise personne) — mieux vaut le rejeter et laisser un champ vide
                        // que de le faire remonter.
                        const email = typeof p.email === 'string' && emailPattern.test(p.email.trim()) && extractedText.includes(p.email.trim())
                            ? p.email.trim()
                            : '';
                        const type = p.type === 'company' || p.type === 'individual' ? p.type : null;
                        const dateOfBirthText = verifiedText(p.dateOfBirthText);
                        const dateOfBirthIso = dateOfBirthText && typeof p.dateOfBirthIso === 'string' && isoDatePattern.test(p.dateOfBirthIso.trim())
                            ? p.dateOfBirthIso.trim()
                            : '';
                        return {
                            name: p.name.trim(),
                            email,
                            type,
                            rccm: verifiedText(p.rccm),
                            ifu: verifiedText(p.ifu),
                            legalRepName: verifiedText(p.legalRepName),
                            legalRepTitle: verifiedText(p.legalRepTitle),
                            dateOfBirth: dateOfBirthIso,
                        };
                    })
                : [];

            const confidenceOrDefault = (v) => ['high', 'medium', 'low'].includes(v) ? v : 'low';
            const KNOWN_TYPES = ['cdi', 'cdd', 'freelance', 'location', 'nda', 'commercial'];
            const rawKnownType = parsed.documentType?.knownType;
            const knownType = KNOWN_TYPES.includes(rawKnownType) ? rawKnownType : null;
            const suggestedLabel = !knownType && typeof parsed.documentType?.suggestedLabel === 'string' && parsed.documentType.suggestedLabel.trim()
                ? parsed.documentType.suggestedLabel.trim().slice(0, 60)
                : null;

            return {
                parties,
                looksLikeContract: typeof parsed.looksLikeContract === 'boolean' ? parsed.looksLikeContract : null,
                looksLikeContractConfidence: confidenceOrDefault(parsed.looksLikeContractConfidence),
                mentionsExistingSignature: parsed.mentionsExistingSignature === true,
                signatureConfidence: confidenceOrDefault(parsed.signatureConfidence),
                signatureExcerpt: typeof parsed.signatureExcerpt === 'string' && parsed.signatureExcerpt.trim() ? parsed.signatureExcerpt.trim().slice(0, 200) : null,
                documentType: { knownType, suggestedLabel },
            };
        } catch (error) {
            logger.error('Error analyzing imported contract:', error);
            return empty;
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    buildContractPrompt(templateType, partyAData, partyBData, additionalClauses, context) {
        const sections = TEMPLATE_SECTIONS[templateType] || TEMPLATE_SECTIONS.custom;
        const sectionsList = sections.map((s, i) => `${i + 1}. ${s}`).join('\n');

        return `${context || `Génère un contrat de type "${templateType}" professionnel et complet.`}

PARTIE A (${partyAData.type || 'Partie A'}) :
${JSON.stringify(partyAData, null, 2)}

PARTIE B (${partyBData.type || 'Partie B'}) :
${JSON.stringify(partyBData, null, 2)}

${additionalClauses && additionalClauses.length > 0 ? `CLAUSES ADDITIONNELLES REQUISES :\n${additionalClauses.join('\n')}` : ''}

Le contrat doit obligatoirement inclure les sections suivantes, bien séparées et titrées, dans cet ordre :
${sectionsList}

${STANDARD_CLAUSES_REMINDER}

Rédige un contrat complet, en TEXTE BRUT uniquement — aucun symbole Markdown (pas de #, pas de **, pas de listes avec *, pas de tableaux avec des |, pas de guillemets inversés \` autour des montants, dates ou articles). Respecte ces règles de mise en forme :
- La toute première ligne est le titre du contrat, en MAJUSCULES, seule sur sa ligne.
- Chaque article commence sur sa propre ligne par "Article N - Titre de l'article" (numérotation continue, sans autre symbole devant).
- Les paragraphes sont séparés par une ligne vide.
- Pour l'article final ("Signatures et date"), rédige uniquement une formule de clôture en texte (lieu, date, nombre d'exemplaires, mention que chaque partie signe électroniquement via la plateforme) — NE DESSINE JAMAIS de tableau, de grille ou de lignes de signature manuscrite : la signature elle-même est gérée séparément par la plateforme, pas dans ce texte.
- Pour identifier un particulier, n'utilise QUE les informations effectivement fournies ci-dessus (nom, adresse, email...). Si aucune date de naissance n'est fournie, ne l'invente jamais et ne laisse aucun espace réservé ou mention du type "né(e) le ___" — omets simplement cette précision.

Utilise un langage juridique précis et professionnel, en français courant compréhensible par un non-juriste.`;
    }

    extractClauseSuggestions(content) {
        return content
            .split('\n')
            .filter(line => line.includes('Article') || line.match(/^#{1,2}\s/))
            .map(line => line.replace(/^[#\s]+/, '').trim())
            .filter(Boolean)
            .slice(0, 5);
    }

    parseImprovement(result) {
        const improvedMatch = result.match(/AMÉLIORATION:([\s\S]*?)(?=EXPLICATION:|$)/i);
        const explanationMatch = result.match(/EXPLICATION:([\s\S]*?)$/i);
        const improved = improvedMatch ? improvedMatch[1].trim() : result;
        const explanation = explanationMatch ? explanationMatch[1].trim() : '';
        return [improved, explanation];
    }

    // Le modèle ne respecte pas toujours le format demandé à la lettre : il ajoute parfois un
    // espace avant le ":" ("PROBLÈMES :") ou entoure les titres de section et certaines lignes
    // d'emphase Markdown ("**PROBLÈMES :**"), que le système lui interdit pourtant. L'ancienne
    // regex, qui exigeait "PROBLÈMES:" au caractère près, ne matchait alors plus du tout : la
    // section entière disparaissait silencieusement, et validateContract renvoyait "aucun
    // problème" alors que le modèle en avait bel et bien listé — constaté en pratique en
    // retirant l'article "Rémunération" d'un contrat de test, correctement repéré par le
    // modèle mais jamais remonté par ce parsing (voir mémoire, chapitre 3). Nettoyer le
    // Markdown et tolérer l'espace avant les ":" avant de chercher les sections règle les deux
    // à la fois.
    parseValidation(result) {
        const issues = [];
        const suggestions = [];
        const cleaned = result.replace(/\*\*/g, '');
        const problemsSection = cleaned.match(/PROBLÈMES\s*:([\s\S]*?)(?=SUGGESTIONS\s*:|$)/i);
        const suggestionsSection = cleaned.match(/SUGGESTIONS\s*:([\s\S]*?)$/i);

        if (problemsSection) {
            issues.push(
                ...problemsSection[1]
                    .split('\n')
                    .map(line => line.replace(/^[-*•\d\.]+\s*/, '').trim())
                    .filter(line => line.length > 0)
            );
        }
        if (suggestionsSection) {
            suggestions.push(
                ...suggestionsSection[1]
                    .split('\n')
                    .map(line => line.replace(/^[-*•\d\.]+\s*/, '').trim())
                    .filter(line => line.length > 0)
            );
        }
        return { issues, suggestions };
    }
}

module.exports = new AIService();
