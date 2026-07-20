import { TIMEZONE, WORK_START_HOUR, WORK_END_HOUR } from '../config';

/** Hozirgi vaqtni Toshkent vaqtida qaytaradi */
export function nowTashkent(): Date {
  const now = new Date();
  const str = now.toLocaleString('sv-SE', { timeZone: TIMEZONE }); // "YYYY-MM-DD HH:MM:SS"
  return new Date(str.replace(' ', 'T'));
}

/** Bugungi sanani YYYY-MM-DD formatda qaytaradi */
export function todayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/** Sana+vaqtni chiroyli ko'rinishda formatlaydi */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

/** 9:00 ga nisbatan kech qolgan daqiqalarni hisoblaydi */
export function calcLateMinutes(arrivedIso: string): number {
  const arrived = new Date(arrivedIso);
  // Kelgan vaqtni Toshkent soatiga aylantirish
  const t = new Date(arrived.toLocaleString('sv-SE', { timeZone: TIMEZONE }).replace(' ', 'T'));
  const workStart = new Date(t);
  workStart.setHours(WORK_START_HOUR, 0, 0, 0);
  if (t <= workStart) return 0;
  return Math.floor((t.getTime() - workStart.getTime()) / 60000);
}

/** Hozir ish vaqti ichidami? */
export function isWorkTime(): boolean {
  const d = nowTashkent();
  return d.getHours() >= WORK_START_HOUR && d.getHours() < WORK_END_HOUR;
}

/** Hozirgi soat (Toshkent) */
export function currentHour(): number {
  return nowTashkent().getHours();
}
