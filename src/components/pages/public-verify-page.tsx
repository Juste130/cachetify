"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { contractsApi } from "@/lib/api/contracts";
import { getContractManager, getReadOnlyProvider } from "@/lib/web3/contracts";
import { mapOnChainStatus, getStatusBadgeVariant } from "@/lib/contract-status";
import { computeFileSHA256 } from "@/lib/utils/hash";
import { SealMark } from "@/components/layout/seal-mark";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { formatReference } from "@/lib/utils/contractNaming";
import { CheckCircle2, Clock, XCircle, ShieldCheck, Upload, FileCheck2, Loader2 } from "lucide-react";

interface PublicVerifyPageProps {
  id: string;
}

interface VerificationData {
  reference: number;
  status: string;
  createdAt: string;
  contractId: number | null;
  sha256Hash: string | null;
  isExternalPdf: boolean;
  verifiedOnChain: boolean;
  signatories: { initials: string | null; hasSigned: boolean }[];
  /** Empreinte du certificat officiel (le PDF avec code QR) — distincte de sha256Hash (le
   *  contenu brut). Un utilisateur peut redéposer l'un ou l'autre selon ce qu'il a gardé ;
   *  les deux doivent être reconnus comme authentiques. */
  certificateSha256Hash: string | null;
}

/** Résultat de la relecture indépendante, faite depuis CE navigateur, sans passer par notre
 *  serveur — c'est cette relecture-là, pas celle du serveur, qui prouve que la vérification
 *  ne dépend pas de Cachetify (voir mémoire, chapitre 3). */
interface ChainReadResult {
  sha256Hash: string;
  status: string;
  signedCount: number;
  totalCount: number;
}

