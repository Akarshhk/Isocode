-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENT', 'STAFF', 'COMMITTEE');

-- CreateEnum
CREATE TYPE "Relation" AS ENUM ('OWNER', 'TENANT');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('HELPDESK', 'PLUMBING', 'ELECTRICAL', 'LIFT', 'HOUSEKEEPING', 'SECURITY', 'CIVIL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('GATEWAY', 'BANK');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('AUTO_POSTED', 'ALREADY_POSTED', 'QUEUED', 'RESOLVED', 'IGNORED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('PLUMBING', 'ELECTRICAL', 'LIFT', 'SECURITY', 'HOUSEKEEPING', 'CIVIL', 'PEST_CONTROL', 'PARKING', 'OTHER');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClassifiedBy" AS ENUM ('AI', 'FALLBACK');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('FLAT', 'COMMON');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'CLASSIFIED', 'SAFETY_ESCALATED', 'ASSIGNED', 'RECATEGORISED', 'URGENCY_CHANGED', 'LINKED', 'UNLINKED', 'STATUS_CHANGED', 'COMMENT', 'REOPENED', 'RATED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateTable
CREATE TABLE "Tower" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "Tower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flat" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "areaSqft" INTEGER NOT NULL,

    CONSTRAINT "Flat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "team" "Team",
    "isDutyManager" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlatMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "relation" "Relation" NOT NULL,

    CONSTRAINT "FlatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpiHandle" (
    "id" TEXT NOT NULL,
    "vpa" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,

    CONSTRAINT "UpiHandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingConfig" (
    "id" TEXT NOT NULL,
    "ratePaisePerSqft" INTEGER NOT NULL,
    "interestBpsPerYear" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "flatId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "areaSqft" INTEGER NOT NULL,
    "ratePaisePerSqft" INTEGER NOT NULL,
    "interestBpsPerYear" INTEGER NOT NULL,
    "issuedOn" DATE NOT NULL,
    "dueOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "flatId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayRef" TEXT,
    "utr" TEXT,
    "idempotencyKey" TEXT,
    "bankLineId" TEXT,
    "postedById" TEXT,
    "note" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankLine" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "txnDate" DATE NOT NULL,
    "narration" TEXT NOT NULL,
    "reference" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "fingerprint" TEXT,
    "status" "LineStatus" NOT NULL,
    "flatId" TEXT,
    "reasons" JSONB NOT NULL,
    "candidates" JSONB NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "BankLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "flatId" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "scope" "Scope" NOT NULL,
    "aiCategory" "Category",
    "aiUrgency" "Urgency",
    "aiConfidence" DOUBLE PRECISION,
    "aiReason" TEXT,
    "classifiedBy" "ClassifiedBy" NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "safetyKeyword" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigneeId" TEXT,
    "duplicateOfId" TEXT,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintPhoto" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "ComplaintPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "EventType" NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "Channel" NOT NULL,
    "body" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tower_code_key" ON "Tower"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Flat_code_key" ON "Flat"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "FlatMember_userId_key" ON "FlatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UpiHandle_vpa_key" ON "UpiHandle"("vpa");

-- CreateIndex
CREATE INDEX "Bill_period_idx" ON "Bill"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_flatId_period_key" ON "Bill"("flatId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayRef_key" ON "Payment"("gatewayRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_utr_key" ON "Payment"("utr");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bankLineId_key" ON "Payment"("bankLineId");

-- CreateIndex
CREATE INDEX "Payment_flatId_paidOn_idx" ON "Payment"("flatId", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "BankLine_fingerprint_key" ON "BankLine"("fingerprint");

-- CreateIndex
CREATE INDEX "BankLine_status_idx" ON "BankLine"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_number_key" ON "Complaint"("number");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_towerId_category_createdAt_idx" ON "Complaint"("towerId", "category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintPhoto_complaintId_key" ON "ComplaintPhoto"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaintId_at_idx" ON "ComplaintEvent"("complaintId", "at");

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_createdAt_idx" ON "OtpChallenge"("phone", "createdAt");

-- AddForeignKey
ALTER TABLE "Flat" ADD CONSTRAINT "Flat_towerId_fkey" FOREIGN KEY ("towerId") REFERENCES "Tower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatMember" ADD CONSTRAINT "FlatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlatMember" ADD CONSTRAINT "FlatMember_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpiHandle" ADD CONSTRAINT "UpiHandle_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankLineId_fkey" FOREIGN KEY ("bankLineId") REFERENCES "BankLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLine" ADD CONSTRAINT "BankLine_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_flatId_fkey" FOREIGN KEY ("flatId") REFERENCES "Flat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Complaint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintPhoto" ADD CONSTRAINT "ComplaintPhoto_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
