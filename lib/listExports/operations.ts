import { listPatients, PATIENT_FILTER_FIELDS } from '../clinic/patients.ts';
import { defineExport } from '../listExport.ts';
import { humanise } from '../format.ts';

/* The clinic's list screens, exported exactly as filtered on screen. */
export const OPERATIONS_EXPORTS = {
  patients: defineExport({
    action: 'PATIENTS_READ', sheet: 'Patients', filename: 'patients.xlsx', fields: PATIENT_FILTER_FIELDS,
    rows: ({ q, filters }) => listPatients(q, filters, 1000),
    columns: [
      { header: 'MRN', key: 'mrn', value: (p) => p.mrn },
      { header: 'Name', key: 'full_name', width: 30, value: (p) => p.full_name },
      { header: 'Sex', key: 'sex', value: (p) => humanise(p.sex) },
      { header: 'Age', key: 'age', value: (p) => p.age },
      { header: 'Phone', key: 'phone', width: 16, value: (p) => p.phone },
      { header: 'Cover', key: 'default_scheme', width: 24, value: (p) => p.default_scheme ?? 'Cash' },
      { header: 'Visits', key: 'visits', value: (p) => p.visits },
      { header: 'Last visit', key: 'last_visit_date', width: 12, value: (p) => p.last_visit_date },
      { header: 'Status', key: 'status', value: (p) => humanise(p.status) },
    ],
  }),
};
