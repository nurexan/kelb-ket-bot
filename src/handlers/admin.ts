import { MyContext } from '../bot';
import { adminKeyboard } from './auth';
import {
  findAdminByTgId, createEmployee, createAdmin,
  getAllActiveEmployees, deactivateEmployee,
  getAttendanceReport, getAllGroupChats, removeGroupChat,
} from '../db';
import { generateEmployeeCode, generateAdminCode } from '../utils/codeGen';
import { todayDate, formatTime } from '../utils/time';
import { buildExcel, AttendanceRow } from '../utils/excel';
import { sendFullReportToSheets } from '../utils/sheets';
import { InlineKeyboard, InputFile } from 'grammy';

// ─── Xodim qo'shish ───────────────────────────────────────────────────────────

export async function handleAddEmployee(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const admin = await findAdminByTgId(tgId);
  if (!admin) {
    await ctx.reply('⛔ Siz admin emassiz.');
    return;
  }

  const code = generateEmployeeCode();

  try {
    // Create an employee with a placeholder name. The employee will set their own name later.
    const emp = await createEmployee(code, 'Kutmoqda...');
    
    await ctx.reply(
      `✅ <b>Xodim kodi yaratildi!</b>\n\n🔑 Kod: <code>${emp.unique_code}</code>\n\n📩 <i>Bu kodni xodimga yuboring. Xodim botga kirganda ism-familiyasini o'zi kiritadi.</i>`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
  } catch (e: any) {
    console.error('handleAddEmployee error:', e);
    await ctx.reply(`❌ Xato: ${e.message}`, { reply_markup: adminKeyboard() });
  }
}

// ─── Admin qo'shish ───────────────────────────────────────────────────────────

export async function handleAddAdmin(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const admin = await findAdminByTgId(tgId);
  if (!admin) {
    await ctx.reply('⛔ Siz admin emassiz.');
    return;
  }

  const code = generateAdminCode();

  try {
    const adm = await createAdmin(code, 'Kutmoqda...');

    await ctx.reply(
      `✅ <b>Admin kodi yaratildi!</b>\n\n🔑 Kod: <code>${adm.unique_code}</code>\n\n📩 <i>Bu kodni yangi adminga yuboring. U botga kirganda ism-familiyasini o'zi kiritadi.</i>`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
  } catch (e: any) {
    console.error('handleAddAdmin error:', e);
    await ctx.reply(`❌ Xato: ${e.message}`, { reply_markup: adminKeyboard() });
  }
}

// ─── Xodimlar ro'yxati ────────────────────────────────────────────────────────

export async function handleEmployeeList(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const employees = await getAllActiveEmployees();
  if (employees.length === 0) {
    await ctx.reply('📋 Xodimlar yo\'q.', { reply_markup: adminKeyboard() });
    return;
  }

  const lines = employees.map((e, i) =>
    `${i + 1}. <b>${e.full_name}</b>\n   🔑 <code>${e.unique_code}</code>${e.telegram_id ? ' ✅' : ' ⏳'}`
  );
  await ctx.reply(
    `📋 <b>Faol xodimlar (${employees.length} ta):</b>\n\n${lines.join('\n\n')}\n\n✅ = Botga ulangan | ⏳ = Ulanmagan`,
    { parse_mode: 'HTML', reply_markup: adminKeyboard() }
  );
}

// ─── Xodimni o'chirish ────────────────────────────────────────────────────────

export async function handleDeleteEmployee(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const employees = await getAllActiveEmployees();
  if (employees.length === 0) {
    await ctx.reply('📋 O\'chirish uchun xodim yo\'q.', { reply_markup: adminKeyboard() });
    return;
  }

  const kb = new InlineKeyboard();
  for (const e of employees) {
    kb.text(`🗑 ${e.full_name}`, `del_emp:${e.id}`).row();
  }
  kb.text('❌ Bekor qilish', 'del_cancel');

  await ctx.reply('🗑 <b>Qaysi xodimni o\'chirmoqchisiz?</b>', {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

export async function handleDeleteCallback(ctx: MyContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  if (data === 'del_cancel') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('❌ Bekor qilindi.');
    return;
  }

  if (data.startsWith('del_emp:')) {
    const id = data.replace('del_emp:', '');
    await deactivateEmployee(id);
    await ctx.answerCallbackQuery('✅ O\'chirildi');
    await ctx.editMessageText('✅ Xodim o\'chirildi.');
    return;
  }

  // Guruh o'chirish
  if (data.startsWith('del_group:')) {
    const chatId = parseInt(data.replace('del_group:', ''));
    await removeGroupChat(chatId);
    await ctx.answerCallbackQuery('✅ Guruh o\'chirildi');
    await ctx.editMessageText('✅ Guruh ro\'yxatdan o\'chirildi.');
    return;
  }
}

// ─── Guruhlar ro'yxati ────────────────────────────────────────────────────────

export async function handleGroupList(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const groups = await getAllGroupChats();
  if (groups.length === 0) {
    await ctx.reply(
      `📢 <b>Ulangan guruhlar yo'q</b>\n\nBotni guruhga qo'shish uchun:\n1. Guruhingizga boting\n2. Bot nomi orqali qidiring\n3. Guruhga add qiling\n\nBot guruhga qo'shilganda avtomatik ro'yxatdan o'tadi.`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );
    return;
  }

  const kb = new InlineKeyboard();
  for (const g of groups) {
    kb.text(`🗑 ${g.chat_title}`, `del_group:${g.chat_id}`).row();
  }
  kb.text('🔙 Bekor qilish', 'del_cancel');

  const lines = groups.map((g, i) => `${i + 1}. <b>${g.chat_title}</b>\n   📍 ID: <code>${g.chat_id}</code>`);
  await ctx.reply(
    `📢 <b>Ulangan guruhlar (${groups.length} ta):</b>\n\n${lines.join('\n\n')}\n\n<i>O'chirish uchun tugmani bosing:</i>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

// ─── Hisobotlar ───────────────────────────────────────────────────────────────

export async function handleDailyReport(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const date = todayDate();
  await sendReport(ctx, date, date, `Kunlik hisobot — ${date}`);
}

export async function handleMonthlyReport(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const startDate = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  await sendReport(ctx, startDate, endDate, `Oylik hisobot — ${year}/${month}`);
}

async function sendReport(ctx: MyContext, startDate: string, endDate: string, title: string) {
  await ctx.reply('⏳ Hisobot tayyorlanmoqda...');

  try {
    const rows = await getAttendanceReport(startDate, endDate);
    if (rows.length === 0) {
      await ctx.reply('📭 Bu davr uchun ma\'lumot yo\'q.', { reply_markup: adminKeyboard() });
      return;
    }

    const reportRows: AttendanceRow[] = rows.map((r: any) => ({
      full_name: r.kk_employees?.full_name ?? '—',
      date: r.date,
      arrived_at: r.arrived_at,
      status: r.status,
      late_minutes: r.late_minutes ?? 0,
      left_at: r.left_at,
      left_early: r.left_early ?? false,
      early_leave_reason: r.early_leave_reason,
      late_reason: r.late_reason,
      fine_percent: r.fine_percent ?? 0,
    }));

    const buffer = await buildExcel(reportRows, title);
    const filename = `hisobot_${startDate}_${endDate}.xlsx`;

    await ctx.replyWithDocument(
      new InputFile(buffer, filename),
      { caption: `📊 <b>${title}</b>\n📅 ${startDate} → ${endDate}\n👥 Jami: ${rows.length} ta yozuv`, parse_mode: 'HTML', reply_markup: adminKeyboard() }
    );

    // Google Sheets-ga to'liq hisobot yuborish
    const sheetsRecords = reportRows.map(r => ({
      employee_name: r.full_name,
      date: r.date,
      status: r.status,
      arrived_at: r.arrived_at ? formatTime(r.arrived_at) : '',
      left_at: r.left_at ? formatTime(r.left_at) : '',
      late_minutes: r.late_minutes,
      late_reason: r.late_reason || '',
      early_leave_reason: r.early_leave_reason || '',
      fine_percent: r.fine_percent,
    }));
    sendFullReportToSheets(sheetsRecords).catch(e => console.error('Sheets full report error:', e));
  } catch (e: any) {
    await ctx.reply(`❌ Xato: ${e.message}`, { reply_markup: adminKeyboard() });
  }
}

// ─── Google Sheets Havolasi ───────────────────────────────────────────────────

export async function handleGoogleSheetsLink(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId || !(await findAdminByTgId(tgId))) return;

  const sheetUrl = 'https://docs.google.com/spreadsheets/d/1o8MUS_6YlmITjYA4u-I8BOjz4QyJqBO5xY6Uv8H98Y8/edit?usp=sharing';
  
  await ctx.reply(
    `📊 <b>Google Sheets orqali jonli davomatni ko'rish:</b>\n\n<a href="${sheetUrl}">Jadvalni ochish</a>`,
    { parse_mode: 'HTML', reply_markup: adminKeyboard(), link_preview_options: { is_disabled: true } }
  );
}
