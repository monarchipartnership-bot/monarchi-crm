// Waits until `get()` returns something (a report drawn out of sight hands over its export handle only once it is mounted), or fails after `ms`.
export async function waitFor(get, ms = 8000, step = 80) {
  const began = Date.now();
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() - began > ms) throw new Error('Звіт не встиг відобразитись. Спробуйте ще раз.');
    await new Promise((resolve) => setTimeout(resolve, step));
  }
}
