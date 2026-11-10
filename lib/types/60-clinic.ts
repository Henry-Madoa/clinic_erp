/* Outpatient clinic — split out of lib/types.ts; import from '@/lib/types', never from here directly. */
import type { Cents, IsoDate, IsoDateTime } from '../types.ts';

export type Sex = 'MALE' | 'FEMALE' | 'INTERSEX';
export type VisitPaymentMode = 'CASH' | 'INSURANCE' | 'CORPORATE';
export type VisitStage = 'TRIAGE' | 'CONSULTATION' | 'INVESTIGATION' | 'PHARMACY' | 'CASHIER' | 'COMPLETED' | 'CANCELLED';
type VisitStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type VisitPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY';
type QueueStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'DONE' | 'SKIPPED';
export type Acuity = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN';
export type AppointmentStatus = 'BOOKED' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ChargeSource = 'CONSULTATION' | 'REGISTRATION' | 'LAB' | 'IMAGING' | 'PHARMACY' | 'DENTAL' | 'PROCEDURE' | 'NURSING' | 'MANUAL';
export type ServiceKind = 'CONSULTATION' | 'REGISTRATION' | 'LAB' | 'IMAGING' | 'DENTAL' | 'PROCEDURE' | 'NURSING' | 'DRUG' | 'CONSUMABLE' | 'OTHER';
export type PatientPaymentMethod = 'CASH' | 'MPESA' | 'CARD' | 'BANK';
type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PARTIAL' | 'REJECTED';
type LabTestStatus = 'ORDERED' | 'COLLECTED' | 'RESULTED' | 'VERIFIED' | 'CANCELLED';

export interface ClinicSetup {
  id: number;
  patient_receivable_account_id: number | null;
  unbilled_claims_account_id: number | null;
  discount_account_id: number | null;
  claim_writeoff_account_id: number | null;
  default_revenue_account_id: number | null;
  cash_bank_account_id: number | null;
  mpesa_bank_account_id: number | null;
  card_bank_account_id: number | null;
  bank_transfer_account_id: number | null;
  pharmacy_location_id: number | null;
  default_price_list_code: string;
  scheme_customer_posting_group: string;
  registration_service_code: string | null;
  pay_before_service: number;
  lab_requires_verification: number;
  review_window_days: number;
  reminder_hours: number;
  day_start: string;
  day_end: string;
  slot_minutes: number;
  updated_at: string | null;
  updated_by: string | null;
}

export interface ClinicDepartment {
  id: number;
  code: string;
  name: string;
  kind: 'CLINIC' | 'SERVICE';
  queue_prefix: string;
  room: string | null;
  colour: string;
  consultation_service_code: string | null;
  status: string;
  sort_order: number;
}

export interface ServiceCategory { id: number; code: string; name: string; revenue_account_id: number | null; sort_order: number; revenue_account_code?: string | null }

export interface ServiceItem {
  id: number;
  code: string;
  name: string;
  category_code: string;
  kind: ServiceKind;
  department_code: string | null;
  base_price: Cents;
  item_id: number | null;
  vat_prod_posting_group_code: string;
  requires_preauth: number;
  description: string | null;
  status: string;
  category_name?: string;
}

export interface PriceList { id: number; code: string; name: string; kind: string; markup_pct: number; status: string; lines?: number }

export interface InsuranceScheme {
  id: number;
  code: string;
  name: string;
  payer_type: 'INSURER' | 'SHA' | 'CORPORATE' | 'GOVERNMENT';
  customer_id: number | null;
  price_list_code: string | null;
  copay_type: 'NONE' | 'FIXED' | 'PERCENT';
  copay_value: number;
  preauth_threshold: Cents;
  visit_limit: Cents;
  claim_submission_days: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
  customer_no?: string | null;
  customer_balance?: Cents;
}

export interface Patient {
  id: number;
  mrn: string;
  title: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  sex: Sex;
  date_of_birth: IsoDate | null;
  dob_estimated: number;
  marital_status: string | null;
  id_type: string;
  id_number_last4: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  county_code: string | null;
  occupation: string | null;
  blood_group: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  alerts: string | null;
  next_of_kin_name: string | null;
  next_of_kin_relation: string | null;
  next_of_kin_phone: string | null;
  photo_url: string | null;
  status: string;
  sms_consent: number;
  first_visit_date: IsoDate | null;
  last_visit_date: IsoDate | null;
  notes: string | null;
  created_at: IsoDateTime;
  created_by: string;
}

