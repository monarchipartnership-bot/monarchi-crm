import io


def rw(p, pairs):
    s = io.open(p, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    t = s.replace('\r\n', '\n')
    for a, b in pairs:
        assert t.count(a) == 1, (p, a[:90], t.count(a))
        t = t.replace(a, b)
    if crlf:
        t = t.replace('\n', '\r\n')
    io.open(p, 'w', encoding='utf-8', newline='').write(t)
    print('ok', p)


rw('src/lib/agents/cycleFormFill.js', [
    (" \"count\":ціле від 1 до ${MAX_CONCEPTS} або null,\n \"ratios\":[формати з: ${ratios}] або null,\n",
     " \"count\":ціле від 1 до ${MAX_CONCEPTS} або null, \"count_quote\":\"точна цитата з опису, з якої взято count, або порожньо\",\n \"ratios\":[формати з: ${ratios}] або null, \"ratios_quote\":\"точна цитата з опису про формати, або порожньо\",\n"),
    ("Якщо менеджер назвав загальну кількість креативів і формати, поділи: «10 креативів 1:1» це count 10 і один формат; «6 креативів у двох форматах» це count 3.",
     "Число перед предметом (на кшталт «17 кроликів») це не кількість ідей, доки менеджер не скаже «ідей», «напрямів» чи «креативів». Якщо менеджер назвав загальну кількість креативів і формати, поділи: «8 креативів 1:1» це count 8 і один формат; «6 креативів у двох форматах» це count 3. count і ratios став лише тоді, коли в описі є пряма цитата, її поверни в count_quote і ratios_quote; без цитати став null."),
    ("export function parseFill(raw) {", "// text: the description the model was given; with it a number or a format the model cannot quote from the description is dropped (the model must not invent them)\nconst norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\\s+/g, ' ').trim();\nexport function parseFill(raw, text = null) {"),
    ("  const count = Math.round(Number(j.count));\n  if (Number.isFinite(count) && count >= 1) fields.count = Math.min(MAX_CONCEPTS, count);\n",
     "  const said = (quote) => { const q = norm(quote); return text == null || (q.length >= 2 && norm(text).includes(q)); };\n  const quotes = {};\n  let clamped = null; // the number the person named when it is above the maximum\n  const count = Math.round(Number(j.count));\n  if (Number.isFinite(count) && count >= 1 && said(j.count_quote)) { fields.count = Math.min(MAX_CONCEPTS, count); if (count > MAX_CONCEPTS) clamped = count; if (clip(j.count_quote, 120)) quotes.count = clip(j.count_quote, 120); }\n"),
    ("  if (ratios.length) fields.ratios = ratios;\n", "  if (ratios.length && said(j.ratios_quote)) { fields.ratios = ratios; if (clip(j.ratios_quote, 120)) quotes.ratios = clip(j.ratios_quote, 120); }\n"),
    ("  return { fields, agent_settings, notes };\n}", "  return { fields, agent_settings, notes, quotes, clamped };\n}"),
])
rw('api/creative-form-fill.js', [
    ("res.status(200).json({ ...parseFill(result.text), costUsd: result.costUsd });", "res.status(200).json({ ...parseFill(result.text, text), costUsd: result.costUsd });"),
])
rw('src/lib/agents/creativeTeam.js', [
    ("// A request as the form sends it, cleaned:", "// A title from a long text: cut at a word, not in the middle of it\nexport function shortTitle(text, n = 60) {\n  const t = String(text ?? '').replace(/\\s+/g, ' ').trim();\n  if (t.length <= n) return t;\n  const cut = t.slice(0, n);\n  const sp = cut.lastIndexOf(' ');\n  return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:\\-–—\\s]+$/, '')}…`;\n}\n\n// A request as the form sends it, cleaned:"),
    ("return { title: clip(input.title, 100) || clip(brief.goal, 60), brief, materials };", "return { title: clip(input.title, 100) || shortTitle(brief.goal, 60), brief, materials };"),
])
rw('src/components/Projects/Teams/OneOffDialog.jsx', [
    ("{busy === item.role ? 'Виконується…' : `Запустити · ≈ $${(COST_PER_AGENT_RUN * 2).toFixed(2)}`}", "{busy === item.role ? 'Виконується…' : 'Запустити · до $0.05'}"),
    ("import { COST_PER_AGENT_RUN } from '../../../lib/agents/campaignModes';\n", ""),
])
rw('src/components/Projects/Teams/ScheduleCalendar.jsx', [
    ("            <p>Креативи будуть готові <b>{windowText(value.time)}</b>: вони не робляться миттєво (орієнтовно {WINDOW_MINUTES} хв).</p>",
     "            <p>{value.startNow ? 'Перший запуск іде зараз і займає кілька хвилин. Далі креативи за розкладом' : 'Креативи'} будуть готові <b>{windowText(value.time)}</b>: вони не робляться миттєво (орієнтовно {WINDOW_MINUTES} хв).</p>"),
    ("<p>{value.startNow ? 'Перший запуск зараз. ' : ''}{runs.length ? <>Найближчі запуски: <b>{runs.slice(0, 4).map(dayMonthOf).join(', ')}</b>.</> : null}</p>",
     "<p>{runs.length ? <>Найближчі запуски: <b>{runs.slice(0, 4).map(dayMonthOf).join(', ')}</b>.</> : null}</p>"),
])
W = 'src/components/Projects/Teams/LaunchTeamWizard.jsx'
rw(W, [
    ("перший запуск {p.startNow ? 'одразу' : `${p.mode === 'every' ? dayMonthOf(p.start) : 'за розкладом'} о ${p.time}`}; готово {windowText(p.time)}</li>",
     "перший запуск {p.startNow ? 'одразу, далі за розкладом' : `${p.mode === 'every' ? dayMonthOf(p.start) : 'за розкладом'} о ${p.time}`}; за розкладом готово {windowText(p.time)}</li>"),
    ("      setAn({ busy: false, error: '', filled: r.filled.filter((x) => /напрям|формат|текст|мов/.test(x)), notes: fill.notes || '' });",
     """      const q = fill.quotes || {};
      const parts = [];
      if (r.patch.count != null) parts.push(`кількість напрямів: ${r.patch.count}${q.count ? ` (з опису: «${q.count}»)` : ''}${fill.clamped ? `; ви назвали ${fill.clamped}, а за один запуск максимум ${MAX_CONCEPTS}` : ''}`);
      if (r.patch.ratios) parts.push(`формати: ${r.patch.ratios.join(', ')}${q.ratios ? ` (з опису: «${q.ratios}»)` : ''}`);
      if (r.patch.texts != null) parts.push('тексти на креативах');
      if (r.patch.language != null) parts.push('мову текстів');
      setAn({ busy: false, error: '', filled: parts, notes: `${fill.clamped ? `Більше ${MAX_CONCEPTS} ідей за запуск не буває: потрібно більше, запустіть ще одне разове завдання. ` : ''}${fill.notes || ''}`.trim() });"""),
])
rw('scripts/check-core.mjs', [
    ("  assert.throws(() => parseFill('not json'), /Не вдалося прочитати/);",
     """  // a number or a format the model cannot quote from the description is dropped; a number above the maximum is cut and reported
  const said = 'Мне нужно 17 кроликов. Мне нужно креативы с кроликами цветами помидорами и капустой';
  const bare = parseFill(JSON.stringify({ title: 'Кролики', product: 'кролики', count: 17, ratios: ['1:1'] }), said); // no quotes at all
  assert.deepEqual([bare.fields.count, bare.fields.ratios, bare.clamped], [undefined, undefined, null]);
  const quoted = parseFill(JSON.stringify({ product: 'кролики', count: 17, count_quote: '17 кроликов', ratios: ['9:16'], ratios_quote: 'сториз' }), said);
  assert.deepEqual([quoted.fields.count, quoted.clamped, quoted.quotes.count, quoted.fields.ratios], [10, 17, '17 кроликов', undefined]); // «сториз» is not in the text
  assert.equal(parseFill(JSON.stringify({ product: 'x', count: 5, count_quote: '5 ІДЕЙ' }), 'Потрібно 5  ідей для осені').fields.count, 5); // case and spaces do not matter
  assert.throws(() => parseFill('not json'), /Не вдалося прочитати/);"""),
    ("  assert.match(pr.system, /від 1 до 10/);", "  assert.match(pr.system, /від 1 до 10/);\n  assert.doesNotMatch(pr.system, /«10 креативів/); // no example number to anchor on\n  assert.match(pr.system, /17 кроликів/);\n  assert.equal(shortTitle('Нові рекламні креативи для Instagram про перуки з натурального волосся, 5 ідей'), 'Нові рекламні креативи для Instagram про перуки з…');\n  assert.equal(shortTitle('Короткий текст'), 'Короткий текст');"),
])
