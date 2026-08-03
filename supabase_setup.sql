-- ============================================================
-- KELB-KET BOT — SUPABASE TO'LIQ SOZLASH
-- 
-- Bu SQL ni Supabase Dashboard -> SQL Editor da bajaring!
-- 1. https://supabase.com/dashboard ga kiring
-- 2. Loyihangizni tanlang (tosgrsdjbgoyedlcedfx)
-- 3. Chap panelda "SQL Editor" ni bosing
-- 4. Quyidagi SQL ni nusxalab, joylang va "Run" bosing
-- ============================================================

-- 1. Asosiy jadvallar (agar yo'q bo'lsa yaratish)
CREATE TABLE IF NOT EXISTS public.kk_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unique_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  telegram_id BIGINT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kk_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unique_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  telegram_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kk_attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.kk_employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  arrived_at TIMESTAMPTZ,
  status TEXT DEFAULT 'absent',
  late_minutes INT DEFAULT 0,
  left_at TIMESTAMPTZ,
  left_early BOOLEAN DEFAULT false,
  early_leave_reason TEXT,
  late_reason TEXT,
  fine_percent NUMERIC DEFAULT 0,
  fine_amount NUMERIC DEFAULT 0,
  expected_leave_at TIMESTAMPTZ,
  leave_reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS public.kk_group_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT UNIQUE NOT NULL,
  chat_title TEXT NOT NULL,
  added_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kk_trip_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.kk_employees(id) ON DELETE CASCADE,
  request_date DATE NOT NULL,
  target_date DATE NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Qo'shimcha ustunlar (agar hali yo'q bo'lsa)
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS fine_amount NUMERIC DEFAULT 0;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS expected_leave_at TIMESTAMPTZ;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS leave_reminder_sent BOOLEAN DEFAULT false;

-- 3. RLS O'CHIRISH — Bot server-side ishlaydi, RLS kerak emas
ALTER TABLE public.kk_admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_group_chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_trip_requests DISABLE ROW LEVEL SECURITY;

-- 4. Super admin qo'shish
INSERT INTO public.kk_admins (unique_code, full_name, telegram_id)
VALUES ('ADM-NUREXAN', 'Nurexan', 7832781255)
ON CONFLICT (unique_code) DO UPDATE SET telegram_id = 7832781255;

-- 5. Schema cache yangilash
NOTIFY pgrst, 'reload schema';

-- Tayyor! Endi botni ishga tushirishingiz mumkin ✅