export interface PatientListRow extends Patient {
  full_name: string;
  age: number | null;
  visits: number;
  open_visit_no: string | null;
  default_scheme: string | null;
}

export interface PatientCover {
  id: number;
  patient_id: number;
  scheme_id: number;
  member_no: string;
  principal_name: string | null;
  relationship: string;
  valid_from: IsoDate | null;
  valid_to: IsoDate | null;
  is_default: number;
  status: string;
  scheme_name?: string;
  scheme_code?: string;
  payer_type?: string;
}

export interface Appointment {
  id: number;
  no: string;
  patient_id: number;
  department_code: string;
  clinician_user_id: number | null;
  appointment_date: IsoDate;
  start_time: string;
  duration_mins: number;
  appointment_type: string;
  reason: string | null;
  status: AppointmentStatus;
  source: string;
  visit_id: number | null;
  reminder_sent_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  created_by: string;
  patient_name?: string;
  mrn?: string;
  phone?: string | null;
  department_name?: string;
  department_colour?: string;
  clinician_name?: string | null;
  visit_no?: string | null;
}

interface Visit {
  id: number;
  no: string;
  patient_id: number;
  visit_date: IsoDate;
  check_in_at: IsoDateTime;
  visit_type: string;
  department_code: string;
  clinician_user_id: number | null;
  payment_mode: VisitPaymentMode;
  scheme_id: number | null;
  cover_id: number | null;
  member_no: string | null;
  price_list_code: string;
  priority: VisitPriority;
  stage: VisitStage;
  status: VisitStatus;
  chief_complaint: string | null;
  appointment_id: number | null;
  referral_source: string | null;
  outcome: string | null;
  follow_up_date: IsoDate | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  created_by: string;
}

export interface VisitView extends Visit {
  mrn: string;
  patient_name: string;
  sex: Sex;
  date_of_birth: IsoDate | null;
  age: number | null;
  phone: string | null;
  allergies: string | null;
  alerts: string | null;
  chronic_conditions: string | null;
  photo_url: string | null;
  department_name: string;
  department_colour: string;
  clinician_name: string | null;
  scheme_name: string | null;
  scheme_code: string | null;
  acuity: Acuity | null;
  charges_total: Cents;
  paid_total: Cents;
  queue_no: string | null;
  bill_no: string | null;
  bill_status: string | null;
  waiting_mins: number;
}

export interface QueueEntry {
  id: number;
  visit_id: number;
  department_code: string;
  queue_no: string;
  status: QueueStatus;
  priority: VisitPriority;
  room: string | null;
  entered_at: string;
  called_at: string | null;
  served_by: string | null;
  completed_at: string | null;
  visit_no: string;
  mrn: string;
  patient_name: string;
  sex: Sex;
  age: number | null;
  acuity: Acuity | null;
  payment_mode: VisitPaymentMode;
  scheme_name: string | null;
  stage: VisitStage;
  waiting_mins: number;
  alerts: string | null;
}

export interface Triage {
  id: number;
  visit_id: number;
  temperature_c: number | null;
  pulse: number | null;
  resp_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  spo2: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  muac_cm: number | null;
  blood_sugar: number | null;
  pain_score: number | null;
  acuity: Acuity;
  notes: string | null;
  recorded_at: string;
  recorded_by: string;
}

export interface Consultation {
  id: number;
  visit_id: number;
  department_code: string;
  clinician_user_id: number;
  clinician_name: string;
  chief_complaint: string | null;
  history: string | null;
  past_history: string | null;
  family_social_history: string | null;
  review_of_systems: string | null;
  examination: string | null;
  assessment: string | null;
  plan: string | null;
  status: 'OPEN' | 'COMPLETED';
  started_at: string;
  completed_at: string | null;
}

export interface Diagnosis { id: number; visit_id: number; icd_code: string | null; description: string; diagnosis_type: string; created_at: string; created_by: string }

