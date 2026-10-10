"use client";

import { useState, useEffect, useRef } from "react";
import { FEATURES } from "@/lib/features";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AIInput } from "../ui/ai-input";
import { Label } from "../ui/label";
import { Card } from "../ui/card";
import { Textarea } from "../ui/textarea";
import { AiBadge } from "../ui/ai-badge";
import { aiApi } from "@/lib/api/ai";
import { ipfsApi } from "@/lib/api/ipfs";
import { useWeb3 } from "@/contexts/web3-context";
import { useContract } from "@/hooks/useContract";
import { contractsApi } from "@/lib/api/contracts";
import { deployDraftContract } from "@/lib/utils/deployContract";
import {
  FileText,
  Users,
  Home,
  FileSignature,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  Brain,
  Send,
  Eye,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Shield,
  CheckCircle2,
  Scale,
  Wallet,
  Info,
  Building,
  User,
  PenLine,
  Lock,
} from "lucide-react";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { ContractMarkdownRenderer } from "../contract/contract-markdown-renderer";
import { PdfDocumentViewer } from "../contract/pdf-document-viewer";
import {
  CONTRACT_TEMPLATES,
  CLAUSE_LIBRARY,
  getContractTemplate,
  signatureLegalBasisClause,
  JURISDICTION_CITIES,
} from "@/lib/contract-templates";
import { SIGNATORY_ROLE_LABELS } from "@/lib/contract-roles";
import { renderContractToHtml } from "@/lib/utils/renderContractHtml";
import { computeSHA256, computeFileSHA256 } from "@/lib/utils/hash";
import { toSafeFileName } from "@/lib/utils/fileName";
import { buildContractTitle } from "@/lib/utils/contractNaming";
import { useAuthStore } from "@/hooks/useAuth";
import { IdentityVerificationModal } from "@/components/kyc/identity-verification-modal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Signatory {
  name: string;
  email: string;
  role: number;          // 1 = CoSigner, 2 = Witness, 3 = LegalRepresentative
}

interface ValidationErrors {
  [key: string]: string;
}

function isValidEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * Deterministic (non-AI) séquestre clause appended verbatim to the generated contract text.
 * The LLM is not trusted to faithfully transcribe the amount/deadline/penalty — this
 * guarantees the signed, hashed document matches exactly what gets recorded in
 * ContractEscrow, instead of the two silently drifting apart.
 */
