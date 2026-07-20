// ─── Google Sheets Webhook Sync ──────────────────────────────────────────────
// Apps Script Web App orqali Google Sheets-ga attendance ma'lumotlarini yuboradi

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || '';

interface SyncData {
  action: 'sync_attendance';
  employee_name: string;
  date: string;
  status: string;
  arrived_at: string;
  left_at: string;
  late_minutes: number;
  late_reason: string;
  early_leave_reason: string;
  fine_percent: number;
}

interface FullReportRecord {
  employee_name: string;
  date: string;
  status: string;
  arrived_at: string;
  left_at: string;
  late_minutes: number;
  late_reason: string;
  early_leave_reason: string;
  fine_percent: number;
}

/**
 * Bitta xodimning bugungi davomatini Sheets-ga yozadi
 * (Real-time: "Keldim", "Kech qolaman", "Erta ketaman" bosilganda)
 */
export async function syncAttendanceToSheets(data: SyncData): Promise<void> {
  if (!SHEETS_WEBHOOK_URL) {
    console.log('⚠️ SHEETS_WEBHOOK_URL mavjud emas, Sheets sync o\'tkazildi');
    return;
  }

  try {
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('Sheets sync xato:', response.status, await response.text());
    } else {
      console.log('✅ Sheets sync muvaffaqiyatli:', data.employee_name, data.status);
    }
  } catch (err) {
    console.error('Sheets sync xato:', err);
  }
}

/**
 * To'liq hisobotni Sheets-ga yuboradi
 * (Admin "Hisobot" buyrug'ini bosganda)
 */
export async function sendFullReportToSheets(records: FullReportRecord[]): Promise<void> {
  if (!SHEETS_WEBHOOK_URL) {
    console.log('⚠️ SHEETS_WEBHOOK_URL mavjud emas, Sheets sync o\'tkazildi');
    return;
  }

  try {
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'full_report',
        records,
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error('Sheets full report xato:', response.status, await response.text());
    } else {
      console.log('✅ Sheets full report muvaffaqiyatli, yozuvlar:', records.length);
    }
  } catch (err) {
    console.error('Sheets full report xato:', err);
  }
}
