import { randomUUID } from "node:crypto";
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import type { ApiErrorEnvelope } from "@gmail-insights/shared";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "internal_error";
    let message = "Something went wrong. Please try again.";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const bodyObj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
      // A handler can set a specific `code` on the exception body (e.g. ForbiddenException({ code: 'modify_scope_required', ... }))
      // to let the frontend branch on something more precise than the HTTP status. Prefer that when present.
      code = (typeof bodyObj?.code === "string" ? bodyObj.code : undefined) ?? httpStatusToCode(status);
      message =
        typeof body === "string"
          ? body
          : Array.isArray(bodyObj?.message)
            ? (bodyObj.message as string[]).join("; ")
            : ((bodyObj?.message as string | undefined) ?? exception.message);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : exception, undefined, "requestId=" + requestId);
    }

    const envelope: ApiErrorEnvelope = { code, message, requestId };
    response.status(status).json(envelope);
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "bad_request";
    case HttpStatus.UNAUTHORIZED:
      return "unauthorized";
    case HttpStatus.FORBIDDEN:
      return "forbidden";
    case HttpStatus.NOT_FOUND:
      return "not_found";
    case HttpStatus.CONFLICT:
      return "conflict";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "rate_limited";
    default:
      return "error";
  }
}
