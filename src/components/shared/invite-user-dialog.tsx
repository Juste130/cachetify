"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { usersApi } from "@/lib/api/users";
import { useNotifications } from "@/hooks/useNotifications";
import { Loader2, UserPlus } from "lucide-react";

interface InviteUserDialogProps {
  trigger?: React.ReactNode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteUserDialog({ trigger }: InviteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { notifySuccess, notifyError } = useNotifications();

  const isValid = EMAIL_RE.test(email.trim());

  const handleInvite = async () => {
    if (!isValid) return;
    setIsSending(true);
    try {
      await usersApi.inviteUser(email.trim());
      notifySuccess("Invitation envoyée", `Un email d'invitation a été envoyé à ${email.trim()}.`);
      setEmail("");
      setOpen(false);
    } catch (err: any) {
      notifyError("Échec de l'invitation", err.message || "Une erreur est survenue.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]">
            <UserPlus className="w-5 h-5 mr-2" />
            Inviter un utilisateur
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter quelqu'un sur Cachetify</DialogTitle>
          <DialogDescription>
            Envoyez une invitation par email à une personne qui n'a pas encore de compte. Elle recevra un lien pour créer le sien gratuitement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite-email">Adresse email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="prenom.nom@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && isValid && !isSending) handleInvite(); }}
            className="bg-input-background"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            onClick={handleInvite}
            disabled={!isValid || isSending}
            className="bg-[#FFC107] text-[#212121] hover:bg-[#FFB300]"
          >
            {isSending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Envoyer l'invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
