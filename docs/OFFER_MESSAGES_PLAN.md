# Offer negotiation as a real conversation

> Created 2026-08-09. Replaces the single `Offer.notes` text column with a proper message
> thread. Backend + both frontends.

---

## The bug, precisely

Two failures, one cause.

**A candidate can send exactly one message.** `negotiate` asks the lifecycle for
`NEGOTIATING → NEGOTIATING`, which `TRANSITIONS` does not allow (`offer.service.ts:296-319`).
The second message throws `Invalid status transition` and is never stored — which is why
nothing appeared on the employer's dashboard: nothing was written.

**The employer cannot reply, and trying destroys the thread.** There is no reply endpoint.
Their only way to write a note is `extendOffer` / `updateOffer`, both of which use
`optionalData`, whose `notes` handling is a **replace** (`offer.service.ts:332`). Sending a
note overwrites the whole string, deleting the candidate's message.

**Cause:** a conversation stored in one text column. That was fine when `notes` meant "the
employer's note on this offer". Used as a thread it has no ordering, no authorship beyond a
`[Candidate]` string prefix, no per-message timestamp, and no way to append without
rewriting everything.

A patch could fix both symptoms in half an hour — skip the transition when the status is not
changing, and append instead of replace. It would still leave no way to tell a *new* message
from an old one, which is the thing that was actually noticed. So: build the table.

---

## Phase 1 — `OfferMessage`

```prisma
enum OfferMessageAuthor { CANDIDATE  EMPLOYER }

model OfferMessage {
  id           String  @id @default(uuid())
  offerId      String
  authorRole   OfferMessageAuthor
  authorUserId String?          // null-safe if the account is later removed
  body         String
  readAt       DateTime?        // when the RECIPIENT read it; drives the unread count
  createdAt    DateTime @default(now())
}
```

Recipient is implied by `authorRole`, so one `readAt` is enough — two columns would encode a
question nobody asks (an author has read their own message).

**Data migration in the same file.** Two live offers hold real user messages inside `notes`;
orphaning them would be discarding someone's words. Postgres splits the column on newlines,
attributes each line by its `[Candidate]` prefix, and preserves order.

Migrated rows carry `offer.createdAt` plus one second per line — **no per-message timestamp
ever existed**, and the migration comment says so rather than implying the times are real.

---

## Phase 2 — Service and endpoints

- `postMessage(offerId, actor, body)` — appends. Never touches status.
- `markThreadRead(offerId, viewerRole)` — stamps `readAt` on the other side's unread messages.
- `unreadFor(role)` — count, served on both read paths.

| Route | Who |
|---|---|
| `POST /offers/:id/messages` | candidate |
| `POST /employer/applications/:id/offer/messages` | employer |
| existing GETs | now return `messages[]` + `unreadCount` |

**The status transition happens once, on the first candidate message** (`OFFER → NEGOTIATING`),
because that is the only point where anything about the offer's state actually changes. Later
messages are messages. This is the same judgement `extendOffer` already makes when it skips
`OFFER → OFFER`.

`negotiate` keeps working — it becomes "post a message, and transition if we are not already
negotiating".

**`Offer.notes` stops being written.** An employer note on `extendOffer` becomes the first
EMPLOYER message. The column stays for now, unread; dropping it is separate cleanup.

---

## Phase 3 — Employer UI

- Thread modal gains a **reply box**.
- Badge shows **unread count** (`2 new`), not just "is negotiating" — this is the part that
  fixes the original complaint. A state badge cannot distinguish message 1 from message 5.
- Opening the thread marks it read.

## Phase 4 — Candidate UI

- The negotiate modal becomes the same conversation view: thread plus a send box, so it works
  for the first message and the tenth.
- Unread replies from the employer surface on the offer card.

---

## Phase 5 — Verify against the live stack

1. Candidate sends **three** messages — all three stored, all three visible.
2. Employer replies — the candidate's messages survive (this is the bug that ate them).
3. Employer badge shows an unread count, and clearing it works.
4. Re-extending an offer no longer wipes the conversation.
5. The two migrated messages are present and attributed correctly.

---

## Out of scope

- Notifications (email / in-app) when a message arrives. The notification module exists but
  its status-change listener is still a stub; that is its own piece of work.
- Dropping the `Offer.notes` column.
