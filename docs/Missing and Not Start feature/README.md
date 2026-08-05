# SRS Gap Analysis — Missing & Not-Started Features

**Audited:** 2026-07-28 · **Against:** [SRS.md](../SRS/SRS.md) v2.0 · **Scope:** `jobfit-backend` only

This folder records which of the SRS's **33 functional requirements** are implemented in the
backend, which are partially implemented, and which have not been started. It is a snapshot of
the code as of the audit date — re-verify before acting on any single line.

## Contents

| Doc | What's in it |
|---|---|
| [01-scorecard.md](01-scorecard.md) | The 33 FRs, one line each, with status |
| [02-partial-features.md](02-partial-features.md) | The 12 partials — what exists, what's missing, how to close |
| [03-not-started-features.md](03-not-started-features.md) | The 10 not-started — same treatment |
| [04-roadmap.md](04-roadmap.md) | The two keystone blockers + suggested build order |
| [05-schema-and-architecture-gaps.md](05-schema-and-architecture-gaps.md) | Missing Prisma models & deviations from the SRS architecture |

## Headline

**11 done · 12 partial · 10 not started** (of 33 functional requirements)

```
Done        ███████████                      11
Partial     ████████████                     12
Not started ██████████                       10
```

Two missing pieces of infrastructure account for most of the outstanding work:

1. **No scheduler** — `@nestjs/schedule` is not installed; there are zero `@Cron` handlers and
   no BullMQ repeatable jobs.
2. **No email delivery** — `MailerService.sendMail` is a TODO stub; every notification listener
   body is empty.

Between them they block 9 of the 22 open requirements. See [04-roadmap.md](04-roadmap.md).

## Also worth knowing

**Work shipped beyond MVP scope.** The employer module (9 endpoints), admin module (14
endpoints), offers lifecycle, learning paths, ingestion, metrics/alerting/health, and the
retrieval eval harness are all built. The SRS lists several of these as Phase 2 or explicitly
out of scope, so they don't appear in the 33-requirement count — that undercounts real progress.

**A note on method.** Status was assigned from code evidence (controllers, services, Prisma
models, DTOs), not from documentation or commit messages. "Partial" means the requirement has
working code that does not yet satisfy its SRS acceptance criteria. "Not started" means no
functioning path exists, even where models or DTOs are already present.
