# Wayside Clinic system test

**Date** 9 November 2026 (Nairobi)  
**Release verification** Incomplete. Authenticated workflows and production readiness still require an isolated PostgreSQL environment.

## Findings

| Priority | Finding | Evidence and follow-up |
| --- | --- | --- |
| High | The public health endpoint can disclose database diagnostics during an outage | Code inspection of `app/api/health/route.ts` shows that the handler copies the raw exception message into its public JSON response. The database error from the test runner included the configured host. Return a fixed public failure code and log diagnostic details server-side. Add a test that forces a database failure and checks the response for internal details. |
| High | Database access blocked verification | The configured PostgreSQL endpoint was unreachable from this test session. The test runner stopped on the first database query. The disposable local server started, but the test shell received a TCP access-denied error and Prisma migration reported a schema engine error. Provide a disposable PostgreSQL database that the app and tests can both reach. |
| High | Default production build failed in this Windows environment | `pnpm build` failed when Turbopack tried to create a junction for the Prisma PostgreSQL adapter. Windows returned error 5. Reproduce in the intended deployment build runner before treating this as an application defect. |
| Medium | The test command can target the configured application database | `pnpm test` loads `.env` and the suite documents writes to a demo account for the lockout test. Require an explicit test database URL and reject a shared database before running write-capable tests. Separate static checks from database and HTTP checks so each reports its own result. |
| Medium | Clinical and financial journeys lack a dedicated automated acceptance suite | Both package test commands run `test/security.ts`. The demo seed exercises service functions, while the security suite focuses on authorization and integrity. Add browser-driven workflows and verify persisted state, stock and ledger entries after each transaction. |
| Medium | PostgreSQL driver upgrade needs an explicit TLS setting | The installed driver warned that the meaning of `sslmode=require` will change in its next major release. Verify certificate and hostname validation against the intended database before upgrading. Use an explicit mode that preserves the intended verification. |
| Medium | Lint flags accessibility and React state issues | Review missing ARIA properties and synchronous state updates in effects first. Clear unused imports and variables separately. |

## Test results

| Check | Outcome |
| --- | --- |
| Static authorization, HTTP hardening configuration and field encryption | **Passed.** All 16 checks before the database section passed. |
| TypeScript | **Passed.** `pnpm typecheck` exited successfully. |
| ESLint | **Passed with warnings.** 0 errors and 101 warnings. |
| Full security suite | **Blocked.** Stopped at the first database integrity query. Seeded role checks and live HTTP probes did not run. |
| Initial migration SQL | **Passed on embedded PGlite.** The full SQL applied in an empty in-memory database. Prisma migration deployment, demo seeding and native PostgreSQL compatibility remain unverified. |
| Default production build | **Failed in this environment.** Windows denied creation of a Turbopack junction. |
| Webpack production build | **Failed in this environment.** Windows denied creation of `.next/types/app/branch-cash/view` (`EPERM`). Repeat the build in a clean deployment runner with a writable build directory. |
| Isolated development server | **Blocked.** Next.js reported an existing development server for the checkout, and the existing port was unreachable from the test shell. |

## Acceptance tests still to run

1. Sign in with each seeded role. Verify denied access for unrelated roles and check login, sign-out, password changes and session expiry.
2. Register a synthetic patient, test duplicate detection, book and check in, then follow the visit through triage, consultation and discharge. Verify the chart and queue at each handoff.
3. Order and release lab results with separate staff accounts. Verify that self-verification is rejected. Complete imaging, dental and procedure orders and verify charges.
4. Dispense a prescription in full and in part. Reconcile inventory and drug cost entries. Verify insufficient-stock handling.
5. Receipt and finalize a cash visit, void a receipt, then reconcile the folio and general ledger. Test duplicate payment references and repeat submissions.
6. Process insured visits through claim submission and approval, partial approval and rejection. Reconcile patient balances, payer receivables and write-offs.
7. Verify print views, exports, reports and shift closing. Exercise payroll, payables, purchasing and approvals with dedicated fixtures. Test M-Pesa, SMS, email, eTIMS and uploads against test endpoints.

The review used the working tree as provided. No application source or environment configuration was edited.

## Health endpoint fix

The follow-up change returns `database_unavailable` in the public HTTP 503 response and logs the underlying error server-side. A forced-outage check invoked the route handler with a simulated database error and verified that an internal hostname appeared only in the captured server log. The live security suite also checks the fixed error code when the endpoint reports the database down.
