/* media — split out of lib/types.ts; import from '@/lib/types', never from here directly. */

/* ------------------------------------------------------------------- media */

/** The trustworthy metadata for an asset, read back from Cloudinary. */
export interface CloudinaryAsset {
  public_id: string;
  url: string;
  format: string | null;
  bytes: number;
  resource_type: string;
  width: number | null;
  height: number | null;
}

/** One-shot credentials the browser uses to post a file straight to Cloudinary. */
export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  resourceType: 'image' | 'auto';
  accepted: string[];
  maxBytes: number;
}

/** What the browser reports back after a direct upload, before verification. */
export interface UploadedFile {
  publicId: string;
  originalFilename: string;
  /** Cloudinary's own read of the resource type; a hint only, verified server-side. */
  resourceType?: string;
}

export type AttachmentEntity = 'patient' | 'visit' | 'imaging_order' | 'insurance_claim' | 'customer' | 'vendor';
