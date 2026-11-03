// «1 етап, 2 етапи, 5 етапів»: the form of a noun after a number in Ukrainian. forms = [one, few, many].
export function pluralUk(n, forms) {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  return forms[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2];
}
