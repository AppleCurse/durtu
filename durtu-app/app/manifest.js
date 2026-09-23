export default function manifest() {
  return {
    name: 'DÜRTÜ — Kapalı Kulüp',
    short_name: 'DÜRTÜ',
    description: 'Dürtü seni çağırıyor. Seçilmişler için küratörlü oyun deneyimi.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#D4AF37',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
