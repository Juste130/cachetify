/**
 * Shared by the creation wizard (step 4, "Déployer maintenant") and the contract details
 * page (the "Déployer sur la blockchain" button for a READY_TO_DEPLOY draft) — both need
 * the exact same on-chain deployment logic, and letting it drift between two independent
 * copies is how a later fix (e.g. the expiresAt calculation) ends up applied to only one.
 */

export interface DeployableDraft {
  id: string;
  ipfsHash: string;
  metadata: {
    sha256Hash: string;
    escrow?: { deadline?: string | null };
  };
  signatories?: { walletAddress?: string | null; role: number }[];
}

type SignerWithRole = {
  signer: string;
  role: number;
  customRole: string;
  hasSignedContract: boolean;
  signedAt: number;
};

type CreateContractFn = (
  ipfsHash: string,
  sha256Hash: string,
  signersWithRoles: SignerWithRole[],
  expiresAt: number
) => Promise<{ transactionHash?: string }>;

type MarkDraftDeployedFn = (
  draftId: string,
  payload: { transactionHash: string }
) => Promise<{ contract: { contractId: number } }>;

export async function deployDraftContract(
  draft: DeployableDraft,
  createContract: CreateContractFn,
  markDraftDeployed: MarkDraftDeployedFn,
  creatorAddress: string | null
): Promise<{ contractId: number }> {
  const metadata = draft.metadata;
  const signatories = draft.signatories || [];

  // The contract already registers msg.sender (the wallet submitting this very transaction,
  // i.e. the creator) as a signer on its own — passing them again in signersWithRoles reverts
  // with "creator cannot be additional signer". A signatory row for the creator can legitimately
  // exist in our own DB (e.g. to label them "Créateur" in the UI, or because they're also a
  // named party) — that's a platform-level concept the contract knows nothing about, so it
  // must be filtered out here rather than assumed absent upstream.
  const normalizedCreator = creatorAddress?.toLowerCase();
  const signersWithRoles: SignerWithRole[] = signatories
    .filter((s) => !(normalizedCreator && s.walletAddress?.toLowerCase() === normalizedCreator))
    .map((s) => ({
      signer: s.walletAddress || "",
      role: s.role,
      customRole: "",
      hasSignedContract: false,
      signedAt: 0,
    }));

  // expiresAt tracks the escrow deadline (a real date the creator entered) plus a buffer
  // for signature/administrative delay, instead of an arbitrary fixed duration with no
  // relation to what was actually agreed. Escrow itself is handled entirely off-chain.
  const escrowDeadline = metadata.escrow?.deadline ? new Date(metadata.escrow.deadline).getTime() / 1000 : null;
  const EXPIRY_BUFFER_SECONDS = 90 * 24 * 60 * 60; // post-deadline window for administrative resolution
  const FALLBACK_DURATION_SECONDS = 2 * 365 * 24 * 60 * 60; // no escrow deadline declared — long enough not to lapse mid-contract
  const expiresAt = escrowDeadline
    ? Math.floor(escrowDeadline + EXPIRY_BUFFER_SECONDS)
    : Math.floor(Date.now() / 1000) + FALLBACK_DURATION_SECONDS;

  const tx = await createContract(
    draft.ipfsHash,
    metadata.sha256Hash,
    signersWithRoles,
    expiresAt
  );

  // The backend independently verifies this transaction on-chain (receipt, event, creator
  // match) rather than trusting tx.transactionHash blindly — it returns the contractId it
  // verified, which is what callers should navigate to, not a client-side read.
  const deployResult = await markDraftDeployed(draft.id, { transactionHash: tx.transactionHash || "" });
  return { contractId: deployResult.contract.contractId };
}
