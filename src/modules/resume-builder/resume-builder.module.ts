// src/modules/resume-builder/resume-builder.module.ts
//
// In-app résumé builder: structured documents the user composes from templates WE
// author, distinct from the uploaded-file `Resume` flow.
//
// Contains the read-only template catalogue (Phase 2), document CRUD + content
// sections (Phase 3), import-from-profile (Phase 4) and PDF export (Phase 5).
//
// Templates are internal reference data: the ONLY template route is a public,
// read-only GET. No create/update/delete/upload route exists for them, and none
// should be added here — they enter the system through prisma/seed.ts. If
// management is ever needed it belongs under /admin/* behind @Roles('ADMIN')
// (see RESUME_BUILDER_BACKEND_PLAN.md).

import { Module } from '@nestjs/common';

import { ResumeDocumentController } from './presentation/controllers/resume-document.controller';
import { ResumeTemplateController } from './presentation/controllers/resume-template.controller';
import { ResumeTemplateService } from './application/services/resume-template.service';
import { ResumeTemplateRepository } from './infrastructure/repositories/resume-template.repository';
import { ResumeDocumentService } from './application/services/resume-document.service';
import { ResumeDocumentRepository } from './infrastructure/repositories/resume-document.repository';
// Read-only projections of the user's Experience/Education/Certification/UserSkill
// rows, used by import-from-profile. Reads its own tables via the global
// PrismaService, so no cross-module import is needed.
import { ProfileContentRepository } from './infrastructure/repositories/profile-content.repository';

// Export pipeline. StorageService + SupabaseClientService are provided locally here,
// exactly as ResumeModule does — both depend only on the global ConfigService, so
// there is no shared module to import and no cross-module coupling.
import { ResumeExportService } from './application/services/resume-export.service';
import { ResumePdfRenderer } from './application/services/resume-pdf.renderer';
import { SupabaseClientService } from '@infra/supabase/supabase.client';
import { StorageService } from '@infra/storage/storage.service';

@Module({
  controllers: [ResumeDocumentController, ResumeTemplateController],
  providers: [
    ResumeDocumentService,
    ResumeDocumentRepository,
    ProfileContentRepository,
    ResumeTemplateService,
    ResumeTemplateRepository,
    ResumeExportService,
    ResumePdfRenderer,
    SupabaseClientService,
    StorageService,
  ],
  exports: [ResumeDocumentService],
})
export class ResumeBuilderModule {}
