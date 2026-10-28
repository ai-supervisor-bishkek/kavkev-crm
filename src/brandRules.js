// Уточнение бренда «Чистовье» (21.10.2026).
//
// Старое правило «название не с латиницы → Чистовье» (Фаза 14) отправляло в
// Чистовье косметику и инструменты Kapous/Studio с русским названием (оксиды
// ActiOx/Cremoxon, шампуни, маски, воски, фены…) и тестеры AV/PRO — ~16% «выручки
// Чистовье». Разбор: fix_brand_chistovie.md (21.10.2026).
//
// Правило теперь (применяется только к позициям, которые иначе стали бы «Чистовье»):
//   1. в названии «чистовье» или артикул вида 604-186 / 02-229 → Чистовье;
//   2. «тестер av/pro/es/ms …» → AV/ES/PRO/MS; «е …» (кириллица) → EPICA;
//   3. «studio» в названии → Studio;
//   4. артикул из 1–4 цифр (прайс Kapous) или «волосяные» ключевые слова → Kapous;
//   5. остальное (бахилы, перчатки, полотенца, дез.средства других производителей)
//      остаётся в Чистовье, как и раньше.

function norm(s) {
  return (s || '').toString().trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

const HAIR_WORDS = /(волос|шампун|бальзам|маск[аи] (с|для)|окисл|оксид|эмульси|cremoxon|actiox|blond bar|блонд|обесцвеч|краск[аи] для|красител|гель-краск|лак аэрозол|lacca|мусс|mousse|флюид|сыворотк|кератин|завивк|нейтрализатор|скраб|парафин|воск|депиляц|тальк|фен |фен«|брашинг|расческ|щетк|кисть|венчик|ключ-пресс|передник|сумка «чарли»|насос-дозатор|для бритья|после бритья|гель для душа|шелк для волос|сливки|масло арганы|макадами|root volume|multi spray|thermo barrier|volumetrick|rainbow|treatment|decoxon|shade off|модификатор|семинар|полоска для депиляции)/;

const CONSUMABLE_WORDS = /(миродез|антисептик|дезинфиц|дез\.|салфетк|бахил|перчатк|полотенц|простын|воротнич|нарукавник|тапочк|халат|фартук)/;

function articleKind(art) {
  const a = String(art || '').trim();
  if (!a) return '';
  if (/^\d{2,3}-\d{3}$/.test(a)) return 'chistovie';
  if (/^\d{1,4}$/.test(a)) return 'kapous';
  return 'other';
}

// product — название как в файле, brand — бренд, который дало старое правило,
// articles — data/import/articles.json (нормализованное название → артикул).
function refineBrand(product, brand, articles) {
  return brand; // Kav&Kev: линейка задаётся в данных, правила косметики не применяются
  if (brand !== 'Чистовье') return brand;
  const p = norm(product);
  const kind = articleKind(articles && articles[p]);
  if (p.includes('чистовье') || kind === 'chistovie') return 'Чистовье';
  if (/^тестер\s+(av|pro|es|ms)\b/.test(p)) return 'AV/ES/PRO/MS';
  if (/^е /.test(p)) return 'EPICA';
  if (p.includes('studio')) return 'Studio';
  if (CONSUMABLE_WORDS.test(p)) return 'Чистовье';
  if (kind === 'kapous' || HAIR_WORDS.test(p)) return 'Kapous';
  return 'Чистовье';
}

module.exports = { refineBrand, norm };
