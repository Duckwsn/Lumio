-- Additive: old invitations keep their token hashes and remain usable by link.
ALTER TABLE "HouseInvite" ADD COLUMN "codeHash" TEXT;
CREATE UNIQUE INDEX "HouseInvite_codeHash_key" ON "HouseInvite"("codeHash");
