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

export async function handleArrived(ctx: MyContext, loc?: { latitude: number, longitude: number }) {
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
  const tashkentNow = new Date(now.toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(' ', 'T'));
  const isSunday = tashkentNow.getDay() === 0;

  // Xizmat safari yoki yakshanba dam olish
  let isLate = false;
  let lateMinutes = 0;
  let fineAmount = 0;
  let finePercent = 0;
  let status: any = existing?.status === 'trip_approved' ? 'trip_approved' : 'on_time';

  if (!isSunday && status !== 'trip_approved') {
    lateMinutes = calcLateMinutes(now.toISOString());
    isLate = lateMinutes > 0;
    
    if (isLate) {
      if (existing?.status === 'late_notified_advance') {
        status = 'late_notified_advance';
      } else {
        status = 'late';
      }

      // Jarima hisoblash
      const db = require('../db');
      const unnotifiedLates = await db.getLateCountForMonth(emp.id, tashkentNow.getFullYear(), tashkentNow.getMonth() + 1, false);
      const notifiedLates = await db.getLateCountForMonth(emp.id, tashkentNow.getFullYear(), tashkentNow.getMonth() + 1, true);
      
      const totalLates = unnotifiedLates + (status === 'late' ? 1 : 0);
      const totalNotified = notifiedLates + (status === 'late_notified_advance' ? 1 : 0);

      // 3 tagacha ogohlantirilgan kechikish bepul
      const effectiveLates = totalLates + Math.max(0, totalNotified - 3);

      if (effectiveLates >= 1 && effectiveLates <= 3) fineAmount = 30000;
      else if (effectiveLates >= 4 && effectiveLates <= 8) fineAmount = 50000;
      else if (effectiveLates >= 9) fineAmount = 100000;
    }
  }

  await upsertAttendance(emp.id, date, {
    arrived_at: now.toISOString(),
    status,
    late_minutes: lateMinutes,
    fine_percent: finePercent, // old legacy column
    fine_amount: fineAmount
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
    fine_amount: fineAmount,
  }).catch(e => console.error('Sheets sync error:', e));

  if (!isLate) {
    const arrivalMsg = `✅ <b>${isSunday ? 'Yakshanba - Dam olish kunida ' : ''}Ishga keldingiz!</b>\n👤 ${emp.full_name}\n⏰ ${formatTime(now.toISOString())}\n📅 ${date}`;
    await ctx.reply(arrivalMsg, { parse_mode: 'HTML', reply_markup: employeeKeyboard() });

    await notifyGroups(`✅ <b>${emp.full_name}</b> ishga keldi!\n⏰ ${formatTime(now.toISOString())} — O'z vaqtida`);
  } else {
    const msg =
      `⚠️ <b>Kech qoldingiz!</b>\n👤 ${emp.full_name}\n⏰ Kelgan vaqt: ${formatTime(now.toISOString())}\n` +
      `🕐 Kech qolgan: <b>${lateMinutes} daqiqa</b>\n💸 Ushlanma: <b>${fineAmount.toLocaleString()} so'm</b>${status === 'late_notified_advance' ? ' (Oldindan ogohlantirilgan)' : ''}`;

    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: employeeKeyboard() });

    await notifyGroups(
      `⚠️ <b>${emp.full_name}</b> kech keldi!\n⏰ ${formatTime(now.toISOString())}\n🕐 ${lateMinutes} daqiqa kech\n💸 ${fineAmount.toLocaleString()} so'm ushlanma`
    );

    const adminIds = await getAllAdminTgIds();
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId,
          `⚠️ <b>Kech qolish!</b>\n👤 ${emp.full_name}\n⏰ ${formatTime(now.toISOString())}\n🕐 ${lateMinutes} daqiqa kech\n💸 ${fineAmount.toLocaleString()} so'm ushlanma`,
          { parse_mode: 'HTML' }
        );
        if (loc) await bot.api.sendLocation(adminId, loc.latitude, loc.longitude);
      } catch { /* silent */ }
    }
  }

  // If on_time and location provided, send location to admins too
  if (!isLate && loc) {
    const adminIds = await getAllAdminTgIds();
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId, `📍 <b>${emp.full_name} ishga keldi:</b>`, { parse_mode: 'HTML' });
        await bot.api.sendLocation(adminId, loc.latitude, loc.longitude);
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
    fine_amount: 0,
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
    fine_amount: existing2?.fine_amount || 0,
  }).catch(e => console.error('Sheets sync error:', e));

  ctx.session.state = 'idle';
  await ctx.reply(
    `✅ Qabul qilindi.\n⏰ Ketish vaqti: <b>${formatTime(now.toISOString())}</b>\n📝 Sabab: <i>${reason}</i>`,
    { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
  );

  // Guruhga xabar
  await notifyGroups(`🚪 <b>${emp.full_name}</b> ishdan erta ketdi.\n⏰ ${formatTime(now.toISOString())}\n📝 Sabab: <i>${reason}</i>`);
}

