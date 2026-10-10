"use client";

import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ExternalLink, ShieldCheck, AlertTriangle, Loader2, Copy, Check } from "lucide-react";
import { getContractNFT } from "@/lib/web3/contracts";

interface NFTCardProps {
  tokenId: string;
  contractId: string;
  title: string;
  effectiveDate?: string;
  ipfsUrl?: string;
  /** The underlying contract's current status. The NFT itself never changes after mint —
   *  this only controls the notice shown alongside it, so a contract that's since been
   *  terminated/disputed doesn't look identical to one still fully in force. */
  contractStatus?: string;
}

const STALE_STATUS_LABELS: Record<string, string> = {
  DISPUTED: "Ce contrat fait actuellement l'objet d'un litige.",
  TERMINATED: "Ce contrat a été résilié.",
  CANCELLED: "Ce contrat a été annulé.",
  RESIGNED: "Ce contrat a fait l'objet d'une démission.",
};

interface OnChainProof {
  owner: string;
  timestamp: number;
  isActive: boolean;
  signers: string[];
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Same backend the rest of the app already talks to (frontend/src/lib/api/client.ts) — this
 *  is what tokenURI() on ContractNFT.sol now points external wallets/explorers at too, so the
 *  in-app card and any outside viewer end up showing the exact same certificate image. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function NFTCard({
  tokenId,
  contractId,
  title,
  effectiveDate,
  ipfsUrl,
  contractStatus,
}: NFTCardProps) {
  const staleNotice = contractStatus ? STALE_STATUS_LABELS[contractStatus] : undefined;
  const [proof, setProof] = useState<OnChainProof | null>(null)
  const [proofError, setProofError] = useState(false)
  const [loadingProof, setLoadingProof] = useState(true)
  const [copied, setCopied] = useState(false)

  // "Détails du NFT" used to just re-display props the parent already had, with the only
  // functional element being a link back out to IPFS — nothing here actually proved this
  // was a real, minted, on-chain NFT. This reads the certificate directly from the
  // ContractNFT contract (owner, mint timestamp, active flag, registered signers).
  useEffect(() => {
    let cancelled = false
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL
    if (!rpcUrl || !tokenId) {
      setLoadingProof(false)
      setProofError(true)
      return
    }
    ;(async () => {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const nft = getContractNFT(provider)
        const [owner, [ipfsHash, timestamp, isActive, signers]] = await Promise.all([
          nft.ownerOf(tokenId),
          nft.getContractProof(tokenId),
        ])
        if (cancelled) return
        setProof({ owner, timestamp: Number(timestamp), isActive, signers: [...signers] })
      } catch (err) {
        console.warn("Failed to fetch on-chain NFT proof:", err)
        if (!cancelled) setProofError(true)
      } finally {
        if (!cancelled) setLoadingProof(false)
      }
    })()
    return () => { cancelled = true }
  }, [tokenId])

  const copyOwner = async () => {
    if (!proof) return
    try {
      await navigator.clipboard.writeText(proof.owner)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <Badge variant="outline" className="gap-1 border-[#FFC107] text-[#FFC107]">
          <ShieldCheck className="size-3.5" /> Certificat #{tokenId}
        </Badge>
        <span className="text-xs text-muted-foreground">ID: {contractId}</span>
      </div>

      {staleNotice && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 mb-3">
          <AlertTriangle className="size-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-[11px] text-destructive leading-relaxed">
            {staleNotice} Ce certificat prouve la signature d'origine, pas l'état actuel du contrat.
          </p>
        </div>
      )}

      {/* The certificate image itself — same one any external wallet/explorer now sees via
          tokenURI(), generated server-side from the same on-chain proof read below. */}
      <div className="mb-3 rounded-lg overflow-hidden border border-border/60 bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG, not an optimizable local asset */}
        <img
          src={`${API_URL}/api/nft/${tokenId}/image.svg`}
          alt={`Certificat #${tokenId}`}
          className="w-full aspect-square object-cover"
          loading="lazy"
        />
      </div>

      <h4 className="font-semibold text-base mb-2 line-clamp-1">{title}</h4>

      {effectiveDate && (
        <p className="text-xs text-muted-foreground mb-3">
          Finalisé le : {new Date(effectiveDate).toLocaleDateString()}
        </p>
      )}

      {/* Live on-chain proof — this is the actual "detail" the button promises */}
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Vérification on-chain
        </p>
        {loadingProof ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="size-3.5 animate-spin" /> Lecture du certificat sur la blockchain...
          </div>
        ) : proofError || !proof ? (
          <p className="text-[11px] text-muted-foreground">
            Vérification on-chain indisponible pour le moment — le certificat existe, mais ses détails n'ont pas pu être lus depuis la blockchain à l'instant.
          </p>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            {/* "Créateur du contrat", pas "Propriétaire" : ce champ affiche toujours
                l'adresse du créateur (seul destinataire du mint) — sur un contrat à
                plusieurs signataires, "propriétaire" laissait croire à un co-signataire que
                quelqu'un d'autre "possédait" son propre contrat. */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Créateur du contrat</span>
              <button
                type="button"
                onClick={copyOwner}
                className="flex items-center gap-1 font-mono text-foreground hover:text-primary transition-colors"
                title={proof.owner}
              >
                {truncateAddress(proof.owner)}
                {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Ancré le</span>
              <span className="text-foreground">{new Date(proof.timestamp * 1000).toLocaleString('fr-FR')}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Signataires enregistrés</span>
              <span className="text-foreground">{proof.signers.length}</span>
            </div>
          </div>
        )}
      </div>

      {ipfsUrl && (
        <a href={ipfsUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
            <ExternalLink className="size-3.5" /> Voir le document
          </Button>
        </a>
      )}
    </div>
  );
}
