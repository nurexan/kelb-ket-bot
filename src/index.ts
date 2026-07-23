import 'dotenv/config';
import cron from 'node-cron';
import { bot } from './bot';
import { initDatabase } from './migrate';
import { handleStart, handleCodeEntry, handleEnteringEmployeeName, handleEnteringAdminName } from './handlers/auth';
import {
  handleArrived,
  handleWillBeLate,
  handleLateReason,
  handleEarlyLeave,
  handleEarlyLeaveReason,
  handleAdvanceTrip,
  handleTripReason,
  handleLocation,
  handleAdvanceLate,
  handleAdvanceLateReason,
} from './handlers/employee';
import {
  handleAddAdmin,
  handleEmployeeList, handleDeleteEmployee, handleDeleteCallback,
  handleDailyReport, handleMonthlyReport, handleGroupList, handleGoogleSheetsLink
} from './handlers/admin';
import {
  autoCheckoutAll, getAllAdminTgIds, getAllActiveEmployees,
  saveGroupChat, removeGroupChat, getAllGroupChatIds,
} from './db';
import { todayDate, formatTime } from './utils/time';
import { syncAttendanceToSheets } from './utils/sheets';
import { TIMEZONE } from './config';

// ─── /start ──────────────────────────────────────────────────────────────────

bot.command('start', handleStart);

// ─── Bot guruhga qo'shilganda / chiqarilganda ────────────────────────────────