export interface PatientCharge {
  id: number;
  visit_id: number;
  patient_id: number;
  service_item_id: number | null;
  source_type: ChargeSource;
  source_id: number | null;
  department_code: string | null;
  description: string;
  quantity: number;
  unit_price: Cents;
  amount: Cents;
  discount: Cents;
  scheme_amount: Cents;
  status: 'OPEN' | 'BILLED' | 'CANCELLED';
  bill_id: number | null;
  charged_at: string;
  charged_by: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  service_code?: string | null;
  category_code?: string | null;
}

export interface PatientBill {
  id: number;
  no: string;
  visit_id: number;
  patient_id: number;
  payment_mode: VisitPaymentMode;
  scheme_id: number | null;
  bill_date: IsoDate;
  gross: Cents;
  discount: Cents;
  net: Cents;
  patient_share: Cents;
  scheme_share: Cents;
  status: 'OPEN' | 'FINAL' | 'CANCELLED';
  finalised_at: string | null;
  finalised_by: string | null;
  journal_id: number | null;
  created_at: string;
  created_by: string;
}

export interface PatientPayment {
  id: number;
  no: string;
  patient_id: number;
  visit_id: number | null;
  payment_date: IsoDate;
  method: PatientPaymentMethod;
  reference: string | null;
  amount: Cents;
  bank_account_id: number;
  status: 'POSTED' | 'VOIDED';
  journal_id: number | null;
  received_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  mrn?: string;
  patient_name?: string;
  visit_no?: string | null;
  bank_account_name?: string;
}

/** What a visit owes and has paid, from its charges and receipts. */
export interface VisitAccount {
  gross: Cents;
  discount: Cents;
  net: Cents;
  schemeShare: Cents;
  patientShare: Cents;
  paid: Cents;
  balance: Cents;
}

export interface InsuranceClaim {
  id: number;
  no: string;
  scheme_id: number;
  patient_id: number;
  visit_id: number;
  bill_id: number;
  member_no: string | null;
  preauth_no: string | null;
  claim_date: IsoDate;
  amount: Cents;
  approved_amount: Cents | null;
  status: ClaimStatus;
  batch_ref: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  rejection_reason: string | null;
  invoice_no: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  scheme_name?: string;
  scheme_code?: string;
  patient_name?: string;
  mrn?: string;
  visit_no?: string;
  bill_no?: string;
  visit_date?: string;
  paid_amount?: Cents;
  age_days?: number;
}

export interface Preauthorization {
  id: number;
  no: string;
  scheme_id: number;
  patient_id: number;
  visit_id: number | null;
  requested_amount: Cents;
  approved_amount: Cents | null;
  description: string;
  status: 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'EXPIRED';
  auth_code: string | null;
  requested_at: string;
  requested_by: string;
  decided_at: string | null;
  decided_by: string | null;
  notes: string | null;
  scheme_name?: string;
  patient_name?: string;
  mrn?: string;
  visit_no?: string | null;
}

export interface LabTest {
  id: number;
  code: string;
  name: string;
  section: string;
  specimen_type: string;
  container: string | null;
  method: string | null;
  tat_minutes: number;
  service_item_id: number | null;
  status: string;
  sort_order: number;
  price?: Cents;
  parameters?: number;
}

export interface LabTestParameter {
  id: number;
  lab_test_id: number;
  sort_order: number;
  name: string;
  unit: string | null;
  result_type: 'NUMERIC' | 'TEXT' | 'OPTION';
  options: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_low_female: number | null;
  ref_high_female: number | null;
  critical_low: number | null;
  critical_high: number | null;
  ref_text: string | null;
}

export interface LabOrderTestView {
  id: number;
  lab_order_id: number;
  lab_test_id: number;
  status: LabTestStatus;
  specimen_no: string | null;
  collected_at: string | null;
  collected_by: string | null;
  resulted_at: string | null;
  resulted_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  comment: string | null;
  test_code: string;
  test_name: string;
  section: string;
  specimen_type: string;
  tat_minutes: number;
  order_no: string;
  priority: string;
  ordered_at: string;
  ordered_by: string;
  clinical_notes: string | null;
  visit_no: string;
  mrn: string;
  patient_name: string;
  sex: Sex;
  age: number | null;
  abnormal: number;
  critical: number;
}

export interface LabResultRow {
  id: number;
  order_test_id: number;
  parameter_id: number;
  value_text: string | null;
  value_num: number | null;
  flag: string;
}

