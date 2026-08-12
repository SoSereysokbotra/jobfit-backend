// src/modules/resume-builder/resume-builder.module.ts
//
// In-app résumé builder: structured documents the user composes from templates WE
// author, distinct from the uploaded-file `Resume` flow.
//
// ⚠️ SCOPE: this module currently contains Phase 3 (document CRUD + content
// sections) only. **Phase 2 (GET /resume-builder/templates) was never run**, so
// there is no templates controller yet — templates are reachable only indirectly,
// via the active-template check when a document is created. Adding that read-only
// endpoint is Phase 2's job and is purely additive to this module.
//
// Templates remain internal reference data: no create/update/delete/upload route
// exists for them, and none should be added here (see RESUME_BUILDER_BACKEND_PLAN.md).

import { Module } from '@nestjs/common';

import { ResumeDocumentController } from './presentation/controllers/resume-document.controller';
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
  controllers: [ResumeDocumentController],
  providers: [
    ResumeDocumentService,
    ResumeDocumentRepository,
    ProfileContentRepository,
    ResumeExportService,
    ResumePdfRenderer,
    SupabaseClientService,
    StorageService,
  ],
  exports: [ResumeDocumentService],
})
export class ResumeBuilderModule {}
