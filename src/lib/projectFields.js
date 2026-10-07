import { BUSINESS_CATEGORIES } from './businessNiches';

// Project fields that were added for the registry table (migration
// 20261006020000_project_registry_fields.sql). One list drives the create
// form, the project card's edit mode and the registry columns, so a field is
// defined in exactly one place.
export const EXTRA_PROJECT_FIELDS = [
  { key: 'business_type', label: 'Тип бізнесу', type: 'select', options: BUSINESS_CATEGORIES },
  { key: 'specialist', label: 'Спеціаліст', type: 'text', placeholder: "Ім'я спеціаліста" },
  { key: 'contacts', label: 'Контакти', type: 'text', placeholder: 'Email, телефон' },
  { key: 'timezone', label: 'Часовий пояс', type: 'text', placeholder: 'напр. UTC+2, EST' },
  { key: 'comm_start_date', label: 'Початок комунікації', type: 'date' },
  { key: 'stop_reason', label: 'Причина зупинки роботи', type: 'text', placeholder: 'Якщо роботу зупинено' },
  { key: 'payment_channel', label: 'Канал оплати', type: 'text', placeholder: 'напр. Payoneer' },
  { key: 'cost', label: 'Вартість, $', type: 'number', placeholder: '0' },
  { key: 'worksection_link', label: 'Лінк в Worksection', type: 'url', placeholder: 'https://...' },
];

// Form state -> columns: empty strings become null, cost becomes a number.
export function extraFieldsPayload(form) {
  const out = {};
  for (const f of EXTRA_PROJECT_FIELDS) {
    const raw = form[f.key];
    if (f.type === 'number') out[f.key] = raw === '' || raw == null ? null : Number(raw);
    else out[f.key] = typeof raw === 'string' ? (raw.trim() || null) : (raw || null);
  }
  return out;
}

// Project row -> form state (nulls become '').
export function extraFieldsForm(project) {
  const out = {};
  for (const f of EXTRA_PROJECT_FIELDS) out[f.key] = project?.[f.key] ?? '';
  return out;
}

export function fmtCost(v) {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '—';
  return '$' + n.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
