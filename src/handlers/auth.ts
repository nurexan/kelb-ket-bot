import { MyContext } from '../bot';
import {
  findEmployeeByTgId, findAdminByTgId,
  findEmployeeByCode, findAdminByCode,
  bindEmployeeTgId, bindAdminTgId,
  bindEmployeeTgIdAndName, bindAdminTgIdAndName
} from '../db';
import { syncEmployeeToSheets } from '../utils/sheets';

// ─── Klaviaturalar ────────────────────────────────────────────────────────────

export function employeeKeyboard() {
  return {
    keyboard: [
      [{ text: '✅ Keldim' }, { text: '🕐 Kech qolaman' }],
      [{ text: '🚪 Sababli ketmoqchiman' }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

export function adminKeyboard() {
  return {
    keyboard: [
      [{ text: '👥 Xodim qo\'shish' }, { text: '🔑 Admin qo\'shish' }],
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
  ctx.session.state = 'entering_code';
  await ctx.reply(
    `👋 <b>Davomat botiga xush kelibsiz!</b>\n\n🔑 Iltimos, sizga berilgan <b>unikal kodni</b> kiriting:\n<i>(Masalan: EMP-7X9K3M yoki ADM-3Q5R8L)</i>`,
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
  );
}

// ─── Kod kiritish ─────────────────────────────────────────────────────────────

export async function handleCodeEntry(ctx: MyContext) {
  const tgId = ctx.from?.id;
  const text = ctx.message?.text?.trim().toUpperCase();
  if (!tgId || !text) return;

  // Xodim kodi?
  if (text.startsWith('EMP-')) {
    const emp = await findEmployeeByCode(text);
    if (!emp) {
      await ctx.reply('❌ Kod topilmadi. Iltimos, to\'g\'ri kodni kiriting:');
      return;
    }
    if (emp.telegram_id && emp.telegram_id !== tgId) {
      await ctx.reply('⛔ Bu kod allaqachon boshqa foydalanuvchiga bog\'langan.');
      return;
    }
    
    if (!emp.telegram_id || emp.full_name === 'Kutmoqda...') {
      ctx.session.state = 'employee_entering_name';
      ctx.session.tempEmpId = emp.id;
      await ctx.reply('✏️ <b>Iltimos, ism-familiyangizni kiriting:</b>\n<i>(To\'liq ismingiz hisobotlarda ko\'rinadi)</i>', { parse_mode: 'HTML' });
      return;
    }

    // Allaqachon ro'yxatdan o'tgan
    ctx.session.state = 'idle';
    await ctx.reply(
      `✅ Tasdiqlandi!\n\n👤 Ism: <b>${emp.full_name}</b>\n🆔 Kodingiz: <code>${emp.unique_code}</code>\n\n📍 Ish vaqti: <b>09:00 – 18:00</b>`,
      { parse_mode: 'HTML', reply_markup: employeeKeyboard() }
    );
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
    syncEmployeeToSheets(name).catch((e: any) => console.error('Sheets sync error:', e));

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
