import { NextResponse } from 'next/server';
import { GAMES } from '../../../lib/games';

// Statik seçki — CDN/ISR ile önbelleklenebilir.
// Eskiden 'force-dynamic' + her istekte Math.random() sıralaması vardı:
// hem cache tamamen devre dışı kalıyordu hem de sort(() => Math.random() - 0.5)
// istatistiksel olarak hatalı (düzgün olmayan) bir karıştırmaydı.
export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(
    { ok: true, data: GAMES, version: 1 },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
