// ДЕМО-ВЕРСИЯ: та же «замороженная» дата, что и на сервере (src/demoClock.js).
(function () {
  var DEMO_DATE = '2026-10-27';
  var DAY = 86400000, TZ = 6 * 3600 * 1000;
  var RealDate = window.Date;
  function offsetMs() {
    var realDay = Math.floor((RealDate.now() + TZ) / DAY);
    var demoDay = Math.floor(RealDate.parse(DEMO_DATE + 'T00:00:00Z') / DAY);
    return (demoDay - realDay) * DAY;
  }
  class DemoDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offsetMs());
      else super(...args);
    }
    static now() { return RealDate.now() + offsetMs(); }
  }
  window.Date = DemoDate;
})();
