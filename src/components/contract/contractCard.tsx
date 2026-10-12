"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { FileText, ArrowRight, Clock, CheckCircle2 } from "lucide-react";

interface ContractCardProps {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  signersCount?: number;
}

export function ContractCard({
  id,
  title,
  status,
  createdAt,
  signersCount = 0,
}: ContractCardProps) {
  const getStatusBadge = (s: string) => {
    switch (s.toUpperCase()) {
      case "ACTIVE":
      case "COMPLETED":
        return <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-none"><CheckCircle2 className="size-3 mr-1" /> Actif</Badge>;
      case "PENDING_SIGNATURES":
      case "PENDING":
        return <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-none"><Clock className="size-3 mr-1" /> En attente</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div className="border border-border rounded-xl p-5 bg-card text-card-foreground shadow-sm hover:border-[#FFC107] transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-amber-500/10 text-[#FFC107]">
          <FileText className="size-5" />
        </div>
        {getStatusBadge(status)}
      </div>

      <h3 className="font-semibold text-lg mb-1 line-clamp-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Créé le {new Date(createdAt).toLocaleDateString()} • {signersCount} signataire(s)
      </p>

      <Link href={`/contract-details?id=${id}`}>
        <Button variant="outline" size="sm" className="w-full justify-between">
          Voir les détails
          <ArrowRight className="size-4" />
        </Button>
      </Link>
    </div>
  );
}
