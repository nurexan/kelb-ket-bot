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
  fine_amount: number;
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
  fine_amount: number;
}

/**
 * Google Apps Script Web App-ga POST so'rov yuborish (retry va timeout bilan)
 */
async function postToSheets(payload: object, label: string): Promise<void> {
  if (!SHEETS_WEBHOOK_URL) {
    console.log("⚠️ SHEETS_WEBHOOK_URL .env faylida yo'q, Sheets sync o'tkazildi");
    return;
  }

  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller.signal as any,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 300)}`);
      }

      // JSON javobini tekshirish
      try {
        const json = JSON.parse(responseText);
        if (json.ok === false) {
          console.error(`❌ Sheets xato (${label}):`, json.error || "Noma'lum xato");
        } else {
          console.log(`✅ Sheets sync OK (${label}):`, json.message || 'Muvaffaqiyatli');
        }
      } catch {
        console.log(`✅ Sheets sync OK (${label})`);
      }

      return; // Muvaffaqiyatli

    } catch (err: any) {
      lastError = err;
      const errMsg = err.name === 'AbortError' ? 'Timeout (30s)' : err.message;
      console.error(`❌ Sheets urinish ${attempt}/${maxRetries} (${label}): ${errMsg}`);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  console.error(`❌ Sheets sync ${maxRetries} urinishdan keyin muvaffaqiyatsiz (${label}):`, lastError?.message);
}

/**
 * Bitta xodimning bugungi davomatini Sheets-ga yozadi
 * (Real-time: "Keldim", "Kech qolaman", "Erta ketaman" bosilganda)
 */
export async function syncAttendanceToSheets(data: SyncData): Promise<void> {
  await postToSheets(data, `${data.employee_name} | ${data.status}`);
}

/**
 * To'liq hisobotni Sheets-ga yuboradi
 * (Admin "Hisobot" buyrug'ini bosganda)
 */
export async function sendFullReportToSheets(records: FullReportRecord[]): Promise<void> {
  await postToSheets(
    { action: 'full_report', records },
    `full_report (${records.length} ta yozuv)`
  );
}

/**
 * Yangi xodim ro'yxatdan o'tganda Sheets-ga yuborish
 */
export async function syncEmployeeToSheets(employeeName: string): Promise<void> {
  await postToSheets(
    { action: 'sync_employee', employee_name: employeeName },
    `sync_employee: ${employeeName}`
  );
}

/**
 * Sheets webhook URL ishlayotganini tekshirish (GET so'rov bilan)
 */
export async function testSheetsConnection(): Promise<{ ok: boolean; message: string }> {
  if (!SHEETS_WEBHOOK_URL) {
    return { ok: false, message: "SHEETS_WEBHOOK_URL .env faylida yo'q" };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal as any,
    });
    clearTimeout(timeoutId);
    const text = await response.text();
    if (response.ok) {
      try {
        const json = JSON.parse(text);
        return { ok: true, message: json.message || 'Sheets ulanish muvaffaqiyatli' };
      } catch {
        return { ok: true, message: 'Sheets ulanish muvaffaqiyatli' };
      }
    }
    return { ok: false, message: `HTTP ${response.status}: ${text.substring(0, 200)}` };
  } catch (err: any) {
    return { ok: false, message: `Ulanish xatosi: ${err.message}` };
  }
}