// ─── 🚗 Xizmat Safari (Ertaga) ──────────────────────────────────────────────────

export async function handleAdvanceTrip(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  ctx.session.state = 'entering_trip_reason';
  await ctx.reply(
    '🚗 <b>Ertangi xizmat safari haqida ma\'lumot bering:</b>\n<i>Qayerga va nima maqsadda bormoqchisiz?</i>',
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

export async function handleTripReason(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const reason = ctx.message?.text?.trim();
  if (!tgId || !reason) return;
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const { requestTrip, getAllAdminTgIds } = await import('../db');
  
  // Ertangi kunni hisoblash
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

  try {
    const trip = await requestTrip(emp.id, targetDate, reason);
    
    ctx.session.state = 'idle';
    await ctx.reply('⏳ <b>So\'rovingiz adminga yuborildi. Tasdiqlanishini kuting.</b>', { parse_mode: 'HTML', reply_markup: employeeKeyboard() });

    // Adminlarga yuborish
    const adminIds = await getAllAdminTgIds();
    const { InlineKeyboard } = await import('grammy');
    const kb = new InlineKeyboard()
      .text('✅ Tasdiqlash', `trip_ok_${trip.id}`)
      .text('❌ Rad etish', `trip_no_${trip.id}`);

    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId,
          `🚗 <b>Xizmat safari so'rovi!</b>\n👤 Xodim: <b>${emp.full_name}</b>\n📅 Sana: <b>${targetDate}</b>\n📝 Maqsad: <i>${reason}</i>`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } catch { /* silent */ }
    }
  } catch (e) {
    console.error(e);
    await ctx.reply('❌ Xatolik yuz berdi.', { reply_markup: employeeKeyboard() });
  }
}

export async function handleLocation(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const loc = ctx.message?.location;
  if (!tgId || !loc) return;
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  // Adminlarga darhol lokatsiyani yuborish
  const { getAllAdminTgIds } = await import('../db');
  const adminIds = await getAllAdminTgIds();
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId, `📍 <b>${emp.full_name} lokatsiya yubordi:</b>`, { parse_mode: 'HTML' });
      await bot.api.sendLocation(adminId, loc.latitude, loc.longitude);
    } catch { /* silent */ }
  }

  const date = todayDate();
  const existing = await getTodayAttendance(emp.id, date);

  if (existing?.status === 'trip_approved') {
    const now = new Date();
    await upsertAttendance(emp.id, date, {
      arrived_at: now.toISOString(),
    });

    await ctx.reply('✅ <b>Lokatsiya qabul qilindi. Xizmat safari boshlandi!</b>', { parse_mode: 'HTML', reply_markup: employeeKeyboard() });
  } else {
    // Normal check-in with location
    await handleArrived(ctx, loc);
  }
}

// ─── ⏰ Ertaga kech qolaman ──────────────────────────────────────────────────

