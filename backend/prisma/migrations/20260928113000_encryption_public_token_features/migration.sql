-- Chiffrement des documents (AES-256-GCM) : voir backend/utils/document-crypto.js.
-- Toutes les colonnes sont NULLABLE : une ligne existante (import Pinata historique) reste
-- valide, elle est simplement traitée comme non déchiffrable par decryptStoredDocument.
ALTER TABLE "ipfs_documents"
  ADD COLUMN "encryption_iv" BYTEA,
  ADD COLUMN "encryption_auth_tag" BYTEA,
  ADD COLUMN "wrapped_key" BYTEA,
  ADD COLUMN "key_iv" BYTEA,
  ADD COLUMN "key_auth_tag" BYTEA;

-- Jeton public non devinable (128 bits) pour la page de vérification et le code QR du
-- certificat : voir backend/controllers/contract.js (generatePublicToken, getPublicVerification).
ALTER TABLE "contract_cache"
  ADD COLUMN "public_token" TEXT;

CREATE UNIQUE INDEX "contract_cache_public_token_key" ON "contract_cache"("public_token");
