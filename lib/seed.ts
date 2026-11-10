/*
 * Seeds Wayside Clinic: the organisation, an outpatient clinic chart of accounts, roles and
 * permission sets, users and Role Centre profiles, ready-to-use approval workflows, every ERP setup
 * (G/L, cash, VAT, receivables, payables, fixed assets, inventory, HR & payroll) and the clinic's own
 * reference data — departments, the charge master and tariffs, payers (SHA, insurers, employers),
 * the laboratory catalogue with reference ranges, the drug formulary with opening stock, dental
 * procedure codes and the common ICD-10 outpatient set.
 *
 * A demonstration install then drives a month of real clinic work through the same services the
 * screens use, on a moving clock (lib/input.ts setDemoClock): patients registered, visits checked
 * in, triaged, seen, diagnosed, tested in the lab, prescribed and dispensed, dental charting and
 * treatment plans, bills finalised, cash and M-Pesa receipts, insurance claims submitted and
 * decided (invoiced to the payers in Receivables) — and today's clinic in progress.
 *
 * Idempotent: skips if the organisation row exists. Production (NODE_ENV=production without
 * SEED_DEMO_DATA=true) lays down reference data only and hardens the admin sign-in.
 */
import crypto from 'node:crypto';
import { one, all, run, tx, nextSequence } from './db.ts';
import { hashPassword } from './auth.ts';
import { PRESETS } from './themes.ts';
import { expandActionsToLines, type ActionKey } from './permissions.ts';
import { NO_SERIES_DOCUMENTS } from './noSeries.ts';
import { addMonths, addDays } from './dateFormula.ts';
import { setDemoClock } from './input.ts';
import * as faLib from './fixedAssets.ts';
import * as faJournalLib from './faJournal.ts';
import * as faDeprLib from './fixedAssetDepreciation.ts';
import * as vendorLib from './vendors.ts';
import * as purchaseLib from './purchaseDocuments.ts';
import * as clinicSetup from './clinic/setup.ts';
import * as patientsLib from './clinic/patients.ts';
import * as visitsLib from './clinic/visits.ts';
import * as consultLib from './clinic/consultation.ts';
import * as billingLib from './clinic/billing.ts';
import * as labLib from './clinic/lab.ts';
import * as imagingLib from './clinic/imaging.ts';
import * as pharmacyLib from './clinic/pharmacy.ts';
import * as dentalLib from './clinic/dental.ts';
import * as claimsLib from './clinic/claims.ts';
import * as apptLib from './clinic/appointments.ts';
import { ICD10_COMMON, LAB_CATALOGUE, DRUG_FORMULARY, DENTAL_PROCEDURES, CLINIC_SERVICES } from './clinic/referenceData.ts';
import { encryptField, lastFour } from './fieldCrypto.ts';
import type { Actor, Cents, GlAccountStructureType, GlAccountType, IsoDate, IsoDateTime } from './types.ts';

const K = (n: number): Cents => Math.round(n * 100); // shillings -> cents

