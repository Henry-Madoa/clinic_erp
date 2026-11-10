/*
 * Cashier Setup — AL Tab52204042. Links a user to the cash account they operate: a CASHIER to
 * their own till (bank_account.account_type = 'TILL'), or a TREASURY user to the branch vault
 * (account_type = 'TREASURY'). The capacity limits gate cash_office_transfer posting
 * (lib/cashManagement.ts).
 */
import { one, all, run, audit } from './db.ts';
import { AppError } from './errors.ts';
import type { Actor, BankAccountType, Cents, CashierSetup, CashierSetupWithAccount } from './types.ts';

const SELECT_ROW = `
  SELECT ts.*, b.code AS bank_account_code, b.name AS bank_account_name, b.account_type AS bank_account_type
  FROM cashier_setup ts
  JOIN bank_account b ON b.id = ts.bank_account_id`;

export const listCashierSetups = (): Promise<CashierSetupWithAccount[]> =>
  all<CashierSetupWithAccount>(`${SELECT_ROW} ORDER BY ts.setup_type, ts.user_username`);

const getCashierSetup = (
  username: string, setupType: 'CASHIER' | 'TREASURY',
): Promise<CashierSetupWithAccount | undefined> =>
  one<CashierSetupWithAccount>(
    `${SELECT_ROW} WHERE ts.user_username = ? AND ts.setup_type = ?`, username, setupType,
  );

export const cashierSetupForUser = (username: string): Promise<CashierSetupWithAccount | undefined> =>
  getCashierSetup(username, 'CASHIER');

export const treasurySetupForUser = (username: string): Promise<CashierSetupWithAccount | undefined> =>
  getCashierSetup(username, 'TREASURY');

/** Whichever Cashier Setup owns a given bank account (used by the capacity checks to look up the
 *  right max/min limits for a source or destination account). */
export const setupForBankAccount = (bankAccountId: number): Promise<CashierSetup | undefined> =>
  one<CashierSetup>('SELECT * FROM cashier_setup WHERE bank_account_id = ? LIMIT 1', bankAccountId);

interface CashierSetupInput {
  userUsername: string;
  setupType: 'CASHIER' | 'TREASURY';
  bankAccountId: number;
  maxCapacity: Cents;
  minCapacity: Cents;
  approvalLimit: Cents;
}

const REQUIRED_ACCOUNT_TYPE: Record<'CASHIER' | 'TREASURY', BankAccountType> = {
  CASHIER: 'TILL',
  TREASURY: 'TREASURY',
};

async function assertValid(input: CashierSetupInput): Promise<void> {
  if (!input.userUsername?.trim()) throw new AppError('A user is required', 'VALIDATION');
  if (!['CASHIER', 'TREASURY'].includes(input.setupType)) throw new AppError('Invalid setup type', 'VALIDATION');
  if (!(await one('SELECT 1 FROM app_user WHERE username = ?', input.userUsername))) {
    throw new AppError('That user does not exist', 'VALIDATION');
  }
  const acct = await one<{ account_type: BankAccountType }>(
    'SELECT account_type FROM bank_account WHERE id = ?', input.bankAccountId,
  );
  if (!acct) throw new AppError('Cash account not found', 'NOT_FOUND');
  const need = REQUIRED_ACCOUNT_TYPE[input.setupType];
  if (acct.account_type !== need) {
    throw new AppError(`A ${input.setupType} must be linked to a ${need} cash account`, 'VALIDATION');
  }
  if (input.minCapacity > input.maxCapacity && input.maxCapacity > 0) {
    throw new AppError('Minimum capacity cannot exceed maximum capacity', 'VALIDATION');
  }
}

export async function upsertCashierSetup(input: CashierSetupInput, user: Actor): Promise<{ id: number }> {
  await assertValid(input);
  const existing = await one<{ id: number }>(
    'SELECT id FROM cashier_setup WHERE user_username = ? AND setup_type = ?',
    input.userUsername, input.setupType,
  );
  if (existing) {
    await run(
      `UPDATE cashier_setup SET bank_account_id = ?, max_capacity = ?, min_capacity = ?, approval_limit = ?
       WHERE id = ?`,
      input.bankAccountId, Math.round(input.maxCapacity), Math.round(input.minCapacity),
      Math.round(input.approvalLimit), existing.id,
    );
    await audit(user, 'CASHIER_SETUP_UPDATE', 'cashier_setup', existing.id, { user: input.userUsername });
    return { id: existing.id };
  }
  const info = await run(
    `INSERT INTO cashier_setup (user_username, setup_type, bank_account_id, max_capacity, min_capacity, approval_limit, created_at, created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    input.userUsername, input.setupType, input.bankAccountId, Math.round(input.maxCapacity),
    Math.round(input.minCapacity), Math.round(input.approvalLimit), new Date().toISOString(), user.username,
  );
  await audit(user, 'CASHIER_SETUP_CREATE', 'cashier_setup', info.lastInsertRowid, { user: input.userUsername });
  return { id: Number(info.lastInsertRowid) };
}

export async function deleteCashierSetup(id: number, user: Actor): Promise<void> {
  const before = await one<{ user_username: string }>('SELECT user_username FROM cashier_setup WHERE id = ?', id);
  if (!before) throw new AppError('Cashier Setup not found', 'NOT_FOUND');
  await run('DELETE FROM cashier_setup WHERE id = ?', id);
  await audit(user, 'CASHIER_SETUP_DELETE', 'cashier_setup', id, { user: before.user_username });
}
