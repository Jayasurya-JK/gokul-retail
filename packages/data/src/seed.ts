import type {
  Bill, BillLine, Category, Customer, Item, Payment, ProductionBatch, Purchase, Settings, Supplier, UnitCode, User,
} from './types';
import { computeTotals, makeLine } from './money';

/** Deterministic RNG so the mock shop looks the same on every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = (n: number) => n * 100; // rupees -> paise

function ean13(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return body12 + String((10 - (sum % 10)) % 10);
}

export const settings: Settings = {
  shopName: 'Gokul Oils',
  address: '48, Mettupalayam Road, Gandhipuram, Coimbatore 641012',
  gstin: '33AAKFG4821M1ZQ',
  phone: '98421 07731',
  counter: 'Counter 1',
  billPrefix: 'GK',
  receiptFooter: 'Thank you. Please visit again.',
  printer: 'TVS RP 3160 Gold',
  roundToRupee: true,
};

export const categories: Category[] = [
  { id: 'oil', name: 'Wood-pressed oils' },
  { id: 'cake', name: 'Oil cake' },
  { id: 'jag', name: 'Jaggery & sweeteners' },
  { id: 'ghee', name: 'Ghee' },
  { id: 'dal', name: 'Dals & pulses' },
  { id: 'rice', name: 'Rice & flours' },
  { id: 'spice', name: 'Spices' },
  { id: 'nuts', name: 'Nuts & dry fruits' },
  { id: 'pack', name: 'Packaged grocery' },
];

export const users: User[] = [
  { id: 'u1', name: 'Suresh Kumar', role: 'owner', initials: 'SK', pin: '1111', color: '#0E4330', lastLogin: 'Today, 08:45' },
  { id: 'u2', name: 'Lakshmi Rajan', role: 'manager', initials: 'LR', pin: '2222', color: '#7C3AED', lastLogin: 'Yesterday, 20:10' },
  { id: 'u3', name: 'Karthik Murugan', role: 'cashier', initials: 'KM', pin: '1234', color: '#2563EB', lastLogin: 'Today, 09:02' },
  { id: 'u4', name: 'Divya Selvam', role: 'cashier', initials: 'DS', pin: '4321', color: '#DB2777', lastLogin: 'Yesterday, 14:30' },
  { id: 'u5', name: 'Ramesh Pandian', role: 'cashier', initials: 'RP', pin: '5678', color: '#D97706', lastLogin: '3 days ago' },
];

interface OilSpec { name: string; ta: string; perL: number; hsn: string; gst: 5 | 12 }
const OILS: OilSpec[] = [
  { name: 'Groundnut Oil', ta: 'கடலை எண்ணெய்', perL: 360, hsn: '1508', gst: 5 },
  { name: 'Gingelly Oil', ta: 'நல்லெண்ணெய்', perL: 540, hsn: '1515', gst: 5 },
  { name: 'Coconut Oil', ta: 'தேங்காய் எண்ணெய்', perL: 330, hsn: '1513', gst: 5 },
  { name: 'Mustard Oil', ta: 'கடுகு எண்ணெய்', perL: 290, hsn: '1514', gst: 5 },
  { name: 'Castor Oil', ta: 'ஆமணக்கு எண்ணெய்', perL: 260, hsn: '1515', gst: 5 },
  { name: 'Neem Oil', ta: 'வேப்ப எண்ணெய்', perL: 310, hsn: '1515', gst: 12 },
  { name: 'Deepam Oil', ta: 'தீப எண்ணெய்', perL: 190, hsn: '1515', gst: 12 },
];

interface PackSpec { label: string; litres: number; unit: UnitCode; factor: number; reorder: number }
const PACKS: PackSpec[] = [
  { label: '200 ml', litres: 0.2, unit: 'btl', factor: 1.08, reorder: 24 },
  { label: '500 ml', litres: 0.5, unit: 'btl', factor: 1.05, reorder: 24 },
  { label: '1 L', litres: 1, unit: 'btl', factor: 1.02, reorder: 36 },
  { label: '5 L', litres: 5, unit: 'tin', factor: 0.98, reorder: 8 },
  { label: '15 L', litres: 15, unit: 'tin', factor: 0.96, reorder: 3 },
];

interface GroceryBase { name: string; ta?: string; perKg: number; cat: string; gst: 0 | 5 | 12; hsn: string; pack?: boolean }
const GROCERY: GroceryBase[] = [
  { name: 'Toor Dal', ta: 'துவரம் பருப்பு', perKg: 165, cat: 'dal', gst: 0, hsn: '0713', pack: true },
  { name: 'Urad Dal Split', ta: 'உளுத்தம் பருப்பு', perKg: 150, cat: 'dal', gst: 0, hsn: '0713', pack: true },
  { name: 'Urad Dal Whole', perKg: 140, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Moong Dal', ta: 'பாசிப்பருப்பு', perKg: 140, cat: 'dal', gst: 0, hsn: '0713', pack: true },
  { name: 'Chana Dal', ta: 'கடலைப்பருப்பு', perKg: 105, cat: 'dal', gst: 0, hsn: '0713', pack: true },
  { name: 'Masoor Dal', perKg: 95, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Kabuli Chana', perKg: 130, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Black Chana', perKg: 90, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Green Peas Dried', perKg: 85, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Rajma', perKg: 160, cat: 'dal', gst: 0, hsn: '0713' },
  { name: 'Ponni Raw Rice', ta: 'பொன்னி அரிசி', perKg: 62, cat: 'rice', gst: 0, hsn: '1006', pack: true },
  { name: 'Idli Rice', ta: 'இட்லி அரிசி', perKg: 55, cat: 'rice', gst: 0, hsn: '1006', pack: true },
  { name: 'Sona Masuri Rice', perKg: 68, cat: 'rice', gst: 0, hsn: '1006', pack: true },
  { name: 'Basmati Rice', perKg: 120, cat: 'rice', gst: 5, hsn: '1006', pack: true },
  { name: 'Wheat Atta', perKg: 45, cat: 'rice', gst: 0, hsn: '1101' },
  { name: 'Rice Flour', perKg: 60, cat: 'rice', gst: 0, hsn: '1102' },
  { name: 'Rava (Sooji)', perKg: 48, cat: 'rice', gst: 0, hsn: '1103' },
  { name: 'Maida', perKg: 44, cat: 'rice', gst: 0, hsn: '1101' },
  { name: 'Poha (Aval)', perKg: 70, cat: 'rice', gst: 0, hsn: '1104' },
  { name: 'Sago (Javvarisi)', perKg: 80, cat: 'rice', gst: 5, hsn: '1903' },
  { name: 'Sugar', perKg: 46, cat: 'pack', gst: 5, hsn: '1701', pack: true },
  { name: 'Rock Salt', perKg: 22, cat: 'pack', gst: 0, hsn: '2501' },
  { name: 'Tamarind', ta: 'புளி', perKg: 220, cat: 'spice', gst: 0, hsn: '0813', pack: true },
  { name: 'Dry Red Chilli', ta: 'வத்தல் மிளகாய்', perKg: 280, cat: 'spice', gst: 5, hsn: '0904', pack: true },
  { name: 'Coriander Seed', ta: 'மல்லி', perKg: 140, cat: 'spice', gst: 5, hsn: '0909' },
  { name: 'Turmeric Powder', ta: 'மஞ்சள் தூள்', perKg: 220, cat: 'spice', gst: 5, hsn: '0910', pack: true },
  { name: 'Black Pepper', ta: 'மிளகு', perKg: 720, cat: 'spice', gst: 5, hsn: '0904' },
  { name: 'Cumin Seed', ta: 'சீரகம்', perKg: 480, cat: 'spice', gst: 5, hsn: '0909' },
  { name: 'Mustard Seed', ta: 'கடுகு', perKg: 120, cat: 'spice', gst: 5, hsn: '1207' },
  { name: 'Fenugreek Seed', ta: 'வெந்தயம்', perKg: 140, cat: 'spice', gst: 5, hsn: '0909' },
  { name: 'Fennel Seed', perKg: 320, cat: 'spice', gst: 5, hsn: '0909' },
  { name: 'Cardamom', perKg: 2400, cat: 'spice', gst: 5, hsn: '0908' },
  { name: 'Cloves', perKg: 1100, cat: 'spice', gst: 5, hsn: '0907' },
  { name: 'Cashew Nut', ta: 'முந்திரி', perKg: 780, cat: 'nuts', gst: 5, hsn: '0801' },
  { name: 'Raisins', perKg: 400, cat: 'nuts', gst: 5, hsn: '0806' },
  { name: 'Dates', perKg: 220, cat: 'nuts', gst: 5, hsn: '0804' },
  { name: 'Almonds', perKg: 780, cat: 'nuts', gst: 5, hsn: '0802' },
  { name: 'Peanut Kernel', ta: 'நிலக்கடலை', perKg: 130, cat: 'nuts', gst: 0, hsn: '1202' },
  { name: 'Gingelly Seed White', ta: 'வெள்ளை எள்', perKg: 220, cat: 'nuts', gst: 0, hsn: '1207' },
  { name: 'Black Gingelly Seed', ta: 'கருப்பு எள்', perKg: 240, cat: 'nuts', gst: 0, hsn: '1207' },
  { name: 'Dry Coconut Copra', ta: 'கொப்பரை', perKg: 290, cat: 'nuts', gst: 5, hsn: '1203' },
];

interface PackagedBase { name: string; brand: string; size: string; price: number; gst: 0 | 5 | 12 | 18; cat: string; hsn: string }
const PACKAGED: PackagedBase[] = [
  { name: 'Iodised Salt', brand: 'Tata', size: '1 kg', price: 28, gst: 0, cat: 'pack', hsn: '2501' },
  { name: 'Aashirvaad Atta', brand: 'ITC', size: '5 kg', price: 265, gst: 0, cat: 'pack', hsn: '1101' },
  { name: 'Tea Powder', brand: 'Brooke Bond', size: '250 g', price: 135, gst: 5, cat: 'pack', hsn: '0902' },
  { name: 'Filter Coffee Powder', brand: 'Narasus', size: '200 g', price: 140, gst: 5, cat: 'pack', hsn: '0901' },
  { name: 'Honey', brand: 'Dabur', size: '250 g', price: 125, gst: 5, cat: 'pack', hsn: '0409' },
  { name: 'Mango Pickle', brand: 'Aachi', size: '200 g', price: 85, gst: 12, cat: 'pack', hsn: '2001' },
  { name: 'Lemon Pickle', brand: 'Aachi', size: '200 g', price: 80, gst: 12, cat: 'pack', hsn: '2001' },
  { name: 'Sambar Powder', brand: 'Aachi', size: '200 g', price: 78, gst: 5, cat: 'pack', hsn: '0910' },
  { name: 'Rasam Powder', brand: 'Aachi', size: '100 g', price: 48, gst: 5, cat: 'pack', hsn: '0910' },
  { name: 'Chilli Powder', brand: 'Aachi', size: '200 g', price: 82, gst: 5, cat: 'pack', hsn: '0904' },
  { name: 'Coriander Powder', brand: 'Aachi', size: '200 g', price: 70, gst: 5, cat: 'pack', hsn: '0909' },
  { name: 'Idli Podi', brand: 'Gokul', size: '200 g', price: 90, gst: 5, cat: 'pack', hsn: '2106' },
  { name: 'Appalam', brand: 'Gokul', size: '200 g', price: 55, gst: 12, cat: 'pack', hsn: '1905' },
  { name: 'Vermicelli', brand: 'Anil', size: '180 g', price: 28, gst: 5, cat: 'pack', hsn: '1902' },
  { name: 'Rice Murukku', brand: 'Gokul', size: '200 g', price: 70, gst: 12, cat: 'pack', hsn: '2106' },
  { name: 'Peanut Chikki', brand: 'Gokul', size: '100 g', price: 30, gst: 12, cat: 'pack', hsn: '1704' },
  { name: 'Camphor', brand: 'Cycle', size: '50 g', price: 60, gst: 12, cat: 'pack', hsn: '2914' },
  { name: 'Agarbathi', brand: 'Cycle', size: '1 pkt', price: 40, gst: 12, cat: 'pack', hsn: '3307' },
  { name: 'Cotton Wicks', brand: 'Gokul', size: '1 pkt', price: 20, gst: 12, cat: 'pack', hsn: '5911' },
  { name: 'Dish Wash Bar', brand: 'Vim', size: '300 g', price: 38, gst: 18, cat: 'pack', hsn: '3401' },
];

function roundPrice(rs: number): number {
  if (rs >= 1000) return Math.round(rs / 5) * 5;
  return Math.round(rs);
}

export function buildItems(): Item[] {
  const r = rng(7);
  const items: Item[] = [];
  let n = 100;
  const push = (p: Omit<Item, 'id' | 'code' | 'barcode' | 'active' | 'stock' | 'reorderLevel' | 'mrp'> & { mrp?: number; stock: number; reorder: number }) => {
    n += 1;
    const id = `i${n}`;
    const code = String(n);
    const barcode = ean13(`8904${String(n).padStart(8, '0')}`);
    const { stock, reorder, mrp, ...rest } = p;
    items.push({
      ...rest, id, code, barcode, active: true,
      mrp: mrp ?? Math.ceil((p.price * 1.04) / 500) * 500,
      stock: Math.round(stock * 1000), reorderLevel: Math.round(reorder * 1000),
    });
  };

  for (const o of OILS) {
    push({
      name: `${o.name} (Loose)`, nameTa: o.ta, categoryId: 'oil', category: 'Wood-pressed oils', brand: 'Gokul',
      unit: 'l', loose: true, hsn: o.hsn, gstRate: o.gst, price: R(o.perL), cost: R(Math.round(o.perL * 0.82)),
      stock: 80 + Math.round(r() * 220), reorder: 60,
    });
    for (const p of PACKS) {
      const price = R(roundPrice(o.perL * p.litres * p.factor));
      push({
        name: `${o.name} ${p.label}`, nameTa: o.ta, categoryId: 'oil', category: 'Wood-pressed oils', brand: 'Gokul',
        unit: p.unit, loose: false, packSize: p.label, hsn: o.hsn, gstRate: o.gst, price, cost: Math.round(price * 0.82),
        mrp: price, stock: Math.round(p.reorder * (0.6 + r() * 3)), reorder: p.reorder,
      });
    }
  }
  for (const [name, ta, perKg] of [
    ['Groundnut Oil Cake', 'கடலை புண்ணாக்கு', 48],
    ['Coconut Oil Cake', 'தேங்காய் புண்ணாக்கு', 42],
    ['Gingelly Oil Cake', 'எள் புண்ணாக்கு', 55],
  ] as const) {
    push({ name: `${name} (Loose)`, nameTa: ta, categoryId: 'cake', category: 'Oil cake', brand: 'Gokul', unit: 'kg', loose: true, hsn: '2305', gstRate: 5, price: R(perKg), cost: R(perKg * 0.7), stock: 60 + Math.round(r() * 120), reorder: 40 });
    push({ name: `${name} 1 kg`, nameTa: ta, categoryId: 'cake', category: 'Oil cake', brand: 'Gokul', unit: 'pkt', loose: false, packSize: '1 kg', hsn: '2305', gstRate: 5, price: R(perKg + 6), cost: R(perKg * 0.7), stock: 20 + Math.round(r() * 40), reorder: 15 });
  }
  for (const [name, ta, perKg] of [
    ['Jaggery Block (Achu Vellam)', 'அச்சு வெல்லம்', 78],
    ['Palm Jaggery (Karupatti)', 'கருப்பட்டி', 420],
    ['Jaggery Powder', 'வெல்லப் பொடி', 85],
  ] as const) {
    push({ name: `${name} (Loose)`, nameTa: ta, categoryId: 'jag', category: 'Jaggery & sweeteners', brand: 'Gokul', unit: 'kg', loose: true, hsn: '1701', gstRate: 0, price: R(perKg), cost: R(perKg * 0.85), stock: 35 + Math.round(r() * 60), reorder: 20 });
    push({ name: `${name} 500 g`, nameTa: ta, categoryId: 'jag', category: 'Jaggery & sweeteners', brand: 'Gokul', unit: 'pkt', loose: false, packSize: '500 g', hsn: '1701', gstRate: 0, price: R(Math.round(perKg / 2 + 4)), cost: R(perKg * 0.45), stock: 12 + Math.round(r() * 30), reorder: 12 });
  }
  push({ name: 'Palm Candy (Panangkarkandu) 250 g', nameTa: 'பனங்கற்கண்டு', categoryId: 'jag', category: 'Jaggery & sweeteners', brand: 'Gokul', unit: 'pkt', loose: false, packSize: '250 g', hsn: '1701', gstRate: 0, price: R(140), cost: R(110), stock: 14, reorder: 8 });
  for (const [label, litres, price] of [['200 ml', 0.2, 180], ['500 ml', 0.5, 420], ['1 L', 1, 780]] as const) {
    push({ name: `Cow Ghee ${label}`, nameTa: 'நெய்', categoryId: 'ghee', category: 'Ghee', brand: 'Gokul', unit: 'btl', loose: false, packSize: label, hsn: '0405', gstRate: 12, price: R(price), cost: R(price * 0.84), stock: Math.round(8 + r() * 30 * litres + 6), reorder: 10 });
  }
  push({ name: 'Cow Ghee (Loose)', nameTa: 'நெய்', categoryId: 'ghee', category: 'Ghee', brand: 'Gokul', unit: 'kg', loose: true, hsn: '0405', gstRate: 12, price: R(760), cost: R(640), stock: 22, reorder: 8 });

  for (const g of GROCERY) {
    push({ name: `${g.name} (Loose)`, nameTa: g.ta, categoryId: g.cat, category: categories.find((c) => c.id === g.cat)!.name, brand: 'Loose', unit: 'kg', loose: true, hsn: g.hsn, gstRate: g.gst, price: R(g.perKg), cost: R(Math.round(g.perKg * 0.88)), stock: 25 + Math.round(r() * 140), reorder: 20 });
    if (g.pack) {
      const size = g.perKg > 400 ? 0.25 : 1;
      push({ name: `${g.name} ${size === 1 ? '1 kg' : '250 g'}`, nameTa: g.ta, categoryId: g.cat, category: categories.find((c) => c.id === g.cat)!.name, brand: 'Gokul', unit: 'pkt', loose: false, packSize: size === 1 ? '1 kg' : '250 g', hsn: g.hsn, gstRate: g.gst, price: R(Math.round(g.perKg * size + (size === 1 ? 4 : 6))), cost: R(Math.round(g.perKg * size * 0.88)), stock: 10 + Math.round(r() * 50), reorder: 10 });
    }
  }
  for (const p of PACKAGED) {
    push({ name: `${p.name} ${p.size}`, categoryId: p.cat, category: 'Packaged grocery', brand: p.brand, unit: 'pc', loose: false, packSize: p.size, hsn: p.hsn, gstRate: p.gst, price: R(p.price), mrp: R(Math.ceil(p.price * 1.06)), cost: R(Math.round(p.price * 0.86)), stock: 8 + Math.round(r() * 60), reorder: 10 });
  }
  // Make a handful of items genuinely low so the dashboard has something to show.
  [3, 9, 16, 22, 31, 47, 58, 66, 80, 95].forEach((i, k) => {
    const it = items[i];
    if (it) it.stock = Math.round(it.reorderLevel * (0.15 + 0.07 * k));
  });
  return items;
}

const FIRST = ['Murugan', 'Senthil', 'Lakshmi', 'Meena', 'Kavitha', 'Ravi', 'Saravanan', 'Priya', 'Anand', 'Vimala', 'Selvi', 'Karthikeyan', 'Revathi', 'Ganesh', 'Sundari', 'Balu', 'Nirmala', 'Palani', 'Jothi', 'Mani', 'Geetha', 'Venkat', 'Chitra', 'Dhanam', 'Arun'];
const LAST = ['Subramanian', 'Pillai', 'Iyer', 'Naidu', 'Chettiar', 'Gounder', 'Rajan', 'Kumar', 'Devi', 'Narayanan', 'Mudaliar', 'Krishnan'];
const AREAS = ['Gandhipuram', 'RS Puram', 'Peelamedu', 'Saravanampatti', 'Singanallur', 'Ganapathy', 'Vadavalli', 'Race Course', 'Saibaba Colony', 'Ramanathapuram'];

export function buildCustomers(): Customer[] {
  const r = rng(21);
  const out: Customer[] = [];
  for (let i = 0; i < 60; i++) {
    const credit = r() < 0.4;
    const limit = credit ? R(5000 + Math.floor(r() * 4) * 5000) : 0;
    out.push({
      id: `c${i + 1}`,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
      phone: `9${Math.floor(1000 + r() * 8999)} ${Math.floor(10000 + r() * 89999)}`,
      area: AREAS[Math.floor(r() * AREAS.length)],
      creditLimit: limit,
      outstanding: credit && r() < 0.7 ? R(Math.floor(200 + r() * 4200)) : 0,
      loyaltyPoints: Math.floor(r() * 900),
      lastVisit: `${1 + Math.floor(r() * 28)} days ago`,
    });
  }
  return out;
}

export function buildSuppliers(): Supplier[] {
  return [
    { id: 's1', name: 'Sri Murugan Oil Seeds', phone: '94430 12871', city: 'Erode', gstin: '33AADFS2901K1ZP', outstanding: R(84500) },
    { id: 's2', name: 'Kongu Groundnut Traders', phone: '98427 66012', city: 'Tiruppur', gstin: '33AAGFK5521Q1Z3', outstanding: R(0) },
    { id: 's3', name: 'Annai Gingelly Merchants', phone: '97890 45521', city: 'Salem', gstin: '33AAEPA7712B1ZK', outstanding: R(126000) },
    { id: 's4', name: 'Thanjai Coconut Copra Mart', phone: '90030 18842', city: 'Pollachi', gstin: '33AAHFT3345C1ZA', outstanding: R(41200) },
    { id: 's5', name: 'Pandian Jaggery Works', phone: '99940 27365', city: 'Mettur', gstin: '33AAJPP9981R1Z8', outstanding: R(0) },
    { id: 's6', name: 'Aachi Distributors Coimbatore', phone: '98946 31107', city: 'Coimbatore', gstin: '33AACCA1182M1ZL', outstanding: R(18650) },
    { id: 's7', name: 'Lakshmi Pulses & Grains', phone: '93640 90218', city: 'Coimbatore', gstin: '33AAHPL4410D1ZQ', outstanding: R(57300) },
    { id: 's8', name: 'Vinayaga Packaging', phone: '99425 51480', city: 'Coimbatore', gstin: '33AAKFV6672G1ZN', outstanding: R(9800) },
  ];
}

export function buildPurchases(items: Item[], suppliers: Supplier[]): Purchase[] {
  const r = rng(99);
  const out: Purchase[] = [];
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    const s = suppliers[Math.floor(r() * suppliers.length)];
    const lines = Array.from({ length: 2 + Math.floor(r() * 3) }, () => {
      const it = items[Math.floor(r() * items.length)];
      const qty = it.loose ? Math.round((40 + r() * 160) * 1000) : Math.round((12 + r() * 60) * 1000);
      return { itemId: it.id, name: it.name, qty, cost: it.cost };
    });
    const total = lines.reduce((a, l) => a + Math.round((l.cost * l.qty) / 1000), 0);
    out.push({
      id: `p${i + 1}`, number: `PU-${String(1042 - i).padStart(5, '0')}`,
      date: new Date(now - (i * 1.3 + 0.5) * 86400000).toISOString(),
      supplierId: s.id, supplierName: s.name, lines, total,
      paid: r() < 0.6 ? total : Math.round(total * r() * 0.5),
    });
  }
  return out;
}

export function buildProduction(): ProductionBatch[] {
  const now = Date.now();
  const rows: [string, number, string, number, number, ProductionBatch['status']][] = [
    ['Groundnut', 400, 'Groundnut Oil', 168, 218, 'running'],
    ['Gingelly', 250, 'Gingelly Oil', 112, 128, 'done'],
    ['Copra', 300, 'Coconut Oil', 186, 104, 'done'],
    ['Groundnut', 420, 'Groundnut Oil', 177, 231, 'done'],
    ['Mustard', 180, 'Mustard Oil', 66, 108, 'done'],
    ['Castor', 150, 'Castor Oil', 54, 90, 'done'],
  ];
  return rows.map((x, i) => ({
    id: `b${i + 1}`, date: new Date(now - i * 2 * 86400000).toISOString(),
    seed: x[0], seedKg: x[1], oil: x[2], oilL: x[3], cakeKg: x[4], status: x[5],
  }));
}

/** Build ~30 days of past bills, newest last. */
export function buildBills(items: Item[], customers: Customer[]): Bill[] {
  const r = rng(2026);
  const bills: Bill[] = [];
  const cashiers = users.filter((u) => u.role === 'cashier');
  const now = new Date();
  const weights = items.map((it) => (it.categoryId === 'oil' ? 5 : it.categoryId === 'cake' || it.categoryId === 'jag' ? 2.5 : 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let x = r() * wSum;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[0];
  };
  for (let d = 29; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
    const dow = day.getDay();
    let count = 34 + Math.floor(r() * 22) + (dow === 0 || dow === 6 ? 22 : 0);
    let startMs = day.getTime() + 8.5 * 3600000;
    let endMs = day.getTime() + 21 * 3600000;
    if (d === 0) {
      endMs = now.getTime();
      startMs = Math.min(startMs, endMs - 4 * 3600000);
      count = Math.max(14, Math.round(((endMs - startMs) / 3600000) * 4.6));
    }
    const times = Array.from({ length: count }, () => startMs + r() * (endMs - startMs)).sort((a, b) => a - b);
    for (const t of times) {
      const nLines = 1 + Math.floor(r() * r() * 7);
      const lines: BillLine[] = [];
      const seen = new Set<string>();
      for (let k = 0; k < nLines; k++) {
        const it = pick();
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        const qty = it.loose ? Math.round((0.25 + Math.floor(r() * 12) * 0.25) * 1000) : (1 + Math.floor(r() * r() * 4)) * 1000;
        lines.push(makeLine(it, qty));
      }
      const totals = computeTotals(lines, 0, true);
      const cust = r() < 0.38 ? customers[Math.floor(r() * customers.length)] : undefined;
      const x = r();
      const payments: Payment[] = [];
      let status: Bill['status'] = 'paid';
      if (cust && cust.creditLimit > 0 && x < 0.22) {
        payments.push({ mode: 'credit', amount: totals.grand });
        status = 'credit';
      } else if (x < 0.55) payments.push({ mode: 'cash', amount: totals.grand });
      else if (x < 0.88) payments.push({ mode: 'upi', amount: totals.grand, ref: `UPI${Math.floor(1e9 + r() * 9e9)}` });
      else if (x < 0.95) payments.push({ mode: 'card', amount: totals.grand });
      else {
        const cash = Math.round((totals.grand * 0.4) / 100) * 100;
        payments.push({ mode: 'cash', amount: cash }, { mode: 'upi', amount: totals.grand - cash });
      }
      bills.push({
        id: `b${bills.length + 1}`, number: '', at: new Date(t).toISOString(),
        cashier: cashiers[Math.floor(r() * cashiers.length)].name, counter: 'Counter 1',
        customerId: cust?.id, customerName: cust?.name ?? 'Walk-in',
        lines, totals, payments, status,
      });
    }
  }
  bills.forEach((b, i) => { b.number = `${settings.billPrefix}-${String(48200 + i + 1).padStart(6, '0')}`; });
  return bills;
}
