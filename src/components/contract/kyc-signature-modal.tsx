"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  ShieldCheck,
  UserCheck,
  FileCheck2,
  PenLine,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Download,
} from "lucide-react"
import { signatureLegalBasisClause } from "@/lib/contract-templates"
import { computeSHA256, computeRemoteFileSHA256, downloadTextForVerification } from "@/lib/utils/hash"
import { buildContractFileBaseName } from "@/lib/utils/contractNaming"

interface KycSignatureModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  contractTitle: string
  contractContent?: string
  originalHash?: string
  /** CID of the file on IPFS — only meaningful (and only shown) for an imported PDF, where
   *  `originalHash` is a real SHA-256 of the file's bytes and this is a separate identifier. */
  ipfsCid?: string
  /** Full gateway URL for the imported file — used to re-fetch and re-hash it at signature
   *  time (see `computeRemoteFileSHA256`), so an import gets the same live integrity check
   *  an AI-generated contract already had, instead of only checking the hash once at upload. */
  ipfsUrl?: string
  signerName?: string
  signerEmail?: string
  /** Country of execution, used to cite the right country's e-signature law instead of
   *  a fixed EU/eIDAS reference that doesn't apply outside the EU/EEA. */
  country?: string
  /** Free-text legal basis entered by the creator when `country` isn't one of the mapped
   *  ones — see `signatureLegalBasisClause`. */
  customLegalBasis?: string
  /** These four, together, let the success screen offer the exact same "document à
   *  conserver pour la vérification" download already on the contract details page —
   *  building the same file name (buildContractFileBaseName) instead of a different one,
   *  and, for an import, forcing a real download (?download=1) rather than the `ipfsUrl`
   *  above, which only ever opens inline. Right after signing is the moment this file
   *  matters most — most people close this modal and never come back to the details page. */
  documentType?: string
  reference?: number
  createdAt?: string
  partyNames?: (string | undefined)[]
  /** Only meaningful for an imported PDF (isImportedPdf) — see ipfsApi.getDownloadUrl. */
  downloadUrl?: string
}

