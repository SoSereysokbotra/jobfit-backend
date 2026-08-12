// src/modules/resume-builder/application/dtos/color-presets.ts
//
// The colour presets a document may use. Deliberately a fixed set, not free-form
// hex: an arbitrary colour invites unreadable résumés and unpredictable previews,
// and every template has to look deliberate in every colour.
//
// The COLUMN stays a plain String (see schema.prisma) so this list can grow — or
// the hex values behind these keys can change — without a migration. Only the DTO
// constrains membership.
//
// ⚠️ The hex values themselves are still an open content decision (Phase 0 §5-E).
// These keys are the contract; what they render as is the renderer's business and
// can be settled any time before Phase 5.

export const COLOR_PRESETS = [
  'default',
  'navy',
  'forest',
  'burgundy',
  'slate',
] as const;

export type ColorPreset = (typeof COLOR_PRESETS)[number];

/** The fallback when a client does not choose — first entry, by definition. */
export const DEFAULT_COLOR_PRESET: ColorPreset = COLOR_PRESETS[0];
