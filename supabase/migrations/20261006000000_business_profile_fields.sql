-- Business profile shared by a contact (clients) and its deals: two-level niche
-- (category -> niche), promotion channel (reuses the deal_service_tags catalog,
-- relabelled "Канал просування" in the UI), promotion GEO (several countries),
-- goals, what already worked + results, and a free "other" note. The same
-- column names live on both tables so the app can mirror edits between them.
-- Additive only: nothing is dropped or rewritten except the backfills below.

alter table deals
  add column if not exists business_category text,
  add column if not exists promo_geo text[] not null default '{}',
  add column if not exists goals text,
  add column if not exists previous_results text,
  add column if not exists other_notes text;

alter table clients
  add column if not exists business_category text,
  add column if not exists promo_geo text[] not null default '{}',
  add column if not exists goals text,
  add column if not exists previous_results text,
  add column if not exists other_notes text,
  add column if not exists service_tag_ids uuid[] not null default '{}';

-- "Consultation" joins the promotion-channel catalog.
insert into deal_service_tags (label, color, position) values ('Consultation', '#7C3AED', 6)
on conflict (label) do nothing;

-- Backfills (best effort, only where the new column is still empty): the old
-- free-text client goal becomes "Цілі"; a niche that belongs to exactly one
-- category picks that category up. Niches that fit both categories (health,
-- beauty, fitness, food...) stay without a category until someone sets it.
update clients set goals = goal_launch where goals is null and goal_launch is not null and goal_launch <> '';

update deals set business_category = 'E-commerce'
 where business_category is null
   and niche in ('E-commerce / Інтернет-магазини', 'Мода та одяг', 'Електроніка та гаджети', 'Дитячі товари',
                 'Меблі та інтер’єр', 'Домашні тварини', 'Ювелірні вироби та аксесуари');
update clients set business_category = 'E-commerce'
 where business_category is null
   and niche in ('E-commerce / Інтернет-магазини', 'Мода та одяг', 'Електроніка та гаджети', 'Дитячі товари',
                 'Меблі та інтер’єр', 'Домашні тварини', 'Ювелірні вироби та аксесуари');

update deals set business_category = 'Проєкти лідогенерації'
 where business_category is null
   and niche in ('Нерухомість', 'Будівництво та ремонт', 'Автомобілі та автопослуги', 'Подорожі та туризм',
                 'Освіта та онлайн-курси', 'Фінанси та інвестиції', 'Страхування', 'Юридичні послуги',
                 'Консалтинг та B2B послуги', 'IT та технології', 'SaaS та софт', 'Логістика та транспорт',
                 'Виробництво', 'Сільське господарство', 'Енергетика та еко-рішення', 'Телекомунікації',
                 'Медіа та видавництво', 'Некомерційні організації', 'Івенти та організація заходів', 'HR та рекрутинг');
update clients set business_category = 'Проєкти лідогенерації'
 where business_category is null
   and niche in ('Нерухомість', 'Будівництво та ремонт', 'Автомобілі та автопослуги', 'Подорожі та туризм',
                 'Освіта та онлайн-курси', 'Фінанси та інвестиції', 'Страхування', 'Юридичні послуги',
                 'Консалтинг та B2B послуги', 'IT та технології', 'SaaS та софт', 'Логістика та транспорт',
                 'Виробництво', 'Сільське господарство', 'Енергетика та еко-рішення', 'Телекомунікації',
                 'Медіа та видавництво', 'Некомерційні організації', 'Івенти та організація заходів', 'HR та рекрутинг');
