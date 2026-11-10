import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction, currentCanAction } from '@/lib/session';
import {
  getTillClosing, getAdjacentTillClosingNos, tillDayEntries, tillUnpostedDocuments, closableTillsForUser, listTreasuryAccounts, type TillClosingListView,
} from '@/lib/tillClosings';
import { getDenominationLines } from '@/lib/denominations';
import { findPendingRoutedTask, isEligibleApprover, listWorkflowTasksForDocument } from '@/lib/workflow';
import { formatDate, formatDateTime } from '@/lib/format';
import { Page } from '@/components/layout/page';
import { DefinitionList, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Money } from '@/components/ui/money';
import { DocumentActionsMenu } from '@/components/ui/document-actions';
import { CardNav } from '@/components/ui/card-nav';
import { EditableCard } from '@/components/ui/editable-card';
import { DenominationGrid } from '@/components/ui/denomination-grid';
import {
  EditClosingForm, RefreshFiguresButton, SubmitButton, CancelApprovalButton, ApproveButton, RejectButton, DelegateButton, ReopenButton, PostButton, DeleteButton,
} from '../../till-closing-actions';

const VIEWS: TillClosingListView[] = ['open', 'pending', 'approved', 'posted'];

export default async function TillClosingDetailPage({ params, searchParams }: {
  params: Promise<{ no: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireAction('TILL_CLOSINGS_READ');
  const { no } = await params;
  const { view: viewRaw } = await searchParams;
  const view = VIEWS.includes(viewRaw as TillClosingListView) ? (viewRaw as TillClosingListView) : undefined;

  const c = await getTillClosing(no);
  if (!c) notFound();
  const [entries, inFlight, denomLines, canCreate, canApprove, canPost, tasks, { prevNo, nextNo }] = await Promise.all([
    tillDayEntries(c.till_bank_account_id, c.closing_date),
    c.posted ? Promise.resolve([]) : tillUnpostedDocuments(c.till_bank_account_id),
    getDenominationLines('TILL_CLOSING', no),
    currentCanAction('TILL_CLOSINGS_CREATE'),
    currentCanAction('TILL_CLOSINGS_APPROVE'),
    currentCanAction('TILL_CLOSINGS_POST'),
    listWorkflowTasksForDocument('TILL_CLOSING', no),
    getAdjacentTillClosingNos(no, view),
  ]);
  const isOwn = c.created_by === user.username;
  const isOpen = c.status === 'Open';
  const canEdit = isOpen && canCreate && isOwn;
  const [tills, treasuries] = canEdit ? await Promise.all([closableTillsForUser(user.username), listTreasuryAccounts()]) : [[], []];
  const routedTask = c.status === 'Pending Approval' ? await findPendingRoutedTask('TILL_CLOSING', no) : null;
  const canDecideThis = routedTask ? await isEligibleApprover(routedTask, user.id) : canApprove;
  const canCancelThis = canCreate && (routedTask?.requested_by ?? c.created_by) === user.username;
  const pendingWith = tasks.find((t) => t.status === 'PENDING')?.pending_with;
  const v = Number(c.variance);
  const q = view ? `?view=${view}` : '';

  return (
    <>
      <CardNav prevHref={prevNo ? `/till-closings/view/${prevNo}${q}` : null} nextHref={nextNo ? `/till-closings/view/${nextNo}${q}` : null} />
      <Page title={`${c.no} — Till Closing`}
        crumb={`${c.posted ? 'Posted' : c.status} · ${c.till_code} · ${formatDate(c.closing_date)} · ${c.cashier_username}${pendingWith ? ` · pending with ${pendingWith}` : ''}`} user={user}>
        <Toolbar>
          <Link href="/till-closings" className="btn ghost sm">← All closings</Link>
          <a className="btn ghost sm" href={`/print/till-closing/${encodeURIComponent(c.no)}`} target="_blank" rel="noreferrer">Print count sheet</a>
          <Spacer />
          {canEdit ? <DeleteButton no={c.no} className="btn ghost" /> : null}
          {canEdit ? <RefreshFiguresButton no={c.no} className="btn ghost" /> : null}
          {canEdit ? <SubmitButton no={c.no} className="btn ghost" /> : null}
          {c.status === 'Pending Approval' && canCancelThis ? <CancelApprovalButton no={c.no} className="btn ghost" /> : null}
          {c.status === 'Pending Approval' && canDecideThis ? (
            <>
              {routedTask ? <DelegateButton taskId={routedTask.id} className="btn ghost" /> : null}
              <ApproveButton no={c.no} />
              <RejectButton no={c.no} className="btn ghost" />
            </>
          ) : null}
          {c.status === 'Approved' && !c.posted && canApprove ? <ReopenButton no={c.no} className="btn ghost" /> : null}
          {c.status === 'Approved' && !c.posted && canPost ? <PostButton closing={c} className="btn" /> : null}
          <DocumentActionsMenu />
        </Toolbar>

        <EditableCard collapsible title="Closing details" sub="The till, the day, and what the ledger says should be in the drawer"
          canEdit={canEdit} form={<EditClosingForm closing={c} tills={tills} treasuries={treasuries} />} badge={<Pill status={c.posted ? 'Posted' : c.status} />}>
          <div className="grid g2">
            <DefinitionList items={[
              ['Document no.', <span className="mono" key="no">{c.no}</span>],
              ['Till', <><b className="mono">{c.till_code}</b> — {c.till_name}</>],
              ['Cashier', c.cashier_username],
              ['Closing date', formatDate(c.closing_date)],
              ['At close', c.return_to_treasury ? `Cash handed to ${c.treasury_code ?? '—'} (${c.treasury_name ?? ''})` : 'Float kept in the till'],
              ['Variance reason', c.variance_reason || '—'],
              c.decision_reason ? ['Decision reason', c.decision_reason] : null,
            ]} />
            <DefinitionList items={[
              ['Opening balance', <Money cents={c.opening_balance} key="o" />],
              ['Cash in', <Money cents={c.cash_in} key="i" />],
              ['Cash out', <Money cents={c.cash_out} key="x" />],
              ['System balance', <b key="s"><Money cents={c.system_balance} /></b>],
              ['Counted', <b key="c"><Money cents={c.counted_amount} /></b>],
              ['Variance', v ? <b key="v" className={v < 0 ? 'neg' : undefined}><Money cents={v} /> {v < 0 ? '(short)' : '(over)'}</b> : <span key="v" className="muted-cell">none — the count agrees</span>],
              c.posted ? ['Handed to treasury', <Money cents={c.returned_amount} key="r" />] : null,
              c.variance_journal_no ? ['Variance journal', <span className="mono" key="vj">{c.variance_journal_no}</span>] : null,
              c.handover_journal_no ? ['Handover journal', <span className="mono" key="hj">{c.handover_journal_no}</span>] : null,
              !c.posted && Number(c.till_balance_now) !== Number(c.system_balance) ? ['Till balance now', <span key="now" className="neg"><Money cents={c.till_balance_now} /> — has moved since; refresh the figures</span>] : null,
            ]} />
          </div>
        </EditableCard>

        <CollapsibleCard title="Cash count" sub="Note & coin count of the drawer — saved against the system balance">
          <DenominationGrid kind="TILL_CLOSING" docNo={no} lines={denomLines} amount={Number(c.system_balance)} editable={canEdit} amountLabel="System balance" varianceMode />
        </CollapsibleCard>

        {inFlight.length ? (
          <CollapsibleCard title="Awaiting posting on this till" sub="These must be posted or recalled before the closing can post">
            <TableWrap>
              <thead><tr><th>Document</th><th>Kind</th><th>Status</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {inFlight.map((d) => (
                  <tr key={d.no}>
                    <td className="mono"><Link href={`/branch-cash/view/${d.no}`}>{d.no}</Link></td>
                    <td>Cash office movement</td>
                    <td><Pill status={d.status} /></td>
                    <td className="num"><Money cents={d.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </CollapsibleCard>
        ) : null}

        <CollapsibleCard title="The day's movements" sub={`${entries.length} ledger entr${entries.length === 1 ? 'y' : 'ies'} on ${c.till_code} dated ${formatDate(c.closing_date)}`}>
          {entries.length ? (
            <TableWrap>
              <thead><tr><th>Journal</th><th>Document</th><th>Description</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.journal_no}<div className="tiny muted-cell">{e.module} · {e.event_type}</div></td>
                    <td className="mono">{e.document_no ?? '—'}</td>
                    <td>{e.description ?? '—'}</td>
                    <td className="num">{Number(e.amount) > 0 ? <Money cents={e.amount} /> : ''}</td>
                    <td className="num">{Number(e.amount) < 0 ? <Money cents={-Number(e.amount)} /> : ''}</td>
                    <td className="num"><Money cents={e.running_balance} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th colSpan={3} className="num">Day totals</th><th className="num"><Money cents={c.cash_in} /></th><th className="num"><Money cents={c.cash_out} /></th><th className="num"><Money cents={c.system_balance} /></th></tr></tfoot>
            </TableWrap>
          ) : <EmptyState icon="🏧" title="Nothing moved on this till that day" />}
        </CollapsibleCard>

        <CollapsibleCard title="Document trail" sub="Who raised this, and when">
          <DefinitionList items={[
            ['Created by', c.created_by || '—'],
            ['Created on', formatDateTime(c.created_at)],
            ['Posted by', c.posted_by || '—'],
            ['Posted on', formatDateTime(c.posted_at)],
          ]} />
        </CollapsibleCard>

        <CollapsibleCard title="Approval details" sub={`${tasks.length} approval step${tasks.length === 1 ? '' : 's'} routed`}>
          {tasks.length ? (
            <TableWrap>
              <thead><tr><th>Sent by</th><th>Sent date</th><th>Approver</th><th>Approved on</th><th /></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.requested_by || '—'}</td>
                    <td>{formatDateTime(t.requested_at)}</td>
                    <td className="muted-cell">{t.decided_by || t.pending_with || '—'}</td>
                    <td>{t.decided_at ? formatDateTime(t.decided_at) : '—'}</td>
                    <td><Pill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : <EmptyState icon="🕓" title="Not yet sent for approval" />}
        </CollapsibleCard>
      </Page>
    </>
  );
}
