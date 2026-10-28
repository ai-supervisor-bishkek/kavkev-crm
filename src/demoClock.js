// ДЕМО-ВЕРСИЯ: «замороженная» дата. Данные демо собраны на 27.10.2026, поэтому
// календарная дата сервера всегда сдвигается на этот день (время суток — реальное).
// Тот же сдвиг делает браузер (public/demo-clock.js) — обе стороны считают одинаково.
const DEMO_DATE = '2026-10-27';
const DAY = 86400000;
const TZ = 6 * 3600 * 1000; // Бишкек, UTC+6
const RealDate = Date;

function offsetMs() {
  const realBishkekDay = Math.floor((RealDate.now() + TZ) / DAY);
  const demoDay = Math.floor(RealDate.parse(DEMO_DATE + 'T00:00:00Z') / DAY);
  return (demoDay - realBishkekDay) * DAY;
}

class DemoDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offsetMs());
    else super(...args);
  }
  static now() { return RealDate.now() + offsetMs(); }
}

global.Date = DemoDate;
module.exports = { DEMO_DATE, offsetMs, RealDate };
