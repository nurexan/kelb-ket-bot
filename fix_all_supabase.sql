-- ==========================================
-- SUPABASE BAZASINI TO'LIQ TO'G'IRLASH KODI
-- Ushbu kodni Supabase SQL Editor'ga tashlab RUN qiling
-- ==========================================

-- 1. Barcha jadvallarni (agar yo'q bo'lsa) yaratamiz
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

-- 2. Eski jadvallarga yangi ustunlar qo'shish (agar yo'q bo'lsa)
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS fine_amount NUMERIC DEFAULT 0;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS expected_leave_at TIMESTAMPTZ;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS leave_reminder_sent BOOLEAN DEFAULT false;

-- 3. Asosiy adminni qo'shish (Xato bermasligi uchun DO NOTHING)
INSERT INTO public.kk_admins (unique_code, full_name, telegram_id)
VALUES ('ADM-NUREXAN', 'Nurexan', 7832781255)
ON CONFLICT (unique_code) DO NOTHING;

-- 4. Barcha jadvallarda RLS yoniq holatda ishlashi uchun barcha ruxsatlarni beramiz (42501 xatosi uchun)
-- Eski policylarni tozalash (xato bermasligi uchun)
DROP POLICY IF EXISTS "Allow anon all on employees" ON public.kk_employees;
DROP POLICY IF EXISTS "Allow anon all on admins" ON public.kk_admins;
DROP POLICY IF EXISTS "Allow anon all on attendance" ON public.kk_attendance;
DROP POLICY IF EXISTS "Allow anon all on group_chats" ON public.kk_group_chats;
DROP POLICY IF EXISTS "Allow anon all on trip_requests" ON public.kk_trip_requests;

-- Yangi policylar yaratish
CREATE POLICY "Allow anon all on employees" ON public.kk_employees FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on admins" ON public.kk_admins FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on attendance" ON public.kk_attendance FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on group_chats" ON public.kk_group_chats FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on trip_requests" ON public.kk_trip_requests FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Jadvallarni RLS ni yoqish (policylar ishlashi uchun)
ALTER TABLE public.kk_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kk_trip_requests ENABLE ROW LEVEL SECURITY;

-- 6. Bazani yangilash
NOTIFY pgrst, 'reload schema';
