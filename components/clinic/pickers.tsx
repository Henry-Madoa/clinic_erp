'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { useRunAction } from '@/components/ui/run-action';
import { searchPatientsRequest, searchIcdRequest, prescribeRequest } from '@/app/actions/clinic';
import type { ActionResult } from '@/lib/types';

/* ------------------------------------------------------------------ patient search */

type PatientHit = { id: number; mrn: string; name: string; phone: string | null; age: number | null; sex: string; open: string | null };

/** Find a patient by name, MRN, phone or ID last four; posts `patient_id`. */
export function PatientPicker({ name = 'patient_id', initial }: { name?: string; initial?: { id: number; label: string } | null }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(initial ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked || q.trim().length < 2) { setHits([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await searchPatientsRequest(q);
      if (r.ok) setHits(r.data);
    }, 220);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, picked]);

  return (
    <div className="field">
      <label htmlFor="pp-q">Patient</label>
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      {picked ? (
        <div className="inline" style={{ gap: 8 }}>
          <b>{picked.label}</b>
          {initial ? null : <button type="button" className="btn ghost sm" onClick={() => { setPicked(null); setQ(''); }}>Change</button>}
        </div>
      ) : (
        <div className="combobox">
          <input id="pp-q" autoComplete="off" placeholder="Name, MRN, phone or last 4 of ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.length ? (
            <div className="combobox-list">
              {hits.map((h) => (
                <button key={h.id} type="button" className="rx-row" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 0, cursor: 'pointer' }}
                  onClick={() => setPicked({ id: h.id, label: `${h.name} · ${h.mrn}` })}>
                  <b>{h.name}</b> <span className="mono tiny">{h.mrn}</span>
                  <div className="tiny muted-cell">{h.age ?? '?'}y {h.sex.charAt(0)} · {h.phone ?? 'no phone'}{h.open ? ` · in clinic on ${h.open}` : ''}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ ICD-10 */

/** ICD-10 search filling `icd_code` and `description`. */
export function IcdPicker() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ code: string; title: string }[]>([]);
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await searchIcdRequest(code ? '' : q);
      if (r.ok && !code) setHits(r.data);
    }, 200);
    return () => clearTimeout(t);
  }, [q, code]);
  return (
    <>
      <input type="hidden" name="icd_code" value={code} />
      <div className="field">
        <label htmlFor="icd-q">ICD-10 (search code or words)</label>
        {code ? (
          <div className="inline" style={{ gap: 8 }}><span className="mono">{code}</span> {desc}
            <button type="button" className="btn ghost sm" onClick={() => { setCode(''); setDesc(''); }}>Change</button></div>
        ) : (
          <div className="combobox">
            <input id="icd-q" autoComplete="off" placeholder="e.g. malaria, J06, hypertension…" value={q} onChange={(e) => setQ(e.target.value)} />
            {hits.length ? (
              <div className="combobox-list">
                {hits.map((h) => (
                  <button key={h.code} type="button" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 10px', background: 'none', border: 0, cursor: 'pointer' }}
                    onClick={() => { setCode(h.code); setDesc(h.title); }}>
                    <span className="mono">{h.code}</span> {h.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="dx-desc">Diagnosis (as written on the record)</label>
        <input id="dx-desc" name="description" value={desc} maxLength={300} onChange={(e) => setDesc(e.target.value)} placeholder="Defaults to the ICD-10 title" />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ lab tests */

export interface PickOption { id: number; label: string; group: string; sub?: string }

/** Tick-list grouped by section; posts the ids comma-joined under `name`. */
export function MultiPick({ name, options, filterPlaceholder = 'Filter…' }: { name: string; options: PickOption[]; filterPlaceholder?: string }) {
  const [on, setOn] = useState<number[]>([]);
  const [f, setF] = useState('');
  const shown = useMemo(() => options.filter((o) => !f || o.label.toLowerCase().includes(f.toLowerCase()) || o.group.toLowerCase().includes(f.toLowerCase())), [options, f]);
  return (
    <>
      <input type="hidden" name={name} value={on.join(',')} />
      <div className="toolbar" style={{ margin: '0 0 6px' }}>
        <input placeholder={filterPlaceholder} value={f} onChange={(e) => setF(e.target.value)} style={{ maxWidth: 260 }} />
        <div className="spacer" />
        <span className="tiny muted-cell">{on.length} selected</span>
      </div>
      <div className="pick-grid">
        {shown.map((o, i) => {
          const head = i === 0 || shown[i - 1].group !== o.group ? o.group : null;
          return [
            head ? <div key={`h-${o.group}`} className="pick-section">{o.group}</div> : null,
            <label key={o.id} className={`pick-item${on.includes(o.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={on.includes(o.id)} onChange={() => setOn((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
              <span>{o.label}{o.sub ? <div className="pi-sub">{o.sub}</div> : null}</span>
            </label>,
          ];
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ prescription */

export interface DrugOption { id: number; label: string; form: string; route: string; frequency: string | null; stock: number; price: number }
const FREQS = ['OD', 'BD', 'TDS', 'QID', 'Q6H', 'Q8H', 'NOCTE', 'STAT', 'PRN', 'WEEKLY'];
const PER_DAY: Record<string, number> = { OD: 1, BD: 2, TDS: 3, QID: 4, Q6H: 4, Q8H: 3, NOCTE: 1, STAT: 1, PRN: 1, WEEKLY: 1 / 7 };
const ROUTES = ['PO', 'IV', 'IM', 'SC', 'TOP', 'INH', 'PR', 'SL', 'OPHTH', 'OTIC', 'NASAL', 'BUCCAL'];

type Line = { key: number; drug_id: string; dose: string; route: string; frequency: string; duration_days: string; quantity: string; instructions: string };

function suggest(form: string | undefined, dose: string, freq: string, days: string): string {
  if (!form || !['TABLET', 'CAPSULE', 'SUPPOSITORY'].includes(form)) return '1';
  const u = Number(dose.match(/^\s*(\d+(?:\.\d+)?)/)?.[1] ?? 1);
  return String(Math.max(1, Math.ceil(u * (PER_DAY[freq] ?? 1) * (freq === 'STAT' ? 1 : Number(days) || 1))));
}

/** Writes a multi-line prescription; quantities are suggested from dose × frequency × days. */
export function PrescriptionBuilder({ visitNo, drugs, allergies }: { visitNo: string; drugs: DrugOption[]; allergies: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([{ key: 1, drug_id: '', dose: '1', route: 'PO', frequency: 'TDS', duration_days: '5', quantity: '', instructions: '' }]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(drugs.map((d) => [String(d.id), d])), [drugs]);
  const set = (key: number, patch: Partial<Line>): void => setLines((ls) => ls.map((l) => {
    if (l.key !== key) return l;
    const next = { ...l, ...patch };
    if (patch.drug_id) { const d = byId.get(patch.drug_id); if (d) { next.route = d.route; if (d.frequency) next.frequency = d.frequency; } }
    return next;
  }));
  const submit = async (): Promise<void> => {
    const payload = lines.filter((l) => l.drug_id).map((l) => ({
      drug_id: Number(l.drug_id), dose: l.dose, route: l.route, frequency: l.frequency, duration_days: Number(l.duration_days) || 1,
      quantity: Number(l.quantity || suggest(byId.get(l.drug_id)?.form, l.dose, l.frequency, l.duration_days)), instructions: l.instructions,
    }));
    if (!payload.length) { toast('Nothing to prescribe', 'Pick at least one drug', 'err'); return; }
    setBusy(true);
    const r: ActionResult<{ no: string; allergyWarnings: string[] }> = await prescribeRequest(visitNo, payload, notes);
    setBusy(false);
    if (!r.ok) { toast('Could not prescribe', r.error, 'err'); return; }
    toast(`Prescription ${r.data.no} sent to pharmacy`, r.data.allergyWarnings.length ? `⚠ ${r.data.allergyWarnings.join('; ')}` : undefined, r.data.allergyWarnings.length ? 'err' : 'ok');
    setLines([{ key: Date.now(), drug_id: '', dose: '1', route: 'PO', frequency: 'TDS', duration_days: '5', quantity: '', instructions: '' }]);
    setNotes('');
    router.refresh();
  };
  return (
    <div>
      {allergies && !/^(none|nkda|nil)/i.test(allergies) ? <div className="alert-chip" style={{ marginBottom: 8 }}>⚠ Recorded allergies: {allergies}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Days</th><th className="num">Qty</th><th>Instructions</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => {
              const d = byId.get(l.drug_id);
              return (
                <tr key={l.key}>
                  <td style={{ minWidth: 240 }}>
                    <select value={l.drug_id} onChange={(e) => set(l.key, { drug_id: e.target.value })}>
                      <option value="">— pick —</option>
                      {drugs.map((o) => <option key={o.id} value={o.id}>{o.label}{o.stock <= 0 ? ' (out of stock)' : ''}</option>)}
                    </select>
                    {d ? <div className="tiny muted-cell">{d.stock} in store · KSh {(d.price / 100).toFixed(2)} each</div> : null}
                  </td>
                  <td><input value={l.dose} style={{ width: 70 }} onChange={(e) => set(l.key, { dose: e.target.value })} /></td>
                  <td><select value={l.route} onChange={(e) => set(l.key, { route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td><select value={l.frequency} onChange={(e) => set(l.key, { frequency: e.target.value })}>{FREQS.map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td><input type="number" min={1} max={365} value={l.duration_days} style={{ width: 60 }} onChange={(e) => set(l.key, { duration_days: e.target.value })} /></td>
                  <td className="num"><input type="number" min={1} value={l.quantity} placeholder={suggest(d?.form, l.dose, l.frequency, l.duration_days)} style={{ width: 70 }} onChange={(e) => set(l.key, { quantity: e.target.value })} /></td>
                  <td><input value={l.instructions} placeholder="after meals…" maxLength={200} onChange={(e) => set(l.key, { instructions: e.target.value })} /></td>
                  <td><button type="button" className="btn ghost sm" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}>✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar">
        <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, { key: Date.now(), drug_id: '', dose: '1', route: 'PO', frequency: 'TDS', duration_days: '5', quantity: '', instructions: '' }])}>+ Add drug</button>
        <input placeholder="Notes to the pharmacist (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ flex: 1 }} maxLength={1000} />
        <button type="button" className="btn" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send to pharmacy'}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bulk select */

/**
 * A table whose rows can be ticked and acted on together (collect specimens, verify results,
 * submit claims). Rows are rendered by the server; this only tracks the ticked keys.
 */
export function BulkTable<K extends string | number>({ head, rows, action, label, successTitle, extra, confirmMessage }: {
  head: React.ReactNode[];
  rows: { key: K; cells: React.ReactNode[]; className?: string }[];
  action: (keys: K[], extra: string) => Promise<ActionResult<unknown>>;
  label: string;
  successTitle: string;
  extra?: { placeholder: string };
  confirmMessage?: string;
}) {
  const [on, setOn] = useState<K[]>([]);
  const [x, setX] = useState('');
  const { run, busy } = useRunAction();
  const all = rows.length > 0 && on.length === rows.length;
  return (
    <>
      <div className="toolbar">
        <label className="tiny"><input type="checkbox" checked={all} onChange={() => setOn(all ? [] : rows.map((r) => r.key))} /> Tick all · {on.length} of {rows.length}</label>
        <div className="spacer" />
        {extra ? <input placeholder={extra.placeholder} value={x} onChange={(e) => setX(e.target.value)} style={{ maxWidth: 240 }} /> : null}
        <button type="button" className="btn" disabled={busy || !on.length}
          onClick={() => run(() => action(on, x) as Promise<{ ok: boolean; error?: string; data?: unknown }>, {
            successTitle, confirm: confirmMessage ? { title: label, message: confirmMessage } : undefined,
          }).then(() => setOn([]))}>
          {busy ? 'Working…' : `${label}${on.length ? ` (${on.length})` : ''}`}
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th style={{ width: 28 }} />{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.key)} className={r.className}>
                <td><input type="checkbox" checked={on.includes(r.key)} onChange={() => setOn((s) => (s.includes(r.key) ? s.filter((k) => k !== r.key) : [...s, r.key]))} /></td>
                {r.cells.map((c, i) => <td key={i}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
