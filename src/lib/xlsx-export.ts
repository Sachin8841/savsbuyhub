import * as XLSX from 'xlsx';

interface ExportOptions {
  filename: string;
  sheetName?: string;
  rows: Record<string, any>[];
  title?: string;
}

export function exportToXlsx({ filename, sheetName = 'Sheet1', rows, title }: ExportOptions) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const data: any[][] = [];

  // Title row
  if (title) {
    data.push([title]);
    data.push([]); // blank row
  }

  // Header row
  data.push(headers);

  // Data rows
  rows.forEach(row => {
    data.push(headers.map(h => row[h] ?? ''));
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths based on content
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(row => {
      const val = String(row[h] ?? '');
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(maxLen + 4, 40) };
  });
  ws['!cols'] = colWidths;

  // Style header row - make bold via cell formatting
  const headerRowIdx = title ? 2 : 0;
  headers.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: i });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E40AF' } },
        alignment: { horizontal: 'center' },
      };
    }
  });

  // Title styling
  if (title) {
    const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
    if (ws[titleCell]) {
      ws[titleCell].s = {
        font: { bold: true, sz: 16, color: { rgb: '1E40AF' } },
      };
    }
    // Merge title across all columns
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function exportDashboardReport(
  sales: any[],
  inventory: any[],
  returns: any[],
  adExpenses: any[],
  currentStocks: Record<string, number>
) {
  const wb = XLSX.utils.book_new();

  // Sales sheet
  if (sales.length) {
    const salesData = sales.map(s => {
      const inv = s.inventory as any;
      return {
        'Dispatch Date': s.dispatch_date,
        'Platform': s.platform,
        'SKU': inv?.sku ?? '',
        'Product': inv?.product_name ?? '',
        'Qty Sold': s.quantity_sold,
        'Selling Price (₹)': s.average_selling_price,
        'Revenue (₹)': s.quantity_sold * s.average_selling_price,
        'Cost Price (₹)': inv?.average_cost_price ?? 0,
        'Profit (₹)': s.quantity_sold * (s.average_selling_price - (inv?.average_cost_price ?? 0)),
        'Courier': s.courier_partner ?? '',
        'Payment': s.payment_status,
        'Settlement Date': s.settlement_date ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(salesData);
    ws['!cols'] = Object.keys(salesData[0]).map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  }

  // Inventory sheet
  if (inventory.length) {
    const invData = inventory.map(i => ({
      'SKU': i.sku,
      'Product': i.product_name,
      'Cost Price (₹)': i.average_cost_price,
      'Selling Price (₹)': i.average_selling_price,
      'Current Stock': currentStocks[i.id] ?? 0,
      'Delivery Fee (₹)': i.delivery_fee,
      'Stock Value (₹)': (currentStocks[i.id] ?? 0) * i.average_cost_price,
    }));
    const ws = XLSX.utils.json_to_sheet(invData);
    ws['!cols'] = Object.keys(invData[0]).map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
  }

  // Returns sheet
  if (returns.length) {
    const retData = returns.map(r => {
      const sale = r.sales as any;
      const inv = sale?.inventory;
      return {
        'Return Date': r.return_date ?? '',
        'SKU': inv?.sku ?? '',
        'Product': inv?.product_name ?? '',
        'Type': r.return_type,
        'Qty Returned': r.quantity_returned,
        'Status': r.delivery_status,
        'Delivered Date': r.delivered_date ?? '',
        'Penalty (₹)': r.penalty_amount,
      };
    });
    const ws = XLSX.utils.json_to_sheet(retData);
    ws['!cols'] = Object.keys(retData[0]).map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Returns');
  }

  // Ad Expenses sheet
  if (adExpenses.length) {
    const adData = adExpenses.map(e => ({
      'Date': e.expense_date,
      'Platform': e.platform,
      'Amount (₹)': e.amount,
      'Description': e.description ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(adData);
    ws['!cols'] = Object.keys(adData[0]).map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Ad Expenses');
  }

  XLSX.writeFile(wb, `SAVS_BuyHub_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
