// Doğru Fisher-Yates karıştırma.
// sort(() => Math.random() - 0.5) tutarsız karşılaştırıcıdır: dağılımı düzgün değildir
// ve V8'in TimSort'unda tanımsız davranışa yol açar.
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
