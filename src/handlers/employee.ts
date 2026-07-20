import { MyContext } from '../bot';
import { employeeKeyboard } from './auth';
import {
  findEmployeeByTgId, getTodayAttendance, upsertAttendance,
  getAllAdminTgIds, getAllGroupChatIds,
} from '../db';
import { todayDate, calcLateMinutes, formatTime, currentHour, nowTashkent } from '../utils/time';
import { LATE_FINE_PERCENT, WORK_END_HOUR } from '../config';
import { bot } from '../bot';
import { syncAttendanceToSheets } from '../utils/sheets';

// ─── Guruhga xabar yuborish yordamchi funksiyasi ──────────────────────────────

async function notifyGroups(message: string): Promise<void> {
  try {
    const groupIds = await getAllGroupChatIds();
    for (const chatId of groupIds) {
      try {
        await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' });
      } catch (e: any) {
        console.error(`Guruhga xabar yuborishda xato (${chatId}):`, e.message);
      }
    }
  } catch (e) {
    console.error('notifyGroups error:', e);
  }
}

// ─── ✅ Keldim ────────────────────────────────────────────────────────────────

export async function handleArrived(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) {
    ctx.session.state = 'entering_code';
    await ctx.reply('❌ Siz ro\'yxatdan o\'tmagansiz. Kodni kiriting:');
    return;
  }

  const date = todayDate();
  const existing = await getTodayAttendance(emp.id, date);

  if (existing?.arrived_at) {
    await ctx.reply(
      `ℹ️ Siz bugun allaqachon kelgansiz.\n⏰ Kelgan vaqt: <b>${formatTime(existing.arrived_at)}</b>`,
      { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
    );
    return;
  }

  const now = new Date();
  const lateMinutes = calcLateMinutes(now.toISOString());
  const isLate = lateMinutes > 0;
  const status = isLate ? 'late' : 'on_time';
  const finePercent = isLate ? LATE_FINE_PERCENT : 0;

  await upsertAttendance(emp.id, date, {
    arrived_at: now.toISOString(),
    status,
    late_minutes: lateMinutes,
    fine_percent: finePercent,
  });

  // Google Sheets-ga sync
  syncAttendanceToSheets({
    action: 'sync_attendance',
    employee_name: emp.full_name,
    date,
    status,
    arrived_at: formatTime(now.toISOString()),
    left_at: '',
    late_minutes: lateMinutes,
    late_reason: '',
    early_leave_reason: '',
    fine_percent: finePercent,
  }).catch(e => console.error('Sheets sync error:', e));

  if (!isLate) {
    const arrivalMsg = `✅ <b>O'z vaqtida keldingiz!</b>\n👤 ${emp.full_name}\n⏰ ${formatTime(now.toISOString())}\n📅 ${date}`;
    await ctx.reply(arrivalMsg, { parse_mode: 'HTML', reply_markup: employeeKeyboard() });

    // Guruhga "Keldim" xabari
    await notifyGroups(`✅ <b>${emp.full_name}</b> ishga keldi!\n⏰ ${formatTime(now.toISOString())} — O'z vaqtida`);
  } else {
    const msg =
      `⚠️ <b>Kech qoldingiz!</b>\n👤 ${emp.full_name}\n⏰ Kelgan vaqt: ${formatTime(now.toISOString())}\n` +
      `🕐 Kech qolgan: <b>${lateMinutes} daqiqa</b>\n💸 Jarima: <b>${finePercent}%</b>`;

    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: employeeKeyboard() });

    // Guruhga kech kelish xabari
    await notifyGroups(
      `⚠️ <b>${emp.full_name}</b> kech keldi!\n⏰ ${formatTime(now.toISOString())}\n🕐 ${lateMinutes} daqiqa kech\n💸 ${finePercent}% jarima`
    );

    // Adminlarga xabar
    const adminIds = await getAllAdminTgIds();
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId,
          `⚠️ <b>Kech qolish!</b>\n👤 ${emp.full_name}\n⏰ ${formatTime(now.toISOString())}\n🕐 ${lateMinutes} daqiqa kech\n💸 ${finePercent}% jarima`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  }
}

// ─── 🕐 Kech qolaman ─────────────────────────────────────────────────────────

