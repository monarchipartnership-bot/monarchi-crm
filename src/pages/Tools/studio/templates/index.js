import ServicePortrait from './ServicePortrait';
import WebEditorial, { WEB_TAGS_MAX } from './WebEditorial';
import PhoneTrio from './PhoneTrio';
import { DataLedger, DiagonalSplit, RoyalEditorial } from './catalog';
import {
  AccentSplit, PhotoBackdrop, PortraitLeft, StatHero, WebPoster,
} from './web';
import { CodeTerminal, MobilePoster, MobileSplit } from './mobile';

// Registry of the DOM covers.
//   type    which cover family the panel groups it under (catalog/web/mobile)
//   fields  which copy fields the template actually shows (the panel only
//           renders these)
//   images  upload slots the template uses (key -> label)
//   sizes   which text-size sliders apply
const PERSON = { key: 'person', label: 'Фото людини', hint: 'Бажано PNG без фону' };
const IMAGE = { key: 'main', label: 'Головне зображення', hint: 'Скріншот або фото' };
const SHOT = { key: 'main', label: 'Скріншот сайту', hint: 'Скріншот сайту чи застосунку' };
const SCREENS = [
  { key: 'main', label: 'Екран 1', hint: 'Скріншот застосунку' },
  { key: 's2', label: 'Екран 2', hint: 'Скріншот застосунку' },
  { key: 's3', label: 'Екран 3', hint: 'Скріншот застосунку' },
];

const COPY = ['kicker', 'title', 'accent', 'subtitle', 'metrics'];

export const TEMPLATES = [
  // ---- catalog ----
  {
    id: 'servicePortrait', nm: 'Service Portrait', type: 'catalog', component: ServicePortrait,
    fields: COPY, images: [PERSON], sizes: ['title', 'sub', 'num'],
  },
  {
    id: 'royalEditorial', nm: 'Royal Editorial', type: 'catalog', component: RoyalEditorial,
    fields: COPY, images: [IMAGE], sizes: ['title', 'sub', 'num'],
  },
  {
    id: 'diagonalSplit', nm: 'Diagonal Split', type: 'catalog', component: DiagonalSplit,
    fields: COPY, images: [IMAGE], sizes: ['title', 'sub', 'num'],
  },
  {
    id: 'dataLedger', nm: 'Data Ledger', type: 'catalog', component: DataLedger,
    fields: COPY, images: [IMAGE], sizes: ['title', 'sub', 'num'],
  },
  // ---- web ----
  {
    id: 'webEditorial', nm: 'Web Editorial', type: 'web', component: WebEditorial,
    fields: ['kicker', 'title', 'accent', 'subtitle', 'url', 'tags', 'metrics'], images: [SHOT],
    sizes: ['title', 'sub', 'tags', 'num'], tagsMax: WEB_TAGS_MAX,
  },
  {
    id: 'statHero', nm: 'Stat Hero', type: 'web', component: StatHero,
    fields: ['kicker', 'title', 'accent', 'subtitle', 'tags', 'metrics'], images: [SHOT],
    sizes: ['title', 'sub', 'tags', 'num'], tagsMax: 4,
  },
  {
    id: 'accentSplit', nm: 'Accent Split', type: 'web', component: AccentSplit,
    fields: ['kicker', 'title', 'accent', 'subtitle', 'tags', 'metrics'], images: [SHOT],
    sizes: ['title', 'sub', 'tags', 'num'], tagsMax: 4,
  },
  {
    id: 'webPoster', nm: 'Web Poster', type: 'web', component: WebPoster,
    fields: ['kicker', 'title', 'accent', 'subtitle', 'url', 'tags', 'metrics'], images: [SHOT],
    sizes: ['title', 'sub', 'tags', 'num'], tagsMax: 4,
  },
  {
    id: 'portraitLeft', nm: 'Portrait Left', type: 'web', component: PortraitLeft,
    fields: ['kicker', 'title', 'accent', 'subtitle', 'tags', 'metrics'], images: [PERSON],
    sizes: ['title', 'sub', 'tags', 'num'], tagsMax: 4,
  },
  {
    id: 'photoBackdrop', nm: 'Photo Backdrop', type: 'web', component: PhotoBackdrop,
    fields: COPY, images: [{ key: 'main', label: 'Фото на фон', hint: 'Зображення на всю обкладинку' }],
    sizes: ['title', 'sub', 'num'],
  },
  // ---- mobile ----
  {
    id: 'phoneTrio', nm: 'Phone Trio', type: 'mobile', component: PhoneTrio,
    fields: ['kicker', 'title', 'accent', 'subtitle'], images: [PERSON, ...SCREENS], sizes: ['title', 'sub'],
  },
  {
    id: 'mobileSplit', nm: 'Mobile Split', type: 'mobile', component: MobileSplit,
    fields: COPY, images: SCREENS, sizes: ['title', 'sub', 'num'],
  },
  {
    id: 'mobilePoster', nm: 'Mobile Poster', type: 'mobile', component: MobilePoster,
    fields: COPY, images: SCREENS, sizes: ['title', 'sub', 'num'],
  },
  {
    id: 'codeTerminal', nm: 'Code Terminal', type: 'mobile', component: CodeTerminal,
    fields: COPY, images: SCREENS, sizes: [],
  },
];

export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));
export const templatesOf = (type) => TEMPLATES.filter((t) => t.type === type);
