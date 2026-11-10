'use server';

import { revalidatePath } from 'next/cache';
import { requireAction, requireAnyAction } from '@/lib/session';
import { actionResult, AppError } from '@/lib/errors';
import { signUpload, verifyUpload, destroyAsset, isUploadKind, type UploadKind } from '@/lib/cloudinary';
import { updateOrg, getOrg } from '@/lib/org';
import { setUserSignature } from '@/lib/userSignatures';
import { setEmployeeImage } from '@/lib/employees';
import { setEditRequestImage } from '@/lib/employeeEdits';
import type { ActionKey } from '@/lib/permissions';
import type {
  ActionResult, AttachmentEntity, Organisation, UploadSignature, UploadedFile,
} from '@/lib/types';

/** The action that governs writing media onto each kind of record. */
const WRITE_ACTION: Record<UploadKind, ActionKey> = {
  logo: 'ADMIN_ORG_MANAGE',
  ceo_signature: 'ADMIN_ORG_MANAGE',
  background: 'ADMIN_ORG_MANAGE',
  // Attachments are re-checked per entity in attachmentAction() below.
  attachment: 'PATIENTS_MANAGE',
  // A scanned document (an imaging study, an external report) for a clinical record.
  document: 'IMAGING_WORK',
  // A user's own signature is administrator-managed.
  user_signature: 'ADMIN_USER_MANAGE',
  // The Employee Card's identity strip — whoever maintains employee records.
  employee_photo: 'EMPLOYEES_CREATE',
  employee_signature: 'EMPLOYEES_CREATE',
};

/** Which records accept attachments, and the action that may add or remove them. */
const ATTACHMENT_ACTION: Record<AttachmentEntity, ActionKey> = {
  patient: 'PATIENTS_MANAGE',
  visit: 'CONSULTATION_WORK',
  imaging_order: 'IMAGING_WORK',
  insurance_claim: 'CLAIMS_MANAGE',
  customer: 'RECEIVABLES_CUSTOMER_MANAGE',
  vendor: 'PAYABLES_VENDOR_MANAGE',
};


function attachmentAction(entity: unknown): ActionKey {
  // The entity arrives from the browser — only a known one names a permission.
  if (typeof entity !== 'string' || !Object.hasOwn(ATTACHMENT_ACTION, entity)) {
    throw new AppError('Attachments are not supported on that record', 'VALIDATION');
  }
  return ATTACHMENT_ACTION[entity as AttachmentEntity];
}

/**
 * Issue one-shot upload credentials.
 *
 * Permission is checked *here*, before the browser is allowed to talk to
 * Cloudinary at all — an unsigned request cannot upload, so this is the gate.
 */
export async function requestUploadSignature(
  kind: UploadKind,
  entity?: AttachmentEntity,
): Promise<ActionResult<UploadSignature>> {
  return actionResult(async () => {
    if (!isUploadKind(kind)) throw new AppError('Unknown upload type', 'VALIDATION');
    const key = kind === 'attachment' && entity ? attachmentAction(entity) : WRITE_ACTION[kind];
    // An employee's photo / signature is also proposed on an Employee Editing request — by HR,
    // or by the employee themselves under Self Service.
    if (kind === 'employee_photo' || kind === 'employee_signature') {
      await requireAnyAction(key, 'EMPLOYEE_EDITS_UPDATE', 'SELF_SERVICE_RECORD_UPDATE');
    } else {
      await requireAction(key);
    }
    return signUpload(kind);
  });
}

/* --------------------------------------------------------------- org logo */

export async function saveOrgLogo(file: UploadedFile | null): Promise<ActionResult<Organisation>> {
  return actionResult(async () => {
    const user = await requireAction('ADMIN_ORG_MANAGE');
    const previous = (await getOrg())?.logo ?? null;

    let logo: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, 'logo', file.resourceType);
      logo = asset.public_id;
    }

    const org = await updateOrg({ logo }, user);

    // Drop the superseded asset. Legacy data-URL logos have no asset to remove.
    if (previous && previous !== logo && !previous.startsWith('data:')) {
      await destroyAsset(previous);
    }
    revalidatePath('/', 'layout');
    return org;
  });
}

