-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaMime" TEXT,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "externalId" TEXT,
    "senderUserId" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "botGenerated" BOOLEAN NOT NULL DEFAULT false,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("aiGenerated", "body", "botGenerated", "conversationId", "createdAt", "direction", "error", "externalId", "fileName", "id", "mediaMime", "mediaUrl", "senderUserId", "status", "type") SELECT "aiGenerated", "body", "botGenerated", "conversationId", "createdAt", "direction", "error", "externalId", "fileName", "id", "mediaMime", "mediaUrl", "senderUserId", "status", "type" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_externalId_idx" ON "Message"("externalId");
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");
CREATE TABLE "new_Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "waLabelId" TEXT,
    "waColor" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Tag" ("color", "createdAt", "id", "name") SELECT "color", "createdAt", "id", "name" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX "Tag_waLabelId_key" ON "Tag"("waLabelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
