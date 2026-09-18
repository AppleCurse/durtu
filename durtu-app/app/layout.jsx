import './globals.css';

export const metadata = {
  title: 'DÜRTÜ — Kapalı Kulüp',
  description: 'Dürtü seni çağırıyor. Seçilmişler için küratörlü oyun deneyimi — konsept demosu.',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  themeColor: '#0A0A0A',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        {/*
          next/font ile self-hosting tercih edilirdi (layout shift yok, üçüncü
          taraf isteği yok), ancak next/font fontları BUILD SIRASINDA indirir:
          ağ erişimi olmayan/kısıtlı ortamlarda build kırılır ve derleme artık
          tekrarlanabilir olmaz. Bu yüzden runtime <link> korunuyor.

          Kalıcı çözüm: .woff2 dosyalarını public/fonts altına indirip
          next/font/local kullanmak — böylece hem offline build hem self-hosting.

          eslint-disable-next-line @next/next/no-page-custom-font
          (kural pages/ router'a özgüdür; App Router'da head burada doğrudur)
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router; bkz. yukarıdaki not */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
