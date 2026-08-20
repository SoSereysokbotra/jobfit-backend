# What the API actually receives and stores from the extension

> # 🚧 NOT DONE — handover note
>
> **Nothing in `jobfit-extension` has been changed.** This file is only the *evidence* for
> the rewrite; the rewrite itself is still to do. `MENTOR_REVIEW_2026-08-18` §8 stays open.
>
> It stopped here because `jobfit-extension` is not checked out next to `jobfit-backend`,
> `jobfit-frontend` and `jobfits-ai-service` on the machine this was written on. Clone it
> and the edits are small.
>
> **What to do:**
>
> 1. Rewrite the "What the extension reads" section of `PRIVACY.md` — draft text is at the
>    bottom of this file, under *Draft replacement text*.
> 2. Fix the matching sentence in `STORE_LISTING.md` (draft also below) **in the same
>    commit**, or the two will drift again.
> 3. Fix the host-permissions table in `PRIVACY.md`.
> 4. Re-date `PRIVACY.md` and make sure it is publicly hosted at the URL the Store listing
>    points to.
>
> **What to watch out for — three traps, in order of how easy they are to fall into:**
>
> - **Do not paste the review's suggested wording.** `MENTOR_REVIEW_2026-08-18` §8 proposes
>   saying the posting body is *"never stored as a listing"*. That is **false for Save
>   Job** — `saved_external_jobs.description` stores it on purpose, because it is the
>   user's bookmark. Using it would swap one false privacy claim for another. The two
>   routes need separate sentences; see the table below.
> - **"Nothing from the posting is stored" is wrong for Full Report too.**
>   `match_reports.payload` keeps AI-extracted requirement phrases, which are lifted from
>   the posting body and are often near-verbatim. Say *derived summary*, not *nothing*.
> - **Get the host list from the shipped `manifest.json`, not from `MULTI_SITE_PLAN.md`.**
>   The four extra hosts named in the review (Khmer24, Indeed, BongThom, JobNet) come from
>   a *plan*. They are not verified here and may not match what actually shipped. Diff the
>   policy against the manifest itself.
>
> **One thing worth adding that is not currently claimed:** posting text sent to
> `/match-report` is processed by our own AI service on local models via Ollama, never a
> third-party provider. That is a stronger privacy position than the false absolute it
> replaces, and it should be stated.
>
> Everything below this box is verified fact from the backend. Trust it over the extension
> docs, and over the review.

**Verified at `36f1c68` (2026-08-20)** against the Prisma schema and the receiving DTOs —
not against the extension's docs. A date does not identify a tree; re-verify at a SHA
before relying on this.

> **Why this file is in the backend repo.** `MENTOR_REVIEW_2026-08-18` §8 found that
> `jobfit-extension/PRIVACY.md` states *"The job description / posting body is never read,
> stored, or transmitted"* while two shipped routes do exactly that. The extension repo is
> the wrong place to establish the truth of that claim — the **receiver** knows what it
> receives and what it keeps. This is that ground truth, so the policy can be rewritten
> from something checkable.
>
> ⚠️ This file **does not fix** the policy. `PRIVACY.md`, `STORE_LISTING.md` and
> `manifest.json` live in `jobfit-extension`, which was not available when this was
> written. Someone still has to edit them.

---

## The two routes that receive posting text

| | `POST /api/v1/match-report` | `POST /api/v1/saved-jobs/external` |
|---|---|---|
| Field | `jobDescription` (**required**) | `description` (optional) |
| Server cap | 20,000 chars | 20,000 chars |
| Trigger | user clicks **Full Report** | user clicks **Save Job** |
| Sent onward | yes — to the JobFit AI service | no |
| **Posting text stored?** | **No** | **YES — `saved_external_jobs.description`** |
| What is stored | derived report only (`match_reports.payload`) | the posting text, verbatim, until the user deletes it |

Sources: [match-report.dto.ts](../src/modules/match-report/presentation/dto/match-report.dto.ts),
[save-external-job.dto.ts](../src/modules/saved-job/dto/save-external-job.dto.ts),
`prisma/schema.prisma` (`MatchReport`, `SavedExternalJob`).

### The 8,000-char figure in the review is the extension's cap, not the server's

The review cites 8,000 from the extension's `CONTRACTS.md`. Both server DTOs cap at
**20,000**. The extension capping lower is fine — but a policy should describe the
server-side limit, because that is the bound on what the API will accept from anything.

