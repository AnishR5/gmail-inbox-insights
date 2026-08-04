-- CreateEnum
CREATE TYPE "MailboxSyncStatus" AS ENUM ('idle', 'syncing', 'error', 'needs_reauth');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('full', 'incremental');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "BulkActionType" AS ENUM ('trash');

-- CreateEnum
CREATE TYPE "BulkActionStatus" AS ENUM ('pending_confirmation', 'confirmed', 'in_progress', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BulkActionMessageStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "google_sub" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailbox_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "gmail_address" TEXT NOT NULL,
    "sync_status" "MailboxSyncStatus" NOT NULL DEFAULT 'idle',
    "sync_error" TEXT,
    "history_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mailbox_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "mailbox_account_id" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "encrypted_access_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[],
    "enc_key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "mailbox_account_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_email" TEXT NOT NULL,
    "sender_name" TEXT,
    "subject" TEXT,
    "internal_date" TIMESTAMP(3) NOT NULL,
    "is_unread" BOOLEAN NOT NULL DEFAULT false,
    "label_ids" TEXT[],
    "size_estimate" INTEGER,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senders" (
    "id" TEXT NOT NULL,
    "mailbox_account_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "display_name" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "first_message_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "mailbox_account_id" TEXT NOT NULL,
    "type" "SyncJobType" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'queued',
    "cursor" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "stats" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_actions" (
    "id" TEXT NOT NULL,
    "mailbox_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" "BulkActionType" NOT NULL,
    "sender_email" TEXT NOT NULL,
    "target_message_count" INTEGER NOT NULL,
    "status" "BulkActionStatus" NOT NULL DEFAULT 'pending_confirmation',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bulk_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_action_messages" (
    "id" TEXT NOT NULL,
    "bulk_action_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "status" "BulkActionMessageStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,

    CONSTRAINT "bulk_action_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "mailbox_accounts_user_id_gmail_address_key" ON "mailbox_accounts"("user_id", "gmail_address");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_mailbox_account_id_key" ON "oauth_tokens"("mailbox_account_id");

-- CreateIndex
CREATE INDEX "messages_mailbox_account_id_sender_email_idx" ON "messages"("mailbox_account_id", "sender_email");

-- CreateIndex
CREATE INDEX "senders_mailbox_account_id_message_count_idx" ON "senders"("mailbox_account_id", "message_count");

-- CreateIndex
CREATE UNIQUE INDEX "senders_mailbox_account_id_email_address_key" ON "senders"("mailbox_account_id", "email_address");

-- CreateIndex
CREATE INDEX "sync_jobs_mailbox_account_id_created_at_idx" ON "sync_jobs"("mailbox_account_id", "created_at");

-- CreateIndex
CREATE INDEX "bulk_actions_mailbox_account_id_requested_at_idx" ON "bulk_actions"("mailbox_account_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_action_messages_bulk_action_id_message_id_key" ON "bulk_action_messages"("bulk_action_id", "message_id");

-- AddForeignKey
ALTER TABLE "mailbox_accounts" ADD CONSTRAINT "mailbox_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "senders" ADD CONSTRAINT "senders_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_actions" ADD CONSTRAINT "bulk_actions_mailbox_account_id_fkey" FOREIGN KEY ("mailbox_account_id") REFERENCES "mailbox_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_actions" ADD CONSTRAINT "bulk_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_action_messages" ADD CONSTRAINT "bulk_action_messages_bulk_action_id_fkey" FOREIGN KEY ("bulk_action_id") REFERENCES "bulk_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
