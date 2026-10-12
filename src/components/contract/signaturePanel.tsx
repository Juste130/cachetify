"use client";

import React from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { CheckCircle, ShieldAlert, Loader2 } from "lucide-react";

interface SignaturePanelProps {
  hasSigned: boolean;
  onSign: () => void;
  isSigning?: boolean;
}

export function SignaturePanel({
  hasSigned,
  onSign,
  isSigning = false,
}: SignaturePanelProps) {
  if (hasSigned) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-emerald-600">
          <CheckCircle className="size-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Vous avez signé ce contrat</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Votre signature a été enregistrée sur la blockchain Polygon.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2 text-amber-600 font-semibold mb-3">
        <ShieldAlert className="size-5 shrink-0" />
        Signature Requise
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Veuillez réviser attentivement les termes du contrat avant d'apposer votre signature numérique sécurisée via Privy.
      </p>
      <Button
        onClick={onSign}
        disabled={isSigning}
        className="w-full bg-[#FFC107] text-[#212121] hover:bg-[#FFB300] font-semibold gap-2"
      >
        {isSigning ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Signature en cours...
          </>
        ) : (
          <>
            <CheckCircle className="size-4" />
            Signer le contrat
          </>
        )}
      </Button>
      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        Action immédiate et définitive, ancrée sur la blockchain.
      </p>
    </Card>
  );
}
