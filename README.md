<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Wayside Clinic — Outpatient Clinic Management

A complete outpatient (OPD) and dental clinic system on a Business Central–style ERP. The patient's
journey runs from registration and booking through triage, consultation, laboratory, imaging,
dental treatment, pharmacy and the cashier. Every shilling it bills posts live into the general
ledger, and insurance shares become claims invoiced to the payer in Receivables. Around it sits the
full ERP core, brought across from the Calbytes ERP / Hotel CBS family: Administration, Finance,
HR & Payroll, Inventory, Fixed Assets, Cash Management and Self Service.

Built on Next.js 16 (Server Components and Server Actions only), React 19, PostgreSQL and Prisma 7
(schema and migrations; queries are parameterised SQL through `lib/db.ts`).

## Clinical & operational modules

| Module | What it covers |
| --- | --- |
| **Patients** | Register with duplicate detection (phone + name + DOB, or ID number); MRN for life; national ID sealed with AES-256-GCM and revealed only with a capability (audited); allergies, chronic conditions and clinical alerts shown on every clinical screen; next of kin; medical covers (SHA, insurers, employers) with a default; the chart (summary, vitals trends, visits, released lab results, odontogram, treatment plans) |
| **Appointments** | Day sheet by clinic (time grid), week and search views; clash checks per patient and clinician; confirm, move, cancel; check-in from the booking; follow-ups booked from the visit; SMS reminders (job queue) and a nightly no-show sweep |
| **Visits & queues** | Check-in prices the visit on the cash or payer tariff, charges registration on a first visit and the consultation fee unless it is a review inside the review window, and queues the patient. Each service point (triage, OPD, dental, MCH, lab, imaging, procedure room, pharmacy, cashier) has its own daily-numbered queue: call next by priority and acuity, serve, done. Patient-flow board by stage; a full-screen **waiting-room display** that calls numbers with a chime |
| **Triage** | Vitals (BP, pulse, temperature, SpO₂, RR, weight, height, auto-BMI, MUAC, RBS, pain) with Kenya triage acuity. The acuity can never be set lower than the vitals call for. RED/ORANGE escalate the visit's priority |
| **Consultation** | SOAP note per clinician; ICD-10 coded diagnoses (searchable common set, extensible); orders for lab (multi-test picker), imaging, procedures and nursing; the prescription builder (dose × frequency × days quantity suggestion, allergy check); referral letters, sick-off notes and medical reports printed on letterhead; outcome and follow-up |
| **Dental** | Interactive FDI odontogram (permanent and primary dentition, surface-level findings, colour-coded, full history); treatment plans with phases and per-tooth procedures (CDT-style codes), quotation print, patient acceptance; completing an item charges it at the quoted fee and updates the chart (filling → Filled, extraction → Missing…) |
| **Laboratory** | Catalogue with parameters, units, sex-specific reference ranges and critical limits; specimen collection with accession numbers; result entry with automatic H/L/HH/LL/abnormal flags; critical values notify the clinician immediately; **maker-checker verification** (enforced in the database); released results return the patient to the clinician's queue; printable report; turnaround tracking against each test's target |
| **Imaging** | X-ray, ultrasound, dental OPG / periapical, ECG: performed, reported (findings, impression, image link), returned to the clinician |
| **Pharmacy** | Prescriptions queue; dispensing issues stock from the pharmacy store through the item journal at FIFO cost (Dr Drugs Consumed / Cr Drug Inventory) and raises the drug charge; partial fills and out-of-stock lines; formulary over inventory items; stock, low-stock and dispensing reports |
| **Procedures & nursing** | Injections, dressings, nebulisation, suturing, I&D and more — ordered, done, charged |
| **Billing & cashier** | The visit folio priced per tariff; discounts and waivers (capability); scheme/co-pay split (fixed or % co-pay, per-visit limit); receipts by cash (with change), M-Pesa (codes receipted once), card or bank; voids by reversing journal; finalise bill and close visit; printed invoice and receipt; collections by method and cashier; cashier shift closing |
| **Insurance & claims** | Payers each billed through their own Receivables customer; pre-authorisations; claims raised automatically from the scheme share; batch submission; decisions (approved, partial, rejected). Approval posts a VAT-exempt sales invoice to the payer, and shortfalls are written off. Claims age, are statemented, reminded and receipted like any debtor; outstanding by payer |
| **Reports** | Attendance trend by clinic, age/sex profile, clinician activity, morbidity (MOH 705A/B split), revenue by category and payer, billed vs collected, claims performance and rejection rate, lab turnaround, dental procedures |
| **Role centres** | Medical Director, Reception, Clinician, Nursing & Triage, Dental, Laboratory, Pharmacy, Cashier, Claims, plus Finance Manager, Accountant, HR & Payroll and Self Service |
| **Clinic Setup** | Posting accounts and cashier receiving accounts, policies (pay-before-service, lab verification, review window, booking hours), clinics and service points, the charge master, tariffs (negotiated lines + markup), payers, lab catalogue, formulary, ICD-10 |

