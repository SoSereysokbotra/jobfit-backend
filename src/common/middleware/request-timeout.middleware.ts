// src/common/middleware/request-timeout.middleware.ts
//
// Generic request-timeout middleware. If a request hasn't finished within the
// configured window, it responds 408. Reusable; the timeout is a plain constant so
// there's no config coupling (swap for a configurable provider later if needed).

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestTimeoutMiddleware implements NestMiddleware {
    private readonly timeoutMs = 30_000;

    use(req: Request, res: Response, next: NextFunction): void {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.status(408).json({
                    statusCode: 408,
                    timestamp: new Date().toISOString(),
                    path: req.originalUrl,
                    message: 'Request timeout',
                });
            }
        }, this.timeoutMs);

        res.on('finish', () => clearTimeout(timer));
        res.on('close', () => clearTimeout(timer));

        next();
    }
}
