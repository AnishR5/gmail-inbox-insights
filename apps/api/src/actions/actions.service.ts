import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";
import type { BulkActionDto } from "@gmail-insights/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { DEFAULT_JOB_OPTS, QUEUE_BULK_ACTION, type BulkActionJobData } from "../sync/queues";
import { BULK_ACTION_QUEUE } from "../sync/sync-queues.module";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(BULK_ACTION_QUEUE) private readonly bulkActionQueue: Queue<BulkActionJobData>,
  ) {}

  /** Step 1 of 3: snapshot the affected messages and report the count. No Gmail call yet. */
  async previewTrash(mailboxAccountId: string, userId: string, senderEmail: string): Promise<BulkActionDto> {
    const targetMessages = await this.prisma.message.findMany({
      where: { mailboxAccountId, senderEmail, NOT: { labelIds: { has: "TRASH" } } },
      select: { id: true },
    });
    if (targetMessages.length === 0) {
      throw new BadRequestException(`No non-trashed messages found from ${senderEmail}`);
    }

    const bulkAction = await this.prisma.bulkAction.create({
      data: {
        mailboxAccountId,
        userId,
        actionType: "trash",
        senderEmail,
        targetMessageCount: targetMessages.length,
        status: "pending_confirmation",
        messages: {
          createMany: { data: targetMessages.map((m) => ({ messageId: m.id, status: "pending" as const })) },
        },
      },
      include: { messages: true },
    });

    return toDto(bulkAction);
  }

  /** Step 2 of 3: explicit user confirmation. Requires the gmail.modify scope. */
  async confirm(mailboxAccountId: string, actionId: string): Promise<BulkActionDto> {
    const action = await this.getOwnedAction(mailboxAccountId, actionId);
    if (action.status !== "pending_confirmation") {
      throw new BadRequestException(`Action is '${action.status}', not pending confirmation`);
    }

    const hasModifyScope = await this.auth.hasModifyScope(mailboxAccountId);
    if (!hasModifyScope) {
      throw new ForbiddenException({
        code: "modify_scope_required",
        message: "Reconnect Gmail with the additional permission to move messages to trash.",
      });
    }

    const updated = await this.prisma.bulkAction.update({
      where: { id: actionId },
      data: { status: "confirmed", confirmedAt: new Date() },
      include: { messages: true },
    });

    await this.bulkActionQueue.add(QUEUE_BULK_ACTION, { bulkActionId: actionId, mailboxAccountId }, DEFAULT_JOB_OPTS);

    return toDto(updated);
  }

  async cancel(mailboxAccountId: string, actionId: string): Promise<BulkActionDto> {
    const action = await this.getOwnedAction(mailboxAccountId, actionId);
    if (action.status !== "pending_confirmation" && action.status !== "confirmed") {
      throw new BadRequestException(`Action is '${action.status}' and can no longer be cancelled`);
    }
    const updated = await this.prisma.bulkAction.update({
      where: { id: actionId },
      data: { status: "cancelled" },
      include: { messages: true },
    });
    return toDto(updated);
  }

  async get(mailboxAccountId: string, actionId: string): Promise<BulkActionDto> {
    const action = await this.getOwnedAction(mailboxAccountId, actionId);
    return toDto(action);
  }

  async list(mailboxAccountId: string): Promise<BulkActionDto[]> {
    const actions = await this.prisma.bulkAction.findMany({
      where: { mailboxAccountId },
      orderBy: { requestedAt: "desc" },
      take: 50,
      include: { messages: true },
    });
    return actions.map(toDto);
  }

  private async getOwnedAction(mailboxAccountId: string, actionId: string) {
    const action = await this.prisma.bulkAction.findUnique({
      where: { id: actionId },
      include: { messages: true },
    });
    if (!action || action.mailboxAccountId !== mailboxAccountId) {
      throw new NotFoundException("Bulk action not found");
    }
    return action;
  }
}

function toDto(action: {
  id: string;
  actionType: string;
  senderEmail: string;
  targetMessageCount: number;
  status: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  completedAt: Date | null;
  messages: Array<{ status: string }>;
}): BulkActionDto {
  return {
    id: action.id,
    actionType: action.actionType as "trash",
    senderEmail: action.senderEmail,
    targetMessageCount: action.targetMessageCount,
    status: action.status as BulkActionDto["status"],
    requestedAt: action.requestedAt.toISOString(),
    confirmedAt: action.confirmedAt?.toISOString() ?? null,
    completedAt: action.completedAt?.toISOString() ?? null,
    succeededCount: action.messages.filter((m) => m.status === "succeeded").length,
    failedCount: action.messages.filter((m) => m.status === "failed").length,
  };
}
