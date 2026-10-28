// Kav&Kev (демо): справочник ассортимента и вэн-агентов.
// Названия и граммовки сэндвичей — по открытым каталогам магазинов Бишкека
// (kampa.kg, asia.kg, globus-online.kg); цены и сроки годности — демонстрационные.
const PRODUCTS = [
  { sku: 'KK-01', name: 'Сэндвич «Нежный» с майонезом, малый 130 г', line: 'Классика', price: 31, shelfH: 72 },
  { sku: 'KK-02', name: 'Сэндвич с майонезом и кетчупом, большой 200 г', line: 'Классика', price: 38, shelfH: 72 },
  { sku: 'KK-03', name: 'Сэндвич «Нежный» с майонезом, большой 215 г', line: 'Классика', price: 42, shelfH: 72 },
  { sku: 'KK-04', name: 'Сэндвич «Нежный» с кетчупом, большой 215 г', line: 'Классика', price: 42, shelfH: 72 },
  { sku: 'KK-05', name: 'Сэндвич с куриной котлетой 200 г', line: 'Мясные', price: 46, shelfH: 48 },
  { sku: 'KK-06', name: 'Сэндвич с говяжьей котлетой 200 г', line: 'Мясные', price: 52, shelfH: 48 },
  { sku: 'KK-07', name: 'Сэндвич с котлетой из говядины и курицы 200 г', line: 'Мясные', price: 48, shelfH: 48 },
  { sku: 'KK-08', name: 'Сэндвич с копчёной курицей 200 г', line: 'Мясные', price: 50, shelfH: 48 },
  { sku: 'KK-09', name: 'Сэндвич «Чеддер» 220 г', line: 'Премиум', price: 58, shelfH: 48 },
  { sku: 'KK-10', name: 'Сэндвич «Кебаб» 250 г', line: 'Премиум', price: 65, shelfH: 48 }
];
const LINES = ['Классика', 'Мясные', 'Премиум'];

const AGENTS = [
  { name: 'Азамат', email: 'van01@kavkev.demo', van: 'Вэн-01', plate: '01 101 AKK', center: [42.8746, 74.6122], zone: 'Центр' },
  { name: 'Бакыт', email: 'van02@kavkev.demo', van: 'Вэн-02', plate: '01 102 AKK', center: [42.8420, 74.5930], zone: 'Юг' },
  { name: 'Эрлан', email: 'van03@kavkev.demo', van: 'Вэн-03', plate: '01 103 AKK', center: [42.8790, 74.5620], zone: 'Запад' },
  { name: 'Нурбек', email: 'van04@kavkev.demo', van: 'Вэн-04', plate: '01 104 AKK', center: [42.8640, 74.6820], zone: 'Восток' },
  { name: 'Руслан', email: 'van05@kavkev.demo', van: 'Вэн-05', plate: '01 105 AKK', center: [42.8560, 74.6350], zone: 'Юго-восток' },
  { name: 'Тимур', email: 'van06@kavkev.demo', van: 'Вэн-06', plate: '01 106 AKK', center: [42.8960, 74.6050], zone: 'Север' },
  { name: 'Данияр', email: 'van07@kavkev.demo', van: 'Вэн-07', plate: '01 107 AKK', center: [42.8300, 74.6200], zone: 'Джал' },
  { name: 'Улан', email: 'van08@kavkev.demo', van: 'Вэн-08', plate: '01 108 AKK', center: [42.9050, 74.5700], zone: 'Северо-запад' },
  { name: 'Марат', email: 'van09@kavkev.demo', van: 'Вэн-09', plate: '01 109 AKK', center: [42.8700, 74.7200], zone: 'Аламедин' },
  { name: 'Санжар', email: 'van10@kavkev.demo', van: 'Вэн-10', plate: '01 110 AKK', center: [42.8520, 74.5450], zone: 'Ак-Орго' }
];

const RETURN_REASONS = ['Истёк срок', 'Брак упаковки', 'Не продано (обмен)'];

module.exports = { PRODUCTS, LINES, AGENTS, RETURN_REASONS };
