"use client"

import { useState, useEffect } from "react"
import { signatoryRoleLabel } from "@/lib/contract-roles"
import { FEATURES } from "@/lib/features"
import { Button } from "../ui/button"
import { Card } from "../ui/card"
import { Badge } from "../ui/badge"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog"
import { contractsApi, type Contract } from "@/lib/api/contracts"
import { escrowApi, type Escrow } from "@/lib/api/escrow"
import { incidentsApi, type Incident } from "@/lib/api/incidents"
import { ipfsApi } from "@/lib/api/ipfs"
import { downloadTextForVerification } from "@/lib/utils/hash"
import { buildContractFileBaseName } from "@/lib/utils/contractNaming"
import { useWeb3 } from "@/contexts/web3-context"
import { useContract } from "@/hooks/useContract"
import { useAuthStore } from "@/hooks/useAuth"
import {
  FileText,
  Users,
  Shield,
  Download,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Send,
  Mail,
  Copy,
  Check,
  ArrowLeft,
  UserX,
  Gavel,
  PauseCircle,
  QrCode,
  Lock,
} from "lucide-react"
import Link from "next/link"
import { KycSignatureModal } from "@/components/contract/kyc-signature-modal"
import { SignaturePanel } from "@/components/contract/signaturePanel"
import { PdfDocumentViewer } from "@/components/contract/pdf-document-viewer"
import { IdentityVerificationModal } from "@/components/kyc/identity-verification-modal"
import { AiBadge } from "../ui/ai-badge"
import { ContractMarkdownRenderer } from "@/components/contract/contract-markdown-renderer"
import { cn } from "@/components/ui/utils"
import { getEffectiveStatus } from "@/lib/contract-status"
import { formatReference } from "@/lib/utils/contractNaming"
import { deployDraftContract } from "@/lib/utils/deployContract"
import {
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  INCIDENT_STATUS_LABELS,
  type IncidentReason,
} from "@/lib/contract-incidents"

interface ContractDetailsPageProps {
  id: string
  created?: boolean
}

