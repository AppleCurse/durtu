import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * Lint politikası.
 *
 * "error" = build'i durdurur. Bunlar doğruluk/güvenlik sınıfı kurallardır.
 * "warn"  = teknik borç olarak izlenir (CI'ı kırmaz ama görünür kalır).
 *
 * React Compiler kuralları da dahil olmak üzere depo şu anda SIFIR uyarı ile
 * temizdir ve `--max-warnings=0` ile bu durum korunur. Kaçınılmaz birkaç istisna
 * (hidrasyon güvenliği, uzun ömürlü oyun döngüleri) satır bazında ve
 * gerekçesiyle birlikte disable edilmiştir — yeni disable eklemek yerine
 * kodu düzeltmek tercih edilmelidir.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'public/**'],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // ——— Doğruluk sınırı: build'i durdurur ———
      // 47 adet sessiz catch bu projedeki en büyük teşhis kör noktasıydı.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-implicit-coercion': ['error', { boolean: false }],

      // ——— İzlenen teknik borç ———
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  {
    files: ['tests/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