export async function handleAdvanceLate(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  ctx.session.state = 'entering_advance_late_reason';
  await ctx.reply(
    '⏰ <b>Ertaga soat nechada kelasiz? Va sababi nima?</b>\n<i>(Masalan: 11:30 da kelaman, shifokorga borishim kerak)</i>',
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

export async function handleAdvanceLateReason(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const reason = ctx.message?.text?.trim();
  if (!tgId || !reason) return;
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  // Ertangi kun
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

  await upsertAttendance(emp.id, targetDate, { status: 'late_notified_advance', late_reason: reason });

  ctx.session.state = 'idle';
  await ctx.reply('✅ Qabul qilindi. Asosiy talab: aniqlik va mas\'uliyat.', { reply_markup: employeeKeyboard() });

  // Adminlarga yuborish
  const { getAllAdminTgIds } = await import('../db');
  const adminIds = await getAllAdminTgIds();
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId,
        `⏰ <b>Ertaga kech kelish (Oldindan ogohlantirish)</b>\n👤 Xodim: <b>${emp.full_name}</b>\n📅 Sana: <b>${targetDate}</b>\n📝 Sabab/Vaqt: <i>${reason}</i>`,
        { parse_mode: 'HTML' }
      );
    } catch { /* silent */ }
  }
}

// ─── 17:45 Eslatma / Vaqt uzaytirish ──────────────────────────────────────

export async function handleLeaveReminderCallback(ctx: MyContext) {
  const data = ctx.callbackQuery?.data;
  const tgId = ctx.from?.id;
  if (!data || !tgId) return;

  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const attendanceId = data.replace('leave_', '');
  
  if (attendanceId.startsWith('checkout_')) {
    const aid = attendanceId.replace('checkout_', '');
    const date = todayDate();
    const now = new Date();
    await upsertAttendance(emp.id, date, { left_at: now.toISOString(), left_early: false });
    
    await ctx.editMessageText(`✅ Xayr! Yaxshi dam oling 👋\n⏰ Ketish vaqti: <b>${formatTime(now.toISOString())}</b>`, { parse_mode: 'HTML' });
    
    // Sheets sync
    const existing = await getTodayAttendance(emp.id, date);
    syncAttendanceToSheets({
      action: 'sync_attendance',
      employee_name: emp.full_name,
      date,
      status: existing?.status || 'on_time',
      arrived_at: existing?.arrived_at ? formatTime(existing?.arrived_at) : '',
      left_at: formatTime(now.toISOString()),
      late_minutes: existing?.late_minutes || 0,
      late_reason: existing?.late_reason || '',
      early_leave_reason: existing?.early_leave_reason || '',
      fine_amount: existing?.fine_amount || 0,
    }).catch(e => console.error(e));

  } else if (attendanceId.startsWith('extend_')) {
    const aid = attendanceId.replace('extend_', '');
    ctx.session.state = 'entering_extend_time';
    ctx.session.tempAttendanceId = aid;
    await ctx.reply('⏳ <b>Taxminiy ketish vaqtingizni yozing (Masalan: 19:30):</b>', { parse_mode: 'HTML' });
    await ctx.answerCallbackQuery();
  }
}

export async function handleExtendTime(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const timeStr = ctx.message?.text?.trim();
  const aid = ctx.session.tempAttendanceId;
  if (!tgId || !timeStr || !aid) return;
  
  const emp = await findEmployeeByTgId(tgId);
  if (!emp) return;

  const now = new Date();
  
  // Format check very simple (HH:mm)
  if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
     await ctx.reply('❌ Noto\'g\'ri format. 19:30 kabi yozing:');
     return;
  }
  
  const [hh, mm] = timeStr.split(':');
  const d = new Date(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(' ', 'T'));
  d.setHours(parseInt(hh), parseInt(mm), 0, 0);
  
  const { updateExpectedLeaveTime } = await import('../db');
  await updateExpectedLeaveTime(aid, d.toISOString());
  
  ctx.session.state = 'idle';
  ctx.session.tempAttendanceId = undefined;
  await ctx.reply(`✅ Qabul qilindi. Ketishdan 15 daqiqa oldin yana eslatamiz.`, { reply_markup: employeeKeyboard() });
}