export function ContractDetailsPage({ id, created }: ContractDetailsPageProps) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showKycModal, setShowKycModal] = useState(false)
  const [showVerifyBeforeSign, setShowVerifyBeforeSign] = useState(false)
  const [showIdentityVerification, setShowIdentityVerification] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendFeedback, setResendFeedback] = useState<{ id: string; type: "success" | "error"; text: string } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [escrow, setEscrow] = useState<Escrow | null>(null)
  const [escrowActionLoading, setEscrowActionLoading] = useState(false)
  const [escrowActionError, setEscrowActionError] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState("")
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showHoldForm, setShowHoldForm] = useState(false)
  const [disputeReason, setDisputeReason] = useState<IncidentReason>("OTHER")
  const [disputeDescription, setDisputeDescription] = useState("")
  const [holdDescription, setHoldDescription] = useState("")
  const [incidentActionLoading, setIncidentActionLoading] = useState(false)
  const [incidentActionError, setIncidentActionError] = useState<string | null>(null)
  const { account, isConnected } = useWeb3()
  const { signContract, createContract, loading: isSigning } = useContract()
  const { user } = useAuthStore()

  const copyToClipboard = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error("Impossible de copier :", err)
    }
  }

  const handleResendEmail = async (signatoryId: string) => {
    setResendingId(signatoryId)
    setResendFeedback(null)
    try {
      await contractsApi.resendSignatureRequest(id, signatoryId)
      setResendFeedback({ id: signatoryId, type: "success", text: "Email de relance envoyé." })
    } catch (err: any) {
      setResendFeedback({ id: signatoryId, type: "error", text: err.message || "Échec de l'envoi." })
    } finally {
      setResendingId(null)
      setTimeout(() => setResendFeedback(null), 4000)
    }
  }

  // Partagé entre le téléchargement manuel (handleDownloadPDF) et le dépôt automatique du
  // certificat officiel (voir l'effet plus bas) — un seul et même contenu dans les deux cas.
  const buildCertificateDataFor = (c: Contract) => {
    const signersForPdf = c.status === 'DRAFT_WAITING_SIGNERS' || c.status === 'READY_TO_DEPLOY'
      ? (c as any).signatories.map((s: any) => ({ name: s.name || s.email, email: s.email, isRegistered: s.isRegistered }))
      : (c.metadata?.signers || []).map((s: any) => ({ name: s.name || s.address, address: s.address, hasSigned: s.hasSigned }));

    return {
      title: c.title,
      documentType: c.metadata?.type || "Contrat",
      reference: c.reference,
      content: c.metadata?.content || "",
      // Toujours la vraie empreinte SHA-256 du fichier, jamais notre référence de stockage
      // interne (c.ipfsHash) — c'est cette même valeur que la page publique de
      // vérification compare au fichier qu'un tiers dépose. Voir pdfGenerator.ts.
      sha256Hash: c.metadata?.sha256Hash || "Non généré",
      // c.id est toujours une chaîne (brouillon ou déployé) : c.contractId est le seul champ
      // qui porte réellement l'identifiant numérique on-chain une fois déployé. Utiliser c.id
      // ici (comme avant) faisait toujours passer contractId à `undefined`, même sur un
      // contrat actif — le certificat affichait alors "en attente de déploiement" à tort.
      contractId: c.contractId ?? undefined,
      draftId: c.contractId == null ? c.id : undefined,
      publicToken: c.publicToken,
      parties: {
        partyA: c.metadata?.parties?.partyA || { name: "Partie A", email: "" },
        partyB: c.metadata?.parties?.partyB || { name: "Partie B", email: "" }
      },
      signatories: signersForPdf,
      status: c.status,
      createdAt: c.createdAt,
      isExternalPdf: !!c.metadata?.isExternalPdf,
      proxyUrl: c.ipfsHash ? ipfsApi.getProxyUrl(c.ipfsHash) : undefined,
      priorSignatureDetected: !!(c.metadata?.importAnalysis?.hasDigitalSignature || c.metadata?.importAnalysis?.mentionsExistingSignature),
    };
  }

  const handleDownloadPDF = async () => {
    if (!contract) return;
    setIsGeneratingPdf(true);
    try {
      const { generateCertifiedPDF } = await import("@/lib/utils/pdfGenerator");
      await generateCertifiedPDF(buildCertificateDataFor(contract));
    } catch (err) {
      console.error("Erreur génération PDF:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  // Dépôt AUTOMATIQUE du certificat officiel (le PDF avec code QR — voir la décision de le
  // traiter comme le document définitif) : dès qu'un participant autorisé ouvre la page d'un
  // contrat entièrement signé, son navigateur génère le certificat et le dépose (idempotent
  // côté serveur : le premier arrivé gagne, voir storeCertificate) — aucun bouton à cliquer.
  // Best-effort : une erreur ici ne doit jamais gêner la consultation du contrat, juste
  // rester silencieuse en console.
  useEffect(() => {
    if (!contract) return;
    if (!contract.contractId) return; // pas encore déployé sur la chaîne
    if (contract.status !== 'ACTIVE' && contract.status !== 'COMPLETED') return; // pas encore entièrement signé
    if (contract.metadata?.certificateCid) return; // déjà déposé

    let cancelled = false;
    (async () => {
      try {
        const { buildCertificatePdfBytes } = await import("@/lib/utils/pdfGenerator");
        const { bytes, fileName } = await buildCertificatePdfBytes(buildCertificateDataFor(contract));
        if (cancelled) return;
        // See the matching comment in hash.ts's computeBytesSHA256 — same TS/DOM typing papercut.
        const file = new File([bytes as Uint8Array<ArrayBuffer>], fileName, { type: "application/pdf" });
        await contractsApi.storeCertificate(String(contract.contractId), file, fileName);
        if (!cancelled) fetchDetails({ silent: true });
      } catch (err) {
        console.error("Échec du dépôt automatique du certificat officiel :", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.contractId, contract?.status, contract?.metadata?.certificateCid])

  // `silent` skips the full-page loading state used for the initial load. Without it, ANY
  // refresh (e.g. right after signing) flips `loading` true, which unmounts the entire page
  // tree — including KycSignatureModal, wiping its "done" success-screen state. Since nothing
  // resets `showKycModal` to false on a successful sign (the user is meant to close it
  // themselves off the success screen), remounting the modal open-but-freshly-reset made it
  // look like it "reopened to start signing again" right after a signature had just gone
  // through — this is what that bug actually was.
  const fetchDetails = async (opts: { silent?: boolean } = {}) => {
    try {
      if (!opts.silent) setLoading(true)
      if (isNaN(Number(id))) {
        // C'est un brouillon (UUID)
        const response = await contractsApi.getDraftDetails(id)
        setContract(response.contract)
      } else {
        // C'est un contrat déployé (Int)
        const response = await contractsApi.getContractDetails(parseInt(id))
        setContract(response.contract)
      }
    } catch (err: any) {
      if (!opts.silent) {
        setError("Impossible de charger les détails du contrat.")
      }
      console.error(err)
    } finally {
      if (!opts.silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetails()
  }, [id])

  const fetchEscrow = async () => {
    try {
      const response = await escrowApi.getEscrow(id)
      setEscrow(response.escrow)
    } catch {
      // No escrow declared for this contract, or not accessible yet (e.g. still a numeric
      // on-chain id before the draft/escrow lookup applies) — not an error worth surfacing.
    }
  }

  // Dépend de `id` (la prop de route), pas de `contract` : ces deux appels n'ont besoin que
  // de l'identifiant pour partir, pas du contrat déjà chargé — les faire attendre `contract`
  // les mettait inutilement en série après fetchDetails() au lieu de partir en parallèle avec
  // lui, ajoutant un aller-retour réseau complet à chaque ouverture de cette page (la
  // destination la plus cliquée de l'app). Un contrat inaccessible ou sans séquestre reste
  // silencieusement ignoré ci-dessus, comme avant.
  //
  // Séquestre hors périmètre du mémoire (FEATURES.escrow) : l'appel est sauté entièrement
  // plutôt que laissé échouer silencieusement contre une route désactivée côté serveur — un
  // aller-retour réseau de moins à chaque ouverture de cette page.
  useEffect(() => {
    if (FEATURES.escrow) fetchEscrow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fetchIncidents = async () => {
    try {
      const response = await incidentsApi.list(id)
      setIncidents(response.incidents)
    } catch {
      // Not accessible yet / none declared — not worth surfacing as an error.
    }
  }

  // Litiges/pauses : off-chain, mais existe uniquement pour bloquer la libération d'un
  // séquestre (voir contract-incidents.ts) — masqué avec FEATURES.escrow pour la même raison.
  useEffect(() => {
    if (FEATURES.escrow) fetchIncidents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleSign = async () => {
    // The smart contract only understands the numeric on-chain contractId — never the
    // page's `id` prop directly, which can be the draft/cache row's UUID whenever this page
    // was reached via a link built from that UUID (e.g. the notification bell links to
    // `contractCacheId`, not the on-chain id). Passing a UUID into signContract() fails deep
    // inside ethers trying to encode it as a uint256 ("invalid BigNumberish string"),
    // surfacing only as a raw ethers error with no clear success/failure message.
    if (!contract?.contractId) {
      setError("Ce contrat n'est pas encore déployé sur la blockchain — impossible de signer.")
      return
    }
    try {
      await signContract(String(contract.contractId))
      // The transaction succeeding on-chain doesn't mean the DB cache already reflects it —
      // that only happens once the background event listener's next poll catches it (every
      // ~15s in healthy conditions, and not at all if that listener is stalled or the RPC is
      // unreachable). Rather than just re-reading whatever's currently cached, force an
      // immediate re-sync of this specific contract from chain so the signature that really
      // did just happen is reflected right away instead of looking like it silently failed.
      await contractsApi.syncContract(contract.contractId).catch((err) => {
        console.warn('Immediate post-signature sync failed, falling back to cache:', err)
      })
      // Silent: the KYC modal is still open showing its "signé avec succès" screen — a
      // full-page reload here would tear that down and, since nothing else closes the
      // modal, bring it back freshly reset (looking like it reopened to sign again).
      await fetchDetails({ silent: true })
    } catch (err) {
      // Error is handled by useContract and displayed if needed
    }
  }

  const handleDeployDraft = async () => {
    if (!contract || !isConnected) return;
    try {
      setLoading(true);
      const { contractId } = await deployDraftContract(contract as any, createContract, contractsApi.markDraftDeployed, account);
      // Query-param route (see app/contract-details/page.tsx) — there is no
      // /contract-details/[id] path route, so a path-segment URL here would 404.
      window.location.href = `/contract-details?id=${contractId}`;
    } catch(err: any) {
      setError("Erreur lors du déploiement : " + (err.message || "Erreur inconnue"));
      setLoading(false);
    }
  }

  const handleDepositEscrow = async () => {
    setEscrowActionLoading(true)
    setEscrowActionError(null)
    try {
      await escrowApi.requestDeposit(id)
      await fetchEscrow()
    } catch (err: any) {
      // Expected today: the backend returns a clear "not available yet" message while no
      // payment provider is wired — surface it as-is rather than a generic error.
      setEscrowActionError(err.message || "Le dépôt n'a pas pu être initié.")
    } finally {
      setEscrowActionLoading(false)
    }
  }

  const handleReleaseEscrow = async () => {
    setEscrowActionLoading(true)
    setEscrowActionError(null)
    try {
      await escrowApi.releaseNow(id)
      await fetchEscrow()
    } catch (err: any) {
      setEscrowActionError(err.message || "La libération a échoué.")
    } finally {
      setEscrowActionLoading(false)
    }
  }

  const handleResolveDispute = async (applyPenalty: boolean) => {
    setEscrowActionLoading(true)
    setEscrowActionError(null)
    try {
      await escrowApi.resolveDispute(id, applyPenalty)
      await fetchEscrow()
    } catch (err: any) {
      setEscrowActionError(err.message || "La résolution a échoué.")
    } finally {
      setEscrowActionLoading(false)
    }
  }

  const handleBlockEscrow = async () => {
    setEscrowActionLoading(true)
    setEscrowActionError(null)
    try {
      await escrowApi.blockRelease(id, blockReason)
      setShowBlockForm(false)
      setBlockReason("")
      await fetchEscrow()
    } catch (err: any) {
      setEscrowActionError(err.message || "Le blocage a échoué.")
    } finally {
      setEscrowActionLoading(false)
    }
  }

  const handleRaiseDispute = async () => {
    if (!disputeDescription.trim()) return
    setIncidentActionLoading(true)
    setIncidentActionError(null)
    try {
      await incidentsApi.raiseDispute(id, {
        reason: disputeReason,
        description: disputeDescription,
      })
      setShowDisputeForm(false)
      setDisputeDescription("")
      await fetchIncidents()
    } catch (err: any) {
      setIncidentActionError(err.message || "Impossible d'ouvrir le litige.")
    } finally {
      setIncidentActionLoading(false)
    }
  }

  const handleProposeHold = async () => {
    if (!holdDescription.trim()) return
    setIncidentActionLoading(true)
    setIncidentActionError(null)
    try {
      await incidentsApi.proposeHold(id, { description: holdDescription })
      setShowHoldForm(false)
      setHoldDescription("")
      await fetchIncidents()
    } catch (err: any) {
      setIncidentActionError(err.message || "Impossible de proposer la pause.")
    } finally {
      setIncidentActionLoading(false)
    }
  }

  const handleRespondToHold = async (incidentId: string, accept: boolean) => {
    setIncidentActionLoading(true)
    setIncidentActionError(null)
    try {
      await incidentsApi.respondToHold(id, incidentId, accept)
      await fetchIncidents()
    } catch (err: any) {
      setIncidentActionError(err.message || "Impossible de répondre à cette proposition.")
    } finally {
      setIncidentActionLoading(false)
    }
  }

  const handleWithdrawIncident = async (incidentId: string) => {
    setIncidentActionLoading(true)
    setIncidentActionError(null)
    try {
      await incidentsApi.withdraw(id, incidentId)
      await fetchIncidents()
    } catch (err: any) {
      setIncidentActionError(err.message || "Impossible de retirer cet incident.")
    } finally {
      setIncidentActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Actif</Badge>
      case 'PENDING_SIGNATURES':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">En attente de signatures</Badge>
      case 'DRAFT_WAITING_SIGNERS':
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">En attente d'inscriptions</Badge>
      case 'READY_TO_DEPLOY':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Prêt à être déployé</Badge>
      case 'COMPLETED':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Terminé</Badge>
      case 'CANCELLED':
        return <Badge className="bg-muted text-muted-foreground border-border">Annulé</Badge>
      case 'DISPUTED':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Litige en cours</Badge>
      case 'TERMINATED':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Résilié</Badge>
      case 'RESIGNED':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Démission</Badge>
      case 'EXPIRED':
        return <Badge className="bg-muted text-muted-foreground border-border">Expiré — fenêtre close</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </main>
    )
  }

  if (error || !contract) {
    return (
      <main className="flex-1 p-8" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        <Card className="p-8 text-center max-w-2xl mx-auto">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Une erreur est survenue</h2>
          <p className="text-muted-foreground mb-6">{error || "Contrat introuvable"}</p>
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
        </Card>
      </main>
    )
  }

  const signers = contract.metadata?.signers || []
  const currentUserSigner = signers.find((s: any) => s.address.toLowerCase() === account?.toLowerCase())
  const canSign = currentUserSigner && !currentUserSigner.hasSigned && contract.status === 'PENDING_SIGNATURES'
  const isCreator = !!user?.id && user.id === contract.userId

  // Set once at creation (create-contract-page.tsx), never editable afterward — there is no
  // "edit a deployed contract's options" screen in this app, so this is effectively locked
  // in from the moment of deployment onward, exactly as intended (see the KYC design notes
  // on why the requirement can't change mid-way through collecting signatures).
  const requiresVerifiedSigners = !!contract.metadata?.options?.requireVerifiedSigners
  const currentUserIsVerified = user?.kycStatus === 'VERIFIED'
  const blockedByKyc = requiresVerifiedSigners && !currentUserIsVerified

  const handleOpenSign = () => {
    if (blockedByKyc) {
      setShowVerifyBeforeSign(true)
      return
    }
    setShowKycModal(true)
  }

  // Unified signer list: merges platform signatories (email, registration state)
  // with on-chain signature state, so we can show who signed / who's still pending
  // and offer a "resend" action for anyone who hasn't signed yet.
  //
  // What "resend" actually re-sends depends on what's actually blocking that signatory:
  // not registered yet -> resend the account-creation invitation (nothing else is possible
  // for them yet); registered but the contract isn't deployed -> nothing to resend, they're
  // simply waiting on other signatories or on the creator, not on an email; deployed and
  // registered but hasn't signed -> resend the "please sign" request.
  const isDeployed = !!contract.contractId
  const dbSignatories = (contract as any).signatories || []
  type SignerRow = {
    key: string
    signatoryId: string | null
    name: string
    email?: string
    walletAddress?: string | null
    role: number
    hasSigned: boolean
    signedAt?: number | null
    isRegistered: boolean
    resendKind: "invite" | "sign" | null
  }

  const signerRows: SignerRow[] = dbSignatories.length > 0
    ? dbSignatories.map((s: any) => {
        const onChain = signers.find((o: any) => s.walletAddress && o.address?.toLowerCase() === s.walletAddress.toLowerCase())
        const hasSigned = !!onChain?.hasSigned
        const resendKind: SignerRow["resendKind"] = hasSigned
          ? null
          : !s.isRegistered
            ? "invite"
            : isDeployed
              ? "sign"
              : null
        return {
          key: s.id,
          signatoryId: s.id,
          name: s.name || s.email,
          email: s.email,
          walletAddress: s.walletAddress,
          role: s.role,
          isRegistered: s.isRegistered,
          hasSigned,
          signedAt: onChain?.signedAt,
          resendKind,
        }
      })
    : signers.map((s: any, idx: number) => ({
        key: `chain-${idx}`,
        signatoryId: null,
        name: s.name || s.address,
        email: s.email || undefined,
        walletAddress: s.address,
        role: s.role,
        isRegistered: true,
        hasSigned: !!s.hasSigned,
        signedAt: s.signedAt,
        resendKind: null,
      }))

  const signedCount = signerRows.filter(s => s.hasSigned).length
  const roleLabel = signatoryRoleLabel

  return (
    <>
      <main className="flex-1 py-8 px-8 transition-all duration-300" style={{ marginLeft: 'var(--sidebar-width, 256px)' }}>
        {created && (
          <div className="max-w-6xl mx-auto mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <p className="text-sm font-medium text-green-700">Votre contrat a été créé et ancré sur la blockchain avec succès !</p>
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>

          {/* Header Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold truncate max-w-full">{contract.title}</h1>
                {getStatusBadge(getEffectiveStatus(contract))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{formatReference(contract.reference)}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Créé le {new Date(contract.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {contract.contractId ? `ID Blockchain #${contract.contractId}` : "Brouillon (non déployé)"}
                </span>
                {signerRows.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {signedCount}/{signerRows.length} signature{signerRows.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPdf}
              >
                {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                PDF
              </Button>
              {/* Opens the signed contract itself, full-window, in a new tab — nothing to do
                  with the blockchain. "Explorer" was an ambiguous label in a Web3 app (reads
                  as "block explorer"); renamed to say plainly what it does. */}
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={`/contract-view?id=${contract.contractId || contract.id}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  Voir le contrat
                </a>
              </Button>
              {canSign && (
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 px-6"
                  onClick={handleOpenSign}
                  disabled={isSigning}
                >
                  {isSigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Signer le contrat
                </Button>
              )}
              {contract.status === 'READY_TO_DEPLOY' && isCreator && (
                 <Button
                 className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] gap-2 px-6 font-bold"
                 onClick={handleDeployDraft}
                 disabled={loading}
               >
                 {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                 Déployer sur la blockchain
               </Button>
              )}
            </div>
          </div>

          {FEATURES.escrow && escrow && (
            <Card className="p-6 mb-8 border-[#FFC107]/30 bg-[#FFC107]/5">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                <h3 className="font-bold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#FFC107]" />
                  Séquestre
                </h3>
                <EscrowStatusBadge status={escrow.status} />
              </div>
              <p className="text-sm mb-4">
                <span className="font-bold">{Number(escrow.amount).toLocaleString('fr-FR')} {escrow.currency}</span>
                <span className="text-muted-foreground"> — échéance le {new Date(escrow.deadline).toLocaleDateString('fr-FR')}</span>
                {escrow.penaltyPercent > 0 && <span className="text-muted-foreground"> · pénalité de retard {escrow.penaltyPercent}%</span>}
              </p>

              {escrow.status === 'PENDING_DEPOSIT' && isCreator && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border/60 mb-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Le paiement en ligne (carte / mobile money) n'est pas encore disponible sur la plateforme. Vous pouvez continuer sans déposer les fonds pour l'instant — cette étape sera activée prochainement.
                  </p>
                  <Button size="sm" variant="outline" onClick={handleDepositEscrow} disabled={escrowActionLoading} className="gap-2">
                    {escrowActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Déposer les fonds (bientôt disponible)
                  </Button>
                </div>
              )}

              {escrow.status === 'DEPOSITED' && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border/60 mb-3 space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Sans action du créateur, les fonds seront automatiquement libérés à l'échéance du {new Date(escrow.deadline).toLocaleString('fr-FR')}.
                    Les deux parties sont prévenues 72h, 48h et 24h avant.
                  </p>
                  {isCreator && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={handleReleaseEscrow} disabled={escrowActionLoading} className="gap-2 bg-green-600 text-white hover:bg-green-700">
                        {escrowActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Valider et libérer maintenant
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowBlockForm((v) => !v)} disabled={escrowActionLoading} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
                        <AlertCircle className="w-4 h-4" />
                        Signaler un problème
                      </Button>
                    </div>
                  )}
                  {showBlockForm && (
                    <div className="pt-2 space-y-2">
                      <textarea
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        placeholder="Décrivez le problème rencontré..."
                        className="w-full p-2 rounded-lg border border-border bg-input-background text-xs min-h-[60px]"
                      />
                      <Button size="sm" variant="destructive" onClick={handleBlockEscrow} disabled={escrowActionLoading || !blockReason.trim()}>
                        Confirmer le blocage
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {escrow.status === 'DISPUTED' && (
                <div className="space-y-2">
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Libération bloquée par le créateur{escrow.disputeReason ? ` : ${escrow.disputeReason}` : ''}.
                  </p>
                  {isCreator && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/60 space-y-2">
                      <p className="text-xs text-muted-foreground">Une fois le problème réglé avec l'autre partie, résolvez le litige :</p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => handleResolveDispute(false)} disabled={escrowActionLoading} className="gap-2 bg-green-600 text-white hover:bg-green-700">
                          {escrowActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Libérer intégralement
                        </Button>
                        {Number(escrow.penaltyPercent) > 0 && (
                          <Button size="sm" variant="outline" onClick={() => handleResolveDispute(true)} disabled={escrowActionLoading} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
                            <AlertCircle className="w-4 h-4" />
                            Libérer avec pénalité ({escrow.penaltyPercent}%)
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {escrow.status === 'RELEASED' && (
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  {escrow.penaltyApplied
                    ? `Fonds libérés avec pénalité de retard appliquée : ${Number(escrow.releasedAmount).toLocaleString('fr-FR')} ${escrow.currency} sur ${Number(escrow.amount).toLocaleString('fr-FR')} ${escrow.currency} initialement séquestrés`
                    : "Fonds libérés intégralement"}{escrow.releasedAt ? ` le ${new Date(escrow.releasedAt).toLocaleDateString('fr-FR')}` : ''}.
                </p>
              )}

              {escrowActionError && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {escrowActionError}
                </p>
              )}
            </Card>
          )}

          {FEATURES.escrow && contract.status === 'ACTIVE' && (currentUserSigner || isCreator) && (
            <Card className="p-6 mb-8">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-primary" />
                  Litiges et pauses
                </h3>
                <div className="flex gap-2">
                  {/* A litige is the most consequential action a signatory can take here — it
                      blocks escrow release immediately — so it gets the same destructive/red
                      treatment as "Résilier", instead of blending into a neutral "PDF"-style
                      outline button that undersells what clicking it actually does. */}
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => { setShowHoldForm(false); setShowDisputeForm((v) => !v) }}>
                    <AlertCircle className="w-3.5 h-3.5" /> Signaler un litige
                  </Button>
                  {/* A hold is mutual and takes no effect until accepted — a calmer amber
                      tint signals "a real, distinct action" without the alarm of red. */}
                  <Button size="sm" variant="outline" className="gap-1.5 text-amber-600 border-amber-500/30 hover:bg-amber-500/5 dark:text-amber-400" onClick={() => { setShowDisputeForm(false); setShowHoldForm((v) => !v) }}>
                    <PauseCircle className="w-3.5 h-3.5" /> Proposer une pause
                  </Button>
                </div>
              </div>

              {showDisputeForm && (
                <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 mb-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Prend effet immédiatement — bloque toute libération du séquestre jusqu'à résolution. L'équipe Cachetify tranche en cas de désaccord.
                  </p>
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value as IncidentReason)}
                    className="w-full p-2 rounded-lg border border-border bg-input-background text-sm"
                  >
                    {DISPUTE_REASONS.map((r) => (
                      <option key={r} value={r}>{DISPUTE_REASON_LABELS[r]}</option>
                    ))}
                  </select>
                  <textarea
                    value={disputeDescription}
                    onChange={(e) => setDisputeDescription(e.target.value)}
                    placeholder="Décrivez le problème..."
                    className="w-full p-2 rounded-lg border border-border bg-input-background text-sm min-h-[70px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={handleRaiseDispute} disabled={incidentActionLoading || !disputeDescription.trim()}>
                      Ouvrir le litige
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowDisputeForm(false)}>Annuler</Button>
                  </div>
                </div>
              )}

              {showHoldForm && (
                <div className="p-4 rounded-lg border border-border bg-muted/30 mb-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Ne gèle rien tant que l'autre partie n'a pas accepté — sans faute alléguée, juste une pause négociée.
                  </p>
                  <textarea
                    value={holdDescription}
                    onChange={(e) => setHoldDescription(e.target.value)}
                    placeholder="Ex : report de 2 semaines le temps de finaliser un document..."
                    className="w-full p-2 rounded-lg border border-border bg-input-background text-sm min-h-[70px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleProposeHold} disabled={incidentActionLoading || !holdDescription.trim()}>
                      Proposer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowHoldForm(false)}>Annuler</Button>
                  </div>
                </div>
              )}

              {incidentActionError && (
                <p className="text-xs text-destructive mb-3 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{incidentActionError}</p>
              )}

              {incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun litige ni pause sur ce contrat.</p>
              ) : (
                <div className="space-y-2">
                  {incidents.map((incident) => (
                    <div key={incident.id} className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-bold">
                            {incident.type === 'DISPUTE' ? 'Litige' : 'Pause'} — {DISPUTE_REASON_LABELS[incident.reason]}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{incident.description}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">{INCIDENT_STATUS_LABELS[incident.status]}</Badge>
                      </div>
                      {incident.resolution && (
                        <p className="text-xs text-green-700 dark:text-green-400 mt-2 pt-2 border-t border-border/60">
                          Résolution : {incident.resolution}
                        </p>
                      )}
                      {incident.type === 'HOLD' && incident.status === 'OPEN' && incident.raisedByUserId !== user?.id && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-border/60">
                          <Button size="sm" variant="outline" onClick={() => handleRespondToHold(incident.id, true)} disabled={incidentActionLoading}>Accepter</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRespondToHold(incident.id, false)} disabled={incidentActionLoading}>Refuser</Button>
                        </div>
                      )}
                      {incident.status === 'OPEN' && incident.raisedByUserId === user?.id && (
                        <div className="mt-2 pt-2 border-t border-border/60">
                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => handleWithdrawIncident(incident.id)} disabled={incidentActionLoading}>Retirer</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content: Document Preview */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-0 overflow-hidden shadow-lg border-none bg-white">
                {/* Document toolbar */}
                <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-2">Document Officiel — Cachetify</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!contract.metadata?.isExternalPdf && <AiBadge />}
                    <span className="text-[10px] text-muted-foreground">PDF certifié blockchain</span>
                    {/* Previously this verification link existed only inside a downloaded PDF
                        certificate (see pdfGenerator.ts's QR code) — nothing on-screen pointed
                        anyone at the same public, no-account verification page, even though the
                        page itself has existed since Point 3.
                        Le jeton public (publicToken), jamais contractId/id : la route de
                        vérification ne connaît que ce jeton non devinable — voir
                        getPublicVerification côté serveur et le mémoire, chapitre 2. Un contrat
                        créé avant la migration l'ayant introduit n'en a pas encore : dans ce
                        cas précis, pas de lien plutôt qu'un lien cassé. */}
                    {contract.publicToken && (
                      <Link
                        href={`/verify/${contract.publicToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                      >
                        <QrCode className="w-3 h-3" />
                        Vérifier ce contrat
                      </Link>
                    )}
                  </div>
                </div>

                {contract.metadata?.isExternalPdf ? (
                  <div>
                    <div className="flex items-center gap-2 py-2 px-6 bg-gray-50 border-b border-gray-100">
                      <Lock className="w-3 h-3 text-gray-400 shrink-0" />
                      <p className="text-[10px] text-gray-500">
                        Aperçu en lecture seule — ce document importé ne peut pas être modifié depuis Cachetify.
                      </p>
                    </div>
                    <PdfDocumentViewer
                      url={ipfsApi.getProxyUrl(contract.ipfsHash)}
                      fallbackUrl={ipfsApi.getPublicUrl(contract.ipfsHash)}
                      className="min-h-[900px]"
                    />
                    {/* The AI-generated branch below has always carried this footer; an
                        imported PDF is rendered as a bare, unbranded file inside the iframe
                        with nothing around it confirming it's the same certified, blockchain-
                        anchored document Cachetify tracks — this closes that gap. */}
                    <div className="border-t border-gray-100 bg-white py-4 px-6">
                      <p className="text-[9px] text-gray-400 text-center">
                        Document original certifié par Cachetify • Ancré sur Polygon Blockchain
                        
                      </p>
                    </div>
                  </div>
                ) : (
                  /* A4-style paper with shadow for premium feel */
                  <div className="bg-gray-100 p-6 min-h-[900px]">
                    <div className="max-w-[800px] mx-auto bg-white shadow-xl rounded-sm border border-gray-200">
                      {/* Watermark header */}
                      <div
                        className="border-b border-gray-100 flex items-center justify-between"
                        style={{ paddingLeft: 64, paddingRight: 64, paddingTop: 40, paddingBottom: 16 }}
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-purple-400" />
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Cachetify</span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          Créé le {new Date(contract.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Contract body with markdown rendering */}
                      <div style={{ paddingLeft: 64, paddingRight: 64, paddingTop: 40, paddingBottom: 40, minHeight: 700 }}>
                        <ContractMarkdownRenderer content={contract.metadata?.content || ""} />
                      </div>

                      {/* Footer */}
                      <div
                        className="border-t border-gray-100"
                        style={{ paddingLeft: 64, paddingRight: 64, paddingTop: 16, paddingBottom: 32 }}
                      >
                        <p className="text-[9px] text-gray-400 text-center">
                          Document généré et certifié par Cachetify • Ancré sur Polygon Blockchain
                          
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Sidebar: Metadata & Signers */}
            <div className="space-y-6 lg:sticky lg:top-8 lg:self-start lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pr-1">
              {(canSign || currentUserSigner?.hasSigned) && (
                <SignaturePanel
                  hasSigned={!!currentUserSigner?.hasSigned}
                  onSign={handleOpenSign}
                  isSigning={isSigning}
                />
              )}

              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Signataires
                  </h3>
                  {signerRows.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {signedCount}/{signerRows.length}
                    </Badge>
                  )}
                </div>

                {signerRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun signataire pour ce contrat.</p>
                ) : (
                  <div className="space-y-3">
                    {signerRows.map((signer) => {
                      // A registered signer can't actually sign until the contract itself is
                      // deployed on-chain — before that, "En attente de signature" falsely
                      // implies signing is underway when the real blocker may be a completely
                      // different signatory who hasn't even registered yet.
                      const statusLabel = signer.hasSigned
                        ? "Signé"
                        : signer.isRegistered
                          ? (isDeployed ? "En attente de signature" : "Inscrit — en attente du déploiement")
                          : "En attente d'inscription"
                      const statusColor = signer.hasSigned
                        ? "text-green-600"
                        : signer.isRegistered
                          ? (isDeployed ? "text-yellow-600" : "text-blue-500")
                          : "text-orange-500"
                      const StatusIcon = signer.hasSigned ? CheckCircle2 : signer.isRegistered ? Clock : UserX
                      const feedback = resendFeedback?.id === signer.signatoryId ? resendFeedback : null

                      return (
                        <div key={signer.key} className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                                signer.hasSigned
                                  ? "bg-green-500/20 text-green-600"
                                  : signer.isRegistered
                                    ? (isDeployed ? "bg-yellow-500/20 text-yellow-600" : "bg-blue-500/20 text-blue-500")
                                    : "bg-orange-500/20 text-orange-500"
                              )}
                            >
                              <StatusIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate" title={signer.name}>{signer.name}</p>
                              {signer.email && signer.email !== signer.name && (
                                <p className="text-[11px] text-muted-foreground truncate" title={signer.email}>{signer.email}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {roleLabel(signer.role)}
                              </p>
                              <p className={cn("text-[11px] mt-1 flex items-center gap-1 font-medium", statusColor)}>
                                <StatusIcon className="w-3 h-3 shrink-0" />
                                {signer.hasSigned && signer.signedAt
                                  ? `Signé le ${new Date(signer.signedAt * 1000).toLocaleDateString()}`
                                  : statusLabel}
                              </p>
                            </div>
                          </div>

                          {isCreator && signer.resendKind && signer.signatoryId && (
                            <div className="mt-2.5 pt-2.5 border-t border-border/60" style={{ minWidth: 0 }}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-full text-[11px] gap-1.5"
                                disabled={resendingId === signer.signatoryId}
                                onClick={() => handleResendEmail(signer.signatoryId!)}
                              >
                                {resendingId === signer.signatoryId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Mail className="w-3 h-3" />
                                )}
                                {signer.resendKind === "invite" ? "Renvoyer l'invitation" : "Renvoyer la demande de signature"}
                              </Button>
                            </div>
                          )}
                          {feedback && (
                            <p className={cn(
                              "text-[10px] mt-1.5",
                              feedback.type === "success" ? "text-green-600" : "text-destructive"
                            )}>
                              {feedback.text}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="font-bold flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-primary" />
                  Détails Blockchain
                </h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Statut</span>
                    <span className="font-medium text-xs font-mono">{contract.status}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">Contrat certifié</span>
                  </div>
                  {contract.metadata?.expiresAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Expire le</span>
                      <span className="font-medium text-xs">
                        {new Date(contract.metadata.expiresAt * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <span className="text-muted-foreground block mb-1.5">Référence de stockage</span>
                    {contract.ipfsHash ? (
                      <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5 border border-border/60" style={{ minWidth: 0 }}>
                        <span
                          className="font-mono text-[11px]"
                          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" }}
                          title={contract.ipfsHash}
                        >
                          {contract.ipfsHash}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard('ipfsHash', contract.ipfsHash)}
                          className="shrink-0 p-1 rounded hover:bg-muted-foreground/10 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Copier la référence"
                        >
                          {copiedField === 'ipfsHash' ? (
                            <Check className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-[10px] text-muted-foreground mb-4">
                      Ce contrat est immuable et ancré sur le réseau Polygon. Chaque signature est une transaction vérifiable.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" className="w-full text-xs gap-2" asChild>
                        <a href={ipfsApi.getPublicUrl(contract.ipfsHash || '')} target="_blank" rel="noopener noreferrer">
                          <Download className="w-3 h-3" />
                          Voir le document
                        </a>
                      </Button>
                    </div>
                  </div>

                  {/* Sans ce fichier précis, personne ne peut se servir de "Vérifier un
                      fichier" sur la page publique : ni le certificat (mise en forme
                      différente), ni un export quelconque ne correspondent octet pour octet à
                      ce qui a été réellement ancré sur la blockchain. */}
                  <div className="pt-4 border-t">
                    <p className="text-xs font-semibold mb-1">Document à conserver pour la vérification</p>
                    <p className="text-[10px] text-muted-foreground mb-3">
                      Gardez ce fichier de côté. Vous pourrez le redéposer plus tard sur la page de vérification publique pour prouver que le contrat n'a pas été modifié.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full text-xs gap-2"
                      asChild={!!contract.metadata?.isExternalPdf}
                      onClick={
                        contract.metadata?.isExternalPdf
                          ? undefined
                          : () => {
                              const fileBaseName = buildContractFileBaseName({
                                documentType: contract.metadata?.type || "Contrat",
                                partyNames: [contract.metadata?.parties?.partyA?.name, contract.metadata?.parties?.partyB?.name].filter(Boolean),
                                createdAt: new Date(contract.createdAt),
                                reference: contract.reference,
                              });
                              downloadTextForVerification(contract.metadata?.content || "", `${fileBaseName}-a-conserver.txt`);
                            }
                      }
                    >
                      {contract.metadata?.isExternalPdf ? (
                        <a href={ipfsApi.getDownloadUrl(contract.ipfsHash || '')}>
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
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-primary/5 border-primary/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Génération IA</h4>
                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="w-1 self-stretch bg-primary/20 rounded shrink-0"></div>
                    <div>
                      <p className="text-[11px] font-bold">Contrat généré par IA</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Modèle GPT-OSS 120B via Groq — optimisé pour la rédaction juridique.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-1 self-stretch bg-green-500/20 rounded shrink-0"></div>
                    <div>
                      <p className="text-[11px] font-bold text-green-700">Certifié &amp; ancré</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Hash SHA-256 calculé, document chiffré et empreinte ancrée sur Polygon.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* KYC Signature Modal */}
      {contract && (
        <KycSignatureModal
          open={showKycModal}
          onClose={() => setShowKycModal(false)}
          onConfirm={handleSign}
          contractTitle={contract.title}
          contractContent={contract.metadata?.content || ""}
          originalHash={contract.metadata?.sha256Hash || ""}
          ipfsCid={contract.ipfsHash || ""}
          ipfsUrl={contract.ipfsHash ? ipfsApi.getPublicUrl(contract.ipfsHash) : undefined}
          signerName={contract.metadata?.signers?.find((s: any) => s.address?.toLowerCase() === account?.toLowerCase())?.name || account || "Signataire"}
          signerEmail={contract.metadata?.signers?.find((s: any) => s.address?.toLowerCase() === account?.toLowerCase())?.email}
          country={contract.metadata?.country}
          customLegalBasis={contract.metadata?.customLegalBasis}
          documentType={contract.metadata?.type || "Contrat"}
          reference={contract.reference}
          createdAt={contract.createdAt}
          partyNames={[contract.metadata?.parties?.partyA?.name, contract.metadata?.parties?.partyB?.name]}
          downloadUrl={contract.ipfsHash ? ipfsApi.getDownloadUrl(contract.ipfsHash) : undefined}
        />
      )}

      {/* Ce contrat exige une identité vérifiée pour signer, et cet utilisateur — créateur ou
          simple signataire, peu importe — ne l'est pas encore. Bloque avant même d'ouvrir le
          flux de signature, avec un accès direct à la vérification. */}
      <Dialog open={showVerifyBeforeSign} onOpenChange={setShowVerifyBeforeSign}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-base font-bold">Identité vérifiée requise</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Le créateur de ce contrat exige que chaque signataire ait vérifié son identité avant de signer. Vérifiez la vôtre pour continuer — une seule fois, valable pour tous vos contrats futurs.
          </DialogDescription>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowVerifyBeforeSign(false)}>Annuler</Button>
            <Button className="flex-1" onClick={() => { setShowVerifyBeforeSign(false); setShowIdentityVerification(true) }}>Vérifier maintenant</Button>
          </div>
        </DialogContent>
      </Dialog>
      <IdentityVerificationModal
        open={showIdentityVerification}
        onClose={() => setShowIdentityVerification(false)}
        onVerified={() => setShowKycModal(true)}
      />
    </>
  )
}

function EscrowStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING_DEPOSIT: { label: "En attente de dépôt", className: "bg-muted text-muted-foreground border-border" },
    DEPOSITED: { label: "Fonds déposés", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    RELEASED: { label: "Libéré", className: "bg-green-500/10 text-green-600 border-green-500/20" },
    DISPUTED: { label: "Bloqué / litige", className: "bg-destructive/10 text-destructive border-destructive/20" },
    REFUNDED: { label: "Remboursé", className: "bg-muted text-muted-foreground border-border" },
  }
  const c = config[status] || { label: status, className: "bg-muted text-muted-foreground border-border" }
  return <Badge className={c.className}>{c.label}</Badge>
}