export async function handleWillBeLate(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const date = todayDate();
  const existing = await getTodayAttendance(emp.id, date);

  if (existing?.arrived_at) {
    await ctx.reply('ℹ️ Siz bugun allaqachon keldingiz.', { reply_markup: employeeKeyboard() });
    return;
  }

  ctx.session.state = 'entering_late_reason';
  await ctx.reply(
    '🕐 <b>Kech qolish sababini yozing:</b>\n<i>(Misol: transport muammosi, shifokor, va h.k.)</i>',
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

export async function handleLateReason(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const reason = ctx.message?.text?.trim();
  if (!tgId || !reason) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const date = todayDate();
  await upsertAttendance(emp.id, date, { status: 'late_notified', late_reason: reason });

  // Google Sheets-ga sync
  syncAttendanceToSheets({
    action: 'sync_attendance',
    employee_name: emp.full_name,
    date,
    status: 'late_notified',
    arrived_at: '',
    left_at: '',
    late_minutes: 0,
    late_reason: reason,
    early_leave_reason: '',
    fine_percent: 0,
  }).catch(e => console.error('Sheets sync error:', e));

  ctx.session.state = 'idle';
  await ctx.reply(
    `✅ Sababingiz qabul qilindi.\n📝 Sabab: <i>${reason}</i>\n\nAdminga xabar yuborildi.`,
    { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
  );

  // Guruhga xabar
  await notifyGroups(`🕐 <b>${emp.full_name}</b> kech qolishini bildirib qo'ydi.\n📝 Sabab: <i>${reason}</i>`);

  // Adminlarga xabar
  const adminIds = await getAllAdminTgIds();
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId,
        `🔔 <b>Kech qolish xabari</b>\n👤 ${emp.full_name}\n📅 ${date}\n📝 Sabab: <i>${reason}</i>`,
        { parse_mode: 'HTML' }
      );
    } catch { /* silent */ }
  }
}

// ─── 🚪 Sababli ketmoqchiman ──────────────────────────────────────────────────

export async function handleEarlyLeave(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const hour = currentHour();
  if (hour >= WORK_END_HOUR) {
    await ctx.reply('ℹ️ Ish vaqti tugadi. Xayr! 👋', { reply_markup: employeeKeyboard() });
    return;
  }

  const date = todayDate();
  const existing = await getTodayAttendance(emp.id, date);
  if (!existing?.arrived_at) {
    await ctx.reply('⚠️ Avval "✅ Keldim" tugmasini bosing.', { reply_markup: employeeKeyboard() });
    return;
  }
  if (existing.left_at) {
    await ctx.reply('ℹ️ Siz allaqachon ketgansiz.', { reply_markup: employeeKeyboard() });
    return;
  }

  ctx.session.state = 'entering_early_leave_reason';
  await ctx.reply(
    '🚪 <b>Erta ketish sababini yozing:</b>\n<i>Bu sabab boshliqqa yuboriladi.</i>',
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

export async function handleEarlyLeaveReason(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const reason = ctx.message?.text?.trim();
  if (!tgId || !reason) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const date = todayDate();
  const now = new Date();

  await upsertAttendance(emp.id, date, {
    left_at: now.toISOString(),
    left_early: true,
    early_leave_reason: reason,
  });

  // Google Sheets-ga sync
  const existing2 = await getTodayAttendance(emp.id, date);
  syncAttendanceToSheets({
    action: 'sync_attendance',
    employee_name: emp.full_name,
    date,
    status: existing2?.status || 'on_time',
    arrived_at: existing2?.arrived_at ? formatTime(existing2.arrived_at) : '',
    left_at: formatTime(now.toISOString()),
    late_minutes: existing2?.late_minutes || 0,
    late_reason: existing2?.late_reason || '',
    early_leave_reason: reason,
    fine_percent: existing2?.fine_percent || 0,
  }).catch(e => console.error('Sheets sync error:', e));

  ctx.session.state = 'idle';
  await ctx.reply(
    `✅ Qabul qilindi.\n⏰ Ketish vaqti: <b>${formatTime(now.toISOString())}</b>\n📝 Sabab: <i>${reason}</i>`,
    { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
  );

  // Guruhga xabar
  await notifyGroups(`🚪 <b>${emp.full_name}</b> erta ketdi!\n⏰ ${formatTime(now.toISOString())}\n📝 Sabab: <i>${reason}</i>`);

  // Adminlarga ogohlantirish
  const adminIds = await getAllAdminTgIds();
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId,
        `🚨 <b>Erta ketish!</b>\n👤 ${emp.full_name}\n⏰ ${formatTime(now.toISOString())}\n📝 Sabab: <i>${reason}</i>`,
        { parse_mode: 'HTML' }
      );
    } catch { /* silent */ }
  }
}
