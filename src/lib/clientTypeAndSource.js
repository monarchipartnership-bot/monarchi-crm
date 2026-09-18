// Shared between ClientProfile.jsx ("Тип контакту"/"Source" fields) and the
// NetHunt contacts importer, so both always offer/accept the exact same
// values — a value imported from NetHunt that isn't in these lists would
// otherwise silently fail to show in the profile's picker (Select only
// renders a value it finds in its own options).
export const CONTACT_TYPES = ['Client lead', 'Active client', 'Lost client', 'Partner'];
export const SOURCES = ['Upwork', 'Facebook ads', 'Call tracking', 'Partner lead', 'Recommendation', 'Instagram', 'LinkedIn', 'Freelancehunt', 'Website', 'Крео'];