export function PublicVerifyPage({ id }: PublicVerifyPageProps) {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chainResult, setChainResult] = useState<ChainReadResult | null>(null);
  const [chainError, setChainError] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);

  const [fileResult, setFileResult] = useState<"match-content" | "match-certificate" | "mismatch" | null>(null);
  const [fileChecking, setFileChecking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    contractsApi.getPublicVerification(id)
      .then(setData)
      .catch(() => setError("Ce contrat est introuvable, ou le lien utilisé n'est plus valide."))
      .finally(() => setLoading(false));
  }, [id]);

  // Relecture indépendante depuis le navigateur : aucune requête vers notre serveur ici, ce
  // fournisseur parle directement au réseau Polygon. Best-effort — un échec (RPC public
  // temporairement indisponible) ne doit jamais bloquer la page, seulement la laisser afficher
  // les informations déjà servies par notre serveur (avec la mention correspondante).
  useEffect(() => {
    if (!data?.contractId) return;
    setChainLoading(true);
    (async () => {
      try {
        const provider = getReadOnlyProvider();
        const contractManager = getContractManager(provider);
        const details = await contractManager.getContractDetails(data.contractId as number);
        const signers = details.signers as { hasSignedContract: boolean }[];
        setChainResult({
          sha256Hash: details.contractData.sha256Hash as string,
          status: mapOnChainStatus(details.contractData.status as number),
          signedCount: signers.filter((s) => s.hasSignedContract).length,
          totalCount: signers.length,
        });
      } catch {
        setChainError(true);
      } finally {
        setChainLoading(false);
      }
    })();
  }, [data?.contractId]);

  // L'empreinte confirmée par CE navigateur prime sur celle simplement servie par notre
  // serveur, dès qu'elle est disponible.
  const trustedHash = chainResult?.sha256Hash || data?.sha256Hash || null;
  // Le certificat (PDF avec code QR) est traité comme le document définitif dans la vraie
  // vie : le texte brut et le certificat n'ont pas la même empreinte (mise en forme,
  // en-tête, code QR ajoutés), donc les deux sont acceptés en dépôt ici.
  const certificateHash = data?.certificateSha256Hash || null;

  async function handleFileSelected(file: File) {
    if (!trustedHash && !certificateHash) return;
    setFileChecking(true);
    setFileResult(null);
    try {
      const hash = (await computeFileSHA256(file)).toLowerCase();
      if (trustedHash && hash === trustedHash.toLowerCase()) {
        setFileResult("match-content");
      } else if (certificateHash && hash === certificateHash.toLowerCase()) {
        setFileResult("match-certificate");
      } else {
        setFileResult("mismatch");
      }
    } finally {
      setFileChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      <header className="border-b border-border bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-2">
          <SealMark className="w-8 h-8 shrink-0" />
          <span className="text-[#FFC107] text-lg font-bold tracking-tight">Cachetify</span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-16">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold mb-1">Vérification de contrat</h1>
            <p className="text-sm text-muted-foreground">
              Cette page confirme l&apos;existence et le statut d&apos;un contrat, sans compte. L&apos;empreinte affichée reste consultable sur la blockchain même si Cachetify disparaît.
            </p>
          </div>

          {loading ? (
            <Card className="p-10 flex justify-center">
              <Spinner size="md" label="Recherche du contrat…" />
            </Card>
          ) : error || !data ? (
            <Card className="p-8 text-center">
              <XCircle className="w-8 h-8 text-destructive mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </Card>
          ) : (
            <>
              <Card className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-lg leading-snug">Contrat {formatReference(data.reference)}</h2>
                  </div>
                  <StatusBadge status={getStatusBadgeVariant(chainResult?.status || data.status)} className="shrink-0" />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Créé le</p>
                    <p>{new Date(data.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Ancrage blockchain</p>
                    <p>{data.contractId ? `Polygon Amoy · N° ${data.contractId}` : "En attente de dépôt"}</p>
                  </div>
                </div>

                {/* Ce bandeau reflète ce que CE navigateur a lui-même reconfirmé en parlant
                    directement à la blockchain — jamais une simple affirmation de notre
                    serveur. C'est là toute la différence entre "on nous dit que" et "on l'a
                    vérifié soi-même". */}
                {data.contractId && (
                  chainResult ? (
                    <div className="flex items-center gap-1.5 text-xs text-[#4CAF50] font-medium bg-[#4CAF50]/10 rounded-lg px-3 py-2">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      Reconfirmé par votre navigateur, en direct sur la blockchain Polygon — sans passer par Cachetify
                    </div>
                  ) : chainLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> Reconfirmation en cours sur la blockchain…
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
                      {chainError
                        ? "La reconfirmation directe sur la blockchain a échoué pour le moment (réessayez plus tard). Les informations ci-dessous viennent de Cachetify."
                        : "Statut servi par Cachetify."}
                    </div>
                  )
                )}

                {trustedHash && (
                  <div className="text-sm">
                    <p className="text-muted-foreground mb-1">Empreinte numérique du document</p>
                    <p className="font-mono text-xs bg-muted px-2 py-1.5 rounded break-all">{trustedHash}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Signataires</p>
                  <div className="space-y-2">
                    {data.signatories.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted rounded-lg px-3 py-2">
                        <span>{s.initials || "Signataire"}</span>
                        {s.hasSigned ? (
                          <span className="flex items-center gap-1 text-[#4CAF50] font-medium text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Signé
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground text-xs">
                            <Clock className="w-3.5 h-3.5" /> En attente
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {(trustedHash || certificateHash) && (
                <Card className="p-6 mt-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Vérifier un document</h3>
                    <p className="text-xs text-muted-foreground">
                      Vous avez le fichier de ce contrat, ou le certificat téléchargé (avec code QR) ? Déposez-le ici : votre navigateur calcule son empreinte et la compare, sans jamais nous envoyer le fichier.
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={fileChecking}
                  >
                    {fileChecking ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Vérification en cours…
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" /> Choisir un fichier à vérifier
                      </>
                    )}
                  </Button>

                  {fileResult === "match-certificate" && (
                    <div className="flex items-center gap-1.5 text-sm text-[#4CAF50] font-medium bg-[#4CAF50]/10 rounded-lg px-3 py-2">
                      <FileCheck2 className="w-4 h-4 shrink-0" />
                      Ce fichier correspond au certificat officiel de ce contrat (avec code QR).
                    </div>
                  )}
                  {fileResult === "match-content" && (
                    <div className="flex items-center gap-1.5 text-sm text-[#4CAF50] font-medium bg-[#4CAF50]/10 rounded-lg px-3 py-2">
                      <FileCheck2 className="w-4 h-4 shrink-0" />
                      Ce fichier correspond au contenu original de ce contrat.
                    </div>
                  )}
                  {fileResult === "mismatch" && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive font-medium bg-destructive/10 rounded-lg px-3 py-2">
                      <XCircle className="w-4 h-4 shrink-0" />
                      Attention : ce document ne correspond pas à l'original. Il a peut-être été modifié.
                    </div>
                  )}
                </Card>
              )}
            </>
          )}

          <p className="text-xs text-muted-foreground text-center mt-6">
            <Link href="/" className="hover:underline">Cachetify</Link> — contrats ancrés sur la blockchain Polygon.
          </p>
        </div>
      </main>
    </div>
  );
}