---

## `POST /match-report` — the description is genuinely not kept

The request body is used twice and then dropped:

1. `extractJobRequirements({ jobTitle, jobDescription })` → the AI service returns a list
   of requirement phrases ([match-report.service.ts:251-264](../src/modules/match-report/application/match-report.service.ts#L251-L264)).
2. `skillsTable(description, …)` → counts how often each requirement phrase occurs in the
   text ([match-report.service.ts:274-296](../src/modules/match-report/application/match-report.service.ts#L274-L296)).

The persisted `payload.job` is **identifiers only** — `externalId`, `source`, `title`,
`company`, `location` ([match-report-payload.ts:24-32](../src/modules/match-report/domain/match-report-payload.ts#L24-L32)).

**But "nothing from the posting is stored" would also be wrong.** The stored payload
contains **AI-extracted requirement phrases**, which are drawn from the posting body and
are often near-verbatim fragments of it. The honest statement is *a derived summary*, not
*nothing*.

### Where the text goes onward

To **JobFit's own AI service**, which runs local models via Ollama
(`jobfits-ai-service`, `OLLAMA_URL`) — **not** to OpenAI, Anthropic or any third-party
model provider. That is a genuinely strong fact and the policy should say it plainly.

---

## `POST /saved-jobs/external` — the posting text IS stored

`SavedExternalJob.description` is a persisted column: *"what the user saved from the
posting"* (`schema.prisma:589`). It is returned by `GET /saved-jobs/external` and lives
until the user deletes the saved job.

> ### ⚠️ The review's suggested replacement wording is wrong for this route
>
> §8 proposes: *"the posting body is read only when you click Full Report or Save Job,
> sent once, **never stored as a listing**, and only the derived report is kept on your
> own account."*
>
> That is accurate for **Full Report** and **false for Save Job** — where the whole point
> is that the text is stored, so the user can read their bookmark later. Shipping it as
> written would replace one incorrect privacy statement with another. The two routes have
> genuinely different answers and the policy has to say so separately.

---

## The manifest / permissions half

`MULTI_SITE_PLAN.md` added **Khmer24, Indeed, BongThom and JobNet** to
`content_scripts.matches`, while `PRIVACY.md` lists host access to `www.linkedin.com` only
and says *"The extension requests no access to any other website."*

**Not verifiable here** — `manifest.json` is in the extension repo. Whoever fixes this must
diff the policy against the shipped manifest, not against `MULTI_SITE_PLAN.md`, which is a
plan and may not match what shipped.

---

## Draft replacement text

Grounded in the table above. Adjust hosts to the real manifest before publishing.

### For `PRIVACY.md` — "What the extension reads"

> **Job postings you are viewing.** On a supported job site the extension reads the
> posting's title, company, location and the site's own job id so it can show you a match
> score.
>
> **The posting body is read only when you ask for it**, by clicking one of two things:
>
> - **Full Report** — the visible posting text is sent once to the JobFit API, which uses
>   it to work out what the role requires and how your résumé compares. **The posting text
>   itself is not kept.** What is saved to your account is the report: the requirement
>   phrases we extracted, your match scores, and which of your skills matched. The text is
>   processed by JobFit's own AI service running local models — it is never sent to a
>   third-party AI provider.
> - **Save Job** — the posting text **is** saved, deliberately, because it is your
>   bookmark: it is what you read when you come back to it later. It is stored against
>   your account only, is never shared, and is deleted when you delete the saved job.
>
> Nothing is read from any page while you are only browsing. No posting is uploaded in the
> background, and there is no shared job listing store built from what you visit.

### For `STORE_LISTING.md`

Replace *"Only the job's ID, the company name and the job title are sent to the JobFit API
— never the posting text"* with:

> The job's id, company and title are sent so we can score the match. The posting text is
> sent only when you click Full Report or Save Job — never in the background.

---

## Pre-submission checklist additions

- [ ] `PRIVACY.md` host table == `manifest.json` `content_scripts.matches` + `host_permissions`
- [ ] `PRIVACY.md` data claims == this file, re-verified at the release SHA
- [ ] `STORE_LISTING.md` data claims == `PRIVACY.md`
- [ ] `PRIVACY.md` re-dated, and publicly hosted at the URL the listing points to
