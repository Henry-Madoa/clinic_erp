'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/primitives';
import { Field, readForm } from '@/components/ui/field';
import { DefinitionList } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { saveOrganisation } from '@/app/actions/admin';
import { saveOrgLogo, saveOrgCeoSignature, saveOrgBackground } from '@/app/actions/media';
import { FilePicker } from '@/components/ui/uploader';
import { COMPANY_TYPES } from '@/lib/constants';
import { formatDateTime, initials } from '@/lib/format';
import type { Organisation } from '@/lib/types';

export interface CompanyFormProps {
  org: Organisation;
  /** Resolved server-side: a Cloudinary delivery URL, or a legacy data URL. */
  logoSrc: string | null;
  /** The CEO's signature on file — printed on every demand notice. */
  signatureSrc: string | null;
  /** The sign-in background photograph, resolved server-side like the logo. */
  backgroundSrc: string | null;
  mediaEnabled: boolean;
}

export function CompanyForm({ org, logoSrc, signatureSrc, backgroundSrc, mediaEnabled }: CompanyFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(logoSrc);
  // `useState(logoSrc)` only seeds on mount — a later router.refresh() sends a
  // fresh `logoSrc` prop but won't touch state that's already initialised, so
  // the preview has to be resynced explicitly or it goes stale after the
  // first upload.
  useEffect(() => setPreview(logoSrc), [logoSrc]);
  const [signaturePreview, setSignaturePreview] = useState(signatureSrc);
  useEffect(() => setSignaturePreview(signatureSrc), [signatureSrc]);
  const [background, setBackground] = useState(backgroundSrc);
  useEffect(() => setBackground(backgroundSrc), [backgroundSrc]);
  const [overlay, setOverlay] = useState(Number(org.background_overlay ?? 45));
  const [name, setName] = useState(org.name ?? '');
  const [shortName, setShortName] = useState(org.short_name ?? '');

  const previewName = shortName || name || 'Calbytes';

  /*
   * The logo saves on its own rather than with the rest of the form: the file
   * is already in Cloudinary by this point, and making the admin remember to
   * press Save afterwards is how you end up with orphaned assets.
   */
  const applyLogo = async (file: { publicId: string; originalFilename: string } | null) => {
    setBusy(true);
    try {
      const res = await saveOrgLogo(file);
      if (!res.ok) { toast('Could not update logo', res.error, 'err'); return; }
      toast(file ? 'Logo updated' : 'Logo removed', 'Live across the system', 'ok');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const applySignature = async (file: { publicId: string; originalFilename: string } | null) => {
    setBusy(true);
    try {
      const res = await saveOrgCeoSignature(file);
      if (!res.ok) { toast('Could not update signature', res.error, 'err'); return; }
      toast(file ? 'Signature updated' : 'Signature removed', 'Used on every demand notice from now on', 'ok');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const applyBackground = async (file: { publicId: string; originalFilename: string } | null) => {
    setBusy(true);
    try {
      const res = await saveOrgBackground(file);
      if (!res.ok) { toast('Could not update the background', res.error, 'err'); return; }
      toast(file ? 'Background updated' : 'Background removed', 'The sign-in screen shows it now', 'ok');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setBusy(true);
    try {
      // `logo` is deliberately absent — it is owned by applyLogo above.
      const res = await saveOrganisation(readForm(form));
      if (!res.ok) {
        toast('Could not save', res.error, 'err');
        return;
      }
      toast('Company information saved', 'The change is live across the system', 'ok');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="grid split-aside">
        <div>
          <Card>
            <h3>Society identity</h3>
            <div className="card-sub">
              These details appear on the sign-in screen, the sidebar, statements and every report header.
            </div>
            <div className="grid g2">
              <div className="field">
                <label htmlFor="f_name">Registered society name <span className="req">*</span></label>
                <input id="f_name" name="name" type="text" required value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f_short_name">Short name</label>
                <input id="f_short_name" name="short_name" type="text" value={shortName}
                  onChange={(e) => setShortName(e.target.value)} />
                <div className="hint">Used in the sidebar and browser title</div>
              </div>
            </div>
            <Field name="motto" label="Motto or tagline" defaultValue={org.motto} />
            <div className="grid g3">
              <Field name="company_type" label="Company type" type="select"
                defaultValue={org.company_type} options={COMPANY_TYPES} />
              <Field name="registration_no" label="Registration no. (BRS)" defaultValue={org.registration_no} placeholder="PVT-…" />
              <Field name="incorporation_date" label="Date of incorporation" type="date" defaultValue={org.incorporation_date} />
            </div>
            <div className="grid g4">
              <Field name="kra_pin" label="KRA PIN" defaultValue={org.kra_pin} uppercase placeholder="P051234567X" />
              <Field name="vat_registration_no" label="VAT registration no." defaultValue={org.vat_registration_no} />
              <Field name="ict_authority_licence_no" label="ICT Authority accreditation" defaultValue={org.ict_authority_licence_no} />
              <Field name="odpc_registration_no" label="ODPC registration no." defaultValue={org.odpc_registration_no} />
            </div>
          </Card>

          <Card>
            <h3>Contact and address</h3>
            <div className="card-sub">Printed on invoices, statements and correspondence.</div>
            <div className="grid g2">
              <Field name="physical_address" label="Physical address" defaultValue={org.physical_address} />
              <Field name="postal_address" label="Postal address" defaultValue={org.postal_address} />
              <Field name="city" label="Town / city" defaultValue={org.city} />
              <Field name="county" label="County" defaultValue={org.county} />
              <Field name="country" label="Country" defaultValue={org.country} />
              <Field name="website" label="Website" defaultValue={org.website} />
              <Field name="phone_primary" label="Primary telephone" defaultValue={org.phone_primary} type="phone" />
              <Field name="phone_secondary" label="Secondary telephone" defaultValue={org.phone_secondary} type="phone" />
              <Field name="email" label="Email address" type="email" defaultValue={org.email} />
            </div>
          </Card>

          <Card>
            <h3>Banking and collections</h3>
            <div className="card-sub">Used on receipts and payment instructions.</div>
            <div className="grid g3">
              <Field name="bank_account_name" label="Account name" defaultValue={org.bank_account_name} />
              <Field name="bank_name" label="Bank" defaultValue={org.bank_name} />
              <Field name="bank_branch" label="Branch" defaultValue={org.bank_branch} />
              <Field name="bank_account_no" label="Bank account number" defaultValue={org.bank_account_no} />
              <Field name="paybill_no" label="Mobile money paybill" defaultValue={org.paybill_no} />
            </div>
            <Field name="statement_footer" label="Statement footer text" type="textarea"
              defaultValue={org.statement_footer} />
          </Card>

        </div>

        <div>
          <Card>
            <h3>Logo</h3>
            <div className="card-sub">
              PNG, JPEG, WebP or SVG under 1.5 MB. Shown on the sidebar and sign-in screen.
            </div>
            <div className="logo-drop">
              {preview
                ? <img src={preview} alt="Society logo" />
                : <div className="logo-empty" aria-hidden="true">{initials(previewName)}</div>}
              <div style={{ flex: 1 }}>
                {mediaEnabled ? (
                  <>
                    <FilePicker
                      kind="logo"
                      accept="image/*"
                      label="Upload logo"
                      disabled={busy}
                      onUploaded={applyLogo}
                    />
                    {preview ? (
                      <div className="inline" style={{ marginTop: 8 }}>
                        <button type="button" className="btn ghost sm" disabled={busy}
                          onClick={() => applyLogo(null)}>
                          Remove logo
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="note">
                    Media storage is not configured. Set the <code>CLOUDINARY_*</code> environment variables to enable uploads.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h3>Background image</h3>
            <div className="card-sub">
              A landscape photograph of the property — JPEG, PNG or WebP, at least 1920 px wide, under 6 MB. It fills the sign-in screen,
              darkened so the name and the sign-in card stay legible.
            </div>
            {/* A live miniature of the sign-in screen: the photograph, the darkening, the serif title, the glass card. */}
            <div className="bg-preview" style={{ ['--bg-overlay' as string]: String(overlay / 100) }}>
              {background ? <img className="bg-preview-img" src={background} alt="Background preview" /> : <div className="bg-preview-img bg-preview-empty" aria-hidden="true" />}
              <div className="bg-preview-shade" />
              <div className="bg-preview-brand">
                <span className="bg-preview-kicker">Welcome to</span>
                <span className="bg-preview-name">{previewName}</span>
                <span className="bg-preview-rule" />
              </div>
              <div className="bg-preview-card"><span /><span /><span /></div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="f_background_overlay">Darkening — {overlay}%</label>
              <input id="f_background_overlay" name="background_overlay" type="range" min={0} max={85} step={5} value={overlay}
                onChange={(e) => setOverlay(Number(e.target.value))} />
              <div className="hint">More for a busy or bright photograph. Saved with the rest of the form.</div>
            </div>
            <Field name="background_in_app" label="Also show it, faintly, behind every page" type="checkbox" defaultValue={org.background_in_app ?? 0} />
            {mediaEnabled ? (
              <div className="inline" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <FilePicker kind="background" accept="image/jpeg,image/png,image/webp" label={background ? 'Replace image' : 'Upload image'} disabled={busy} onUploaded={applyBackground} />
                {background ? <button type="button" className="btn ghost sm" disabled={busy} onClick={() => applyBackground(null)}>Remove image</button> : null}
              </div>
            ) : (
              <div className="note">Media storage is not configured. Set the <code>CLOUDINARY_*</code> environment variables to enable uploads.</div>
            )}
          </Card>

          <Card>
            <h3>Chief Executive&apos;s signature</h3>
            <div className="card-sub">
              Signs every demand notice as &ldquo;The Chief Executive Officer&rdquo;. PNG or JPEG on a plain background.
            </div>
            <Field name="ceo_name" label="Name under the signature" defaultValue={org.ceo_name ?? ''} placeholder="e.g. Jane Wanjiru" />
            <div className="logo-drop">
              {signaturePreview
                ? <img src={signaturePreview} alt="CEO signature" style={{ maxHeight: 70, objectFit: 'contain' }} />
                : <div className="logo-empty" aria-hidden="true">✍</div>}
              <div style={{ flex: 1 }}>
                {mediaEnabled ? (
                  <>
                    <FilePicker kind="ceo_signature" accept="image/*" label="Upload signature" disabled={busy} onUploaded={applySignature} />
                    {signaturePreview ? (
                      <div className="inline" style={{ marginTop: 8 }}>
                        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => applySignature(null)}>Remove signature</button>
                      </div>
                    ) : null}
                  </>
                ) : <div className="note">Media storage is not configured.</div>}
              </div>
            </div>
          </Card>

          <Card>
            <h3>Live preview</h3>
            <div className="card-sub">How the identity reads in the interface.</div>
            <div className="brand-preview">
              <div className="mark">{initials(previewName)}</div>
              <div>
                <div className="name">{previewName}</div>
                <div className="sub">Clinic Management</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <DefinitionList items={[
                ['Last updated', formatDateTime(org.updated_at)],
                ['By', org.updated_by || '—'],
              ]} />
            </div>
          </Card>

          <Card className="sticky-card">
            <button type="button" className="btn block" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save company information'}
            </button>
            <button type="button" className="btn ghost block" style={{ marginTop: 8 }}
              disabled={busy} onClick={() => router.refresh()}>
              Discard changes
            </button>
          </Card>
        </div>
      </div>
    </form>
  );
}
