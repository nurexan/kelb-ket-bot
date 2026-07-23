import ExcelJS from 'exceljs';
import { formatTime } from './time';

export interface AttendanceRow {
  full_name: string;
  date: string;
  arrived_at: string | null;
  status: string;
  late_minutes: number;
  left_at: string | null;
  left_early: boolean;
  early_leave_reason: string | null;
  late_reason: string | null;
  fine_amount: number;
}

// ─── Ranglar ─────────────────────────────────────────────────────────────────
// 🟦 Vaqtida keldi  = ko'k-yashil (teal)
// ⬜ Sababsiz kelmadi = qizil
// 🩶 Sababli kechikib keldi = kulrang
// ⬜ Sababli kelmadi = och kulrang
// ⬜ Kelmadi (yozuv yo'q) = oq

const COLOR = {
  on_time:       'FF00BCD4', // teal
  late:          'FFFFF176', // sariq — kech, sababsiz
  late_notified: 'FFB0BEC5', // kulrang — kech, sababli
  absent_reason: 'FFB0BEC5', // kulrang — kelmadi, sababli
  absent:        'FFEF5350', // qizil — sababsiz kelmadi
  no_data:       'FFFFFFFF', // oq
  header_bg:     'FF1565C0', // ko'k sarlavha
  title_bg:      'FF0D47A1', // to'q ko'k title
  subheader_bg:  'FF1976D2', // o'rta ko'k
  jarima_bg:     'FFFFCDD2', // och qizil — jarima
};

// Belgi (checkbox uslubida)
function cellSymbol(status: string | null): string {
  if (!status) return '';
  if (status === 'on_time') return '✔';
  if (status === 'late') return '✔';          // kech lekin keldi
  if (status === 'late_notified') return '✔'; // kech, sabab bilan
  if (status === 'absent') return '✘';
  return '';
}

function cellColor(status: string | null): string {
  if (!status) return COLOR.no_data;
  switch (status) {
    case 'on_time':       return COLOR.on_time;
    case 'late':          return COLOR.late;
    case 'late_notified': return COLOR.late_notified;
    case 'absent':        return COLOR.absent;
    default:              return COLOR.no_data;
  }
}

// sana formatlash: 2026-07-13 → 13.07.2026
function fmtDate(d: string): string {
  if (!d) return d;
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export async function buildExcel(rows: AttendanceRow[], title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Davomat Bot';
  const ws = wb.addWorksheet('Hisobot', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }],
  });

  // ─── 1. Sarlavha qatori (1-qator) ──────────────────────────────────────────

  ws.mergeCells(1, 1, 1, 8);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.title_bg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // ─── 2. Ustun sarlavhalari (2-qator) ───────────────────────────────────────

  const headerStyle = (cell: ExcelJS.Cell, val: string) => {
    cell.value = val;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.header_bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  };

  headerStyle(ws.getCell(2, 1), '№');
  headerStyle(ws.getCell(2, 2), 'Sana');
  headerStyle(ws.getCell(2, 3), 'F.I.SH.');
  headerStyle(ws.getCell(2, 4), 'Kelgan vaqt');
  headerStyle(ws.getCell(2, 5), 'Ketgan vaqt');
  headerStyle(ws.getCell(2, 6), 'Status');
  headerStyle(ws.getCell(2, 7), 'Izoh (Sabab/Kechikish)');
  headerStyle(ws.getCell(2, 8), 'Ushlanma (so\'m)');

  ws.getRow(2).height = 30;

  // ─── 3. Ma'lumotlarni yozish ───────────────────────────────────────────────
  
  // Ma'lumotlarni eng yangi sanadan eskisiga qarab va xodim bo'yicha saralash
  const sortedRows = rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date); // Yangi sanalar tepada
    return a.full_name.localeCompare(b.full_name);
  });

  for (let i = 0; i < sortedRows.length; i++) {
    const r = sortedRows[i];
    const rowNum = i + 3;
    const row = ws.getRow(rowNum);
    
    // Status matni
    let statusStr = 'Vaqtida';
    if (r.status === 'late') statusStr = 'Kech qoldi';
    else if (r.status === 'absent') statusStr = 'Kelmadi';
    else if (r.status === 'late_notified') statusStr = 'Sababli (Kech)';
    else if (r.status === 'late_notified_advance') statusStr = 'Ogohlantirilgan';
    else if (r.status === 'trip' || r.status === 'trip_approved') statusStr = 'Xizmat safari';

    // Izoh
    const izohArr: string[] = [];
    if (r.late_minutes > 0) izohArr.push(`Kech: ${r.late_minutes} daq.`);
    if (r.late_reason) izohArr.push(r.late_reason);
    if (r.early_leave_reason) izohArr.push(`Erta ketish: ${r.early_leave_reason}`);
    const izoh = izohArr.join(' | ');

    // Yozish
    ws.getCell(rowNum, 1).value = i + 1; // №
    ws.getCell(rowNum, 2).value = fmtDate(r.date); // Sana
    ws.getCell(rowNum, 3).value = r.full_name; // Ism
    ws.getCell(rowNum, 4).value = r.arrived_at ? formatTime(r.arrived_at) : '';
    ws.getCell(rowNum, 5).value = r.left_at ? formatTime(r.left_at) : '';
    ws.getCell(rowNum, 6).value = statusStr;
    ws.getCell(rowNum, 7).value = izoh;
    ws.getCell(rowNum, 8).value = r.fine_amount > 0 ? r.fine_amount : 0;
    
    // Rang va uslublar
    const bgColor = cellColor(r.status);
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(rowNum, c);
      cell.alignment = { vertical: 'middle', horizontal: (c === 3 || c === 7) ? 'left' : 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      
      // Status bo'yicha ranglash faqat Status va Ushlanma ustunlari uchun
      if (c === 6) { // Status ustuni
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        if (r.status === 'absent') cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }
      if (c === 8 && r.fine_amount > 0) { // Ushlanma ustuni
        cell.font = { color: { argb: 'FFB71C1C' }, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.jarima_bg } };
        cell.numFmt = '#,##0" so\'m"';
      }
    }
  }

  // ─── 4. Ustun kengliklari ───────────────────────────────────────────────────

  ws.getColumn(1).width = 5;   // No
  ws.getColumn(2).width = 12;  // Sana
  ws.getColumn(3).width = 25;  // F.I.SH.
  ws.getColumn(4).width = 15;  // Keldi
  ws.getColumn(5).width = 15;  // Ketdi
  ws.getColumn(6).width = 18;  // Status
  ws.getColumn(7).width = 35;  // Izoh
  ws.getColumn(8).width = 18;  // Ushlanma

  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Buffer;
}
