// src/infra/storage/storage.module.ts
//
// StorageService and the SupabaseClientService it depends on, bound together.
//
// WHY THIS MODULE EXISTS — it is a fix, not tidying. The convention used to be that each
// consumer provided BOTH locally ("no shared module to import and no cross-module
// coupling", resume-builder.module.ts). That convention held for two modules and broke on
// the third: MENTOR_REVIEW_2026-08-18 §9 added a signed résumé-download route to
// EmployerModule and listed `StorageService` in its providers without
// `SupabaseClientService`.
//
// The result was not a subtle bug. `AppModule` could not instantiate at all — the whole
// backend failed to boot with "Nest can't resolve dependencies of the StorageService (?,
// ConfigService)". It survived because the unit suite never boots AppModule: jest's
// `testRegex` is `.*\.spec\.ts$`, which does not match `*.e2e-spec.ts`, and the e2e
// config is a separate run. 896 unit tests passed against an application that could not
// start.
//
// A dependency pair that must be copied by hand into every consumer eventually gets
// copied wrong. Importing a module cannot be done by halves, so this makes the failure
// impossible rather than merely unlikely.
//
// @Global because storage has no per-consumer configuration: every caller wants the same
// service reading the same `supabase.buckets` config, and three modules already needed it.

import { Global, Module } from '@nestjs/common';

import { SupabaseClientService } from '../supabase/supabase.client';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [SupabaseClientService, StorageService],
  exports: [StorageService, SupabaseClientService],
})
export class StorageModule {}
