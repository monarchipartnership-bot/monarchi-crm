import { createClient } from '@supabase/supabase-js';

const SUPA_URL = 'https://meyacsdlosuqbkbichsf.supabase.co';
const SUPA_KEY = 'sb_publishable_jnJ1vdEUtn8ytNdJ4KT5Eg_TVlzWYcA';

export const supabase = createClient(SUPA_URL, SUPA_KEY);