// deterministic PRNG so demo data is reproducible
let seedState = 20261109;
const rnd = (): number => ((seedState = (seedState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));

type ChartRow = [
  code: string, name: string, type: GlAccountType, parent: string | null, postable: 0 | 1,
  /** Business Central structure type. Omitted rows are Posting (postable) or Heading. */
  accountType?: GlAccountStructureType,
  /** End-Total only — the code range it sums. */
  totaling?: string,
];

/** An outpatient clinic's chart, bracketed Business Central style (Begin-Total … End-Total). */
const CHART: ChartRow[] = [
  ['1000', 'CASH AND CASH EQUIVALENTS', 'ASSET', null, 0, 'BEGIN_TOTAL'],
  ['1010', 'Petty Cash', 'ASSET', '1000', 1],
  ['1012', 'Cashier Till — Main Reception', 'ASSET', '1000', 1],
  ['1015', 'Cash Office Float', 'ASSET', '1000', 1],
  ['1020', 'Bank — Equity Bank Current Account (KES)', 'ASSET', '1000', 1],
  ['1025', 'Bank — KCB Collections Account', 'ASSET', '1000', 1],
  ['1030', 'M-Pesa Paybill Settlement', 'ASSET', '1000', 1],
  ['1040', 'Card Settlement Clearing', 'ASSET', '1000', 1],
  ['1099', 'CASH AND CASH EQUIVALENTS TOTAL', 'ASSET', null, 0, 'END_TOTAL', '1000..1099'],
  ['1200', 'RECEIVABLES', 'ASSET', null, 0, 'BEGIN_TOTAL'],
  ['1210', 'Patient Receivables (cash & co-pay)', 'ASSET', '1200', 1],
  ['1215', 'Unbilled Insurance Claims', 'ASSET', '1200', 1],
  ['1220', 'Trade Debtors — Insurers, SHA & Corporates', 'ASSET', '1200', 1],
  ['1230', 'Staff Receivables (Imprest Control)', 'ASSET', '1200', 1],
  ['1250', 'Other Receivables', 'ASSET', '1200', 1],
  ['1260', 'VAT Input Recoverable', 'ASSET', '1200', 1],
  ['1265', 'Withholding Tax Credits Receivable', 'ASSET', '1200', 1],
  ['1270', 'Prepayments (rent, insurance, licences)', 'ASSET', '1200', 1],
  ['1299', 'RECEIVABLES TOTAL', 'ASSET', null, 0, 'END_TOTAL', '1200..1299'],
  ['1300', 'INVENTORIES', 'ASSET', null, 0, 'BEGIN_TOTAL'],
  ['1310', 'Drugs & Pharmaceuticals', 'ASSET', '1300', 1],
  ['1320', 'Medical & Dental Consumables', 'ASSET', '1300', 1],
  ['1330', 'Laboratory Reagents & Supplies', 'ASSET', '1300', 1],
  ['1399', 'INVENTORIES TOTAL', 'ASSET', null, 0, 'END_TOTAL', '1300..1399'],
  ['1400', 'PROPERTY & EQUIPMENT', 'ASSET', null, 0, 'BEGIN_TOTAL'],
  ['1410', 'Leasehold Improvements (clinic fit-out)', 'ASSET', '1400', 1],
  ['1415', 'Accumulated Depreciation — Leasehold', 'ASSET', '1400', 1],
  ['1420', 'Furniture & Fittings', 'ASSET', '1400', 1],
  ['1425', 'Accumulated Depreciation — Furniture', 'ASSET', '1400', 1],
  ['1430', 'Medical, Dental & Laboratory Equipment', 'ASSET', '1400', 1],
  ['1435', 'Accumulated Depreciation — Medical Equipment', 'ASSET', '1400', 1],
  ['1440', 'Computers & IT Equipment', 'ASSET', '1400', 1],
  ['1445', 'Accumulated Depreciation — Computers', 'ASSET', '1400', 1],
  ['1450', 'Motor Vehicles (ambulance / outreach)', 'ASSET', '1400', 1],
  ['1455', 'Accumulated Depreciation — Vehicles', 'ASSET', '1400', 1],
  ['1499', 'PROPERTY & EQUIPMENT TOTAL', 'ASSET', null, 0, 'END_TOTAL', '1400..1499'],
  ['2000', 'CURRENT LIABILITIES', 'LIABILITY', null, 0, 'BEGIN_TOTAL'],
  ['2010', 'Patient Deposits', 'LIABILITY', '2000', 1],
  ['2020', 'Accounts Payable — Trade', 'LIABILITY', '2000', 1],
  ['2030', 'VAT Output Payable', 'LIABILITY', '2000', 1],
  ['2060', 'PAYE Payable', 'LIABILITY', '2000', 1],
  ['2061', 'NSSF Payable', 'LIABILITY', '2000', 1],
  ['2062', 'SHIF Payable', 'LIABILITY', '2000', 1],
  ['2063', 'Affordable Housing Levy Payable', 'LIABILITY', '2000', 1],
  ['2064', 'Net Pay Payable', 'LIABILITY', '2000', 1],
  ['2065', 'NITA Levy Payable', 'LIABILITY', '2000', 1],
  ['2070', 'Withholding Tax Payable', 'LIABILITY', '2000', 1],
  ['2071', 'Withholding VAT Payable', 'LIABILITY', '2000', 1],
  ['2075', 'Locum & Visiting Specialist Fees Payable', 'LIABILITY', '2000', 1],
  ['2080', 'Accrued Expenses', 'LIABILITY', '2000', 1],
  ['2090', 'Corporation Tax Payable', 'LIABILITY', '2000', 1],
  ['2160', 'Goods Received Not Invoiced', 'LIABILITY', '2000', 1],
  ['2170', 'Directors\' Current Accounts', 'LIABILITY', '2000', 1],
  ['2199', 'CURRENT LIABILITIES TOTAL', 'LIABILITY', null, 0, 'END_TOTAL', '2000..2199'],
  ['3000', 'EQUITY', 'EQUITY', null, 0, 'BEGIN_TOTAL'],
  ['3010', 'Share Capital', 'EQUITY', '3000', 1],
  ['3020', 'Retained Earnings', 'EQUITY', '3000', 1],
  ['3099', 'EQUITY TOTAL', 'EQUITY', null, 0, 'END_TOTAL', '3000..3099'],
  ['4000', 'REVENUE', 'INCOME', null, 0, 'BEGIN_TOTAL'],
  ['4010', 'Consultation Fees', 'INCOME', '4000', 1],
  ['4015', 'Registration Fees', 'INCOME', '4000', 1],
  ['4020', 'Laboratory Income', 'INCOME', '4000', 1],
  ['4025', 'Imaging & Radiology Income', 'INCOME', '4000', 1],
  ['4030', 'Dental Services Income', 'INCOME', '4000', 1],
  ['4040', 'Pharmacy Sales', 'INCOME', '4000', 1],
  ['4050', 'Procedures & Nursing Income', 'INCOME', '4000', 1],
  ['4060', 'Other Clinical Income (medicals, reports)', 'INCOME', '4000', 1],
  ['4085', 'Finance Charges & Fees', 'INCOME', '4000', 1],
  ['4086', 'Discounts Received & Rounding', 'INCOME', '4000', 1],
  ['4095', 'Other Income', 'INCOME', '4000', 1],
  ['4096', 'Realised Exchange Gains', 'INCOME', '4000', 1],
  ['4097', 'Unrealised Exchange Gains', 'INCOME', '4000', 1],
  ['4099', 'REVENUE TOTAL', 'INCOME', null, 0, 'END_TOTAL', '4000..4099'],
  ['5000', 'COST OF CARE', 'EXPENSE', null, 0, 'BEGIN_TOTAL'],
  ['5010', 'Drugs & Pharmaceuticals Consumed', 'EXPENSE', '5000', 1],
  ['5020', 'Medical & Dental Consumables Used', 'EXPENSE', '5000', 1],
  ['5030', 'Laboratory Reagents Used', 'EXPENSE', '5000', 1],
  ['5040', 'Locum & Visiting Specialist Fees', 'EXPENSE', '5000', 1],
  ['5050', 'Outsourced Laboratory & Imaging', 'EXPENSE', '5000', 1],
  ['5099', 'COST OF CARE TOTAL', 'EXPENSE', null, 0, 'END_TOTAL', '5000..5099'],
  ['6000', 'OPERATING EXPENSES', 'EXPENSE', null, 0, 'BEGIN_TOTAL'],
  ['6010', 'Salaries & Wages', 'EXPENSE', '6000', 1],
  ['6015', 'Employer NSSF', 'EXPENSE', '6000', 1],
  ['6016', 'Employer Housing Levy', 'EXPENSE', '6000', 1],
  ['6017', 'NITA Levy', 'EXPENSE', '6000', 1],
  ['6020', 'Staff Welfare, Uniforms & CPD', 'EXPENSE', '6000', 1],
  ['6030', 'Electricity & Internet', 'EXPENSE', '6000', 1],
  ['6031', 'Water', 'EXPENSE', '6000', 1],
  ['6035', 'Medical Waste Disposal', 'EXPENSE', '6000', 1],
  ['6040', 'Software & Systems', 'EXPENSE', '6000', 1],
  ['6050', 'Repairs & Equipment Maintenance', 'EXPENSE', '6000', 1],
  ['6060', 'Marketing & Community Outreach', 'EXPENSE', '6000', 1],
  ['6070', 'Card & M-Pesa Charges', 'EXPENSE', '6000', 1],
  ['6080', 'Insurance (malpractice, property)', 'EXPENSE', '6000', 1],
  ['6090', 'Professional Fees (audit, legal)', 'EXPENSE', '6000', 1],
  ['6095', 'Licences & Permits (KMPDC, PPB, NEMA, county)', 'EXPENSE', '6000', 1],
  ['6100', 'Depreciation', 'EXPENSE', '6000', 1],
  ['6110', 'Rent & Rates', 'EXPENSE', '6000', 1],
  ['6120', 'Bank Charges', 'EXPENSE', '6000', 1],
  ['6125', 'Discounts & Waivers Allowed', 'EXPENSE', '6000', 1],
  ['6130', 'Realised Exchange Losses', 'EXPENSE', '6000', 1],
  ['6131', 'Unrealised Exchange Losses', 'EXPENSE', '6000', 1],
  ['6140', 'Cash Shortages & Overages', 'EXPENSE', '6000', 1],
  ['6150', 'Bad Debts', 'EXPENSE', '6000', 1],
  ['6152', 'Insurance Claim Rejections', 'EXPENSE', '6000', 1],
  ['6155', 'Loss on Disposal of Assets', 'EXPENSE', '6000', 1],
  ['6160', 'Inventory Adjustments & Expiries', 'EXPENSE', '6000', 1],
  ['6170', 'Office & General Expenses', 'EXPENSE', '6000', 1],
  ['6180', 'Travel & Transport', 'EXPENSE', '6000', 1],
  ['6199', 'OPERATING EXPENSES TOTAL', 'EXPENSE', null, 0, 'END_TOTAL', '6000..6199'],
  ['7000', 'TAXATION', 'EXPENSE', null, 0, 'BEGIN_TOTAL'],
  ['7010', 'Corporation Tax Expense', 'EXPENSE', '7000', 1],
  ['7099', 'TAXATION TOTAL', 'EXPENSE', null, 0, 'END_TOTAL', '7000..7099'],
];

interface RoleSeed {
  name: string;
  description: string;
  /** Which named actions (see lib/permissions.ts) this role's Permission Set lines
   *  are expanded from. System Administrator gets none — is_system implies full access. */
  actions: ActionKey[];
}

const SELF: ActionKey[] = [
  'SELF_SERVICE_VIEW', 'SELF_SERVICE_PAYSLIP_READ', 'SELF_SERVICE_P9_READ', 'SELF_SERVICE_RECORD_READ', 'SELF_SERVICE_RECORD_UPDATE',
  'SELF_SERVICE_LEAVE_READ', 'SELF_SERVICE_LEAVE_CREATE', 'SELF_SERVICE_LEAVE_PLANS_READ', 'SELF_SERVICE_LEAVE_PLANS_CREATE',
  'SELF_SERVICE_IMPREST_READ', 'SELF_SERVICE_IMPREST_CREATE', 'SELF_SERVICE_PETTY_CASH_READ', 'SELF_SERVICE_PETTY_CASH_CREATE',
  'SELF_SERVICE_REQUISITIONS_READ', 'SELF_SERVICE_REQUISITIONS_CREATE',
];
const FINANCE_CORE: ActionKey[] = [
  'GL_READ', 'GL_JOURNAL_CREATE', 'GL_JOURNAL_APPROVE', 'GL_JOURNAL_REVERSE', 'GL_PERIOD_CLOSE', 'GL_PERIOD_CREATE',
  'GL_ACCOUNT_MANAGE', 'GL_BANK_RECONCILE', 'GL_CLOSE_INCOME_STATEMENT',
  'RECEIVABLES_READ', 'RECEIVABLES_CUSTOMER_MANAGE', 'RECEIVABLES_SALES_CREATE', 'RECEIVABLES_SALES_APPROVE',
  'RECEIVABLES_SALES_POST', 'RECEIVABLES_REMINDER_MANAGE', 'RECEIVABLES_APPLY_ENTRIES', 'RECEIVABLES_SETUP_MANAGE', 'RECEIVABLES_MPESA_REQUEST',
  'PAYABLES_READ', 'PAYABLES_VENDOR_MANAGE', 'PAYABLES_PURCHASE_CREATE', 'PAYABLES_PURCHASE_APPROVE',
  'PAYABLES_PURCHASE_POST', 'PAYABLES_APPLY_ENTRIES', 'PAYABLES_SETUP_MANAGE',
  'CASH_MGMT_READ', 'CASH_MGMT_BANK_MANAGE', 'CASH_MGMT_SETUP_MANAGE', 'CASH_MGMT_CURRENCY_MANAGE', 'CASH_MGMT_RECONCILE',
  'CASH_MGMT_FX_ADJUST', 'CASH_MGMT_RECEIPT_CREATE', 'CASH_MGMT_RECEIPT_APPROVE', 'CASH_MGMT_RECEIPT_POST',
  'CASH_MGMT_PV_CREATE', 'CASH_MGMT_PV_APPROVE', 'CASH_MGMT_PV_POST', 'CASH_MGMT_APPLY_ENTRIES',
  'VAT_REPORT_READ', 'VAT_SETUP_MANAGE', 'WHT_CERTIFICATE_PRINT', 'WHT_MARK_REMITTED', 'CURRENCY_SETUP_MANAGE',
  'FIXED_ASSETS_READ', 'FIXED_ASSETS_ASSET_MANAGE', 'FIXED_ASSETS_SETUP_MANAGE', 'FIXED_ASSETS_JOURNAL_CREATE',
  'FIXED_ASSETS_JOURNAL_APPROVE', 'FIXED_ASSETS_JOURNAL_POST', 'FIXED_ASSETS_DEPRECIATION_RUN',
  'INVENTORY_READ', 'INVENTORY_ITEM_MANAGE', 'INVENTORY_SETUP_MANAGE', 'INVENTORY_JOURNAL_CREATE',
  'INVENTORY_JOURNAL_APPROVE', 'INVENTORY_JOURNAL_POST', 'STOCK_COUNT_READ', 'STOCK_COUNT_ENTER', 'STOCK_COUNT_POST',
  'GL_BUDGETS_READ', 'GL_BUDGETS_MANAGE', 'FINANCIAL_REPORTS_READ', 'FINANCIAL_REPORTS_MANAGE', 'REPORTS_VIEW',
  'IMPREST_READ', 'IMPREST_APPROVE', 'IMPREST_ISSUE', 'IMPREST_POST', 'REQUISITIONS_READ', 'REQUISITIONS_APPROVE',
  'REQUISITIONS_PROCESS', 'ADMIN_POOL_IMPREST_PURPOSES_MANAGE',
  'CASH_MANAGEMENT_READ', 'CASH_MANAGEMENT_POST', 'TILL_CLOSINGS_READ', 'TILL_CLOSINGS_POST', 'CASHIER_SETUP_READ', 'DENOMINATIONS_READ',
];
/** Every clinical screen, read-only. */
const CLINICAL_READ: ActionKey[] = [
  'PATIENTS_READ', 'APPOINTMENTS_READ', 'VISITS_READ', 'DENTAL_READ', 'LAB_READ', 'IMAGING_READ', 'PHARMACY_READ', 'PROCEDURES_READ',
  'CASHIER_READ', 'CLAIMS_READ', 'CLINIC_REPORTS_VIEW', 'CLINIC_SETUP_READ',
];
const FRONT_DESK: ActionKey[] = ['PATIENTS_READ', 'PATIENTS_MANAGE', 'APPOINTMENTS_READ', 'APPOINTMENTS_MANAGE', 'VISITS_READ', 'VISITS_CHECK_IN', 'QUEUES_WORK'];
const CLINICIAN: ActionKey[] = [
  'PATIENTS_READ', 'PATIENTS_MANAGE', 'APPOINTMENTS_READ', 'APPOINTMENTS_MANAGE', 'VISITS_READ', 'QUEUES_WORK', 'TRIAGE_RECORD', 'CONSULTATION_WORK',
  'LAB_READ', 'IMAGING_READ', 'PHARMACY_READ', 'PROCEDURES_READ', 'PROCEDURES_WORK', 'DENTAL_READ', 'CLINIC_REPORTS_VIEW',
];

export const ROLES: RoleSeed[] = [
  { name: 'System Administrator', description: 'Full access including configuration and security.', actions: [] },
  {
    name: 'Medical Director',
    description: 'Runs the clinic — every clinical and financial screen to read, clinical work, prices, discounts and the approvals.',
    actions: [
      'DASHBOARD_VIEW', 'APPROVALS_VIEW', ...CLINICAL_READ, ...CLINICIAN, 'DENTAL_WORK', 'LAB_VERIFY', 'PATIENTS_PII_VIEW', 'CASHIER_DISCOUNT', 'CASHIER_VOID',
      'CLINIC_SETUP_MANAGE', 'CLINIC_PRICES_MANAGE', 'GL_READ', 'REPORTS_VIEW', 'FINANCIAL_REPORTS_READ', 'GL_BUDGETS_READ', 'RECEIVABLES_READ', 'PAYABLES_READ',
      'CASH_MGMT_READ', 'CASH_MGMT_PV_APPROVE', 'CASH_MGMT_RECEIPT_APPROVE', 'PAYABLES_PURCHASE_APPROVE', 'RECEIVABLES_SALES_APPROVE',
      'FIXED_ASSETS_READ', 'INVENTORY_READ', 'EMPLOYEES_READ', 'PAYROLL_READ', 'PAYROLL_PERIODS_READ', 'PAYROLL_PERIODS_APPROVE',
      'LEAVE_APPLICATIONS_READ', 'LEAVE_APPLICATIONS_APPROVE', 'IMPREST_READ', 'IMPREST_APPROVE', 'REQUISITIONS_READ', 'REQUISITIONS_APPROVE',
      'ADMIN_AUDIT_VIEW', 'ORGANOGRAM_VIEW',
    ],
  },
  {
    name: 'Clinic Administrator',
    description: 'Runs the front of house — registration, bookings, queues, billing oversight, claims and the clinic setup.',
    actions: [
      'DASHBOARD_VIEW', 'APPROVALS_VIEW', ...CLINICAL_READ, ...FRONT_DESK, 'CASHIER_BILL', 'CASHIER_RECEIVE', 'CASHIER_DISCOUNT', 'CASHIER_VOID',
      'CLAIMS_MANAGE', 'CLINIC_SETUP_MANAGE', 'CLINIC_PRICES_MANAGE', 'INVENTORY_READ', 'REQUISITIONS_READ', 'TILL_CLOSINGS_READ', ...SELF,
    ],
  },
  { name: 'Receptionist', description: 'Registers patients, books appointments, checks patients in and runs the queues.', actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', ...FRONT_DESK, 'CASHIER_READ', ...SELF] },
  { name: 'Medical Officer', description: 'Sees patients — notes, diagnoses, orders, prescriptions, referrals and sick notes.', actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', ...CLINICIAN, ...SELF] },
  { name: 'Clinical Officer', description: 'Sees patients in the general outpatient clinic.', actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', ...CLINICIAN, ...SELF] },
  { name: 'Dentist', description: 'The dental clinic — odontogram, treatment plans and dental procedures, plus consultation and orders.', actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', ...CLINICIAN, 'DENTAL_WORK', 'IMAGING_WORK', ...SELF] },
  {
    name: 'Nurse', description: 'Triage and vital signs, procedures and nursing services, queues.',
    actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', 'PATIENTS_READ', 'VISITS_READ', 'QUEUES_WORK', 'TRIAGE_RECORD', 'PROCEDURES_READ', 'PROCEDURES_WORK', 'APPOINTMENTS_READ', ...SELF],
  },
  {
    name: 'Laboratory Technologist', description: 'Specimen collection, result entry and verification; imaging when the lab runs it.',
    actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', 'PATIENTS_READ', 'VISITS_READ', 'QUEUES_WORK', 'LAB_READ', 'LAB_WORK', 'LAB_VERIFY', 'IMAGING_READ', 'IMAGING_WORK', 'CLINIC_SETUP_READ', ...SELF],
  },
  {
    name: 'Pharmacist', description: 'Dispensing, the formulary and drug stock.',
    actions: [
      'DASHBOARD_VIEW', 'APPROVALS_VIEW', 'PATIENTS_READ', 'VISITS_READ', 'QUEUES_WORK', 'PHARMACY_READ', 'PHARMACY_DISPENSE', 'INVENTORY_READ',
      'INVENTORY_JOURNAL_CREATE', 'STOCK_COUNT_READ', 'STOCK_COUNT_ENTER', 'REQUISITIONS_READ', 'CLINIC_SETUP_READ', ...SELF,
    ],
  },
  {
    name: 'Cashier', description: 'Collects payments, adds counter charges, finalises bills and closes the till.',
    actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', 'PATIENTS_READ', 'VISITS_READ', 'QUEUES_WORK', 'CASHIER_READ', 'CASHIER_BILL', 'CASHIER_RECEIVE', 'TILL_CLOSINGS_READ', 'CASHIER_SETUP_READ', 'DENOMINATIONS_READ', ...SELF],
  },
  {
    name: 'Claims Officer', description: 'Pre-authorisations, claim submission and payer decisions; collections from insurers.',
    actions: ['DASHBOARD_VIEW', 'APPROVALS_VIEW', 'PATIENTS_READ', 'VISITS_READ', 'CASHIER_READ', 'CLAIMS_READ', 'CLAIMS_MANAGE', 'RECEIVABLES_READ', 'RECEIVABLES_APPLY_ENTRIES', 'CASH_MGMT_READ', 'CASH_MGMT_RECEIPT_CREATE', ...SELF],
  },
  {
    name: 'Finance Officer',
    description: 'The ledgers, payer receivables, payables, cash, tax, assets and inventory.',
    actions: [...FINANCE_CORE, 'DASHBOARD_VIEW', 'APPROVALS_VIEW', 'CASHIER_READ', 'CLAIMS_READ', 'CLAIMS_MANAGE', 'CLINIC_REPORTS_VIEW', 'PATIENTS_READ', ...SELF],
  },
  {
    name: 'HR & Payroll Officer',
    description: 'Employee records, leave and payroll processing.',
    actions: [
      'DASHBOARD_VIEW', 'APPROVALS_VIEW', 'EMPLOYEES_READ', 'EMPLOYEES_CREATE', 'EMPLOYEE_EDITS_READ', 'EMPLOYEE_EDITS_UPDATE',
      'EMPLOYEE_CONTRACT_CHANGES_READ', 'EMPLOYEE_CONTRACT_CHANGES_CREATE', 'EMPLOYEE_EXITS_READ', 'EMPLOYEE_EXITS_CREATE',
      'EMPLOYEE_EXITS_CLEAR', 'HR_JOB_GRADES_READ', 'HR_JOB_GRADES_MANAGE', 'HR_SALARY_SCALES_READ', 'HR_SALARY_SCALES_MANAGE',
      'HR_CONTRACT_TYPES_READ', 'HR_CONTRACT_TYPES_MANAGE', 'HR_TERMINATION_REASONS_READ', 'HR_TERMINATION_REASONS_MANAGE',
      'HR_CLEARANCE_SECTIONS_READ', 'HR_CLEARANCE_SECTIONS_MANAGE', 'LEAVE_APPLICATIONS_READ', 'LEAVE_APPLICATIONS_CREATE',
      'LEAVE_ADJUSTMENTS_READ', 'LEAVE_ADJUSTMENTS_CREATE', 'LEAVE_RECALLS_READ', 'LEAVE_RECALLS_CREATE', 'LEAVE_PLANS_READ',
      'LEAVE_PLANS_CREATE', 'HR_LEAVE_TYPES_READ', 'HR_LEAVE_TYPES_MANAGE', 'HR_LEAVE_CALENDAR_READ', 'HR_LEAVE_CALENDAR_MANAGE',
      'HR_HOLIDAYS_READ', 'HR_HOLIDAYS_MANAGE', 'HR_ACCRUE_MATRIX_READ', 'HR_ACCRUE_MATRIX_MANAGE', 'HR_LEAVE_ACCRUAL_RUN',
      'COMPANY_JOBS_READ', 'COMPANY_JOBS_CREATE', 'ORGANOGRAM_VIEW',
      'PAYROLL_READ', 'PAYROLL_MANAGE_TRANSACTIONS', 'PAYROLL_PERIODS_READ', 'PAYROLL_PERIODS_CREATE', 'PAYROLL_PERIODS_RUN',
      'PAYROLL_PERIODS_CLOSE', 'PAYROLL_SETUP_READ', 'PAYROLL_SETUP_MANAGE', 'PAYROLL_POSTING_GROUPS_READ',
      'PAYROLL_POSTING_GROUPS_MANAGE', 'PAYROLL_PAYE_BANDS_READ', 'PAYROLL_PAYE_BANDS_MANAGE', 'PAYROLL_NSSF_TIERS_READ',
      'PAYROLL_NSSF_TIERS_MANAGE', 'PAYROLL_TRANSACTION_CODES_READ', 'PAYROLL_TRANSACTION_CODES_MANAGE', ...SELF,
    ],
  },
  {
    name: 'Internal Auditor',
    description: 'Read-only across the clinic and the ledgers, including the audit trail and change log.',
    actions: [
      'DASHBOARD_VIEW', ...CLINICAL_READ, 'GL_READ', 'REPORTS_VIEW', 'FINANCIAL_REPORTS_READ', 'RECEIVABLES_READ', 'PAYABLES_READ',
      'CASH_MGMT_READ', 'FIXED_ASSETS_READ', 'INVENTORY_READ', 'STOCK_COUNT_READ', 'VAT_REPORT_READ', 'GL_BUDGETS_READ',
      'EMPLOYEES_READ', 'PAYROLL_READ', 'PAYROLL_PERIODS_READ', 'IMPREST_READ', 'REQUISITIONS_READ', 'TILL_CLOSINGS_READ',
      'CASH_MANAGEMENT_READ', 'ADMIN_AUDIT_VIEW',
    ],
  },
  { name: 'Employee', description: 'Employee Self Service — own payslips, leave, imprests and requisitions.', actions: SELF },
];

/**
 * The System Administrator's sign-in: ADMIN_INITIAL_USERNAME / ADMIN_INITIAL_PASSWORD when set
 * (kept in .env, never in source), otherwise the demo `admin` account below.
 */
export const ADMIN_USERNAME = process.env.ADMIN_INITIAL_USERNAME?.trim() || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD?.trim() || 'Admin@Wayside2026';

/**
 * The demonstration sign-ins. Every password meets the password policy; production disables all
 * of them except the administrator, who gets a one-off password (see hardenForProduction()).
 */
export const DEMO_USERS: [username: string, fullName: string, role: string, password: string, profiles: string[]][] = [
  [ADMIN_USERNAME, ADMIN_USERNAME === 'admin' ? 'Henry Ngari Githaiga' : ADMIN_USERNAME, 'System Administrator', ADMIN_PASSWORD,
    ['SUPER', 'RECEPTION', 'CLINICIAN', 'NURSE', 'DENTAL', 'LAB', 'PHARMACY', 'CASHIER', 'CLAIMS', 'FINANCE_MANAGER', 'ACCOUNTANT', 'HR_PAYROLL', 'SELF_SERVICE']],
  ['director', 'Dr. Amina Wanjiru', 'Medical Director', 'Director@Wayside2026', ['SUPER', 'CLINICIAN', 'FINANCE_MANAGER']],
  ['admin2', 'Ruth Akinyi', 'Clinic Administrator', 'Clinic@Wayside2026', ['RECEPTION', 'CASHIER', 'CLAIMS', 'SELF_SERVICE']],
  ['reception', 'Mary Wairimu', 'Receptionist', 'Reception@Wayside2026', ['RECEPTION', 'SELF_SERVICE']],
  ['doctor', 'Dr. David Kiprono', 'Medical Officer', 'Doctor@Wayside2026', ['CLINICIAN', 'SELF_SERVICE']],
  ['co', 'Paul Mwangi', 'Clinical Officer', 'Clinical@Wayside2026', ['CLINICIAN', 'SELF_SERVICE']],
  ['dentist', 'Dr. Sarah Njoroge', 'Dentist', 'Dentist@Wayside2026', ['DENTAL', 'CLINICIAN', 'SELF_SERVICE']],
  ['nurse', 'Esther Chepkoech', 'Nurse', 'Nurse@Wayside2026', ['NURSE', 'SELF_SERVICE']],
  ['lab', 'John Omondi', 'Laboratory Technologist', 'Lab@Wayside2026', ['LAB', 'SELF_SERVICE']],
  ['lab2', 'Lucy Wangari', 'Laboratory Technologist', 'Lab2@Wayside2026', ['LAB', 'SELF_SERVICE']],
  ['pharmacist', 'Peter Kamau', 'Pharmacist', 'Pharmacy@Wayside2026', ['PHARMACY', 'SELF_SERVICE']],
  ['cashier', 'Janet Muthoni', 'Cashier', 'Cashier@Wayside2026', ['CASHIER', 'SELF_SERVICE']],
  ['claims', 'Brian Odhiambo', 'Claims Officer', 'Claims@Wayside2026', ['CLAIMS', 'SELF_SERVICE']],
  ['finance', 'Grace Wambui', 'Finance Officer', 'Finance@Wayside2026', ['FINANCE_MANAGER', 'ACCOUNTANT', 'SELF_SERVICE']],
  ['hr', 'Joyce Njeri', 'HR & Payroll Officer', 'People@Wayside2026', ['HR_PAYROLL', 'SELF_SERVICE']],
  ['auditor', 'Victor Barasa', 'Internal Auditor', 'Auditor@Wayside2026', ['SUPER', 'FINANCE_MANAGER', 'ACCOUNTANT']],
];

const SYS: Actor = { id: 1, username: 'system' };
/**
 * One multi-row INSERT instead of a statement per row — the database is a long round trip away,
 * and a seed is thousands of rows.
 */
async function insertMany(table: string, columns: string[], rows: unknown[][], suffix = ''): Promise<void> {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const values = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await run(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values} ${suffix}`, ...chunk.flat());
  }
}

async function accId(code: string): Promise<number> {
  const r = await one<{ id: number }>('SELECT id FROM gl_account WHERE code = ?', code);
  if (!r) throw new Error(`Seed: G/L account ${code} missing`);
  return r.id;
}
const bankId = async (code: string): Promise<number> => (await one<{ id: number }>('SELECT id FROM bank_account WHERE code = ?', code))!.id;
const userId = async (username: string): Promise<number> => (await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', username))!.id;

/* ================================================================ reference data */

async function seedReferenceData(now: IsoDateTime, todayIso: IsoDate): Promise<void> {
  const SEQS: [string, string, number, number][] = [
    ['PATIENT', 'WC', 10001, 6], ['APPOINTMENT', 'APT', 1, 6], ['VISIT', 'OPV', 1, 7], ['LAB_ORDER', 'LAB', 1, 6],
    ['LAB_SPECIMEN', 'SP', 1, 7], ['IMAGING_ORDER', 'RAD', 1, 6], ['PRESCRIPTION', 'RX', 1, 6], ['DENTAL_PLAN', 'DTP', 1, 5],
    ['CLINICAL_DOCUMENT', 'DOC', 1, 6], ['PATIENT_BILL', 'BIL', 1, 7], ['PATIENT_RECEIPT', 'RCP', 1, 7], ['INSURANCE_CLAIM', 'CLM', 1, 6],
    ['PREAUTH', 'PA', 1, 6],
    ['JOURNAL', 'JV', 1, 8], ['JOURNAL_DRAFT', 'JVD', 1, 6], ['CASH_OFFICE_TRANSFER', 'CTF', 1, 6],
    ['TILL_CLOSING', 'CCL', 1, 6], ['ITEM', 'ITM', 1, 6], ['ITEM_JOURNAL', 'IJL', 1, 6], ['STOCK_COUNT', 'PHC', 1, 6], ['FIXED_ASSET', 'FA', 1, 6],
    ['FA_JOURNAL', 'FAJ', 1, 6], ['CUSTOMER', 'C', 1001, 5], ['SALES_QUOTE', 'SQ', 1, 6], ['SALES_ORDER', 'SO', 1, 6],
    ['SALES_INVOICE', 'SI', 1, 6], ['SALES_CREDIT_MEMO', 'SM', 1, 6], ['POSTED_SALES_SHIPMENT', 'PSHP', 1, 6],
    ['POSTED_SALES_INVOICE', 'INV', 1, 6], ['POSTED_SALES_CREDIT_MEMO', 'CRN', 1, 6], ['REMINDER', 'REM', 1, 6],
    ['FIN_CHARGE_MEMO', 'FCM', 1, 6], ['VENDOR', 'V', 1001, 5], ['PURCHASE_QUOTE', 'PQ', 1, 6], ['PURCHASE_ORDER', 'PO', 1, 6],
    ['PURCHASE_INVOICE', 'PI', 1, 6], ['PURCHASE_CREDIT_MEMO', 'PM', 1, 6], ['POSTED_PURCHASE_RECEIPT', 'PRCP', 1, 6],
    ['POSTED_PURCHASE_INVOICE', 'PPI', 1, 6], ['POSTED_PURCHASE_CREDIT_MEMO', 'PPM', 1, 6], ['STORE_REQUISITION', 'SR', 1, 6],
    ['PURCHASE_REQUISITION', 'PR', 1, 6], ['RECEIPT', 'RCT', 1, 6], ['POSTED_RECEIPT', 'PRCT', 1, 6],
    ['PAYMENT_VOUCHER', 'PV', 1, 6], ['POSTED_PAYMENT_VOUCHER', 'PPV', 1, 6], ['BANK_RECONCILIATION', 'BREC', 1, 6],
    ['WHT_CERTIFICATE', 'WHT', 1, 6], ['IMPREST_REQUEST', 'IMP', 1, 6], ['PETTY_CASH', 'PC', 1, 6], ['STAFF_CLAIM', 'SC-', 1, 6],
    ['EMPLOYEE', 'WCS-', 101, 4], ['EMPLOYEE_EDIT', 'EED', 1, 6], ['EMPLOYEE_CONTRACT_CHANGE', 'ECC', 1, 6],
    ['EMPLOYEE_EXIT', 'EEX', 1, 6], ['COMPANY_JOB', 'JOB', 1, 4], ['LEAVE_APPLICATION', 'LVA', 1, 6],
    ['LEAVE_ADJUSTMENT', 'LVJ', 1, 6], ['LEAVE_RECALL', 'LVR', 1, 6], ['LEAVE_PLAN', 'LVP', 1, 6],
  ];
  await insertMany('sequence', ['name', 'prefix', 'next_no', 'width'], SEQS);

  // Business Central No. Series — every document on a managed series (code == document code)
  // plus its Admin Centre → No. Series assignment row.
  const seqMap = new Map(SEQS.map(([n, pfx, start, width]) => [n, pfx + String(start).padStart(width, '0')]));
  const docs = NO_SERIES_DOCUMENTS.filter((d) => seqMap.has(d.code));
  await insertMany('no_series', ['code', 'description', 'default_nos', 'manual_nos', 'date_order'], docs.map((d) => [d.code, d.label, 1, 0, 0]));
  await insertMany('no_series_line', ['series_code', 'line_no', 'starting_date', 'starting_no', 'increment_by_no', 'open', 'allow_gaps'],
    docs.map((d) => [d.code, 10000, null, seqMap.get(d.code), 1, 1, 0]));
  await insertMany('no_series_setup', ['document_code', 'label', 'category', 'sort', 'series_code'],
    docs.map((d) => [d.code, d.label, d.category, NO_SERIES_DOCUMENTS.indexOf(d), d.code]));

  await run(
    `INSERT INTO organisation (id, name, short_name, motto, registration_no, vat_registration_no, kra_pin,
      company_type, physical_address, postal_address, city, county, country, phone_primary, phone_secondary,
      email, website, paybill_no, bank_name, bank_account_no, currency_code, currency_symbol, locale, timezone,
      date_format, fy_start_month, fy_start_day, statement_footer, updated_at, updated_by)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    'Wayside Medical & Dental Clinic', 'Wayside Clinic',
    'Caring for every family, every visit.',
    // Registration, VAT and KRA PIN are entered by the administrator on Company Information.
    null, null, null, 'Private Limited Company',
    'Wayside Plaza, Ngong Road', 'P.O. Box 41205–00100', 'Nairobi', 'Nairobi', 'Kenya',
    '+254 700 123 456', '+254 733 123 456', 'care@waysideclinic.co.ke', 'https://waysideclinic.co.ke',
    null, null, null,
    'KES', 'KSh', 'en-KE', 'Africa/Nairobi', 'dd MMM yyyy', 1, 1,
    'Medical services are exempt from VAT. Please quote the claim or invoice number with your payment.',
    now, 'system',
  );
  await run(
    `INSERT INTO company (code, schema_name, display_name, is_default, created_at, created_by) VALUES ('MAIN', 'public', ?, true, ?, 'system')`,
    'Wayside Medical & Dental Clinic', now,
  );
  // The clinical teal palette (lib/themes.ts wayside-care).
  const preset = PRESETS['wayside-care'] ?? PRESETS['slate-professional'];
  await run('INSERT INTO theme (id, preset, tokens, updated_at, updated_by) VALUES (1,?,?,?,?)', 'wayside-care', JSON.stringify(preset.tokens), now, 'system');

  await insertMany('gl_account', ['code', 'name', 'type', 'parent_code', 'is_postable', 'account_type', 'totaling'],
    CHART.map(([code, name, type, parent, postable, accountType, totaling]) => [code, name, type, parent, postable, accountType ?? (postable ? 'POSTING' : 'HEADING'), totaling ?? null]));
  await indentSeededChart();

  /* ---- roles, users, profiles */
  for (const r of ROLES) {
    const isSystem = r.name === 'System Administrator';
    const info = await run('INSERT INTO role (name, description, is_system) VALUES (?,?,?)', r.name, r.description, isSystem ? 1 : 0);
    await insertMany('permission_set_line',
      ['role_id', 'object_type', 'object_name', 'read_perm', 'insert_perm', 'modify_perm', 'delete_perm', 'execute_perm'],
      expandActionsToLines(info.lastInsertRowid, r.actions).map((line) => [line.role_id, line.object_type, line.object_name,
        line.read ? 1 : 0, line.insert ? 1 : 0, line.modify ? 1 : 0, line.delete ? 1 : 0, line.execute ? 1 : 0]));
  }
  const PROFILES: [string, string, string, string, number, 0 | 1][] = [
    ['SUPER', 'Medical Director', 'The clinic at a glance — attendance, queues, billing and collections, morbidity and payers.', '🏥', 10, 1],
    ['RECEPTION', 'Reception & Front Office', 'Who is expected, who is in, the queues and check-in.', '🪪', 12, 0],
    ['CLINICIAN', 'Clinician', 'Your consultation queue and patients waiting on results.', '👩‍⚕️', 14, 0],
    ['NURSE', 'Nursing & Triage', 'The triage queue and the procedure room.', '🩺', 16, 0],
    ['DENTAL', 'Dental Clinic', 'The dental queue, today’s chairs and treatment plans.', '🦷', 18, 0],
    ['LAB', 'Laboratory', 'Specimens to collect, results to enter and verify, turnaround.', '🧪', 20, 0],
    ['PHARMACY', 'Pharmacy', 'Prescriptions to dispense and stock to reorder.', '💊', 22, 0],
    ['CASHIER', 'Cashier', 'Patients waiting to pay and today’s collections.', '💳', 24, 0],
    ['CLAIMS', 'Claims & Insurance', 'Claims to submit, decisions awaited and payer balances.', '🏛', 26, 0],
    ['FINANCE_MANAGER', 'Finance Manager', 'Profitability, the balance sheet, operating ratios and approvals.', '📈', 40, 0],
    ['ACCOUNTANT', 'Accountant', 'Journals, the trial balance, reconciliations and tax.', '📒', 50, 0],
    ['HR_PAYROLL', 'HR & Payroll', 'Employee records, leave and payroll processing.', '🧑‍💼', 60, 0],
    ['SELF_SERVICE', 'Employee Self Service', 'Your own payslips, P9, leave, imprests and requisitions.', '🙋', 70, 0],
  ];
  for (const [code, name, description, icon, sort, isDefault] of PROFILES) {
    await run(
      `INSERT INTO profile (code, name, description, role_centre, icon, sort, is_default, is_system, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,1,?,'system')`, code, name, description, code, icon, sort, isDefault, now,
    );
  }
  for (const [un, fn, role, pw, profiles] of DEMO_USERS) {
    const roleId = (await one<{ id: number }>('SELECT id FROM role WHERE name = ?', role))!.id;
    const info = await run(
      `INSERT INTO app_user (username, full_name, email, phone, password_hash, role_id, created_at) VALUES (?,?,?,?,?,?,?)`,
      un, fn, un === ADMIN_USERNAME ? 'care@waysideclinic.co.ke' : `${un}@waysideclinic.co.ke`, '+254 7' + int(10000000, 99999999), hashPassword(pw), roleId, now,
    );
    for (const code of profiles) {
      await run('INSERT INTO user_profile (user_id, profile_id) VALUES (?, (SELECT id FROM profile WHERE code = ?))', info.lastInsertRowid, code);
    }
    await run('UPDATE app_user SET active_profile_id = (SELECT id FROM profile WHERE code = ?) WHERE id = ?', profiles[0], info.lastInsertRowid);
  }
  // Per-user grants no role bypasses: the approval administrator (workflow fallback approver) and
  // who may reverse a posted journal.
  await run('INSERT INTO approval_user_setup (user_id, is_approval_administrator, can_reverse_journal) VALUES ((SELECT id FROM app_user WHERE username = ?),1,1)', ADMIN_USERNAME);
  await run("INSERT INTO approval_user_setup (user_id, can_reverse_journal) VALUES ((SELECT id FROM app_user WHERE username = 'finance'),1)");
  await run("INSERT INTO approval_user_setup (user_id, is_approval_administrator) VALUES ((SELECT id FROM app_user WHERE username = 'director'),1)");

  /* ---- accounting periods: 14 months back through 3 ahead */
  const periods: unknown[][] = [];
  for (let i = 14; i >= -3; i--) {
    const start = addMonths(`${todayIso.slice(0, 8)}01`, -i);
    periods.push([start.slice(0, 7), start, addDays(addMonths(start, 1), -1), 'OPEN', start.slice(5, 7) === '01' ? 1 : 0]);
  }
  await insertMany('accounting_period', ['code', 'start_date', 'end_date', 'status', 'new_fiscal_year'], periods);

  /* ---- bank & cash accounts */
  const INS_BA = 'INSERT INTO bank_account (code, name, gl_account_id, bank_name, account_no, account_type, created_at) VALUES (?,?,?,?,?,?,?)';
  await run(INS_BA, 'PETTY', 'Petty Cash', await accId('1010'), null, null, 'TILL', now);
  await run(INS_BA, 'TILL-1', 'Cashier Till — Main Reception', await accId('1012'), null, null, 'TILL', now);
  await run(INS_BA, 'VAULT', 'Cash Office Float', await accId('1015'), null, null, 'TREASURY', now);
  await run(INS_BA, 'EQUITY', 'Equity Bank Current Account', await accId('1020'), 'Equity Bank', null, 'MAIN', now);
  await run(INS_BA, 'KCB', 'KCB Collections Account', await accId('1025'), 'Kenya Commercial Bank', null, 'OTHER', now);
  await run(INS_BA, 'MPESA', 'M-Pesa Paybill', await accId('1030'), 'Safaricom M-Pesa', null, 'OTHER', now);
  await run(INS_BA, 'CARDS', 'Card Settlement', await accId('1040'), 'Equity Bank Merchant', null, 'OTHER', now);
  // Control accounts no manual journal may touch: banks and the subledgers.
  // Patient receivables are controlled by the clinic's billing — no manual journal touches them. (Unbilled claims stay
  // open: approving a claim invoices the payer against that account through Receivables.)
  await run("UPDATE gl_account SET no_direct_posting = 1 WHERE code IN ('1010','1012','1015','1020','1025','1030','1040','1210','1220','1230','2020')");

  /* ---- cash denominations and cash office setup */
  const DENOMS: [string, string, number][] = [
    ['N1000', 'KSh 1,000 note', K(1000)], ['N500', 'KSh 500 note', K(500)], ['N200', 'KSh 200 note', K(200)],
    ['N100', 'KSh 100 note', K(100)], ['N50', 'KSh 50 note', K(50)], ['C20', 'KSh 20 coin', K(20)],
    ['C10', 'KSh 10 coin', K(10)], ['C5', 'KSh 5 coin', K(5)], ['C1', 'KSh 1 coin', K(1)],
  ];
  for (const [i, [code, desc, value]] of DENOMS.entries()) {
    await run('INSERT INTO denomination (code, description, value, active, sort_order) VALUES (?,?,?,true,?)', code, desc, value, i + 1);
  }
  const INS_TS = `INSERT INTO cashier_setup (user_username, setup_type, bank_account_id, max_capacity, min_capacity, approval_limit, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?)`;
  await run(INS_TS, 'finance', 'TREASURY', await bankId('VAULT'), K(500000), K(20000), 0, now, 'system');
  await run(INS_TS, 'cashier', 'CASHIER', await bankId('TILL-1'), K(100000), K(5000), 0, now, 'system');

  /* ---- organisation G/L setup: imprest control, cash variance accounts, approval limits */
  await run(
    `UPDATE organisation SET imprest_control_account_id = ?, till_shortage_account_id = ?, till_overage_account_id = ?,
       receipt_approval_limit = ?, petty_cash_limit = ? WHERE id = 1`,
    await accId('1230'), await accId('6140'), await accId('6140'), K(100000), K(10000),
  );

  /* ---- System Automation */
  const INS_JQ = `INSERT INTO job_queue_entry (code, description, job_type, run_every_minutes, status, created_at, created_by) VALUES (?,?,?,?,?,?,'system')`;
  await run(INS_JQ, 'APPT-REMIND', 'SMS reminders to patients booked in the reminder window', 'APPOINTMENT_REMINDERS', 60, 'READY', now);
  await run(INS_JQ, 'NO-SHOW', 'Marks yesterday\'s unattended bookings as no-shows', 'NO_SHOW_SWEEP', 1440, 'READY', now);
  await run(INS_JQ, 'STALE-VISITS', 'Alerts the clinic manager to visits left open from earlier days', 'STALE_VISITS', 1440, 'READY', now);
  await run(INS_JQ, 'SESSION-PURGE', 'Removes expired and idle sign-in sessions', 'SESSION_PURGE', 60, 'READY', now);
  await run(INS_JQ, 'OUTBOX', 'Sends queued e-mails and SMS', 'OUTBOX_DISPATCH', 5, 'READY', now);
  await run(INS_JQ, 'ETIMS', 'Signs posted invoices with KRA eTIMS and retries failed ones', 'ETIMS_SUBMIT', 5, 'READY', now);

  /* ---- dimensions (business unit, department) and counties */
  for (const [code, name] of [['NGONG', 'Ngong Road Clinic']]) await run("INSERT INTO global_dimension_1_value (code, name, status) VALUES (?,?,'ACTIVE')", code, name);
  for (const [code, name] of [['OPD', 'General Outpatient'], ['DENTAL', 'Dental'], ['LAB', 'Laboratory & Imaging'], ['PHARM', 'Pharmacy'], ['NURSING', 'Nursing'], ['ADMIN', 'Administration & Finance']]) {
    await run("INSERT INTO global_dimension_2_value (code, name, status) VALUES (?,?,'ACTIVE')", code, name);
  }
  await run("UPDATE organisation SET global_dimension_1_caption = 'Branch', global_dimension_2_caption = 'Department' WHERE id = 1");
  for (const [code, name] of [['047', 'Nairobi'], ['022', 'Kiambu'], ['001', 'Mombasa'], ['032', 'Nakuru'], ['042', 'Kisumu']]) {
    await run("INSERT INTO county (code, name, status) VALUES (?,?,'ACTIVE')", code, name);
  }
}

/* ================================================================ HR & payroll */

const STAFF: [first: string, last: string, gender: string, title: string, dept: string, login: string | null][] = [
  ['Amina', 'Wanjiru', 'FEMALE', 'Medical Director', 'OPD', 'director'],
  ['Ruth', 'Akinyi', 'FEMALE', 'Clinic Administrator', 'ADMIN', 'admin2'],
  ['Mary', 'Wairimu', 'FEMALE', 'Receptionist', 'ADMIN', 'reception'],
  ['David', 'Kiprono', 'MALE', 'Medical Officer', 'OPD', 'doctor'],
  ['Paul', 'Mwangi', 'MALE', 'Clinical Officer', 'OPD', 'co'],
  ['Sarah', 'Njoroge', 'FEMALE', 'Dental Surgeon', 'DENTAL', 'dentist'],
  ['Faith', 'Atieno', 'FEMALE', 'Dental Technologist', 'DENTAL', null],
  ['Esther', 'Chepkoech', 'FEMALE', 'Registered Nurse', 'NURSING', 'nurse'],
  ['Kevin', 'Otieno', 'MALE', 'Enrolled Nurse', 'NURSING', null],
  ['John', 'Omondi', 'MALE', 'Laboratory Technologist', 'LAB', 'lab'],
  ['Lucy', 'Wangari', 'FEMALE', 'Laboratory Technologist', 'LAB', 'lab2'],
  ['Peter', 'Kamau', 'MALE', 'Pharmaceutical Technologist', 'PHARM', 'pharmacist'],
  ['Janet', 'Muthoni', 'FEMALE', 'Cashier', 'ADMIN', 'cashier'],
  ['Brian', 'Odhiambo', 'MALE', 'Claims Officer', 'ADMIN', 'claims'],
  ['Grace', 'Wambui', 'FEMALE', 'Accountant', 'ADMIN', 'finance'],
  ['Joyce', 'Njeri', 'FEMALE', 'HR Officer', 'ADMIN', 'hr'],
];

async function seedHrPayroll(now: IsoDateTime, todayIso: IsoDate): Promise<void> {
  await run('INSERT INTO hr_payroll_setup (id) VALUES (1)');
  const BANDS: [number, number | null, number][] = [[1, 2400000, 10], [2, 833300, 25], [3, 46766700, 30], [4, 30000000, 32.5], [5, null, 35]];
  for (const [o, ub, r] of BANDS) await run('INSERT INTO payroll_paye_band (sort_order, upper_bound_cents, rate_pct) VALUES (?,?,?)', o, ub, r);
  await run('INSERT INTO payroll_nssf_tier (tier_no, lower_limit_cents, upper_limit_cents, employee_rate_pct, employer_rate_pct) VALUES (1, 0, 800000, 6, 6)');
  await run('INSERT INTO payroll_nssf_tier (tier_no, lower_limit_cents, upper_limit_cents, employee_rate_pct, employer_rate_pct) VALUES (2, 800000, 7200000, 6, 6)');
  await run(
    `INSERT INTO payroll_posting_group (code, name, salary_expense_account_id, paye_payable_account_id, net_pay_payable_account_id,
       nssf_employee_payable_account_id, nssf_employer_expense_account_id, nssf_employer_payable_account_id, shif_payable_account_id,
       housing_levy_employee_payable_account_id, housing_levy_employer_expense_account_id, housing_levy_employer_payable_account_id,
       created_at, created_by) VALUES ('STAFF','Clinic Staff',?,?,?,?,?,?,?,?,?,?,?,'system')`,
    await accId('6010'), await accId('2060'), await accId('2064'), await accId('2061'), await accId('6015'), await accId('2061'),
    await accId('2062'), await accId('2063'), await accId('6016'), await accId('2063'), now,
  );
  await run(
    `INSERT INTO hr_leave_type (code, name, standard_days, accrues, days_to_accrue, is_annual, inclusive_of_holidays, created_at, created_by)
     VALUES ('ANNUAL', 'Annual Leave', 21, true, 1.75, true, false, ?, 'system')`, now,
  );
  await run(`INSERT INTO hr_leave_type (code, name, standard_days, is_sick_leave, created_at, created_by) VALUES ('SICK', 'Sick Leave', 14, true, ?, 'system')`, now);
  await run(`INSERT INTO hr_leave_type (code, name, standard_days, gender, created_at, created_by) VALUES ('MATERNITY', 'Maternity Leave', 90, 'FEMALE', ?, 'system')`, now);
  await run(`INSERT INTO hr_leave_type (code, name, standard_days, gender, created_at, created_by) VALUES ('PATERNITY', 'Paternity Leave', 14, 'MALE', ?, 'system')`, now);
  await run(`INSERT INTO hr_leave_type (code, name, standard_days, created_at, created_by) VALUES ('STUDY', 'Study / Exam Leave (CPD & licensing)', 10, ?, 'system')`, now);
  const y = todayIso.slice(0, 4);
  await run(`INSERT INTO hr_leave_calendar (code, start_date, end_date, is_current, created_at, created_by) VALUES (?, ?, ?, true, ?, 'system')`, y, `${y}-01-01`, `${y}-12-31`, now);

  const groupId = (await one<{ id: number }>("SELECT id FROM payroll_posting_group WHERE code = 'STAFF'"))!.id;
  for (const [i, [fn, ln, g, title, dept]] of STAFF.entries()) {
    const no = await nextSequence('EMPLOYEE');
    await run(
      `INSERT INTO employee (employee_no, first_name, last_name, gender, job_title, employment_date, status, probation_status,
         posting_group_id, global_dimension_1_id, global_dimension_2_id, national_id, phone, email, created_at, created_by)
       VALUES (?,?,?,?,?,?, 'ACTIVE', 'CONFIRMED', ?, (SELECT id FROM global_dimension_1_value WHERE code = 'NGONG'),
         (SELECT id FROM global_dimension_2_value WHERE code = ?), ?, ?, ?, ?, 'system')`,
      no, fn, ln, g, title, addMonths(todayIso, -int(8, 48)), groupId, dept, String(28000000 + i * 7919),
      `+254 72${int(1000000, 9999999)}`, `${fn.toLowerCase()}.${ln.toLowerCase()}@waysideclinic.co.ke`, now,
    );
  }
  // Link the demo logins to their employee records (Self Service, approvers).
  for (const [fn, ln, , , , login] of STAFF) {
    if (!login) continue;
    const emp = await one<{ id: number }>('SELECT id FROM employee WHERE first_name = ? AND last_name = ?', fn, ln);
    const u = await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', login);
    if (!emp || !u) continue;
    const has = await one('SELECT 1 FROM approval_user_setup WHERE user_id = ?', u.id);
    if (has) await run('UPDATE approval_user_setup SET employee_id = ? WHERE user_id = ?', emp.id, u.id);
    else await run('INSERT INTO approval_user_setup (user_id, employee_id) VALUES (?,?)', u.id, emp.id);
  }
  // Everyone's direct approver for leave, imprests and claims is the Medical Director.
  await run("UPDATE approval_user_setup SET approver_id = (SELECT id FROM app_user WHERE username = 'director') WHERE user_id <> (SELECT id FROM app_user WHERE username = 'director')");
}

/* ================================================================ cash, VAT, AR, AP */

async function seedCashAndTax(now: IsoDateTime): Promise<void> {
  await run(`INSERT INTO currency (code, description, symbol, iso_numeric_code, is_base, amount_rounding_precision, created_at, created_by)
     VALUES ('KES', 'Kenya Shilling', 'KSh', '404', 1, 100, ?, 'system')`, now);
  const INS_CCY = `INSERT INTO currency
    (code, description, symbol, iso_numeric_code, is_base, amount_rounding_precision,
     realized_gains_account_id, realized_losses_account_id, unrealized_gains_account_id, unrealized_losses_account_id,
     residual_gains_account_id, residual_losses_account_id, created_at, created_by)
    VALUES (?,?,?,?,0,1,?,?,?,?,?,?,?,'system')`;
  const [g, l, ug, ul] = [await accId('4096'), await accId('6130'), await accId('4097'), await accId('6131')];
  await run(INS_CCY, 'USD', 'US Dollar', '$', '840', g, l, ug, ul, g, l, now);
  await run(INS_CCY, 'EUR', 'Euro', '€', '978', g, l, ug, ul, g, l, now);
  await run(INS_CCY, 'GBP', 'Pound Sterling', '£', '826', g, l, ug, ul, g, l, now);

  const INS_BAPG = "INSERT INTO bank_acc_posting_group (code, description, gl_account_id, created_at, created_by) VALUES (?,?,?,?,'system')";
  await run(INS_BAPG, 'BANK', 'Bank current accounts', await accId('1020'), now);
  await run(INS_BAPG, 'CASH', 'Petty cash, cashier tills and cash office', await accId('1010'), now);
  await run(INS_BAPG, 'MPESA', 'Mobile-money settlement', await accId('1030'), now);
  await run(INS_BAPG, 'CARDS', 'Card settlement clearing', await accId('1040'), now);
  await run("UPDATE bank_account SET currency_code = 'KES', balance_lcy = balance WHERE currency_code IS NULL OR currency_code = ''");
  await run("UPDATE bank_account SET bank_acc_posting_group_code = 'BANK' WHERE code IN ('EQUITY','KCB')");
  await run("UPDATE bank_account SET bank_acc_posting_group_code = 'CASH' WHERE code IN ('PETTY','VAULT','TILL-1')");
  await run("UPDATE bank_account SET bank_acc_posting_group_code = 'MPESA' WHERE code = 'MPESA'");
  await run("UPDATE bank_account SET bank_acc_posting_group_code = 'CARDS' WHERE code = 'CARDS'");

  await run(
    `INSERT INTO cash_management_setup (id, receipt_approval_limit, pv_approval_limit, default_vat_bus_posting_group_code,
       bank_charges_account_id, bank_interest_income_account_id, default_receipt_bank_account_id, updated_at, updated_by)
     VALUES (1, ?, ?, 'STANDARD', ?, ?, (SELECT id FROM bank_account WHERE code = 'EQUITY'), ?, 'system')`,
    K(250000), K(100000), await accId('6120'), await accId('4095'), now,
  );
  for (const [c, n] of [['EQUITY', 'Equity Bank'], ['NCBA', 'NCBA Bank'], ['KCB', 'Kenya Commercial Bank'], ['COOP', 'Co-operative Bank of Kenya'], ['ABSA', 'Absa Bank Kenya'], ['SCB', 'Standard Chartered Kenya']]) {
    await run('INSERT INTO external_bank (code, name) VALUES (?,?)', c, n);
  }
  for (const [b, code, name] of [['EQUITY', '68000', 'Head Office'], ['NCBA', '07000', 'Upper Hill'], ['KCB', '01100', 'Moi Avenue']]) {
    await run('INSERT INTO external_bank_branch (bank_code, branch_code, branch_name) VALUES (?,?,?)', b, code, name);
  }

  // VAT: medical services are exempt (VAT Act, First Schedule); goods bought in are standard-rated.
  for (const [c, d] of [['STANDARD', 'Standard-rated domestic'], ['EXPORT', 'Export of services — zero-rated'], ['EXEMPT', 'VAT-exempt (patients, insurers, medical services)']]) {
    await run("INSERT INTO vat_business_posting_group (code, description, created_at, created_by) VALUES (?,?,?,'system')", c, d, now);
  }
  for (const [c, d, t] of [
    ['VAT16', 'VAT at 16%', 'VAT'], ['VAT0', 'Zero-rated', 'VAT'], ['EXEMPT', 'VAT exempt', 'VAT'],
    ['WHT-PROF', 'WHT — professional / management fees (5%)', 'WHT'], ['WHT-RENT', 'WHT — rent (10%)', 'WHT'], ['WHT-VAT', 'Withholding VAT (2%)', 'WHT'],
  ]) await run("INSERT INTO vat_product_posting_group (code, description, tax_type, created_at, created_by) VALUES (?,?,?,?,'system')", c, d, t, now);
  const INS_VPS = `INSERT INTO vat_posting_setup
    (vat_bus_posting_group_code, vat_prod_posting_group_code, tax_type, vat_pct, vat_calculation_type, tax_account_id, sales_tax_account_id, wht_base, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Net', ?, 'system')`;
  const [vin, vout] = [await accId('1260'), await accId('2030')];
  for (const bus of ['STANDARD', 'EXPORT', 'EXEMPT']) {
    // An export or an exempt client is invoiced at 0% whatever the service's own group.
    const rate = bus === 'STANDARD' ? 16 : 0;
    await run(INS_VPS, bus, 'VAT16', 'VAT', rate, rate ? 'Normal' : bus === 'EXPORT' ? 'Zero VAT' : 'Exempt', vin, vout, now);
    await run(INS_VPS, bus, 'VAT0', 'VAT', 0, 'Zero VAT', vin, vout, now);
    await run(INS_VPS, bus, 'EXEMPT', 'VAT', 0, 'Exempt', vin, vout, now);
  }
  await run(INS_VPS, 'STANDARD', 'WHT-PROF', 'WHT', 5, 'Normal', await accId('2070'), null, now);
  await run(INS_VPS, 'STANDARD', 'WHT-RENT', 'WHT', 10, 'Normal', await accId('2070'), null, now);
  await run(INS_VPS, 'STANDARD', 'WHT-VAT', 'WHT', 2, 'Normal', await accId('2071'), null, now);
}

async function seedReceivablesSetup(now: IsoDateTime): Promise<void> {
  const INS_PT = "INSERT INTO payment_terms (code, description, due_date_calculation, discount_date_calculation, discount_pct, created_at, created_by) VALUES (?,?,?,?,?,?,'system')";
  await run(INS_PT, 'COD', 'Due on receipt', '0D', '', 0, now);
  await run(INS_PT, '14 DAYS', 'Net 14 days', '14D', '', 0, now);
  await run(INS_PT, '30 DAYS', 'Net 30 days', '30D', '', 0, now);
  await run(INS_PT, '1M(8D)', 'Net 1 month, 2% 8 days', '1M', '8D', 2, now);
  const INS_PM = "INSERT INTO payment_method (code, description, bal_account_type, bal_account_no, created_at, created_by) VALUES (?,?,?,?,?,'system')";
  await run(INS_PM, 'BANK', 'Bank Transfer / EFT / RTGS', 'Bank Account', 'EQUITY', now);
  await run(INS_PM, 'MPESA', 'M-Pesa Paybill', 'Bank Account', 'MPESA', now);
  await run(INS_PM, 'CARD', 'Credit / Debit Card', 'Bank Account', 'CARDS', now);
  await run(INS_PM, 'CHEQUE', 'Cheque', 'None', null, now);
  await run(INS_PM, 'CASH', 'Cash', 'Bank Account', 'PETTY', now);

  const INS_CPG = `INSERT INTO customer_posting_group
    (code, description, receivables_account_id, service_charge_account_id, additional_fee_account_id,
     payment_disc_debit_account_id, payment_disc_credit_account_id, invoice_rounding_account_id, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,'system')`;
  const [ar, fees, disc, round] = [await accId('1220'), await accId('4085'), await accId('6125'), await accId('4086')];
  await run(INS_CPG, 'INSURANCE', 'Insurers & medical schemes', ar, fees, fees, disc, round, round, now);
  await run(INS_CPG, 'GOVT', 'SHA & government', ar, fees, fees, disc, round, round, now);
  await run(INS_CPG, 'CORPORATE', 'Corporate (employer) accounts', ar, fees, fees, disc, round, round, now);
  await run(INS_CPG, 'DOMESTIC', 'Other debtors', ar, fees, fees, disc, round, round, now);

  await run(`INSERT INTO reminder_terms (code, description, max_no_of_reminders, post_interest, post_additional_fee, min_amount, created_at, created_by)
     VALUES ('STANDARD', 'Standard Reminders', 3, 0, 0, ?, ?, 'system')`, K(500), now);
  const INS_RL = `INSERT INTO reminder_level (reminder_terms_code, level_no, grace_period, due_date_calculation, calculate_interest, additional_fee, add_fee_per_line, begin_text, end_text)
    VALUES ('STANDARD', ?,?,?,?,?,?,?,?)`;
  await run(INS_RL, 1, '7D', '7D', 0, 0, 0, 'Our records show the following invoices as overdue. Kindly arrange payment.', 'If payment has already been made, please disregard this reminder.');
  await run(INS_RL, 2, '7D', '7D', 0, 0, 0, 'This is our second reminder. The following invoices remain unpaid.', 'Please settle or advise of any query on the claims listed.');
  await run(INS_RL, 3, '7D', '7D', 0, 0, 0, 'FINAL REMINDER. Services to your members may be placed on cash basis if the account is not settled.', 'Contact our finance office immediately.');
  await run(`INSERT INTO finance_charge_terms (code, description, interest_rate, min_amount, additional_fee, grace_period, due_date_calculation, interest_period_days, post_interest, post_additional_fee, line_description, created_at, created_by)
     VALUES ('1.5%', '1.5% per month on overdue balances', 18.0, ?, 0, '0D', '14D', 360, 1, 0, 'Finance charge on overdue balance', ?, 'system')`, K(100), now);
  await run(`INSERT INTO sales_receivables_setup (id, default_customer_posting_group_code, default_payment_terms_code, default_reminder_terms_code, default_fin_charge_terms_code, updated_at, updated_by)
     VALUES (1, 'INSURANCE', '30 DAYS', 'STANDARD', '1.5%', ?, 'system')`, now);

  const INS_VPG = `INSERT INTO vendor_posting_group
    (code, description, payables_account_id, service_charge_account_id, payment_disc_debit_account_id, payment_disc_credit_account_id,
     invoice_rounding_account_id, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,'system')`;
  const ap = await accId('2020');
  await run(INS_VPG, 'TRADE', 'Pharmaceutical, medical & dental suppliers', ap, await accId('6120'), disc, round, round, now);
  await run(INS_VPG, 'SERVICES', 'Service providers, locums & utilities', ap, await accId('6120'), disc, round, round, now);
  await run(`INSERT INTO purchases_payables_setup (id, default_vendor_posting_group_code, default_payment_terms_code, default_vat_bus_posting_group_code, updated_at, updated_by)
     VALUES (1, 'SERVICES', '30 DAYS', 'STANDARD', ?, 'system')`, now);
}

/* ================================================================ inventory */

async function seedInventory(now: IsoDateTime): Promise<void> {
  for (const [code, desc, sym] of [['TAB', 'Tablet', 'tab'], ['CAP', 'Capsule', 'cap'], ['BTL', 'Bottle', 'btl'], ['VIAL', 'Vial / ampoule', 'vial'],
    ['TUBE', 'Tube', 'tube'], ['PCS', 'Pieces', 'pcs'], ['BOX', 'Box', 'box'], ['PKT', 'Packet', 'pkt']]) {
    await run("INSERT INTO unit_of_measure (code, description, symbol, created_at, created_by) VALUES (?,?,?,?,'system')", code, desc, sym, now);
  }
  for (const [code, name] of [['MAIN', 'Main Store'], ['PHARM', 'Pharmacy Dispensary'], ['LAB', 'Laboratory Store'], ['DENTAL', 'Dental Surgery Store']]) {
    await run("INSERT INTO location (code, name, created_at, created_by) VALUES (?,?,?,'system')", code, name, now);
  }
  for (const [code, desc, acc] of [['DRUGS', 'Drugs & pharmaceuticals', '1310'], ['CONSUMABLES', 'Medical & dental consumables', '1320'], ['REAGENTS', 'Laboratory reagents', '1330']]) {
    await run("INSERT INTO inventory_posting_group (code, description, inventory_gl_account_id, created_at, created_by) VALUES (?,?,?,?,'system')", code, desc, await accId(acc), now);
  }
  // A stock issue (Negative Adjmt.) costs to the group's adjustment account — dispensing a drug is
  // a drug consumed (5010), a consumable used is 5020, a reagent 5030.
  for (const [code, desc, adj, sales, cogs] of [['DRUGS', 'Drugs', '5010', '4040', '5010'], ['CONSUMABLES', 'Consumables', '5020', '4050', '5020'], ['REAGENTS', 'Reagents', '5030', '4020', '5030']]) {
    await run(`INSERT INTO product_posting_group (code, description, adjustment_gl_account_id, sales_gl_account_id, cogs_gl_account_id, created_at, created_by)
       VALUES (?,?,?,?,?,?,'system')`, code, desc, await accId(adj), await accId(sales), await accId(cogs), now);
  }
}

/* ================================================================ fixed assets */

async function seedFixedAssets(now: IsoDateTime, todayIso: IsoDate, demo: boolean): Promise<void> {
  await run(`INSERT INTO depreciation_book (code, description, g_l_integration, default_final_rounding_amount, created_at, created_by)
     VALUES ('COMPANY', 'Company Book', 1, 100, ?, 'system')`, now);
  for (const [code, desc] of [['MEDICAL', 'Medical, Dental & Lab Equipment'], ['IT', 'Computer Equipment'], ['FURNITURE', 'Furniture & Fittings'], ['VEHICLES', 'Motor Vehicles']]) {
    await run('INSERT INTO fa_class (code, description, created_at, created_by) VALUES (?,?,?,?)', code, desc, now, 'system');
  }
  for (const [code, desc, cls] of [['DENTAL', 'Dental chairs & units', 'MEDICAL'], ['LAB', 'Laboratory analysers', 'MEDICAL'], ['IMAGING', 'X-ray, OPG & ultrasound', 'MEDICAL'],
    ['CLINICAL', 'Clinical & diagnostic equipment', 'MEDICAL'], ['COMPUTERS', 'Computers & printers', 'IT'], ['OFFICE', 'Furniture', 'FURNITURE']]) {
    await run('INSERT INTO fa_subclass (code, description, fa_class_code, created_at, created_by) VALUES (?,?,?,?,?)', code, desc, cls, now, 'system');
  }
  await run('INSERT INTO fa_location (code, description, created_at, created_by) VALUES (?,?,?,?)', 'NGONG', 'Ngong Road Clinic', now, 'system');
  for (const [code, desc] of [['SERVICE', 'Routine service & calibration'], ['REPAIR', 'Repair'], ['QA', 'Radiation safety / QA inspection']]) {
    await run('INSERT INTO maintenance (code, description, created_at, created_by) VALUES (?,?,?,?)', code, desc, now, 'system');
  }
  const INS_FAPG = `INSERT INTO fa_posting_group
    (code, description, acquisition_cost_account_id, accum_depreciation_account_id, depreciation_expense_account_id,
     write_down_expense_account_id, appreciation_account_id, maintenance_expense_account_id,
     gains_acc_on_disposal_id, losses_acc_on_disposal_id, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'system')`;
  const [dep, maint, gain, loss] = [await accId('6100'), await accId('6050'), await accId('4095'), await accId('6155')];
  await run(INS_FAPG, 'MEDICAL', 'Medical, Dental & Lab Equipment', await accId('1430'), await accId('1435'), dep, dep, await accId('1430'), maint, gain, loss, now);
  await run(INS_FAPG, 'IT', 'Computer Equipment', await accId('1440'), await accId('1445'), dep, dep, await accId('1440'), maint, gain, loss, now);
  await run(INS_FAPG, 'FURNITURE', 'Furniture & Fittings', await accId('1420'), await accId('1425'), dep, dep, await accId('1420'), maint, gain, loss, now);
  await run(INS_FAPG, 'VEHICLES', 'Motor Vehicles', await accId('1450'), await accId('1455'), dep, dep, await accId('1450'), maint, gain, loss, now);
  await run(`INSERT INTO fa_setup (id, default_depreciation_book_code, default_fa_posting_group_code, updated_at, updated_by)
     VALUES (1, 'COMPANY', 'MEDICAL', ?, 'system')`, now);
  if (!demo) return;

  const bank = await accId('1020');
  const startDate = addMonths(`${todayIso.slice(0, 8)}01`, -3);
  const lastMonthEnd = addDays(`${todayIso.slice(0, 8)}01`, -1);
  const assets: { input: Parameters<typeof faLib.createFixedAsset>[0]; group: string; life: number; cost: number; salvage: number }[] = [
    { input: { description: 'Dental chair & delivery unit (2 surgeries)', faClassCode: 'MEDICAL', faSubclassCode: 'DENTAL', faLocationCode: 'NGONG', responsibleEmployee: 'Dental Surgeon', vendorName: 'Dentsply Sirona EA', assetTag: 'MED-0001', blocked: false, inactive: false }, group: 'MEDICAL', life: 8, cost: K(2400000), salvage: K(150000) },
    { input: { description: 'Haematology analyser (5-part)', faClassCode: 'MEDICAL', faSubclassCode: 'LAB', faLocationCode: 'NGONG', responsibleEmployee: 'Laboratory Technologist', serialNo: 'BC5150-22871', vendorName: 'Mindray Medical Kenya', assetTag: 'MED-0010', blocked: false, inactive: false }, group: 'MEDICAL', life: 6, cost: K(1350000), salvage: K(50000) },
    { input: { description: 'Digital OPG / panoramic X-ray', faClassCode: 'MEDICAL', faSubclassCode: 'IMAGING', faLocationCode: 'NGONG', responsibleEmployee: 'Dental Surgeon', vendorName: 'Carestream Dental', assetTag: 'MED-0020', blocked: false, inactive: false }, group: 'MEDICAL', life: 8, cost: K(3200000), salvage: K(200000) },
    { input: { description: 'Reception & consultation furniture', faClassCode: 'FURNITURE', faSubclassCode: 'OFFICE', faLocationCode: 'NGONG', responsibleEmployee: 'Clinic Administrator', vendorName: 'Victoria Furnitures', assetTag: 'FF-0001', blocked: false, inactive: false }, group: 'FURNITURE', life: 8, cost: K(480000), salvage: 0 },
    { input: { description: 'Computers & label printers (6 stations)', faClassCode: 'IT', faSubclassCode: 'COMPUTERS', faLocationCode: 'NGONG', responsibleEmployee: 'Clinic Administrator', vendorName: 'Copy Cat Ltd', assetTag: 'IT-0001', blocked: false, inactive: false }, group: 'IT', life: 3, cost: K(540000), salvage: K(30000) },
  ];
  for (const d of assets) {
    const { no } = await faLib.createFixedAsset(d.input, SYS);
    const asset = (await one<{ id: number }>('SELECT id FROM fixed_asset WHERE no = ?', no))!;
    await faLib.setFaDepreciationBook(asset.id, {
      depreciationBookCode: 'COMPANY', faPostingGroupCode: d.group, depreciationMethod: 'Straight-Line',
      depreciationStartingDate: startDate, depreciationEndingDate: null, noOfDepreciationYears: d.life,
      straightLinePct: 0, decliningBalancePct: 0, salvageValue: d.salvage, disposalCalculationMethod: 'Net',
    }, SYS);
    const lineNo = await nextSequence('FA_JOURNAL');
    await run(
      `INSERT INTO fa_journal_line (no, posting_date, fixed_asset_id, depreciation_book_code, fa_posting_type, amount,
         balancing_gl_account_id, description, status, created_at, created_by)
       VALUES (?,?,?,?,'Acquisition Cost',?,?,?, 'Approved', ?, 'system')`,
      lineNo, startDate, asset.id, 'COMPANY', d.cost, bank, 'Opening acquisition', now,
    );
    await faJournalLib.postFaJournalLine(lineNo, SYS);
  }
  await faDeprLib.calculateDepreciation('COMPANY', lastMonthEnd, SYS);
  for (const l of await all<{ no: string }>("SELECT no FROM fa_journal_line WHERE fa_posting_type = 'Depreciation' AND status = 'Open'")) {
    await run("UPDATE fa_journal_line SET status = 'Approved' WHERE no = ?", l.no);
    await faJournalLib.postFaJournalLine(l.no, SYS);
  }
}

/* ================================================================ financial reports */

async function seedFinancialReports(now: IsoDateTime): Promise<void> {
  const INS_CLN = "INSERT INTO column_layout_name (name, description, created_at, created_by) VALUES (?,?,?,'system')";
  const INS_CL = `INSERT INTO column_layout
    (column_layout_name_id, line_no, column_no, column_header, column_type, amount_type, formula, comparison_date_formula, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,'system')`;
  const layouts: [string, string, [number, string, string, string, string, string][]][] = [
    ['DEFAULT', 'Single net-change column', [[10000, 'NET', 'Net Change', 'NET_CHANGE', '', '']]],
    ['BALANCE', 'Single balance-at-date column', [[10000, 'BAL', 'Balance', 'BALANCE_AT_DATE', '', '']]],
    ['THIS-VS-LAST', 'This year, last year and the % change', [
      [10000, 'TY', 'This Year', 'NET_CHANGE', '', ''], [20000, 'LY', 'Last Year', 'NET_CHANGE', '', '-1Y'],
      [30000, 'CHG', 'Change %', 'FORMULA', '(TY-LY)/LY*100', ''],
    ]],
    ['YTD-BAL', 'Year to date and closing balance', [
      [10000, 'YTD', 'Year to Date', 'YEAR_TO_DATE', '', ''], [20000, 'BAL', 'Balance', 'BALANCE_AT_DATE', '', ''],
    ]],
  ];
  for (const [name, description, lines] of layouts) {
    const info = await run(INS_CLN, name, description, now);
    for (const [lineNo, colNo, header, type, formula, cmp] of lines) {
      await run(INS_CL, info.lastInsertRowid, lineNo, colNo, header, type, 'NET_AMOUNT', formula, cmp, now);
    }
  }
  const INS_ASN = "INSERT INTO acc_schedule_name (name, description, default_column_layout_name, created_at, created_by) VALUES (?,?,?,?,'system')";
  const INS_ASL = `INSERT INTO acc_schedule_line
    (acc_schedule_name_id, line_no, row_no, description, totaling_type, totaling, row_type, show, bold, double_underline, indentation, created_at, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'system')`;
  type Row = [number, string, string, string, string, string, string, 0 | 1, 0 | 1, number];
  const schedules: [string, string, string, Row[]][] = [
    ['CO-BS', 'Statement of Financial Position', 'BALANCE', [
      [10000, 'CASH', 'Cash and cash equivalents', 'TOTAL_ACCOUNTS', '1000..1099', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [20000, 'REC', 'Patient, insurance and trade receivables', 'TOTAL_ACCOUNTS', '1200..1299', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [30000, 'INV', 'Inventories', 'TOTAL_ACCOUNTS', '1300..1399', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [40000, 'PPE', 'Property and medical equipment', 'TOTAL_ACCOUNTS', '1400..1499', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [50000, 'TA', 'Total assets', 'FORMULA', 'CASH+REC+INV+PPE', 'BALANCE_AT_DATE', 'YES', 1, 1, 0],
      [60000, 'CL', 'Current liabilities', 'TOTAL_ACCOUNTS', '2000..2199', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [70000, 'EQ', 'Capital and reserves', 'TOTAL_ACCOUNTS', '3000..3099', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [80000, 'INC', 'Revenue (period)', 'TOTAL_ACCOUNTS', '4000..4099', 'BALANCE_AT_DATE', 'NO', 0, 0, 0],
      [90000, 'EXP', 'Costs (period)', 'TOTAL_ACCOUNTS', '5000..7099', 'BALANCE_AT_DATE', 'NO', 0, 0, 0],
      [100000, 'PROF', 'Profit for the period', 'FORMULA', 'INC-EXP', 'BALANCE_AT_DATE', 'YES', 0, 0, 1],
      [110000, 'TE', 'Total equity', 'FORMULA', 'EQ+PROF', 'BALANCE_AT_DATE', 'YES', 1, 0, 0],
      [120000, 'TLE', 'Total equity and liabilities', 'FORMULA', 'CL+TE', 'BALANCE_AT_DATE', 'YES', 1, 1, 0],
      [130000, 'CHK', 'Balance check (assets less equity and liabilities)', 'FORMULA', 'TA-TLE', 'BALANCE_AT_DATE', 'IF_ANY_NOT_ZERO', 0, 0, 0],
    ]],
    ['CO-PL', 'Statement of Profit or Loss', 'THIS-VS-LAST', [
      [10000, 'PROJ', 'Consultation & registration', 'TOTAL_ACCOUNTS', '4010..4015', 'NET_CHANGE', 'YES', 0, 0, 1],
      [20000, 'RECUR', 'Laboratory & imaging', 'TOTAL_ACCOUNTS', '4020..4025', 'NET_CHANGE', 'YES', 0, 0, 1],
      [30000, 'OTHREV', 'Dental services', 'TOTAL_ACCOUNTS', '4030', 'NET_CHANGE', 'YES', 0, 0, 1],
      [40000, 'WIP', 'Pharmacy, procedures & other clinical', 'TOTAL_ACCOUNTS', '4040..4060', 'NET_CHANGE', 'YES', 0, 0, 1],
      [50000, 'MISC', 'Other income', 'TOTAL_ACCOUNTS', '4085..4097', 'NET_CHANGE', 'YES', 0, 0, 1],
      [60000, 'REV', 'Total revenue', 'FORMULA', 'PROJ+RECUR+OTHREV+WIP+MISC', 'NET_CHANGE', 'YES', 1, 0, 0],
      [70000, 'COS', 'Cost of care (drugs, consumables, reagents, locums)', 'TOTAL_ACCOUNTS', '5000..5099', 'NET_CHANGE', 'YES', 0, 0, 1],
      [80000, 'GP', 'Gross profit', 'FORMULA', 'REV-COS', 'NET_CHANGE', 'YES', 1, 0, 0],
      [90000, 'STAFF', 'Staff costs', 'TOTAL_ACCOUNTS', '6010..6020', 'NET_CHANGE', 'YES', 0, 0, 1],
      [100000, 'OPEX', 'Other operating expenses', 'TOTAL_ACCOUNTS', '6030..6199', 'NET_CHANGE', 'YES', 0, 0, 1],
      [110000, 'PBT', 'Profit before tax', 'FORMULA', 'GP-STAFF-OPEX', 'NET_CHANGE', 'YES', 1, 0, 0],
      [120000, 'TAX', 'Income tax', 'TOTAL_ACCOUNTS', '7000..7099', 'NET_CHANGE', 'YES', 0, 0, 1],
      [130000, 'PAT', 'Profit after tax', 'FORMULA', 'PBT-TAX', 'NET_CHANGE', 'YES', 1, 1, 0],
    ]],
  ];
  for (const [name, description, dcl, rows] of schedules) {
    const info = await run(INS_ASN, name, description, dcl, now);
    for (const [lineNo, rowNo, desc, tType, totaling, rowType, show, bold, dunder, indent] of rows) {
      await run(INS_ASL, info.lastInsertRowid, lineNo, rowNo, desc, tType, totaling, rowType, show, bold, dunder, indent, now);
    }
  }
  for (const [name, description, rowGroup, columnGroup] of [
    ['STMT-FIN-POSITION', 'Statement of Financial Position', 'CO-BS', 'BALANCE'],
    ['STMT-PROFIT-LOSS', 'Statement of Profit or Loss', 'CO-PL', 'THIS-VS-LAST'],
  ]) {
    await run("INSERT INTO financial_report (name, description, row_group, column_group, created_at, created_by) VALUES (?,?,?,?,?,'system')", name, description, rowGroup, columnGroup, now);
  }
}

/* ================================================================ clinic setup */

async function seedClinic(now: IsoDateTime): Promise<void> {
  // Revenue categories → the income accounts the bill posts to.
  const CATS: [string, string, string][] = [
    ['REGISTRATION', 'Registration', '4015'], ['CONSULTATION', 'Consultation', '4010'], ['LAB', 'Laboratory', '4020'], ['IMAGING', 'Imaging & radiology', '4025'],
    ['DENTAL', 'Dental', '4030'], ['PHARMACY', 'Pharmacy', '4040'], ['PROCEDURES', 'Procedures & nursing', '4050'], ['OTHER', 'Other clinical', '4060'],
  ];
  for (const [i, [code, name, acc]] of CATS.entries()) await run('INSERT INTO service_category (code, name, revenue_account_id, sort_order) VALUES (?,?,?,?)', code, name, await accId(acc), i * 10);

  const DEPTS: [string, string, string, string, string | null, string, string | null][] = [
    ['TRIAGE', 'Triage', 'SERVICE', 'T', 'Triage room', '#f59e0b', null], ['OPD', 'General Outpatient', 'CLINIC', 'OPD', 'Rooms 1–3', '#0f766e', 'CONS-GP'],
    ['DENTAL', 'Dental Clinic', 'CLINIC', 'DEN', 'Dental surgery', '#7c3aed', 'CONS-DEN'], ['MCH', 'Mother & Child Health', 'CLINIC', 'MCH', 'Room 4', '#db2777', 'CONS-MCH'],
    ['LAB', 'Laboratory', 'SERVICE', 'LAB', 'Lab reception', '#2563eb', null], ['RAD', 'Imaging', 'SERVICE', 'RAD', 'X-ray room', '#0891b2', null],
    ['PROC', 'Procedure Room', 'SERVICE', 'PR', 'Procedure room', '#ea580c', null], ['PHARM', 'Pharmacy', 'SERVICE', 'PH', 'Pharmacy window', '#16a34a', null],
    ['CASH', 'Cashier', 'SERVICE', 'C', 'Cashier window', '#475569', null],
  ];
  await insertMany('clinic_department', ['code', 'name', 'kind', 'queue_prefix', 'room', 'colour', 'consultation_service_code', 'sort_order', 'created_at', 'created_by'],
    DEPTS.map((d, i) => [...d, i * 10, now, 'system']));

  await insertMany('service_item', ['code', 'name', 'kind', 'category_code', 'department_code', 'base_price', 'created_at', 'created_by'],
    [...CLINIC_SERVICES.map(([code, name, kind, cat, dept, price]) => [code, name, kind, cat, dept, K(price), now, 'system']),
      ...DENTAL_PROCEDURES.map(([code, name, price]) => [code, name, 'DENTAL', 'DENTAL', 'DENTAL', K(price), now, 'system'])]);
  await run("UPDATE service_item SET requires_preauth = 1 WHERE code IN ('D-IMPL','D-CROWN-ZR','D-CROWN-PFM','PROC-CIRC','IMG-USABD')");

  // The laboratory catalogue — each test with its charge-master line and its parameters.
  await insertMany('service_item', ['code', 'name', 'kind', 'category_code', 'department_code', 'base_price', 'created_at', 'created_by'],
    LAB_CATALOGUE.map((t) => [`LAB-${t.code}`, t.name, 'LAB', 'LAB', 'LAB', K(t.price), now, 'system']));
  await insertMany('lab_test', ['code', 'name', 'section', 'specimen_type', 'container', 'tat_minutes', 'sort_order', 'service_item_id'],
    await Promise.all(LAB_CATALOGUE.map(async (t, i) => [t.code, t.name, t.section, t.specimen, t.container, t.tat, i,
      (await one<{ id: number }>('SELECT id FROM service_item WHERE code = ?', `LAB-${t.code}`))!.id])));
  const testIds = new Map((await all<{ id: number; code: string }>('SELECT id, code FROM lab_test')).map((t) => [t.code, t.id]));
  await insertMany('lab_test_parameter',
    ['lab_test_id', 'sort_order', 'name', 'unit', 'result_type', 'options', 'ref_low', 'ref_high', 'ref_low_female', 'ref_high_female', 'critical_low', 'critical_high', 'ref_text'],
    LAB_CATALOGUE.flatMap((t) => t.params.map((p, i) => [testIds.get(t.code), i * 10, ...p])));

  // Tariffs: cash, the SHA rates, and insurer / corporate lists marked up on the cash base.
  await insertMany('price_list', ['code', 'name', 'kind', 'markup_pct', 'created_at', 'created_by'], [
    ['CASH', 'Cash tariff', 'CASH', 0, now, 'system'], ['SHA', 'SHA (Social Health Authority) tariff', 'INSURANCE', 0, now, 'system'],
    ['INS-STD', 'Insurance standard tariff', 'INSURANCE', 15, now, 'system'], ['CORP', 'Corporate tariff', 'CORPORATE', 5, now, 'system'],
    ['STAFF', 'Staff tariff', 'STAFF', -30, now, 'system'],
  ]);
  // SHA pays fixed outpatient rates on the core services.
  for (const [code, price] of [['CONS-GP', 1000], ['CONS-CO', 800], ['CONS-DEN', 1000], ['CONS-MCH', 600], ['REG', 0], ['LAB-FBC', 800], ['LAB-MRDT', 300], ['LAB-URINE', 300], ['D-EXT', 1500], ['D-SCALE', 2500]] as const) {
    await run('INSERT INTO price_list_line (price_list_code, service_item_id, price) VALUES (?, (SELECT id FROM service_item WHERE code = ?), ?)', 'SHA', code, K(price));
  }

  await insertMany('icd_code', ['code', 'title', 'chapter', 'common'], ICD10_COMMON.map(([c, t, ch]) => [c, t, ch, 1]));

  await run(
    `INSERT INTO clinic_setup (id, patient_receivable_account_id, unbilled_claims_account_id, discount_account_id, claim_writeoff_account_id, default_revenue_account_id,
       cash_bank_account_id, mpesa_bank_account_id, card_bank_account_id, bank_transfer_account_id, pharmacy_location_id, default_price_list_code,
       scheme_customer_posting_group, registration_service_code, pay_before_service, lab_requires_verification, review_window_days, updated_at, updated_by)
     VALUES (1,?,?,?,?,?,?,?,?,?,?,'CASH','INSURANCE','REG',0,1,7,?,'system')`,
    await accId('1210'), await accId('1215'), await accId('6125'), await accId('6152'), await accId('4060'),
    await bankId('TILL-1'), await bankId('MPESA'), await bankId('CARDS'), await bankId('EQUITY'),
    (await one<{ id: number }>("SELECT id FROM location WHERE code = 'PHARM'"))!.id, now,
  );

  // Payers — each creates its Receivables customer.
  const SCHEMES: Record<string, unknown>[] = [
    { code: 'SHA', name: 'Social Health Authority (SHA)', payer_type: 'SHA', price_list_code: 'SHA', copay_type: 'NONE', visit_limit: '', claim_submission_days: 30, contact_email: 'claims@sha.go.ke' },
    { code: 'JUBILEE', name: 'Jubilee Health Insurance', payer_type: 'INSURER', price_list_code: 'INS-STD', copay_type: 'FIXED', copay_value: 200, visit_limit: '15000', claim_submission_days: 30, contact_email: 'claims@jubileeinsurance.com' },
    { code: 'AAR', name: 'AAR Insurance Kenya', payer_type: 'INSURER', price_list_code: 'INS-STD', copay_type: 'NONE', visit_limit: '20000', claim_submission_days: 45, contact_email: 'claims@aar.co.ke' },
    { code: 'BRITAM', name: 'Britam Health', payer_type: 'INSURER', price_list_code: 'INS-STD', copay_type: 'PERCENT', copay_value: 10, claim_submission_days: 30, contact_email: 'healthclaims@britam.com' },
    { code: 'KPLC-STAFF', name: 'Kenya Power — staff medical scheme', payer_type: 'CORPORATE', price_list_code: 'CORP', copay_type: 'NONE', claim_submission_days: 30, contact_email: 'medical@kplc.co.ke' },
  ];
  for (const s of SCHEMES) await clinicSetup.saveScheme(null, { status: 'ACTIVE', ...s }, SYS);

  /* ---- ready-to-use approval workflows */
  const group = async (name: string, members: string[]): Promise<number> => {
    const g = (await run("INSERT INTO workflow_user_group (name, status) VALUES (?, 'ACTIVE')", name)).lastInsertRowid;
    for (const [i, m] of members.entries()) {
      const u = await one<{ id: number }>('SELECT id FROM app_user WHERE username = ?', m);
      if (u) await run('INSERT INTO workflow_user_group_member (group_id, user_id, sequence) VALUES (?,?,?)', g, u.id, i + 1);
    }
    return g;
  };
  const financeGroup = await group('Finance Approvers', ['finance', 'director']);
  const wf = async (name: string, doc: string, steps: { type: 'USER' | 'USER_GROUP' | 'DIRECT_APPROVER'; user?: string; group?: number }[]) => {
    const id = (await run("INSERT INTO workflow (name, document_type, enabled, created_at, created_by) VALUES (?, ?, 1, ?, 'system')", name, doc, now)).lastInsertRowid;
    for (const [i, s] of steps.entries()) {
      await run('INSERT INTO workflow_step (workflow_id, step_no, approver_type, approver_user_id, approver_group_id, notify_email) VALUES (?,?,?,?,?,1)',
        id, i + 1, s.type, s.user ? await userId(s.user) : null, s.group ?? null);
    }
  };
  await wf('Sales invoices & credit memos', 'SALES_DOCUMENT', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('Purchase documents', 'PURCHASE_DOCUMENT', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('Payment vouchers', 'PAYMENT_VOUCHER', [{ type: 'USER_GROUP', group: financeGroup }, { type: 'USER', user: 'director' }]);
  await wf('Receipts', 'RECEIPT', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('General journals', 'JOURNAL', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('Leave applications', 'LEAVE_APPLICATION', [{ type: 'DIRECT_APPROVER' }]);
  await wf('Imprest requests', 'IMPREST_REQUEST', [{ type: 'DIRECT_APPROVER' }, { type: 'USER_GROUP', group: financeGroup }]);
  await wf('Imprest surrenders', 'IMPREST_SURRENDER', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('Staff claims', 'STAFF_CLAIM', [{ type: 'DIRECT_APPROVER' }, { type: 'USER_GROUP', group: financeGroup }]);
  await wf('Petty cash', 'PETTY_CASH', [{ type: 'USER_GROUP', group: financeGroup }]);
  await wf('Purchase requisitions', 'PURCHASE_REQUISITION', [{ type: 'DIRECT_APPROVER' }]);
  await wf('Store requisitions', 'STORE_REQUISITION', [{ type: 'DIRECT_APPROVER' }]);
  await wf('Payroll period', 'PAYROLL_PERIOD', [{ type: 'USER', user: 'director' }]);
}

/** The formulary: each drug as an inventory item (DRUGS groups, FIFO) with its charge-master line. */
async function seedFormulary(): Promise<void> {
  for (const [generic, brand, strength, form, route, freq, unit, cost, price, , reorder, controlled] of DRUG_FORMULARY) {
    await clinicSetup.saveDrug(null, {
      generic_name: generic, brand_name: brand ?? '', strength, dosage_form: form, default_route: route, default_frequency: freq, unit,
      unit_cost: cost, price, reorder_point: reorder, controlled,
    }, SYS);
  }
}

/* ================================================================ demo book of work */

/** Sets the application clock to a wall time in Nairobi (UTC+3) on `date`. */
const at = (date: IsoDate, hhmm: string): void => setDemoClock(new Date(`${date}T${hhmm}:00+03:00`).toISOString());
const hhmm = (mins: number): string => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/**
 * The clinic's money before the demo starts: opening equity in the bank, and three months of staff
 * costs and rent (in a live clinic these come from Payroll and Payables).
 */
export async function seedOpeningPosition(today: IsoDate): Promise<void> {
  const { postJournal } = await import('./accounting.ts');
  const start = addMonths(`${today.slice(0, 8)}01`, -4);
  await postJournal({
    valueDate: start, module: 'GL', eventType: 'OPENING_BALANCE', reference: 'OPENING', user: SYS, idempotencyKey: 'DEMO-OPENING',
    description: 'Opening balances (demonstration)',
    lines: [{ account: '1020', debit: K(6500000), credit: 0, narration: 'Opening bank balance' }, { account: '3020', debit: 0, credit: K(6500000), narration: 'Opening equity' }],
  });
  for (let m = 3; m >= 1; m--) {
    const end = addDays(addMonths(`${today.slice(0, 8)}01`, -m + 1), -1);
    await postJournal({
      valueDate: end, module: 'PAYROLL', eventType: 'PAYROLL_DEMO', reference: `PAY-${end.slice(0, 7)}`, user: SYS, idempotencyKey: `DEMO-PAYROLL-${end.slice(0, 7)}`,
      description: `Staff costs and rent ${end.slice(0, 7)} (demonstration)`,
      lines: [
        { account: '6010', debit: K(1150000), credit: 0, narration: 'Gross salaries' },
        { account: '6015', debit: K(38000), credit: 0, narration: 'Employer NSSF' },
        { account: '6016', debit: K(17250), credit: 0, narration: 'Employer housing levy' },
        { account: '6110', debit: K(180000), credit: 0, narration: 'Clinic rent' },
        { account: '1020', debit: 0, credit: K(1385250), narration: 'Net pay, statutory deductions and rent paid' },
      ],
    });
  }
}

/** Suppliers, and the pharmacy's opening stock bought on their invoices (Dr Drug Inventory / Cr Payables). */
async function seedSuppliers(today: IsoDate): Promise<void> {
  const vendors: Parameters<typeof vendorLib.createVendor>[0][] = [
    { name: 'Surgipharm Limited', city: 'Nairobi', phone: '+254 709 931 000', email: 'orders@surgipharm.co.ke', contact: 'Key Accounts', vendorPostingGroupCode: 'TRADE', paymentTermsCode: '30 DAYS', creditLimit: 0, blocked: '' },
    { name: 'Harleys Limited', city: 'Nairobi', phone: '+254 722 205 000', email: 'sales@harleys.co.ke', contact: 'Sales Desk', vendorPostingGroupCode: 'TRADE', paymentTermsCode: '30 DAYS', creditLimit: 0, blocked: '' },
    { name: 'Dental Supplies East Africa', city: 'Nairobi', phone: '+254 711 044 400', email: 'info@dentalsupplies.co.ke', contact: 'Orders', vendorPostingGroupCode: 'TRADE', paymentTermsCode: '30 DAYS', creditLimit: 0, blocked: '' },
    { name: 'Kenya Power & Lighting Co.', city: 'Nairobi', phone: '+254 703 070 707', email: 'billing@kplc.co.ke', contact: 'Billing', vendorPostingGroupCode: 'SERVICES', paymentTermsCode: '14 DAYS', creditLimit: 0, blocked: '' },
    { name: 'Enviro-Medical Waste Ltd', city: 'Nairobi', phone: '+254 720 515 515', email: 'accounts@enviromed.co.ke', contact: 'Accounts', vendorPostingGroupCode: 'SERVICES', paymentTermsCode: '14 DAYS', creditLimit: 0, blocked: '' },
  ];
  const vIds: number[] = [];
  for (const v of vendors) {
    const { no } = await vendorLib.createVendor(v, SYS);
    vIds.push((await one<{ id: number }>('SELECT id FROM vendor WHERE no = ?', no))!.id);
  }
  await run("UPDATE vendor SET vat_bus_posting_group_code = 'STANDARD' WHERE vat_bus_posting_group_code IS NULL");
  const post = async (vendorId: number, date: IsoDate, ref: string, lines: Parameters<typeof purchaseLib.setPurchaseLines>[1]) => {
    const { no } = await purchaseLib.createPurchaseDocument({ documentType: 'Invoice', vendorId, postingDate: date, documentDate: date, vendorInvoiceNo: ref }, SYS);
    await purchaseLib.setPurchaseLines(no, lines, SYS);
    const v = (await one<{ name: string; address: string | null; city: string | null; contact: string | null }>(
      'SELECT v.name, v.address, v.city, v.contact FROM purchase_header ph JOIN vendor v ON v.id = ph.vendor_id WHERE ph.no = ?', no))!;
    await run(`UPDATE purchase_header SET status = 'Released', due_date = ?, buy_from_name = ?, buy_from_address = ?, buy_from_city = ?, buy_from_contact = ? WHERE no = ?`,
      addDays(date, 30), v.name, v.address, v.city, v.contact, no);
    await purchaseLib.postPurchaseDocument(no, { invoice: true }, SYS);
  };
  // Opening drug stock — two wholesalers, into the pharmacy store.
  const drugs = await all<{ item_no: string; cost: number; qty: number }>(
    `SELECT i.no AS item_no, i.unit_cost AS cost, 0 AS qty FROM drug d JOIN item i ON i.id = d.item_id ORDER BY d.id`);
  const lines = drugs.map((d, i) => ({ type: 'Item' as const, no: d.item_no, quantity: DRUG_FORMULARY[i][9], directUnitCost: Number(d.cost), locationCode: 'PHARM', vatProdPostingGroupCode: 'EXEMPT', lineDiscountPct: 0 }));
  const stockDate = addDays(today, -40);
  await post(vIds[0], stockDate, 'SGP-INV-77120', lines.slice(0, 15));
  await post(vIds[1], stockDate, 'HRL-55031', lines.slice(15));
  await post(vIds[3], addDays(today, -20), 'KPLC-0034412', [{ type: 'G/L Account', no: '6030', description: 'Electricity — clinic', quantity: 1, directUnitCost: K(38500), lineDiscountPct: 0 }]);
  await post(vIds[4], addDays(today, -15), 'EMW-2210', [{ type: 'G/L Account', no: '6035', description: 'Medical & sharps waste collection', quantity: 1, directUnitCost: K(12000), lineDiscountPct: 0 }]);
  await post(vIds[2], addDays(today, -25), 'DSEA-9087', [{ type: 'G/L Account', no: '5020', description: 'Composite, burs, gloves & dental consumables', quantity: 1, directUnitCost: K(64500), lineDiscountPct: 0 }]);
}

const FIRST_F = ['Akinyi', 'Wanjiku', 'Njeri', 'Atieno', 'Chebet', 'Mwende', 'Nyambura', 'Wambui', 'Achieng', 'Muthoni', 'Kerubo', 'Jepkosgei', 'Zawadi', 'Amani', 'Halima'];
const FIRST_M = ['Otieno', 'Kamau', 'Mwangi', 'Kiprop', 'Ochieng', 'Mutua', 'Njoroge', 'Kibet', 'Omondi', 'Wafula', 'Barasa', 'Juma', 'Hassan', 'Karanja', 'Onyango'];
const SURNAMES = ['Mwangi', 'Odhiambo', 'Kariuki', 'Wanyama', 'Kiplagat', 'Musyoka', 'Ndungu', 'Oduor', 'Cheruiyot', 'Maina', 'Owino', 'Gitau', 'Ruto', 'Nyaga', 'Kilonzo', 'Ali', 'Waweru', 'Okoth'];

interface Scenario {
  dept: 'OPD' | 'MCH' | 'DENTAL';
  dx: [string, string][];
  complaint: string;
  exam: string;
  plan: string;
  labs?: Record<string, Record<string, string | number>>;
  imaging?: { code: string; region: string; findings: string; impression: string };
  rx?: [generic: string, dose: string, freq: string, days: number][];
  proc?: string;
  dental?: { findings: [string, string, string][]; plan: [string, string, string | null][]; doNow: number[] };
  sex?: 'FEMALE';
}

const SCENARIOS: Scenario[] = [
  { dept: 'OPD', dx: [['J06.9', '']], complaint: 'Sore throat, runny nose and cough for 3 days', exam: 'Inflamed pharynx, no exudate. Chest clear.', plan: 'Symptomatic care, fluids, review if fever persists.',
    rx: [['Paracetamol', '1', 'TDS', 3], ['Cetirizine', '1', 'OD', 5]] },
  { dept: 'OPD', dx: [['B50.9', '']], complaint: 'Fever, chills and headache for 2 days', exam: 'Febrile 38.9°C, mild pallor, no neck stiffness.', plan: 'AL for 3 days, antipyretics, return if vomiting.',
    labs: { MRDT: { 'P. falciparum antigen': 'Positive' }, FBC: { Haemoglobin: 11.2 } }, rx: [['Artemether/Lumefantrine', '4', 'BD', 3], ['Paracetamol', '1', 'TDS', 3]] },
  { dept: 'OPD', dx: [['I10', '']], complaint: 'Hypertension review, occasional headaches', exam: 'BP 156/98, heart sounds normal, no oedema.', plan: 'Continue amlodipine, add losartan, salt restriction, review in 4 weeks.',
    labs: { UEC: {} }, rx: [['Amlodipine', '1', 'OD', 30], ['Losartan', '1', 'OD', 30]] },
  { dept: 'OPD', dx: [['E11.9', '']], complaint: 'Diabetes follow-up, polyuria', exam: 'Well, BMI 31, feet intact.', plan: 'Metformin, diet counselling, HbA1c in 3 months.',
    labs: { RBS: { 'Glucose (random)': 12.8 }, HBA1C: { HbA1c: 8.1 } }, rx: [['Metformin', '1', 'BD', 30]] },
  { dept: 'OPD', dx: [['N39.0', '']], complaint: 'Burning urination and frequency for 4 days', exam: 'Suprapubic tenderness, no loin tenderness.', plan: 'Ciprofloxacin 5 days, fluids.',
    labs: { URINE: { Leucocytes: '++', Nitrites: 'Positive', 'Pus cells': 18 } }, rx: [['Ciprofloxacin', '1', 'BD', 5], ['Paracetamol', '1', 'TDS', 3]], sex: 'FEMALE' },
  { dept: 'OPD', dx: [['K29.7', '']], complaint: 'Epigastric pain and heartburn, worse at night', exam: 'Epigastric tenderness, no guarding.', plan: 'PPI for 2 weeks, avoid NSAIDs.',
    labs: { HPYL: { 'H. pylori antigen': 'Negative' } }, rx: [['Omeprazole', '1', 'OD', 14]] },
  { dept: 'OPD', dx: [['A09', '']], complaint: 'Diarrhoea and vomiting since yesterday', exam: 'Mild dehydration, abdomen soft.', plan: 'ORS, zinc, metronidazole; return if bloody stool.',
    labs: { STOOL: { Consistency: 'Watery', 'Ova / cysts': 'E. histolytica' } }, rx: [['Oral rehydration salts', '1', 'PRN', 2], ['Metronidazole', '1', 'TDS', 5]] },
  { dept: 'OPD', dx: [['J18.9', '']], complaint: 'Productive cough and fever for 5 days, chest pain', exam: 'Crackles right base, RR 24.', plan: 'Co-amoxiclav and azithromycin, review in 48 h.',
    imaging: { code: 'IMG-CXR', region: 'Chest PA', findings: 'Patchy consolidation in the right lower zone. No effusion. Heart size normal.', impression: 'Right lower lobe pneumonia.' },
    labs: { FBC: { WBC: 15.6, Neutrophils: 82 } }, rx: [['Amoxicillin/Clavulanate', '1', 'BD', 7], ['Azithromycin', '1', 'OD', 3]] },
  { dept: 'OPD', dx: [['T14.1', '']], complaint: 'Cut on the forearm from a kitchen knife', exam: '3 cm clean laceration left forearm, no tendon involvement.', plan: 'Wound sutured, dressing, removal of sutures in 7 days.',
    proc: 'PROC-SUT', rx: [['Amoxicillin/Clavulanate', '1', 'BD', 5], ['Ibuprofen', '1', 'TDS', 3]] },
  { dept: 'OPD', dx: [['J45.9', '']], complaint: 'Wheezing and shortness of breath since morning', exam: 'Bilateral wheeze, SpO₂ 93%.', plan: 'Nebulised, inhaler technique taught.',
    proc: 'NUR-NEB', rx: [['Salbutamol inhaler', '2', 'PRN', 30]] },
  { dept: 'OPD', dx: [['M54.5', '']], complaint: 'Lower back pain after lifting', exam: 'Paraspinal tenderness, SLR negative.', plan: 'Analgesia, physiotherapy exercises.',
    proc: 'NUR-INJ', rx: [['Diclofenac', '1', 'BD', 5]] },
  { dept: 'MCH', dx: [['Z34.9', '']], complaint: 'Antenatal visit, 14 weeks', exam: 'Fundal height consistent with dates, BP normal.', plan: 'ANC profile, folic acid and iron, next visit in 4 weeks.',
    labs: { PDT: { hCG: 'Positive' }, BGRP: { 'ABO / Rh': 'O Rh+' }, FBC: { Haemoglobin: 11.6 } }, rx: [['Folic acid', '1', 'OD', 30], ['Ferrous sulphate', '1', 'OD', 30]], sex: 'FEMALE' },
  { dept: 'DENTAL', dx: [['K02.1', ''], ['K03.6', '']], complaint: 'Sensitivity on chewing, upper back teeth', exam: 'Occlusal caries 16 and 26, generalised calculus.', plan: 'Scaling and composite restorations.',
    dental: { findings: [['16', 'O', 'CARIES'], ['26', 'MO', 'CARIES'], ['36', '', 'FILLED']], plan: [['D-SCALE', '', null], ['D-FILL-COMP1', 'O', '16'], ['D-FILL-COMP2', 'MO', '26']], doNow: [0, 1] } },
  { dept: 'DENTAL', dx: [['K04.0', '']], complaint: 'Severe throbbing toothache, lower left', exam: 'Deep caries 36, tender to percussion.', plan: 'Root canal treatment and crown.',
    imaging: { code: 'IMG-PA', region: 'Tooth 36', findings: 'Deep carious lesion approaching the pulp of 36, periapical widening.', impression: 'Irreversible pulpitis 36.' },
    dental: { findings: [['36', 'OD', 'CARIES'], ['46', '', 'MISSING']], plan: [['D-RCT-POST', '', '36'], ['D-CROWN-PFM', '', '36']], doNow: [0] },
    rx: [['Amoxicillin', '1', 'TDS', 5], ['Ibuprofen', '1', 'TDS', 3]] },
  { dept: 'DENTAL', dx: [['K01.1', '']], complaint: 'Pain and swelling behind the last lower right tooth', exam: 'Partially erupted 48 with pericoronitis.', plan: 'OPG, surgical removal of 48.',
    imaging: { code: 'IMG-OPG', region: 'Panoramic', findings: 'Mesioangular impaction of 48. Other third molars erupted.', impression: 'Impacted 48.' },
    dental: { findings: [['48', '', 'IMPACTED']], plan: [['D-SURGEXT', '', '48']], doNow: [0] },
    rx: [['Amoxicillin/Clavulanate', '1', 'BD', 5], ['Ibuprofen', '1', 'TDS', 5], ['Chlorhexidine mouthwash', '10 ml', 'BD', 7]] },
  { dept: 'DENTAL', dx: [['K05.1', '']], complaint: 'Bleeding gums when brushing', exam: 'Generalised marginal gingivitis, plaque.', plan: 'Scaling and oral hygiene instruction.',
    dental: { findings: [['11', '', 'HEALTHY'], ['21', '', 'HEALTHY']], plan: [['D-SCALE', '', null]], doNow: [0] }, rx: [['Chlorhexidine mouthwash', '10 ml', 'BD', 14]] },
];

interface Staff { [k: string]: Actor }

async function staffActors(): Promise<Staff> {
  const rows = await all<{ id: number; username: string }>('SELECT id, username FROM app_user');
  return Object.fromEntries(rows.map((r) => [r.username, { id: r.id, username: r.username }]));
}

async function seedPatients(today: IsoDate, n: number, s: Staff): Promise<number[]> {
  const ids: number[] = [];
  const schemes = await all<{ id: number; code: string }>('SELECT id, code FROM insurance_scheme');
  at(addDays(today, -45), '09:00');
  for (let i = 0; i < n; i++) {
    const female = i % 5 !== 1 && (i % 2 === 0 || rnd() < 0.5);
    const first = female ? pick(FIRST_F) : pick(FIRST_M);
    const age = i % 9 === 0 ? int(1, 9) : int(18, 72);
    const year = Number(today.slice(0, 4)) - age;
    const cover = rnd() < 0.5 ? pick(schemes) : null;
    const r = await patientsLib.registerPatient({
      title: age < 12 ? '' : female ? pick(['Ms', 'Mrs']) : 'Mr', first_name: first, last_name: pick(SURNAMES), middle_name: rnd() < 0.4 ? pick(female ? FIRST_F : FIRST_M) : '',
      sex: female ? 'FEMALE' : 'MALE', date_of_birth: `${year}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
      phone: `07${int(10, 99)}${int(100000, 999999)}`, id_type: age >= 18 ? 'NATIONAL_ID' : 'BIRTH_CERTIFICATE', id_number: age >= 18 ? String(int(20000000, 39999999)) : '',
      county_code: pick(['047', '022', '001']), address: pick(['Kilimani', 'Lavington', 'Dagoretti', 'Karen', 'Kibera', 'Ngong', 'Kawangware', 'Riruta']),
      allergies: rnd() < 0.12 ? pick(['Penicillin', 'Sulfa drugs', 'Aspirin']) : 'NKDA', chronic_conditions: age > 45 && rnd() < 0.35 ? pick(['Hypertension', 'Type 2 diabetes', 'Asthma']) : '',
      next_of_kin_name: `${pick([...FIRST_F, ...FIRST_M])} ${pick(SURNAMES)}`, next_of_kin_relation: pick(['Spouse', 'Parent', 'Sibling']), next_of_kin_phone: `07${int(10, 99)}${int(100000, 999999)}`,
      sms_consent: 1, scheme_id: cover?.id ?? '', member_no: cover ? `${cover.code}-${int(100000, 999999)}` : '', relationship: 'SELF', confirm_not_duplicate: 1,
    }, s.reception);
    ids.push(r.id);
  }
  return ids;
}

const drugId = async (generic: string): Promise<number> => (await one<{ id: number }>('SELECT id FROM drug WHERE generic_name = ?', generic))!.id;
const svcId = async (code: string): Promise<number> => (await one<{ id: number }>('SELECT id FROM service_item WHERE code = ?', code))!.id;
let mpesaSeq = 0;
const mpesaCode = (): string => `S${'ABCDEFGHJKLMNPQRSTUVWXYZ'[int(0, 23)]}${'ABCDEFGHJKLMNPQRSTUVWXYZ'[int(0, 23)]}${String(int(1000000, 9999999))}`.slice(0, 9) + String((mpesaSeq++) % 10);

/** Runs one visit through the clinic as far as `stopAt` (the whole way for history). */
async function runVisit(patientId: number, sc: Scenario, date: IsoDate, startMins: number, s: Staff,
  stopAt: 'TRIAGE' | 'CONSULT' | 'LAB_COLLECTED' | 'LAB_RESULTED' | 'PHARMACY' | 'CASHIER' | 'DONE'): Promise<string> {
  let t = startMins;
  const step = (m: number) => { t += m; at(date, hhmm(Math.min(t, 23 * 60 + 50))); };
  step(0);
  const covers = await patientsLib.listCovers(patientId);
  const cover = covers.find((c) => c.is_default && c.status === 'ACTIVE');
  const clinician = sc.dept === 'DENTAL' ? s.dentist : sc.dept === 'MCH' ? s.co : pick([s.doctor, s.co]);
  const { no } = await visitsLib.checkIn({
    patient_id: patientId, department_code: sc.dept, send_to: 'TRIAGE', priority: 'ROUTINE', payment_mode: cover ? 'INSURANCE' : 'CASH', cover_id: cover?.id ?? '',
    chief_complaint: sc.complaint,
  }, s.reception);
  if (stopAt === 'TRIAGE') return no;
  step(int(8, 25));
  const fever = sc.dx[0][0] === 'B50.9' || sc.dx[0][0] === 'J18.9';
  await visitsLib.recordTriage(no, {
    temperature_c: fever ? (38 + rnd() * 1.2).toFixed(1) : (36.3 + rnd() * 0.8).toFixed(1), pulse: int(68, fever ? 112 : 92), resp_rate: int(14, sc.dx[0][0] === 'J18.9' ? 26 : 20),
    bp_systolic: sc.dx[0][0] === 'I10' ? int(148, 168) : int(108, 134), bp_diastolic: sc.dx[0][0] === 'I10' ? int(92, 104) : int(68, 86),
    spo2: sc.dx[0][0] === 'J45.9' ? 93 : int(96, 99), weight_kg: (55 + rnd() * 35).toFixed(1), height_cm: int(150, 182), pain_score: int(0, 6), acuity: 'GREEN',
  }, s.nurse);
  if (stopAt === 'CONSULT') return no;
  step(int(10, 40));
  await consultLib.saveConsultation(no, { chief_complaint: sc.complaint, history: `${sc.complaint}. No prior treatment.`, examination: sc.exam, assessment: sc.dx.map((d) => d[0]).join(', '), plan: sc.plan }, clinician);
  for (const [code] of sc.dx) await consultLib.addDiagnosis(no, { icd_code: code, diagnosis_type: 'PRIMARY' }, clinician);
  const visit = (await visitsLib.getVisit(no))!;

  if (sc.dental) {
    await dentalLib.recordFinding(patientId, { teeth: '', condition: 'HEALTHY' }, clinician).catch(() => undefined);
    for (const [tooth, surf, cond] of sc.dental.findings) await dentalLib.recordFinding(patientId, { teeth: tooth, surfaces: surf, condition: cond, visit_id: visit.id }, clinician);
    const { no: planNo } = await dentalLib.createPlan(patientId, { title: sc.plan, visit_id: visit.id }, clinician);
    for (const [code, surf, tooth] of sc.dental.plan) await dentalLib.addPlanItem(planNo, { service_item_id: await svcId(code), teeth: tooth ?? '', surfaces: surf }, clinician);
    await dentalLib.setPlanStatus(planNo, 'ACCEPTED', clinician);
  }
  if (sc.labs) {
    const ids = await Promise.all(Object.keys(sc.labs).map(async (c) => (await one<{ id: number }>('SELECT id FROM lab_test WHERE code = ?', c))!.id));
    await consultLib.orderLabTests(no, { lab_test_ids: ids.join(','), priority: 'ROUTINE', clinical_notes: sc.complaint }, clinician);
    step(int(5, 15));
    const tests = await labLib.listVisitLabTests(visit.id);
    await labLib.collectSpecimens(tests.map((x) => x.id), s.lab);
    if (stopAt === 'LAB_COLLECTED') return no;
    step(int(20, 50));
    for (const tst of tests) {
      const params = await clinicSetup.listLabParameters(tst.lab_test_id);
      const wanted = sc.labs[tst.test_code] ?? {};
      const v: Record<string, unknown> = {};
      for (const p of params) {
        const w = wanted[p.name];
        if (w != null) v[`p_${p.id}`] = w;
        else if (p.result_type === 'OPTION') v[`p_${p.id}`] = (p.options ?? '').split(',')[0].trim();
        else if (p.result_type === 'TEXT') v[`p_${p.id}`] = 'See comment';
        else { const lo = p.ref_low ?? 0; const hi = p.ref_high ?? lo * 2 + 1; v[`p_${p.id}`] = (lo + (hi - lo) * (0.2 + rnd() * 0.6)).toFixed(1); }
      }
      await labLib.enterResults(tst.id, v, s.lab);
    }
    if (stopAt === 'LAB_RESULTED') return no;
    step(int(5, 20));
    await labLib.verifyResults(tests.map((x) => x.id), s.lab2);
  }
  if (sc.imaging) {
    const { no: rad } = await consultLib.orderImaging(no, { service_item_id: await svcId(sc.imaging.code), body_part: sc.imaging.region, clinical_notes: sc.complaint }, clinician);
    step(int(15, 30));
    await imagingLib.reportStudy(rad, { findings: sc.imaging.findings, impression: sc.imaging.impression }, sc.dept === 'DENTAL' ? s.dentist : s.doctor);
  }
  if (sc.proc) await consultLib.orderProcedure(no, { service_item_id: await svcId(sc.proc), quantity: 1, performed: '1', notes: 'Done without complication' }, s.nurse);
  if (sc.dental) {
    step(int(20, 60));
    const plan = (await dentalLib.listPlans(patientId))[0];
    const items = await dentalLib.listPlanItems(plan.id);
    for (const i of sc.dental.doNow) if (items[i]) await dentalLib.completePlanItem(items[i].id, {}, clinician);
  }
  let rxNo: string | null = null;
  if (sc.rx) {
    const lines = await Promise.all(sc.rx.map(async ([g, dose, freq, days]) => ({ drug_id: await drugId(g), dose, route: '', frequency: freq, duration_days: days })));
    rxNo = (await consultLib.prescribe(no, lines.map((l) => ({ ...l, route: 'PO' })), '', clinician)).no;
  }
  step(int(5, 15));
  await visitsLib.completeVisitClinically(no, { outcome: rnd() < 0.2 ? 'FOLLOW_UP' : 'HOME', follow_up_date: '' }, clinician);
  if (stopAt === 'PHARMACY') return no;
  if (rxNo) {
    step(int(5, 20));
    const rx = (await pharmacyLib.getPrescription(rxNo))!;
    const lines = await pharmacyLib.prescriptionLines(rx.id);
    await pharmacyLib.dispense(rxNo, Object.fromEntries(lines.map((l) => [`qty_${l.id}`, String(Math.min(l.quantity, Number(l.stock)))]).filter(([, q]) => Number(q) > 0)), s.pharmacist);
  }
  if (stopAt === 'CASHIER') return no;
  step(int(3, 10));
  if (visit.payment_mode === 'CASH') {
    const acc = await billingLib.visitAccount(visit.id);
    if (acc.balance > 0) {
      const mpesa = rnd() < 0.55;
      await billingLib.receivePayment(no, { method: mpesa ? 'MPESA' : 'CASH', amount: (acc.balance / 100).toFixed(2), reference: mpesa ? mpesaCode() : '' }, s.cashier);
    }
  }
  await billingLib.finaliseBill(no, s.cashier);
  const after = await billingLib.visitAccount(visit.id);
  if (after.balance > 0) await billingLib.receivePayment(no, { method: 'MPESA', amount: (after.balance / 100).toFixed(2), reference: mpesaCode() }, s.cashier);
  return no;
}

/** A month of clinic: history driven to completion, claims worked, and today's clinic mid-flow. */
async function seedClinicActivity(today: IsoDate): Promise<{ visits: number; patients: number }> {
  const s = await staffActors();
  const patients = await seedPatients(today, Number(process.env.SEED_DEMO_PATIENTS || 36), s);
  const historical = Number(process.env.SEED_DEMO_VISITS || 24);
  let made = 0;
  for (let i = 0; i < historical; i++) {
    const daysAgo = 1 + Math.floor((i * 27) / historical);
    const date = addDays(today, -daysAgo);
    if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) continue;
    const sc = SCENARIOS[i % SCENARIOS.length];
    const candidates = sc.sex === 'FEMALE'
      ? await all<{ id: number }>("SELECT id FROM patient WHERE sex = 'FEMALE' AND date_of_birth < ? ORDER BY id", `${Number(today.slice(0, 4)) - 18}-01-01`)
      : patients.map((id) => ({ id }));
    const pid = candidates[(i * 7) % candidates.length].id;
    if (await one("SELECT 1 FROM visit WHERE patient_id = ? AND status = 'OPEN'", pid)) continue;
    await runVisit(pid, sc, date, 8 * 60 + 15 + (i % 4) * 70, s, 'DONE');
    made++;
  }

  // Claims: older ones submitted and decided (mostly paid in full; one short-paid, one rejected).
  const drafts = await all<{ no: string; claim_date: string }>("SELECT no, claim_date FROM insurance_claim WHERE status = 'DRAFT' ORDER BY claim_date");
  const submitNow = drafts.filter((d) => d.claim_date <= addDays(today, -7));
  if (submitNow.length) {
    at(addDays(today, -6), '15:00');
    await claimsLib.submitClaims(submitNow.map((d) => d.no), `BATCH-${addDays(today, -6).replace(/-/g, '')}`, s.claims);
    at(addDays(today, -2), '11:00');
    for (const [i, c] of submitNow.filter((d) => d.claim_date <= addDays(today, -12)).entries()) {
      const claim = (await claimsLib.getClaim(c.no))!;
      if (i === 1) await claimsLib.decideClaim(c.no, { decision: 'PARTIAL', approved_amount: ((Number(claim.amount) * 0.8) / 100).toFixed(2), rejection_reason: 'Consultation paid at scheme rate' }, s.claims);
      else if (i === 3) await claimsLib.decideClaim(c.no, { decision: 'REJECTED', rejection_reason: 'Member not active on date of service' }, s.claims);
      else await claimsLib.decideClaim(c.no, { decision: 'APPROVED' }, s.claims);
    }
  }

  // Today: a clinic in progress — every stage of the journey represented.
  const nowMins = (): number => { const d = new Date(Date.now() + 3 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const base = Math.max(8 * 60, Math.min(nowMins() - 150, 15 * 60));
  const free = await all<{ id: number }>("SELECT p.id FROM patient p WHERE NOT EXISTS (SELECT 1 FROM visit v WHERE v.patient_id = p.id AND v.status = 'OPEN') ORDER BY p.id DESC");
  const plan: [number, 'DONE' | 'CASHIER' | 'PHARMACY' | 'LAB_RESULTED' | 'LAB_COLLECTED' | 'CONSULT' | 'TRIAGE'][] = [
    [0, 'DONE'], [12, 'DONE'], [4, 'CASHIER'], [2, 'PHARMACY'], [1, 'LAB_RESULTED'], [7, 'LAB_COLLECTED'], [14, 'CONSULT'], [5, 'CONSULT'], [10, 'TRIAGE'], [3, 'TRIAGE'],
  ];
  for (const [k, [scIdx, stop]] of plan.entries()) {
    const sc = SCENARIOS[scIdx];
    const pid = sc.sex === 'FEMALE'
      ? (await one<{ id: number }>("SELECT p.id FROM patient p WHERE p.sex = 'FEMALE' AND p.date_of_birth < ? AND NOT EXISTS (SELECT 1 FROM visit v WHERE v.patient_id = p.id AND v.status = 'OPEN') ORDER BY p.id LIMIT 1", `${Number(today.slice(0, 4)) - 18}-01-01`))!.id
      : free[k].id;
    await runVisit(pid, sc, today, base + k * 14, s, stop);
    made++;
  }

  // Appointments: later today, the coming week, and a missed one last week.
  at(addDays(today, -3), '10:00');
  const depts = ['OPD', 'DENTAL', 'MCH', 'OPD', 'DENTAL', 'OPD'];
  const later = await all<{ id: number }>("SELECT p.id FROM patient p WHERE NOT EXISTS (SELECT 1 FROM visit v WHERE v.patient_id = p.id AND v.status = 'OPEN') ORDER BY p.id LIMIT 14");
  for (let i = 0; i < 12; i++) {
    const date = addDays(today, i < 3 ? 0 : Math.ceil((i - 2) / 2));
    const startMin = i < 3 ? Math.min(Math.max(nowMins() + 30 + i * 40, 9 * 60), 17 * 60) : 9 * 60 + (i % 6) * 60;
    await apptLib.bookAppointment({
      patient_id: later[i].id, department_code: depts[i % depts.length], appointment_date: date, start_time: hhmm(Math.floor(startMin / 20) * 20),
      duration_mins: 20, appointment_type: depts[i % depts.length] === 'DENTAL' ? 'DENTAL' : i % 2 ? 'REVIEW' : 'NEW', reason: i % 2 ? 'Review' : 'New complaint', source: 'PHONE',
      clinician_user_id: depts[i % depts.length] === 'DENTAL' ? s.dentist.id : '',
    }, s.reception).catch(() => undefined);
  }
  return { visits: made, patients: patients.length };
}

/* ================================================================ entry point */

export interface SeedResult {
  seeded: boolean;
  /** False when only the reference data went in (a production first boot). */
  demo?: boolean;
  patients?: number;
  visits?: number;
  /** Set only when this boot generated the administrator's password — it is printed once. */
  adminPassword?: string;
}

/**
 * Whether an empty database gets the demonstration clinic (patients, a month of visits, claims,
 * fifteen sign-ins with published passwords) or just the setup a live clinic starts from. Demo
 * data is the default everywhere except a production build, where SEED_DEMO_DATA=true has to ask.
 */
export function demoSeedWanted(): boolean {
  const flag = process.env.SEED_DEMO_DATA?.trim().toLowerCase();
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}

export async function seedIfEmpty(): Promise<SeedResult> {
  if ((await one<{ c: number }>('SELECT COUNT(*) c FROM organisation'))!.c > 0) return { seeded: false };
  const now = new Date().toISOString();
  const todayIso = now.slice(0, 10);
  const demo = demoSeedWanted();

  /*
   * One outer transaction for the whole seed: every service call nests into it, so a failure
   * part-way leaves an empty database to try again rather than half a clinic.
   */
  const t0 = Date.now();
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const r = await fn();
    if (process.env.SEED_VERBOSE) console.log(`  seed: ${name} done at ${Math.round((Date.now() - t0) / 1000)}s`);
    return r;
  };
  try {
    const counts = await tx(async () => {
      await step('reference data', () => seedReferenceData(now, todayIso));
      await step('cash & tax', () => seedCashAndTax(now));
      await step('receivables setup', () => seedReceivablesSetup(now));
      await step('inventory', () => seedInventory(now));
      await step('hr & payroll', () => seedHrPayroll(now, todayIso));
      await step('fixed assets', () => seedFixedAssets(now, todayIso, demo));
      await step('financial reports', () => seedFinancialReports(now));
      await step('clinic setup', () => seedClinic(now));
      await step('formulary', () => seedFormulary());
      if (!demo) return hardenForProduction();
      await step('opening position', () => seedOpeningPosition(todayIso));
      await step('suppliers & stock', () => seedSuppliers(todayIso));
      return step('clinic activity', () => seedClinicActivity(todayIso));
    }, { timeout: 3_600_000 });
    return { seeded: true, demo, ...counts };
  } finally {
    setDemoClock(null);
  }
}

/**
 * A production first boot keeps the roles, chart of accounts and setups, but not the demo
 * sign-ins: every one but the administrator is disabled, and they get ADMIN_INITIAL_PASSWORD or a random
 * one logged exactly once, flagged must-change.
 */
async function hardenForProduction(): Promise<Pick<SeedResult, 'adminPassword'>> {
  await run("UPDATE app_user SET status = 'DISABLED' WHERE username <> ?", ADMIN_USERNAME);
  const configured = process.env.ADMIN_INITIAL_PASSWORD?.trim();
  const password = configured || crypto.randomBytes(12).toString('base64url');
  await run('UPDATE app_user SET password_hash = ?, must_change_password = true WHERE username = ?', hashPassword(password), ADMIN_USERNAME);
  return configured ? {} : { adminPassword: password };
}

/**
 * Stamps gl_account.indentation from the Begin-Total / End-Total bracketing the CHART declares —
 * the same walk lib/gl.ts's indentChartOfAccounts() performs, inlined so seeding stays
 * self-contained.
 */
async function indentSeededChart(): Promise<void> {
  const accounts = await all<{ id: number; account_type: string }>('SELECT id, account_type FROM gl_account ORDER BY code');
  let depth = 0;
  const pairs: [number, number][] = [];
  for (const a of accounts) {
    if (a.account_type === 'END_TOTAL') depth = Math.max(0, depth - 1);
    pairs.push([a.id, depth]);
    if (a.account_type === 'BEGIN_TOTAL') depth += 1;
  }
  await run(
    `UPDATE gl_account g SET indentation = v.depth FROM (VALUES ${pairs.map(() => '(?::int, ?::int)').join(',')}) AS v(id, depth) WHERE g.id = v.id`,
    ...pairs.flat(),
  );
}

// Exported for the test suite's own fixtures.
export { encryptField as _encryptField, lastFour as _lastFour };
