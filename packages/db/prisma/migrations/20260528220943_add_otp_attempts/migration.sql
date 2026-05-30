-- AlterTable
ALTER TABLE "SigningRequest" ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpVerifiedAt" TIMESTAMP(3);