function buildEscrowClause(details: { escrowAmount: string; escrowDeadline: string; penaltyPercent: string }): string {
  const deadlineFormatted = details.escrowDeadline
    ? new Date(details.escrowDeadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "une date à convenir entre les parties";
  const penalty = Number(details.penaltyPercent) > 0 ? Number(details.penaltyPercent) : null;

  return `\n\n## Séquestre\n\nUn montant de ${details.escrowAmount} FCFA sera déposé en séquestre par le créateur du présent contrat, au plus tard le ${deadlineFormatted}. Ce montant sera libéré automatiquement à cette échéance, sauf si le créateur signale un problème avant cette date.${
    penalty ? ` En cas de retard dans l'exécution des obligations décrites au présent contrat, une pénalité de ${penalty}% sera appliquée sur le montant séquestré.` : ""
  }`;
}

const ROLE_LABELS = SIGNATORY_ROLE_LABELS;

const DRAFT_STORAGE_KEY = "cachetify:create-contract-draft";

// ─── Component ───────────────────────────────────────────────────────────────

// Purely cosmetic — the actual fields/prompt content per contract type live in
// @/lib/contract-templates and are shared with the template gallery.
const TEMPLATE_ICONS: Record<string, typeof FileText> = {
  cdi: Briefcase,
  cdd: Briefcase,
  freelance: Users,
  location: Home,
  nda: FileSignature,
  commercial: Briefcase,
  custom: FileText,
};

interface DraftSnapshot {
  selectedTemplate: string;
  formData: any;
  contractText: string;
  signatories: Signatory[];
  currentStep: number;
}

interface CreateContractPageProps {
  /** Contract type id preselected from the template gallery (/templates -> ?template=cdi). */
  template?: string;
}

export function CreateContractPage({ template }: CreateContractPageProps = {}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const { user } = useAuthStore();
  // Contextual, not a hard block — the creator can still toggle the requirement on even
  // while unverified themselves; this just makes sure they notice, immediately, with a
  // direct path to fix it (see the KYC design notes on why this beats a rigid lock).
  const [showCreatorKycWarning, setShowCreatorKycWarning] = useState(false);
  const [showCreatorVerifyModal, setShowCreatorVerifyModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [readyToDeployDraft, setReadyToDeployDraft] = useState<{ id: string; ipfsHash: string; metadata: any; signatories: any[] } | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [hasValidated, setHasValidated] = useState(false);
  const [acknowledgeIssues, setAcknowledgeIssues] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const complianceCardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiValidationResult, setAiValidationResult] = useState<{ issues: string[]; suggestions: string[] } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isCheckingJurisdiction, setIsCheckingJurisdiction] = useState(false);
  const [jurisdictionSuggestion, setJurisdictionSuggestion] = useState<{ coveringCity: string; confidence: string } | null>(null);
  const router = useRouter();
  const { isConnected, connect, account } = useWeb3();
  const { createContract } = useContract();

  // ─── Form State ─────────────────────────────────────────────────────────────

  const [formData, setFormData] = useState({
    partyA: { type: "company", name: "", email: "", address: "", phone: "", rccm: "", ifu: "", legalRepName: "", legalRepTitle: "", dateOfBirth: "" },
    partyB: { type: "individual", name: "", email: "", address: "", phone: "", rccm: "", ifu: "", legalRepName: "", legalRepTitle: "", dateOfBirth: "" },
    details: {
      duration: "",
      amount: "",
      paymentTerms: "",
      startDate: new Date().toISOString().split("T")[0],
      description: "",
      country: "Bénin",
      city: "Cotonou",
      customLegalBasis: "",
      escrowAmount: "",
      escrowDeadline: "",
      penaltyPercent: "",
    },
    options: {
      confidentiality: false,
      nonCompete: false,
      probation: false,
      allowTermination: true,
      allowDispute: true,
      // Off by default (see the KYC design notes) — a per-contract choice, never a
      // platform-wide default, so the low-friction case stays low-friction.
      requireVerifiedSigners: false,
    },
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState<{
    parties: {
      name: string;
      email: string;
      type: "company" | "individual" | null;
      rccm: string;
      ifu: string;
      legalRepName: string;
      legalRepTitle: string;
      dateOfBirth: string;
    }[];
    looksLikeContract: boolean | null;
    mentionsExistingSignature: boolean;
    signatureExcerpt: string | null;
    hasDigitalSignature: boolean;
    documentType: { knownType: string | null; suggestedLabel: string | null };
  } | null>(null);
  const [acknowledgeImportWarning, setAcknowledgeImportWarning] = useState(false);
  // Editable — the AI's classification is a starting suggestion, never applied silently. Used
  // as the "type" segment of the title/file names for an import, exactly like the fixed
  // "CDI"/"Freelance"/... label the AI-generation flow already gets from an explicit choice —
  // one shared concept, filled in differently depending on how the contract was created.
  const [importedTypeLabel, setImportedTypeLabel] = useState("");
  // Same "don't get stuck on the first import" concern as autoFilledParty below, applied to
  // this one field: cleared as soon as the user edits it by hand.
  const [typeLabelAutoFilled, setTypeLabelAutoFilled] = useState(false);
  // Tracks whether the current Partie A / Partie B fields hold values this component itself
  // filled in from an import analysis (true) versus values the user typed by hand (false).
  // Needed because "don't overwrite what the user entered" and "do refresh stale suggestions
  // from a previous import" are in tension: without this, re-importing a different file could
  // never update a party block that a first import had already filled in, since the fields
  // would no longer read as "empty" — see updateFormData below for where this gets cleared.
  const [autoFilledParty, setAutoFilledParty] = useState({ partyA: false, partyB: false });

  const [contractText, setContractText] = useState("");
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [newSignatory, setNewSignatory] = useState<Signatory>({
    name: "",
    email: "",
    role: 1,
  });

  // Preselect the template chosen from the gallery (/templates -> ?template=cdi), and
  // restore a locally-saved draft if the user left mid-way through a previous session.
  useEffect(() => {
    if (template && (template === "pdf_upload" || getContractTemplate(template))) {
      setSelectedTemplate(template);
      return; // A deliberate gallery choice takes priority over a stale local draft.
    }

    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const snapshot: DraftSnapshot = JSON.parse(raw);
      if (!snapshot.selectedTemplate) return;
      setSelectedTemplate(snapshot.selectedTemplate);
      setFormData((prev) => ({ ...prev, ...snapshot.formData }));
      setContractText(snapshot.contractText || "");
      setSignatories(snapshot.signatories || []);
      setCurrentStep(snapshot.currentStep || 1);
      setDraftRestored(true);
    } catch {
      // Corrupted or unreadable snapshot — ignore, start fresh.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // Best-effort autosave: losing a contract someone spent time filling in (and possibly
  // already paid an AI generation call for) just because a tab got closed is a bad time to
  // find out there was no draft persistence between steps.
  useEffect(() => {
    if (!selectedTemplate) return;
    const snapshot: DraftSnapshot = { selectedTemplate, formData, contractText, signatories, currentStep };
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // localStorage unavailable (private mode, quota) — autosave is a convenience, not critical.
    }
  }, [selectedTemplate, formData, contractText, signatories, currentStep]);

  function clearSavedDraft() {
    try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }

  // Après toute action qui échoue, ramène l'utilisateur vers l'erreur plutôt que
  // de la laisser hors champ (le message peut apparaître loin du bouton cliqué).
  // Cas particulier étape 3 : si le blocage vient de la conformité non vérifiée,
  // on cible directement la carte de vérification plutôt que le bandeau générique.
  // Le contenu de chaque étape recommence en haut de sa propre carte — sans ceci, le
  // scroll de la page précédente (ex. tout en bas de l'étape 1 après avoir choisi une
  // carte loin dans la liste) reste inchangé et fait atterrir l'utilisateur au milieu du
  // contenu de l'étape suivante au lieu de son début.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentStep]);

  useEffect(() => {
    if (!error) return;
    if (currentStep === 3 && !hasValidated && complianceCardRef.current) {
      complianceCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const activeTemplate = getContractTemplate(selectedTemplate);
  const jurisdictionCities = JURISDICTION_CITIES[formData.details.country] || [];
  const isKnownJurisdictionCity = jurisdictionCities.includes(formData.details.city);

  // ─── UI Templates ───────────────────────────────────────────────────────────

  const contractTemplatesUI = [
    { id: "pdf_upload", name: "Importer PDF", icon: FileSignature, description: "Uploader un contrat existant" },
    ...CONTRACT_TEMPLATES.filter((t) => t.id !== "custom").map((t) => ({
      id: t.id,
      name: t.name,
      icon: TEMPLATE_ICONS[t.id] ?? FileText,
      description: t.description,
    })),
    { id: "custom", name: "Personnalisé", icon: FileText, description: "Créer un contrat sur mesure" },
  ];

  const steps = [
    { number: 1, title: "Type de contrat" },
    { number: 2, title: "Informations" },
    { number: 3, title: "Aperçu & Édition" },
    { number: 4, title: "Signataires" },
  ];

  // ─── Validation ─────────────────────────────────────────────────────────────

  function validateStep2(): boolean {
    if (selectedTemplate === "pdf_upload") {
      if (!uploadedFile) {
        setError("Veuillez sélectionner un fichier PDF.");
        return false;
      }
      if (importWarningActive && !acknowledgeImportWarning) {
        setError("Veuillez confirmer avoir pris connaissance de l'avertissement ci-dessus avant de continuer.");
        return false;
      }
    }
    const errors: ValidationErrors = {};
    if (!formData.partyA.name.trim()) errors["partyA.name"] = "Le nom de la Partie A est requis.";
    if (!formData.partyA.email.trim()) errors["partyA.email"] = "L'email de la Partie A est requis.";
    if (formData.partyA.type === "company") {
      if (!formData.partyA.rccm?.trim()) errors["partyA.rccm"] = "Le RCCM est requis pour une entreprise.";
      if (!formData.partyA.legalRepName?.trim()) errors["partyA.legalRepName"] = "Le représentant légal est requis pour une entreprise.";
    }
    if (!formData.partyB.name.trim()) errors["partyB.name"] = "Le nom de la Partie B est requis.";
    if (!formData.partyB.email.trim()) errors["partyB.email"] = "L'email de la Partie B est requis.";
    if (formData.partyB.type === "company") {
      if (!formData.partyB.rccm?.trim()) errors["partyB.rccm"] = "Le RCCM est requis pour une entreprise.";
      if (!formData.partyB.legalRepName?.trim()) errors["partyB.legalRepName"] = "Le représentant légal est requis pour une entreprise.";
    }
    // Description/ville/séquestre n'existent pas sur le formulaire d'import (voir le rendu
    // du step 2 : cette section entière est masquée pour "pdf_upload") — les valider ici
    // bloquerait indéfiniment un import sur des champs que l'utilisateur n'a jamais vus.
    if (selectedTemplate !== "pdf_upload") {
      if (!formData.details.description.trim()) errors["details.description"] = "La description / objet du contrat est requis.";
      if (!formData.details.city.trim()) errors["details.city"] = "La ville de signature / exécution est requise.";
      if (Number(formData.details.escrowAmount) > 0 && !formData.details.escrowDeadline) {
        errors["details.escrowDeadline"] = "Une échéance est requise si un séquestre est demandé.";
      }
      // "Autre" has no mapped e-signature law (see E_SIGNATURE_LEGAL_BASIS) — without this,
      // every signatory's consent clause falls back to the vague "la loi applicable au
      // présent contrat", which names no actual text and weakens the clause it's meant to
      // support. Required here rather than left optional so it can never be signed unset.
      if (formData.details.country === "Autre" && !formData.details.customLegalBasis.trim()) {
        errors["details.customLegalBasis"] = "Précisez la loi applicable à la signature électronique pour ce pays.";
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateStep3(): boolean {
    if (selectedTemplate === "pdf_upload") return true;
    if (!contractText.trim()) {
      setError("Le contrat est vide. Générez ou saisissez du contenu avant de continuer.");
      return false;
    }
    if (!hasValidated) {
      setError("Veuillez lancer la vérification de conformité avant de continuer.");
      return false;
    }
    if (aiValidationResult && aiValidationResult.issues.length > 0 && !acknowledgeIssues) {
      setError("Des points de conformité ont été relevés : cochez la case ci-contre pour continuer malgré tout, ou corrigez le contrat.");
      return false;
    }
    return true;
  }

  function validateStep4(): boolean {
    const errors: ValidationErrors = {};
    if (signatories.length === 0) errors["signatories"] = "Ajoutez au moins un signataire.";
    if (!consentChecked) errors["consent"] = "Vous devez cocher la case de consentement pour continuer.";
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleGenerateWithAI = async () => {
    if (!validateStep2()) return;
    setError(null);
    setGenerationFailed(false);

    if (selectedTemplate === "pdf_upload") {
      // Mêmes règles que le flux IA : les parties nommées à l'étape précédente deviennent
      // automatiquement signataires (rôle Co-Signataire), pour garantir que les personnes
      // désignées dans le formulaire sont bien celles qui signeront réellement.
      setSignatories((prev) => {
        const next = [...prev];
        for (const p of [formData.partyA, formData.partyB]) {
          if (p.email && !next.some((s) => s.email === p.email)) {
            next.push({ name: p.name, email: p.email, role: 1 });
          }
        }
        return next;
      });
      setCurrentStep(4);
      return;
    }

    setIsGenerating(true);
    setCurrentStep(3);
    setHasValidated(false);
    setAcknowledgeIssues(false);
    setAiValidationResult(null);

    try {
      const readableClauses = Object.entries(formData.options)
        .filter(([key, val]) => val && (activeTemplate?.clauseOptions.includes(key as any) ?? true))
        .map(([key]) => CLAUSE_LIBRARY[key as keyof typeof CLAUSE_LIBRARY]?.promptText || key);

      const formatBirthDate = (isoDate: string) =>
        new Date(isoDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

      const partyALine = formData.partyA.type === 'company'
        ? `Société, RCCM: ${formData.partyA.rccm}, IFU: ${formData.partyA.ifu}, représentée par ${formData.partyA.legalRepName || 'un représentant légal'}${formData.partyA.legalRepTitle ? `, en qualité de ${formData.partyA.legalRepTitle}` : ''}`
        : `Particulier/Freelance${formData.partyA.dateOfBirth ? `, né(e) le ${formatBirthDate(formData.partyA.dateOfBirth)}` : ''}`;
      const partyBLine = formData.partyB.type === 'company'
        ? `Société, RCCM: ${formData.partyB.rccm}, IFU: ${formData.partyB.ifu}, représentée par ${formData.partyB.legalRepName || 'un représentant légal'}${formData.partyB.legalRepTitle ? `, en qualité de ${formData.partyB.legalRepTitle}` : ''}`
        : `Particulier/Freelance${formData.partyB.dateOfBirth ? `, né(e) le ${formatBirthDate(formData.partyB.dateOfBirth)}` : ''}`;

      const response = await aiApi.generateContract({
        templateType: selectedTemplate,
        partyAData: formData.partyA,
        partyBData: formData.partyB,
        additionalClauses: readableClauses,
        context: `Tu es un expert juridique. Rédige un contrat de type "${activeTemplate?.name || selectedTemplate}" professionnel, structuré et équilibré.
        Objet du contrat: ${formData.details.description}. Durée: ${formData.details.duration}. Rémunération: ${formData.details.amount}. Date: ${formData.details.startDate}.
        Lieu d'exécution: ${formData.details.city}, ${formData.details.country}.
        Partie A (${activeTemplate?.partyALabel || 'Partie A'}): ${partyALine}.
        Partie B (${activeTemplate?.partyBLabel || 'Partie B'}): ${partyBLine}.
        Important : Le contrat doit impérativement inclure une clause stipulant que le droit applicable est le droit du/de la ${formData.details.country} et que le tribunal compétent est celui de la ville de ${formData.details.city}.`
      });
      const escrowDeclared = Number(formData.details.escrowAmount) > 0;
      setContractText(escrowDeclared ? response.contract + buildEscrowClause(formData.details) : response.contract);

      // Pre-fill signatories from party emails — both named parties must sign, not just
      // the counterparty. Role 1 (Co-Signataire) for both: being Party A doesn't make
      // someone "the creator" (role 0) — that's decided server-side from the account
      // that actually submits the draft, not assumed from a form slot.
      const initial: Signatory[] = [];
      if (formData.partyA.email) {
        initial.push({ name: formData.partyA.name, email: formData.partyA.email, role: 1 });
      }
      if (formData.partyB.email) {
        initial.push({ name: formData.partyB.name, email: formData.partyB.email, role: 1 });
      }
      setSignatories(initial);
    } catch (err: any) {
      setError("Échec de la génération du contrat. Veuillez réessayer.");
      setGenerationFailed(true);
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSimplify = async () => {
    if (!contractText) return;
    setIsSimplifying(true);
    try {
      const response = await aiApi.improveClause({ clause: contractText, context: "Simplifier le langage juridique pour le rendre compréhensible par un non-juriste, sans en changer le sens légal." });
      setContractText(response.improved);
      setHasValidated(false); // Content changed — the previous compliance check no longer covers it.
    } catch {
      setError("Impossible de simplifier le contrat. Réessayez.");
    } finally {
      setIsSimplifying(false);
    }
  };

  const handleValidateCompliance = async () => {
    if (!contractText) return;
    setIsValidating(true);
    setAiValidationResult(null);
    setAcknowledgeIssues(false);
    try {
      const response = await aiApi.validateContract(contractText, {
        partyAData: formData.partyA,
        partyBData: formData.partyB,
      });
      setAiValidationResult({ issues: response.issues, suggestions: response.suggestions });
      setHasValidated(true);
    } catch {
      setError("Impossible de vérifier la conformité. Réessayez.");
    } finally {
      setIsValidating(false);
    }
  };

  // Best-effort: when the user types a city that isn't one of our known jurisdiction seats,
  // ask the AI which known seat actually covers it (e.g. a satellite town of a bigger city's
  // court). Never overwrites the typed value on its own — only surfaces a suggestion the
  // user can accept, since a wrong jurisdiction is a real legal consequence.
  const checkJurisdictionCoverage = async (city: string) => {
    if (!city.trim() || jurisdictionCities.length === 0) return;
    setIsCheckingJurisdiction(true);
    setJurisdictionSuggestion(null);
    try {
      const result = await aiApi.resolveJurisdictionCity({
        city,
        country: formData.details.country,
        knownCities: jurisdictionCities,
      });
      if (result.coveringCity && result.coveringCity.toLowerCase() !== city.trim().toLowerCase()) {
        setJurisdictionSuggestion({ coveringCity: result.coveringCity, confidence: result.confidence });
      }
    } catch {
      // Silent — the free-text city the user typed remains valid on its own; this is a
      // convenience suggestion, not a requirement.
    } finally {
      setIsCheckingJurisdiction(false);
    }
  };

  // Applies an import's best-effort suggestion for one party. Deliberately not routed through
  // updateFormData, which would immediately clear the autoFilledParty flag this function needs
  // to set — see autoFilledParty above for why the two paths must stay distinct.
  function applyImportedPartySuggestion(section: "partyA" | "partyB", fields: Partial<typeof formData.partyA>) {
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], ...fields } }));
    setAutoFilledParty((prev) => ({ ...prev, [section]: true }));
  }

  // Only the fields that make sense for the detected entity type travel together — a stray
  // "rccm" surviving on a party the AI itself classified as an individual (or vice versa)
  // would silently contradict the "Entreprise"/"Particulier" toggle this same suggestion sets.
  function buildSuggestedPartyFields(party: {
    name: string; email: string; type: "company" | "individual" | null;
    rccm: string; ifu: string; legalRepName: string; legalRepTitle: string; dateOfBirth: string;
  }): Partial<typeof formData.partyA> {
    const fields: Partial<typeof formData.partyA> = { name: party.name };
    if (party.email) fields.email = party.email;
    if (party.type) fields.type = party.type;
    if (party.type === "company") {
      if (party.rccm) fields.rccm = party.rccm;
      if (party.ifu) fields.ifu = party.ifu;
      if (party.legalRepName) fields.legalRepName = party.legalRepName;
      if (party.legalRepTitle) fields.legalRepTitle = party.legalRepTitle;
    } else if (party.type === "individual" && party.dateOfBirth) {
      fields.dateOfBirth = party.dateOfBirth;
    }
    return fields;
  }

  // Fires right when a PDF is selected, well before final submission — the goal is to have
  // suggestions ready by the time the user reaches the Partie A/B fields on this same step.
  // Best-effort only: a scanned PDF with no text layer, or any failure, just leaves
  // importAnalysis null and the form behaves exactly as it did before this feature existed.
  const handlePdfSelected = async (file: File | null) => {
    setUploadedFile(file);
    setImportAnalysis(null);
    setAcknowledgeImportWarning(false);
    if (!file) return;
    setIsAnalyzingPdf(true);
    try {
      const result = await aiApi.analyzeImportedPdf(file);
      setImportAnalysis(result);
      // Same rule as the template gallery: a known type's own display name ("CDI"), never
      // its raw id — falls back to the AI's free-text guess. Pre-fills when the field is
      // still empty, OR still holds a previous import's own suggestion (typeLabelAutoFilled)
      // — never when the user has typed something themselves in the meantime.
      if (!importedTypeLabel.trim() || typeLabelAutoFilled) {
        const known = result.documentType?.knownType
          ? getContractTemplate(result.documentType.knownType)?.name
          : null;
        const label = known || result.documentType?.suggestedLabel || "";
        if (label) {
          setImportedTypeLabel(label);
          setTypeLabelAutoFilled(true);
        }
      }
      // Pré-remplit Partie A / Partie B si l'utilisateur n'a rien saisi lui-même, ou si les
      // champs actuels viennent déjà d'un import précédent (autoFilledParty) — dans ce dernier
      // cas on rafraîchit avec la nouvelle détection plutôt que de rester bloqué sur la
      // première suggestion. Une valeur réellement tapée par l'utilisateur n'est, elle,
      // jamais écrasée (voir updateFormData, qui efface le flag dès qu'il tape).
      const [suggestedA, suggestedB] = result.parties;
      const partyAIsEmpty = !formData.partyA.name && !formData.partyA.email;
      if (suggestedA && (partyAIsEmpty || autoFilledParty.partyA)) {
        applyImportedPartySuggestion("partyA", buildSuggestedPartyFields(suggestedA));
      }
      const partyBIsEmpty = !formData.partyB.name && !formData.partyB.email;
      if (suggestedB && (partyBIsEmpty || autoFilledParty.partyB)) {
        applyImportedPartySuggestion("partyB", buildSuggestedPartyFields(suggestedB));
      }
    } catch {
      // Silencieux — l'import reste possible sans ces suggestions, en saisie manuelle.
    } finally {
      setIsAnalyzingPdf(false);
    }
  };

  const importWarningActive = !!importAnalysis && (
    importAnalysis.looksLikeContract === false ||
    importAnalysis.mentionsExistingSignature ||
    importAnalysis.hasDigitalSignature
  );

  const handleAddSignatory = () => {
    if (!newSignatory.email) {
      setValidationErrors((e) => ({ ...e, newSignatory: "L'email est requis pour notifier le signataire." }));
      return;
    }
    if (signatories.find((s) => s.email === newSignatory.email)) {
      setValidationErrors((e) => ({ ...e, newSignatory: "Cet email est déjà dans la liste." }));
      return;
    }
    setSignatories([...signatories, { ...newSignatory }]);
    setNewSignatory({ name: "", email: "", role: 1 });
    setValidationErrors((e) => { const { newSignatory: _, ...rest } = e; return rest; });
  };

  // Une partie nommée dans le texte du contrat (Partie A/B) doit rester signataire :
  // la retirer créerait un contrat dont un signataire nommé ne signe jamais.
  const isNamedContractParty = (email: string) =>
    (!!formData.partyA.email && email === formData.partyA.email) ||
    (!!formData.partyB.email && email === formData.partyB.email);

  const removeSignatory = (email: string) => {
    if (isNamedContractParty(email)) return;
    setSignatories(signatories.filter((s) => s.email !== email));
  };

  const handleFinalSubmit = async () => {
    if (!validateStep4()) return;
    if (selectedTemplate !== "pdf_upload" && !contractText.trim()) {
      setError("Le contrat est vide. Retournez à l'étape précédente pour le générer ou le rédiger avant de continuer.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // A bare template name ("CDI", "Freelance"...) is fine as a placeholder while nothing
      // is signed yet, but is meaningless once the contract is actually deployed and being
      // signed — indistinguishable from every other CDI a user has. Bake the parties' names
      // in from the start instead of trying to rename it later: one correct, descriptive
      // title used everywhere (dashboard, contracts list, PDF filename, IPFS document title)
      // from the moment of creation, rather than a generic one that would need patching up
      // the instant signing starts.
      const templateLabel = selectedTemplate === "pdf_upload"
        // Editable, pre-filled by the same AI analysis that already detects parties/signature
        // for an import — one shared "document type" concept with the AI-generation flow
        // below, just sourced from a classification instead of an explicit menu choice.
        ? (importedTypeLabel.trim() || "Contrat")
        : (contractTemplatesUI.find((t) => t.id === selectedTemplate)?.name || "Contrat");
      const partyAName = formData.partyA.name?.trim();
      const partyBName = formData.partyB.name?.trim();
      // Beyond Partie A/B, a signatory can be a witness, an additional co-signer, etc. — the
      // title accounts for them too (collapsing past a few names) instead of silently
      // dropping anyone who isn't one of the two named parties. buildContractTitle also
      // stamps the creation date, which — together with the platform-wide reference number
      // shown alongside the title everywhere it's displayed — is what actually guarantees no
      // two contracts ever look identical, even the same type/parties/day.
      const additionalPartyNames = signatories
        .filter((s) => s.email !== formData.partyA.email && s.email !== formData.partyB.email)
        .map((s) => s.name || s.email)
        .filter(Boolean);
      const contractTitle = buildContractTitle({
        documentType: templateLabel,
        partyNames: [partyAName, partyBName, ...additionalPartyNames],
        createdAt: new Date(),
      });

      let ipfsHash = "";
      let sha256Hash = "";
      let content = "";

      if (selectedTemplate === "pdf_upload" && uploadedFile) {
        // A real SHA-256 of the file's own bytes — computed before upload so it's
        // available even if the IPFS call were to fail — distinct from the IPFS CID
        // (`ipfsHash` below), which is a different kind of content identifier, not a raw
        // hex digest. Storing both means an imported contract gets the same kind of
        // independently-verifiable fingerprint as an AI-generated one.
        sha256Hash = await computeFileSHA256(uploadedFile);
        // Renamed to the actual contract title before upload — left as-is, the pinned file
        // (and the "Content-Disposition" download name the IPFS gateway derives from it)
        // would carry whatever arbitrary name the user's own local file happened to have
        // ("scan0012.pdf", "Document (3).pdf"...), never anything describing the contract.
        const namedFile = new File([uploadedFile], `${toSafeFileName(contractTitle)}.pdf`, {
          type: uploadedFile.type || "application/pdf",
        });
        const uploadResult = await ipfsApi.uploadDocument(namedFile);
        ipfsHash = uploadResult.cid;
        content = "CONTRAT_PDF_EXTERNE";
      } else {
        // AI Generated Contract
        // The SHA-256 fingerprint is (and must stay) the hash of the actual plain-text
        // content — it's what the KYC modal recomputes and compares against at signing time
        // (contract.metadata.content in Postgres, not whatever's rendered for IPFS below).
        sha256Hash = await computeSHA256(contractText);
        content = contractText;

        // Upload a self-contained, styled HTML rendering — not a JSON blob wrapping the
        // text (every field that used to bundle, parties/signatories/country/city, is
        // already saved right below in the draft's own `metadata`), and not raw plain text
        // either (opens as an unstyled monospace wall of text with no paragraph structure).
        // A .html file opens as an actual formatted document directly from the IPFS gateway
        // link, in any browser, with no dependency on this app.
        const html = renderContractToHtml(contractText, contractTitle);
        // toSafeFileName, not the raw title: contractTitle embeds "/" as the Partie A / Partie
        // B separator, which would otherwise land straight into the file name.
        const contractFile = new File([html], `${toSafeFileName(contractTitle)}.html`, { type: "text/html;charset=utf-8" });
        const ipfsResult = await ipfsApi.uploadDocument(contractFile);
        ipfsHash = ipfsResult.cid;
      }

      // Save draft in database
      const draftResult = await contractsApi.saveDraft({
        title: contractTitle,
        ipfsHash: ipfsHash,
        metadata: {
          content: content,
          sha256Hash,
          // Jamais renseigné auparavant : la colonne "Type" du panneau admin ("Tous les
          // contrats") affichait donc systématiquement "Standard" (son repli), quel que
          // soit le contrat — CDI, Freelance, import PDF, tout se ressemblait.
          type: templateLabel,
          isExternalPdf: selectedTemplate === "pdf_upload",
          parties: { partyA: formData.partyA, partyB: formData.partyB },
          country: formData.details.country,
          customLegalBasis: formData.details.country === "Autre" ? formData.details.customLegalBasis.trim() : null,
          city: formData.details.city,
          options: formData.options,
          escrow: {
            amount: formData.details.escrowAmount || "0",
            deadline: formData.details.escrowDeadline || null,
            penaltyPercent: formData.details.penaltyPercent || "0",
          },
          // Kept for audit trail only — never re-used to make a decision on the platform's
          // behalf, it was already surfaced to the user as a dismissible suggestion/warning
          // at import time.
          ...(selectedTemplate === "pdf_upload" && importAnalysis ? {
            importAnalysis: {
              looksLikeContract: importAnalysis.looksLikeContract,
              mentionsExistingSignature: importAnalysis.mentionsExistingSignature,
              hasDigitalSignature: importAnalysis.hasDigitalSignature,
              acknowledgedWarning: acknowledgeImportWarning,
            },
          } : {}),
        },
        signatories: signatories
      });

      clearSavedDraft();

      // Every signatory already had an account when the draft was saved — nothing is
      // blocking deployment anymore. Offer to deploy right here instead of silently
      // redirecting to the contract page and making the creator find and click that
      // button on a second visit.
      if ((draftResult.contract as any).status === "READY_TO_DEPLOY") {
        setReadyToDeployDraft(draftResult.contract as any);
      } else {
        router.push(`/contract-details?id=${draftResult.contract.id}&created=true`);
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de la sauvegarde du brouillon.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeployNow = async () => {
    if (!readyToDeployDraft || !isConnected) return;
    setIsDeploying(true);
    setError(null);
    try {
      const { contractId } = await deployDraftContract(readyToDeployDraft as any, createContract, contractsApi.markDraftDeployed, account);
      window.location.href = `/contract-details?id=${contractId}`;
    } catch (err: any) {
      setError("Erreur lors du déploiement : " + (err.message || "Erreur inconnue"));
      setIsDeploying(false);
    }
  };

  const updateFormData = (section: keyof typeof formData, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [section]:
        section === "options"
          ? { ...prev.options, [field]: value }
          : { ...(prev[section] as any), [field]: value },
    }));
    // The user just took ownership of this field by hand — an import's suggestion for this
    // party is no longer safe to silently overwrite on a later re-import (see
    // applyImportedPartySuggestion / autoFilledParty above).
    if (section === "partyA" || section === "partyB") {
      setAutoFilledParty((prev) => (prev[section] ? { ...prev, [section]: false } : prev));
    }
    // Clear validation error on change
    const key = `${section}.${field}`;
    if (validationErrors[key]) {
      setValidationErrors((e) => { const { [key]: _, ...rest } = e; return rest; });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width, 256px)" }}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2">Créer un nouveau contrat</h1>
          <p className="text-muted-foreground">Laissez notre IA vous guider pour créer un contrat professionnel sécurisé.</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 max-w-4xl mx-auto">
            {/* The "PDF importé" path never visits step 3 (Aperçu & Édition) — hide that node
                rather than showing a step that will never light up as active. */}
            {steps.filter((s) => !(selectedTemplate === "pdf_upload" && s.number === 3)).map((step, index, arr) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors font-bold ${
                      currentStep > step.number
                        ? "bg-green-500 text-white"
                        : currentStep === step.number
                        ? "bg-[#FFC107] text-[#212121]"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {currentStep > step.number ? <CheckCircle2 className="w-5 h-5" /> : step.number}
                  </div>
                  <p className={`text-xs mt-2 font-medium ${currentStep >= step.number ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.title}
                  </p>
                </div>
                {index < arr.length - 1 && (
                  <div className={`w-24 h-0.5 mx-2 mb-6 transition-colors ${currentStep > step.number ? "bg-green-500" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {draftRestored && (
          <div className="max-w-4xl mx-auto mb-6 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Un brouillon précédent a été restauré.</span>
            <button
              type="button"
              className="text-primary font-medium hover:underline shrink-0"
              onClick={() => { clearSavedDraft(); window.location.reload(); }}
            >
              Effacer et recommencer
            </button>
          </div>
        )}

        {error && (
          <div ref={errorRef} className="max-w-4xl mx-auto mb-6 p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Step Content — l'étape 3 (aperçu du document) a besoin de bien plus de largeur
            qu'un formulaire pour être lisible ; les autres étapes restent en max-w-4xl. */}
        <div className={currentStep === 3 ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}>

          {/* ── STEP 1: Template ── */}
          {currentStep === 1 && (
            <Card className="p-8">
              <div className="text-center mb-8">
                <h2 className="mb-2 font-bold text-2xl">Comment souhaitez-vous procéder ?</h2>
                <p className="text-muted-foreground">Importez un document existant ou utilisez notre IA juridique pour le rédiger.</p>
              </div>

              {/* PDF Upload Option */}
              <div className="mb-8">
                <h3 className="font-semibold text-lg mb-4 text-[#FFC107]">1. Importer un contrat existant</h3>
                <Card
                  className={`p-6 cursor-pointer transition-all hover:shadow-lg border-2 ${
                    selectedTemplate === "pdf_upload" ? "border-[#FFC107] bg-[#FFC107]/5" : "border-border hover:border-[#FFC107]/50"
                  }`}
                  onClick={() => { setSelectedTemplate("pdf_upload"); setCurrentStep(2); }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-xl shrink-0 ${selectedTemplate === "pdf_upload" ? "bg-[#FFC107]" : "bg-muted"}`}>
                      <FileSignature className={`w-8 h-8 ${selectedTemplate === "pdf_upload" ? "text-[#212121]" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-lg mb-1">J'ai déjà un contrat (PDF)</h4>
                      <p className="text-sm text-muted-foreground">Importez directement votre fichier PDF pour le signer et l'ancrer sur la blockchain.</p>
                    </div>
                    {selectedTemplate === "pdf_upload" && (
                      <CheckCircle2 className="w-6 h-6 text-[#FFC107]" />
                    )}
                  </div>
                </Card>
              </div>

              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-bold">OU</span>
                </div>
              </div>

              {/* AI Templates */}
              <div className="mb-8">
                <h3 className="font-semibold text-lg mb-4 text-[#9C27B0]">2. Créer avec notre IA Juridique</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contractTemplatesUI.filter(t => t.id !== "pdf_upload").map((template) => {
                    const Icon = template.icon;
                    return (
                      <Card
                        key={template.id}
                        className={`p-5 cursor-pointer transition-all hover:shadow-lg border-2 ${
                          selectedTemplate === template.id ? "border-[#9C27B0] bg-[#9C27B0]/5" : "border-transparent hover:border-[#9C27B0]/30 bg-muted/30"
                        }`}
                        onClick={() => { setSelectedTemplate(template.id); setCurrentStep(2); }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`p-2 rounded-lg ${selectedTemplate === template.id ? "bg-[#9C27B0]/20" : "bg-background"}`}>
                            <Icon className={`w-5 h-5 ${selectedTemplate === template.id ? "text-[#9C27B0]" : "text-muted-foreground"}`} />
                          </div>
                          {selectedTemplate === template.id ? (
                            <CheckCircle2 className="w-5 h-5 text-[#9C27B0]" />
                          ) : (
                            <AiBadge />
                          )}
                        </div>
                        <h4 className="font-semibold mb-1">{template.name}</h4>
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* ── STEP 2: Form ── */}
          {currentStep === 2 && (
            <Card className="p-8">
              {selectedTemplate === "pdf_upload" && (
                <div className="space-y-6 text-center mb-10">
                   <h2 className="text-2xl font-black tracking-tight">Importez votre contrat</h2>
                   <div
                     className="border-2 border-dashed border-[#9C27B0]/30 rounded-xl p-10 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                     onClick={() => fileInputRef.current?.click()}
                   >
                     <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                     <p className="text-sm font-medium mb-2">Cliquez ici pour sélectionner votre contrat PDF</p>
                     <p className="text-xs text-muted-foreground mb-4">Formats acceptés : .pdf (Max 10Mo)</p>
                     <Input
                       ref={fileInputRef}
                       type="file"
                       accept=".pdf"
                       className="hidden"
                       onChange={(e) => handlePdfSelected(e.target.files?.[0] || null)}
                     />
                   </div>
                   {uploadedFile && (
                     <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                       <CheckCircle2 className="w-5 h-5" />
                       <span className="font-semibold text-sm">{uploadedFile.name}</span>
                     </div>
                   )}
                   {/* Lets the user confirm "is this really the right file" before the final,
                       irreversible step — the document itself was otherwise never shown until
                       after the contract had already been anchored. Rendered the same way as an
                       AI-generated contract's own preview (paper sheets via pdf.js), not handed
                       to the browser's native PDF plugin — that plugin ships its own
                       download/print toolbar outside this app's control, which would let anyone
                       pull the raw file straight out of this "preview" step. */}
                   {uploadedFile && (
                     <div className="text-left">
                       <p className="text-xs font-semibold text-muted-foreground mb-2">Aperçu du fichier :</p>
                       <div className="rounded-xl overflow-hidden border border-gray-200">
                         <PdfDocumentViewer file={uploadedFile} className="max-h-[600px]" />
                       </div>
                     </div>
                   )}
                   {isAnalyzingPdf && (
                     <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                       <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyse du document en cours — recherche des parties, vérification qu'il s'agit bien d'un contrat non signé...
                     </p>
                   )}
                   {uploadedFile && (
                     <div className="max-w-sm mx-auto text-left">
                       <FieldGroup label="Type de document">
                         <Input
                           placeholder={isAnalyzingPdf ? "Détection en cours..." : "Ex. Bail commercial, CDI, Reconnaissance de dette..."}
                           value={importedTypeLabel}
                           onChange={(e) => { setImportedTypeLabel(e.target.value); setTypeLabelAutoFilled(false); }}
                         />
                       </FieldGroup>
                       <p className="text-[11px] text-muted-foreground mt-1">
                         {importAnalysis?.documentType?.knownType || importAnalysis?.documentType?.suggestedLabel
                           ? "Suggéré par l'analyse du document — corrigez si besoin. Utilisé dans le titre et le nom de fichier."
                           : "Laissez vide pour \"Contrat\" par défaut. Utilisé dans le titre et le nom de fichier."}
                       </p>
                     </div>
                   )}
                   {importAnalysis && !isAnalyzingPdf && (
                     <>
                       {importAnalysis.parties.length > 0 && (
                         <p className="text-xs text-[#4CAF50] flex items-center justify-center gap-1.5">
                           <CheckCircle2 className="w-3.5 h-3.5" /> {importAnalysis.parties.length} partie(s) détectée(s) et pré-remplie(s) ci-dessous — vérifiez et corrigez si besoin.
                         </p>
                       )}
                       {/* Two distinct signals, deliberately not merged: a digital signature is
                           found by scanning the PDF's own bytes for its /ByteRange signature
                           dictionary (reliable, part of the PDF spec) — a real, strong signal.
                           "Mentions/looks like" comes from an AI reading the extracted text
                           (best-effort, can be wrong either way) — a much softer signal. Giving
                           both the same amber treatment understated the first and overstated
                           the second. */}
                       {importAnalysis.hasDigitalSignature && (
                         <div className="text-left p-4 bg-destructive/5 border-2 border-destructive/30 rounded-xl flex items-start gap-3">
                           <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                           <div className="space-y-2">
                             <p className="text-xs text-foreground"><strong>Signature électronique détectée dans le fichier</strong> — ce document semble déjà signé numériquement (hors Cachetify). Cette détection est fiable : elle lit directement la structure du PDF, pas seulement son texte.</p>
                             <p className="text-xs text-muted-foreground">Si ce contrat est déjà conclu, Cachetify peut simplement l'ancrer comme preuve — faire re-signer les parties ici créerait une nouvelle date de signature, distincte de celle déjà indiquée sur le document.</p>
                           </div>
                         </div>
                       )}
                       {(importAnalysis.looksLikeContract === false || (importAnalysis.mentionsExistingSignature && !importAnalysis.hasDigitalSignature)) && (
                         <div className="text-left p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-3">
                           <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                           <div className="space-y-2">
                             <p className="text-[10px] uppercase tracking-wide font-bold text-amber-600">Suggestion IA — à vérifier vous-même</p>
                             {importAnalysis.looksLikeContract === false && (
                               <p className="text-xs text-muted-foreground">Ce document ne ressemble pas à un contrat classique d'après une lecture automatique — vous pouvez continuer si c'est normal pour votre cas.</p>
                             )}
                             {importAnalysis.mentionsExistingSignature && !importAnalysis.hasDigitalSignature && (
                               <p className="text-xs text-muted-foreground">Le texte du document semble indiquer qu'il a déjà été signé{importAnalysis.signatureExcerpt ? ` (« ${importAnalysis.signatureExcerpt} »)` : ""} — à vérifier vous-même, cette lecture automatique du texte peut se tromper.</p>
                             )}
                           </div>
                         </div>
                       )}
                       {importWarningActive && (
                         <label className="flex items-center gap-2 cursor-pointer pt-1 justify-center">
                           <Checkbox checked={acknowledgeImportWarning} onCheckedChange={(v) => setAcknowledgeImportWarning(!!v)} />
                           <span className="text-xs font-medium">J'ai pris connaissance de ce point et je souhaite continuer.</span>
                         </label>
                       )}
                     </>
                   )}
                </div>
              )}

              <div className="space-y-8 text-left">
                {selectedTemplate === "pdf_upload" ? (
                  <h3 className="text-xl font-bold border-b pb-2">Informations des signataires</h3>
                ) : (
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-black tracking-tight">Informations du contrat</h2>
                  </div>
                )}
                {/* Partie A */}
                <Card className="p-6 bg-muted/30 border-0 shadow-none mb-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#FFC107] text-[#212121] flex items-center justify-center text-sm font-black">A</div>
                        Partie A{activeTemplate ? ` (${activeTemplate.partyALabel})` : ""}
                      </h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FieldGroup label="Type d'entité" className="md:col-span-2">
                        <div className="flex bg-muted/50 p-1 rounded-xl w-full max-w-md border">
                          <button
                            type="button"
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${formData.partyA.type === 'company' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => updateFormData("partyA", "type", "company")}
                          >
                            <Building className="w-4 h-4" /> Entreprise
                          </button>
                          <button
                            type="button"
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${formData.partyA.type === 'individual' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => updateFormData("partyA", "type", "individual")}
                          >
                            <User className="w-4 h-4" /> Particulier
                          </button>
                        </div>
                      </FieldGroup>
                      
                      <FieldGroup label={formData.partyA.type === 'company' ? "Nom de l'entreprise *" : "Nom complet *"} error={validationErrors["partyA.name"]}>
                        <Input
                          placeholder={formData.partyA.type === 'company' ? "Ma Société SAS" : "Jean Dupont"}
                          className="bg-background"
                          value={formData.partyA.name}
                          onChange={(e) => updateFormData("partyA", "name", e.target.value)}
                        />
                      </FieldGroup>
                      
                      <FieldGroup label="Email *" error={validationErrors["partyA.email"]}>
                        <Input
                          type="email"
                          placeholder="jean@exemple.com"
                          className="bg-background"
                          value={formData.partyA.email}
                          onChange={(e) => updateFormData("partyA", "email", e.target.value)}
                        />
                      </FieldGroup>

                      {formData.partyA.type === "company" && (
                        <>
                          <FieldGroup label="Numéro RCCM *" error={validationErrors["partyA.rccm"]}>
                            <Input
                              placeholder="RB/COT/23 B 12345"
                              className="bg-background"
                              value={formData.partyA.rccm || ""}
                              onChange={(e) => updateFormData("partyA", "rccm", e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Obligatoire pour les entreprises commerciales.</p>
                          </FieldGroup>
                          <FieldGroup label="Numéro IFU">
                            <Input
                              placeholder="3202312345678"
                              className="bg-background"
                              value={formData.partyA.ifu || ""}
                              onChange={(e) => updateFormData("partyA", "ifu", e.target.value)}
                            />
                          </FieldGroup>
                          <FieldGroup label="Représentant légal (nom) *" error={validationErrors["partyA.legalRepName"]}>
                            <Input
                              placeholder="Jean Dupont"
                              className="bg-background"
                              value={formData.partyA.legalRepName || ""}
                              onChange={(e) => updateFormData("partyA", "legalRepName", e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Personne physique habilitée à engager la société.</p>
                          </FieldGroup>
                          <FieldGroup label="Qualité du représentant">
                            <Input
                              placeholder="Gérant, Directeur Général..."
                              className="bg-background"
                              value={formData.partyA.legalRepTitle || ""}
                              onChange={(e) => updateFormData("partyA", "legalRepTitle", e.target.value)}
                            />
                          </FieldGroup>
                        </>
                      )}

                      {formData.partyA.type === "individual" && (
                        <FieldGroup label="Date de naissance (optionnel)">
                          <Input
                            type="date"
                            className="bg-background"
                            value={formData.partyA.dateOfBirth || ""}
                            onChange={(e) => updateFormData("partyA", "dateOfBirth", e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Non obligatoire, mais renforce l'identification de la partie dans le contrat.</p>
                        </FieldGroup>
                      )}

                      <FieldGroup label="Adresse postale" className="md:col-span-2">
                        <Input
                          placeholder="123 Rue de la Paix, Cotonou, Bénin"
                          className="bg-background"
                          value={formData.partyA.address}
                          onChange={(e) => updateFormData("partyA", "address", e.target.value)}
                        />
                      </FieldGroup>

                      <FieldGroup label="Téléphone">
                        <Input
                          placeholder="+229 90 00 00 00"
                          className="bg-background"
                          value={formData.partyA.phone}
                          onChange={(e) => updateFormData("partyA", "phone", e.target.value)}
                        />
                      </FieldGroup>
                    </div>
                  </div>
                </Card>

                {/* Partie B */}
                <Card className="p-6 bg-muted/30 border-0 shadow-none mb-6">
                  <div className="space-y-6">
                    <h3 className="font-bold text-lg flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#4CAF50] text-white flex items-center justify-center text-sm font-black">B</div>
                      Partie B{activeTemplate ? ` (${activeTemplate.partyBLabel})` : ""}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FieldGroup label="Type d'entité" className="md:col-span-2">
                        <div className="flex bg-muted/50 p-1 rounded-xl w-full max-w-md border">
                          <button
                            type="button"
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${formData.partyB.type === 'company' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => updateFormData("partyB", "type", "company")}
                          >
                            <Building className="w-4 h-4" /> Entreprise
                          </button>
                          <button
                            type="button"
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${formData.partyB.type === 'individual' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => updateFormData("partyB", "type", "individual")}
                          >
                            <User className="w-4 h-4" /> Particulier
                          </button>
                        </div>
                      </FieldGroup>
                      
                      <FieldGroup label={formData.partyB.type === 'company' ? "Nom de l'entreprise *" : "Nom complet *"} error={validationErrors["partyB.name"]}>
                        <Input
                          placeholder={formData.partyB.type === 'company' ? "Consulting SARL" : "Sophie Martin"}
                          className="bg-background"
                          value={formData.partyB.name}
                          onChange={(e) => updateFormData("partyB", "name", e.target.value)}
                        />
                      </FieldGroup>
                      
                      <FieldGroup label="Email *" error={validationErrors["partyB.email"]}>
                        <Input
                          type="email"
                          placeholder="sophie@exemple.com"
                          className="bg-background"
                          value={formData.partyB.email}
                          onChange={(e) => updateFormData("partyB", "email", e.target.value)}
                        />
                      </FieldGroup>

                      {formData.partyB.type === "company" && (
                        <>
                          <FieldGroup label="Numéro RCCM *" error={validationErrors["partyB.rccm"]}>
                            <Input
                              placeholder="RB/COT/23 B 12345"
                              className="bg-background"
                              value={formData.partyB.rccm || ""}
                              onChange={(e) => updateFormData("partyB", "rccm", e.target.value)}
                            />
                          </FieldGroup>
                          <FieldGroup label="Numéro IFU">
                            <Input
                              placeholder="3202312345678"
                              className="bg-background"
                              value={formData.partyB.ifu || ""}
                              onChange={(e) => updateFormData("partyB", "ifu", e.target.value)}
                            />
                          </FieldGroup>
                          <FieldGroup label="Représentant légal (nom) *" error={validationErrors["partyB.legalRepName"]}>
                            <Input
                              placeholder="Sophie Martin"
                              className="bg-background"
                              value={formData.partyB.legalRepName || ""}
                              onChange={(e) => updateFormData("partyB", "legalRepName", e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">Personne physique habilitée à engager la société.</p>
                          </FieldGroup>
                          <FieldGroup label="Qualité du représentant">
                            <Input
                              placeholder="Gérante, Directrice Générale..."
                              className="bg-background"
                              value={formData.partyB.legalRepTitle || ""}
                              onChange={(e) => updateFormData("partyB", "legalRepTitle", e.target.value)}
                            />
                          </FieldGroup>
                        </>
                      )}

                      {formData.partyB.type === "individual" && (
                        <FieldGroup label="Date de naissance (optionnel)">
                          <Input
                            type="date"
                            className="bg-background"
                            value={formData.partyB.dateOfBirth || ""}
                            onChange={(e) => updateFormData("partyB", "dateOfBirth", e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Non obligatoire, mais renforce l'identification de la partie dans le contrat.</p>
                        </FieldGroup>
                      )}
                    </div>
                  </div>
                </Card>

                {selectedTemplate !== "pdf_upload" && (
                  <>
                    {/* Détails */}
                    <Card className="p-6 bg-muted/30 border-0 shadow-none mb-6">
                  <div className="space-y-6">
                    <h3 className="font-bold text-lg flex items-center gap-3">
                      <FileText className="w-6 h-6 text-[#9C27B0]" />
                      Détails du contrat
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FieldGroup label="Description / Objet *" error={validationErrors["details.description"]} className="md:col-span-2">
                        <Textarea 
                          placeholder="Ex: Prestation de développement Fullstack pour une durée de 3 mois, incluant la création d'une API et d'un panel admin."
                          className="bg-background min-h-[100px] resize-y"
                          value={formData.details.description}
                          onChange={(e) => updateFormData("details", "description", e.target.value)}
                        />
                      </FieldGroup>

                      <FieldGroup label="Durée">
                        <Input placeholder="Ex: 12 mois, Indéterminée..." className="bg-background"
                          value={formData.details.duration}
                          onChange={(e) => updateFormData("details", "duration", e.target.value)} />
                      </FieldGroup>
                      
                      <FieldGroup label="Montant total ou Rémunération">
                        <Input placeholder="Ex: 500 000 FCFA / mois" className="bg-background"
                          value={formData.details.amount}
                          onChange={(e) => updateFormData("details", "amount", e.target.value)} />
                      </FieldGroup>
                      
                      <FieldGroup label="Date de début">
                        <Input type="date" className="bg-background"
                          value={formData.details.startDate}
                          onChange={(e) => updateFormData("details", "startDate", e.target.value)} />
                      </FieldGroup>
                      
                      <FieldGroup label="Pays d'exécution">
                        <Select value={formData.details.country} onValueChange={(val) => {
                          // Reset the city to the new country's first known jurisdiction seat
                          // rather than leaving the old one in place — an unrecognized city
                          // falls into "Autre (préciser)", which reads as "you must type it
                          // yourself" even when the user's actual choice is right there in
                          // the list for the new country.
                          const nextCities = JURISDICTION_CITIES[val] || [];
                          updateFormData("details", "country", val);
                          updateFormData("details", "city", nextCities[0] || "");
                          setJurisdictionSuggestion(null);
                        }}>
                          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Bénin">Bénin</SelectItem>
                            <SelectItem value="Togo">Togo</SelectItem>
                            <SelectItem value="Côte d'Ivoire">Côte d'Ivoire</SelectItem>
                            <SelectItem value="Sénégal">Sénégal</SelectItem>
                            <SelectItem value="Autre">Autre (Préciser en description)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldGroup>

                      {formData.details.country === "Autre" && (
                        <FieldGroup label="Loi applicable à la signature électronique *" error={validationErrors["details.customLegalBasis"]} className="md:col-span-2">
                          <Input
                            placeholder="Ex : la loi n° XXXX-XX du [date] relative aux transactions électroniques de [pays]"
                            className="bg-background"
                            value={formData.details.customLegalBasis}
                            onChange={(e) => updateFormData("details", "customLegalBasis", e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground mt-1">Ce pays n'a pas de base légale pré-renseignée sur la plateforme — le texte cité ici sera celui repris dans la clause de consentement de chaque signataire.</p>
                        </FieldGroup>
                      )}

                      <FieldGroup label="Ville de signature / exécution *" error={validationErrors["details.city"]}>
                        {jurisdictionCities.length > 0 ? (
                          <>
                            <Select
                              value={isKnownJurisdictionCity ? formData.details.city : "__autre__"}
                              onValueChange={(val) => {
                                updateFormData("details", "city", val === "__autre__" ? "" : val);
                                setJurisdictionSuggestion(null);
                              }}
                            >
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Sélectionnez une ville" /></SelectTrigger>
                              <SelectContent>
                                {jurisdictionCities.map((city) => (
                                  <SelectItem key={city} value={city}>{city}</SelectItem>
                                ))}
                                <SelectItem value="__autre__">Autre (préciser)</SelectItem>
                              </SelectContent>
                            </Select>
                            {!isKnownJurisdictionCity && (
                              <>
                                <Input className="bg-background mt-2" placeholder="Ex: Calavi"
                                  value={formData.details.city}
                                  onChange={(e) => { updateFormData("details", "city", e.target.value); setJurisdictionSuggestion(null); }}
                                  onBlur={(e) => checkJurisdictionCoverage(e.target.value)} />
                                {isCheckingJurisdiction && (
                                  <p className="text-[11px] text-muted-foreground mt-1">Vérification de la juridiction compétente...</p>
                                )}
                                {jurisdictionSuggestion && (
                                  <div className="mt-2 p-3 rounded-lg border border-[#2196F3]/30 bg-[#2196F3]/5 flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-[11px] text-muted-foreground">
                                      {formData.details.city} est {jurisdictionSuggestion.confidence === "high" ? "" : "probablement "}
                                      couvert(e) par le tribunal de <strong>{jurisdictionSuggestion.coveringCity}</strong> — suggestion IA, à vérifier.
                                    </p>
                                    <Button type="button" size="sm" variant="outline" className="shrink-0"
                                      onClick={() => { updateFormData("details", "city", jurisdictionSuggestion.coveringCity); setJurisdictionSuggestion(null); }}>
                                      Utiliser {jurisdictionSuggestion.coveringCity}
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">Ville où siège le tribunal compétent pour ce contrat.</p>
                          </>
                        ) : (
                          <Input className="bg-background" placeholder="Ex: Cotonou"
                            value={formData.details.city}
                            onChange={(e) => updateFormData("details", "city", e.target.value)} />
                        )}
                      </FieldGroup>
                    </div>
                  </div>
                </Card>

                {/* Séquestre (escrow) — argent réel, pas de blockchain. Hors périmètre du
                    mémoire (voir frontend/src/lib/features.ts) : masqué tant que
                    FEATURES.escrow est faux, mais les champs/état sous-jacents restent en
                    place (escrowDeclared reste alors naturellement faux, aucune clause n'est
                    ajoutée au contrat — voir plus haut). */}
                {FEATURES.escrow && (
                  <Card className="p-6 bg-muted/30 border-0 shadow-none mb-6">
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg flex items-center gap-3 flex-wrap">
                        <Shield className="w-6 h-6 text-[#FFC107]" />
                        Séquestre — optionnel
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground">Dépôt réel à venir</span>
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">Le paiement en ligne n'est pas encore activé sur la plateforme.</strong> Vous pouvez déclarer ces conditions dès maintenant — elles seront enregistrées avec le contrat — mais aucun argent ne sera réellement prélevé tant que cette fonctionnalité n'est pas disponible. Une fois activé : ce montant en FCFA sera à déposer par vous (le créateur) via paiement en ligne (carte ou mobile money, aucun wallet crypto requis), puis libéré automatiquement à l'échéance (les deux parties prévenues 72h, 48h et 24h avant), sauf si vous signalez un problème avant cette date. Laissez à 0 si ce contrat n'a pas besoin de séquestre.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <FieldGroup label="Montant du séquestre (FCFA)" error={validationErrors["details.escrowAmount"]}>
                          <Input type="number" min="0" step="1" placeholder="0" className="bg-background"
                            value={formData.details.escrowAmount}
                            onChange={(e) => updateFormData("details", "escrowAmount", e.target.value)} />
                        </FieldGroup>
                        <FieldGroup label="Échéance du séquestre" error={validationErrors["details.escrowDeadline"]}>
                          <Input type="date" className="bg-background"
                            value={formData.details.escrowDeadline}
                            onChange={(e) => updateFormData("details", "escrowDeadline", e.target.value)} />
                          <p className="text-[11px] text-muted-foreground mt-1">Date à laquelle la prestation doit être terminée — déclenche la fenêtre de validation avant libération.</p>
                        </FieldGroup>
                        <FieldGroup label="Pénalité de retard (%)">
                          <Input type="number" min="0" max="100" placeholder="0" className="bg-background"
                            value={formData.details.penaltyPercent}
                            onChange={(e) => updateFormData("details", "penaltyPercent", e.target.value)} />
                        </FieldGroup>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Options */}
                <Card className="p-6 bg-muted/30 border-0 shadow-none">
                  <div className="space-y-6">
                    <h3 className="font-bold text-lg">Options additionnelles</h3>
                    <p className="text-xs text-muted-foreground -mt-4">Options pertinentes pour un contrat de type {activeTemplate?.name || selectedTemplate}.</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(activeTemplate?.clauseOptions || []).filter((key) => key !== "allowTermination" && key !== "allowDispute").map((key) => {
                        const clause = CLAUSE_LIBRARY[key];
                        return (
                          <div key={key}
                            className="flex items-center gap-3 p-4 border rounded-xl bg-background cursor-pointer hover:border-[#9C27B0]/50 transition-colors"
                            onClick={() => updateFormData("options", key, !(formData.options as any)[key])}>
                            <Checkbox id={key} checked={(formData.options as any)[key]}
                              onCheckedChange={(val) => updateFormData("options", key, val)} />
                            <Label htmlFor={key} className="cursor-pointer text-sm font-medium">{clause.label}</Label>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      {activeTemplate?.clauseOptions.includes("allowTermination") && (
                        <div className="flex items-start gap-3 p-4 border rounded-xl bg-background cursor-pointer hover:border-[#9C27B0]/50 transition-colors"
                          onClick={() => updateFormData("options", "allowTermination", !formData.options.allowTermination)}>
                          <Checkbox id="termination" checked={formData.options.allowTermination} className="mt-1"
                            onCheckedChange={(val) => updateFormData("options", "allowTermination", val)} />
                          <div>
                            <Label htmlFor="termination" className="cursor-pointer text-sm font-bold block mb-1">{CLAUSE_LIBRARY.allowTermination.label}</Label>
                            <p className="text-xs text-muted-foreground leading-relaxed">{CLAUSE_LIBRARY.allowTermination.helpText}</p>
                          </div>
                        </div>
                      )}

                      {activeTemplate?.clauseOptions.includes("allowDispute") && (
                        <div className="flex items-start gap-3 p-4 border rounded-xl bg-background cursor-pointer hover:border-[#9C27B0]/50 transition-colors"
                          onClick={() => updateFormData("options", "allowDispute", !formData.options.allowDispute)}>
                          <Checkbox id="dispute" checked={formData.options.allowDispute} className="mt-1"
                            onCheckedChange={(val) => updateFormData("options", "allowDispute", val)} />
                          <div>
                            <Label htmlFor="dispute" className="cursor-pointer text-sm font-bold block mb-1">{CLAUSE_LIBRARY.allowDispute.label}</Label>
                            <p className="text-xs text-muted-foreground leading-relaxed">{CLAUSE_LIBRARY.allowDispute.helpText}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  </Card>
                  </>
                )}
              </div>

              <div className="flex justify-between mt-10">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="px-8">
                  <ChevronLeft className="w-5 h-5 mr-2" />
                  Retour
                </Button>
                <Button className="bg-[#9C27B0] text-white hover:bg-[#7B1FA2] px-8 font-bold" onClick={handleGenerateWithAI}>
                  {selectedTemplate === "pdf_upload" ? (
                    <>Suivant <ChevronRight className="w-5 h-5 ml-2" /></>
                  ) : (
                    <><Brain className="w-5 h-5 mr-2" /> Générer le contrat</>
                  )}
                </Button>
              </div>
              
            </Card>
          )}

          {/* ── STEP 3: Preview & Edit ── */}
          {currentStep === 3 && (
            <div className="min-h-[400px]">
              {isGenerating ? (
                <Card className="p-16 text-center">
                  <div className="relative w-24 h-24 mx-auto mb-8">
                    <Brain className="w-24 h-24 text-[#9C27B0] animate-pulse" />
                    <div className="absolute inset-0 bg-[#9C27B0]/20 rounded-full animate-ping" />
                  </div>
                  <h2 className="mb-4 font-bold text-2xl text-[#9C27B0]">Génération du contrat...</h2>
                  <p className="text-muted-foreground mb-8 text-lg">Remplissage du modèle avec vos informations.</p>
                  <div className="max-w-md mx-auto">
                    <div className="h-3 bg-muted rounded-full overflow-hidden border">
                      <div className="h-full bg-gradient-to-r from-[#9C27B0] to-[#E91E63] animate-[loading_2s_infinite]" />
                    </div>
                  </div>
                </Card>
              ) : generationFailed && !contractText ? (
                <Card className="p-16 text-center border-destructive/30 bg-destructive/5">
                  <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
                  <h2 className="mb-2 font-bold text-xl">La génération du contrat a échoué</h2>
                  <p className="text-muted-foreground mb-6">Vous pouvez réessayer immédiatement, sans revenir à l'étape précédente.</p>
                  <Button className="bg-[#9C27B0] text-white hover:bg-[#7B1FA2]" onClick={handleGenerateWithAI}>
                    <Brain className="w-4 h-4 mr-2" /> Réessayer la génération
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Preview */}
                  <Card className="lg:col-span-2 p-8 shadow-xl">
                    <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
                      <h3 className="font-bold text-xl">Aperçu du document</h3>
                      <div className="flex items-center gap-2">
                        <AiBadge />
                        <span className="text-xs text-muted-foreground">Version 1.0</span>
                      </div>
                    </div>

                    {/* Le contrat généré par l'IA est du Markdown brut (#, **gras**...) —
                        du charabia pour un public qui n'a jamais vu de Markdown. "Aperçu"
                        (par défaut) l'affiche mis en forme comme un vrai document ; "Modifier
                        le texte" ouvre la source éditable pour qui veut ajuster une formulation. */}
                    <Tabs defaultValue="preview" className="w-full">
                      <TabsList className="mb-4">
                        <TabsTrigger value="preview" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> Aperçu</TabsTrigger>
                        <TabsTrigger value="edit" className="gap-1.5"><PenLine className="w-3.5 h-3.5" /> Modifier le texte</TabsTrigger>
                      </TabsList>

                      <TabsContent value="preview" className="mt-0">
                        <div className="bg-white text-gray-800 p-10 md:p-14 rounded-lg shadow-inner border overflow-y-auto max-h-[85vh] min-h-[500px]">
                          <ContractMarkdownRenderer content={contractText} />
                        </div>
                      </TabsContent>

                      <TabsContent value="edit" className="mt-0">
                        <p className="text-xs text-muted-foreground mb-2">
                          Modifiez librement le texte ci-dessous — la mise en forme (titres, gras) est appliquée automatiquement dans l'onglet "Aperçu".
                        </p>
                        <div className="bg-white text-gray-800 p-10 rounded-lg shadow-inner border font-serif text-sm leading-relaxed overflow-y-auto max-h-[85vh] min-h-[500px]">
                          <Textarea
                            value={contractText}
                            onChange={(e) => { setContractText(e.target.value); setHasValidated(false); }}
                            className="w-full h-full min-h-[480px] border-none focus-visible:ring-0 p-0 resize-none font-serif text-base"
                          />
                        </div>
                      </TabsContent>
                    </Tabs>

                    {/* SHA-256 fingerprint display */}
                    <div className="mt-4 p-3 bg-muted rounded-lg flex items-center gap-2">
                      <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-[10px] text-muted-foreground font-mono break-all">
                        Empreinte document calculée à la signature. Toute modification ultérieure sera détectable.
                      </p>
                    </div>

                    <div className="flex justify-between items-center mt-8">
                      <Button variant="outline" onClick={() => setCurrentStep(2)} className="px-8">
                        <ChevronLeft className="w-5 h-5 mr-2" />
                        Précédent
                      </Button>
                      <div className="flex flex-col items-end gap-1.5">
                        {!hasValidated && (
                          <p className="text-[11px] text-[#2196F3] font-medium flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Vérification de conformité requise →
                          </p>
                        )}
                        <Button className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] px-8 font-bold" onClick={() => { setError(null); if (validateStep3()) setCurrentStep(4); }}>
                          Suivant
                          <ChevronRight className="w-5 h-5 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* Edit Panel */}
                  <div className="space-y-6">
                    <Card className="p-6">
                      <h3 className="mb-4 font-bold flex items-center gap-2">
                        <Brain className="w-5 h-5 text-[#9C27B0]" />
                        Actions IA
                      </h3>
                      <div className="space-y-3">
                        <Button variant="outline" className="w-full justify-start text-sm hover:bg-[#9C27B0]/5 border-[#9C27B0]/30"
                          onClick={handleSimplify} disabled={isSimplifying}>
                          {isSimplifying
                            ? <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                            : <Brain className="w-4 h-4 mr-3 text-[#9C27B0]" />}
                          {isSimplifying ? "Simplification..." : "Simplifier le langage"}
                        </Button>
                      </div>
                    </Card>

                    {/* Vérification de conformité — étape obligatoire avant l'étape 4 */}
                    <Card ref={complianceCardRef} className={`p-6 border-2 ${!hasValidated ? "border-[#2196F3] bg-[#2196F3]/5" : "border-[#2196F3]/20"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold flex items-center gap-2">
                          <Shield className="w-5 h-5 text-[#2196F3]" />
                          Vérification de conformité
                        </h3>
                        {!hasValidated && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-[#2196F3] text-white px-2 py-1 rounded-full shrink-0">
                            Étape obligatoire
                          </span>
                        )}
                      </div>
                      {!hasValidated && !isValidating && (
                        <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-[#2196F3] shrink-0 mt-0.5" />
                          Vous ne pourrez pas passer à l'étape des signataires tant que ce contrôle n'aura pas été lancé.
                        </p>
                      )}
                      <Button className="w-full justify-center text-sm bg-[#2196F3] text-white hover:bg-[#1E88E5]"
                        onClick={handleValidateCompliance} disabled={isValidating}>
                        {isValidating
                          ? <Loader2 className="w-4 h-4 mr-3 animate-spin" />
                          : <Eye className="w-4 h-4 mr-3" />}
                        {isValidating ? "Vérification..." : "Vérifier la conformité"}
                      </Button>

                      {/* Résultat de la validation IA */}
                      {aiValidationResult && (
                        <div className="mt-4 pt-4 border-t border-[#2196F3]/20">
                          {aiValidationResult.issues.length > 0 && (
                            <div className="mb-3">
                              <p className="text-[10px] font-bold text-destructive mb-1">⚠ Points à corriger :</p>
                              <ul className="space-y-1">
                                {aiValidationResult.issues.map((issue, i) => (
                                  <li key={i} className="text-[10px] text-muted-foreground flex gap-1">
                                    <span className="shrink-0">•</span>{issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {aiValidationResult.suggestions.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-[#4CAF50] mb-1">✓ Suggestions :</p>
                              <ul className="space-y-1">
                                {aiValidationResult.suggestions.map((s, i) => (
                                  <li key={i} className="text-[10px] text-muted-foreground flex gap-1">
                                    <span className="shrink-0">•</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {aiValidationResult.issues.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[#2196F3]/20 flex items-start gap-2 cursor-pointer" onClick={() => setAcknowledgeIssues(!acknowledgeIssues)}>
                              <Checkbox checked={acknowledgeIssues} onCheckedChange={(v) => setAcknowledgeIssues(!!v)} className="mt-0.5" />
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Je reconnais les points de conformité relevés ci-dessus et je souhaite tout de même continuer.
                              </p>
                            </div>
                          )}
                          {aiValidationResult.issues.length === 0 && (
                            <p className="text-[10px] text-[#4CAF50] font-medium flex items-center gap-1 mt-2"><CheckCircle2 className="w-3 h-3" /> Aucun point bloquant relevé.</p>
                          )}
                        </div>
                      )}
                    </Card>

                    <Card className="p-6 bg-muted/40 border-dashed border-2">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-xs leading-relaxed italic text-muted-foreground">
                          Le contrat a été généré sur la base du modèle sélectionné. Vous pouvez le modifier manuellement avant de finaliser.
                        </p>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4b: Ready to deploy right away ── */}
          {currentStep === 4 && readyToDeployDraft && (
            <Card className="p-10 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="font-bold text-xl mb-2">Brouillon enregistré — tous vos signataires ont déjà un compte</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Rien ne bloque plus ce contrat. Vous pouvez le déployer sur la blockchain dès maintenant pour lancer les signatures, ou le faire plus tard depuis la page du contrat.
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6 flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5 shrink-0" />
                Le déploiement est immédiat et irréversible : le contrat sera ancré de façon permanente sur la blockchain.
              </p>
              {!isConnected && (
                <p className="text-sm text-[#FFC107] mb-4 flex items-center justify-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Connectez votre portefeuille pour déployer maintenant.
                </p>
              )}
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" className="px-6" disabled={isDeploying}
                  onClick={() => router.push(`/contract-details?id=${readyToDeployDraft.id}&created=true`)}>
                  Plus tard
                </Button>
                <Button
                  className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] px-8 font-bold"
                  onClick={handleDeployNow}
                  disabled={isDeploying || !isConnected}
                >
                  {isDeploying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Déploiement...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Déployer maintenant
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* ── STEP 4: Signatories ── */}
          {currentStep === 4 && !readyToDeployDraft && (
            <Card className="p-8">
              <div className="text-center mb-8">
                <h2 className="mb-2 font-bold">Ajouter les signataires</h2>
                <p className="text-muted-foreground">
                  Entrez les emails des parties prenantes. S'ils n'ont pas de compte, ils recevront une invitation pour créer leur portefeuille sécurisé.
                </p>
              </div>

              {/* Signatories list */}
              <div className="space-y-3 mb-6">
                {signatories.map((s, idx) => {
                  const locked = isNamedContractParty(s.email);
                  return (
                    <Card key={idx} className="p-4 border-l-4 border-l-[#4CAF50] bg-[#4CAF50]/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#4CAF50]/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-[#4CAF50]" />
                          </div>
                          <div>
                            <p className="font-bold text-sm">{s.name || s.email}</p>
                            {s.name && <p className="text-xs text-muted-foreground">{s.email}</p>}
                            <p className="text-[10px] text-muted-foreground uppercase">{ROLE_LABELS[s.role]}</p>
                            {locked && (
                              <p className="text-[10px] text-muted-foreground italic">Partie nommée dans le contrat — ne peut pas être retirée</p>
                            )}
                          </div>
                        </div>
                        {locked ? (
                          <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => removeSignatory(s.email)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Add signatory form */}
              <Card className="p-5 bg-muted/30 border-dashed mb-6">
                <h4 className="text-sm font-bold mb-4">Ajouter un signataire</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <FieldGroup label="Nom (optionnel)">
                    <Input placeholder="Sophie Martin" value={newSignatory.name}
                      onChange={(e) => setNewSignatory((p) => ({ ...p, name: e.target.value }))} />
                  </FieldGroup>
                  <FieldGroup label="Email *" error={validationErrors["newSignatory"]}>
                    <Input type="email" placeholder="sophie@exemple.com" value={newSignatory.email}
                      onChange={(e) => {
                        setNewSignatory((p) => ({ ...p, email: e.target.value }));
                        if (validationErrors["newSignatory"]) setValidationErrors((err) => { const { newSignatory: _, ...rest } = err; return rest; });
                      }} />
                  </FieldGroup>
                  <FieldGroup label="Rôle" className="md:col-span-2">
                    <Select value={String(newSignatory.role)} onValueChange={(v) => setNewSignatory((p) => ({ ...p, role: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{ROLE_LABELS[1]}</SelectItem>
                        <SelectItem value="2">{ROLE_LABELS[2]}</SelectItem>
                        <SelectItem value="3">{ROLE_LABELS[3]}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>
                <Button variant="outline" onClick={handleAddSignatory} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Ajouter ce signataire
                </Button>
              </Card>

              {validationErrors["signatories"] && (
                <p className="text-sm text-destructive mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />{validationErrors["signatories"]}
                </p>
              )}

              {/* Security Summary */}
              <div className="space-y-4 mb-8">
                <h3 className="font-bold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#FFC107]" />
                  Sécurité et Blockchain
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-input-background">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div>
                      <p className="font-bold text-sm block mb-1">Intégrité SHA-256</p>
                      <p className="text-xs text-muted-foreground">L'empreinte du document sera calculée et ancrée on-chain au moment de la signature.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-[#FFC107]/5 border-[#FFC107]/30">
                    <Shield className="w-5 h-5 text-[#FFC107] shrink-0" />
                    <div>
                      <p className="font-bold text-sm block mb-1">Enregistrement Blockchain</p>
                      <p className="text-xs text-muted-foreground">Le contrat sera ancré de manière immuable sur Polygon Amoy.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exigence de vérification d'identité — désactivée par défaut (voir la note
                  de conception KYC) : un choix par contrat, jamais un défaut plateforme. Le
                  créateur est automatiquement inclus quand c'est activé — sinon sa propre
                  signature ne bénéficierait pas de la présomption renforcée que ce réglage
                  est censé apporter au document tout entier. */}
              <div
                className={`flex items-start gap-3 p-4 border rounded-lg mb-8 cursor-pointer transition-colors ${
                  formData.options.requireVerifiedSigners ? "border-primary/30 bg-primary/5" : "bg-input-background"
                }`}
                onClick={() => {
                  const next = !formData.options.requireVerifiedSigners;
                  updateFormData("options", "requireVerifiedSigners", next);
                  if (next && user?.kycStatus !== "VERIFIED") setShowCreatorKycWarning(true);
                }}
              >
                <Checkbox
                  checked={formData.options.requireVerifiedSigners}
                  onCheckedChange={(v) => {
                    updateFormData("options", "requireVerifiedSigners", !!v);
                    if (v && user?.kycStatus !== "VERIFIED") setShowCreatorKycWarning(true);
                  }}
                  className="mt-1"
                />
                <div>
                  <p className="font-bold text-sm block mb-1">Exiger une identité vérifiée pour signer</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Chaque signataire — vous y compris — devra avoir vérifié son identité avant de pouvoir signer ce contrat. Renforce la valeur légale du document, au prix d'une étape supplémentaire pour tout le monde.
                  </p>
                </div>
              </div>

              {/* Le créateur vient d'activer l'exigence sans être lui-même vérifié — un
                  rappel immédiat plutôt qu'une découverte frustrante au moment de signer,
                  avec un accès direct à la vérification depuis cet écran même. */}
              <Dialog open={showCreatorKycWarning} onOpenChange={setShowCreatorKycWarning}>
                <DialogContent className="max-w-sm">
                  <DialogTitle className="text-base font-bold">Vous n'êtes pas encore vérifié</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Vous exigez une identité vérifiée pour signer ce contrat — cela vous concerne aussi. Vous pourrez enregistrer ce brouillon dès maintenant, mais vous devrez vérifier votre identité avant de pouvoir le signer vous-même.
                  </DialogDescription>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowCreatorKycWarning(false)}>Plus tard</Button>
                    <Button className="flex-1" onClick={() => { setShowCreatorKycWarning(false); setShowCreatorVerifyModal(true); }}>Vérifier maintenant</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <IdentityVerificationModal open={showCreatorVerifyModal} onClose={() => setShowCreatorVerifyModal(false)} />

              {/* Consent Checkbox */}
              <div className={`p-4 border rounded-lg mb-8 ${validationErrors["consent"] ? "border-destructive bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => { setConsentChecked(!consentChecked); if (validationErrors["consent"]) setValidationErrors((e) => { const { consent: _, ...r } = e; return r; }); }}>
                  <Checkbox id="consent" checked={consentChecked} onCheckedChange={(v) => { setConsentChecked(!!v); }} className="mt-1" />
                  <Label htmlFor="consent" className="block cursor-pointer text-sm leading-relaxed">
                    Je certifie avoir <strong>lu et approuvé</strong> le contrat dans son intégralité. Je confirme que les informations saisies sont exactes et je consens à apposer {signatureLegalBasisClause(formData.details.country, formData.details.customLegalBasis)}.
                  </Label>
                </div>
                {validationErrors["consent"] && (
                  <p className="text-xs text-destructive mt-2 ml-7">{validationErrors["consent"]}</p>
                )}
              </div>

              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => setCurrentStep(selectedTemplate === "pdf_upload" ? 2 : 3)} className="px-8">
                  <ChevronLeft className="w-5 h-5 mr-2" />
                  Retour
                </Button>

                <div className="flex flex-col items-end gap-1.5">
                  <Button
                    className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] px-10 py-6 text-lg font-bold"
                    onClick={handleFinalSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        Finalisation...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-3" />
                        Enregistrer le Brouillon
                      </>
                    )}
                  </Button>
                  <p className="text-[11px] text-muted-foreground max-w-xs text-right">
                    Cette étape ne signe ni ne déploie rien — le déploiement sur la blockchain puis la signature de chaque partie restent à faire ensuite.
                  </p>
                </div>
              </div>

              {/* Supprimé: check isConnected */}
            </Card>
          )}
        </div>
      </main>

      <style jsx global>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </>
  );
}

// ─── Helper Component ────────────────────────────────────────────────────────

function FieldGroup({
  label,
  error,
  children,
  className = "",
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label className={error ? "text-destructive" : ""}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
    </div>
  );
}
