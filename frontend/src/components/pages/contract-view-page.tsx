"use client"

import { useState, useEffect } from "react"
import { Card } from "../ui/card"
import { AiBadge } from "../ui/ai-badge"
import { Badge } from "../ui/badge"
import { Loader2, AlertCircle, Shield, CheckCircle2 } from "lucide-react"
import { contractsApi, type Contract } from "@/lib/api/contracts"
import { ipfsApi } from "@/lib/api/ipfs"
import { ContractMarkdownRenderer } from "@/components/contract/contract-markdown-renderer"
import { PdfDocumentViewer } from "@/components/contract/pdf-document-viewer"
import { formatReference } from "@/lib/utils/contractNaming"

interface ContractViewPageProps {
  id: string
}

/**
 * The "Explorer" action on the details page — a distraction-free, full-window view of the
 * signed contract itself (opened in a new tab), not a blockchain explorer link. Renders the
 * exact same document the details page shows in its preview pane, just without the sidebar,
 * action buttons or signer list around it — nothing here talks to the chain.
 */
export function ContractViewPage({ id }: ContractViewPageProps) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true)
        const response = isNaN(Number(id))
          ? await contractsApi.getDraftDetails(id)
          : await contractsApi.getContractDetails(parseInt(id))
        setContract(response.contract)
      } catch (err) {
        setError("Impossible de charger ce contrat.")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchDetails()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-8">
        <Card className="p-8 text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">{error || "Contrat introuvable."}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="p-0 overflow-hidden shadow-lg border-none bg-white">
          <div className="p-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-2">
                {contract.title}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">{formatReference(contract.reference)}</span>
            </div>
            <div className="flex items-center gap-2">
              {contract.status === 'ACTIVE' || contract.status === 'COMPLETED' ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Signé
                </Badge>
              ) : null}
              {!contract.metadata?.isExternalPdf && <AiBadge />}
              <span className="text-[10px] text-muted-foreground">Document certifié blockchain</span>
            </div>
          </div>

          {contract.metadata?.isExternalPdf ? (
            <PdfDocumentViewer
              url={ipfsApi.getProxyUrl(contract.ipfsHash)}
              fallbackUrl={ipfsApi.getPublicUrl(contract.ipfsHash)}
              className="min-h-[85vh]"
            />
          ) : (
            <div className="bg-gray-100 p-6 min-h-[900px]">
              <div className="max-w-[800px] mx-auto bg-white shadow-xl rounded-sm border border-gray-200">
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

                <div style={{ paddingLeft: 64, paddingRight: 64, paddingTop: 40, paddingBottom: 40, minHeight: 700 }}>
                  <ContractMarkdownRenderer content={contract.metadata?.content || ""} />
                </div>

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
    </div>
  )
}
