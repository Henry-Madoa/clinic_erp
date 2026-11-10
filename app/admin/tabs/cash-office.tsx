/* Admin Centre tabs — cashiering. Rendered by app/admin/[[...tab]]/page.tsx; moved out of it so each area reads on its own. */
import { filterRows, parseFilters } from '@/lib/listFilters';
import { ListTools } from '@/components/ui/list-tools';
import { ADMIN_FIELDS } from '@/lib/listExports/admin';
import { getOrg } from '@/lib/org';
import { listUsers } from '@/lib/admin';
import { listActiveBankAccounts } from '@/lib/gl';
import { listCashierSetups } from '@/lib/cashierSetup';
import { listDenominations } from '@/lib/denominations';
import { Card, CardHead, EmptyState, Pill, TableWrap, Toolbar, Spacer } from '@/components/ui/primitives';
import { Money } from '@/components/ui/money';
import { CashierSetupFormButton, DeleteCashierSetupButton } from '../cashier-setup-form';
import { DenominationFormButton } from '../denomination-form';

export async function DenominationsTab({ filters }: { filters?: string } = {}) {
  const [allRows, org] = await Promise.all([listDenominations(), getOrg()]);
  const rows = filterRows(allRows, ADMIN_FIELDS['denominations'], parseFilters(filters));
  return (
    <>
      <Toolbar>
        <ListTools exportKey="denominations" fields={ADMIN_FIELDS['denominations']} filters={filters} count={rows.length} />
        <span className="tiny">
          Denomination validation is currently <b>{org?.validate_cash_denomination ? 'ON' : 'OFF'}</b>
          {' '}(General Ledger Setup → Cash handling)
        </span>
        <Spacer />
        <DenominationFormButton>Add denomination</DenominationFormButton>
      </Toolbar>
      <Card>
        <CardHead title="Cash Denominations" sub="The note & coin rows in the cashier count grid" />
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr><th>Code</th><th>Description</th><th className="num">Value</th><th>Status</th><th className="num">Order</th><th className="num" /></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.code}</td>
                  <td>{d.description}</td>
                  <td className="num"><Money cents={d.value} /></td>
                  <td><Pill tone={d.active ? 'ok' : ''}>{d.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="num">{d.sort_order}</td>
                  <td className="num"><DenominationFormButton row={d} className="btn sm ghost">Edit</DenominationFormButton></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : <EmptyState icon="🪙" title="No denominations defined" />}
      </Card>
    </>
  );
}

export async function CashierSetupTab({ filters }: { filters?: string } = {}) {
  const [allRows, bankAccounts, users] = await Promise.all([
    listCashierSetups(), listActiveBankAccounts(), listUsers(),
  ]);
  const rows = filterRows(allRows, ADMIN_FIELDS['cashier-setups'], parseFilters(filters));
  const userOptions = users.map((u) => ({ value: u.username, label: `${u.username} — ${u.full_name}` }));
  const accountOptions = bankAccounts
    .filter((b) => b.account_type === 'TILL' || b.account_type === 'TREASURY')
    .map((b) => ({ value: b.id, label: `${b.code} — ${b.name}`, type: b.account_type }));

  return (
    <>
      <Toolbar>
        <ListTools exportKey="cashier-setups" fields={ADMIN_FIELDS['cashier-setups']} filters={filters} count={rows.length} />
        <Spacer />
        <CashierSetupFormButton userOptions={userOptions} accountOptions={accountOptions}>Add cashier setup</CashierSetupFormButton>
      </Toolbar>
      <Card>
        <CardHead title="Cashier Setup" sub="Which cash float each cashier operates — front desk, restaurant, bar — and its capacity / approval limits" />
        {rows.length ? (
          <TableWrap>
            <thead>
              <tr>
                <th>User</th><th>Type</th><th>Cash account</th>
                <th className="num">Min capacity</th><th className="num">Max capacity</th>
                <th className="num">Approval limit</th><th className="num" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.user_username}</td>
                  <td><Pill tone={r.setup_type === 'TREASURY' ? 'accent' : 'info'}>{r.setup_type}</Pill></td>
                  <td><span className="mono">{r.bank_account_code}</span> — {r.bank_account_name}</td>
                  <td className="num"><Money cents={r.min_capacity} /></td>
                  <td className="num"><Money cents={r.max_capacity} /></td>
                  <td className="num">{r.setup_type === 'CASHIER' ? <Money cents={r.approval_limit} /> : '—'}</td>
                  <td className="num">
                    <div className="inline" style={{ justifyContent: 'flex-end' }}>
                      <CashierSetupFormButton userOptions={userOptions} accountOptions={accountOptions} row={r} className="btn sm ghost">Edit</CashierSetupFormButton>
                      <DeleteCashierSetupButton id={r.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        ) : (
          <EmptyState icon="🧑‍💼" title="No cashier setups yet"
            sub="Add a CASHIER setup pointing a cashier at a float, or a TREASURY setup pointing the general cashier at the vault." />
        )}
      </Card>
    </>
  );
}
