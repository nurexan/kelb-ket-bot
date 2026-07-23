-- 1. kk_employees jadvali
CREATE TABLE IF NOT EXISTS public.kk_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unique_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  telegram_id BIGINT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. kk_admins jadvali
CREATE TABLE IF NOT EXISTS public.kk_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unique_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  telegram_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. kk_attendance jadvali
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- 4. kk_group_chats jadvali (YANGI)
CREATE TABLE IF NOT EXISTS public.kk_group_chats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT UNIQUE NOT NULL,
  chat_title TEXT NOT NULL,
  added_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Birinchi admin: nurexan
INSERT INTO public.kk_admins (unique_code, full_name, telegram_id)
VALUES ('ADM-NUREXAN', 'Nurexan', 7832781255)
ON CONFLICT (unique_code) DO NOTHING;

-- 6. Qo'shimcha ustunlar (agar bazada bo'lmasa qo'shish uchun)
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS fine_amount NUMERIC DEFAULT 0;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS expected_leave_at TIMESTAMPTZ;
ALTER TABLE public.kk_attendance ADD COLUMN IF NOT EXISTS leave_reminder_sent BOOLEAN DEFAULT false;

