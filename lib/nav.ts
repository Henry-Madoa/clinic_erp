export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Visible once the user can execute any one of these pages. */
  page: string | string[];
  badge?: 'pendingApprovals';
}

/** A collapsible sub-menu inside a group — one level of nesting only. */
export interface NavSubMenu {
  submenu: string;
  icon: string;
  items: NavItem[];
}

export type NavEntry = NavItem | NavSubMenu;

export const isSubMenu = (e: NavEntry): e is NavSubMenu => 'submenu' in e;

export interface NavGroup {
  group: string;
  items: NavEntry[];
  /** Which Role Centres surface this group in the sidebar (Business Central: the Profile / Role
   *  Center defines the navigation). Omit for a group every Role Centre sees. The SUPER Role
   *  Centre always sees every group. Values are `profile.role_centre` keys —
   *  SUPER (every group) | RECEPTION | CLINICIAN | NURSE | DENTAL | LAB | PHARMACY | CASHIER | CLAIMS | FINANCE_MANAGER | ACCOUNTANT | HR_PAYROLL | SELF_SERVICE. */
  centres?: string[];
}

/** Whether `group` shows in the sidebar for a user whose active Role Centre is `roleCentre`. */
export const groupInRoleCentre = (group: NavGroup, roleCentre: string): boolean =>
  roleCentre === 'SUPER' || !group.centres || group.centres.includes(roleCentre);

/*
 * Navigation definition, kept out of the sidebar's 'use client' module: a value
 * exported from a client module reaches a Server Component as a client-reference
 * proxy, not the array itself, so the layout could not filter it.
 */