bot.on('my_chat_member', async (ctx) => {
  const chat = ctx.chat;
  const newStatus = ctx.myChatMember.new_chat_member.status;

  // Faqat guruh va superguruhlar uchun
  if (chat.type !== 'group' && chat.type !== 'supergroup') return;

  if (newStatus === 'member' || newStatus === 'administrator') {
    // Bot guruhga qo'shildi
    const addedBy = ctx.myChatMember.from.id;
    const chatTitle = 'title' in chat ? chat.title : 'Guruh';

    await saveGroupChat(chat.id, chatTitle, addedBy);

    try {
      await bot.api.sendMessage(
        chat.id,
        `👋 <b>Davomat boti guruhga qo'shildi!</b>\n\n📢 Endi xodimlar "✅ Keldim" tugmasini bosganda bu guruhga xabar yuboriladi.\n\nAdmin panel uchun bot bilan shaxsiy muloqotda /start yuboring.`,
        { parse_mode: 'HTML' }
      );
    } catch { /* silent */ }

    // Adminlarga xabar
    const adminIds = await getAllAdminTgIds();
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(
          adminId,
          `📢 <b>Yangi guruh qo'shildi!</b>\n🏠 Guruh: <b>${chatTitle}</b>\n📍 ID: <code>${chat.id}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  } else if (newStatus === 'left' || newStatus === 'kicked') {
    // Bot guruhdan chiqarildi
    await removeGroupChat(chat.id);
  }
});

// ─── Matn xabarlari (State Machine) ──────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  // Guruh xabarlarini e'tiborsiz qoldirish (faqat private)
  if (ctx.chat.type !== 'private') return;

  let state = ctx.session.state;
  const text = ctx.message.text;

  const tgId = ctx.from?.id;
  if (tgId) {
    const { findEmployeeByTgId } = await import('./db');
    const emp = await findEmployeeByTgId(tgId);
    if (emp && emp.is_active && emp.full_name === 'Ism kiritilmoqda') {
      ctx.session.state = 'employee_entering_name';
      ctx.session.tempEmpId = emp.id;
      state = 'employee_entering_name';
    }
  }

  // Kodga kiritish
  if (state === 'entering_code') {
    await handleCodeEntry(ctx);
    return;
  }

  // Xodim: kech qolish sababi
  if (state === 'entering_late_reason') {
    await handleLateReason(ctx);
    return;
  }

  // Xodim: erta ketish sababi
  if (state === 'entering_early_leave_reason') {
    await handleEarlyLeaveReason(ctx);
    return;
  }

  // Ketish vaqtini uzaytirish (17:45 eslatmasi)
  if (state === 'entering_extend_time') {
    const { handleExtendTime } = await import('./handlers/employee');
    await handleExtendTime(ctx);
    return;
  }

  // Xodim: Kech qolish (ertaga) sababi
  if (state === 'entering_advance_late_reason') {
    await handleAdvanceLateReason(ctx);
    return;
  }

  // Xodim: Bozorga borish (xizmat safari) sababi
  if (state === 'entering_trip_reason') {
    await handleTripReason(ctx);
    return;
  }

  // Xodim: o'z ismini kiritish (birinchi marta kod terganda)
  if (state === 'employee_entering_name') {
    await handleEnteringEmployeeName(ctx);
    return;
  }

  // Admin: o'z ismini kiritish (birinchi marta kod terganda)
  if (state === 'admin_self_entering_name') {
    await handleEnteringAdminName(ctx);
    return;
  }

  // ─── Reply Keyboard tugmalar ─────────────────────────────────────────

  // Xodim tugmalar
  if (text === '✅ Keldim') { await handleArrived(ctx); return; }
  if (text === '🕐 Kech qolaman') { await handleWillBeLate(ctx); return; }
  if (text === '🚪 Sababli ketmoqchiman') { await handleEarlyLeave(ctx); return; }
  if (text === '🚗 Ertaga xizmat safari') { await handleAdvanceTrip(ctx); return; }
  if (text === '⏰ Ertaga kech qolaman') { await handleAdvanceLate(ctx); return; }

  // Admin tugmalar
  if (text === '🔑 Admin qo\'shish') { await handleAddAdmin(ctx); return; }
  if (text === '📊 Kunlik hisobot') { await handleDailyReport(ctx); return; }
  if (text === '📅 Oylik hisobot') { await handleMonthlyReport(ctx); return; }
  if (text === '📋 Xodimlar ro\'yxati') { await handleEmployeeList(ctx); return; }
  if (text === '🗑 Xodimni o\'chirish') { await handleDeleteEmployee(ctx); return; }
  if (text === '📢 Guruhlar') { await handleGroupList(ctx); return; }
  if (text === '📊 Google Sheets') { await handleGoogleSheetsLink(ctx); return; }
});

// ─── Lokatsiya kelganda (Xizmat safari) ──────────────────────────────────────
bot.on('message:location', async (ctx) => {
  await handleLocation(ctx);
});

// ─── Inline tugmalar ──────────────────────────────────────────────────────────

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'request_join') {
    const { handleRequestJoin } = await import('./handlers/auth');
    await handleRequestJoin(ctx);
    return;
  }

  if (data.startsWith('join_accept_')) {
    const { handleJoinAccept } = await import('./handlers/auth');
    await handleJoinAccept(ctx);
    return;
  }

  if (data.startsWith('join_reject_')) {
    const { handleJoinReject } = await import('./handlers/auth');
    await handleJoinReject(ctx);
    return;
  }

  if (data === 'enter_code') {
    ctx.session.state = 'entering_code';
    await ctx.reply(
      `🔑 Iltimos, sizga berilgan <b>unikal kodni</b> kiriting:\n<i>(Masalan: EMP-7X9K3M yoki ADM-3Q5R8L)</i>`,
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    );
    await ctx.answerCallbackQuery();
    return;
  }

  if (data.startsWith('trip_')) {
    const { handleTripCallback } = await import('./handlers/admin');
    await handleTripCallback(ctx);
    return;
  }

  if (data.startsWith('leave_')) {
    const { handleLeaveReminderCallback } = await import('./handlers/employee');
    await handleLeaveReminderCallback(ctx);
    return;
  }

  await handleDeleteCallback(ctx);
});

// ─── ⏰ Har daqiqa tekshirish (17:45 eslatmalari uchun) ────────────────────────
cron.schedule('* * * * *', async () => {
  const date = todayDate();
  const d = new Date(new Date().toLocaleString('sv-SE', { timeZone: TIMEZONE }).replace(' ', 'T'));
  
  // 17:45 ga yetganini aniqlaymiz yoki agar expected_leave_at o'rnatilgan bo'lsa uni tekshiramiz
  const isDefaultReminderTime = d.getHours() === 17 && d.getMinutes() >= 45;
  
  // Custom reminderlarga ham shu soat atrofida qaraymiz:
  // Hozirgi vaqtni 15 daqiqa keyinga suramiz (expected_leave_at - 15m)
  d.setMinutes(d.getMinutes() + 15);
  const futureTime = d.toISOString();

  try {
    const { getPendingLeaveReminders, markLeaveReminderSent, findEmployeeById } = await import('./db');
    const { InlineKeyboard } = await import('grammy');
    
    // Aslida getPendingLeaveReminders qachon ishlashi kerak:
    // Agar soat 17:45 dan o'tgan bo'lsa va expected_leave_at yo'q bo'lsa
    // Yoki expected_leave_at hozir+15m dan kichik bo'lsa (ya'ni ketishga <=15m qolsa)
    
    const pendings = await getPendingLeaveReminders(date, futureTime);
    
    for (const att of pendings) {
      if (!isDefaultReminderTime && !att.expected_leave_at) continue; // Default reminder faqat 17:45 dan boshlanadi

      const emp = await findEmployeeById(att.employee_id);
      if (emp?.telegram_id) {
        const kb = new InlineKeyboard()
          .text('🚪 Ketdim', `leave_checkout_${att.id}`)
          .text('⏳ Hali ishlarim o\'z yakuniga yetmadi', `leave_extend_${att.id}`);
        
        try {
          await bot.api.sendMessage(emp.telegram_id,
            `⏳ <b>Ish vaqtingiz o'z yakuniga yetmoqda.</b>\n\nIsh joyingizni tartibli, kunlik ishlaringiz o'z yakuniga yetgan bo'lsa sizga maroqli xordiq tilaymiz!`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
          await markLeaveReminderSent(att.id);
        } catch { /* silent */ }
      }
    }
  } catch (e) {
    console.error('Leave reminder cron error:', e);
  }
}, { timezone: TIMEZONE, scheduled: true });

