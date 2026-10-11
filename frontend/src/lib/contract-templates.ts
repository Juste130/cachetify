/**
 * Single source of truth for the contract types the AI generation flow supports.
 * Both the template gallery (templates-page.tsx) and the creation wizard
 * (create-contract-page.tsx) read from this list instead of keeping two
 * independently-hardcoded catalogs that can (and did) drift apart.
 *
 * `id` is also what gets sent to the backend as `templateType` — it must match
 * the keys of TEMPLATE_SECTIONS in backend/services/ai.js.
 */

export interface ClauseOption {
  key: "confidentiality" | "nonCompete" | "probation" | "allowTermination" | "allowDispute";
  label: string;
  helpText?: string;
  /** Human-readable instruction sent to the AI prompt when this option is checked — the
   *  backend used to receive the raw key ("allowDispute") verbatim, which the LLM had to
   *  guess the meaning of. */
  promptText: string;
}

export const CLAUSE_LIBRARY: Record<ClauseOption["key"], ClauseOption> = {
  confidentiality: {
    key: "confidentiality",
    label: "Clause de confidentialité",
    promptText: "Inclure une clause de confidentialité renforcée protégeant les informations échangées entre les parties.",
  },
  nonCompete: {
    key: "nonCompete",
    label: "Clause de non-concurrence",
    promptText: "Inclure une clause de non-concurrence, limitée dans le temps et dans l'espace, proportionnée à l'objet du contrat.",
  },
  probation: {
    key: "probation",
    label: "Période d'essai",
    promptText: "Inclure une période d'essai avec ses modalités et conditions de rupture anticipée.",
  },
  allowTermination: {
    key: "allowTermination",
    label: "Autoriser la résiliation",
    helpText: "Une des parties peut mettre fin au contrat sous certaines conditions.",
    promptText: "Prévoir une clause de résiliation permettant à l'une des parties de mettre fin au contrat sous certaines conditions.",
  },
  allowDispute: {
    key: "allowDispute",
    label: "Clause de règlement des litiges",
    helpText: "Précise comment un désaccord d'exécution entre les parties sera réglé.",
    promptText: "Prévoir une clause de règlement des litiges décrivant comment un désaccord d'exécution entre les parties sera réglé.",
  },
};

export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  /** Label for "Partie A" specific to this contract type (e.g. "Employeur" for a CDI). */
  partyALabel: string;
  /** Label for "Partie B" specific to this contract type (e.g. "Salarié" for a CDI). */
  partyBLabel: string;
  /** Which of the generic clause checkboxes make sense for this contract type. */
  clauseOptions: ClauseOption["key"][];
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: "cdi",
    name: "CDI",
    description: "Contrat de travail à durée indéterminée",
    partyALabel: "Employeur",
    partyBLabel: "Salarié",
    clauseOptions: ["confidentiality", "nonCompete", "probation", "allowTermination", "allowDispute"],
  },
  {
    id: "cdd",
    name: "CDD",
    description: "Contrat de travail à durée déterminée",
    partyALabel: "Employeur",
    partyBLabel: "Salarié",
    clauseOptions: ["confidentiality", "nonCompete", "probation", "allowDispute"],
  },
  {
    id: "freelance",
    name: "Freelance",
    description: "Contrat de prestation de services",
    partyALabel: "Client",
    partyBLabel: "Prestataire",
    clauseOptions: ["confidentiality", "nonCompete", "allowTermination", "allowDispute"],
  },
  {
    id: "location",
    name: "Location",
    description: "Bail de location immobilière",
    partyALabel: "Bailleur",
    partyBLabel: "Locataire",
    clauseOptions: ["allowTermination", "allowDispute"],
  },
  {
    id: "nda",
    name: "NDA",
    description: "Accord de confidentialité",
    partyALabel: "Partie divulgatrice",
    partyBLabel: "Partie réceptrice",
    clauseOptions: ["allowDispute"],
  },
  {
    id: "commercial",
    name: "Commercial",
    description: "Contrat commercial",
    partyALabel: "Partie A",
    partyBLabel: "Partie B",
    clauseOptions: ["confidentiality", "nonCompete", "allowTermination", "allowDispute"],
  },
  {
    id: "custom",
    name: "Personnalisé",
    description: "Créer un contrat sur mesure",
    partyALabel: "Partie A",
    partyBLabel: "Partie B",
    clauseOptions: ["confidentiality", "nonCompete", "probation", "allowTermination", "allowDispute"],
  },
];

export function getContractTemplate(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Legal basis for the probative value of an electronic signature, by country of execution.
 * Citing the wrong country's law undermines the very consent clause meant to give the
 * signature its legal value, so this must track the country selector exactly.
 */
export const E_SIGNATURE_LEGAL_BASIS: Record<string, string> = {
  "Bénin": "les articles 266 et 268 du Code du numérique (loi n° 2017-20)",
  "Togo": "la loi n° 2017-007 du 22 juin 2017 relative aux transactions électroniques (modifiée par la loi n° 2023-012 du 19 juillet 2023)",
  "Côte d'Ivoire": "la loi n° 2013-546 du 30 juillet 2013 relative aux transactions électroniques",
  "Sénégal": "la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques",
};

export const DEFAULT_E_SIGNATURE_LEGAL_BASIS = "la loi applicable au présent contrat";

/**
 * The exact legal-basis clause every consent checkbox on the platform must use — the
 * creation wizard (step 4) and the per-signer KYC modal used to word this differently even
 * though both are citing the same law for the same act. A `customLegalBasis` (free text
 * entered by the creator, see `create-contract-page.tsx`) is only ever used for a country
 * outside `E_SIGNATURE_LEGAL_BASIS` — a known country's mapped law always wins, so a typo in
 * the free-text field can never override a citation we already know is correct.
 */
export function signatureLegalBasisClause(country?: string, customLegalBasis?: string): string {
  const basis =
    (country && E_SIGNATURE_LEGAL_BASIS[country]) ||
    (customLegalBasis && customLegalBasis.trim()) ||
    DEFAULT_E_SIGNATURE_LEGAL_BASIS;
  return `ma signature électronique ayant valeur légale, au sens de ${basis}`;
}

/**
 * Principales villes sièges de juridiction (tribunal de première instance / tribunal de
 * commerce) par pays — c'est le tribunal du siège qui est réellement compétent sur un
 * ressort donné, pas nécessairement la ville d'exécution elle-même. Liste non exhaustive à
 * usage de sélection guidée : la ville de signature/exécution restait en texte libre alors
 * que le pays est un menu contrôlé, un risque de faute de frappe qui se répercute
 * directement dans la clause de juridiction compétente. "Autre" reste disponible en secours
 * pour toute ville hors de cette liste.
 */
export const JURISDICTION_CITIES: Record<string, string[]> = {
  "Bénin": ["Cotonou", "Porto-Novo", "Parakou", "Abomey", "Ouidah", "Lokossa", "Natitingou", "Kandi"],
  "Togo": ["Lomé", "Kara", "Sokodé", "Atakpamé", "Aného", "Tsévié", "Dapaong"],
  "Côte d'Ivoire": ["Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Daloa", "Korhogo", "Man", "Gagnoa", "Abengourou"],
  "Sénégal": ["Dakar", "Thiès", "Kaolack", "Saint-Louis", "Ziguinchor", "Diourbel", "Tambacounda"],
};
