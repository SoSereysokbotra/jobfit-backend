# Working rules for AI agents on JobFit

Scope: **git and version control only.** Everything here is binding.

These rules were settled by the repo owner on 2026-08-20. Where they differ from
`docs/` or from a generic git guide, **these win**.

---

## 0. The agent writes code. The human runs git.

**Do not run `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git branch`
or `gh pr create` yourself.** The owner is learning git and does the git work deliberately.

Your job when a change is finished:

1. Say which files changed and why they belong together.
2. Give the exact commands, **copy-pasteable, one command per line**.
3. Give the commit message and the PR title/body, written out in full.
4. Stop. Let them run it.

Read-only git is fine and encouraged — `git status`, `git log`, `git diff`,
`git branch -vv`, `git show`. Use it to check state before advising, so your instructions
match reality instead of assuming it.

---

## 1. Branches: `main` and short-lived branches off it

**There is no `develop` branch. Do not create one, do not suggest one.** An earlier
version of the house rules had one; the owner dropped it. `main` is the only long-lived
branch — it is both the integration branch and the production branch.

Allowed prefixes, and nothing else:

| Prefix | For |
|---|---|
| `feature/` | new work |
| `fix/` | bug fixes, and corrections to docs or config |
| `hotfix/` | urgent production breakage |

Because `main` is now production *and* integration, **branch protection on `main` matters
more, not less**. Never push to `main` directly. Every change reaches it through a PR.

> Note the two vocabularies do not have to match. A docs-only change is commonly
> `fix/<thing>` as a **branch** and `docs(...)` as a **commit type**. That is correct, not
> an inconsistency.

---

## 2. Commit messages

Format is mandatory: `type(scope): short description`

Types: `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `chore`

**Atomic commits.** One commit is one self-contained logical change. Do not bundle a
feature with an unrelated doc fix. When you have produced several unrelated changes, say
so and propose the split by file, e.g.:

```
Commit 1 — feat(sites): ...     manifest.config.ts src/content/ ...
Commit 2 — fix(privacy): ...    PRIVACY.md docs/STORE_LISTING.md
```

**Split by file where you can.** Only reach for `git add -p` when one file genuinely
contains two unrelated changes, and say plainly that it is the fallback.

**The message must describe the files in the commit.** This was violated once: a commit
carrying 21 extension source files was labelled `docs(privacy): record DeepSeek...`,
because a message from a different repo was pasted in. Before proposing a message, run
`git status` and check the message matches what is actually staged.

---

## 3. Pull requests

- One purpose per PR. 500–3,000 lines is the target for a feature; a 12,000-line PR is not
  acceptable.
- Refactors ship separately from features.
- **Base is `main`**, except for stacked PRs (§4).
- Required: summary of changes. Optional: screenshots, risks/trade-offs, testing performed.
  Include risks and testing whenever they are non-obvious — they usually are.

**Always state the base and compare explicitly** when telling the owner to open a PR:

> base: `main` ← compare: `feature/ai-rate-limiting`

GitHub guesses the base from the repo's default branch and **has guessed wrong every time
so far** — `jobfit-extension`'s default is still `feature/phase0`. Tell them to check the
`base:` dropdown before clicking create, every time, until the default is fixed.

---

## 4. Branch stacking — only for genuine dependencies

When feature B depends on feature A and A is not merged yet, do not wait and do not
combine them:

```powershell
git checkout -b feature/a      # commit, push
git checkout -b feature/b      # branched from A; commit, push
```

- PR #1: base `main` ← compare `feature/a`
- PR #2: base **`feature/a`** ← compare `feature/b`

Merge #1; GitHub retargets #2 to `main` automatically. Verify it did rather than assuming.

**Stack only for a real dependency.** A real one looks like: B's diff would otherwise
include A's changes, or B is incorrect without A. Two changes touching adjacent sections
of the same file is a real dependency. Two unrelated changes that merely happen to be in
progress at the same time is not.

---

## 5. Rewriting history

- **Never rewrite `main`.**
- Rewriting an unmerged, unreviewed branch nobody has built on is fine — amending a wrong
  commit message, squashing "fix typo" noise.
- **Always `--force-with-lease`, never `--force`.** With-lease refuses if someone else
  pushed since your last fetch; plain force destroys their work silently. There is no
  situation in this project that calls for plain `--force`.
- `--amend` **replaces** the commit with a new SHA. If any branch was cut from it, that
  branch must be rebased onto the new commit or it still points at the old one:

```powershell
git checkout feature/a
git commit --amend -m "feat(scope): correct message"
git push --force-with-lease
git checkout feature/b
git rebase feature/a
git push --force-with-lease
```

---

## 6. Four traps that actually happened here

Check for these before advising; each one cost a round trip.

1. **PowerShell is not bash.** The line-continuation character is a backtick `` ` ``, not
   `\`. A backslash becomes a literal argument and git reports
   `'\file.ts' is outside repository`. **Give multi-file commands on one line.**
2. **`git checkout <branch>` fails when uncommitted edits touch a file that differs
   between the branches.** That is git protecting the work, not an error. The fix is
   almost always `git checkout -b <new-branch>` from where they already are — a new branch
   carries uncommitted changes with it, because those changes belong to no branch until
   committed.
3. **Creating a branch that must not include current work** uses
   `git branch <new> <start-point>` — it makes the label without switching, so the working
   tree is untouched. `git checkout -b` moves you *and* brings your edits along.
4. **Deleting merged branches with `-d`, never `-D`.** `-d` refuses when the commits are
   not merged anywhere, which doubles as a check that the merge really landed. If it
   refuses, find out why rather than forcing.

---

## 7. Four repositories, four independent histories

`jobfit-backend` · `jobfit-frontend` · `jobfit-extension` · `jobfits-ai-service`
all live under `D:/Year2/Jobfit/`.

A change spanning two repos is **two branches and two PRs**. Never describe it as one.
State the repo in every instruction — start command blocks with the `cd`, because the
owner works across all four in one session and a command run in the wrong repo is the
easiest mistake here to make.

Before claiming a file or repo is absent, check `D:/Year2/Jobfit/` directly. A finding was
recorded as unfixable because only the siblings of the working directory were checked and
`jobfit-extension` was declared missing. It was there.

---

## 8. Claims about code carry the commit they were checked at

Any statement of the form *"no code uses X"* or *"this route does not exist"* records the
SHA it was verified at — `verified at 560d70e`, not `verified 2026-08-17`. A date does not
identify a tree.

This is not pedantry. `HANDOFF_2026-08-17.md` recorded a carefully verified *"no code uses
`saved_external_jobs`"* that was true on one branch and false on `main`, and it read as a
standing decision rather than a point-in-time observation — evidence someone would have
used to justify dropping a table that a live feature depends on.

---

## 9. Before you say the work is done

Run these yourself and report the real output. Never assert them from expectation.

```powershell
npx tsc --noEmit -p tsconfig.json
npx jest --silent
npx eslint <the files you changed>
```

**Neither repo has CI** — no `.github/workflows/` in either. So "tests must pass" is
currently enforced only by you actually running them. If a check fails, say so with the
output; do not report completion.