// ─── ⏰ Avtomatik 18:00 ketdi (node-cron) ────────────────────────────────────

cron.schedule('0 18 * * 1-5', async () => {
  console.log('⏰ 18:00 auto-checkout ishga tushdi');
  const date = todayDate();
  const now = new Date();

  try {
    const checkedOut = await autoCheckoutAll(date, now.toISOString());

    // Xodimlarga "Ish vaqti tugadi" xabari
    for (const emp of checkedOut) {
      if (emp.telegram_id) {
        try {
          await bot.api.sendMessage(emp.telegram_id,
            `🏁 <b>Ish vaqti tugadi!</b>\n⏰ Ketish vaqti: <b>${formatTime(now.toISOString())}</b>\n\nXayr! Yaxshi dam oling 👋`,
            { parse_mode: 'HTML' }
          );
        } catch { /* silent */ }
      }
      
      syncAttendanceToSheets({
        action: 'sync_attendance',
        employee_name: emp.full_name,
        date: date,
        status: 'on_time', 
        left_at: formatTime(now.toISOString()),
        arrived_at: '',
        late_minutes: 0,
        late_reason: '',
        early_leave_reason: '',
        fine_amount: 0
      }).catch((e: any) => console.error('Sheets sync error on auto-checkout:', e));
    }

    // Guruhga kunlik yakuniy xabar
    const groupIds = await getAllGroupChatIds();
    if (checkedOut.length > 0) {
      const nameList = checkedOut.map(e => `• ${e.full_name}`).join('\n');
      const groupMsg = `🏁 <b>Ish kuni yakunlandi!</b>\n📅 ${date}\n\n✅ Bugun kelgan xodimlar:\n${nameList}\n\n<i>Hammaga yaxshi dam olish!</i>`;
      for (const groupId of groupIds) {
        try {
          await bot.api.sendMessage(groupId, groupMsg, { parse_mode: 'HTML' });
        } catch { /* silent */ }
      }
    }

    // Adminlarga kunlik summary
    const adminIds = await getAllAdminTgIds();
    for (const adminId of adminIds) {
      try {
        await bot.api.sendMessage(adminId,
          `📊 <b>Kun yakunlandi</b>\n📅 ${date}\n✅ Auto-checkout qilingan: ${checkedOut.length} ta xodim`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  } catch (e) {
    console.error('Auto-checkout xato:', e);
  }
}, { timezone: TIMEZONE, scheduled: true });

// ─── ⏰ 8:45 eslatma ─────────────────────────────────────────────────────────

cron.schedule('45 8 * * 1-5', async () => {
  console.log('⏰ 8:45 eslatma yuborilmoqda');
  try {
    const employees = await getAllActiveEmployees();
    for (const emp of employees) {
      if (!emp.telegram_id) continue;
      try {
        await bot.api.sendMessage(emp.telegram_id,
          `⏰ <b>Eslatma!</b> Ish 15 daqiqadan boshlandi.\n\n✅ Ish joyiga yetib kelsangiz "Keldim" tugmasini bosing.`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  } catch (e) {
    console.error('8:45 eslatma xato:', e);
  }
}, { timezone: TIMEZONE, scheduled: true });

// ─── ⏰ 8:20 Motivatsiya (Ish kunlari) ──────────────────────────────────────

cron.schedule('20 8 * * 1-6', async () => {
  console.log('⏰ 8:20 motivatsiya yuborilmoqda');
  try {
    const { MOTIVATIONAL_QUOTES } = await import('./utils/quotes');
    const q = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    
    const employees = await getAllActiveEmployees();
    for (const emp of employees) {
      if (!emp.telegram_id) continue;
      try {
        await bot.api.sendMessage(emp.telegram_id,
          `🌅 <b>Xayrli tong!</b>\n\n💡 <i>"${q}"</i>\n\nBugungi ishlaringizda muvaffaqiyat tilaymiz! ✨`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  } catch (e) {
    console.error('8:20 motivatsiya xato:', e);
  }
}, { timezone: TIMEZONE, scheduled: true });

// ─── ⏰ 8:30 Yakshanba dam olish kuni xabari ─────────────────────────────────

cron.schedule('30 8 * * 0', async () => {
  console.log('⏰ 8:30 yakshanba xabari yuborilmoqda');
  try {
    const employees = await getAllActiveEmployees();
    for (const emp of employees) {
      if (!emp.telegram_id) continue;
      try {
        await bot.api.sendMessage(emp.telegram_id,
          `🏖 <b>Bugun Yakshanba - dam olish kuni!</b>\n\nAgar shunchaki dam olish bo'lsa hech qanday amal amalga oshirmang, odatiy dam olish belgilanadi.\nOila a'zolaringizga sihat-salomatlik, ular bilan xayrli dam olish tilaymiz! 😊\n\n<i>Agar ishga bormoqchi bo'lsangiz "✅ Keldim" ni bosing.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch { /* silent */ }
    }
  } catch (e) {
    console.error('8:30 yakshanba xato:', e);
  }
}, { timezone: TIMEZONE, scheduled: true });

// ─── Ishga tushirish ──────────────────────────────────────────────────────────

async function main() {
  await initDatabase();

  console.log('🤖 Davomat boti ishga tushirilmoqda...');

  bot.start({
    onStart: async (info) => {
      console.log(`✅ Bot ishga tushdi: @${info.username}`);
    },
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  });
}

main().catch(console.error);
