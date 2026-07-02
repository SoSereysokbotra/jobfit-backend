import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SearchService — PostgreSQL full-text search wrapper.
 * Phase 1: Uses Postgres FTS via Prisma raw queries.
 * Phase 2: Swap out for Meilisearch/Typesense if filtering complexity grows.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full-text search on jobs.
   * Uses PostgreSQL tsvector on title + description.
   */
  async searchJobs(query: string, limit = 20, offset = 0): Promise<unknown[]> {
    if (!query.trim()) return [];

    const results = await this.prisma.$queryRaw<unknown[]>`
      SELECT id, title, location, status, "createdAt"
      FROM jobs
      WHERE to_tsvector('english', title || ' ' || description) @@ plainto_tsquery('english', ${query})
        AND status = 'PUBLISHED'
      ORDER BY ts_rank(to_tsvector('english', title || ' ' || description), plainto_tsquery('english', ${query})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return results;
  }
}
