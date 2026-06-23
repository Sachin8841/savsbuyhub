import * as XLSX from 'xlsx';

// ---------- Returns CSV (Meesho "intransit" report) ----------

export interface MeeshoReturnRow {
  sku: string;
  productName: string;
  quantity: number;
  orderNumber: string;
  subOrderNumber: string;
  dispatchDate: string;
  returnCreatedDate: string;
  typeOfReturn: string; // "Courier Return (RTO)" or "Customer Return" etc.
  courierPartner: string;
  status: string;
}

/** Skip Meesho header preamble until the row that starts with "S No". */
function parseCsvSmart(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^"?s\s*no"?\s*,/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) headerIdx = 0;
  const slice = lines.slice(headerIdx).filter(l => l.trim()).join('\n');
  const parsed = XLSX.read(slice, { type: 'string', raw: false });
  const sheet = parsed.Sheets[parsed.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as any[];
}

export function parseMeeshoReturnsCsv(text: string): MeeshoReturnRow[] {
  const rows = parseCsvSmart(text);
  return rows
    .map((r) => ({
      sku: String(r['SKU'] ?? r['sku'] ?? '').trim(),
      productName: String(r['Product Name'] ?? r['product_name'] ?? '').trim(),
      quantity: parseInt(String(r['Qty'] ?? r['Quantity'] ?? '1'), 10) || 1,
      orderNumber: String(r['Order Number'] ?? r['order_number'] ?? '').trim(),
      subOrderNumber: String(r['Suborder Number'] ?? r['Sub Order No'] ?? '').trim(),
      dispatchDate: normDate(r['Dispatch Date']),
      returnCreatedDate: normDate(r['Return Created Date']),
      typeOfReturn: String(r['Type of Return'] ?? '').trim(),
      courierPartner: String(r['Courier Partner'] ?? '').trim(),
      status: String(r['Status'] ?? '').trim(),
    }))
    .filter((r) => r.sku || r.subOrderNumber);
}

export function classifyReturnType(typeOfReturn: string): 'RTO' | 'Customer Return' {
  return /rto/i.test(typeOfReturn) ? 'RTO' : 'Customer Return';
}

// ---------- Payment XLSX (Meesho "Outstanding Payment") ----------

export interface MeeshoPaymentRow {
  subOrderNo: string;
  orderDate: string;
  dispatchDate: string;
  productName: string;
  sku: string;
  liveStatus: string;
  paymentDate: string;
  finalSettlementAmount: number;
  totalSaleAmount: number;
}

export async function parseMeeshoPaymentXlsx(file: File): Promise<MeeshoPaymentRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /order\s*payments?/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // Header row is on row 2 (0-indexed 1) — first row is a group header.
  const arr = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
  if (arr.length < 3) return [];
  const headers = arr[1].map((h: any) => String(h ?? '').trim());
  const idx = (name: string) =>
    headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const cSub = idx('Sub Order No');
  const cOrderDate = idx('Order Date');
  const cDispatch = idx('Dispatch Date');
  const cName = idx('Product Name');
  const cSku = idx('Supplier SKU');
  const cStatus = idx('Live Order Status');
  const cPayDate = idx('Payment Date');
  const cFinal = idx('Final Settlement Amount');
  const cTotal = idx('Total Sale Amount (Incl. Shipping & GST)');

  const out: MeeshoPaymentRow[] = [];
  for (let i = 3; i < arr.length; i++) {
    const r = arr[i];
    const sub = String(r[cSub] ?? '').trim();
    if (!sub) continue;
    out.push({
      subOrderNo: sub,
      orderDate: normDate(r[cOrderDate]),
      dispatchDate: normDate(r[cDispatch]),
      productName: String(r[cName] ?? '').trim(),
      sku: String(r[cSku] ?? '').trim(),
      liveStatus: String(r[cStatus] ?? '').trim(),
      paymentDate: normDate(r[cPayDate]),
      finalSettlementAmount: Number(r[cFinal] ?? 0) || 0,
      totalSaleAmount: Number(r[cTotal] ?? 0) || 0,
    });
  }
  return out;
}

function normDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return '';
  // Try YYYY-MM-DD already
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

// ---------- SKU matching helpers ----------

export function matchInventoryBySku<T extends { id: string; sku: string; product_name: string; aliases?: string[] | null }>(
  inventory: T[],
  sku: string,
  productName: string,
): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()]+/g, '');
  const skuN = norm(sku);
  const nameN = norm(productName);

  // 1. exact SKU match
  let best = inventory.find((i) => norm(i.sku) === skuN && skuN.length > 0);
  if (best) return best;

  // 2. SKU contains / contained (handle batch suffix _B2 etc., or 1x_ prefix)
  if (skuN.length > 2) {
    best = inventory.find((i) => {
      const dbN = norm(i.sku);
      return dbN.includes(skuN) || skuN.includes(dbN);
    });
    if (best) return best;
  }

  // 3. exact product name
  if (nameN.length > 4) {
    best = inventory.find((i) => norm(i.product_name) === nameN);
    if (best) return best;

    // 4. aliases
    best = inventory.find((i) =>
      (i.aliases ?? []).some((a) => norm(a) === nameN || norm(a).includes(nameN) || nameN.includes(norm(a))),
    );
    if (best) return best;

    // 5. partial name
    best = inventory.find((i) => {
      const dn = norm(i.product_name);
      return dn.length > 4 && (dn.includes(nameN) || nameN.includes(dn));
    });
    if (best) return best;
  }
  return null;
}
