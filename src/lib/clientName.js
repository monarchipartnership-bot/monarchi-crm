// Client display name = first name ("Ім'я") + last name ("Прізвище"), stored
// as two separate columns on `clients` but shown together almost everywhere.
export function clientFullName(client) {
  return [client?.name, client?.last_name].filter(Boolean).join(' ');
}

// Splits a single "Ім'я Прізвище" string into the two columns above — used
// when a client is auto-created from a report's own single combined name
// field (Daily/Weekly client lists, deal import, the deal ClientPicker),
// so the profile's separate Ім'я/Прізвище fields get filled correctly
// instead of the whole string landing in Ім'я alone.
export function splitClientName(fullName) {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { name: '', lastName: '' };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { name: first, lastName: rest.join(' ') };
}
