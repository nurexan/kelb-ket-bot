import { supabase } from './supabase';

export async function initDatabase(): Promise<void> {
  console.log("🗄️  Ma'lumotlar bazasi tekshirilmoqda...");

  // Jadvallarni tekshirish — har birini select bilan test qilamiz
  const tables = ['kk_admins', 'kk_employees', 'kk_attendance', 'kk_group_chats', 'kk_trip_requests'];
  
  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`⚠️  ${table} jadvali topilmadi yoki xato: ${error.message} (${error.code})`);
      console.log(`   ➡️  schema.sql faylini Supabase SQL Editor'da ishga tushiring!`);
    } else {
      console.log(`✅ ${table} — tayyor`);
    }
  }

  // Super admin (nurexan) mavjudligini tekshirish va kerak bo'lsa qo'shish
  try {
    const { data: admins } = await supabase
      .from('kk_admins')
      .select('*')
      .eq('telegram_id', 7832781255);
    
    if (!admins || admins.length === 0) {
      // Admin yo'q — yaratish
      const { error: insertErr } = await supabase
        .from('kk_admins')
        .upsert({
          unique_code: 'ADM-NUREXAN',
          full_name: 'Nurexan',
          telegram_id: 7832781255
        }, { onConflict: 'unique_code' });
      
      if (insertErr) {
         console.error('⚠️  Super admin yaratishda xato:', insertErr.message);
      } else {
        console.log('✅ Super admin (Nurexan) bazaga qo\'shildi');
      }
    } else {
      console.log('✅ Super admin (Nurexan) allaqachon mavjud');
    }
  } catch (err) {
    console.error('⚠️  Admin tekshirishda xato:', err);
  }

  // fine_amount, expected_leave_at, leave_reminder_sent ustunlarini tekshirish
  // Bu ustunlar bazada yo'q bo'lsa, SQL Editor orqali qo'shish kerak
  try {
    const { data, error } = await supabase
      .from('kk_attendance')
      .select('fine_amount, expected_leave_at, leave_reminder_sent')
      .limit(1);
    
    if (error && (error.message?.includes('fine_amount') || error.message?.includes('expected_leave_at') || error.message?.includes('leave_reminder_sent'))) {
      console.log('⚠️  kk_attendance jadvalida qo\'shimcha ustunlar yo\'q. Qo\'shish uchun schema.sql ni SQL Editor\'da bajaring.');
    }
  } catch { /* silent */ }

  console.log('🗄️  Baza tekshiruvi yakunlandi.');
}
