"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShieldCheck } from "lucide-react"
import { kycApi } from "@/lib/api/kyc"
import { useAuthStore } from "@/hooks/useAuth"
import { IdentityVerificationModal } from "./identity-verification-modal"

/**
 * The ONLY time this app asks about identity verification without the user having triggered
 * it themselves — shown exactly once per account (User.hasSeenKycPrompt, a DB flag so it
 * doesn't reappear on another device either), never again after "Plus tard" or after
 * verifying. Every other nudge (the dashboard card, the sidebar badge) is a permanent but
 * non-interruptive presence, not a repeated ask — see the KYC design notes on why a
 * recurring per-login modal was deliberately rejected.
 */
export function KycFirstPrompt() {
  const { user, setUser } = useAuthStore()
  const [dismissed, setDismissed] = useState(false)
  const [showVerify, setShowVerify] = useState(false)

  const shouldShow = !!user && !user.hasSeenKycPrompt && user.kycStatus === "NOT_VERIFIED" && !dismissed

  const dismiss = () => {
    setDismissed(true) // optimistic — don't wait on the network to stop showing it
    kycApi.dismissPrompt().catch(() => {})
    if (user) setUser({ ...user, hasSeenKycPrompt: true })
  }

  if (!shouldShow) return null

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) dismiss() }}>
        <DialogContent className="max-w-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-tight">Vérifiez votre identité</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Une seule fois, valable pour tous vos contrats futurs.
              </DialogDescription>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Ça renforce la valeur légale de vos signatures. Vous pouvez le faire maintenant ou plus tard depuis votre tableau de bord.
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={dismiss}>Plus tard</Button>
            <Button className="flex-1" onClick={() => { dismiss(); setShowVerify(true) }}>Vérifier maintenant</Button>
          </div>
        </DialogContent>
      </Dialog>
      <IdentityVerificationModal open={showVerify} onClose={() => setShowVerify(false)} />
    </>
  )
}
