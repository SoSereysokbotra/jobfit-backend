# What the API actually receives and stores from the extension

> # ✅ APPLIED 2026-08-20 — this file is now the evidence, not a to-do
>
> The rewrite landed. `jobfit-extension` **was** checked out after all, at
> `D:/Year2/Jobfit/jobfit-extension` — the earlier note said otherwise because only the
> siblings of the working directory were checked. `PRIVACY.md`, `docs/STORE_LISTING.md`
> and `manifest.config.ts` have all been corrected. `MENTOR_REVIEW_2026-08-18` §8 is
> closed.
>
> **Keep this file as the ground truth for the next rewrite.** The receiver knows what it
> receives and what it keeps; the extension only knows what it sent. Re-verify it at a SHA
> before the Store submission.
>
> ### 🔴 The draft that used to live at the bottom of this file was WRONG, and was not used
>
> It proposed telling users that posting text is *"processed by our own AI service on local
> models via Ollama, never a third-party provider."* **That is false.**
> `jobfits-ai-service/app/services/chat_router.py` routes per task, and `deepseek_tasks`
> **defaults to `interview,job_requirements`** (`app/config.py:35`). `job_requirements` is
> exactly the task that receives the posting body from `POST /match-report`. With
> `DEEPSEEK_API_KEY` set — it is, locally — the job posting's title and body go to
> **`api.deepseek.com`**, a third-party provider.
>
> This is the same mistake §8 exists to punish, three times over: the original policy, the
> review's suggested replacement, *and* this file's draft were each written without
> checking the code. The shipped policy now discloses DeepSeek by name.
>
> **What is genuinely defensible, and is what the policy says:** the boundary is
> structural, not a convention. `ResumeService`, `EmbedService`, `RerankService` and
> `MatchReasonService` take `OllamaClient` directly and are never handed a `ChatRouter`, so
> adding `resume_parse` to `DEEPSEEK_TASKS` does nothing — there is no wire. The résumé
> cannot reach DeepSeek by configuration alone. That is worth saying, and it is true.
>
> **The trap for next time:** a privacy claim about *where data is processed* can be
> falsified by an environment variable in a different repository. `DEEPSEEK_TASKS` is now
> on the pre-submission checklist in `STORE_LISTING.md` for that reason.
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
> The policy itself now lives in `jobfit-extension` and has been rewritten from this file
> — see *What shipped* at the bottom. Note there is no `manifest.json` to read: the
> manifest is generated from `manifest.config.ts`.

---

## The two routes that receive posting text

| | `POST /api/v1/match-report` | `POST /api/v1/saved-jobs/external` |
|---|---|---|
| Field | `jobDescription` (**required**) | `description` (optional) |
| Server cap | 20,000 chars | 20,000 chars |
| Trigger | user clicks **Full Report** | user clicks **Save Job** |
| Sent onward | yes — to the JobFit AI service, **and on to DeepSeek by default** (see below) | no |
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

### Where the text goes onward — ⚠️ to a THIRD PARTY, by default

To JobFit's own AI service (`jobfits-ai-service`) — and from there, **onward to DeepSeek**.

`ChatRouter` picks a provider per task, and the posting body's task is
`job_requirements`:

| Setting | Value | Source |
|---|---|---|
| `deepseek_tasks` default | `interview,job_requirements` | `app/config.py:35` |
| `DEEPSEEK_TASKS` in `.env` | *not overridden* → default applies | `jobfits-ai-service/.env` |
| `DEEPSEEK_API_KEY` | set (non-empty ⇒ router enabled) | `jobfits-ai-service/.env` |
| Endpoint | `https://api.deepseek.com` | `app/config.py:28` |

Chain: `POST /match-report` → `AiClient.extractJobRequirements` →
AI service `POST /job/requirements` → `ChatRouter` → `DeepSeekClient`.

