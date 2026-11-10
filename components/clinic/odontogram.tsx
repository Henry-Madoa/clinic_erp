'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { ActionResult, DentalChartEntry, FormValues } from '@/lib/types';

interface Condition { code: string; label: string; colour: string; needsTreatment: boolean }
type Quadrants = { upperRight: string[]; upperLeft: string[]; lowerRight: string[]; lowerLeft: string[] };

/** Five surfaces drawn as a square tooth: occlusal in the middle, M/D/B/L around it. */
function ToothSvg({ fill, surfaces, missing }: { fill: string | null; surfaces: string | null; missing: boolean }) {
  const on = (s: string): boolean => !surfaces || surfaces.includes(s);
  const paint = (s: string): string | undefined => (fill && on(s) ? fill : undefined);
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <polygon className="surf" points="2,2 38,2 28,12 12,12" style={{ fill: paint('B') }} />
      <polygon className="surf" points="38,2 38,38 28,28 28,12" style={{ fill: paint('D') }} />
      <polygon className="surf" points="38,38 2,38 12,28 28,28" style={{ fill: paint('L') }} />
      <polygon className="surf" points="2,38 2,2 12,12 12,28" style={{ fill: paint('M') }} />
      <rect className="surf" x="12" y="12" width="16" height="16" style={{ fill: paint('O') ?? paint('I') }} />
      {missing ? <path d="M4 4 L36 36 M36 4 L4 36" stroke="currentColor" strokeWidth="2.5" /> : null}
    </svg>
  );
}

/**
 * The interactive odontogram (FDI). Click teeth to select them, then record a finding on the
 * selection. Read-only when `onRecord` is absent.
 */
export function Odontogram({ entries, conditions, adult, primary, onRecord, visitId }: {
  entries: DentalChartEntry[];
  conditions: Condition[];
  adult: Quadrants;
  primary: Quadrants;
  onRecord?: (v: FormValues) => Promise<ActionResult<{ teeth: number }>>;
  visitId?: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dentition, setDentition] = useState<'adult' | 'primary'>(entries.some((e) => Number(e.tooth[0]) >= 5) && !entries.some((e) => Number(e.tooth[0]) <= 4) ? 'primary' : 'adult');
  const [selected, setSelected] = useState<string[]>([]);
  const [condition, setCondition] = useState(conditions[0]?.code ?? 'CARIES');
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const byTooth = useMemo(() => new Map(entries.map((e) => [e.tooth, e])), [entries]);
  const colourOf = useMemo(() => new Map(conditions.map((c) => [c.code, c])), [conditions]);
  const q = dentition === 'adult' ? adult : primary;

  const toggle = (t: string): void => { if (onRecord) setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t])); };
  const tooth = (t: string) => {
    const e = byTooth.get(t);
    const c = e ? colourOf.get(e.condition) : undefined;
    return (
      <button key={t} type="button" title={e ? `${t}: ${c?.label ?? e.condition}${e.surfaces ? ` (${e.surfaces})` : ''}${e.notes ? ` — ${e.notes}` : ''}` : `Tooth ${t}`}
        className={`tooth${dentition === 'primary' ? ' primary' : ''}${selected.includes(t) ? ' sel' : ''}${e?.condition === 'MISSING' ? ' missing' : ''}`}
        onClick={() => toggle(t)}>
        <span className="t-no">{t}</span>
        <ToothSvg fill={c && e?.condition !== 'HEALTHY' && e?.condition !== 'MISSING' ? c.colour : null} surfaces={e?.surfaces ?? null} missing={e?.condition === 'MISSING'} />
        <span className="t-cond">{e && e.condition !== 'HEALTHY' ? (c?.label ?? e.condition).split(' ')[0] : ''}</span>
      </button>
    );
  };

  const save = async (): Promise<void> => {
    if (!onRecord || !selected.length) return;
    setBusy(true);
    const r = await onRecord({ teeth: selected.join(','), condition, surfaces: surfaces.join(''), notes, visit_id: visitId ?? '' });
    setBusy(false);
    if (!r.ok) { toast('Could not record', r.error, 'err'); return; }
    toast('Charted', `${r.data.teeth} tooth/teeth updated`, 'ok');
    setSelected([]); setSurfaces([]); setNotes('');
    router.refresh();
  };

  const needs = entries.filter((e) => colourOf.get(e.condition)?.needsTreatment);
  return (
    <div className="odontogram">
      <div className="toolbar">
        <div className="tabs" style={{ margin: 0 }}>
          <button type="button" className={dentition === 'adult' ? 'active' : ''} onClick={() => { setDentition('adult'); setSelected([]); }}>Permanent (11–48)</button>
          <button type="button" className={dentition === 'primary' ? 'active' : ''} onClick={() => { setDentition('primary'); setSelected([]); }}>Primary (51–85)</button>
        </div>
        <div className="spacer" />
        <span className="tiny muted-cell">{needs.length ? `${needs.length} tooth/teeth need treatment` : 'No outstanding findings'}</span>
      </div>
      <div className="odo-arch">
        <div className="odo-quad right">{q.upperRight.map(tooth)}</div><div className="odo-mid" /><div className="odo-quad">{q.upperLeft.map(tooth)}</div>
      </div>
      <div className="odo-arch lower">
        <div className="odo-quad right">{q.lowerRight.map(tooth)}</div><div className="odo-mid" /><div className="odo-quad">{q.lowerLeft.map(tooth)}</div>
      </div>
      <div className="odo-legend">{conditions.filter((c) => c.code !== 'HEALTHY').map((c) => <span key={c.code}><i style={{ background: c.colour }} />{c.label}</span>)}</div>
      {onRecord ? (
        <div className="card inset" style={{ margin: 0 }}>
          <div className="grid g4" style={{ alignItems: 'end' }}>
            <div className="field"><label>Selected teeth</label><div className="mono">{selected.length ? selected.join(', ') : <span className="muted-cell">click teeth above</span>}</div></div>
            <div className="field"><label htmlFor="odo-cond">Finding</label>
              <select id="odo-cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
                {conditions.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Surfaces (blank = whole tooth)</label>
              <div className="inline" style={{ gap: 4 }}>
                {['M', 'O', 'D', 'B', 'L'].map((s) => (
                  <button key={s} type="button" className={`btn sm ${surfaces.includes(s) ? '' : 'ghost'}`} onClick={() => setSurfaces((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{s}</button>
                ))}
              </div>
            </div>
            <div className="field"><label htmlFor="odo-notes">Notes</label><input id="odo-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div className="spacer" />
            {selected.length ? <button type="button" className="btn ghost sm" onClick={() => setSelected([])}>Clear selection</button> : null}
            <button type="button" className="btn" disabled={busy || !selected.length} onClick={save}>{busy ? 'Saving…' : 'Record finding'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
