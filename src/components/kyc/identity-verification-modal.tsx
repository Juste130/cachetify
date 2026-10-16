"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShieldCheck, Upload, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react"
import { kycApi } from "@/lib/api/kyc"
import { usersApi } from "@/lib/api/users"
import { useAuthStore } from "@/hooks/useAuth"

interface IdentityVerificationModalProps {
  open: boolean
  onClose: () => void
  /** Called once the status actually resolves to VERIFIED — lets a caller that opened this
   *  purely to satisfy a "must be verified to continue" gate proceed automatically. */
  onVerified?: () => void
}

const COUNTRIES = ["Bénin", "Togo", "Côte d'Ivoire", "Sénégal"]

// Free-text values sent as Smile ID's `id_type` — CONFIRM the exact strings your Smile ID
// partner portal expects for each country before going live; this codebase has no live
// credentials to verify them against a real submission (same caveat as job_type in
// backend/services/kyc.js).
const ID_TYPES = [
  { value: "NATIONAL_ID", label: "Carte nationale d'identité" },
  { value: "PASSPORT", label: "Passeport" },
  { value: "DRIVERS_LICENSE", label: "Permis de conduire" },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the "data:image/...;base64," prefix — the backend/Smile ID expect raw base64.
      resolve(result.split(",")[1] || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type Step = "form" | "pending" | "verified" | "failed"

/**
 * One-time-per-account identity verification — never per contract (see the KYC design
 * notes: once VERIFIED, this covers every contract this person signs from now on). Capture
 * here is deliberately simple (two file inputs, not a guided liveness-detection widget):
 * this codebase has no live Smile ID partner credentials to test a fancier capture SDK
 * against, and a broken third-party web component would fail worse than a plain file input.
 */
export function IdentityVerificationModal({ open, onClose, onVerified }: IdentityVerificationModalProps) {
  const { setUser } = useAuthStore()
  const [step, setStep] = useState<Step>("form")
  const [country, setCountry] = useState(COUNTRIES[0])
  const [idType, setIdType] = useState(ID_TYPES[0].value)
  const [idFile, setIdFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mockMode, setMockMode] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reset = () => {
    setStep("form")
    setIdFile(null)
    setSelfieFile(null)
    setError(null)
    setSubmitting(false)
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const handleClose = () => {
    // Only stop the in-flight poll here — NOT a full reset. Resetting `step` back to "form"
    // at the same time the dialog starts closing made the success/pending screen visibly
    // flash back to the blank form during Radix's 200ms exit animation (dialog.tsx keeps
    // the content mounted for that whole duration). The next open() effect below now owns
    // resetting state, so it only ever happens while the dialog is invisible.
    if (pollRef.current) clearInterval(pollRef.current)
    onClose()
  }

  // Fresh state (and a fresh read of whether Smile ID mock mode is active) every time the
  // dialog is opened — not on close, see handleClose above.
  useEffect(() => {
    if (!open) return
    reset()
    kycApi.getStatus().then((s) => setMockMode(!!s.mockMode)).catch(() => {})
  }, [open])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await kycApi.getStatus()
        if (status.kycStatus === "VERIFIED") {
          if (pollRef.current) clearInterval(pollRef.current)
          setStep("verified")
          // Silent refresh — no full-screen spinner (see setUser's own doc comment) — so the
          // dashboard card / sidebar badge reflect this immediately without a reload.
          usersApi.getProfile().then((res) => setUser(res.user)).catch(() => {})
          onVerified?.()
        } else if (status.kycStatus === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current)
          setStep("failed")
        }
      } catch {
        // Transient network hiccup — next tick tries again, no need to surface this.
      }
    }, 3000)
  }

  const handleSubmit = async () => {
    if (!idFile || !selfieFile) {
      setError("La pièce d'identité et le selfie sont tous les deux requis.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const [idFrontBase64, selfieBase64] = await Promise.all([
        fileToBase64(idFile),
        fileToBase64(selfieFile),
      ])
      await kycApi.submit({ country, idType, idFrontBase64, selfieBase64 })
      setStep("pending")
      startPolling()
    } catch (err: any) {
      setError(err.message || "La soumission a échoué. Réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold leading-tight">Vérifier mon identité</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Renforce la valeur légale de vos signatures — une seule fois, valable pour tous vos contrats futurs.
            </DialogDescription>
          </div>
        </div>

        {mockMode && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              <span className="font-bold">Mode démo :</span> aucun prestataire de vérification n'est configuré. Cette vérification est simulée et approuvée automatiquement — aucun document n'est réellement contrôlé.
            </p>
          </div>
        )}

        {step === "form" && (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Pays de la pièce d'identité</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type de pièce</Label>
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Photo de la pièce d'identité (recto)</Label>
              <label className="flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors text-sm">
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{idFile?.name || "Choisir une photo..."}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="space-y-2">
              <Label>Selfie</Label>
              <label className="flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors text-sm">
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{selfieFile?.name || "Choisir une photo..."}</span>
                <input type="file" accept="image/*" capture="user" className="hidden"
                  onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} />
              </label>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Vos photos sont transmises à notre prestataire de vérification et ne sont jamais conservées sur nos serveurs.
            </p>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={handleClose} disabled={submitting}>Annuler</Button>
              <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {submitting ? "Envoi..." : "Vérifier"}
              </Button>
            </div>
          </div>
        )}

        {step === "pending" && (
          <div className="text-center py-8">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <h3 className="font-bold mb-1">Vérification en cours...</h3>
            <p className="text-sm text-muted-foreground">Ça prend généralement moins d'une minute. Vous pouvez fermer cette fenêtre, on vous préviendra.</p>
            <Button variant="outline" className="mt-6" onClick={handleClose}>Fermer</Button>
          </div>
        )}

        {step === "verified" && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="font-bold mb-1">Identité vérifiée !</h3>
            <p className="text-sm text-muted-foreground">Vos futures signatures bénéficient désormais du niveau de preuve renforcé.</p>
            <Button className="mt-6 w-full" onClick={handleClose}>Fermer</Button>
          </div>
        )}

        {step === "failed" && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-7 h-7 text-destructive" />
            </div>
            <h3 className="font-bold mb-1">La vérification a échoué</h3>
            <p className="text-sm text-muted-foreground mb-6">La pièce n'a pas pu être validée (photo illisible, informations non concordantes...). Vous pouvez réessayer.</p>
            <Button className="w-full" onClick={reset}>Réessayer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
