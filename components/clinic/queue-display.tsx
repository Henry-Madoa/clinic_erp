'use client';

import { useEffect, useRef, useState } from 'react';
import { queueSnapshotRequest } from '@/app/actions/clinic';

type Snapshot = {
  display: { queue_no: string; department_name: string; colour: string; room: string | null; status: string; called_at: string | null }[];
  counts: { code: string; name: string; colour: string; kind: string; waiting: number; serving: number; longest_mins: number }[];
};

/** The waiting-room screen: refreshes every five seconds and chimes when a new number is called. */
export function QueueDisplay({ clinic, initial }: { clinic: string; initial: Snapshot }) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [now, setNow] = useState(() => new Date());
  const seen = useRef(new Set(initial.display.filter((d) => d.status === 'CALLED').map((d) => `${d.queue_no}@${d.called_at}`)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    const poll = setInterval(async () => {
      const r = await queueSnapshotRequest();
      if (!r.ok) return;
      const called = r.data.display.filter((d) => d.status === 'CALLED').map((d) => `${d.queue_no}@${d.called_at}`);
      const newOnes = called.filter((k) => !seen.current.has(k));
      if (newOnes.length) {
        newOnes.forEach((k) => seen.current.add(k));
        setFresh(new Set(newOnes));
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.value = 0.15;
          o.start(); o.stop(ctx.currentTime + 0.35);
        } catch { /* audio is a courtesy */ }
      }
      setSnap(r.data);
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, []);

  const calling = snap.display.filter((d) => d.status === 'CALLED' || d.status === 'SERVING').slice(0, 6);
  const waiting = snap.display.filter((d) => d.status === 'WAITING');
  return (
    <div className="qd">
      <div className="qd-head">
        <h1>{clinic}</h1>
        <div className="qd-clock">{now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <div className="qd-body">
        <div className="qd-panel">
          <h2>Now calling</h2>
          <div className="qd-called">
            {calling.length ? calling.map((d) => (
              <div key={`${d.queue_no}-${d.called_at}`} className={`qd-call${fresh.has(`${d.queue_no}@${d.called_at}`) ? ' fresh' : ''}`} style={{ ['--qc' as string]: d.colour }}>
                <div className="no">{d.queue_no}</div>
                <div className="where">{d.department_name}{d.room ? <div style={{ opacity: 0.8 }}>{d.room}</div> : null}</div>
              </div>
            )) : <div style={{ opacity: 0.6 }}>Please wait to be called.</div>}
          </div>
        </div>
        <div className="qd-panel">
          <h2>Waiting</h2>
          <div className="qd-wait">{waiting.length ? waiting.slice(0, 30).map((d) => <span key={d.queue_no}>{d.queue_no}</span>) : <span style={{ opacity: 0.6 }}>—</span>}</div>
        </div>
      </div>
      <div className="qd-counts">
        {snap.counts.filter((c) => c.waiting + c.serving > 0).map((c) => (
          <div key={c.code} className="qd-count" style={{ ['--qc' as string]: c.colour }}><b>{c.waiting}</b>{c.name} waiting</div>
        ))}
      </div>
    </div>
  );
}
