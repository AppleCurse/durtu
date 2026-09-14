// DÜRTÜ — Mines kural motoru (saf).
//
// BLOCKER #9 düzeltmesi: calcMultiplier, gems > 25 - mines olduğunda paydayı
// sıfıra/negatife düşürüp Infinity üretiyordu (örn. calc(3,23), calc(20,6)).
// Bugün yalnızca UI guard'ları maskeliyordu; fonksiyon kendi sözleşmesini korumuyordu.
// win(Infinity) → bakiye Infinity → ekonomi çöküşü.

export const GRID_SIZE = 25;
export const MINES_RTP = 0.97;
export const MAX_MULT = 1_000_000;

/**
 * Adil Mines çarpanı. Sınır dışı girdide Infinity yerine güvenli değer döner.
 * @param {number} mines 1..24
 * @param {number} gems  0..(25-mines)
 */
export function calcMultiplier(mines, gems) {
  if (!Number.isInteger(mines) || mines < 1 || mines >= GRID_SIZE) {
    throw new RangeError(`MINES_INVALID: mayın=${mines} (1..24 olmalı)`);
  }
  const safeTiles = GRID_SIZE - mines;
  if (!Number.isInteger(gems) || gems <= 0) return 1.0;

  let g = gems;
  if (g > safeTiles) {
    console.error(
      `[DURTU:mines] MINES_OVERDRAW: ${g} elmas istendi, yalnızca ${safeTiles} güvenli karo var`
    );
    g = safeTiles;
  }

  let num = 1;
  let den = 1;
  for (let i = 0; i < g; i++) {
    num *= GRID_SIZE - i;
    den *= safeTiles - i;
  }

  const raw = MINES_RTP * (num / den);
  if (!Number.isFinite(raw)) return MAX_MULT;
  return Math.min(MAX_MULT, Math.max(1.0, Math.round(raw * 100) / 100));
}

/** Mayın yerleşimi — benzersiz konumlar garanti. */
export function placeMines(mineCount, rng = Math.random) {
  const grid = Array(GRID_SIZE).fill(false);
  let placed = 0;
  let guard = 0;
  while (placed < mineCount && guard++ < GRID_SIZE * 100) {
    const idx = Math.floor(rng() * GRID_SIZE);
    if (!grid[idx]) {
      grid[idx] = true;
      placed++;
    }
  }
  return grid;
}
