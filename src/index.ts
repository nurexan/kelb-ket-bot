import 'dotenv/config';
import cron from 'node-cron';
import { bot } from './bot';
import { initDatabase } from './migrate';
import { handleStart, handleCodeEntry, handleEnteringEmployeeName, handleEnteringAdminName } from './handlers/auth';
import {
  handleArrived, handleWillBeLate, handleLateReason,
  handleEarlyLeave, handleEarlyLeaveReason,
} from './handlers/employee';
import {
  handleAddEmployee,
  handleAddAdmin,
  handleEmployeeList, handleDeleteEmployee, handleDeleteCallback,
  handleDailyReport, handleMonthlyReport, handleGroupList,
} from './handlers/admin';
import {
  autoCheckoutAll, getAllAdminTgIds, getAllActiveEmployees,
  saveGroupChat, removeGroupChat, getAllGroupChatIds,
} from './db';
import { todayDate, formatTime } from './utils/time';
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

  const state = ctx.session.state;
  const text = ctx.message.text;

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

  // Admin tugmalar
  if (text === '👥 Xodim qo\'shish') { await handleAddEmployee(ctx); return; }
  if (text === '🔑 Admin qo\'shish') { await handleAddAdmin(ctx); return; }
  if (text === '📊 Kunlik hisobot') { await handleDailyReport(ctx); return; }
  if (text === '📅 Oylik hisobot') { await handleMonthlyReport(ctx); return; }
  if (text === '📋 Xodimlar ro\'yxati') { await handleEmployeeList(ctx); return; }
  if (text === '🗑 Xodimni o\'chirish') { await handleDeleteEmployee(ctx); return; }
  if (text === '📢 Guruhlar') { await handleGroupList(ctx); return; }
});

// ─── Inline tugmalar ──────────────────────────────────────────────────────────

bot.on('callback_query:data', handleDeleteCallback);

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
