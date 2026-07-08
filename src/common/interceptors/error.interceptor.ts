// src/common/interceptors/error.interceptor.ts
//
// Generic error-logging interceptor. Logs any error flowing through the stream and
// rethrows it unchanged so the global AllExceptionsFilter still shapes the HTTP
// response. Reusable; holds no domain knowledge.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorInterceptor.name);

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        this.logger.error(error?.message ?? 'Unhandled error', error?.stack);
        return throwError(() => error);
      }),
    );
  }
}
