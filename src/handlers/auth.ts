import { MyContext, bot } from '../bot';
import {
  findEmployeeByTgId, findAdminByTgId,
  findAdminByCode,
  bindAdminTgId,
  bindEmployeeTgIdAndName, bindAdminTgIdAndName
} from '../db';
import { syncEmployeeToSheets } from '../utils/sheets';

// ─── Klaviaturalar ────────────────────────────────────────────────────────────

export function employeeKeyboard() {
  return {
    keyboard: [
      [{ text: '✅ Keldim', request_location: true }, { text: '🕐 Kech qolaman' }],
      [{ text: '🚪 Sababli ketmoqchiman' }, { text: '🚗 Ertaga xizmat safari' }],
      [{ text: '📍 Xizmat joyidaman', request_location: true }],
      [{ text: '⏰ Ertaga kech qolaman' }]
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

export function adminKeyboard() {
  return {
    keyboard: [
      [{ text: '🔑 Admin qo\'shish' }],
      [{ text: '📊 Kunlik hisobot' }, { text: '📅 Oylik hisobot' }],
      [{ text: '📋 Xodimlar ro\'yxati' }, { text: '🗑 Xodimni o\'chirish' }],
      [{ text: '📢 Guruhlar' }, { text: '📊 Google Sheets' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

// ─── /start ──────────────────────────────────────────────────────────────────

export async function handleStart(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  // Admin tekshirish
  const admin = await findAdminByTgId(tgId);
  if (admin) {
    ctx.session.state = 'idle';
    await ctx.reply(
      `👋 Xush kelibsiz, <b>${admin.full_name}</b>!\n\n🔧 <b>Admin paneliga</b> xush kelibsiz.`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
    return;
  }

  // Xodim tekshirish
  const employee = await findEmployeeByTgId(tgId);
  if (employee) {
    ctx.session.state = 'idle';
    await ctx.reply(
      `👋 Xush kelibsiz, <b>${employee.full_name}</b>!\n\n📍 Ish vaqti: <b>09:00 – 18:00</b>`,
      { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
    );
    return;
  }

  // Yangi foydalanuvchi
  ctx.session.state = 'idle';
  const { InlineKeyboard } = await import('grammy');
  const kb = new InlineKeyboard()
    .text('📨 So\'rov yuborish', 'request_join')
    .row()
    .text('🔑 Admin kodini kiritish', 'enter_code');

  await ctx.reply(
    `👋 <b>V.1.4 Xush kelibsiz!</b>\n\nSiz xodimlar ro'yxatida yo'qsiz. Xodim sifatida qo'shilish uchun adminga so'rov yuboring:`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

// ─── Kod kiritish ─────────────────────────────────────────────────────────────

export async function handleCodeEntry(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const text = ctx.message?.text?.trim().toUpperCase();
  if (!tgId || !text) return;

  // Xodimlar ro'yxatdan o'tishi endi faqat tugma orqali (Request-Approval) amalga oshiriladi.
  if (text.startsWith('EMP-')) {
    await ctx.reply('❌ Xodimlar ro\'yxatdan o\'tish uchun /start ni bosing va so\'rov yuboring.');
    return;
  }

  // Admin kodi?
  if (text.startsWith('ADM-')) {
    const adm = await findAdminByCode(text);
    if (!adm) {
      await ctx.reply('❌ Kod topilmadi. Iltimos, to\'g\'ri kodni kiriting:');
      return;
    }
    if (adm.telegram_id && adm.telegram_id !== tgId) {
      await ctx.reply('⛔ Bu kod allaqachon boshqa foydalanuvchiga bog\'langan.');
      return;
    }

    if (!adm.telegram_id || adm.full_name === 'Kutmoqda...') {
      ctx.session.state = 'admin_self_entering_name';
      ctx.session.tempAdminId = adm.id;
      await ctx.reply('✏️ <b>Iltimos, ism-familiyangizni kiriting:</b>', { parse_mode: 'HTML' });
      return;
    }

    ctx.session.state = 'idle';
    await ctx.reply(
      `✅ Admin sifatida tasdiqlandi!\n\n👤 Ism: <b>${adm.full_name}</b>\n🆔 Kodingiz: <code>${adm.unique_code}</code>`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
    return;
  }

  await ctx.reply('❌ Noto\'g\'ri format. Kod <code>EMP-</code> yoki <code>ADM-</code> bilan boshlanishi kerak:', { parse_mode: 'HTML' });
}

// ─── Ism kiritish (Xodim) ──────────────────────────────────────────────────────

export async function handleEnteringEmployeeName(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const name = ctx.message?.text?.trim();
  const empId = ctx.session.tempEmpId;

  if (!tgId || !name || !empId) {
    ctx.session.state = 'idle';
    await ctx.reply('❌ Xato yuz berdi. Iltimos /start ni bosing.');
    return;
  }

  try {
    await bindEmployeeTgIdAndName(empId, tgId, name);
    
    // Google Sheets sync
    try {
      await syncEmployeeToSheets(name);
    } catch (e) {
      console.error('Sheets sync error:', e);
    }

    ctx.session.state = 'idle';
    ctx.session.tempEmpId = undefined;
    
    await ctx.reply(
      `✅ <b>Ro'yxatdan o'tdingiz!</b>\n\n👤 Ism: <b>${name}</b>\n\n📍 Ish vaqti: <b>09:00 – 18:00</b>`,
      { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
    );
  } catch (e: any) {
    console.error('handleEnteringEmployeeName error:', e);
    await ctx.reply(`❌ Xato yuz berdi: ${e.message}`);
    ctx.session.state = 'idle';
  }
}

// ─── Ism kiritish (Admin) ──────────────────────────────────────────────────────

export async function handleEnteringAdminName(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const name = ctx.message?.text?.trim();
  const admId = ctx.session.tempAdminId;

  if (!tgId || !name || !admId) {
    ctx.session.state = 'idle';
    await ctx.reply('❌ Xato yuz berdi. Iltimos /start ni bosing.');
    return;
  }

  try {
    await bindAdminTgIdAndName(admId, tgId, name);
    
    ctx.session.state = 'idle';
    ctx.session.tempAdminId = undefined;
    
    await ctx.reply(
      `✅ <b>Ro'yxatdan o'tdingiz! Admin panel faollashdi.</b>\n\n👤 Ism: <b>${name}</b>`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
  } catch (e: any) {
    console.error('handleEnteringAdminName error:', e);
    await ctx.reply(`❌ Xato yuz berdi: ${e.message}`);
    ctx.session.state = 'idle';
  }
}

// ─── Yangi Xodim qo'shilish so'rovi va admin qabul qilish jarayoni ────────────────

export async function handleRequestJoin(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const username = ctx.from?.username ? `@${ctx.from.username}` : 'Mavjud emas';
  const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || 'Noma\'lum';
  
  // Adminlar ro'yxatini olish
  const { getAllAdminTgIds } = await import('../db');
  const adminIds = await getAllAdminTgIds();

  if (adminIds.length === 0) {
    await ctx.answerCallbackQuery({ text: 'Tizimda hali adminlar yo\'q. Kodingizni kiriting.', show_alert: true });
    return;
  }

  const { InlineKeyboard } = await import('grammy');
  const kb = new InlineKeyboard()
    .text('✅ Qabul qilish', `join_accept_${tgId}`)
    .text('❌ Rad etish', `join_reject_${tgId}`);

  let adminMessage = `👤 <b>Yangi xodim qo'shilish so'rovi!</b>\n\n`;
  adminMessage += `🆔 Telegram ID: <code>${tgId}</code>\n`;
  adminMessage += `Ism (Telegram): <b>${fullName}</b>\n`;
  adminMessage += `Username: ${username}\n`;
  adminMessage += `<a href="tg://user?id=${tgId}">Profilni ko'rish</a>\n\n`;
  adminMessage += `Ushbu foydalanuvchini xodim sifatida qo'shishga ruxsat berasizmi?`;

  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId, adminMessage, { parse_mode: 'HTML', reply_markup: kb });
    } catch (err) {
      console.error(`Failed to notify admin ${adminId}:`, err);
    }
  }

  await ctx.answerCallbackQuery({ text: 'So\'rovingiz yuborildi!' });
  await ctx.editMessageText('⏳ <b>So\'rovingiz adminga yuborildi.</b>\nAdmin tasdiqlashini kuting. Tasdiqlanganidan so\'ng sizga xabar yuboriladi.', { parse_mode: 'HTML' });
}

export async function handleJoinAccept(ctx: MyContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const targetTgId = parseInt(data.replace('join_accept_', ''), 10);
  if (isNaN(targetTgId)) return;

  const { createEmployeeFromRequest, findEmployeeByTgId } = await import('../db');

  try {
    const existing = await findEmployeeByTgId(targetTgId);
    if (existing && existing.is_active && existing.full_name !== 'Ism kiritilmoqda') {
      await ctx.answerCallbackQuery({ text: 'Xodim allaqachon faol.', show_alert: true });
      await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n⚠️ <b>Foydalanuvchi allaqachon xodim sifatida faol.</b>', { parse_mode: 'HTML' });
      return;
    }

    // Bazada xodim yaratish
    await createEmployeeFromRequest(targetTgId);

    // Xodimga bildirishnoma yuborish
    try {
      await bot.api.sendMessage(targetTgId, `🎉 <b>Siz xodim sifatida qabul qilindingiz!</b>\n\n✏️ Iltimos, ism va familiyangizni kiriting:`, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`Failed to send message to user ${targetTgId}:`, err);
    }

    await ctx.answerCallbackQuery({ text: 'Qabul qilindi!' });
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n✅ <b>QABUL QILINDI</b>', { parse_mode: 'HTML' });
  } catch (err: any) {
    console.error('handleJoinAccept error:', err);
    await ctx.answerCallbackQuery({ text: `Xatolik: ${err.message}`, show_alert: true });
  }
}

export async function handleJoinReject(ctx: MyContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const targetTgId = parseInt(data.replace('join_reject_', ''), 10);
  if (isNaN(targetTgId)) return;

  try {
    await bot.api.sendMessage(targetTgId, `❌ <b>Afsuski, xodim sifatida qo'shilish so'rovingiz rad etildi.</b>`, { parse_mode: 'HTML' });
  } catch { /* silent */ }

  await ctx.answerCallbackQuery({ text: 'Rad etildi!' });
  await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n❌ <b>RAD ETILDI</b>', { parse_mode: 'HTML' });
}
