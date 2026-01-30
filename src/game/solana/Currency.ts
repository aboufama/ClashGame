export const SOLANA_CURRENCY = {
  symbol: 'SOL',
  decimals: 9,
  displayDecimals: 2,
  displayName: 'Solana',
};

export function toLamports(sol: number): number {
  return Math.round(sol * 10 ** SOLANA_CURRENCY.decimals);
}

export function fromLamports(lamports: number): number {
  return lamports / 10 ** SOLANA_CURRENCY.decimals;
}

export function formatSol(sol: number, compact: boolean = false, withSymbol: boolean = true): string {
  if (compact) {
    if (sol >= 1_000_000) {
      const formatted = `${(sol / 1_000_000).toFixed(1)}M`;
      return withSymbol ? `${formatted} ${SOLANA_CURRENCY.symbol}` : formatted;
    }
    if (sol >= 1_000) {
      const formatted = `${(sol / 1_000).toFixed(1)}K`;
      return withSymbol ? `${formatted} ${SOLANA_CURRENCY.symbol}` : formatted;
    }
  }
  const formatted = sol.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: SOLANA_CURRENCY.displayDecimals,
  });
  return withSymbol ? `${formatted} ${SOLANA_CURRENCY.symbol}` : formatted;
}
