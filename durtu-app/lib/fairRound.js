// DÜRTÜ — tur başlatma sözleşmesi: commit → play → reveal.
// Oyun bileşenleri bu kapıyı kullanır; böylece her tur BAŞLAMADAN kilitlenir
// ve panelden bağımsız doğrulanabilir.
'use client';
import { randomSeed, commitHash, seededRng } from './engines/provablyFair.js';
import { crashPoint } from './engines/crash.js';
import { placeMines } from './engines/mines.js';
import { getFairIdentity, bumpFairNonce, setLastFairRound } from './store.js';

function begin(game, produce, extra) {
  const { clientSeed, nonce } = getFairIdentity();
  const serverSeed = randomSeed();
  const hash = commitHash(serverSeed);           // 1) KİLİT: turdan önce
  const result = produce(seededRng(serverSeed, clientSeed, nonce)); // 2) oyun
  const round = { game, serverSeed, clientSeed, nonce, hash, result, ...extra };
  bumpFairNonce();                                // 3) sonraki tur yeni nonce
  setLastFairRound(round);                        // 4) reveal paketi panelde
  return round;
}

export const beginCrashRound = () => begin('crash', rng => crashPoint(rng));
export const beginMinesRound = mineCount =>
  begin('mines', rng => placeMines(mineCount, rng), { minesCount: mineCount });