export interface ImagingOrder {
  id: number;
  no: string;
  visit_id: number;
  patient_id: number;
  service_item_id: number;
  modality: string;
  body_part: string | null;
  clinical_notes: string | null;
  priority: string;
  status: 'ORDERED' | 'PERFORMED' | 'REPORTED' | 'CANCELLED';
  charge_id: number | null;
  ordered_at: string;
  ordered_by: string;
  performed_at: string | null;
  performed_by: string | null;
  findings: string | null;
  impression: string | null;
  image_url: string | null;
  reported_at: string | null;
  reported_by: string | null;
  service_name?: string;
  visit_no?: string;
  mrn?: string;
  patient_name?: string;
  sex?: Sex;
  age?: number | null;
}

export interface Drug {
  id: number;
  item_id: number;
  service_item_id: number | null;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  dosage_form: string;
  default_route: string;
  default_frequency: string | null;
  controlled: number;
  status: string;
  item_no?: string;
  stock?: number;
  price?: Cents;
  unit_cost?: Cents;
  reorder_point?: number;
}

export interface Prescription {
  id: number;
  no: string;
  visit_id: number;
  patient_id: number;
  status: 'PENDING' | 'PARTIAL' | 'DISPENSED' | 'CANCELLED';
  notes: string | null;
  prescribed_at: string;
  prescribed_by: string;
  visit_no?: string;
  mrn?: string;
  patient_name?: string;
  allergies?: string | null;
  sex?: Sex;
  age?: number | null;
  payment_mode?: VisitPaymentMode;
  scheme_name?: string | null;
  lines?: number;
}

export interface PrescriptionLine {
  id: number;
  prescription_id: number;
  drug_id: number;
  dose: string;
  route: string;
  frequency: string;
  duration_days: number;
  quantity: number;
  instructions: string | null;
  dispensed_qty: number;
  status: 'PENDING' | 'DISPENSED' | 'CANCELLED' | 'OUT_OF_STOCK';
  charge_id: number | null;
  dispensed_at: string | null;
  dispensed_by: string | null;
  generic_name?: string;
  brand_name?: string | null;
  strength?: string | null;
  dosage_form?: string;
  stock?: number;
  price?: Cents;
}

export interface DentalChartEntry {
  id: number;
  patient_id: number;
  visit_id: number | null;
  tooth: string;
  surfaces: string | null;
  condition: string;
  notes: string | null;
  status: 'CURRENT' | 'SUPERSEDED';
  recorded_at: string;
  recorded_by: string;
}

export interface DentalTreatmentPlan {
  id: number;
  no: string;
  patient_id: number;
  visit_id: number | null;
  title: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  accepted_at: string | null;
  created_at: string;
  created_by: string;
  total?: Cents;
  completed_total?: Cents;
  items?: number;
  done?: number;
  patient_name?: string;
  mrn?: string;
}

export interface DentalTreatmentItem {
  id: number;
  plan_id: number;
  tooth: string | null;
  surfaces: string | null;
  service_item_id: number;
  description: string;
  fee: Cents;
  phase: number;
  status: 'PLANNED' | 'COMPLETED' | 'CANCELLED';
  completed_visit_id: number | null;
  completed_at: string | null;
  completed_by: string | null;
  charge_id: number | null;
  notes: string | null;
  service_code?: string;
}

export interface ProcedureRecord {
  id: number;
  visit_id: number;
  patient_id: number;
  service_item_id: number;
  description: string;
  quantity: number;
  status: 'ORDERED' | 'DONE' | 'CANCELLED';
  charge_id: number | null;
  notes: string | null;
  ordered_at: string;
  ordered_by: string;
  performed_at: string | null;
  performed_by: string | null;
  visit_no?: string;
  mrn?: string;
  patient_name?: string;
}

export interface ClinicalDocument {
  id: number;
  no: string;
  visit_id: number;
  patient_id: number;
  doc_type: 'REFERRAL' | 'SICK_NOTE' | 'MEDICAL_REPORT';
  referred_to: string | null;
  specialty: string | null;
  urgency: string | null;
  from_date: IsoDate | null;
  to_date: IsoDate | null;
  body: string;
  issued_at: string;
  issued_by: string;
}
