import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Maps well-known Prisma errors to sensible HTTP responses, globally.
 *
 * Found via the Phase 4d tenant-isolation test suite: PrismaService's
 * tenant-scoping middleware (see database/prisma.service.ts) deliberately
 * throws Prisma's own P2025 "record not found" error when an update/delete
 * targets a row that exists but belongs to another school — exactly the
 * error Prisma throws natively for a genuinely-missing id, specifically so
 * existing code wouldn't need special-casing. It turned out nothing in this
 * codebase was actually catching P2025 anywhere — every such case (tenant
 * mismatch OR a truly-missing id) was falling through as an unhandled 500.
 * That's true independent of multi-tenancy; this filter fixes both cases at
 * once rather than patching each controller's catch block individually.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    switch (exception.code) {
      case 'P2025': // record not found (update/delete/findUniqueOrThrow miss)
        return res.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        });
      case 'P2002': { // unique constraint violation
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta!.target as string[]).join(', ')
          : String(exception.meta?.target ?? 'field');
        return res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `${target} already exists`,
        });
      }
      default:
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
        });
    }
  }
}
