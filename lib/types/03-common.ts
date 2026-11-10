/* common document vocabulary — import from '@/lib/types', never from here directly. */

/**
 * The workflow state of a staging document — shared vocabulary across every document type that
 * runs through approval, so not every value applies to every one.
 */
export type DocumentStatus =
  | 'Open' | 'Pending Approval' | 'Approved' | 'Processed';
