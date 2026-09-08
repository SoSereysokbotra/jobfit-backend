# Technical Specification: Two-Dimensional Job Matching System (Approach C)

## 1. Overview & Context

### 1.1 The Problem
In the current JobFit matching engine, recommendations are scored using a linear weighted sum:
- Skills: 40%
- Experience: 25%
- Location: 15%
- Salary: 10%
- Other: 10%

Because **Skills + Experience account for 65% of the total score**, a strong resume-to-job capability match (e.g. 90–95%) automatically earns ~60 points. Even when a job completely violates explicit user preferences (e.g., On-site in another country when the user requested Remote, or Full-time when the user requested Contract), the job still finishes with a 70%+ score ("Strong Match"). 

Furthermore, `desiredEmploymentTypes` and `desiredJobLevels` stored in the candidate profile are never queried or scored, missing job metadata causes remaining weights to re-scale (further inflating skills), and the `explain()` function only emits positive highlights, hiding logistical conflicts.

### 1.2 Target Solution: Two-Dimensional Matching (Approach C)
Decouple matching into two transparent, orthogonal scores:
1. **Role Fit Score (`roleFitScore`, 0–100%)**: Measures technical capability, skills, experience, and domain alignment between the candidate's resume and the job description.
2. **Preference Fit Score (`preferenceFitScore`, 0–100%)**: Measures explicit logistical compatibility (Work Arrangement, Location, Employment Type, Desired Job Level, Salary).
3. **Composite Overall Score (`overallScore` / `match`, 0–100%)**: A gated/damped score used for ranking the recommendation feed, preventing high capability from masking logistical disqualifications.
4. **Transparent Metadata (`flags` & updated `reason`)**: Two-way honest feedback highlighting both capability matches (e.g., `✓ 92% Skills Match`) and logistical mismatches (e.g., `⚠️ On-site only in London`).

---

## 2. Mathematical Specification

### 2.1 Role Fit Score ($R$)
Evaluates capability based on skills and years of experience:
$$R = \text{blend}(\text{skillsScore}, \text{experienceScore})$$
- Default relative weights: **Skills = 60%**, **Experience = 40%**.
- If experience is unknown/null on the job, re-scale Skills to 100%.

### 2.2 Preference Fit Score ($P$)
Evaluates compliance with the candidate's explicit preferences.
Components:
- **Work Arrangement & Location ($W$)** — Weight: **35%**
- **Employment Type ($E$)** — Weight: **25%**
- **Job Level ($L$)** — Weight: **20%**
- **Salary ($S$)** — Weight: **20%**

#### A. Work Arrangement & Location ($W$)
- If Candidate's `desiredRemoteTypes` is strictly `['REMOTE']`:
  - Job is `REMOTE`: $W = 100$
  - Job is `HYBRID` or `ON_SITE`: $W = 0$, Flag warning: `"Requires on-site / hybrid presence"`
- If Candidate accepts `HYBRID` or `ON_SITE`:
  - Job is `REMOTE`: $W = 100$
  - Job is `HYBRID` or `ON_SITE`:
    - Same City & Country: $W = 100$
    - Same Country, Different City: $W = 50$, Flag warning: `"Located in {job.city} (different city)"`
    - Different Country: $W = 0$, Flag warning: `"Located in {job.country} (relocation required)"`
- If Job location/arrangement is unspecified: Treat as neutral ($W = 70$), no warning.

#### B. Employment Type ($E$)
- If Candidate has specified `desiredEmploymentTypes` (e.g. `['FULL_TIME', 'CONTRACT']`):
  - If Job's `employmentType` is in `desiredEmploymentTypes`: $E = 100$
  - If Job's `employmentType` is NOT in `desiredEmploymentTypes`: $E = 0$, Flag warning: `"{job.employmentType} role (differs from preferred)"`
  - If Job's `employmentType` is null/unspecified: $E = 80$ (neutral).
- If Candidate has no preference set: $E = 100$.

#### C. Job Level ($L$)
- If Candidate has `desiredJobLevels` (e.g. `['SENIOR', 'LEAD']`):
  - Job's `jobLevel` matches: $L = 100$
  - Job's `jobLevel` is adjacent (e.g., MID vs SENIOR): $L = 60$
  - Job's `jobLevel` is distant (e.g., ENTRY_LEVEL vs LEAD): $L = 20$, Flag warning: `"Role level is {job.jobLevel}"`
  - If Job level is unspecified: $L = 80$.
- If Candidate has no preference set: $L = 100$.

#### D. Salary ($S$)
- If Candidate specified `minSalary` and Job has `maxSalary`:
  - Job `maxSalary` $\ge$ Candidate `minSalary`: $S = 100$, Flag highlight: `"Salary matches target"`
  - Job `maxSalary` $<$ Candidate `minSalary`:
    - Ratio $r = \frac{\text{Job maxSalary}}{\text{Candidate minSalary}}$
    - If $r \ge 0.85$: $S = 60$, Flag warning: `"Salary slightly below requested range"`
    - If $r < 0.85$: $S = 0$, Flag warning: `"Salary below requested range"`