const STEPS = [
  {
    id: "identity",
    icon: UserCheck,
    title: "Confirmation d'identité",
    description:
      "Confirmez que vous êtes bien la personne autorisée à signer ce contrat, via le compte et le portefeuille numérique déjà connectés à cette session. Il ne s'agit pas d'une vérification d'identité par pièce officielle.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    id: "review",
    icon: FileCheck2,
    title: "Relecture du document",
    description:
      "Assurez-vous d'avoir lu et compris l'intégralité du contrat avant de signer. Une signature numérique a la même valeur juridique qu'une signature manuscrite.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    id: "sign",
    icon: PenLine,
    title: "Signature électronique",
    description:
      "En cliquant sur « Signer », vous apposez votre signature électronique. Cette action déclenchera une transaction immuable sur la blockchain.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
]

export function KycSignatureModal({
  open,
  onClose,
  onConfirm,
  contractTitle,
  contractContent,
  originalHash,
  ipfsCid,
  ipfsUrl,
  signerName,
  signerEmail,
  country,
  customLegalBasis,
  documentType,
  reference,
  createdAt,
  partyNames,
  downloadUrl,
}: KycSignatureModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [calculatedHash, setCalculatedHash] = useState<string>("")
  const isImportedPdf = contractContent === "CONTRAT_PDF_EXTERNE"
  // Only meaningful for an imported PDF: re-fetched and re-hashed from the gateway, not
  // just re-displayed from what was computed once at upload time (see hash.ts).
  const [calculatedFileHash, setCalculatedFileHash] = useState<string | null>(null)
  const [checkingFileHash, setCheckingFileHash] = useState(false)
  // Raw hash strings are exactly the kind of detail that reassures a technical user and
  // alarms/confuses everyone else — collapsed by default, one click away for the curious.
  const [showHashDetails, setShowHashDetails] = useState(false)

  useEffect(() => {
    if (open && contractContent && !isImportedPdf) {
      computeSHA256(contractContent).then(setCalculatedHash);
    }
  }, [open, contractContent, isImportedPdf]);

  useEffect(() => {
    if (!open || !isImportedPdf || !ipfsUrl) return;
    setCheckingFileHash(true);
    setCalculatedFileHash(null);
    computeRemoteFileSHA256(ipfsUrl)
      .then(setCalculatedFileHash)
      .finally(() => setCheckingFileHash(false));
  }, [open, isImportedPdf, ipfsUrl]);

  const step = STEPS[currentStep]
  const isLastStep = currentStep === STEPS.length - 1
  // A warning that doesn't actually stop the signature isn't a safeguard — if the displayed
  // text doesn't match the hash the platform itself certified, signing it is blocked
  // outright rather than left to a checkbox the user might click past without reading.
  // For an imported PDF, the same guarantee now applies to the file itself: the gateway is
  // re-fetched and re-hashed live rather than trusting the hash computed once at upload.
  // A failed re-fetch (`calculatedFileHash === null` after checking) never blocks signing —
  // a network/CORS hiccup on the gateway is not evidence of tampering.
  const hasHashMismatch = isImportedPdf
    ? (calculatedFileHash !== null && calculatedFileHash !== originalHash)
    : (calculatedHash !== "" && calculatedHash !== originalHash)

  // A genuine integrity problem must never stay hidden behind a collapsed "for the curious"
  // section — force it open the moment it's detected, regardless of the user's own toggle.
  useEffect(() => {
    if (hasHashMismatch) setShowHashDetails(true)
  }, [hasHashMismatch])

  const handleNext = async () => {
    if (isLastStep) {
      if (!agreed || hasHashMismatch) return
      try {
        setSigning(true)
        await onConfirm()
        setDone(true)
      } catch {
        // error handled upstream
      } finally {
        setSigning(false)
      }
    } else {
      setCurrentStep((s) => s + 1)
    }
  }

  const handleClose = () => {
    // Reset state on close
    setCurrentStep(0)
    setAgreed(false)
    setSigning(false)
    setDone(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl border border-border/50 shadow-2xl">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-8 pt-8 pb-6 border-b border-border/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold leading-tight">
                Signature sécurisée
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Processus de vérification en {STEPS.length} étapes
              </DialogDescription>
            </div>
          </div>

          {/* Contract info */}
          <div className="bg-background/60 backdrop-blur rounded-xl px-4 py-3 border border-border/40">
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest mb-1 font-medium">
              Contrat à signer
            </p>
            <p className="text-sm font-bold text-foreground truncate">{contractTitle}</p>
            {(signerName || signerEmail) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {signerName && <span className="font-medium">{signerName} · </span>}
                {signerEmail}
              </p>
            )}
          </div>
        </div>

        {/* Step progress */}
        <div className="flex gap-1.5 px-8 py-4 bg-muted/30">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                i < currentStep
                  ? "bg-primary"
                  : i === currentStep
                  ? "bg-primary/50"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-2">
          {done ? (
            // Success state
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">Contrat signé avec succès !</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Votre signature a été enregistrée sur la blockchain. Le contrat a été mis à
                jour automatiquement.
              </p>

              {/* Le moment le plus sûr de proposer ce téléchargement : la plupart des gens
                  ferment ce dialogue et ne reviennent jamais sur la page de détail — voir
                  "Document à conserver pour la vérification" sur contract-details-page.tsx,
                  même mécanique, même nom de fichier (buildContractFileBaseName). */}
              {reference !== undefined && createdAt && (!isImportedPdf || downloadUrl) && (
                <div className="mb-6 text-left">
                  <Button
                    variant="outline"
                    className="w-full text-xs gap-2"
                    asChild={isImportedPdf}
                    onClick={
                      isImportedPdf
                        ? undefined
                        : () => {
                            const fileBaseName = buildContractFileBaseName({
                              documentType: documentType || "Contrat",
                              partyNames: (partyNames || []).filter((n): n is string => !!n),
                              createdAt: new Date(createdAt),
                              reference,
                            });
                            downloadTextForVerification(contractContent || "", `${fileBaseName}-a-conserver.txt`);
                          }
                    }
                  >
                    {isImportedPdf ? (
                      <a href={downloadUrl}>
                        <Download className="w-3 h-3" />
                        Télécharger le document original
                      </a>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        Télécharger le fichier à conserver
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Gardez ce fichier de côté : vous pourrez le redéposer sur la page de vérification publique pour prouver que ce contrat n'a pas été modifié.
                  </p>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                Fermer
              </Button>
            </div>
          ) : (
            <>
              {/* Current step card */}
              <div
                className={`rounded-xl border ${step.border} ${step.bg} p-5 mb-5 transition-all duration-300`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full bg-background/70 flex items-center justify-center shrink-0 ${step.color}`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-sm">{step.title}</h3>
                      <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        {currentStep + 1}/{STEPS.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Legal warning on review step */}
              {currentStep === 1 && (
                <>
                  <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/40 border border-border/50 mb-3">
                    <button
                      type="button"
                      onClick={() => setShowHashDetails((v) => !v)}
                      className="flex items-center justify-between gap-2 w-full text-left"
                    >
                      <span className="flex items-center gap-2">
                        <ShieldCheck className={`w-4 h-4 ${hasHashMismatch ? "text-destructive" : "text-emerald-500"}`} />
                        <span className="text-xs font-bold">Vérification de l'intégrité</span>
                        {!hasHashMismatch && (
                          <span className="text-[10px] text-emerald-600 font-medium">✓ Conforme</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        Détails techniques
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHashDetails ? "rotate-180" : ""}`} />
                      </span>
                    </button>

                    {hasHashMismatch && (
                      <p className="text-[10px] text-destructive font-bold">
                        ⚠ {isImportedPdf
                          ? "Le fichier actuellement servi diffère de celui certifié à l'import"
                          : "Le texte affiché diffère de la version originale certifiée"} — la signature est bloquée tant que cet écart n'est pas résolu.
                      </p>
                    )}

                    {showHashDetails && (
                      isImportedPdf ? (
                        <div className="text-[10px] font-mono break-all space-y-1 pt-1 border-t border-border/40">
                          <p className={hasHashMismatch ? "text-destructive font-bold" : "text-emerald-500 font-bold"}>
                            {hasHashMismatch ? "Le fichier servi ne correspond plus à l'empreinte certifiée" : "Intégrité du fichier PDF garantie par empreinte SHA-256 et IPFS"}
                          </p>
                          <p><span className="text-muted-foreground">Fichier resservi depuis IPFS :</span> {checkingFileHash ? "Calcul en cours..." : (calculatedFileHash ?? "Non vérifiable (réseau/gateway indisponible)")}</p>
                          <p><span className="text-muted-foreground">Empreinte SHA-256 certifiée :</span> {originalHash || "N/A"}</p>
                          <p><span className="text-muted-foreground">Identifiant IPFS (CID) :</span> {ipfsCid || "N/A"}</p>
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono break-all space-y-1 pt-1 border-t border-border/40">
                          <p><span className="text-muted-foreground">Texte affiché :</span> <span className={calculatedHash === originalHash ? "text-emerald-500" : "text-amber-500"}>{calculatedHash || "Calcul en cours..."}</span></p>
                          <p><span className="text-muted-foreground">Original (IPFS) :</span> {originalHash || "N/A"}</p>
                        </div>
                      )
                    )}
                  </div>

                  <div className="flex gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      <span className="text-amber-600 font-semibold">Attention :</span> Toute
                      signature est définitive et ne peut être annulée qu'avec l'accord de
                      toutes les parties impliquées.
                    </p>
                  </div>
                </>
              )}

              {/* Agreement checkbox on last step */}
              {isLastStep && (
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all mb-5 ${
                    agreed
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-muted/40 border-border/50"
                  }`}
                  onClick={() => setAgreed((v) => !v)}
                >
                  <Checkbox
                    id="kyc-agree"
                    checked={agreed}
                    onCheckedChange={(v) => setAgreed(Boolean(v))}
                    className="mt-0.5"
                  />
                  <label htmlFor="kyc-agree" className="text-xs cursor-pointer leading-relaxed">
                    Je confirme avoir lu et compris le contrat dans son intégralité. Je
                    consens à apposer {signatureLegalBasisClause(country, customLegalBasis)}.
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                  disabled={signing}
                >
                  Annuler
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleNext}
                  disabled={(isLastStep && (!agreed || hasHashMismatch)) || signing}
                >
                  {signing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signature en cours...
                    </>
                  ) : isLastStep ? (
                    <>
                      <PenLine className="w-4 h-4" />
                      Signer le contrat
                    </>
                  ) : (
                    <>
                      Continuer
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
