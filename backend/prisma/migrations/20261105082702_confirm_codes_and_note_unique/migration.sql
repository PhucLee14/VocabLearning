-- AlterEnum: codes emailed to confirm sensitive actions
ALTER TYPE "AuthTokenType" ADD VALUE 'ACTION_CONFIRM';

-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN "action" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- One note per (user, word): keep the most recently updated one before adding the unique key.
DELETE FROM "notes" n
USING "notes" m
WHERE n."userId" = m."userId"
  AND n."wordId" = m."wordId"
  AND n."wordId" IS NOT NULL
  AND (n."updatedAt" < m."updatedAt" OR (n."updatedAt" = m."updatedAt" AND n."id" < m."id"));

-- DropIndex
DROP INDEX "notes_userId_wordId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "notes_userId_wordId_key" ON "notes"("userId", "wordId");
