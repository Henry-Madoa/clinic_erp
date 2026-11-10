'use client';

import { useFormat } from './format-provider';
import type { Cents } from '@/lib/types';

interface MoneyProps {
  cents: Cents | null | undefined;
  /** Fraction digits. 0 for the compact table columns. */
  decimals?: number;
  /** false inside statement columns, where the currency is stated in the heading. */
  symbol?: boolean;
  /** "KSh 1.2M" instead of the full figure. */
  short?: boolean;
}

/** A monetary amount in the society's currency. */
export function Money({ cents, decimals = 2, symbol = true, short = false }: MoneyProps) {
  const { cur, curShort } = useFormat();
  return <>{short ? curShort(cents) : cur(cents, { decimals, showSymbol: symbol })}</>;
}
