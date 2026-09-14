import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

/**
 * Lint politikası.
 *
 * "error" = build'i durdurur. Bunlar doğruluk/güvenlik sınıfı kurallardır.
 * "warn"  = teknik borç olarak izlenir (CI'ı kırmaz ama görünür kalır).
 *
 * Not: React Compiler kuralları (set-state-in-effect, purity, refs-during-render)
 * bilinçli olarak "warn" seviyesindedir. Gerçek bulgulardır ancak her biri
 * bileşen bazında refactor gerektirir; bkz. CODE_REVIEW_RELEASE_BLOCKERS.md
 * "Kod Kalitesi" bölümü. Sayıları artmamalı — azalmalıdır.
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
