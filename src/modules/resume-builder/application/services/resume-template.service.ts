// src/modules/resume-builder/application/services/resume-template.service.ts
//
// The template catalogue, read-only. Thin by design — the interesting rule
// (only ever active templates) lives in the repository so every caller inherits it.

import { Injectable } from '@nestjs/common';
import { ResumeTemplate } from '@prisma/client';

import {
  ResumeTemplateRepository,
  TemplateFilters,
} from '../../infrastructure/repositories/resume-template.repository';

@Injectable()
export class ResumeTemplateService {
  constructor(private readonly templates: ResumeTemplateRepository) {}

  async list(filters: TemplateFilters): Promise<ResumeTemplate[]> {
    return this.templates.findActive(filters);
  }
}
