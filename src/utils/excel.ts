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
  fine_percent: number;
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
    views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
  });

  // ─── 1. Ma'lumotlarni strukturalashtirish ───────────────────────────────────

  // Noyob xodimlar ro'yxati (ism bo'yicha tartib)
  const empMap = new Map<string, Map<string, AttendanceRow>>();
  for (const r of rows) {
    if (!empMap.has(r.full_name)) empMap.set(r.full_name, new Map());
    empMap.get(r.full_name)!.set(r.date, r);
  }

  // Noyob sanalar (o'sish tartibida)
  const allDates = [...new Set(rows.map(r => r.date))].sort();
  const employees = [...empMap.keys()].sort();

  // ─── 2. Sarlavha qatori (1-qator) ──────────────────────────────────────────

  const totalCols = 3 + allDates.length + 2; // No + Ism + Rejadagi + sanalar + Keldi% + Jarima%
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.title_bg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  // ─── 3. Ustun sarlavhalari (2-qator) ───────────────────────────────────────

  const headerStyle = (cell: ExcelJS.Cell, val: string) => {
    cell.value = val;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.header_bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    };
  };

  headerStyle(ws.getCell(2, 1), 'No');
  headerStyle(ws.getCell(2, 2), 'F.I.SH.');
  headerStyle(ws.getCell(2, 3), 'Rejadagi\nvaqt (09:00)');

  // Sana sarlavhalari
  for (let i = 0; i < allDates.length; i++) {
    headerStyle(ws.getCell(2, 4 + i), fmtDate(allDates[i]));
  }

  headerStyle(ws.getCell(2, 4 + allDates.length), 'Keldi\n%');
  headerStyle(ws.getCell(2, 5 + allDates.length), 'Jarima\n%');

  ws.getRow(2).height = 36;

  // ─── 4. Xodimlar qatorlari ─────────────────────────────────────────────────

  let totalJarimaSum = 0;

  for (let ei = 0; ei < employees.length; ei++) {
    const empName = employees[ei];
    const dateMap = empMap.get(empName)!;
    const rowNum = 3 + ei;

    // --- No
    const noCell = ws.getCell(rowNum, 1);
    noCell.value = ei + 1;
    noCell.font = { bold: true, size: 10 };
    noCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    noCell.alignment = { horizontal: 'center', vertical: 'middle' };
    noCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // --- Ism
    const nameCell = ws.getCell(rowNum, 2);
    nameCell.value = empName;
    nameCell.font = { bold: true, size: 10 };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // --- Rejadagi vaqt
    const timeCell = ws.getCell(rowNum, 3);
    timeCell.value = '9:00';
    timeCell.font = { size: 10 };
    timeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    timeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    timeCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // --- Sanalar
    let arrivedCount = 0;
    let empTotalFine = 0;

    for (let di = 0; di < allDates.length; di++) {
      const date = allDates[di];
      const rec = dateMap.get(date) ?? null;
      const cellCol = 4 + di;
      const cell = ws.getCell(rowNum, cellCol);

      const status = rec ? rec.status : null;
      const color = cellColor(status);
      const symbol = cellSymbol(status);

      cell.value = symbol;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.font = {
        bold: true,
        size: 12,
        color: { argb: status === 'absent' ? 'FFFFFFFF' : 'FF000000' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      };

      // Tooltip: kech qolish sababi, erta ketish
      if (rec) {
        let note = '';
        if (rec.arrived_at) note += `Keldi: ${formatTime(rec.arrived_at)}`;
        if (rec.late_minutes > 0) note += `\nKech: ${rec.late_minutes} daq`;
        if (rec.late_reason) note += `\nSabab: ${rec.late_reason}`;
        if (rec.left_at) note += `\nKetdi: ${formatTime(rec.left_at)}`;
        if (rec.early_leave_reason) note += `\nKetish sababi: ${rec.early_leave_reason}`;
        if (note) cell.note = note;
      }

      if (status === 'on_time' || status === 'late' || status === 'late_notified') {
        arrivedCount++;
      }
      if (rec) empTotalFine += rec.fine_percent;
    }

    totalJarimaSum += empTotalFine;

    // --- Keldi %
    const pctCell = ws.getCell(rowNum, 4 + allDates.length);
    const pct = allDates.length > 0 ? Math.round((arrivedCount / allDates.length) * 100) : 0;
    pctCell.value = `${pct}%`;
    pctCell.font = { bold: true, size: 10, color: { argb: pct >= 80 ? 'FF1B5E20' : 'FFB71C1C' } };
    pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pct >= 80 ? 'FFC8E6C9' : 'FFFFCDD2' } };
    pctCell.alignment = { horizontal: 'center', vertical: 'middle' };
    pctCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    // --- Jarima %
    const fineCell = ws.getCell(rowNum, 5 + allDates.length);
    fineCell.value = empTotalFine > 0 ? `-${empTotalFine}%` : '0%';
    fineCell.font = { bold: true, size: 10, color: { argb: empTotalFine > 0 ? 'FFB71C1C' : 'FF1B5E20' } };
    fineCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: empTotalFine > 0 ? COLOR.jarima_bg : 'FFC8E6C9' } };
    fineCell.alignment = { horizontal: 'center', vertical: 'middle' };
    fineCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    ws.getRow(rowNum).height = 22;
  }

  // ─── 5. Izoh (legend) qatorlari ────────────────────────────────────────────

  const legendRow = 3 + employees.length + 2;

  const addLegend = (row: number, color: string, text: string, symbol: string) => {
    const symbolCell = ws.getCell(row, 4);
    symbolCell.value = symbol;
    symbolCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    symbolCell.font = { bold: true, size: 11 };
    symbolCell.alignment = { horizontal: 'center', vertical: 'middle' };
    symbolCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

    const textCell = ws.getCell(row, 5);
    textCell.value = text;
    textCell.font = { size: 10 };
    textCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(row).height = 20;
  };

  addLegend(legendRow,     COLOR.on_time,       'Vaqtida keldi',          '✔');
  addLegend(legendRow + 1, COLOR.no_data,        'Vaqtida kelmadi',        '');
  addLegend(legendRow + 2, COLOR.late_notified,  'Sababli kechikib keldi', '✔');
  addLegend(legendRow + 3, COLOR.late_notified,  'Sababli kelmadi',        '');
  addLegend(legendRow + 4, COLOR.absent,         'Sababsiz kelmadi',       '✘');
  addLegend(legendRow + 5, COLOR.late,           'Kech qoldi (sababsiz)',   '✔');

  // ─── 6. Ustun kengliklari ───────────────────────────────────────────────────

  ws.getColumn(1).width = 6;   // No
  ws.getColumn(2).width = 24;  // Ism
  ws.getColumn(3).width = 14;  // Rejadagi vaqt

  for (let i = 0; i < allDates.length; i++) {
    ws.getColumn(4 + i).width = 12;
  }

  ws.getColumn(4 + allDates.length).width = 10;     // Keldi %
  ws.getColumn(5 + allDates.length).width = 10;     // Jarima %

  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Buffer;
}
