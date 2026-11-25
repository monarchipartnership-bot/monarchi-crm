import { createProject } from './projects';
import { addProjectAccount } from './projectAccounts';
import { patchState, requestRun, startProcess } from './workflow';
import { QUICK_STEPS, nameFromSite, normalizeSite } from '../workflow/quickStart';

// «Швидкий старт»: the project, its process and the draft of the brief from one link. The first launch will be PAUSED and the process waits for the manager to confirm the brief.
// → { project, warnings[] }. A failing cabinet link or draft request does not hide the project that exists now.
export async function quickStart({ website, name, country, account }, email) {
  const site = normalizeSite(website);
  if (!site) throw new Error('Вкажіть адресу сайту повністю, наприклад https://example.com');
  const project = await createProject({ name: String(name || '').trim() || nameFromSite(site), website: site, country: String(country || '').trim() || null, manager: email || null, services: [] }, email);
  const warnings = [];
  if (account) { try { await addProjectAccount({ projectId: project.id, platform: 'meta', account, createdBy: email }); } catch (e) { warnings.push(`Кабінет Meta не підключився: ${e.message || e}`); } }
  try {
    await startProcess(project.id, email);
    await patchState(project.id, { launch_paused: true, brief_pending: true }, email, 'Швидкий старт: перший запуск піде вимкненим (PAUSED), бриф чекає підтвердження.');
    await requestRun(project.id, 'researcher', 'brief_draft', email);
  } catch (e) { warnings.push(`Процес не запущено до кінця: ${e.message || e}. Відкрийте проєкт і натисніть «Запустити процес».`); }
  return { project, warnings };
}
export { QUICK_STEPS };