## ERP modules (from the Calbytes ERP / Hotel CBS core)

General ledger, journals, periods, budgets and financial reports · Receivables (payers) and Payables
(suppliers) with VAT and KRA eTIMS · Cash management, bank reconciliation, receipts and payment
vouchers, cash office floats · Fixed assets and depreciation · Inventory, item journal and stock
counts · Requisitions, imprest, petty cash and staff claims · HR (employees, edits, contract
changes, exits, organogram, leave) and Payroll (PAYE, NSSF, SHIF, Housing Levy, payslips, P9) ·
Administration (users, roles and permission sets, approval workflows, audit trail, change log,
System Automation job queue, No. Series, configuration packages, companies, appearance) ·
Integrations (M-Pesa Daraja, e-mail, SMS, eTIMS).

### How the money moves

Every posting goes through one engine, `postJournal()` in `lib/accounting.ts`.

- **Cashier receipt**: Dr the till / M-Pesa / card / bank account, Cr Patient Receivables (1210).
- **Finalise bill**: Dr Patient Receivables (patient share) + Dr Unbilled Insurance Claims (1215,
  scheme share) + Dr Discounts & Waivers (6125), Cr the revenue account of each line's category
  (4010 consultation, 4015 registration, 4020 lab, 4025 imaging, 4030 dental, 4040 pharmacy, 4050
  procedures).
- **Claim approved**: sales invoice to the payer — Dr Trade Debtors (1220) / Cr Unbilled Claims (1215).
  Rejected or short-paid: Dr Claim Rejections (6152) / Cr Unbilled Claims.
- **Dispensing**: Dr Drugs Consumed (5010) / Cr Drug Inventory (1310) at FIFO cost.
- **Receipt void**: the exact reverse of the receipt's journal.

## Getting started

```bash
pnpm install
```

Fill in `DATABASE_URL` in `.env` (and `FIELD_ENCRYPTION_KEY` for anything beyond a laptop), then:

```bash
pnpm db:migrate
```

Seed (recommended from the command line — the demonstration drives a month of real clinic work
through the services, which takes a few minutes against a remote database):

```bash
node --env-file=.env --conditions=react-server --experimental-transform-types scripts/seed.ts
```

```bash
pnpm dev
```

`SEED_DEMO_VISITS` (default 24) and `SEED_DEMO_PATIENTS` (default 36) size the demonstration;
`SEED_DEMO_DATA=false` lays down setup data only.

### Demo sign-ins

The System Administrator signs in with `ADMIN_INITIAL_USERNAME` / `ADMIN_INITIAL_PASSWORD` from `.env`
(default `admin`). Each other seeded account has the role in brackets, and its development password
is in `DEMO_USERS` in `lib/seed.ts`:

- `director` (Medical Director)
- `admin2` (Clinic Administrator)
- `reception`
- `doctor` (Medical Officer)
- `co` (Clinical Officer)
- `dentist`
- `nurse`
- `lab` and `lab2` (Laboratory Technologists, so one can enter and the other verify)
- `pharmacist`
- `cashier`
- `claims`
- `finance`
- `hr`
- `auditor`

With `SEED_DEMO_DATA=false` (the production default) those accounts are disabled.

## Security

- **Authorisation on every entry point.** Every Server Action and page calls `requireAction()`. The
  permissions are Business Central–style sets of page and table rights per role. Sensitive
  capabilities sit on their own permission objects: revealing patient ID numbers, discounting,
  voiding receipts, verifying lab results and setting tariffs.
- **Integrity in the database.** Cashier receipts cannot be edited or deleted (void only). A verified
  lab result is locked. Nobody verifies their own result. Bills must balance. A patient has one open
  visit. An M-Pesa code is receipted once. CHECK constraints guard vitals, money and statuses. The
  audit log is append-only.
- **Health data.** National ID numbers are sealed at rest. Patient records never travel in
  configuration packages or into a company copy.

```bash
pnpm test:security
```

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm typecheck` | TypeScript, no emit |
| `pnpm lint` | ESLint |
| `pnpm test:security` | Security & integrity suite |
| `pnpm db:migrate` | Apply migrations |