- If Job salary is missing or unlisted: $S$ is excluded and remaining preference weights are re-scaled.

$$P = \frac{\sum w_i \cdot s_i}{\sum w_i}$$

### 2.3 Composite Overall Score ($C$) — Non-Linear Gating Formula
To prevent high $R$ from dominating when $P$ is near zero, apply non-linear damping:
$$C = R \times \left( \alpha + (1 - \alpha) \times \left(\frac{P}{100}\right)^\gamma \right)$$
*Recommended parameters:* $\alpha = 0.30$, $\gamma = 1.0$.

#### Verification Examples:
1. **Perfect Match:** $R = 95\%$, $P = 100\% \implies C = 95 \times (0.3 + 0.7 \times 1.0) = \mathbf{95\%}$
2. **Skills Match but Total Dealbreaker Mismatch:** $R = 95\%$, $P = 0\% \implies C = 95 \times (0.3 + 0) = \mathbf{28.5\%}$ *(Demoted to WEAK band; cannot mislead the user)*
3. **Skills Match with Mild Preference Conflict:** $R = 95\%$, $P = 60\% \implies C = 95 \times (0.3 + 0.7 \times 0.6) = \mathbf{68.4\%}$ *(POSSIBLE band, honest warning shown)*

---

## 3. Implementation Tasks for Claude

### Task 1: Update Domain Scoring Types
**Target File:** `src/modules/matching/domain/scoring/types.ts`
1. Update `CandidateContext`:
   - Add `desiredJobLevels?: string[];`
   - Add `desiredEmploymentTypes?: string[];`
2. Update `JobContext`:
   - Ensure `employmentType?: string | null;`
   - Ensure `jobLevel?: string | null;`
   - Ensure `remoteType?: string | null;`
3. Define output interfaces:
   ```typescript
   export interface MatchFlags {
     hasDealbreakerMismatch: boolean;
     warnings: string[];
     highlights: string[];
   }

   export interface TwoDimensionalScoreResult {
     overallScore: number;       // 0-100 (integer)
     roleFitScore: number;       // 0-100 (integer)
     preferenceFitScore: number; // 0-100 (integer)
     band: 'STRONG' | 'POSSIBLE' | 'WEAK';
     flags: MatchFlags;
     explanation: string;
   }
   ```

### Task 2: Implement Two-Dimensional Calculator
**Target File:** `src/modules/matching/domain/scoring/weighted-match.calculator.ts`
1. Separate calculation of `roleFitScore` and `preferenceFitScore`.
2. Implement preference evaluation functions:
   - Work arrangement & location match.
   - Employment type match.
   - Job level compatibility.
   - Salary range comparison.
3. Collect warnings and highlights into `MatchFlags`.
4. Implement the non-linear gating formula for `overallScore`.
5. Determine `band` based on `overallScore` (`>= 70` STRONG, `>= 50` POSSIBLE, `< 50` WEAK).

### Task 3: Update Profile Query & Mapping in Application Use Case
**Target File:** `src/modules/matching/application/use-cases/recompute-user-matches.use-case.ts`
1. In `findUserProfile` / Prisma query for Profile (around lines 237–250):
   - Add `desiredEmploymentTypes: true`
   - Add `desiredJobLevels: true`
2. In CandidateContext mapping:
   - Forward `profile.desiredEmploymentTypes` and `profile.desiredJobLevels`.
3. In `explain()` function (around lines 774–783):
   - Update explanation logic: If there are warnings in `flags.warnings`, combine highlights with warnings:
     - Format: `"${title}: ${highlights.join(', ')} — Note: ${warnings.join('; ')}."`
     - Example: `"Senior Backend Engineer: Strong skills match (92%), salary in target range — Note: On-site presence required in Singapore."`

### Task 4: Update Presentation DTO and Mapper
**Target File:** `src/modules/matching/presentation/dtos/recommended-job.mapper.ts`
Update mapper and response DTO schema to return:
```typescript
{
  jobId: string;
  title: string;
  company: string;
  match: number;               // overallScore (0-100)
  roleFitScore: number;        // NEW: Role / capability fit (0-100)
  preferenceFitScore: number;  // NEW: Preference / logistics fit (0-100)
  band: 'STRONG' | 'POSSIBLE' | 'WEAK';
  reason: string;              // Balanced explanation
  flags: {
    hasDealbreakerMismatch: boolean;
    warnings: string[];
    highlights: string[];
  };
}
```

### Task 5: Unit Tests
**Target File:** `src/modules/matching/domain/scoring/scoring.spec.ts` (or create new spec)
1. **Test Case 1 (The Reported Bug):** Candidate has 95% skill match, but prefers REMOTE only. Job is ON_SITE in another city. Verify:
   - `roleFitScore` $\approx 95$
   - `preferenceFitScore` $\le 30$
   - `overallScore` $< 50$ (WEAK band)
   - `flags.warnings` contains remote/location warning.
2. **Test Case 2 (Ideal Match):** Candidate matches skills and preferences. Verify `overallScore` $\ge 85$, band is `STRONG`.
3. **Test Case 3 (Missing Job Data):** Job has no salary or location listed. Verify scores do not artificially explode or throw runtime errors.
