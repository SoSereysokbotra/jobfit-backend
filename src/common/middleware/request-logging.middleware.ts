// src/common/middleware/request-logging.middleware.ts
//
// Generic HTTP request logger middleware. Logs method, url, status and duration once
// the response finishes. Reusable; apply via a module's configure(consumer). No
// domain coupling.

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl } = req;
        const start = Date.now();

        res.on('finish', () => {
            this.logger.log(
                `[${method}] ${originalUrl} ${res.statusCode} - ${Date.now() - start}ms`,
            );
        });

        next();
    }
}