export const NAV: NavGroup[] = [
  {
    group: 'Home',
    items: [
      { path: '/dashboard', label: 'Dashboard', icon: '▤', page: 'DASHBOARD' },
      { path: '/approvals', label: 'Approvals', icon: '✔', page: 'APPROVALS', badge: 'pendingApprovals' },
    ],
  },
  {
    group: 'Front Office',
    centres: ['RECEPTION', 'NURSE', 'CASHIER'],
    items: [
      { path: '/patients', label: 'Patients & Check-in', icon: '🪪', page: 'PATIENTS' },
      { path: '/appointments', label: 'Appointments', icon: '📅', page: 'APPOINTMENTS' },
      { path: '/visits', label: 'Patient Flow', icon: '🔀', page: 'VISITS' },
      { path: '/queue', label: 'Queues', icon: '⏳', page: 'QUEUES' },
      { path: '/queue-display', label: 'Waiting-Room Display', icon: '📺', page: 'QUEUES' },
    ],
  },
  {
    group: 'Clinical',
    centres: ['CLINICIAN', 'NURSE', 'DENTAL'],
    items: [
      { path: '/queue/TRIAGE', label: 'Triage Queue', icon: '🩺', page: 'TRIAGE' },
      { path: '/queue/OPD', label: 'Consultation Queue', icon: '👩‍⚕️', page: 'CONSULTATION' },
      { path: '/visits?view=open', label: 'Open Visits', icon: '📋', page: 'VISITS' },
      { path: '/procedures', label: 'Procedures & Nursing', icon: '💉', page: 'PROCEDURES' },
      { path: '/patients', label: 'Patient Records', icon: '🗂', page: 'PATIENTS' },
    ],
  },
  {
    group: 'Dental',
    centres: ['DENTAL'],
    items: [
      { path: '/dental', label: 'Dental Clinic', icon: '🦷', page: 'DENTAL' },
      { path: '/queue/DENTAL', label: 'Dental Queue', icon: '⏳', page: 'DENTAL' },
      { path: '/dental/plans', label: 'Treatment Plans', icon: '🧾', page: 'DENTAL' },
    ],
  },
  {
    group: 'Diagnostics',
    centres: ['LAB', 'CLINICIAN'],
    items: [
      { path: '/laboratory', label: 'Lab — Specimen Collection', icon: '🧪', page: 'LABORATORY' },
      { path: '/laboratory/process', label: 'Lab — Result Entry', icon: '🔬', page: 'LABORATORY' },
      { path: '/laboratory/verify', label: 'Lab — Verification', icon: '✅', page: 'LABORATORY' },
      { path: '/laboratory/done', label: 'Lab — Released Reports', icon: '📄', page: 'LABORATORY' },
      { path: '/imaging', label: 'Imaging & Radiology', icon: '🩻', page: 'IMAGING' },
    ],
  },
  {
    group: 'Pharmacy',
    centres: ['PHARMACY'],
    items: [
      { path: '/pharmacy', label: 'Prescriptions to Dispense', icon: '💊', page: 'PHARMACY' },
      { path: '/pharmacy/dispensed', label: 'Dispensed', icon: '✔', page: 'PHARMACY' },
      { path: '/pharmacy/stock', label: 'Drug Stock & Formulary', icon: '📦', page: 'PHARMACY' },
      { path: '/pharmacy/reorder', label: 'Low Stock', icon: '⚠', page: 'PHARMACY' },
    ],
  },
  {
    group: 'Billing & Insurance',
    centres: ['CASHIER', 'CLAIMS'],
    items: [
      { path: '/cashier', label: 'Cashier', icon: '💳', page: 'CASHIER' },
      { path: '/cashier/receipts', label: 'Receipts & Collections', icon: '🧾', page: 'CASHIER' },
      { path: '/claims', label: 'Insurance Claims', icon: '🏥', page: 'CLAIMS' },
      { path: '/claims/preauth', label: 'Pre-authorisations', icon: '🔏', page: 'CLAIMS' },
      { path: '/claims/payers', label: 'Payers Outstanding', icon: '📊', page: 'CLAIMS' },
      { path: '/till-closings', label: 'Cashier Shift Closing', icon: '🔐', page: 'TILL_CLOSINGS' },
    ],
  },
  {
    group: 'Insights',
    centres: ['FINANCE_MANAGER', 'CLINICIAN'],
    items: [
      { path: '/clinic-reports', label: 'Clinic Performance', icon: '📈', page: 'CLINIC_REPORTS' },
      { path: '/clinic-reports/morbidity', label: 'Morbidity (MOH 705)', icon: '🩺', page: 'CLINIC_REPORTS' },
      { path: '/clinic-reports/revenue', label: 'Revenue & Payers', icon: '💹', page: 'CLINIC_REPORTS' },
      { path: '/clinic-reports/services', label: 'Lab, Dental & Pharmacy', icon: '🧪', page: 'CLINIC_REPORTS' },
    ],
  },
  {
    group: 'Finance',
    centres: ['FINANCE_MANAGER', 'ACCOUNTANT'],
    items: [
      {
        // The ledger's own screens, Chart of Accounts first. Customer / Vendor / Bank ledger
        // entries are deliberately absent: each is on its own party card, where you arrive with
        // the party already chosen instead of filtering a system-wide list.
        submenu: 'General Ledger', icon: '⚖',
        items: [
          { path: '/accounting/accounts', label: 'Chart of Accounts', icon: '🗂', page: 'GL' },
          { path: '/accounting/journals', label: 'Journals', icon: '📓', page: 'GL' },
          { path: '/accounting/periods', label: 'Accounting Periods', icon: '📅', page: 'GL' },
          { path: '/accounting/close-income-statement', label: 'Close Income Statement', icon: '🔐', page: 'GL' },
          { path: '/budgets', label: 'Budgets', icon: '🎯', page: 'GL_BUDGETS' },
        ],
      },
      {
        // Each of Receivables' documents is its own sidebar entry rather than a tab reached
        // through a generic "Sales Documents" link — the tabs still exist on the page, but a
        // credit memo is no longer three clicks and a guess away. Setup screens are deliberately
        // absent: they live in Admin Centre → Setup Pool.
        submenu: 'Receivables', icon: '🧾',
        items: [
          { path: '/receivables', label: 'Customers', icon: '👤', page: 'RECEIVABLES' },
          { path: '/receivables/quotes', label: 'Sales Quotes', icon: '📝', page: 'RECEIVABLES' },
          { path: '/receivables/orders', label: 'Sales Orders', icon: '📋', page: 'RECEIVABLES' },
          { path: '/receivables/sales-invoices', label: 'Sales Invoices', icon: '📄', page: 'RECEIVABLES' },
          { path: '/receivables/credit-memos', label: 'Sales Credit Memos', icon: '↩', page: 'RECEIVABLES' },
          { path: '/receivables/posted-documents', label: 'Posted Documents', icon: '🗄', page: 'RECEIVABLES' },
          { path: '/receivables/reminders', label: 'Reminders', icon: '⏰', page: 'RECEIVABLES' },
          { path: '/receivables/finance-charges', label: 'Finance Charge Memos', icon: '💢', page: 'RECEIVABLES' },
          { path: '/receivables/aged-ar', label: 'Aged Receivables', icon: '📊', page: 'RECEIVABLES' },
          { path: '/receivables/statement', label: 'Customer Statement', icon: '🧾', page: 'RECEIVABLES' },
        ],
      },
      {
        // Broken out the same way Receivables is — one entry per document, setup screens left to
        // Admin Centre → Setup Pool.
        submenu: 'Payables', icon: '📥',
        items: [
          { path: '/payables', label: 'Vendors', icon: '🏭', page: 'PAYABLES' },
          { path: '/payables/quotes', label: 'Purchase Quotes', icon: '📝', page: 'PAYABLES' },
          { path: '/payables/orders', label: 'Purchase Orders', icon: '📋', page: 'PAYABLES' },
          { path: '/payables/purchase-invoices', label: 'Purchase Invoices', icon: '📄', page: 'PAYABLES' },
          { path: '/payables/credit-memos', label: 'Purchase Credit Memos', icon: '↩', page: 'PAYABLES' },
          { path: '/payables/posted-documents', label: 'Posted Documents', icon: '🗄', page: 'PAYABLES' },
          { path: '/payables/aged-ap', label: 'Aged Payables', icon: '📊', page: 'PAYABLES' },
          { path: '/payables/statement', label: 'Vendor Statement', icon: '🧾', page: 'PAYABLES' },
        ],
      },
      {
        submenu: 'Cash Management', icon: '🏦',
        items: [
          { path: '/cash-management', label: 'Bank Accounts', icon: '🏦', page: 'CASH_MGMT' },
          { path: '/cash-management/reconciliations', label: 'Bank Reconciliation', icon: '✔', page: 'CASH_MGMT' },
          { path: '/cash-management/receipts', label: 'Receipts', icon: '🧾', page: 'CASH_MGMT' },
          { path: '/cash-management/payment-vouchers', label: 'Payment Vouchers', icon: '💸', page: 'CASH_MGMT' },
          { path: '/branch-cash', label: 'Cash Office (Floats)', icon: '🏧', page: 'CASH_MANAGEMENT' },
          { path: '/till-closings', label: 'Cashier Closing', icon: '🔐', page: 'TILL_CLOSINGS' },
          { path: '/cash-management/currencies', label: 'Currencies', icon: '💱', page: 'CASH_MGMT' },
          // The revaluation panel lives on the Exchange Rates tab; the anchor lands on it.
          { path: '/cash-management/exchange-rates#adjust', label: 'Adjust Exchange Rates', icon: '📈', page: 'CASH_MGMT' },
        ],
      },
      // Staff money: an imprest is issued and later surrendered, petty cash is paid out of a float,
      // a staff claim refunds what an employee spent — all through the employee subledger.
      {
        submenu: 'Staff Cash Desk', icon: '💼',
        items: [
          { path: '/imprest', label: 'Imprest Requests', icon: '📨', page: 'IMPREST' },
          { path: '/imprest/surrenders', label: 'Imprest Surrenders', icon: '↩️', page: 'IMPREST' },
          { path: '/imprest/petty-cash', label: 'Petty Cash', icon: '🪙', page: 'IMPREST' },
          { path: '/imprest/staff-claims', label: 'Staff Claims', icon: '🧾', page: 'IMPREST' },
          { path: '/imprest/ledger', label: 'Employee Ledger', icon: '📒', page: 'IMPREST' },
        ],
      },
      // Store requisitions issue stock out of Inventory; purchase requisitions feed Payables.
      {
        submenu: 'Requisitions', icon: '📋',
        items: [
          { path: '/requisitions', label: 'Store Requisitions', icon: '📦', page: 'REQUISITIONS' },
          { path: '/requisitions/purchase', label: 'Purchase Requisitions', icon: '🛒', page: 'REQUISITIONS' },
        ],
      },
      {
        submenu: 'VAT & WHT', icon: '🧮',
        items: [
          { path: '/finance/vat/input-listing', label: 'VAT Input Listing', icon: '📄', page: 'VAT_REPORTS' },
          { path: '/finance/vat/wht-analysis', label: 'WHT Analysis', icon: '📊', page: 'VAT_REPORTS' },
          { path: '/finance/vat/wht-certificates', label: 'WHT Certificates', icon: '📜', page: 'VAT_REPORTS' },
        ],
      },
      {
        submenu: 'Inventory', icon: '📦',
        items: [
          { path: '/inventory/items', label: 'Items', icon: '📦', page: 'INVENTORY' },
          { path: '/inventory/item-journal', label: 'Item Journal', icon: '📓', page: 'INVENTORY' },
        ],
      },
      {
        submenu: 'Fixed Assets', icon: '🏛',
        items: [
          { path: '/fixed-assets', label: 'Assets', icon: '🏛', page: 'FIXED_ASSETS' },
          { path: '/fixed-assets/journal', label: 'FA Journal', icon: '📓', page: 'FIXED_ASSETS' },
          { path: '/fixed-assets/depreciation', label: 'Calculate Depreciation', icon: '📉', page: 'FIXED_ASSETS' },
          { path: '/fixed-assets/book-value', label: 'Book Value Report', icon: '📊', page: 'FIXED_ASSETS' },
        ],
      },
      {
        submenu: 'Financial Reports', icon: '🧾',
        items: [
          { path: '/accounting/trial-balance', label: 'Trial Balance', icon: '⚖', page: 'GL' },
          { path: '/finance/financial-reports', label: 'Reports', icon: '📄', page: 'FINANCIAL_REPORTS' },
          { path: '/finance/financial-reports/row-definitions', label: 'Row Definitions', icon: '↔', page: 'FINANCIAL_REPORTS' },
          { path: '/finance/financial-reports/column-layouts', label: 'Column Layouts', icon: '⋮', page: 'FINANCIAL_REPORTS' },
        ],
      },
      {
        submenu: 'Reports', icon: '📊',
        items: [
          { path: '/reports', label: 'Financial Statements',  icon: '📄', page: 'REPORTS' },
        ],
      },
    ],
  },
  {
    group: 'HR & Payroll',
    centres: ['HR_PAYROLL'],
    items: [
      {
        submenu: 'Employee Management', icon: '🧑‍💼',
        items: [
          { path: '/employees', label: 'Employees', icon: '🧑‍💼', page: 'EMPLOYEES' },
          { path: '/employee-edits', label: 'Employee Editing', icon: '✏', page: 'EMPLOYEE_EDITS' },
          { path: '/employee-contract-changes', label: 'Contract / Salary Changes', icon: '📄', page: 'EMPLOYEE_CONTRACT_CHANGES' },
          { path: '/employee-exits', label: 'Employee Exits', icon: '🚪', page: 'EMPLOYEE_EXITS' },
        ],
      },
      {
        // The establishment: AL Company Jobs (positions, posts, reporting lines) and the chart drawn from them.
        submenu: 'Organisation', icon: '🏛',
        items: [
          { path: '/organogram', label: 'Organogram', icon: '🏛', page: 'ORGANOGRAM' },
          { path: '/company-jobs', label: 'Company Jobs', icon: '💼', page: 'COMPANY_JOBS' },
          { path: '/organogram/vacant', label: 'Vacant Positions', icon: '🪑', page: 'ORGANOGRAM' },
        ],
      },
      {
        submenu: 'Leave Management', icon: '🏖',
        items: [
          { path: '/leave-applications', label: 'Leave Applications', icon: '🏖', page: 'LEAVE_APPLICATIONS' },
          { path: '/leave-plans', label: 'Leave Plans', icon: '🗓', page: 'LEAVE_PLANS' },
          { path: '/leave-recalls', label: 'Leave Recalls', icon: '↩', page: 'LEAVE_RECALLS' },
          { path: '/leave-adjustments', label: 'Leave Adjustments', icon: '⚖', page: 'LEAVE_ADJUSTMENTS' },
        ],
      },
      {
        submenu: 'Payroll', icon: '💰',
        items: [
          { path: '/payroll', label: 'Payroll', icon: '💰', page: 'PAYROLL' },
          { path: '/payroll/periods', label: 'Payroll Periods', icon: '🗓', page: 'PAYROLL_PERIODS' },
        ],
      },
    ],
  },
  {
    // Employee Self Service — the AL "SS" pages: every entry is the employee's own documents.
    group: 'Self Service',
    centres: ['SELF_SERVICE'],
    // Grouped the way the modules that own each document are — Payroll, HR, Finance, Inventory.
    items: [
      {
        submenu: 'Payroll', icon: '💰',
        items: [
          { path: '/self-service/payslips', label: 'Payslips', icon: '🧾', page: 'SELF_SERVICE_PAYSLIPS' },
          { path: '/self-service/p9', label: 'P9 Tax Card', icon: '📄', page: 'SELF_SERVICE_P9' },
        ],
      },
      {
        submenu: 'HR', icon: '🧑‍💼',
        items: [
          { path: '/self-service/record', label: 'My Record', icon: '🪪', page: 'SELF_SERVICE_RECORD' },
          { path: '/self-service/employee-editing', label: 'Employee Editing', icon: '✏', page: 'SELF_SERVICE_RECORD' },
          { path: '/self-service/leave', label: 'Leave Applications', icon: '🏖', page: 'SELF_SERVICE_LEAVE' },
          { path: '/self-service/leave-plans', label: 'Leave Plans', icon: '🗓', page: 'SELF_SERVICE_LEAVE_PLANS' },
        ],
      },
      {
        submenu: 'Finance', icon: '🏦',
        items: [
          { path: '/self-service/imprest', label: 'Imprest Requests & Surrenders', icon: '💼', page: 'SELF_SERVICE_IMPREST' },
          { path: '/self-service/petty-cash', label: 'Petty Cash', icon: '💵', page: 'SELF_SERVICE_PETTY_CASH' },
        ],
      },
      {
        submenu: 'Inventory', icon: '📦',
        items: [
          { path: '/self-service/requisitions', label: 'Store Requisitions', icon: '📦', page: 'SELF_SERVICE_REQUISITIONS' },
          { path: '/self-service/purchase-requisitions', label: 'Purchase Requisitions', icon: '🛒', page: 'SELF_SERVICE_REQUISITIONS' },
        ],
      },
    ],
  },
  {
    group: 'Administration',
    items: [
      { path: '/clinic-setup', label: 'Clinic Setup', icon: '🏥', page: 'CLINIC_SETUP' },
      {
        path: '/admin', label: 'Admin Centre', icon: '⚙',
        page: [
          'ADMIN_COMPANY', 'ADMIN_APPEARANCE', 'ADMIN_USERS', 'ADMIN_WORKFLOWS_SETUP', 'ADMIN_ROLES',
          'ADMIN_POOL_DIMENSIONS', 'ADMIN_POOL_DENOMINATIONS', 'ADMIN_CASHIER_SETUP',
          'ADMIN_WORKFLOWS_DEFINITIONS', 'ADMIN_WORKFLOWS_GROUPS', 'ADMIN_WORKFLOWS_TABLES',
          'ADMIN_AUDIT', 'ADMIN_CHANGELOG', 'ADMIN_DATA', 'ADMIN_JOB_QUEUE',
          'ADMIN_HR_JOB_GRADES', 'ADMIN_HR_SALARY_SCALES', 'ADMIN_HR_CONTRACT_TYPES',
          'ADMIN_HR_TERMINATION_REASONS', 'ADMIN_HR_CLEARANCE_SECTIONS',
          'ADMIN_HR_LEAVE_TYPES', 'ADMIN_HR_LEAVE_CALENDAR', 'ADMIN_HR_HOLIDAYS', 'ADMIN_HR_ACCRUE_MATRIX',
          'ADMIN_PAYROLL_SETUP', 'ADMIN_PAYROLL_POSTING_GROUPS', 'ADMIN_PAYROLL_PAYE_BANDS',
          'ADMIN_PAYROLL_NSSF_TIERS', 'ADMIN_PAYROLL_TRANSACTION_CODES',
        ],
      },
    ],
  },
];