**What does NOT go to DeepSeek, structurally.** `ResumeService`, `EmbedService`,
`RerankService` and `MatchReasonService` are constructed with `OllamaClient` directly and
never receive a `ChatRouter` — so the résumé, the profile, the name, the email and the
embeddings cannot reach an external provider even if someone adds the task name to the env
var. `chat_router.py`'s own header documents this as a deliberate structural boundary
rather than a convention, and it holds.

`cover_letter` is a known task but is **not** in the default allowlist, so cover-letter
generation (which carries `resumeSummary`, derived from the CV) runs locally unless someone
explicitly opts it in. If that ever changes, the policy changes with it.

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

## The manifest / permissions half — verified and fixed

There is no `manifest.json` to diff: the manifest is **generated** from
`jobfit-extension/manifest.config.ts` by `@crxjs/vite-plugin`. Read from that file, the
shipped `content_scripts.matches` is:

```
https://*.linkedin.com/*   https://*.khmer24.com/*   https://*.bongthom.com/*
https://*.jobnet.com.kh/*  https://*.indeed.com/*
```

So the review's four extra hosts were right — and the mismatch was **worse than it
described**, in three ways the plan could not have shown:

1. The old policy said `www.linkedin.com`. The manifest matches `*.linkedin.com` — every
   subdomain, which is broader than what was declared.
2. `host_permissions` also carries the **JobFit web origin**, derived from `VITE_WEB_URL`.
   It is declared but currently unused ("future bridge fallback"). An undeclared-in-policy
   permission is the same defect regardless of whether code uses it, so the policy now
   lists it and says no page content is read from it.
3. `manifest.config.ts`'s `description` was **136 characters against a 132-char Store
   limit** — an outright rejection, sitting in the file whose own comment said "Store limit
   is 132 chars". Fixed to 128 and pinned to the `STORE_LISTING.md` copy.

---

## What shipped

Three files in `jobfit-extension`, on 2026-08-20.

### `PRIVACY.md` — rewritten, re-dated

| Was | Now |
|---|---|
| *"The job description / posting body is never read, stored, or transmitted."* | Split in two: identifiers while browsing, posting body **only** on Full Report / Save Job |
| (no statement) | Full Report → derived summary stored, **posting text not kept** |
| (no statement) | Save Job → posting text **is** stored, deliberately, as the user's bookmark |
| (no statement) | *Where your text is processed* — names **DeepSeek**, and states that the résumé/profile cannot reach it |
| Host access to `www.linkedin.com`; *"no access to any other website"* | All five content-script hosts + the JobFit API host + the JobFit web host |
| Endpoint list ~4 routes, partly wrong | The 13 routes the extension actually calls, read out of `src/` |
| ⚠️ ACCURACY WARNING block | Removed — the thing it warned about is fixed |

### `docs/STORE_LISTING.md`

- The false *"never the posting text"* sentence is replaced.
- Name and short description no longer say LinkedIn-only; short description pinned to the
  manifest.
- **`Website content` is now ticked as collected** in the data-usage disclosures. It was
  ticked "not collected", which is the under-declaration that gets an extension pulled
  *after* publication rather than rejected before it. The review did not catch this one.
- Permission justifications list all five content-script hosts.
- Full Report and Save Job added to the feature list — the privacy paragraph names them, so
  the listing has to describe them.
- Pre-submission checklist gained a **truthfulness** section, including a check on
  `DEEPSEEK_TASKS`.

### `manifest.config.ts`

- `description` 136 → 128 chars.

## What still needs a human

- [ ] Host `PRIVACY.md` at a public URL and paste it into the dashboard. The Store will not
      accept a submission without a reachable policy URL.
- [ ] Confirm the **deployed** `jobfits-ai-service` has the same `DEEPSEEK_TASKS` as local.
      The policy describes the default (`interview,job_requirements`). If production
      differs, the policy is wrong again — in whichever direction.
- [ ] Decide whether `activeTab` is still needed now that five `content_scripts` entries
      grant the page access. An unused permission invites a review question.