/** Company Information "Background image" — saved on its own, exactly like the logo. */
export async function saveOrgBackground(file: UploadedFile | null): Promise<ActionResult<Organisation>> {
  return actionResult(async () => {
    const user = await requireAction('ADMIN_ORG_MANAGE');
    const previous = (await getOrg())?.background_image ?? null;
    let background_image: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, 'background', file.resourceType);
      if (asset.resource_type && asset.resource_type !== 'image') throw new AppError('The background must be an image', 'VALIDATION');
      background_image = asset.public_id;
    }
    const org = await updateOrg({ background_image }, user);
    if (previous && previous !== background_image && !previous.startsWith('data:')) await destroyAsset(previous);
    revalidatePath('/', 'layout');
    return org;
  });
}

/** Company Information "Signature" — saved on its own, exactly like the logo. */
export async function saveOrgCeoSignature(file: UploadedFile | null): Promise<ActionResult<Organisation>> {
  return actionResult(async () => {
    const user = await requireAction('ADMIN_ORG_MANAGE');
    const previous = (await getOrg())?.ceo_signature ?? null;
    let ceo_signature: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, 'ceo_signature', file.resourceType);
      ceo_signature = asset.public_id;
    }
    const org = await updateOrg({ ceo_signature }, user);
    if (previous && previous !== ceo_signature) await destroyAsset(previous);
    revalidatePath('/admin');
    return org;
  });
}

/* --------------------------------------------------------- user signatures */

/**
 * The scanned signature an administrator holds for a user (Admin Centre -> System Security ->
 * User Setup). The browser uploads to Cloudinary under one-shot credentials, this verifies the
 * asset really landed in the right folder, and the previous image is destroyed once the new
 * public_id is committed.
 */
export async function saveUserSignature(
  userId: number, file: UploadedFile | null,
): Promise<ActionResult<{ signature_image: string | null }>> {
  return actionResult(async () => {
    const actor = await requireAction('ADMIN_USER_MANAGE');
    let value: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, 'user_signature', file.resourceType);
      value = asset.public_id;
    }
    const previous = await setUserSignature(userId, value, actor);
    if (previous && previous !== value && !previous.startsWith('data:')) {
      await destroyAsset(previous);
    }
    revalidatePath('/admin/security/setup');
    return { signature_image: value };
  });
}

/* ------------------------------------------------------- employee identity */

/** The Employee Card's passport photo / specimen signature slots. */
export async function saveEmployeeImage(
  employeeId: number, kind: 'photo' | 'signature', file: UploadedFile | null,
): Promise<ActionResult<{ value: string | null }>> {
  return actionResult(async () => {
    const actor = await requireAction('EMPLOYEES_CREATE');
    if (kind !== 'photo' && kind !== 'signature') throw new AppError('Unknown image slot', 'VALIDATION');
    let value: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, kind === 'photo' ? 'employee_photo' : 'employee_signature', file.resourceType);
      value = asset.public_id;
    }
    const previous = await setEmployeeImage(employeeId, kind, value, actor);
    if (previous && previous !== value && !previous.startsWith('data:')) {
      await destroyAsset(previous);
    }
    revalidatePath(`/employees/view/${employeeId}`);
    revalidatePath('/employees');
    revalidatePath('/self-service');
    return { value };
  });
}

/** The proposed passport photo / specimen signature on an Employee Editing request. */
export async function saveEmployeeEditImage(
  no: string, kind: 'photo' | 'signature', file: UploadedFile | null,
): Promise<ActionResult<{ value: string | null }>> {
  return actionResult(async () => {
    const actor = await requireAnyAction('EMPLOYEE_EDITS_UPDATE', 'SELF_SERVICE_RECORD_UPDATE');
    if (kind !== 'photo' && kind !== 'signature') throw new AppError('Unknown image slot', 'VALIDATION');
    let value: string | null = null;
    if (file) {
      const asset = await verifyUpload(file.publicId, kind === 'photo' ? 'employee_photo' : 'employee_signature', file.resourceType);
      value = asset.public_id;
    }
    const { previous, previousIsLive } = await setEditRequestImage(no, kind, value, actor);
    // An upload that only ever sat on the request is an orphan once replaced; the employee's
    // live image is left alone — it is still theirs until the request is applied.
    if (previous && previous !== value && !previousIsLive && !previous.startsWith('data:')) {
      await destroyAsset(previous);
    }
    revalidatePath(`/employee-edits/view/${no}`);
    revalidatePath('/employee-edits');
    revalidatePath('/self-service/record');
    revalidatePath('/self-service/employee-editing');
    return { value };
  });
}
