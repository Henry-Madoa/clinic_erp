-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "acc_schedule_line" (
    "id" SERIAL NOT NULL,
    "acc_schedule_name_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "row_no" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "totaling_type" TEXT NOT NULL DEFAULT 'POSTING_ACCOUNTS',
    "totaling" TEXT NOT NULL DEFAULT '',
    "amount_type" TEXT NOT NULL DEFAULT 'NET_AMOUNT',
    "row_type" TEXT NOT NULL DEFAULT 'NET_CHANGE',
    "show" TEXT NOT NULL DEFAULT 'YES',
    "bold" INTEGER NOT NULL DEFAULT 0,
    "italic" INTEGER NOT NULL DEFAULT 0,
    "underline" INTEGER NOT NULL DEFAULT 0,
    "double_underline" INTEGER NOT NULL DEFAULT 0,
    "show_opposite_sign" INTEGER NOT NULL DEFAULT 0,
    "new_page" INTEGER NOT NULL DEFAULT 0,
    "indentation" INTEGER NOT NULL DEFAULT 0,
    "dimension_1_totaling" TEXT NOT NULL DEFAULT '',
    "dimension_2_totaling" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "acc_schedule_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_schedule_name" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "default_column_layout_name" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "acc_schedule_name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_period" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "new_fiscal_year" INTEGER NOT NULL DEFAULT 0,
    "fiscally_closed" INTEGER NOT NULL DEFAULT 0,
    "date_locked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accounting_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TEXT,
    "created_at" TEXT,
    "work_date" TEXT,
    "active_profile_id" INTEGER,
    "signature_image" TEXT,
    "company_code" TEXT,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TEXT,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_enrolled_at" TEXT,
    "totp_recovery_codes" TEXT,
    "totp_last_step" BIGINT,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_user_setup" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "approver_id" INTEGER,
    "substitute_id" INTEGER,
    "is_approval_administrator" INTEGER NOT NULL DEFAULT 0,
    "can_reverse_journal" INTEGER NOT NULL DEFAULT 0,
    "allow_posting_from" TEXT,
    "allow_posting_to" TEXT,
    "allow_posting_from_time" TEXT,
    "allow_posting_to_time" TEXT,
    "employee_id" INTEGER,

    CONSTRAINT "approval_user_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL DEFAULT 'image',
    "format" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "uploaded_at" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "at" TEXT NOT NULL,
    "user_id" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "detail" TEXT,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_acc_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "bank_acc_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "bank_name" TEXT,
    "account_no" TEXT,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "account_type" TEXT NOT NULL DEFAULT 'OTHER',
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "balance_lcy" BIGINT NOT NULL DEFAULT 0,
    "bank_acc_posting_group_code" TEXT,
    "bank_branch_no" TEXT,
    "bank_sort_code" TEXT,
    "external_bank_code" TEXT,
    "iban" TEXT,
    "swift_code" TEXT,
    "min_balance" BIGINT NOT NULL DEFAULT 0,
    "last_statement_no" INTEGER NOT NULL DEFAULT 0,
    "balance_last_statement" BIGINT NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account_ledger_entry" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "journal_line_id" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL,
    "running_balance" BIGINT NOT NULL,
    "reconciled" INTEGER NOT NULL DEFAULT 0,
    "bank_reconciliation_id" INTEGER,
    "created_at" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "amount_lcy" BIGINT NOT NULL DEFAULT 0,
    "document_type" TEXT NOT NULL DEFAULT '',
    "document_no" TEXT,
    "external_document_no" TEXT,
    "open" INTEGER NOT NULL DEFAULT 1,
    "statement_no" TEXT,
    "statement_line_no" INTEGER,
    "reversed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bank_account_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_rec_line" (
    "id" SERIAL NOT NULL,
    "bank_reconciliation_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Bank Account Ledger Entry',
    "transaction_date" TEXT,
    "document_no" TEXT,
    "description" TEXT,
    "statement_amount" BIGINT NOT NULL DEFAULT 0,
    "applied_amount" BIGINT NOT NULL DEFAULT 0,
    "bank_account_ledger_entry_id" INTEGER,
    "gl_account_id" INTEGER,
    "applied" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bank_rec_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "statement_date" TEXT NOT NULL,
    "statement_balance" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" TEXT,
    "created_at" TEXT,
    "completed_by" TEXT,
    "completed_at" TEXT,
    "statement_no" TEXT,
    "balance_last_statement" BIGINT NOT NULL DEFAULT 0,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_by" TEXT,
    "posted_at" TEXT,
    "journal_id" INTEGER,

    CONSTRAINT "bank_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_denomination_line" (
    "id" SERIAL NOT NULL,
    "document_kind" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "denomination_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cash_denomination_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_management_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "receipt_approval_limit" BIGINT NOT NULL DEFAULT 0,
    "pv_approval_limit" BIGINT NOT NULL DEFAULT 0,
    "bank_charges_account_id" INTEGER,
    "bank_interest_income_account_id" INTEGER,
    "default_receipt_bank_account_id" INTEGER,
    "allow_cm_posting_from" TEXT,
    "allow_cm_posting_to" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,
    "default_vat_bus_posting_group_code" TEXT,

    CONSTRAINT "cash_management_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_log_entry" (
    "id" SERIAL NOT NULL,
    "table_name" TEXT NOT NULL,
    "table_caption" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "type" TEXT NOT NULL,
    "changed_at" TEXT NOT NULL,
    "user_id" INTEGER,
    "username" TEXT NOT NULL,

    CONSTRAINT "change_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_log_setup" (
    "table_name" TEXT NOT NULL,
    "table_caption" TEXT NOT NULL,
    "log_insertion" INTEGER NOT NULL DEFAULT 0,
    "log_modification" INTEGER NOT NULL DEFAULT 0,
    "log_deletion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "change_log_setup_pkey" PRIMARY KEY ("table_name")
);

-- CreateTable
CREATE TABLE "column_layout" (
    "id" SERIAL NOT NULL,
    "column_layout_name_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "column_no" TEXT NOT NULL DEFAULT '',
    "column_header" TEXT NOT NULL DEFAULT '',
    "column_type" TEXT NOT NULL DEFAULT 'NET_CHANGE',
    "ledger_entry_type" TEXT NOT NULL DEFAULT 'ENTRIES',
    "amount_type" TEXT NOT NULL DEFAULT 'NET_AMOUNT',
    "formula" TEXT NOT NULL DEFAULT '',
    "comparison_date_formula" TEXT NOT NULL DEFAULT '',
    "show" TEXT NOT NULL DEFAULT 'ALWAYS',
    "rounding_factor" TEXT NOT NULL DEFAULT 'NONE',
    "created_at" TEXT,
    "created_by" TEXT,
    "budget_name" TEXT,

    CONSTRAINT "column_layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "column_layout_name" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "column_layout_name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "copied_from" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_job" (
    "id" SERIAL NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "reports_to_job_id" INTEGER,
    "job_grade_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "no_of_posts" INTEGER NOT NULL DEFAULT 1,
    "is_management" BOOLEAN NOT NULL DEFAULT false,
    "profession" TEXT,
    "skills_category" TEXT,
    "skills_category_2" TEXT,
    "skills_category_3" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "approved_at" TEXT,
    "approved_by" TEXT,

    CONSTRAINT "company_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_job_qualification" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "qualification_type" TEXT NOT NULL DEFAULT 'ACADEMIC',
    "qualification" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MANDATORY',
    "competency_level" TEXT,

    CONSTRAINT "company_job_qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_job_requirement" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,

    CONSTRAINT "company_job_requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_job_responsibility" (
    "id" SERIAL NOT NULL,
    "job_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,

    CONSTRAINT "company_job_responsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_package" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "key_field" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "config_package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_package_field" (
    "id" SERIAL NOT NULL,
    "package_id" INTEGER NOT NULL,
    "field_name" TEXT NOT NULL,
    "column_no" INTEGER NOT NULL,

    CONSTRAINT "config_package_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "county" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "code" TEXT,

    CONSTRAINT "county_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "symbol" TEXT,
    "iso_numeric_code" TEXT,
    "is_base" INTEGER NOT NULL DEFAULT 0,
    "amount_rounding_precision" BIGINT NOT NULL DEFAULT 1,
    "invoice_rounding_precision" BIGINT NOT NULL DEFAULT 0,
    "realized_gains_account_id" INTEGER,
    "realized_losses_account_id" INTEGER,
    "unrealized_gains_account_id" INTEGER,
    "unrealized_losses_account_id" INTEGER,
    "residual_gains_account_id" INTEGER,
    "residual_losses_account_id" INTEGER,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_exchange_rate" (
    "id" SERIAL NOT NULL,
    "currency_code" TEXT NOT NULL,
    "starting_date" TEXT NOT NULL,
    "exchange_rate_amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "relational_exch_rate_amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "currency_exchange_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cust_ledger_entry" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "remaining_amount" BIGINT NOT NULL DEFAULT 0,
    "original_amount" BIGINT NOT NULL DEFAULT 0,
    "due_date" TEXT,
    "pmt_discount_date" TEXT,
    "original_pmt_disc_possible" BIGINT NOT NULL DEFAULT 0,
    "open" INTEGER NOT NULL DEFAULT 1,
    "positive" INTEGER NOT NULL DEFAULT 1,
    "closed_by_entry_no" INTEGER,
    "closed_at_date" TEXT,
    "reminder_level" INTEGER NOT NULL DEFAULT 0,
    "calculate_interest" INTEGER NOT NULL DEFAULT 0,
    "source_type" TEXT,
    "source_id" INTEGER,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "amount_lcy" BIGINT NOT NULL DEFAULT 0,
    "remaining_amount_lcy" BIGINT NOT NULL DEFAULT 0,
    "original_amount_lcy" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "cust_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_2" TEXT,
    "address" TEXT,
    "address_2" TEXT,
    "city" TEXT,
    "post_code" TEXT,
    "country" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "customer_posting_group_code" TEXT,
    "payment_terms_code" TEXT,
    "payment_method_code" TEXT,
    "reminder_terms_code" TEXT,
    "fin_charge_terms_code" TEXT,
    "salesperson" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "blocked" TEXT NOT NULL DEFAULT '',
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "last_statement_no" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT,
    "kra_pin" TEXT,
    "vat_bus_posting_group_code" TEXT,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "receivables_account_id" INTEGER NOT NULL,
    "service_charge_account_id" INTEGER NOT NULL,
    "additional_fee_account_id" INTEGER NOT NULL,
    "payment_disc_debit_account_id" INTEGER NOT NULL,
    "payment_disc_credit_account_id" INTEGER NOT NULL,
    "invoice_rounding_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "customer_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denomination" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "denomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_book" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "g_l_integration" INTEGER NOT NULL DEFAULT 1,
    "default_final_rounding_amount" BIGINT NOT NULL DEFAULT 0,
    "use_rounding_in_periodic_depr" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "depreciation_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detailed_cust_ledger_entry" (
    "id" SERIAL NOT NULL,
    "cust_ledger_entry_id" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_type" TEXT,
    "document_no" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applied_cust_ledger_entry_id" INTEGER,
    "journal_id" INTEGER,
    "unapplied" INTEGER NOT NULL DEFAULT 0,
    "unapplied_by_entry_id" INTEGER,
    "created_at" TEXT,
    "amount_lcy" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "detailed_cust_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detailed_vendor_ledger_entry" (
    "id" SERIAL NOT NULL,
    "vendor_ledger_entry_id" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_type" TEXT,
    "document_no" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applied_vendor_ledger_entry_id" INTEGER,
    "journal_id" INTEGER,
    "unapplied" INTEGER NOT NULL DEFAULT 0,
    "unapplied_by_entry_id" INTEGER,
    "created_at" TEXT,
    "amount_lcy" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "detailed_vendor_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" SERIAL NOT NULL,
    "employee_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "gender" TEXT,
    "date_of_birth" TEXT,
    "national_id" TEXT,
    "kra_pin" TEXT,
    "nssf_no" TEXT,
    "shif_no" TEXT,
    "marital_status" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,
    "physical_address" TEXT,
    "county_id" INTEGER,
    "sub_county_id" INTEGER,
    "job_title" TEXT,
    "job_grade_id" INTEGER,
    "contract_type_id" INTEGER,
    "nature_of_employment" TEXT NOT NULL DEFAULT 'PERMANENT',
    "employee_type" TEXT NOT NULL DEFAULT 'STAFF',
    "employment_date" TEXT NOT NULL,
    "probation_period_months" INTEGER NOT NULL DEFAULT 3,
    "probation_end_date" TEXT,
    "probation_status" TEXT NOT NULL DEFAULT 'ON_PROBATION',
    "confirmed_date" TEXT,
    "manager_id" INTEGER,
    "overview_manager_id" INTEGER,
    "bank_code" TEXT,
    "bank_branch" TEXT,
    "bank_account_no" TEXT,
    "posting_group_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "photo_url" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "disability_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "termination_reason_id" INTEGER,
    "termination_date" TEXT,
    "notes" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "decision_reason" TEXT,
    "photo_image" TEXT,
    "signature_image" TEXT,
    "payment_mode" TEXT NOT NULL DEFAULT 'Bank Transfer',
    "payroll_currency_code" TEXT,
    "pays_nssf" BOOLEAN NOT NULL DEFAULT true,
    "pays_shif" BOOLEAN NOT NULL DEFAULT true,
    "pays_paye" BOOLEAN NOT NULL DEFAULT true,
    "payslip_message" TEXT,
    "suspend_pay" BOOLEAN NOT NULL DEFAULT false,
    "suspension_date" TEXT,
    "suspension_reasons" TEXT,
    "stop_relief" BOOLEAN NOT NULL DEFAULT false,
    "insurance_certificate" BOOLEAN NOT NULL DEFAULT false,
    "basic_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "salary_scale_id" INTEGER,
    "company_job_id" INTEGER,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_account" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "bank_code" TEXT,
    "branch" TEXT,
    "account_no" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 100,

    CONSTRAINT "employee_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_beneficiary" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_no" TEXT,
    "date_of_birth" TEXT,
    "relationship" TEXT,
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contract" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "contract_type_id" INTEGER,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT,
    "job_title" TEXT,
    "grade_id" INTEGER,
    "salary_cents" BIGINT NOT NULL DEFAULT 0,
    "notice_period_days" INTEGER,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "employee_contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_contract_change" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "nature" TEXT NOT NULL,
    "contract_type_id" INTEGER,
    "proposed_start_date" TEXT,
    "proposed_end_date" TEXT,
    "proposed_salary_cents" BIGINT,
    "proposed_grade_id" INTEGER,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "employee_contract_change_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "employee_dependant" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_or_birth_cert_no" TEXT,
    "date_of_birth" TEXT,
    "relationship" TEXT,
    "gender" TEXT,
    "is_student" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "employee_dependant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_bank_account" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "bank_code" TEXT,
    "branch" TEXT,
    "account_no" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 100,

    CONSTRAINT "employee_edit_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_beneficiary" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_no" TEXT,
    "date_of_birth" TEXT,
    "relationship" TEXT,
    "gender" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_edit_beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_dependant" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "id_or_birth_cert_no" TEXT,
    "date_of_birth" TEXT,
    "relationship" TEXT,
    "gender" TEXT,
    "is_student" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_edit_dependant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_emergency_contact" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,

    CONSTRAINT "employee_edit_emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_next_of_kin" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT,
    "id_no" TEXT,
    "phone" TEXT,
    "email" TEXT,

    CONSTRAINT "employee_edit_next_of_kin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_professional_body" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "body_name" TEXT NOT NULL,
    "membership_no" TEXT,
    "from_date" TEXT,
    "to_date" TEXT,

    CONSTRAINT "employee_edit_professional_body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_edit_request" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "first_name" TEXT,
    "middle_name" TEXT,
    "last_name" TEXT,
    "gender" TEXT,
    "date_of_birth" TEXT,
    "national_id" TEXT,
    "kra_pin" TEXT,
    "nssf_no" TEXT,
    "shif_no" TEXT,
    "marital_status" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,
    "physical_address" TEXT,
    "county_id" INTEGER,
    "sub_county_id" INTEGER,
    "job_title" TEXT,
    "job_grade_id" INTEGER,
    "bank_code" TEXT,
    "bank_branch" TEXT,
    "bank_account_no" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "photo_image" TEXT,
    "signature_image" TEXT,
    "posting_group_id" INTEGER,
    "payment_mode" TEXT NOT NULL DEFAULT 'Bank Transfer',
    "payroll_currency_code" TEXT,
    "pays_nssf" BOOLEAN NOT NULL DEFAULT true,
    "pays_shif" BOOLEAN NOT NULL DEFAULT true,
    "pays_paye" BOOLEAN NOT NULL DEFAULT true,
    "payslip_message" TEXT,
    "suspend_pay" BOOLEAN NOT NULL DEFAULT false,
    "suspension_date" TEXT,
    "suspension_reasons" TEXT,
    "stop_relief" BOOLEAN NOT NULL DEFAULT false,
    "insurance_certificate" BOOLEAN NOT NULL DEFAULT false,
    "basic_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "salary_scale_id" INTEGER,
    "company_job_id" INTEGER,

    CONSTRAINT "employee_edit_request_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "employee_edit_work_history" (
    "id" SERIAL NOT NULL,
    "edit_no" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "position_held" TEXT,
    "from_date" TEXT,
    "to_date" TEXT,
    "reason_for_leaving" TEXT,

    CONSTRAINT "employee_edit_work_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_emergency_contact" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,

    CONSTRAINT "employee_emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exit" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "termination_reason_id" INTEGER,
    "date_of_notice" TEXT,
    "date_of_exit" TEXT,
    "notice_period_days" INTEGER,
    "notice_fully_served" BOOLEAN,
    "reasons_for_not_serving_notice" TEXT,
    "can_be_reemployed" BOOLEAN,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "employee_exit_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "employee_exit_clearance_line" (
    "id" SERIAL NOT NULL,
    "exit_no" TEXT NOT NULL,
    "section_id" INTEGER NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "cleared_by" TEXT,
    "cleared_at" TEXT,
    "remarks" TEXT,

    CONSTRAINT "employee_exit_clearance_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exit_final_due_line" (
    "id" SERIAL NOT NULL,
    "exit_no" TEXT NOT NULL,
    "due_type" TEXT NOT NULL,
    "description" TEXT,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "employee_exit_final_due_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_ledger_entry" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "employee_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_next_of_kin" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "relationship" TEXT,
    "id_no" TEXT,
    "phone" TEXT,
    "email" TEXT,

    CONSTRAINT "employee_next_of_kin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_transaction" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "transaction_code_id" INTEGER NOT NULL,
    "payroll_period_id" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,
    "original_amount_cents" BIGINT,
    "balance_cents" BIGINT,
    "no_of_periods" INTEGER,
    "executed_periods" INTEGER NOT NULL DEFAULT 0,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    "temporary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "start_date" TEXT,
    "end_date" TEXT,
    "salary_scale_id" INTEGER,

    CONSTRAINT "employee_payroll_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_professional_body" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "body_name" TEXT NOT NULL,
    "membership_no" TEXT,
    "from_date" TEXT,
    "to_date" TEXT,

    CONSTRAINT "employee_professional_body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_work_history" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "institution" TEXT NOT NULL,
    "position_held" TEXT,
    "from_date" TEXT,
    "to_date" TEXT,
    "reason_for_leaving" TEXT,

    CONSTRAINT "employee_work_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_bank" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "external_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_bank_branch" (
    "id" SERIAL NOT NULL,
    "bank_code" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,

    CONSTRAINT "external_bank_branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_class" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "fa_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_depreciation_book" (
    "id" SERIAL NOT NULL,
    "fixed_asset_id" INTEGER NOT NULL,
    "depreciation_book_code" TEXT NOT NULL,
    "fa_posting_group_code" TEXT NOT NULL,
    "depreciation_method" TEXT NOT NULL DEFAULT 'Straight-Line',
    "depreciation_starting_date" TEXT,
    "depreciation_ending_date" TEXT,
    "no_of_depreciation_years" DOUBLE PRECISION,
    "straight_line_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "declining_balance_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixed_depr_amount" BIGINT NOT NULL DEFAULT 0,
    "salvage_value" BIGINT NOT NULL DEFAULT 0,
    "last_depreciation_date" TEXT,
    "disposal_calculation_method" TEXT NOT NULL DEFAULT 'Net',
    "acquisition_cost" BIGINT NOT NULL DEFAULT 0,
    "accumulated_depreciation" BIGINT NOT NULL DEFAULT 0,
    "write_down_amount" BIGINT NOT NULL DEFAULT 0,
    "appreciation_amount" BIGINT NOT NULL DEFAULT 0,
    "book_value" BIGINT NOT NULL DEFAULT 0,
    "proceeds_on_disposal" BIGINT NOT NULL DEFAULT 0,
    "gain_loss_on_disposal" BIGINT NOT NULL DEFAULT 0,
    "maintenance_total" BIGINT NOT NULL DEFAULT 0,
    "disposed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fa_depreciation_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_journal_line" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_no" TEXT,
    "fixed_asset_id" INTEGER NOT NULL,
    "depreciation_book_code" TEXT NOT NULL,
    "fa_posting_type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "balancing_gl_account_id" INTEGER,
    "maintenance_code" TEXT,
    "depr_until_fa_posting_date" INTEGER NOT NULL DEFAULT 0,
    "no_of_depreciation_days" INTEGER,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "posted_at" TEXT,
    "posted_by" TEXT,

    CONSTRAINT "fa_journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_ledger_entry" (
    "id" SERIAL NOT NULL,
    "fixed_asset_id" INTEGER NOT NULL,
    "depreciation_book_code" TEXT NOT NULL,
    "fa_posting_date" TEXT NOT NULL,
    "fa_posting_type" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "no_of_depreciation_days" INTEGER,
    "journal_id" INTEGER,
    "fa_journal_line_id" INTEGER,
    "part_of_book_value" INTEGER NOT NULL DEFAULT 1,
    "maintenance_code" TEXT,
    "reversed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,

    CONSTRAINT "fa_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_location" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "fa_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "acquisition_cost_account_id" INTEGER NOT NULL,
    "accum_depreciation_account_id" INTEGER NOT NULL,
    "depreciation_expense_account_id" INTEGER NOT NULL,
    "write_down_expense_account_id" INTEGER NOT NULL,
    "appreciation_account_id" INTEGER NOT NULL,
    "maintenance_expense_account_id" INTEGER NOT NULL,
    "gains_acc_on_disposal_id" INTEGER NOT NULL,
    "losses_acc_on_disposal_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "fa_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_depreciation_book_code" TEXT,
    "default_fa_posting_group_code" TEXT,
    "allow_fa_posting_from" TEXT,
    "allow_fa_posting_to" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "fa_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fa_subclass" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "fa_class_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "fa_subclass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_charge_terms" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "interest_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_amount" BIGINT NOT NULL DEFAULT 0,
    "additional_fee" BIGINT NOT NULL DEFAULT 0,
    "grace_period" TEXT NOT NULL DEFAULT '',
    "due_date_calculation" TEXT NOT NULL DEFAULT '',
    "interest_period_days" INTEGER NOT NULL DEFAULT 360,
    "interest_calculation_method" TEXT NOT NULL DEFAULT 'Balance Due',
    "post_interest" INTEGER NOT NULL DEFAULT 1,
    "post_additional_fee" INTEGER NOT NULL DEFAULT 1,
    "line_description" TEXT NOT NULL DEFAULT 'Finance Charge',
    "begin_text" TEXT,
    "end_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "finance_charge_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_report" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "row_group" TEXT NOT NULL DEFAULT '',
    "column_group" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "financial_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "description_2" TEXT,
    "fa_class_code" TEXT,
    "fa_subclass_code" TEXT,
    "fa_location_code" TEXT,
    "responsible_employee" TEXT,
    "serial_no" TEXT,
    "vendor_name" TEXT,
    "asset_tag" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "inactive" INTEGER NOT NULL DEFAULT 0,
    "acquisition_date" TEXT,
    "disposal_date" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "fixed_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_office_transfer" (
    "no" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "source_bank_account_id" INTEGER NOT NULL,
    "destination_bank_account_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "journal_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "posted_at" TEXT,
    "posted_by" TEXT,

    CONSTRAINT "cash_office_transfer_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "gl_account" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parent_code" TEXT,
    "is_postable" INTEGER NOT NULL DEFAULT 1,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "account_type" TEXT NOT NULL DEFAULT 'POSTING',
    "totaling" TEXT,
    "no_direct_posting" INTEGER NOT NULL DEFAULT 0,
    "vat_bus_posting_group_code" TEXT,
    "vat_prod_posting_group_code" TEXT,
    "indentation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gl_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_budget_entry" (
    "id" SERIAL NOT NULL,
    "budget_name" TEXT NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "gl_budget_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_budget_name" (
    "name" TEXT NOT NULL,
    "description" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "gl_budget_name_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "global_dimension_1_value" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "global_dimension_1_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_dimension_2_value" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "global_dimension_2_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_clearance_section" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_email" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_clearance_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employment_contract_type" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_notice_period_days" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_employment_contract_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_holiday" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hr_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_job_grade" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notice_period_days" INTEGER NOT NULL DEFAULT 30,
    "probation_notice_period_days" INTEGER NOT NULL DEFAULT 7,
    "leave_allowance_amount" BIGINT NOT NULL DEFAULT 0,
    "training_allowance_amount" BIGINT NOT NULL DEFAULT 0,
    "overtime_allowance_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_job_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_adjustment" (
    "no" TEXT NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POSITIVE',
    "description" TEXT,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_adjustment_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "hr_leave_adjustment_line" (
    "id" SERIAL NOT NULL,
    "adjustment_no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "hr_leave_adjustment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_application" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "nature" TEXT NOT NULL DEFAULT 'APPLICATION',
    "leave_calendar_id" INTEGER NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "days_applied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weekend_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holiday_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliever_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "leave_allowance_payable" BOOLEAN NOT NULL DEFAULT false,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posting_date" TEXT,
    "days_dropped" DOUBLE PRECISION,
    "days_to_reimburse" DOUBLE PRECISION,
    "justification" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_application_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "hr_leave_calendar" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TEXT,
    "closed_by" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_days_to_accrue" (
    "id" SERIAL NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "job_grade_id" INTEGER NOT NULL,
    "days_to_accrue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leave_day_worth_cents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "hr_leave_days_to_accrue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_ledger_entry" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "leave_calendar_id" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "entry_type" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_no" TEXT,
    "source_type" TEXT,
    "source_id" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_plan" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "leave_calendar_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_plan_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "hr_leave_plan_line" (
    "id" SERIAL NOT NULL,
    "plan_no" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "hr_leave_plan_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_leave_recall" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "application_no" TEXT NOT NULL,
    "days_to_recall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_recall_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "hr_leave_type" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standard_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrues" BOOLEAN NOT NULL DEFAULT false,
    "days_to_accrue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unlimited_days" BOOLEAN NOT NULL DEFAULT false,
    "gender" TEXT NOT NULL DEFAULT 'ANY',
    "balance_treatment" TEXT NOT NULL DEFAULT 'IGNORE',
    "max_carry_forward_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inclusive_of_saturday" BOOLEAN NOT NULL DEFAULT false,
    "inclusive_of_sunday" BOOLEAN NOT NULL DEFAULT false,
    "inclusive_of_holidays" BOOLEAN NOT NULL DEFAULT false,
    "fixed_days" BOOLEAN NOT NULL DEFAULT false,
    "is_annual" BOOLEAN NOT NULL DEFAULT false,
    "max_applicable_days" DOUBLE PRECISION,
    "check_balance" BOOLEAN NOT NULL DEFAULT true,
    "is_sick_leave" BOOLEAN NOT NULL DEFAULT false,
    "requires_admin_approval" BOOLEAN NOT NULL DEFAULT false,
    "leave_balance_notification_threshold" DOUBLE PRECISION,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_payroll_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "personal_relief_cents" BIGINT NOT NULL DEFAULT 240000,
    "insurance_relief_pct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "max_relief_cents" BIGINT NOT NULL DEFAULT 6000000,
    "mortgage_relief_cents" BIGINT NOT NULL DEFAULT 3000000,
    "shif_pct" DOUBLE PRECISION NOT NULL DEFAULT 2.75,
    "shif_based_on" TEXT NOT NULL DEFAULT 'GROSS',
    "nssf_employer_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "housing_levy_enabled" BOOLEAN NOT NULL DEFAULT true,
    "housing_levy_pct" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "housing_levy_based_on" TEXT NOT NULL DEFAULT 'GROSS',
    "minimum_relief_threshold_cents" BIGINT NOT NULL DEFAULT 0,
    "secondary_tax_pct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "monthly_working_days" INTEGER NOT NULL DEFAULT 22,
    "updated_at" TEXT,
    "updated_by" TEXT,
    "pension_deduction_cap_cents" BIGINT NOT NULL DEFAULT 3000000,
    "prmf_cap_cents" BIGINT NOT NULL DEFAULT 1500000,
    "shif_deductible" BOOLEAN NOT NULL DEFAULT true,
    "housing_levy_deductible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hr_payroll_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_salary_scale" (
    "id" SERIAL NOT NULL,
    "job_grade_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "basic_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_salary_scale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_salary_scale_benefit" (
    "id" SERIAL NOT NULL,
    "salary_scale_id" INTEGER NOT NULL,
    "transaction_code_id" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "hr_salary_scale_benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_termination_reason" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pay_gratuity" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "hr_termination_reason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imprest_purpose" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "imprest_purpose_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "imprest_request" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "request_date" TEXT NOT NULL,
    "purpose_code" TEXT,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "request_for" TEXT NOT NULL DEFAULT 'Self',
    "departure_location" TEXT,
    "departure_date" TEXT,
    "return_date" TEXT,
    "total_days" INTEGER NOT NULL DEFAULT 0,
    "justification" TEXT,
    "phone_no" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "paying_bank_account_id" INTEGER,
    "pay_mode_code" TEXT,
    "payment_tx_no" TEXT,
    "cheque_date" TEXT,
    "due_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "posted_journal_id" INTEGER,
    "pv_no" TEXT,
    "surrender_status" TEXT NOT NULL DEFAULT 'Open',
    "surrender_date" TEXT,
    "surrender_decision_reason" TEXT,
    "surrendered" BOOLEAN NOT NULL DEFAULT false,
    "surrender_posted_at" TEXT,
    "surrender_posted_by" TEXT,
    "surrender_journal_id" INTEGER,
    "settlement" TEXT,
    "receiving_bank_account_id" INTEGER,
    "receipt_mode_code" TEXT,
    "receipt_tx_no" TEXT,
    "claim_paying_bank_account_id" INTEGER,
    "claim_pay_mode_code" TEXT,
    "claim_payment_tx_no" TEXT,
    "transfer_to_payroll" BOOLEAN NOT NULL DEFAULT false,
    "transferred_to_payroll" BOOLEAN NOT NULL DEFAULT false,
    "payroll_transaction_id" INTEGER,
    "payroll_transferred_at" TEXT,
    "payroll_transferred_by" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "imprest_request_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "imprest_request_line" (
    "id" SERIAL NOT NULL,
    "request_no" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "narration" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,
    "request_amount" BIGINT NOT NULL DEFAULT 0,
    "actual_spent" BIGINT NOT NULL DEFAULT 0,
    "surrender_note" TEXT,

    CONSTRAINT "imprest_request_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inventory_gl_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "inventory_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "description_2" TEXT,
    "base_unit_of_measure_id" INTEGER NOT NULL,
    "purch_unit_of_measure_id" INTEGER,
    "sales_unit_of_measure_id" INTEGER,
    "inventory_posting_group_id" INTEGER NOT NULL,
    "product_posting_group_id" INTEGER NOT NULL,
    "costing_method" TEXT NOT NULL DEFAULT 'FIFO',
    "unit_cost" BIGINT NOT NULL DEFAULT 0,
    "unit_price" BIGINT NOT NULL DEFAULT 0,
    "inventory" INTEGER NOT NULL DEFAULT 0,
    "reordering_policy" TEXT NOT NULL DEFAULT 'Fixed Reorder Qty.',
    "reorder_point" INTEGER NOT NULL DEFAULT 0,
    "reorder_quantity" INTEGER NOT NULL DEFAULT 0,
    "maximum_inventory" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_application_entry" (
    "id" SERIAL NOT NULL,
    "outbound_entry_id" INTEGER NOT NULL,
    "inbound_entry_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "created_at" TEXT,

    CONSTRAINT "item_application_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_journal_line" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "posting_date" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "new_location_id" INTEGER,
    "description" TEXT,
    "unit_of_measure_id" INTEGER NOT NULL,
    "qty_per_unit_of_measure" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "base_quantity" INTEGER NOT NULL DEFAULT 0,
    "applies_to_entry_id" INTEGER,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "journal_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "requisition_line_id" INTEGER,

    CONSTRAINT "item_journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_ledger_entry" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remaining_quantity" INTEGER NOT NULL DEFAULT 0,
    "open" BOOLEAN NOT NULL DEFAULT false,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "item_journal_line_id" INTEGER,
    "created_at" TEXT,

    CONSTRAINT "item_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_unit_of_measure" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "unit_of_measure_id" INTEGER NOT NULL,
    "qty_per_unit_of_measure" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "item_unit_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue_entry" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "run_every_minutes" INTEGER NOT NULL DEFAULT 60,
    "earliest_start_date" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ON HOLD',
    "next_run_at" TEXT,
    "last_run_at" TEXT,
    "last_run_status" TEXT,
    "last_run_message" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,
    "locked_by" TEXT,
    "locked_until" TEXT,

    CONSTRAINT "job_queue_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" SERIAL NOT NULL,
    "journal_no" TEXT NOT NULL,
    "value_date" TEXT NOT NULL,
    "posted_at" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "amount" BIGINT NOT NULL,
    "posted_by" TEXT,
    "reverses_id" INTEGER,
    "reversed_by_id" INTEGER,
    "idempotency_key" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "closing_entry" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" SERIAL NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "narration" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "debit_lcy" BIGINT NOT NULL DEFAULT 0,
    "credit_lcy" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_outbox" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "sender" TEXT,
    "reference_type" TEXT,
    "reference_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TEXT,
    "last_error" TEXT,
    "provider_ref" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT,
    "sent_at" TEXT,

    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_series" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "default_nos" INTEGER NOT NULL DEFAULT 1,
    "manual_nos" INTEGER NOT NULL DEFAULT 0,
    "date_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "no_series_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "no_series_line" (
    "id" SERIAL NOT NULL,
    "series_code" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL DEFAULT 10000,
    "starting_date" TEXT,
    "starting_no" TEXT NOT NULL,
    "ending_no" TEXT,
    "last_no_used" TEXT,
    "last_date_used" TEXT,
    "warning_no" TEXT,
    "increment_by_no" INTEGER NOT NULL DEFAULT 1,
    "open" INTEGER NOT NULL DEFAULT 1,
    "allow_gaps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "no_series_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_series_setup" (
    "document_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "series_code" TEXT,

    CONSTRAINT "no_series_setup_pkey" PRIMARY KEY ("document_code")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "is_read" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "motto" TEXT,
    "registration_no" TEXT,
    "vat_registration_no" TEXT,
    "incorporation_date" TEXT,
    "ict_authority_licence_no" TEXT,
    "odpc_registration_no" TEXT,
    "kra_pin" TEXT,
    "company_type" TEXT DEFAULT 'Private Limited Company',
    "physical_address" TEXT,
    "postal_address" TEXT,
    "city" TEXT,
    "county" TEXT,
    "country" TEXT DEFAULT 'Kenya',
    "phone_primary" TEXT,
    "phone_secondary" TEXT,
    "email" TEXT,
    "website" TEXT,
    "paybill_no" TEXT,
    "bank_name" TEXT,
    "bank_account_no" TEXT,
    "logo" TEXT,
    "currency_code" TEXT DEFAULT 'KES',
    "currency_symbol" TEXT DEFAULT 'KSh',
    "locale" TEXT DEFAULT 'en-KE',
    "timezone" TEXT DEFAULT 'Africa/Nairobi',
    "date_format" TEXT DEFAULT 'dd MMM yyyy',
    "fy_start_month" INTEGER DEFAULT 1,
    "fy_start_day" INTEGER DEFAULT 1,
    "statement_footer" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,
    "global_dimension_1_caption" TEXT DEFAULT 'Global Dimension 1 Code',
    "global_dimension_2_caption" TEXT DEFAULT 'Global Dimension 2 Code',
    "allow_posting_from" TEXT,
    "allow_posting_to" TEXT,
    "validate_cash_denomination" BOOLEAN NOT NULL DEFAULT false,
    "bank_account_name" TEXT,
    "bank_branch" TEXT,
    "receipt_approval_limit" BIGINT NOT NULL DEFAULT 0,
    "petty_cash_limit" BIGINT NOT NULL DEFAULT 0,
    "max_outstanding_imprests" INTEGER NOT NULL DEFAULT 1,
    "imprest_control_account_id" INTEGER,
    "imprest_surrender_period" TEXT NOT NULL DEFAULT '14D',
    "ceo_signature" TEXT,
    "ceo_name" TEXT,
    "background_image" TEXT,
    "background_overlay" INTEGER NOT NULL DEFAULT 45,
    "background_in_app" INTEGER NOT NULL DEFAULT 0,
    "till_shortage_account_id" INTEGER,
    "till_overage_account_id" INTEGER,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bal_account_type" TEXT NOT NULL DEFAULT 'None',
    "bal_account_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date_calculation" TEXT NOT NULL DEFAULT '',
    "discount_date_calculation" TEXT NOT NULL DEFAULT '',
    "discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calc_pmt_disc_on_credit_memos" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_voucher_header" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "pv_type" TEXT,
    "pay_mode_code" TEXT,
    "cheque_no" TEXT,
    "cheque_date" TEXT,
    "cheque_received_by" TEXT,
    "paying_bank_account_id" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "description" TEXT,
    "payee_name" TEXT,
    "payee_external_bank_code" TEXT,
    "payee_bank_branch_code" TEXT,
    "payee_account_no" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "approval_limit" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "decision_reason" TEXT,
    "prepared_by" TEXT,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "employee_id" INTEGER,

    CONSTRAINT "payment_voucher_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_voucher_line" (
    "id" SERIAL NOT NULL,
    "payment_voucher_header_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL DEFAULT 'G/L Account',
    "account_no" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applies_to_doc_no" TEXT,
    "vat_prod_posting_group_code" TEXT,
    "wht_code_one" TEXT,
    "wht_code_two" TEXT,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "wht_amount_one" BIGINT NOT NULL DEFAULT 0,
    "wht_amount_two" BIGINT NOT NULL DEFAULT 0,
    "wht_base" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL DEFAULT 0,
    "purchase_invoice_amount" BIGINT NOT NULL DEFAULT 0,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,

    CONSTRAINT "payment_voucher_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_nssf_tier" (
    "id" SERIAL NOT NULL,
    "tier_no" INTEGER NOT NULL,
    "lower_limit_cents" BIGINT NOT NULL,
    "upper_limit_cents" BIGINT NOT NULL,
    "employee_rate_pct" DOUBLE PRECISION NOT NULL,
    "employer_rate_pct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "payroll_nssf_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_p9_line" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "payroll_period_id" INTEGER NOT NULL,
    "basic_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "gross_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "taxable_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "tax_charged_cents" BIGINT NOT NULL DEFAULT 0,
    "insurance_relief_cents" BIGINT NOT NULL DEFAULT 0,
    "personal_relief_cents" BIGINT NOT NULL DEFAULT 0,
    "paye_cents" BIGINT NOT NULL DEFAULT 0,
    "nssf_cents" BIGINT NOT NULL DEFAULT 0,
    "shif_cents" BIGINT NOT NULL DEFAULT 0,
    "housing_levy_cents" BIGINT NOT NULL DEFAULT 0,
    "deductions_cents" BIGINT NOT NULL DEFAULT 0,
    "net_pay_cents" BIGINT NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "benefits_cents" BIGINT NOT NULL DEFAULT 0,
    "quarters_cents" BIGINT NOT NULL DEFAULT 0,
    "pension_cents" BIGINT NOT NULL DEFAULT 0,
    "defined_contribution_cents" BIGINT NOT NULL DEFAULT 0,
    "owner_occupier_interest_cents" BIGINT NOT NULL DEFAULT 0,
    "prmf_cents" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_p9_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_paye_band" (
    "id" SERIAL NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "upper_bound_cents" BIGINT,
    "rate_pct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "payroll_paye_band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_period" (
    "id" SERIAL NOT NULL,
    "period_name" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decision_reason" TEXT,
    "closed_at" TEXT,
    "closed_by" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "payroll_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_period_transaction" (
    "id" SERIAL NOT NULL,
    "payroll_period_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "transaction_code" TEXT NOT NULL,
    "transaction_code_id" INTEGER,
    "transaction_name" TEXT NOT NULL,
    "transaction_type" TEXT NOT NULL DEFAULT 'INCOME',
    "group_text" TEXT NOT NULL,
    "group_order" INTEGER NOT NULL DEFAULT 0,
    "sub_group_order" INTEGER NOT NULL DEFAULT 0,
    "payslip_order" INTEGER NOT NULL DEFAULT 0,
    "amount_cents" BIGINT NOT NULL DEFAULT 0,
    "balance_cents" BIGINT,
    "original_amount_cents" BIGINT,
    "no_of_units" DOUBLE PRECISION,
    "gl_account_id" INTEGER,
    "post_as" TEXT,
    "post_to_journal" BOOLEAN NOT NULL DEFAULT false,
    "journal_account_type" TEXT NOT NULL DEFAULT 'GL',
    "company_deduction" BOOLEAN NOT NULL DEFAULT false,
    "imprest_no" TEXT,
    "posting_group_id" INTEGER,
    "payment_mode" TEXT,
    "salary_scale_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "staff_name" TEXT,
    "bank_code" TEXT,
    "bank_branch" TEXT,
    "bank_account_no" TEXT,
    "created_at" TEXT,

    CONSTRAINT "payroll_period_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "salary_expense_account_id" INTEGER NOT NULL,
    "paye_payable_account_id" INTEGER NOT NULL,
    "net_pay_payable_account_id" INTEGER NOT NULL,
    "nssf_employee_payable_account_id" INTEGER NOT NULL,
    "nssf_employer_expense_account_id" INTEGER NOT NULL,
    "nssf_employer_payable_account_id" INTEGER NOT NULL,
    "shif_payable_account_id" INTEGER NOT NULL,
    "housing_levy_employee_payable_account_id" INTEGER NOT NULL,
    "housing_levy_employer_expense_account_id" INTEGER NOT NULL,
    "housing_levy_employer_payable_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "payroll_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_transaction_code" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INCOME',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_formula" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "fixed_amount_cents" BIGINT NOT NULL DEFAULT 0,
    "upper_limit_cents" BIGINT,
    "balance_type" TEXT NOT NULL DEFAULT 'NONE',
    "special_type" TEXT NOT NULL DEFAULT 'NONE',
    "gl_account_id" INTEGER,
    "employer_gl_account_id" INTEGER,
    "for_every_employee" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,
    "amount_preference" TEXT NOT NULL DEFAULT 'FORMULA',
    "employer_factor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employer_formula" TEXT,

    CONSTRAINT "payroll_transaction_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_set_line" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_name" TEXT NOT NULL,
    "read_perm" INTEGER NOT NULL DEFAULT 0,
    "insert_perm" INTEGER NOT NULL DEFAULT 0,
    "modify_perm" INTEGER NOT NULL DEFAULT 0,
    "delete_perm" INTEGER NOT NULL DEFAULT 0,
    "execute_perm" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "permission_set_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "request_date" TEXT NOT NULL,
    "posting_date" TEXT,
    "paying_bank_account_id" INTEGER,
    "payment_to" TEXT,
    "on_behalf_of" TEXT,
    "payment_narration" TEXT NOT NULL,
    "pay_mode_code" TEXT,
    "payment_tx_no" TEXT,
    "cheque_date" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "journal_id" INTEGER,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TEXT,
    "paid_by" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "petty_cash_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "petty_cash_line" (
    "id" SERIAL NOT NULL,
    "petty_cash_no" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "petty_cash_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_payment_voucher" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "pv_no" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "pay_mode_code" TEXT,
    "cheque_no" TEXT,
    "cheque_date" TEXT,
    "cheque_received_by" TEXT,
    "paying_bank_account_id" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "description" TEXT,
    "payee_name" TEXT,
    "payee_external_bank_code" TEXT,
    "payee_bank_branch_code" TEXT,
    "payee_account_no" TEXT,
    "posting_date" TEXT NOT NULL,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "journal_id" INTEGER,
    "prepared_by" TEXT,
    "approved_by" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "pv_type" TEXT,
    "employee_id" INTEGER,

    CONSTRAINT "posted_payment_voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_payment_voucher_line" (
    "id" SERIAL NOT NULL,
    "posted_payment_voucher_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL,
    "account_no" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applies_to_doc_no" TEXT,
    "vat_prod_posting_group_code" TEXT,
    "wht_code_one" TEXT,
    "wht_code_two" TEXT,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "wht_amount_one" BIGINT NOT NULL DEFAULT 0,
    "wht_amount_two" BIGINT NOT NULL DEFAULT 0,
    "wht_base" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "posted_payment_voucher_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_purchase_document" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "buy_from_name" TEXT,
    "buy_from_address" TEXT,
    "buy_from_city" TEXT,
    "buy_from_contact" TEXT,
    "posting_date" TEXT NOT NULL,
    "document_date" TEXT NOT NULL,
    "due_date" TEXT,
    "order_no" TEXT,
    "vendor_invoice_no" TEXT,
    "payment_terms_code" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vendor_ledger_entry_id" INTEGER,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vat_bus_posting_group_code" TEXT,
    "amount_incl_vat" BIGINT NOT NULL DEFAULT 0,
    "source_no" TEXT,
    "applies_to_doc_no" TEXT,

    CONSTRAINT "posted_purchase_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_purchase_line" (
    "id" SERIAL NOT NULL,
    "posted_purchase_document_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "no" TEXT,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_of_measure_code" TEXT,
    "qty_per_unit_of_measure" INTEGER NOT NULL DEFAULT 1,
    "direct_unit_cost" BIGINT NOT NULL DEFAULT 0,
    "line_discount_amount" BIGINT NOT NULL DEFAULT 0,
    "line_amount" BIGINT NOT NULL DEFAULT 0,
    "item_ledger_entry_id" INTEGER,
    "fa_ledger_entry_id" INTEGER,
    "vat_prod_posting_group_code" TEXT,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_base_amount" BIGINT NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "amount_incl_vat" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "posted_purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_receipt" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "receipt_type" TEXT NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "bank_account_name" TEXT,
    "pay_mode_code" TEXT,
    "external_document_no" TEXT,
    "manual_receipt_no" TEXT,
    "description" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "posting_date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "employee_id" INTEGER,

    CONSTRAINT "posted_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_receipt_line" (
    "id" SERIAL NOT NULL,
    "posted_receipt_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL,
    "account_no" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applies_to_doc_no" TEXT,

    CONSTRAINT "posted_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_sales_document" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sell_to_name" TEXT,
    "sell_to_address" TEXT,
    "sell_to_city" TEXT,
    "sell_to_contact" TEXT,
    "posting_date" TEXT NOT NULL,
    "document_date" TEXT NOT NULL,
    "due_date" TEXT,
    "order_no" TEXT,
    "payment_terms_code" TEXT,
    "your_reference" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "cust_ledger_entry_id" INTEGER,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "applies_to_doc_no" TEXT,
    "source_no" TEXT,

    CONSTRAINT "posted_sales_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posted_sales_line" (
    "id" SERIAL NOT NULL,
    "posted_sales_document_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "no" TEXT,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" BIGINT NOT NULL DEFAULT 0,
    "line_discount_amount" BIGINT NOT NULL DEFAULT 0,
    "line_amount" BIGINT NOT NULL DEFAULT 0,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "cogs_amount" BIGINT NOT NULL DEFAULT 0,
    "item_ledger_entry_id" INTEGER,
    "fa_ledger_entry_id" INTEGER,

    CONSTRAINT "posted_sales_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "adjustment_gl_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,
    "sales_gl_account_id" INTEGER,
    "cogs_gl_account_id" INTEGER,

    CONSTRAINT "product_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "role_centre" TEXT NOT NULL DEFAULT 'SUPER',
    "icon" TEXT NOT NULL DEFAULT '',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "is_default" INTEGER NOT NULL DEFAULT 0,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_header" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "buy_from_name" TEXT,
    "buy_from_address" TEXT,
    "buy_from_city" TEXT,
    "buy_from_contact" TEXT,
    "posting_date" TEXT NOT NULL,
    "document_date" TEXT NOT NULL,
    "due_date" TEXT,
    "payment_terms_code" TEXT,
    "payment_method_code" TEXT,
    "vendor_posting_group_code" TEXT,
    "vendor_invoice_no" TEXT,
    "purchaser" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "vat_bus_posting_group_code" TEXT,
    "amount_incl_vat" BIGINT NOT NULL DEFAULT 0,
    "requisition_no" TEXT,
    "applies_to_doc_no" TEXT,

    CONSTRAINT "purchase_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_line" (
    "id" SERIAL NOT NULL,
    "purchase_header_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'G/L Account',
    "no" TEXT,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_of_measure_code" TEXT,
    "qty_per_unit_of_measure" INTEGER NOT NULL DEFAULT 1,
    "direct_unit_cost" BIGINT NOT NULL DEFAULT 0,
    "line_discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_discount_amount" BIGINT NOT NULL DEFAULT 0,
    "line_amount" BIGINT NOT NULL DEFAULT 0,
    "qty_to_receive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_received" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_to_invoice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_invoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "location_code" TEXT,
    "fa_depreciation_book_code" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "vat_prod_posting_group_code" TEXT,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_base_amount" BIGINT NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "amount_incl_vat" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases_payables_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_vendor_posting_group_code" TEXT,
    "default_payment_terms_code" TEXT,
    "receipt_on_invoice" INTEGER NOT NULL DEFAULT 1,
    "exact_cost_reversing_mandatory" INTEGER NOT NULL DEFAULT 0,
    "allow_payables_posting_from" TEXT,
    "allow_payables_posting_to" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,
    "default_vat_bus_posting_group_code" TEXT,
    "prices_incl_vat" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "purchases_payables_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_header" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "receipt_type" TEXT NOT NULL DEFAULT 'G/L Account',
    "posting_date" TEXT NOT NULL DEFAULT '',
    "bank_account_id" INTEGER NOT NULL,
    "bank_account_name" TEXT,
    "pay_mode_code" TEXT,
    "external_document_no" TEXT,
    "manual_receipt_no" TEXT,
    "description" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "approval_limit" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "decision_reason" TEXT,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "received_amount" BIGINT NOT NULL DEFAULT 0,
    "employee_id" INTEGER,

    CONSTRAINT "receipt_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_line" (
    "id" SERIAL NOT NULL,
    "receipt_header_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "line_type" TEXT NOT NULL DEFAULT 'G/L Account',
    "account_no" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "applies_to_doc_no" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,

    CONSTRAINT "receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_header" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'Reminder',
    "no" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_date" TEXT NOT NULL,
    "due_date" TEXT,
    "reminder_terms_code" TEXT,
    "fin_charge_terms_code" TEXT,
    "reminder_level" INTEGER NOT NULL DEFAULT 1,
    "customer_posting_group_code" TEXT,
    "use_header_level" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "remaining_amount" BIGINT NOT NULL DEFAULT 0,
    "interest_amount" BIGINT NOT NULL DEFAULT 0,
    "additional_fee" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL DEFAULT 0,
    "decision_reason" TEXT,
    "journal_id" INTEGER,
    "cust_ledger_entry_id" INTEGER,
    "issued_at" TEXT,
    "issued_by" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "reminder_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_level" (
    "id" SERIAL NOT NULL,
    "reminder_terms_code" TEXT NOT NULL,
    "level_no" INTEGER NOT NULL,
    "grace_period" TEXT NOT NULL DEFAULT '',
    "due_date_calculation" TEXT NOT NULL DEFAULT '',
    "calculate_interest" INTEGER NOT NULL DEFAULT 0,
    "additional_fee" BIGINT NOT NULL DEFAULT 0,
    "add_fee_per_line" BIGINT NOT NULL DEFAULT 0,
    "begin_text" TEXT,
    "end_text" TEXT,

    CONSTRAINT "reminder_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_line" (
    "id" SERIAL NOT NULL,
    "reminder_header_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Reminder Line',
    "cust_ledger_entry_id" INTEGER,
    "entry_document_type" TEXT,
    "entry_document_no" TEXT,
    "due_date" TEXT,
    "original_amount" BIGINT NOT NULL DEFAULT 0,
    "remaining_amount" BIGINT NOT NULL DEFAULT 0,
    "no" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "description" TEXT,
    "line_type" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "reminder_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_terms" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "max_no_of_reminders" INTEGER NOT NULL DEFAULT 3,
    "post_interest" INTEGER NOT NULL DEFAULT 0,
    "post_additional_fee" INTEGER NOT NULL DEFAULT 0,
    "min_amount" BIGINT NOT NULL DEFAULT 0,
    "dont_remind_on_hold" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "reminder_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition" (
    "no" TEXT NOT NULL,
    "requisition_type" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requisition_date" TEXT NOT NULL,
    "needed_by_date" TEXT,
    "expiration_date" TEXT,
    "requested_delivery_date" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "location_id" INTEGER,
    "procurement_method" TEXT,
    "supplier_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "issued" BOOLEAN NOT NULL DEFAULT false,
    "issued_at" TEXT,
    "issued_by" TEXT,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TEXT,
    "received_by" TEXT,
    "pr_closed" BOOLEAN NOT NULL DEFAULT false,
    "pr_closed_by" TEXT,
    "pr_closed_at" TEXT,
    "pr_closed_by_user" TEXT,
    "pr_close_reason" TEXT,
    "po_generated_directly" BOOLEAN NOT NULL DEFAULT false,
    "po_generated_by" TEXT,
    "po_generated_at" TEXT,
    "po_number" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "requisition_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "requisition_line" (
    "id" SERIAL NOT NULL,
    "requisition_no" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Item',
    "no" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "item_id" INTEGER,
    "gl_account_id" INTEGER,
    "unit_of_measure_id" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantity_approved" INTEGER NOT NULL DEFAULT 0,
    "unit_price" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "location_id" INTEGER,
    "quantity_to_issue" INTEGER NOT NULL DEFAULT 0,
    "quantity_issued" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TEXT,
    "issued_by" TEXT,
    "decision" TEXT NOT NULL DEFAULT '',
    "target_no" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "order_no" TEXT,

    CONSTRAINT "requisition_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" INTEGER NOT NULL DEFAULT 0,
    "require_two_factor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_header" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sell_to_name" TEXT,
    "sell_to_address" TEXT,
    "sell_to_city" TEXT,
    "sell_to_contact" TEXT,
    "posting_date" TEXT NOT NULL,
    "document_date" TEXT NOT NULL,
    "due_date" TEXT,
    "payment_terms_code" TEXT,
    "payment_method_code" TEXT,
    "customer_posting_group_code" TEXT,
    "your_reference" TEXT,
    "salesperson" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "decision_reason" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "applies_to_doc_no" TEXT,

    CONSTRAINT "sales_header_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_line" (
    "id" SERIAL NOT NULL,
    "sales_header_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'G/L Account',
    "no" TEXT,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit_price" BIGINT NOT NULL DEFAULT 0,
    "line_discount_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_discount_amount" BIGINT NOT NULL DEFAULT 0,
    "line_amount" BIGINT NOT NULL DEFAULT 0,
    "vat_prod_posting_group_code" TEXT,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_amount" BIGINT NOT NULL DEFAULT 0,
    "qty_to_ship" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_shipped" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_to_invoice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qty_invoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "location_code" TEXT,
    "fa_depreciation_book_code" TEXT,
    "depr_until_date" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,

    CONSTRAINT "sales_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_receivables_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_customer_posting_group_code" TEXT,
    "default_payment_terms_code" TEXT,
    "default_reminder_terms_code" TEXT,
    "default_fin_charge_terms_code" TEXT,
    "stockout_warning" INTEGER NOT NULL DEFAULT 1,
    "credit_warnings" TEXT NOT NULL DEFAULT 'Both',
    "invoice_rounding" INTEGER NOT NULL DEFAULT 0,
    "invoice_rounding_precision" BIGINT NOT NULL DEFAULT 0,
    "allow_receivables_posting_from" TEXT,
    "allow_receivables_posting_to" TEXT,
    "updated_at" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "sales_receivables_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence" (
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "next_no" INTEGER NOT NULL DEFAULT 1,
    "width" INTEGER NOT NULL DEFAULT 6,

    CONSTRAINT "sequence_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "session" (
    "token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "expires_at" TEXT,
    "last_seen_at" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "staff_claim" (
    "no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "claim_date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "justification" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "settlement" TEXT NOT NULL DEFAULT 'Pay Now',
    "paying_bank_account_id" INTEGER,
    "pay_mode_code" TEXT,
    "payment_tx_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "journal_id" INTEGER,
    "payment_stopped" BOOLEAN NOT NULL DEFAULT false,
    "stopped_at" TEXT,
    "stopped_by" TEXT,
    "stop_reason" TEXT,
    "transferred_to_payroll" BOOLEAN NOT NULL DEFAULT false,
    "payroll_transaction_id" INTEGER,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "staff_claim_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "staff_claim_line" (
    "id" SERIAL NOT NULL,
    "claim_no" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "gl_account_id" INTEGER NOT NULL,
    "narration" TEXT,
    "expense_date" TEXT,
    "receipt_ref" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_cost" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "staff_claim_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stockkeeping_unit" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "reordering_policy" TEXT,
    "reorder_point" INTEGER,
    "reorder_quantity" INTEGER,
    "maximum_inventory" INTEGER,
    "inventory" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stockkeeping_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_county" (
    "id" SERIAL NOT NULL,
    "county_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "code" TEXT,

    CONSTRAINT "sub_county_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_setup" (
    "id" SERIAL NOT NULL,
    "user_username" TEXT NOT NULL,
    "setup_type" TEXT NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "max_capacity" BIGINT NOT NULL DEFAULT 0,
    "min_capacity" BIGINT NOT NULL DEFAULT 0,
    "approval_limit" BIGINT NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "cashier_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme" (
    "id" INTEGER NOT NULL,
    "preset" TEXT DEFAULT 'custom',
    "tokens" TEXT NOT NULL,
    "updated_at" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "till_closing" (
    "no" TEXT NOT NULL,
    "closing_date" TEXT NOT NULL,
    "till_bank_account_id" INTEGER NOT NULL,
    "cashier_username" TEXT NOT NULL,
    "treasury_bank_account_id" INTEGER,
    "opening_balance" BIGINT NOT NULL DEFAULT 0,
    "cash_in" BIGINT NOT NULL DEFAULT 0,
    "cash_out" BIGINT NOT NULL DEFAULT 0,
    "system_balance" BIGINT NOT NULL DEFAULT 0,
    "counted_amount" BIGINT NOT NULL DEFAULT 0,
    "variance" BIGINT NOT NULL DEFAULT 0,
    "variance_reason" TEXT,
    "return_to_treasury" BOOLEAN NOT NULL DEFAULT true,
    "returned_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "decision_reason" TEXT,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "posted_at" TEXT,
    "posted_by" TEXT,
    "variance_journal_id" INTEGER,
    "handover_journal_id" INTEGER,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "till_closing_pkey" PRIMARY KEY ("no")
);

-- CreateTable
CREATE TABLE "unit_of_measure" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "symbol" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "unit_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_line" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_name" TEXT NOT NULL,
    "read_perm" INTEGER NOT NULL DEFAULT 0,
    "insert_perm" INTEGER NOT NULL DEFAULT 0,
    "modify_perm" INTEGER NOT NULL DEFAULT 0,
    "delete_perm" INTEGER NOT NULL DEFAULT 0,
    "execute_perm" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "user_permission_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_set" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "user_permission_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "profile_id" INTEGER NOT NULL,

    CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_business_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "vat_business_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_entry" (
    "id" SERIAL NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT '',
    "document_no" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Purchase',
    "tax_type" TEXT NOT NULL DEFAULT 'VAT',
    "vat_bus_posting_group_code" TEXT,
    "vat_prod_posting_group_code" TEXT,
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "base" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "base_fcy" BIGINT NOT NULL DEFAULT 0,
    "amount_fcy" BIGINT NOT NULL DEFAULT 0,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "bill_to_pay_to_no" TEXT,
    "vendor_pin" TEXT,
    "wht_certificate_no" TEXT,
    "journal_id" INTEGER,
    "source_type" TEXT,
    "source_id" INTEGER,
    "closed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,

    CONSTRAINT "vat_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_posting_setup" (
    "id" SERIAL NOT NULL,
    "vat_bus_posting_group_code" TEXT NOT NULL,
    "vat_prod_posting_group_code" TEXT NOT NULL,
    "tax_type" TEXT NOT NULL DEFAULT 'VAT',
    "vat_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat_calculation_type" TEXT NOT NULL DEFAULT 'Normal',
    "tax_account_id" INTEGER,
    "sales_tax_account_id" INTEGER,
    "wht_base" TEXT NOT NULL DEFAULT 'Net',
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "vat_posting_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_product_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tax_type" TEXT NOT NULL DEFAULT 'VAT',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "vat_product_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_2" TEXT,
    "address" TEXT,
    "address_2" TEXT,
    "city" TEXT,
    "post_code" TEXT,
    "country" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "vendor_posting_group_code" TEXT,
    "payment_terms_code" TEXT,
    "payment_method_code" TEXT,
    "purchaser" TEXT,
    "credit_limit" BIGINT NOT NULL DEFAULT 0,
    "blocked" TEXT NOT NULL DEFAULT '',
    "our_account_no" TEXT,
    "global_dimension_1_id" INTEGER,
    "global_dimension_2_id" INTEGER,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "last_statement_no" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,
    "currency_code" TEXT,
    "vat_bus_posting_group_code" TEXT,
    "pin_no" TEXT,
    "wht_exempt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_ledger_entry" (
    "id" SERIAL NOT NULL,
    "vendor_id" INTEGER NOT NULL,
    "posting_date" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_no" TEXT NOT NULL,
    "vendor_invoice_no" TEXT,
    "description" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "remaining_amount" BIGINT NOT NULL DEFAULT 0,
    "original_amount" BIGINT NOT NULL DEFAULT 0,
    "due_date" TEXT,
    "pmt_discount_date" TEXT,
    "original_pmt_disc_possible" BIGINT NOT NULL DEFAULT 0,
    "open" INTEGER NOT NULL DEFAULT 1,
    "positive" INTEGER NOT NULL DEFAULT 1,
    "closed_by_entry_no" INTEGER,
    "closed_at_date" TEXT,
    "on_hold" TEXT,
    "source_type" TEXT,
    "source_id" INTEGER,
    "journal_id" INTEGER,
    "created_at" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'KES',
    "currency_factor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "amount_lcy" BIGINT NOT NULL DEFAULT 0,
    "remaining_amount_lcy" BIGINT NOT NULL DEFAULT 0,
    "original_amount_lcy" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_posting_group" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payables_account_id" INTEGER NOT NULL,
    "service_charge_account_id" INTEGER NOT NULL,
    "payment_disc_debit_account_id" INTEGER NOT NULL,
    "payment_disc_credit_account_id" INTEGER NOT NULL,
    "invoice_rounding_account_id" INTEGER NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "vendor_posting_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_certificate" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "vendor_id" INTEGER,
    "vendor_name" TEXT,
    "vendor_pin" TEXT,
    "payment_voucher_no" TEXT NOT NULL,
    "certificate_date" TEXT NOT NULL,
    "gross_amount" BIGINT NOT NULL DEFAULT 0,
    "total_wht" BIGINT NOT NULL DEFAULT 0,
    "remitted" INTEGER NOT NULL DEFAULT 0,
    "remittance_ref" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "wht_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_certificate_line" (
    "id" SERIAL NOT NULL,
    "wht_certificate_id" INTEGER NOT NULL,
    "line_no" INTEGER NOT NULL,
    "wht_code" TEXT NOT NULL,
    "description" TEXT,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "base" BIGINT NOT NULL DEFAULT 0,
    "wht_amount" BIGINT NOT NULL DEFAULT 0,
    "vat_entry_id" INTEGER,

    CONSTRAINT "wht_certificate_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,
    "enabled" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_condition" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value2" TEXT,

    CONSTRAINT "workflow_condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER NOT NULL,
    "step_no" INTEGER NOT NULL,
    "approver_type" TEXT NOT NULL,
    "approver_user_id" INTEGER,
    "approver_group_id" INTEGER,
    "notify_email" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workflow_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_table_relation" (
    "id" SERIAL NOT NULL,
    "document_type" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "workflow_table_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_table_relation_field" (
    "id" SERIAL NOT NULL,
    "table_relation_id" INTEGER NOT NULL,
    "field_name" TEXT NOT NULL,

    CONSTRAINT "workflow_table_relation_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_task" (
    "id" SERIAL NOT NULL,
    "workflow_id" INTEGER,
    "workflow_step_id" INTEGER,
    "step_no" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "assigned_to_user_id" INTEGER,
    "assigned_to_group_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT NOT NULL,
    "requested_at" TEXT NOT NULL,
    "decided_by" TEXT,
    "decided_at" TEXT,
    "comment" TEXT,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "payload" TEXT,
    "current_sequence" INTEGER,
    "delegated_by_user_id" INTEGER,
    "delegated_to_user_id" INTEGER,

    CONSTRAINT "workflow_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_user_group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "workflow_user_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_user_group_member" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workflow_user_group_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etims_invoice" (
    "id" SERIAL NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_no" TEXT NOT NULL,
    "rcpt_type" TEXT NOT NULL DEFAULT 'S',
    "org_invc_no" INTEGER,
    "invc_no" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cust_tin" TEXT,
    "cust_name" TEXT,
    "pmt_type" TEXT NOT NULL,
    "total" BIGINT NOT NULL,
    "tax_total" BIGINT NOT NULL,
    "payload" JSONB,
    "response" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TEXT,
    "cur_rcpt_no" INTEGER,
    "tot_rcpt_no" INTEGER,
    "intrl_data" TEXT,
    "rcpt_sign" TEXT,
    "sdc_date_time" TEXT,
    "sdc_id" TEXT,
    "mrc_no" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "signed_at" TEXT,

    CONSTRAINT "etims_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TEXT NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "integration_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "mpesa_request" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "document_no" TEXT,
    "environment" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "checkout_request_id" TEXT,
    "merchant_request_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result_code" INTEGER,
    "result_desc" TEXT,
    "mpesa_receipt" TEXT,
    "paid_amount" BIGINT,
    "paid_phone" TEXT,
    "transaction_date" TEXT,
    "journal_no" TEXT,
    "requested_by" TEXT NOT NULL,
    "requested_at" TEXT NOT NULL,
    "completed_at" TEXT,

    CONSTRAINT "mpesa_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "location_id" INTEGER NOT NULL,
    "count_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "total_variance" BIGINT NOT NULL DEFAULT 0,
    "journal_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "posted_at" TEXT,
    "posted_by" TEXT,

    CONSTRAINT "stock_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_line" (
    "id" SERIAL NOT NULL,
    "stock_count_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "qty_calculated" INTEGER NOT NULL,
    "qty_counted" INTEGER,
    "variance_amount" BIGINT,

    CONSTRAINT "stock_count_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_setup" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "patient_receivable_account_id" INTEGER,
    "unbilled_claims_account_id" INTEGER,
    "discount_account_id" INTEGER,
    "claim_writeoff_account_id" INTEGER,
    "default_revenue_account_id" INTEGER,
    "cash_bank_account_id" INTEGER,
    "mpesa_bank_account_id" INTEGER,
    "card_bank_account_id" INTEGER,
    "bank_transfer_account_id" INTEGER,
    "pharmacy_location_id" INTEGER,
    "default_price_list_code" TEXT NOT NULL DEFAULT 'CASH',
    "scheme_customer_posting_group" TEXT NOT NULL DEFAULT 'INSURANCE',
    "registration_service_code" TEXT,
    "pay_before_service" INTEGER NOT NULL DEFAULT 0,
    "lab_requires_verification" INTEGER NOT NULL DEFAULT 1,
    "review_window_days" INTEGER NOT NULL DEFAULT 7,
    "reminder_hours" INTEGER NOT NULL DEFAULT 24,
    "day_start" TEXT NOT NULL DEFAULT '08:00',
    "day_end" TEXT NOT NULL DEFAULT '18:00',
    "slot_minutes" INTEGER NOT NULL DEFAULT 20,
    "updated_at" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "clinic_setup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_department" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CLINIC',
    "queue_prefix" TEXT NOT NULL DEFAULT 'Q',
    "room" TEXT,
    "colour" TEXT NOT NULL DEFAULT '#0E7490',
    "consultation_service_code" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "clinic_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_category" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revenue_account_id" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_item" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "department_code" TEXT,
    "base_price" BIGINT NOT NULL DEFAULT 0,
    "item_id" INTEGER,
    "vat_prod_posting_group_code" TEXT NOT NULL DEFAULT 'EXEMPT',
    "requires_preauth" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "service_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CASH',
    "markup_pct" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_line" (
    "id" SERIAL NOT NULL,
    "price_list_code" TEXT NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,

    CONSTRAINT "price_list_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_scheme" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payer_type" TEXT NOT NULL DEFAULT 'INSURER',
    "customer_id" INTEGER,
    "price_list_code" TEXT,
    "copay_type" TEXT NOT NULL DEFAULT 'NONE',
    "copay_value" BIGINT NOT NULL DEFAULT 0,
    "preauth_threshold" BIGINT NOT NULL DEFAULT 0,
    "visit_limit" BIGINT NOT NULL DEFAULT 0,
    "claim_submission_days" INTEGER NOT NULL DEFAULT 30,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TEXT,
    "created_by" TEXT,

    CONSTRAINT "insurance_scheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient" (
    "id" SERIAL NOT NULL,
    "mrn" TEXT NOT NULL,
    "title" TEXT,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "date_of_birth" TEXT,
    "dob_estimated" INTEGER NOT NULL DEFAULT 0,
    "marital_status" TEXT,
    "id_type" TEXT NOT NULL DEFAULT 'NATIONAL_ID',
    "id_number_enc" TEXT,
    "id_number_last4" TEXT,
    "phone" TEXT,
    "alt_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "county_code" TEXT,
    "occupation" TEXT,
    "blood_group" TEXT,
    "allergies" TEXT,
    "chronic_conditions" TEXT,
    "alerts" TEXT,
    "next_of_kin_name" TEXT,
    "next_of_kin_relation" TEXT,
    "next_of_kin_phone" TEXT,
    "photo_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sms_consent" INTEGER NOT NULL DEFAULT 1,
    "first_visit_date" TEXT,
    "last_visit_date" TEXT,
    "notes" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_at" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_cover" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "scheme_id" INTEGER NOT NULL,
    "member_no" TEXT NOT NULL,
    "principal_name" TEXT,
    "relationship" TEXT NOT NULL DEFAULT 'SELF',
    "valid_from" TEXT,
    "valid_to" TEXT,
    "is_default" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "patient_cover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "department_code" TEXT NOT NULL,
    "clinician_user_id" INTEGER,
    "appointment_date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_mins" INTEGER NOT NULL DEFAULT 20,
    "appointment_type" TEXT NOT NULL DEFAULT 'NEW',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "source" TEXT NOT NULL DEFAULT 'PHONE',
    "visit_id" INTEGER,
    "reminder_sent_at" TEXT,
    "cancel_reason" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_date" TEXT NOT NULL,
    "check_in_at" TEXT NOT NULL,
    "visit_type" TEXT NOT NULL DEFAULT 'NEW',
    "department_code" TEXT NOT NULL,
    "clinician_user_id" INTEGER,
    "payment_mode" TEXT NOT NULL DEFAULT 'CASH',
    "scheme_id" INTEGER,
    "cover_id" INTEGER,
    "member_no" TEXT,
    "price_list_code" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "stage" TEXT NOT NULL DEFAULT 'TRIAGE',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "chief_complaint" TEXT,
    "appointment_id" INTEGER,
    "referral_source" TEXT,
    "outcome" TEXT,
    "follow_up_date" TEXT,
    "closed_at" TEXT,
    "closed_by" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_queue" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "department_code" TEXT NOT NULL,
    "queue_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "room" TEXT,
    "entered_at" TEXT NOT NULL,
    "called_at" TEXT,
    "served_by" TEXT,
    "completed_at" TEXT,

    CONSTRAINT "visit_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "temperature_c" DECIMAL(4,1),
    "pulse" INTEGER,
    "resp_rate" INTEGER,
    "bp_systolic" INTEGER,
    "bp_diastolic" INTEGER,
    "spo2" INTEGER,
    "weight_kg" DECIMAL(5,1),
    "height_cm" DECIMAL(5,1),
    "bmi" DECIMAL(4,1),
    "muac_cm" DECIMAL(4,1),
    "blood_sugar" DECIMAL(4,1),
    "pain_score" INTEGER,
    "acuity" TEXT NOT NULL DEFAULT 'GREEN',
    "notes" TEXT,
    "recorded_at" TEXT NOT NULL,
    "recorded_by" TEXT NOT NULL,

    CONSTRAINT "triage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "department_code" TEXT NOT NULL,
    "clinician_user_id" INTEGER NOT NULL,
    "clinician_name" TEXT NOT NULL,
    "chief_complaint" TEXT,
    "history" TEXT,
    "past_history" TEXT,
    "family_social_history" TEXT,
    "review_of_systems" TEXT,
    "examination" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "started_at" TEXT NOT NULL,
    "completed_at" TEXT,

    CONSTRAINT "consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd_code" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapter" TEXT,
    "common" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "icd_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "icd_code" TEXT,
    "description" TEXT NOT NULL,
    "diagnosis_type" TEXT NOT NULL DEFAULT 'PRIMARY',
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_charge" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "service_item_id" INTEGER,
    "source_type" TEXT NOT NULL,
    "source_id" INTEGER,
    "department_code" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "scheme_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "bill_id" INTEGER,
    "charged_at" TEXT NOT NULL,
    "charged_by" TEXT NOT NULL,
    "cancelled_at" TEXT,
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,

    CONSTRAINT "patient_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_bill" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "scheme_id" INTEGER,
    "bill_date" TEXT NOT NULL,
    "gross" BIGINT NOT NULL DEFAULT 0,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "net" BIGINT NOT NULL DEFAULT 0,
    "patient_share" BIGINT NOT NULL DEFAULT 0,
    "scheme_share" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "finalised_at" TEXT,
    "finalised_by" TEXT,
    "journal_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "patient_bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_payment" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "payment_date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amount" BIGINT NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journal_id" INTEGER,
    "received_by" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "voided_at" TEXT,
    "voided_by" TEXT,
    "void_reason" TEXT,
    "void_journal_id" INTEGER,

    CONSTRAINT "patient_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preauthorization" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "scheme_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "requested_amount" BIGINT NOT NULL,
    "approved_amount" BIGINT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "auth_code" TEXT,
    "requested_at" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "decided_at" TEXT,
    "decided_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "preauthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claim" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "scheme_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "bill_id" INTEGER NOT NULL,
    "member_no" TEXT,
    "preauth_no" TEXT,
    "claim_date" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "approved_amount" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "batch_ref" TEXT,
    "submitted_at" TEXT,
    "submitted_by" TEXT,
    "decided_at" TEXT,
    "decided_by" TEXT,
    "rejection_reason" TEXT,
    "invoice_no" TEXT,
    "writeoff_journal_id" INTEGER,
    "notes" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "insurance_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_test" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "specimen_type" TEXT NOT NULL DEFAULT 'BLOOD',
    "container" TEXT,
    "method" TEXT,
    "tat_minutes" INTEGER NOT NULL DEFAULT 60,
    "service_item_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lab_test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_test_parameter" (
    "id" SERIAL NOT NULL,
    "lab_test_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "result_type" TEXT NOT NULL DEFAULT 'NUMERIC',
    "options" TEXT,
    "ref_low" DECIMAL(12,3),
    "ref_high" DECIMAL(12,3),
    "ref_low_female" DECIMAL(12,3),
    "ref_high_female" DECIMAL(12,3),
    "critical_low" DECIMAL(12,3),
    "critical_high" DECIMAL(12,3),
    "ref_text" TEXT,

    CONSTRAINT "lab_test_parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "clinical_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "ordered_at" TEXT NOT NULL,
    "ordered_by" TEXT NOT NULL,

    CONSTRAINT "lab_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_order_test" (
    "id" SERIAL NOT NULL,
    "lab_order_id" INTEGER NOT NULL,
    "lab_test_id" INTEGER NOT NULL,
    "charge_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "specimen_no" TEXT,
    "collected_at" TEXT,
    "collected_by" TEXT,
    "resulted_at" TEXT,
    "resulted_by" TEXT,
    "verified_at" TEXT,
    "verified_by" TEXT,
    "comment" TEXT,

    CONSTRAINT "lab_order_test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_result" (
    "id" SERIAL NOT NULL,
    "order_test_id" INTEGER NOT NULL,
    "parameter_id" INTEGER NOT NULL,
    "value_text" TEXT,
    "value_num" DECIMAL(12,3),
    "flag" TEXT NOT NULL DEFAULT 'N',
    "created_at" TEXT NOT NULL,

    CONSTRAINT "lab_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imaging_order" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "modality" TEXT NOT NULL,
    "body_part" TEXT,
    "clinical_notes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "charge_id" INTEGER,
    "ordered_at" TEXT NOT NULL,
    "ordered_by" TEXT NOT NULL,
    "performed_at" TEXT,
    "performed_by" TEXT,
    "findings" TEXT,
    "impression" TEXT,
    "image_url" TEXT,
    "reported_at" TEXT,
    "reported_by" TEXT,

    CONSTRAINT "imaging_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "service_item_id" INTEGER,
    "generic_name" TEXT NOT NULL,
    "brand_name" TEXT,
    "strength" TEXT,
    "dosage_form" TEXT NOT NULL DEFAULT 'TABLET',
    "default_route" TEXT NOT NULL DEFAULT 'PO',
    "default_frequency" TEXT,
    "controlled" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "prescribed_at" TEXT NOT NULL,
    "prescribed_by" TEXT NOT NULL,

    CONSTRAINT "prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_line" (
    "id" SERIAL NOT NULL,
    "prescription_id" INTEGER NOT NULL,
    "drug_id" INTEGER NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT NOT NULL DEFAULT 'PO',
    "frequency" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 1,
    "quantity" INTEGER NOT NULL,
    "instructions" TEXT,
    "dispensed_qty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "charge_id" INTEGER,
    "item_journal_no" TEXT,
    "dispensed_at" TEXT,
    "dispensed_by" TEXT,

    CONSTRAINT "prescription_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_chart_entry" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "tooth" TEXT NOT NULL,
    "surfaces" TEXT,
    "condition" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CURRENT',
    "recorded_at" TEXT NOT NULL,
    "recorded_by" TEXT NOT NULL,

    CONSTRAINT "dental_chart_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_treatment_plan" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "visit_id" INTEGER,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "notes" TEXT,
    "accepted_at" TEXT,
    "created_at" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "dental_treatment_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_treatment_item" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "tooth" TEXT,
    "surfaces" TEXT,
    "service_item_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "fee" BIGINT NOT NULL,
    "phase" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "completed_visit_id" INTEGER,
    "completed_at" TEXT,
    "completed_by" TEXT,
    "charge_id" INTEGER,
    "notes" TEXT,

    CONSTRAINT "dental_treatment_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_record" (
    "id" SERIAL NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "service_item_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "charge_id" INTEGER,
    "notes" TEXT,
    "ordered_at" TEXT NOT NULL,
    "ordered_by" TEXT NOT NULL,
    "performed_at" TEXT,
    "performed_by" TEXT,

    CONSTRAINT "procedure_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_document" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "visit_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "referred_to" TEXT,
    "specialty" TEXT,
    "urgency" TEXT,
    "from_date" TEXT,
    "to_date" TEXT,
    "body" TEXT NOT NULL,
    "issued_at" TEXT NOT NULL,
    "issued_by" TEXT NOT NULL,

    CONSTRAINT "clinical_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_acc_schedule_line_name" ON "acc_schedule_line"("acc_schedule_name_id");

-- CreateIndex
CREATE UNIQUE INDEX "acc_schedule_name_name_key" ON "acc_schedule_name"("name");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_period_code_key" ON "accounting_period"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE INDEX "ix_user_role" ON "app_user"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_user_setup_user_id_key" ON "approval_user_setup"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_approval_user_setup_employee" ON "approval_user_setup"("employee_id");

-- CreateIndex
CREATE INDEX "ix_approval_admin" ON "approval_user_setup"("is_approval_administrator");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_public_id_key" ON "attachment"("public_id");

-- CreateIndex
CREATE INDEX "ix_attachment_entity" ON "attachment"("entity", "entity_id", "id" DESC);

-- CreateIndex
CREATE INDEX "ix_audit_at" ON "audit_log"("at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "bank_acc_posting_group_code_key" ON "bank_acc_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_code_key" ON "bank_account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_gl_account_id_key" ON "bank_account"("gl_account_id");

-- CreateIndex
CREATE INDEX "ix_bale_account" ON "bank_account_ledger_entry"("bank_account_id");

-- CreateIndex
CREATE INDEX "ix_bale_journal" ON "bank_account_ledger_entry"("journal_id");

-- CreateIndex
CREATE INDEX "ix_bale_reconciliation" ON "bank_account_ledger_entry"("bank_reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_rec_line_recon_lineno_key" ON "bank_rec_line"("bank_reconciliation_id", "line_no");

-- CreateIndex
CREATE INDEX "ix_brec_account" ON "bank_reconciliation"("bank_account_id");

-- CreateIndex
CREATE INDEX "ix_cdl_document" ON "cash_denomination_line"("document_kind", "document_no");

-- CreateIndex
CREATE UNIQUE INDEX "cash_denomination_line_document_kind_document_no_denominatio_ke" ON "cash_denomination_line"("document_kind", "document_no", "denomination_id");

-- CreateIndex
CREATE INDEX "ix_change_log_entry_at" ON "change_log_entry"("changed_at" DESC);

-- CreateIndex
CREATE INDEX "ix_change_log_entry_record" ON "change_log_entry"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "ix_column_layout_name" ON "column_layout"("column_layout_name_id");

-- CreateIndex
CREATE UNIQUE INDEX "column_layout_name_name_key" ON "column_layout_name"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_company_schema" ON "company"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "company_job_job_id_key" ON "company_job"("job_id");

-- CreateIndex
CREATE INDEX "ix_cj_reports_to" ON "company_job"("reports_to_job_id");

-- CreateIndex
CREATE INDEX "ix_cjl_job" ON "company_job_qualification"("job_id");

-- CreateIndex
CREATE INDEX "ix_cjq_job" ON "company_job_requirement"("job_id", "line_no");

-- CreateIndex
CREATE INDEX "ix_cjr_job" ON "company_job_responsibility"("job_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "config_package_code_key" ON "config_package"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ux_config_package_field" ON "config_package_field"("package_id", "field_name");

-- CreateIndex
CREATE UNIQUE INDEX "county_name_key" ON "county"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_county_code" ON "county"("code");

-- CreateIndex
CREATE UNIQUE INDEX "currency_code_key" ON "currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "currency_exchange_rate_ccy_date_key" ON "currency_exchange_rate"("currency_code", "starting_date");

-- CreateIndex
CREATE INDEX "ix_cle_customer_open" ON "cust_ledger_entry"("customer_id", "open");

-- CreateIndex
CREATE INDEX "ix_cle_document_no" ON "cust_ledger_entry"("document_no");

-- CreateIndex
CREATE INDEX "ix_cle_due_date" ON "cust_ledger_entry"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "customer_no_key" ON "customer"("no");

-- CreateIndex
CREATE INDEX "ix_customer_posting_group" ON "customer"("customer_posting_group_code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_posting_group_code_key" ON "customer_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "denomination_code_key" ON "denomination"("code");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_book_code_key" ON "depreciation_book"("code");

-- CreateIndex
CREATE INDEX "ix_dcle_applied" ON "detailed_cust_ledger_entry"("applied_cust_ledger_entry_id");

-- CreateIndex
CREATE INDEX "ix_dcle_cle" ON "detailed_cust_ledger_entry"("cust_ledger_entry_id");

-- CreateIndex
CREATE INDEX "ix_dvle_applied" ON "detailed_vendor_ledger_entry"("applied_vendor_ledger_entry_id");

-- CreateIndex
CREATE INDEX "ix_dvle_vle" ON "detailed_vendor_ledger_entry"("vendor_ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_no_key" ON "employee"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "ux_employee_national_id" ON "employee"("national_id") WHERE ((national_id IS NOT NULL) AND (national_id <> ''::text));

-- CreateIndex
CREATE UNIQUE INDEX "ux_employee_kra_pin" ON "employee"("kra_pin") WHERE ((kra_pin IS NOT NULL) AND (kra_pin <> ''::text));

-- CreateIndex
CREATE UNIQUE INDEX "ux_employee_nssf_no" ON "employee"("nssf_no") WHERE ((nssf_no IS NOT NULL) AND (nssf_no <> ''::text));

-- CreateIndex
CREATE UNIQUE INDEX "ux_employee_shif_no" ON "employee"("shif_no") WHERE ((shif_no IS NOT NULL) AND (shif_no <> ''::text));

-- CreateIndex
CREATE INDEX "ix_employee_company_job" ON "employee"("company_job_id");

-- CreateIndex
CREATE INDEX "ix_employee_manager" ON "employee"("manager_id");

-- CreateIndex
CREATE INDEX "ix_employee_status" ON "employee"("status");

-- CreateIndex
CREATE INDEX "ix_eba_employee" ON "employee_bank_account"("employee_id");

-- CreateIndex
CREATE INDEX "ix_ebnf_employee" ON "employee_beneficiary"("employee_id");

-- CreateIndex
CREATE INDEX "ix_econ_employee" ON "employee_contract"("employee_id");

-- CreateIndex
CREATE INDEX "ix_ecc_employee" ON "employee_contract_change"("employee_id");

-- CreateIndex
CREATE INDEX "ix_ecc_status" ON "employee_contract_change"("status");

-- CreateIndex
CREATE INDEX "ix_edep_employee" ON "employee_dependant"("employee_id");

-- CreateIndex
CREATE INDEX "ix_eeba_edit" ON "employee_edit_bank_account"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eebnf_edit" ON "employee_edit_beneficiary"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eedep_edit" ON "employee_edit_dependant"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eeec_edit" ON "employee_edit_emergency_contact"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eenok_edit" ON "employee_edit_next_of_kin"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eepb_edit" ON "employee_edit_professional_body"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eer_employee" ON "employee_edit_request"("employee_id");

-- CreateIndex
CREATE INDEX "ix_eer_status" ON "employee_edit_request"("status");

-- CreateIndex
CREATE INDEX "ix_eewh_edit" ON "employee_edit_work_history"("edit_no");

-- CreateIndex
CREATE INDEX "ix_eec_employee" ON "employee_emergency_contact"("employee_id");

-- CreateIndex
CREATE INDEX "ix_eexit_employee" ON "employee_exit"("employee_id");

-- CreateIndex
CREATE INDEX "ix_eexit_status" ON "employee_exit"("status");

-- CreateIndex
CREATE INDEX "ix_eecl_exit" ON "employee_exit_clearance_line"("exit_no");

-- CreateIndex
CREATE INDEX "ix_eefdl_exit" ON "employee_exit_final_due_line"("exit_no");

-- CreateIndex
CREATE INDEX "ix_ele_document" ON "employee_ledger_entry"("document_no");

-- CreateIndex
CREATE INDEX "ix_ele_employee" ON "employee_ledger_entry"("employee_id");

-- CreateIndex
CREATE INDEX "ix_enok_employee" ON "employee_next_of_kin"("employee_id");

-- CreateIndex
CREATE INDEX "ix_ept_employee_period" ON "employee_payroll_transaction"("employee_id", "payroll_period_id");

-- CreateIndex
CREATE INDEX "ix_ept_period" ON "employee_payroll_transaction"("payroll_period_id");

-- CreateIndex
CREATE INDEX "ix_epb_employee" ON "employee_professional_body"("employee_id");

-- CreateIndex
CREATE INDEX "ix_ewh_employee" ON "employee_work_history"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_bank_code_key" ON "external_bank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "external_bank_branch_key" ON "external_bank_branch"("bank_code", "branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "fa_class_code_key" ON "fa_class"("code");

-- CreateIndex
CREATE INDEX "ix_fadb_book" ON "fa_depreciation_book"("depreciation_book_code");

-- CreateIndex
CREATE UNIQUE INDEX "fa_depreciation_book_fixed_asset_id_depreciation_book_code_key" ON "fa_depreciation_book"("fixed_asset_id", "depreciation_book_code");

-- CreateIndex
CREATE UNIQUE INDEX "fa_journal_line_no_key" ON "fa_journal_line"("no");

-- CreateIndex
CREATE INDEX "ix_faj_asset" ON "fa_journal_line"("fixed_asset_id");

-- CreateIndex
CREATE INDEX "ix_faj_created_by" ON "fa_journal_line"("created_by");

-- CreateIndex
CREATE INDEX "ix_faj_posting_date" ON "fa_journal_line"("posting_date");

-- CreateIndex
CREATE INDEX "ix_faj_status" ON "fa_journal_line"("status");

-- CreateIndex
CREATE INDEX "ix_fale_asset_book" ON "fa_ledger_entry"("fixed_asset_id", "depreciation_book_code");

-- CreateIndex
CREATE INDEX "ix_fale_date" ON "fa_ledger_entry"("fa_posting_date");

-- CreateIndex
CREATE INDEX "ix_fale_type" ON "fa_ledger_entry"("fa_posting_type");

-- CreateIndex
CREATE UNIQUE INDEX "fa_location_code_key" ON "fa_location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fa_posting_group_code_key" ON "fa_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fa_subclass_code_key" ON "fa_subclass"("code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_charge_terms_code_key" ON "finance_charge_terms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "financial_report_name_key" ON "financial_report"("name");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_no_key" ON "fixed_asset"("no");

-- CreateIndex
CREATE INDEX "ix_fa_class" ON "fixed_asset"("fa_class_code");

-- CreateIndex
CREATE INDEX "ix_fa_location" ON "fixed_asset"("fa_location_code");

-- CreateIndex
CREATE INDEX "ix_ft_created_by" ON "cash_office_transfer"("created_by");

-- CreateIndex
CREATE INDEX "ix_ft_type_status" ON "cash_office_transfer"("document_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gl_account_code_key" ON "gl_account"("code");

-- CreateIndex
CREATE INDEX "ix_gl_budget_entry_lookup" ON "gl_budget_entry"("budget_name", "gl_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "global_dimension_1_value_code_key" ON "global_dimension_1_value"("code");

-- CreateIndex
CREATE UNIQUE INDEX "global_dimension_1_value_name_key" ON "global_dimension_1_value"("name");

-- CreateIndex
CREATE UNIQUE INDEX "global_dimension_2_value_code_key" ON "global_dimension_2_value"("code");

-- CreateIndex
CREATE UNIQUE INDEX "global_dimension_2_value_name_key" ON "global_dimension_2_value"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_clearance_section_code_key" ON "hr_clearance_section"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employment_contract_type_code_key" ON "hr_employment_contract_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hr_holiday_date_key" ON "hr_holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "hr_job_grade_code_key" ON "hr_job_grade"("code");

-- CreateIndex
CREATE INDEX "ix_hladj_status" ON "hr_leave_adjustment"("status");

-- CreateIndex
CREATE INDEX "ix_hladjl_adjustment" ON "hr_leave_adjustment_line"("adjustment_no");

-- CreateIndex
CREATE INDEX "ix_hla_employee" ON "hr_leave_application"("employee_id");

-- CreateIndex
CREATE INDEX "ix_hla_status" ON "hr_leave_application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_leave_calendar_code_key" ON "hr_leave_calendar"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ux_hr_leave_calendar_single_current" ON "hr_leave_calendar"("is_current") WHERE (is_current = true);

-- CreateIndex
CREATE UNIQUE INDEX "ux_hldta_type_grade" ON "hr_leave_days_to_accrue"("leave_type_id", "job_grade_id");

-- CreateIndex
CREATE INDEX "ix_hlle_calendar" ON "hr_leave_ledger_entry"("leave_calendar_id");

-- CreateIndex
CREATE INDEX "ix_hlle_employee_type" ON "hr_leave_ledger_entry"("employee_id", "leave_type_id");

-- CreateIndex
CREATE INDEX "ix_hlp_employee" ON "hr_leave_plan"("employee_id");

-- CreateIndex
CREATE INDEX "ix_hlp_status" ON "hr_leave_plan"("status");

-- CreateIndex
CREATE INDEX "ix_hlpl_plan" ON "hr_leave_plan_line"("plan_no");

-- CreateIndex
CREATE INDEX "ix_hlr_employee" ON "hr_leave_recall"("employee_id");

-- CreateIndex
CREATE INDEX "ix_hlr_status" ON "hr_leave_recall"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hr_leave_type_code_key" ON "hr_leave_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ux_hr_leave_type_single_annual" ON "hr_leave_type"("is_annual") WHERE (is_annual = true);

-- CreateIndex
CREATE INDEX "ix_salary_scale_grade" ON "hr_salary_scale"("job_grade_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_salary_scale_grade_code" ON "hr_salary_scale"("job_grade_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ux_salary_scale_benefit" ON "hr_salary_scale_benefit"("salary_scale_id", "transaction_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "hr_termination_reason_code_key" ON "hr_termination_reason"("code");

-- CreateIndex
CREATE INDEX "ix_imr_created_by" ON "imprest_request"("created_by");

-- CreateIndex
CREATE INDEX "ix_imr_employee" ON "imprest_request"("employee_id");

-- CreateIndex
CREATE INDEX "ix_imr_status" ON "imprest_request"("status");

-- CreateIndex
CREATE INDEX "ix_imrl_request" ON "imprest_request_line"("request_no");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_posting_group_code_key" ON "inventory_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "item_no_key" ON "item"("no");

-- CreateIndex
CREATE INDEX "ix_item_status" ON "item"("status");

-- CreateIndex
CREATE INDEX "ix_iae_inbound" ON "item_application_entry"("inbound_entry_id");

-- CreateIndex
CREATE INDEX "ix_iae_outbound" ON "item_application_entry"("outbound_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_journal_line_no_key" ON "item_journal_line"("no");

-- CreateIndex
CREATE INDEX "ix_ijl_created_by" ON "item_journal_line"("created_by");

-- CreateIndex
CREATE INDEX "ix_ijl_item" ON "item_journal_line"("item_id");

-- CreateIndex
CREATE INDEX "ix_ijl_location" ON "item_journal_line"("location_id");

-- CreateIndex
CREATE INDEX "ix_ijl_posting_date" ON "item_journal_line"("posting_date");

-- CreateIndex
CREATE INDEX "ix_ijl_status" ON "item_journal_line"("status");

-- CreateIndex
CREATE INDEX "ix_ile_item" ON "item_ledger_entry"("item_id");

-- CreateIndex
CREATE INDEX "ix_ile_location" ON "item_ledger_entry"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_unit_of_measure_item_id_unit_of_measure_id_key" ON "item_unit_of_measure"("item_id", "unit_of_measure_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_entry_code_key" ON "job_queue_entry"("code");

-- CreateIndex
CREATE INDEX "ix_jqe_status" ON "job_queue_entry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "journal_journal_no_key" ON "journal"("journal_no");

-- CreateIndex
CREATE UNIQUE INDEX "journal_idempotency_key_key" ON "journal"("idempotency_key");

-- CreateIndex
CREATE INDEX "ix_journal_date" ON "journal"("value_date");

-- CreateIndex
CREATE INDEX "ix_journal_gd1" ON "journal"("global_dimension_1_id");

-- CreateIndex
CREATE INDEX "ix_journal_gd2" ON "journal"("global_dimension_2_id");

-- CreateIndex
CREATE INDEX "ix_jl_account" ON "journal_line"("gl_account_id");

-- CreateIndex
CREATE INDEX "ix_jl_gd1" ON "journal_line"("global_dimension_1_id");

-- CreateIndex
CREATE INDEX "ix_jl_gd2" ON "journal_line"("global_dimension_2_id");

-- CreateIndex
CREATE INDEX "ix_jl_journal" ON "journal_line"("journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_code_key" ON "location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_code_key" ON "maintenance"("code");

-- CreateIndex
CREATE INDEX "ix_outbox_created" ON "message_outbox"("created_at");

-- CreateIndex
CREATE INDEX "ix_outbox_due" ON "message_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "ix_outbox_reference" ON "message_outbox"("reference_type", "reference_no");

-- CreateIndex
CREATE INDEX "ix_no_series_line_series" ON "no_series_line"("series_code");

-- CreateIndex
CREATE INDEX "ix_no_series_setup_series" ON "no_series_setup"("series_code");

-- CreateIndex
CREATE INDEX "ix_notification_user" ON "notification"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_code_key" ON "payment_method"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_code_key" ON "payment_terms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_voucher_header_no_key" ON "payment_voucher_header"("no");

-- CreateIndex
CREATE INDEX "ix_pvh_cheque_no" ON "payment_voucher_header"("cheque_no");

-- CreateIndex
CREATE INDEX "ix_pvh_created_by" ON "payment_voucher_header"("created_by");

-- CreateIndex
CREATE INDEX "ix_pvh_status" ON "payment_voucher_header"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_voucher_line_header_lineno_key" ON "payment_voucher_line"("payment_voucher_header_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_nssf_tier_tier_no_key" ON "payroll_nssf_tier"("tier_no");

-- CreateIndex
CREATE UNIQUE INDEX "ux_p9_employee_period" ON "payroll_p9_line"("employee_id", "payroll_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_period_name_key" ON "payroll_period"("period_name");

-- CreateIndex
CREATE INDEX "ix_ppt_employee_code" ON "payroll_period_transaction"("employee_id", "transaction_code");

-- CreateIndex
CREATE INDEX "ix_ppt_period_code" ON "payroll_period_transaction"("payroll_period_id", "transaction_code");

-- CreateIndex
CREATE INDEX "ix_ppt_period_employee" ON "payroll_period_transaction"("payroll_period_id", "employee_id", "group_order", "sub_group_order", "payslip_order");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_posting_group_code_key" ON "payroll_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_transaction_code_code_key" ON "payroll_transaction_code"("code");

-- CreateIndex
CREATE INDEX "permission_set_line_role_id_idx" ON "permission_set_line"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_set_line_role_id_object_type_object_name_key" ON "permission_set_line"("role_id", "object_type", "object_name");

-- CreateIndex
CREATE INDEX "ix_pc_created_by" ON "petty_cash"("created_by");

-- CreateIndex
CREATE INDEX "ix_pc_employee" ON "petty_cash"("employee_id");

-- CreateIndex
CREATE INDEX "ix_pc_status" ON "petty_cash"("status");

-- CreateIndex
CREATE INDEX "ix_pcl_petty_cash" ON "petty_cash_line"("petty_cash_no");

-- CreateIndex
CREATE UNIQUE INDEX "posted_payment_voucher_no_key" ON "posted_payment_voucher"("no");

-- CreateIndex
CREATE INDEX "ix_ppv_pv_no" ON "posted_payment_voucher"("pv_no");

-- CreateIndex
CREATE INDEX "ix_ppvl_doc" ON "posted_payment_voucher_line"("posted_payment_voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "posted_purchase_document_no_key" ON "posted_purchase_document"("no");

-- CreateIndex
CREATE INDEX "ix_ppd_type" ON "posted_purchase_document"("document_type");

-- CreateIndex
CREATE INDEX "ix_ppd_vendor" ON "posted_purchase_document"("vendor_id");

-- CreateIndex
CREATE INDEX "ix_ppl_doc" ON "posted_purchase_line"("posted_purchase_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "posted_receipt_no_key" ON "posted_receipt"("no");

-- CreateIndex
CREATE INDEX "ix_posted_receipt_receipt_no" ON "posted_receipt"("receipt_no");

-- CreateIndex
CREATE INDEX "ix_prl_doc" ON "posted_receipt_line"("posted_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "posted_sales_document_no_key" ON "posted_sales_document"("no");

-- CreateIndex
CREATE INDEX "ix_psd_customer" ON "posted_sales_document"("customer_id");

-- CreateIndex
CREATE INDEX "ix_psd_type" ON "posted_sales_document"("document_type");

-- CreateIndex
CREATE INDEX "ix_psl_doc" ON "posted_sales_line"("posted_sales_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_posting_group_code_key" ON "product_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "profile_code_key" ON "profile"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_header_no_key" ON "purchase_header"("no");

-- CreateIndex
CREATE INDEX "ix_purchase_header_created_by" ON "purchase_header"("created_by");

-- CreateIndex
CREATE INDEX "ix_purchase_header_requisition" ON "purchase_header"("requisition_no");

-- CreateIndex
CREATE INDEX "ix_purchase_header_type_status" ON "purchase_header"("document_type", "status");

-- CreateIndex
CREATE INDEX "ix_purchase_header_vendor" ON "purchase_header"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_line_header_lineno_key" ON "purchase_line"("purchase_header_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_header_no_key" ON "receipt_header"("no");

-- CreateIndex
CREATE INDEX "ix_receipt_header_created_by" ON "receipt_header"("created_by");

-- CreateIndex
CREATE INDEX "ix_receipt_header_status" ON "receipt_header"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_line_header_lineno_key" ON "receipt_line"("receipt_header_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_header_no_key" ON "reminder_header"("no");

-- CreateIndex
CREATE INDEX "ix_rh_customer" ON "reminder_header"("customer_id");

-- CreateIndex
CREATE INDEX "ix_rh_status" ON "reminder_header"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_level_terms_level_key" ON "reminder_level"("reminder_terms_code", "level_no");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_line_header_lineno_key" ON "reminder_line"("reminder_header_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_terms_code_key" ON "reminder_terms"("code");

-- CreateIndex
CREATE INDEX "ix_rq_created_by" ON "requisition"("created_by");

-- CreateIndex
CREATE INDEX "ix_rq_employee" ON "requisition"("employee_id");

-- CreateIndex
CREATE INDEX "ix_rq_type_status" ON "requisition"("requisition_type", "status");

-- CreateIndex
CREATE INDEX "ix_rql_requisition" ON "requisition_line"("requisition_no");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_header_no_key" ON "sales_header"("no");

-- CreateIndex
CREATE INDEX "ix_sales_header_created_by" ON "sales_header"("created_by");

-- CreateIndex
CREATE INDEX "ix_sales_header_customer" ON "sales_header"("customer_id");

-- CreateIndex
CREATE INDEX "ix_sales_header_type_status" ON "sales_header"("document_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_line_header_lineno_key" ON "sales_line"("sales_header_id", "line_no");

-- CreateIndex
CREATE INDEX "ix_session_expires" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "ix_session_user" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "ix_scl_created_by" ON "staff_claim"("created_by");

-- CreateIndex
CREATE INDEX "ix_scl_employee" ON "staff_claim"("employee_id");

-- CreateIndex
CREATE INDEX "ix_scl_status" ON "staff_claim"("status");

-- CreateIndex
CREATE INDEX "ix_scll_claim" ON "staff_claim_line"("claim_no");

-- CreateIndex
CREATE UNIQUE INDEX "stockkeeping_unit_item_id_location_id_key" ON "stockkeeping_unit"("item_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_sub_county_code" ON "sub_county"("code");

-- CreateIndex
CREATE INDEX "ix_sub_county_county" ON "sub_county"("county_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_county_county_id_name_key" ON "sub_county"("county_id", "name");

-- CreateIndex
CREATE INDEX "ix_ts_bank_account" ON "cashier_setup"("bank_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_setup_user_username_setup_type_key" ON "cashier_setup"("user_username", "setup_type");

-- CreateIndex
CREATE INDEX "ix_till_closing_status" ON "till_closing"("status");

-- CreateIndex
CREATE INDEX "ix_till_closing_till_date" ON "till_closing"("till_bank_account_id", "closing_date");

-- CreateIndex
CREATE UNIQUE INDEX "ux_till_closing_posted" ON "till_closing"("till_bank_account_id", "closing_date") WHERE (posted = true);

-- CreateIndex
CREATE UNIQUE INDEX "unit_of_measure_code_key" ON "unit_of_measure"("code");

-- CreateIndex
CREATE INDEX "user_permission_line_user_id_idx" ON "user_permission_line"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_line_user_id_object_type_object_name_key" ON "user_permission_line"("user_id", "object_type", "object_name");

-- CreateIndex
CREATE INDEX "user_permission_set_user_id_idx" ON "user_permission_set"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_set_user_id_role_id_key" ON "user_permission_set"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "ix_user_profile_user" ON "user_profile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profile_user_id_profile_id_key" ON "user_profile"("user_id", "profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "vat_business_posting_group_code_key" ON "vat_business_posting_group"("code");

-- CreateIndex
CREATE INDEX "ix_vat_entry_document_no" ON "vat_entry"("document_no");

-- CreateIndex
CREATE INDEX "ix_vat_entry_pay_to" ON "vat_entry"("bill_to_pay_to_no");

-- CreateIndex
CREATE INDEX "ix_vat_entry_posting_date" ON "vat_entry"("posting_date");

-- CreateIndex
CREATE INDEX "ix_vat_entry_tax_type_closed" ON "vat_entry"("tax_type", "closed");

-- CreateIndex
CREATE UNIQUE INDEX "vat_posting_setup_key" ON "vat_posting_setup"("vat_bus_posting_group_code", "vat_prod_posting_group_code");

-- CreateIndex
CREATE UNIQUE INDEX "vat_product_posting_group_code_key" ON "vat_product_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_no_key" ON "vendor"("no");

-- CreateIndex
CREATE INDEX "ix_vendor_posting_group" ON "vendor"("vendor_posting_group_code");

-- CreateIndex
CREATE INDEX "ix_vle_document_no" ON "vendor_ledger_entry"("document_no");

-- CreateIndex
CREATE INDEX "ix_vle_due_date" ON "vendor_ledger_entry"("due_date");

-- CreateIndex
CREATE INDEX "ix_vle_vendor_open" ON "vendor_ledger_entry"("vendor_id", "open");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_posting_group_code_key" ON "vendor_posting_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "wht_certificate_no_key" ON "wht_certificate"("no");

-- CreateIndex
CREATE INDEX "ix_wht_certificate_pv" ON "wht_certificate"("payment_voucher_no");

-- CreateIndex
CREATE INDEX "ix_wht_certificate_vendor" ON "wht_certificate"("vendor_id");

-- CreateIndex
CREATE INDEX "ix_wht_certificate_line_doc" ON "wht_certificate_line"("wht_certificate_id");

-- CreateIndex
CREATE INDEX "ix_workflow_doctype" ON "workflow"("document_type", "enabled");

-- CreateIndex
CREATE INDEX "ix_condition_workflow" ON "workflow_condition"("workflow_id");

-- CreateIndex
CREATE INDEX "ix_step_workflow" ON "workflow_step"("workflow_id", "step_no");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_table_relation_document_type_key" ON "workflow_table_relation"("document_type");

-- CreateIndex
CREATE UNIQUE INDEX "ux_table_relation_field" ON "workflow_table_relation_field"("table_relation_id", "field_name");

-- CreateIndex
CREATE INDEX "ix_task_assignee" ON "workflow_task"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "ix_task_document" ON "workflow_task"("document_type", "entity_id");

-- CreateIndex
CREATE INDEX "ix_task_status" ON "workflow_task"("status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_user_group_name_key" ON "workflow_user_group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_group_member" ON "workflow_user_group_member"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "etims_invoice_invc_no_key" ON "etims_invoice"("invc_no");

-- CreateIndex
CREATE INDEX "etims_invoice_status_next_attempt_at_idx" ON "etims_invoice"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "etims_invoice_source_type_source_no_rcpt_type_key" ON "etims_invoice"("source_type", "source_no", "rcpt_type");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_request_checkout_request_id_key" ON "mpesa_request"("checkout_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "mpesa_request_mpesa_receipt_key" ON "mpesa_request"("mpesa_receipt");

-- CreateIndex
CREATE INDEX "mpesa_request_customer_id_idx" ON "mpesa_request"("customer_id");

-- CreateIndex
CREATE INDEX "mpesa_request_status_idx" ON "mpesa_request"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_no_key" ON "stock_count"("no");

-- CreateIndex
CREATE INDEX "stock_count_line_stock_count_id_idx" ON "stock_count_line"("stock_count_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_line_stock_count_id_item_id_key" ON "stock_count_line"("stock_count_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_department_code_key" ON "clinic_department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_category_code_key" ON "service_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_item_code_key" ON "service_item"("code");

-- CreateIndex
CREATE INDEX "service_item_kind_idx" ON "service_item"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_code_key" ON "price_list"("code");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_line_price_list_code_service_item_id_key" ON "price_list_line"("price_list_code", "service_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_scheme_code_key" ON "insurance_scheme"("code");

-- CreateIndex
CREATE UNIQUE INDEX "patient_mrn_key" ON "patient"("mrn");

-- CreateIndex
CREATE INDEX "patient_last_name_first_name_idx" ON "patient"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "patient_phone_idx" ON "patient"("phone");

-- CreateIndex
CREATE INDEX "patient_cover_patient_id_idx" ON "patient_cover"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_no_key" ON "appointment"("no");

-- CreateIndex
CREATE INDEX "appointment_appointment_date_idx" ON "appointment"("appointment_date");

-- CreateIndex
CREATE INDEX "appointment_patient_id_idx" ON "appointment"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_no_key" ON "visit"("no");

-- CreateIndex
CREATE INDEX "visit_visit_date_idx" ON "visit"("visit_date");

-- CreateIndex
CREATE INDEX "visit_patient_id_idx" ON "visit"("patient_id");

-- CreateIndex
CREATE INDEX "visit_status_idx" ON "visit"("status");

-- CreateIndex
CREATE INDEX "visit_queue_department_code_status_idx" ON "visit_queue"("department_code", "status");

-- CreateIndex
CREATE INDEX "visit_queue_visit_id_idx" ON "visit_queue"("visit_id");

-- CreateIndex
CREATE INDEX "triage_visit_id_idx" ON "triage"("visit_id");

-- CreateIndex
CREATE INDEX "consultation_visit_id_idx" ON "consultation"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "icd_code_code_key" ON "icd_code"("code");

-- CreateIndex
CREATE INDEX "diagnosis_visit_id_idx" ON "diagnosis"("visit_id");

-- CreateIndex
CREATE INDEX "patient_charge_visit_id_idx" ON "patient_charge"("visit_id");

-- CreateIndex
CREATE INDEX "patient_charge_bill_id_idx" ON "patient_charge"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_bill_no_key" ON "patient_bill"("no");

-- CreateIndex
CREATE UNIQUE INDEX "patient_bill_visit_id_key" ON "patient_bill"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_payment_no_key" ON "patient_payment"("no");

-- CreateIndex
CREATE INDEX "patient_payment_visit_id_idx" ON "patient_payment"("visit_id");

-- CreateIndex
CREATE INDEX "patient_payment_payment_date_idx" ON "patient_payment"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "preauthorization_no_key" ON "preauthorization"("no");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_no_key" ON "insurance_claim"("no");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_bill_id_key" ON "insurance_claim"("bill_id");

-- CreateIndex
CREATE INDEX "insurance_claim_status_idx" ON "insurance_claim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lab_test_code_key" ON "lab_test"("code");

-- CreateIndex
CREATE INDEX "lab_test_parameter_lab_test_id_idx" ON "lab_test_parameter"("lab_test_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_order_no_key" ON "lab_order"("no");

-- CreateIndex
CREATE INDEX "lab_order_visit_id_idx" ON "lab_order"("visit_id");

-- CreateIndex
CREATE INDEX "lab_order_status_idx" ON "lab_order"("status");

-- CreateIndex
CREATE INDEX "lab_order_test_lab_order_id_idx" ON "lab_order_test"("lab_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_result_order_test_id_parameter_id_key" ON "lab_result"("order_test_id", "parameter_id");

-- CreateIndex
CREATE UNIQUE INDEX "imaging_order_no_key" ON "imaging_order"("no");

-- CreateIndex
CREATE INDEX "imaging_order_status_idx" ON "imaging_order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "drug_item_id_key" ON "drug"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_no_key" ON "prescription"("no");

-- CreateIndex
CREATE INDEX "prescription_status_idx" ON "prescription"("status");

-- CreateIndex
CREATE INDEX "prescription_visit_id_idx" ON "prescription"("visit_id");

-- CreateIndex
CREATE INDEX "prescription_line_prescription_id_idx" ON "prescription_line"("prescription_id");

-- CreateIndex
CREATE INDEX "dental_chart_entry_patient_id_status_idx" ON "dental_chart_entry"("patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dental_treatment_plan_no_key" ON "dental_treatment_plan"("no");

-- CreateIndex
CREATE INDEX "dental_treatment_plan_patient_id_idx" ON "dental_treatment_plan"("patient_id");

-- CreateIndex
CREATE INDEX "dental_treatment_item_plan_id_idx" ON "dental_treatment_item"("plan_id");

-- CreateIndex
CREATE INDEX "procedure_record_status_idx" ON "procedure_record"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_document_no_key" ON "clinical_document"("no");

-- AddForeignKey
ALTER TABLE "acc_schedule_line" ADD CONSTRAINT "acc_schedule_line_acc_schedule_name_id_fkey" FOREIGN KEY ("acc_schedule_name_id") REFERENCES "acc_schedule_name"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_active_profile_id_fkey" FOREIGN KEY ("active_profile_id") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approval_user_setup" ADD CONSTRAINT "approval_user_setup_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approval_user_setup" ADD CONSTRAINT "approval_user_setup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_acc_posting_group" ADD CONSTRAINT "bapg_gl_account_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_account_ledger_entry" ADD CONSTRAINT "bank_account_ledger_entry_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_account_ledger_entry" ADD CONSTRAINT "bank_account_ledger_entry_bank_reconciliation_id_fkey" FOREIGN KEY ("bank_reconciliation_id") REFERENCES "bank_reconciliation"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_account_ledger_entry" ADD CONSTRAINT "bank_account_ledger_entry_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_account_ledger_entry" ADD CONSTRAINT "bank_account_ledger_entry_journal_line_id_fkey" FOREIGN KEY ("journal_line_id") REFERENCES "journal_line"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_rec_line" ADD CONSTRAINT "brl_bale_fkey" FOREIGN KEY ("bank_account_ledger_entry_id") REFERENCES "bank_account_ledger_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_rec_line" ADD CONSTRAINT "brl_gl_account_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_rec_line" ADD CONSTRAINT "brl_recon_fkey" FOREIGN KEY ("bank_reconciliation_id") REFERENCES "bank_reconciliation"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "bank_reconciliation" ADD CONSTRAINT "bank_reconciliation_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_denomination_line" ADD CONSTRAINT "cash_denomination_line_denomination_id_fkey" FOREIGN KEY ("denomination_id") REFERENCES "denomination"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_management_setup" ADD CONSTRAINT "cms_bank_charges_fkey" FOREIGN KEY ("bank_charges_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_management_setup" ADD CONSTRAINT "cms_bank_interest_fkey" FOREIGN KEY ("bank_interest_income_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_management_setup" ADD CONSTRAINT "cms_default_bank_fkey" FOREIGN KEY ("default_receipt_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "column_layout" ADD CONSTRAINT "column_layout_column_layout_name_id_fkey" FOREIGN KEY ("column_layout_name_id") REFERENCES "column_layout_name"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job" ADD CONSTRAINT "cj_gd1_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job" ADD CONSTRAINT "cj_gd2_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job" ADD CONSTRAINT "cj_job_grade_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "hr_job_grade"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job" ADD CONSTRAINT "cj_reports_to_fkey" FOREIGN KEY ("reports_to_job_id") REFERENCES "company_job"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job_qualification" ADD CONSTRAINT "cjl_job_fkey" FOREIGN KEY ("job_id") REFERENCES "company_job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job_requirement" ADD CONSTRAINT "cjq_job_fkey" FOREIGN KEY ("job_id") REFERENCES "company_job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "company_job_responsibility" ADD CONSTRAINT "cjr_job_fkey" FOREIGN KEY ("job_id") REFERENCES "company_job"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "config_package_field" ADD CONSTRAINT "config_package_field_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "config_package"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_realized_gains_fkey" FOREIGN KEY ("realized_gains_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_realized_losses_fkey" FOREIGN KEY ("realized_losses_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_residual_gains_fkey" FOREIGN KEY ("residual_gains_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_residual_losses_fkey" FOREIGN KEY ("residual_losses_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_unrealized_gains_fkey" FOREIGN KEY ("unrealized_gains_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency" ADD CONSTRAINT "currency_unrealized_losses_fkey" FOREIGN KEY ("unrealized_losses_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "currency_exchange_rate" ADD CONSTRAINT "cer_currency_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cust_ledger_entry" ADD CONSTRAINT "cle_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_additional_fee_fkey" FOREIGN KEY ("additional_fee_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_invoice_rounding_fkey" FOREIGN KEY ("invoice_rounding_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_pmt_disc_credit_fkey" FOREIGN KEY ("payment_disc_credit_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_pmt_disc_debit_fkey" FOREIGN KEY ("payment_disc_debit_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_receivables_fkey" FOREIGN KEY ("receivables_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_posting_group" ADD CONSTRAINT "cpg_service_charge_fkey" FOREIGN KEY ("service_charge_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detailed_cust_ledger_entry" ADD CONSTRAINT "dcle_cle_fkey" FOREIGN KEY ("cust_ledger_entry_id") REFERENCES "cust_ledger_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "detailed_vendor_ledger_entry" ADD CONSTRAINT "dvle_vle_fkey" FOREIGN KEY ("vendor_ledger_entry_id") REFERENCES "vendor_ledger_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_company_job_fkey" FOREIGN KEY ("company_job_id") REFERENCES "company_job"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_contract_type_fkey" FOREIGN KEY ("contract_type_id") REFERENCES "hr_employment_contract_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_county_fkey" FOREIGN KEY ("county_id") REFERENCES "county"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_global_dimension_1_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_global_dimension_2_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_job_grade_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "hr_job_grade"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_manager_fkey" FOREIGN KEY ("manager_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_overview_manager_fkey" FOREIGN KEY ("overview_manager_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_posting_group_fkey" FOREIGN KEY ("posting_group_id") REFERENCES "payroll_posting_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_salary_scale_fkey" FOREIGN KEY ("salary_scale_id") REFERENCES "hr_salary_scale"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_sub_county_fkey" FOREIGN KEY ("sub_county_id") REFERENCES "sub_county"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_termination_reason_fkey" FOREIGN KEY ("termination_reason_id") REFERENCES "hr_termination_reason"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_bank_account" ADD CONSTRAINT "employee_bank_account_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_beneficiary" ADD CONSTRAINT "employee_beneficiary_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_grade_fkey" FOREIGN KEY ("grade_id") REFERENCES "hr_job_grade"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract" ADD CONSTRAINT "employee_contract_type_fkey" FOREIGN KEY ("contract_type_id") REFERENCES "hr_employment_contract_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract_change" ADD CONSTRAINT "employee_contract_change_contract_type_fkey" FOREIGN KEY ("contract_type_id") REFERENCES "hr_employment_contract_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract_change" ADD CONSTRAINT "employee_contract_change_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_contract_change" ADD CONSTRAINT "employee_contract_change_grade_fkey" FOREIGN KEY ("proposed_grade_id") REFERENCES "hr_job_grade"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_dependant" ADD CONSTRAINT "employee_dependant_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_bank_account" ADD CONSTRAINT "employee_edit_bank_account_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_beneficiary" ADD CONSTRAINT "employee_edit_beneficiary_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_dependant" ADD CONSTRAINT "employee_edit_dependant_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_emergency_contact" ADD CONSTRAINT "employee_edit_emergency_contact_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_next_of_kin" ADD CONSTRAINT "employee_edit_next_of_kin_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_professional_body" ADD CONSTRAINT "employee_edit_professional_body_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_request" ADD CONSTRAINT "employee_edit_request_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_edit_work_history" ADD CONSTRAINT "employee_edit_work_history_edit_fkey" FOREIGN KEY ("edit_no") REFERENCES "employee_edit_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_emergency_contact" ADD CONSTRAINT "employee_emergency_contact_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_reason_fkey" FOREIGN KEY ("termination_reason_id") REFERENCES "hr_termination_reason"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_exit_clearance_line" ADD CONSTRAINT "employee_exit_clearance_line_exit_fkey" FOREIGN KEY ("exit_no") REFERENCES "employee_exit"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_exit_clearance_line" ADD CONSTRAINT "employee_exit_clearance_line_section_fkey" FOREIGN KEY ("section_id") REFERENCES "hr_clearance_section"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_exit_final_due_line" ADD CONSTRAINT "employee_exit_final_due_line_exit_fkey" FOREIGN KEY ("exit_no") REFERENCES "employee_exit"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_ledger_entry" ADD CONSTRAINT "ele_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_ledger_entry" ADD CONSTRAINT "ele_journal_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_next_of_kin" ADD CONSTRAINT "employee_next_of_kin_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_payroll_transaction" ADD CONSTRAINT "ept_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_payroll_transaction" ADD CONSTRAINT "ept_payroll_period_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_period"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_payroll_transaction" ADD CONSTRAINT "ept_transaction_code_fkey" FOREIGN KEY ("transaction_code_id") REFERENCES "payroll_transaction_code"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_professional_body" ADD CONSTRAINT "employee_professional_body_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_work_history" ADD CONSTRAINT "employee_work_history_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "external_bank_branch" ADD CONSTRAINT "ebb_bank_fkey" FOREIGN KEY ("bank_code") REFERENCES "external_bank"("code") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_depreciation_book" ADD CONSTRAINT "fa_depreciation_book_depreciation_book_code_fkey" FOREIGN KEY ("depreciation_book_code") REFERENCES "depreciation_book"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_depreciation_book" ADD CONSTRAINT "fa_depreciation_book_fa_posting_group_code_fkey" FOREIGN KEY ("fa_posting_group_code") REFERENCES "fa_posting_group"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_depreciation_book" ADD CONSTRAINT "fa_depreciation_book_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_journal_line" ADD CONSTRAINT "fa_journal_line_balancing_gl_account_id_fkey" FOREIGN KEY ("balancing_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_journal_line" ADD CONSTRAINT "fa_journal_line_depreciation_book_code_fkey" FOREIGN KEY ("depreciation_book_code") REFERENCES "depreciation_book"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_journal_line" ADD CONSTRAINT "fa_journal_line_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_ledger_entry" ADD CONSTRAINT "fa_ledger_entry_depreciation_book_code_fkey" FOREIGN KEY ("depreciation_book_code") REFERENCES "depreciation_book"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_ledger_entry" ADD CONSTRAINT "fa_ledger_entry_fa_journal_line_id_fkey" FOREIGN KEY ("fa_journal_line_id") REFERENCES "fa_journal_line"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_ledger_entry" ADD CONSTRAINT "fa_ledger_entry_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_accum_depreciation_account_id_fkey" FOREIGN KEY ("accum_depreciation_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_acquisition_cost_account_id_fkey" FOREIGN KEY ("acquisition_cost_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_appreciation_account_id_fkey" FOREIGN KEY ("appreciation_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_depreciation_expense_account_id_fkey" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_gains_acc_on_disposal_id_fkey" FOREIGN KEY ("gains_acc_on_disposal_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_losses_acc_on_disposal_id_fkey" FOREIGN KEY ("losses_acc_on_disposal_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_maintenance_expense_account_id_fkey" FOREIGN KEY ("maintenance_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fa_posting_group" ADD CONSTRAINT "fa_posting_group_write_down_expense_account_id_fkey" FOREIGN KEY ("write_down_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_global_dimension_1_id_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_global_dimension_2_id_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_office_transfer" ADD CONSTRAINT "cash_office_transfer_destination_bank_account_id_fkey" FOREIGN KEY ("destination_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_office_transfer" ADD CONSTRAINT "cash_office_transfer_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_office_transfer" ADD CONSTRAINT "cash_office_transfer_source_bank_account_id_fkey" FOREIGN KEY ("source_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gl_budget_entry" ADD CONSTRAINT "gl_budget_entry_budget_name_fkey" FOREIGN KEY ("budget_name") REFERENCES "gl_budget_name"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_budget_entry" ADD CONSTRAINT "gl_budget_entry_gd1_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gl_budget_entry" ADD CONSTRAINT "gl_budget_entry_gd2_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gl_budget_entry" ADD CONSTRAINT "gl_budget_entry_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_adjustment" ADD CONSTRAINT "hladj_leave_type_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "hr_leave_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_adjustment_line" ADD CONSTRAINT "hladjl_adjustment_fkey" FOREIGN KEY ("adjustment_no") REFERENCES "hr_leave_adjustment"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_adjustment_line" ADD CONSTRAINT "hladjl_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_application" ADD CONSTRAINT "hla_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_application" ADD CONSTRAINT "hla_leave_calendar_fkey" FOREIGN KEY ("leave_calendar_id") REFERENCES "hr_leave_calendar"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_application" ADD CONSTRAINT "hla_leave_type_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "hr_leave_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_application" ADD CONSTRAINT "hla_reliever_fkey" FOREIGN KEY ("reliever_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_days_to_accrue" ADD CONSTRAINT "hldta_job_grade_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "hr_job_grade"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_days_to_accrue" ADD CONSTRAINT "hldta_leave_type_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "hr_leave_type"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_ledger_entry" ADD CONSTRAINT "hlle_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_ledger_entry" ADD CONSTRAINT "hlle_leave_calendar_fkey" FOREIGN KEY ("leave_calendar_id") REFERENCES "hr_leave_calendar"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_ledger_entry" ADD CONSTRAINT "hlle_leave_type_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "hr_leave_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_plan" ADD CONSTRAINT "hlp_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_plan" ADD CONSTRAINT "hlp_leave_calendar_fkey" FOREIGN KEY ("leave_calendar_id") REFERENCES "hr_leave_calendar"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_plan_line" ADD CONSTRAINT "hlpl_plan_fkey" FOREIGN KEY ("plan_no") REFERENCES "hr_leave_plan"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_recall" ADD CONSTRAINT "hlr_application_fkey" FOREIGN KEY ("application_no") REFERENCES "hr_leave_application"("no") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_leave_recall" ADD CONSTRAINT "hlr_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_salary_scale" ADD CONSTRAINT "hr_salary_scale_job_grade_fkey" FOREIGN KEY ("job_grade_id") REFERENCES "hr_job_grade"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_salary_scale_benefit" ADD CONSTRAINT "hr_salary_scale_benefit_code_fkey" FOREIGN KEY ("transaction_code_id") REFERENCES "payroll_transaction_code"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "hr_salary_scale_benefit" ADD CONSTRAINT "hr_salary_scale_benefit_scale_fkey" FOREIGN KEY ("salary_scale_id") REFERENCES "hr_salary_scale"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request" ADD CONSTRAINT "imr_claim_bank_fkey" FOREIGN KEY ("claim_paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request" ADD CONSTRAINT "imr_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request" ADD CONSTRAINT "imr_paying_bank_fkey" FOREIGN KEY ("paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request" ADD CONSTRAINT "imr_purpose_fkey" FOREIGN KEY ("purpose_code") REFERENCES "imprest_purpose"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request" ADD CONSTRAINT "imr_receiving_bank_fkey" FOREIGN KEY ("receiving_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request_line" ADD CONSTRAINT "imrl_gl_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "imprest_request_line" ADD CONSTRAINT "imrl_request_fkey" FOREIGN KEY ("request_no") REFERENCES "imprest_request"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_posting_group" ADD CONSTRAINT "inventory_posting_group_inventory_gl_account_id_fkey" FOREIGN KEY ("inventory_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_base_unit_of_measure_id_fkey" FOREIGN KEY ("base_unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_inventory_posting_group_id_fkey" FOREIGN KEY ("inventory_posting_group_id") REFERENCES "inventory_posting_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_product_posting_group_id_fkey" FOREIGN KEY ("product_posting_group_id") REFERENCES "product_posting_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_purch_unit_of_measure_id_fkey" FOREIGN KEY ("purch_unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_sales_unit_of_measure_id_fkey" FOREIGN KEY ("sales_unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_application_entry" ADD CONSTRAINT "item_application_entry_inbound_entry_id_fkey" FOREIGN KEY ("inbound_entry_id") REFERENCES "item_ledger_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_application_entry" ADD CONSTRAINT "item_application_entry_outbound_entry_id_fkey" FOREIGN KEY ("outbound_entry_id") REFERENCES "item_ledger_entry"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_journal_line" ADD CONSTRAINT "item_journal_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_journal_line" ADD CONSTRAINT "item_journal_line_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_journal_line" ADD CONSTRAINT "item_journal_line_unit_of_measure_id_fkey" FOREIGN KEY ("unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_ledger_entry" ADD CONSTRAINT "item_ledger_entry_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_ledger_entry" ADD CONSTRAINT "item_ledger_entry_item_journal_line_id_fkey" FOREIGN KEY ("item_journal_line_id") REFERENCES "item_journal_line"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_ledger_entry" ADD CONSTRAINT "item_ledger_entry_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_unit_of_measure" ADD CONSTRAINT "item_unit_of_measure_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_unit_of_measure" ADD CONSTRAINT "item_unit_of_measure_unit_of_measure_id_fkey" FOREIGN KEY ("unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_global_dimension_1_id_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_global_dimension_2_id_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_global_dimension_1_id_fkey" FOREIGN KEY ("global_dimension_1_id") REFERENCES "global_dimension_1_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_global_dimension_2_id_fkey" FOREIGN KEY ("global_dimension_2_id") REFERENCES "global_dimension_2_value"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "no_series_line" ADD CONSTRAINT "no_series_line_series_code_fkey" FOREIGN KEY ("series_code") REFERENCES "no_series"("code") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "no_series_setup" ADD CONSTRAINT "no_series_setup_series_code_fkey" FOREIGN KEY ("series_code") REFERENCES "no_series"("code") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_imprest_control_account_id_fkey" FOREIGN KEY ("imprest_control_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_till_overage_account_id_fkey" FOREIGN KEY ("till_overage_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_till_shortage_account_id_fkey" FOREIGN KEY ("till_shortage_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_voucher_header" ADD CONSTRAINT "payment_voucher_header_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_voucher_header" ADD CONSTRAINT "pvh_bank_fkey" FOREIGN KEY ("paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_voucher_line" ADD CONSTRAINT "pvl_header_fkey" FOREIGN KEY ("payment_voucher_header_id") REFERENCES "payment_voucher_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_p9_line" ADD CONSTRAINT "p9_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_p9_line" ADD CONSTRAINT "p9_payroll_period_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_period"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_period_transaction" ADD CONSTRAINT "ppt_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_period_transaction" ADD CONSTRAINT "ppt_gl_account_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_period_transaction" ADD CONSTRAINT "ppt_payroll_period_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_period"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_period_transaction" ADD CONSTRAINT "ppt_transaction_code_fkey" FOREIGN KEY ("transaction_code_id") REFERENCES "payroll_transaction_code"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_hl_employee_payable_fkey" FOREIGN KEY ("housing_levy_employee_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_hl_employer_expense_fkey" FOREIGN KEY ("housing_levy_employer_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_hl_employer_payable_fkey" FOREIGN KEY ("housing_levy_employer_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_net_pay_payable_fkey" FOREIGN KEY ("net_pay_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_nssf_employee_payable_fkey" FOREIGN KEY ("nssf_employee_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_nssf_employer_expense_fkey" FOREIGN KEY ("nssf_employer_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_nssf_employer_payable_fkey" FOREIGN KEY ("nssf_employer_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_paye_payable_fkey" FOREIGN KEY ("paye_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_salary_expense_fkey" FOREIGN KEY ("salary_expense_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_posting_group" ADD CONSTRAINT "ppg_shif_payable_fkey" FOREIGN KEY ("shif_payable_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_transaction_code" ADD CONSTRAINT "ptc_employer_gl_account_fkey" FOREIGN KEY ("employer_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payroll_transaction_code" ADD CONSTRAINT "ptc_gl_account_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "permission_set_line" ADD CONSTRAINT "permission_set_line_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash" ADD CONSTRAINT "pc_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "petty_cash" ADD CONSTRAINT "pc_paying_bank_fkey" FOREIGN KEY ("paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "petty_cash_line" ADD CONSTRAINT "pcl_gl_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "petty_cash_line" ADD CONSTRAINT "pcl_petty_cash_fkey" FOREIGN KEY ("petty_cash_no") REFERENCES "petty_cash"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_payment_voucher" ADD CONSTRAINT "ppv_bank_fkey" FOREIGN KEY ("paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_payment_voucher_line" ADD CONSTRAINT "ppvl_doc_fkey" FOREIGN KEY ("posted_payment_voucher_id") REFERENCES "posted_payment_voucher"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_purchase_document" ADD CONSTRAINT "ppd_vendor_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_purchase_line" ADD CONSTRAINT "ppl_doc_fkey" FOREIGN KEY ("posted_purchase_document_id") REFERENCES "posted_purchase_document"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_receipt" ADD CONSTRAINT "posted_receipt_bank_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_receipt_line" ADD CONSTRAINT "prl_doc_fkey" FOREIGN KEY ("posted_receipt_id") REFERENCES "posted_receipt"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_sales_document" ADD CONSTRAINT "psd_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "posted_sales_line" ADD CONSTRAINT "psl_doc_fkey" FOREIGN KEY ("posted_sales_document_id") REFERENCES "posted_sales_document"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_posting_group" ADD CONSTRAINT "ppg_cogs_gl_fkey" FOREIGN KEY ("cogs_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_posting_group" ADD CONSTRAINT "ppg_sales_gl_fkey" FOREIGN KEY ("sales_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_posting_group" ADD CONSTRAINT "product_posting_group_adjustment_gl_account_id_fkey" FOREIGN KEY ("adjustment_gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_header" ADD CONSTRAINT "purchase_header_vendor_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_header_fkey" FOREIGN KEY ("purchase_header_id") REFERENCES "purchase_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "receipt_header" ADD CONSTRAINT "receipt_header_bank_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "receipt_header" ADD CONSTRAINT "receipt_header_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "receipt_line" ADD CONSTRAINT "receipt_line_header_fkey" FOREIGN KEY ("receipt_header_id") REFERENCES "receipt_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reminder_header" ADD CONSTRAINT "rh_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reminder_level" ADD CONSTRAINT "reminder_level_terms_fkey" FOREIGN KEY ("reminder_terms_code") REFERENCES "reminder_terms"("code") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reminder_line" ADD CONSTRAINT "rl_header_fkey" FOREIGN KEY ("reminder_header_id") REFERENCES "reminder_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition" ADD CONSTRAINT "rq_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition" ADD CONSTRAINT "rq_location_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition" ADD CONSTRAINT "rq_supplier_fkey" FOREIGN KEY ("supplier_id") REFERENCES "vendor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line" ADD CONSTRAINT "rql_gl_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line" ADD CONSTRAINT "rql_item_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line" ADD CONSTRAINT "rql_location_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line" ADD CONSTRAINT "rql_requisition_fkey" FOREIGN KEY ("requisition_no") REFERENCES "requisition"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "requisition_line" ADD CONSTRAINT "rql_uom_fkey" FOREIGN KEY ("unit_of_measure_id") REFERENCES "unit_of_measure"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales_header" ADD CONSTRAINT "sales_header_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sales_line" ADD CONSTRAINT "sales_line_header_fkey" FOREIGN KEY ("sales_header_id") REFERENCES "sales_header"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_claim" ADD CONSTRAINT "scl_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_claim" ADD CONSTRAINT "scl_paying_bank_fkey" FOREIGN KEY ("paying_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_claim_line" ADD CONSTRAINT "scll_claim_fkey" FOREIGN KEY ("claim_no") REFERENCES "staff_claim"("no") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff_claim_line" ADD CONSTRAINT "scll_gl_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stockkeeping_unit" ADD CONSTRAINT "stockkeeping_unit_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stockkeeping_unit" ADD CONSTRAINT "stockkeeping_unit_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sub_county" ADD CONSTRAINT "sub_county_county_id_fkey" FOREIGN KEY ("county_id") REFERENCES "county"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cashier_setup" ADD CONSTRAINT "cashier_setup_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "till_closing" ADD CONSTRAINT "till_closing_handover_journal_id_fkey" FOREIGN KEY ("handover_journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "till_closing" ADD CONSTRAINT "till_closing_till_bank_account_id_fkey" FOREIGN KEY ("till_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "till_closing" ADD CONSTRAINT "till_closing_treasury_bank_account_id_fkey" FOREIGN KEY ("treasury_bank_account_id") REFERENCES "bank_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "till_closing" ADD CONSTRAINT "till_closing_variance_journal_id_fkey" FOREIGN KEY ("variance_journal_id") REFERENCES "journal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_permission_line" ADD CONSTRAINT "user_permission_line_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_permission_set" ADD CONSTRAINT "user_permission_set_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_permission_set" ADD CONSTRAINT "user_permission_set_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vat_posting_setup" ADD CONSTRAINT "vps_tax_account_fkey" FOREIGN KEY ("tax_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_ledger_entry" ADD CONSTRAINT "vle_vendor_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_posting_group" ADD CONSTRAINT "vpg_invoice_rounding_fkey" FOREIGN KEY ("invoice_rounding_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_posting_group" ADD CONSTRAINT "vpg_payables_fkey" FOREIGN KEY ("payables_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_posting_group" ADD CONSTRAINT "vpg_pmt_disc_credit_fkey" FOREIGN KEY ("payment_disc_credit_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_posting_group" ADD CONSTRAINT "vpg_pmt_disc_debit_fkey" FOREIGN KEY ("payment_disc_debit_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vendor_posting_group" ADD CONSTRAINT "vpg_service_charge_fkey" FOREIGN KEY ("service_charge_account_id") REFERENCES "gl_account"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wht_certificate" ADD CONSTRAINT "wht_cert_vendor_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wht_certificate_line" ADD CONSTRAINT "wht_cert_line_doc_fkey" FOREIGN KEY ("wht_certificate_id") REFERENCES "wht_certificate"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_condition" ADD CONSTRAINT "workflow_condition_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_table_relation_field" ADD CONSTRAINT "workflow_table_relation_field_table_relation_id_fkey" FOREIGN KEY ("table_relation_id") REFERENCES "workflow_table_relation"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_task" ADD CONSTRAINT "workflow_task_assigned_to_group_id_fkey" FOREIGN KEY ("assigned_to_group_id") REFERENCES "workflow_user_group"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_task" ADD CONSTRAINT "workflow_task_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_task" ADD CONSTRAINT "workflow_task_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "workflow_step"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_user_group_member" ADD CONSTRAINT "workflow_user_group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "workflow_user_group"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_user_group_member" ADD CONSTRAINT "workflow_user_group_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_count"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- ============================================================================================
-- Integrity rules Prisma's schema language cannot express — the ERP core's first, then the
-- clinic's own. Future migrations must be generated --from-migrations, never by diffing a live
-- database (which would drop every key below).
-- ============================================================================================

-- Singletons.
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_id_check" CHECK (id = 1);
ALTER TABLE "theme" ADD CONSTRAINT "theme_id_check" CHECK (id = 1);
ALTER TABLE "clinic_setup" ADD CONSTRAINT "clinic_setup_id_check" CHECK (id = 1);
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_background_check" CHECK (background_overlay BETWEEN 0 AND 85 AND background_in_app IN (0, 1));

-- Double entry: a journal line is a debit or a credit, never negative and never both.
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_check" CHECK ((debit >= 0) AND (credit >= 0));
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_check1" CHECK (NOT ((debit > 0) AND (credit > 0)));

-- Statutory identifiers are unique / well-formed when present.
CREATE UNIQUE INDEX "ux_company_code" ON "company" (lower(code));
ALTER TABLE "customer" ADD CONSTRAINT "customer_kra_pin_check" CHECK (kra_pin IS NULL OR kra_pin ~ '^[AP][0-9]{9}[A-Z]$');

-- Sales VAT rates.
ALTER TABLE "sales_line" ADD CONSTRAINT "sales_line_vat_check" CHECK (vat_pct >= 0 AND vat_pct <= 100);
ALTER TABLE "posted_sales_line" ADD CONSTRAINT "posted_sales_line_vat_check" CHECK (vat_pct >= 0 AND vat_pct <= 100);

-- Inventory: stock moves in whole base units; a transfer names a different, existing store.
ALTER TABLE "purchase_line" ADD CONSTRAINT "purchase_line_qty_per_uom_check" CHECK (qty_per_unit_of_measure >= 1);
ALTER TABLE "item_unit_of_measure" ADD CONSTRAINT "item_unit_of_measure_qty_check" CHECK (qty_per_unit_of_measure >= 1);
ALTER TABLE "item_journal_line" ADD CONSTRAINT "item_journal_line_new_location_fkey" FOREIGN KEY ("new_location_id") REFERENCES "location"("id");
ALTER TABLE "item_journal_line" ADD CONSTRAINT "item_journal_line_transfer_check"
  CHECK ((entry_type = 'Transfer') = (new_location_id IS NOT NULL) AND (new_location_id IS NULL OR new_location_id <> location_id));
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_location_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id");
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_journal_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id");
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_status_check" CHECK (status IN ('OPEN', 'POSTED', 'CANCELLED'));
-- Segregation of duties: whoever opened (and counted) the count is not who posts it.
ALTER TABLE "stock_count" ADD CONSTRAINT "stock_count_maker_checker_check" CHECK (posted_by IS NULL OR posted_by <> created_by);
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_item_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id");
ALTER TABLE "stock_count_line" ADD CONSTRAINT "stock_count_line_qty_check" CHECK (qty_calculated >= 0 AND (qty_counted IS NULL OR qty_counted >= 0));

-- Integrations: M-Pesa prompts and KRA eTIMS signatures.
ALTER TABLE "mpesa_request" ADD CONSTRAINT "mpesa_request_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id");
ALTER TABLE "mpesa_request" ADD CONSTRAINT "mpesa_request_amount_check" CHECK (amount > 0 AND (paid_amount IS NULL OR paid_amount > 0));
ALTER TABLE "mpesa_request" ADD CONSTRAINT "mpesa_request_status_check"
  CHECK (status IN ('PENDING', 'POSTED', 'PAID_UNPOSTED', 'REVIEW', 'FAILED', 'CANCELLED', 'TIMEOUT'));
ALTER TABLE "mpesa_request" ADD CONSTRAINT "mpesa_request_environment_check" CHECK (environment IN ('sandbox', 'production'));
ALTER TABLE "etims_invoice" ADD CONSTRAINT "etims_invoice_check" CHECK (
  source_type IN ('SALES_INVOICE', 'SALES_CREDIT_MEMO') AND rcpt_type IN ('S', 'R') AND status IN ('PENDING', 'SIGNED', 'FAILED')
  AND total >= 0 AND tax_total >= 0 AND attempts >= 0
);

-- The audit trail: append-only.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- ------------------------------------------------------------------ clinic: references
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_patient_ar_fkey" FOREIGN KEY ("patient_receivable_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_unbilled_fkey" FOREIGN KEY ("unbilled_claims_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_discount_fkey" FOREIGN KEY ("discount_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_writeoff_fkey" FOREIGN KEY ("claim_writeoff_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_revenue_fkey" FOREIGN KEY ("default_revenue_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_cash_fkey" FOREIGN KEY ("cash_bank_account_id") REFERENCES "bank_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_mpesa_fkey" FOREIGN KEY ("mpesa_bank_account_id") REFERENCES "bank_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_card_fkey" FOREIGN KEY ("card_bank_account_id") REFERENCES "bank_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_bank_fkey" FOREIGN KEY ("bank_transfer_account_id") REFERENCES "bank_account"("id");
ALTER TABLE "clinic_setup" ADD CONSTRAINT "cs_pharmacy_fkey" FOREIGN KEY ("pharmacy_location_id") REFERENCES "location"("id");
ALTER TABLE "service_category" ADD CONSTRAINT "service_category_revenue_fkey" FOREIGN KEY ("revenue_account_id") REFERENCES "gl_account"("id");
ALTER TABLE "service_item" ADD CONSTRAINT "service_item_category_fkey" FOREIGN KEY ("category_code") REFERENCES "service_category"("code");
ALTER TABLE "service_item" ADD CONSTRAINT "service_item_department_fkey" FOREIGN KEY ("department_code") REFERENCES "clinic_department"("code");
ALTER TABLE "service_item" ADD CONSTRAINT "service_item_item_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id");
ALTER TABLE "price_list_line" ADD CONSTRAINT "pll_list_fkey" FOREIGN KEY ("price_list_code") REFERENCES "price_list"("code") ON DELETE CASCADE;
ALTER TABLE "price_list_line" ADD CONSTRAINT "pll_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id") ON DELETE CASCADE;
ALTER TABLE "insurance_scheme" ADD CONSTRAINT "scheme_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id");
ALTER TABLE "insurance_scheme" ADD CONSTRAINT "scheme_price_list_fkey" FOREIGN KEY ("price_list_code") REFERENCES "price_list"("code");
ALTER TABLE "patient_cover" ADD CONSTRAINT "cover_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "patient_cover" ADD CONSTRAINT "cover_scheme_fkey" FOREIGN KEY ("scheme_id") REFERENCES "insurance_scheme"("id");
ALTER TABLE "appointment" ADD CONSTRAINT "appt_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "appointment" ADD CONSTRAINT "appt_department_fkey" FOREIGN KEY ("department_code") REFERENCES "clinic_department"("code");
ALTER TABLE "appointment" ADD CONSTRAINT "appt_clinician_fkey" FOREIGN KEY ("clinician_user_id") REFERENCES "app_user"("id");
ALTER TABLE "visit" ADD CONSTRAINT "visit_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "visit" ADD CONSTRAINT "visit_department_fkey" FOREIGN KEY ("department_code") REFERENCES "clinic_department"("code");
ALTER TABLE "visit" ADD CONSTRAINT "visit_clinician_fkey" FOREIGN KEY ("clinician_user_id") REFERENCES "app_user"("id");
ALTER TABLE "visit" ADD CONSTRAINT "visit_scheme_fkey" FOREIGN KEY ("scheme_id") REFERENCES "insurance_scheme"("id");
ALTER TABLE "visit" ADD CONSTRAINT "visit_cover_fkey" FOREIGN KEY ("cover_id") REFERENCES "patient_cover"("id");
ALTER TABLE "visit" ADD CONSTRAINT "visit_price_list_fkey" FOREIGN KEY ("price_list_code") REFERENCES "price_list"("code");
ALTER TABLE "visit" ADD CONSTRAINT "visit_appointment_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id");
ALTER TABLE "appointment" ADD CONSTRAINT "appt_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "visit_queue" ADD CONSTRAINT "vq_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "visit_queue" ADD CONSTRAINT "vq_department_fkey" FOREIGN KEY ("department_code") REFERENCES "clinic_department"("code");
ALTER TABLE "triage" ADD CONSTRAINT "triage_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "consultation" ADD CONSTRAINT "consult_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "consultation" ADD CONSTRAINT "consult_clinician_fkey" FOREIGN KEY ("clinician_user_id") REFERENCES "app_user"("id");
ALTER TABLE "diagnosis" ADD CONSTRAINT "dx_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "patient_charge" ADD CONSTRAINT "charge_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "patient_charge" ADD CONSTRAINT "charge_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "patient_charge" ADD CONSTRAINT "charge_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "patient_charge" ADD CONSTRAINT "charge_bill_fkey" FOREIGN KEY ("bill_id") REFERENCES "patient_bill"("id");
ALTER TABLE "patient_bill" ADD CONSTRAINT "bill_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "patient_bill" ADD CONSTRAINT "bill_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "patient_bill" ADD CONSTRAINT "bill_scheme_fkey" FOREIGN KEY ("scheme_id") REFERENCES "insurance_scheme"("id");
ALTER TABLE "patient_bill" ADD CONSTRAINT "bill_journal_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id");
ALTER TABLE "patient_payment" ADD CONSTRAINT "pay_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "patient_payment" ADD CONSTRAINT "pay_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "patient_payment" ADD CONSTRAINT "pay_bank_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id");
ALTER TABLE "patient_payment" ADD CONSTRAINT "pay_journal_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id");
ALTER TABLE "patient_payment" ADD CONSTRAINT "pay_void_journal_fkey" FOREIGN KEY ("void_journal_id") REFERENCES "journal"("id");
ALTER TABLE "preauthorization" ADD CONSTRAINT "preauth_scheme_fkey" FOREIGN KEY ("scheme_id") REFERENCES "insurance_scheme"("id");
ALTER TABLE "preauthorization" ADD CONSTRAINT "preauth_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "preauthorization" ADD CONSTRAINT "preauth_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "insurance_claim" ADD CONSTRAINT "claim_scheme_fkey" FOREIGN KEY ("scheme_id") REFERENCES "insurance_scheme"("id");
ALTER TABLE "insurance_claim" ADD CONSTRAINT "claim_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "insurance_claim" ADD CONSTRAINT "claim_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "insurance_claim" ADD CONSTRAINT "claim_bill_fkey" FOREIGN KEY ("bill_id") REFERENCES "patient_bill"("id");
ALTER TABLE "insurance_claim" ADD CONSTRAINT "claim_writeoff_fkey" FOREIGN KEY ("writeoff_journal_id") REFERENCES "journal"("id");
ALTER TABLE "lab_test" ADD CONSTRAINT "lab_test_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "lab_test_parameter" ADD CONSTRAINT "ltp_test_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "lab_test"("id") ON DELETE CASCADE;
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "lab_order" ADD CONSTRAINT "lab_order_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "lab_order_test" ADD CONSTRAINT "lot_order_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "lab_order"("id");
ALTER TABLE "lab_order_test" ADD CONSTRAINT "lot_test_fkey" FOREIGN KEY ("lab_test_id") REFERENCES "lab_test"("id");
ALTER TABLE "lab_order_test" ADD CONSTRAINT "lot_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "patient_charge"("id");
ALTER TABLE "lab_result" ADD CONSTRAINT "lr_order_test_fkey" FOREIGN KEY ("order_test_id") REFERENCES "lab_order_test"("id");
ALTER TABLE "lab_result" ADD CONSTRAINT "lr_parameter_fkey" FOREIGN KEY ("parameter_id") REFERENCES "lab_test_parameter"("id");
ALTER TABLE "imaging_order" ADD CONSTRAINT "img_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "imaging_order" ADD CONSTRAINT "img_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "imaging_order" ADD CONSTRAINT "img_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "imaging_order" ADD CONSTRAINT "img_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "patient_charge"("id");
ALTER TABLE "drug" ADD CONSTRAINT "drug_item_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id");
ALTER TABLE "drug" ADD CONSTRAINT "drug_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "prescription" ADD CONSTRAINT "rx_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "prescription" ADD CONSTRAINT "rx_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "prescription_line" ADD CONSTRAINT "rxl_rx_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("id");
ALTER TABLE "prescription_line" ADD CONSTRAINT "rxl_drug_fkey" FOREIGN KEY ("drug_id") REFERENCES "drug"("id");
ALTER TABLE "prescription_line" ADD CONSTRAINT "rxl_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "patient_charge"("id");
ALTER TABLE "dental_chart_entry" ADD CONSTRAINT "dce_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "dental_chart_entry" ADD CONSTRAINT "dce_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "dental_treatment_plan" ADD CONSTRAINT "dtp_patient_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("id");
ALTER TABLE "dental_treatment_item" ADD CONSTRAINT "dti_plan_fkey" FOREIGN KEY ("plan_id") REFERENCES "dental_treatment_plan"("id");
ALTER TABLE "dental_treatment_item" ADD CONSTRAINT "dti_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "dental_treatment_item" ADD CONSTRAINT "dti_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "patient_charge"("id");
ALTER TABLE "procedure_record" ADD CONSTRAINT "proc_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");
ALTER TABLE "procedure_record" ADD CONSTRAINT "proc_service_fkey" FOREIGN KEY ("service_item_id") REFERENCES "service_item"("id");
ALTER TABLE "procedure_record" ADD CONSTRAINT "proc_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "patient_charge"("id");
ALTER TABLE "clinical_document" ADD CONSTRAINT "doc_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id");

-- ------------------------------------------------------------------ clinic: rules
ALTER TABLE "patient" ADD CONSTRAINT "patient_check" CHECK (
  sex IN ('MALE', 'FEMALE', 'INTERSEX') AND status IN ('ACTIVE', 'INACTIVE', 'DECEASED')
  AND (date_of_birth IS NULL OR date_of_birth ~ '^\d{4}-\d{2}-\d{2}$')
);
-- One default cover per patient.
CREATE UNIQUE INDEX "ux_patient_default_cover" ON "patient_cover" (patient_id) WHERE is_default = 1 AND status = 'ACTIVE';
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_check" CHECK (
  status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  AND start_time ~ '^\d{2}:\d{2}$' AND duration_mins BETWEEN 5 AND 480
);
ALTER TABLE "visit" ADD CONSTRAINT "visit_check" CHECK (
  status IN ('OPEN', 'CLOSED', 'CANCELLED') AND payment_mode IN ('CASH', 'INSURANCE', 'CORPORATE')
  AND priority IN ('ROUTINE', 'URGENT', 'EMERGENCY')
  AND (payment_mode = 'CASH' OR scheme_id IS NOT NULL)
);
-- A patient has at most one open visit.
CREATE UNIQUE INDEX "ux_visit_open_patient" ON "visit" (patient_id) WHERE status = 'OPEN';
ALTER TABLE "visit_queue" ADD CONSTRAINT "visit_queue_check" CHECK (status IN ('WAITING', 'CALLED', 'SERVING', 'DONE', 'SKIPPED'));
ALTER TABLE "triage" ADD CONSTRAINT "triage_check" CHECK (
  (temperature_c IS NULL OR temperature_c BETWEEN 25 AND 45) AND (pulse IS NULL OR pulse BETWEEN 20 AND 250)
  AND (resp_rate IS NULL OR resp_rate BETWEEN 4 AND 80) AND (bp_systolic IS NULL OR bp_systolic BETWEEN 40 AND 300)
  AND (bp_diastolic IS NULL OR bp_diastolic BETWEEN 20 AND 200) AND (spo2 IS NULL OR spo2 BETWEEN 30 AND 100)
  AND (weight_kg IS NULL OR weight_kg BETWEEN 0.3 AND 400) AND (height_cm IS NULL OR height_cm BETWEEN 20 AND 260)
  AND (pain_score IS NULL OR pain_score BETWEEN 0 AND 10) AND acuity IN ('RED', 'ORANGE', 'YELLOW', 'GREEN')
);
ALTER TABLE "patient_charge" ADD CONSTRAINT "patient_charge_check" CHECK (
  quantity > 0 AND unit_price >= 0 AND amount >= 0 AND discount >= 0 AND discount <= amount
  AND scheme_amount >= 0 AND scheme_amount <= amount - discount AND status IN ('OPEN', 'BILLED', 'CANCELLED')
);
ALTER TABLE "patient_bill" ADD CONSTRAINT "patient_bill_check" CHECK (
  gross >= 0 AND discount >= 0 AND net = gross - discount AND patient_share >= 0 AND scheme_share >= 0
  AND patient_share + scheme_share = net AND status IN ('OPEN', 'FINAL', 'CANCELLED')
);
ALTER TABLE "patient_payment" ADD CONSTRAINT "patient_payment_check" CHECK (
  amount > 0 AND method IN ('CASH', 'MPESA', 'CARD', 'BANK') AND status IN ('POSTED', 'VOIDED')
  AND (method <> 'MPESA' OR reference IS NOT NULL)
);
-- An M-Pesa code can be receipted once.
CREATE UNIQUE INDEX "ux_patient_payment_mpesa_ref" ON "patient_payment" (upper(reference)) WHERE method = 'MPESA' AND status = 'POSTED';
ALTER TABLE "insurance_claim" ADD CONSTRAINT "insurance_claim_check" CHECK (
  amount >= 0 AND (approved_amount IS NULL OR (approved_amount >= 0 AND approved_amount <= amount))
  AND status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL', 'REJECTED')
);
ALTER TABLE "lab_order_test" ADD CONSTRAINT "lab_order_test_check" CHECK (
  status IN ('ORDERED', 'COLLECTED', 'RESULTED', 'VERIFIED', 'CANCELLED')
);
-- Segregation of duties: whoever entered a result is not who verifies it.
ALTER TABLE "lab_order_test" ADD CONSTRAINT "lab_order_test_maker_checker_check" CHECK (verified_by IS NULL OR verified_by <> resulted_by);
CREATE UNIQUE INDEX "ux_lab_specimen_no" ON "lab_order_test" (specimen_no) WHERE specimen_no IS NOT NULL;
ALTER TABLE "prescription_line" ADD CONSTRAINT "prescription_line_check" CHECK (
  quantity > 0 AND dispensed_qty >= 0 AND dispensed_qty <= quantity AND duration_days BETWEEN 1 AND 365
);
ALTER TABLE "dental_chart_entry" ADD CONSTRAINT "dental_chart_tooth_check" CHECK (tooth ~ '^([1-4][1-8]|[5-8][1-5])$' AND status IN ('CURRENT', 'SUPERSEDED'));
ALTER TABLE "dental_treatment_item" ADD CONSTRAINT "dental_treatment_item_check" CHECK (
  fee >= 0 AND phase BETWEEN 1 AND 5 AND status IN ('PLANNED', 'COMPLETED', 'CANCELLED')
  AND (tooth IS NULL OR tooth ~ '^([1-4][1-8]|[5-8][1-5])$')
);

-- Cashier receipts are money: never deleted, and the amount, method and account never change.
-- Voiding is the only permitted change (it posts its own reversing journal).
CREATE OR REPLACE FUNCTION patient_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient_payment rows cannot be deleted — void the receipt instead';
  END IF;
  IF NEW.amount <> OLD.amount OR NEW.method <> OLD.method OR NEW.bank_account_id <> OLD.bank_account_id
     OR NEW.patient_id <> OLD.patient_id OR NEW.payment_date <> OLD.payment_date
     OR (OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED') THEN
    RAISE EXCEPTION 'cashier receipts are immutable — void and re-issue instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER patient_payment_immutable BEFORE UPDATE OR DELETE ON "patient_payment"
  FOR EACH ROW EXECUTE FUNCTION patient_payment_guard();

-- A verified lab result is part of the medical record: no edits, no deletes.
CREATE OR REPLACE FUNCTION lab_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lab_order_test t WHERE t.id = OLD.order_test_id AND t.status = 'VERIFIED') THEN
    RAISE EXCEPTION 'a verified lab result cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lab_result_locked BEFORE UPDATE OR DELETE ON "lab_result"
  FOR EACH ROW EXECUTE FUNCTION lab_result_guard();
