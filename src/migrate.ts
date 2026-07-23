import { supabase } from './supabase';

export async function initDatabase(): Promise<void> {
  console.log("🗄️  Ma'lumotlar bazasi tekshirilmoqda...");

  // kk_group_chats — guruh uchun yangi jadval
  const { error: groupErr } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS public.kk_group_chats (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        chat_id BIGINT UNIQUE NOT NULL,
        chat_title TEXT NOT NULL,
        added_by BIGINT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS fine_amount NUMERIC DEFAULT 0;
      NOTIFY pgrst, 'reload schema';
    `
  });

  if (groupErr) {
    // RPC yo'q bo'lishi mumkin — jadval allaqachon bor yoki qo'lda yaratilgan
    console.log('ℹ️  SQL ishga tushmadi: (Supabase SQL Editor orqali yarating yoki RPC endpointini tekshiring) ' + groupErr.message);
  } else {
    console.log('✅ Jadvallar tayyor!');
  }
}
