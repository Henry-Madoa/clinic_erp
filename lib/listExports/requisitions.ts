import { listRequisitions, REQUISITION_FILTER_FIELDS, type RequisitionListView } from '../requisitions.ts';
import { defineExport, money } from '../listExport.ts';

const VIEWS: RequisitionListView[] = ['open', 'pending', 'approved', 'issued', 'received', 'closed', 'all'];

export const REQUISITION_EXPORTS = {
  requisitions: defineExport({
    action: 'REQUISITIONS_READ',
    sheet: 'Requisitions', filename: 'requisitions.xlsx',
    fields: REQUISITION_FILTER_FIELDS,
    rows: ({ view, q, filters, params }) => listRequisitions(
      params.get('type') === 'purchase' ? 'Purchase Requisition' : 'Store Requisition',
      (VIEWS.includes(view as RequisitionListView) ? view : 'open') as RequisitionListView, q, null, filters,
    ),
    columns: [
      { header: 'No.', key: 'no', value: (r) => r.no },
      { header: 'Type', key: 'requisition_type', width: 20, value: (r) => r.requisition_type },
      { header: 'Title', key: 'title', width: 28, value: (r) => r.title },
      { header: 'Employee no.', key: 'employee_no', value: (r) => r.employee_no },
      { header: 'Requested by', key: 'requested_by', width: 24, value: (r) => `${r.first_name} ${r.last_name}`.trim() },
      { header: 'Date', key: 'requisition_date', width: 12, value: (r) => r.requisition_date },
      { header: 'Needed by', key: 'needed_by_date', width: 12, value: (r) => r.needed_by_date },
      { header: 'Store', key: 'location_code', width: 10, value: (r) => r.location_code },
      { header: 'Qty requested', key: 'total_quantity', width: 10, value: (r) => r.total_quantity },
      { header: 'Qty approved', key: 'total_quantity_approved', width: 10, value: (r) => r.total_quantity_approved },
      { header: 'Qty issued', key: 'total_quantity_issued', width: 10, value: (r) => r.total_quantity_issued },
      { header: 'Method', key: 'procurement_method', value: (r) => r.procurement_method },
      { header: 'Est. amount', key: 'total_amount', width: 14, value: (r) => money(r.total_amount) },
      { header: 'Status', key: 'status', value: (r) => r.status },
    ],
  }),
};
