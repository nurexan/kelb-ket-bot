-- Ushbu SQL kodni Supabase Dashboard -> SQL Editor da bajaring
-- Bu kod botga RLS yoniq bo'lsa ham, barcha jadvallarga yozish va o'qish huquqini beradi.
-- Bu kod anon (publishable) kalit orqali ma'lumot kiritishdagi 42501 xatosini to'g'irlaydi.

-- 1. kk_employees
CREATE POLICY "Allow anon all on employees" ON public.kk_employees FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. kk_admins
CREATE POLICY "Allow anon all on admins" ON public.kk_admins FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. kk_attendance
CREATE POLICY "Allow anon all on attendance" ON public.kk_attendance FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. kk_group_chats
CREATE POLICY "Allow anon all on group_chats" ON public.kk_group_chats FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. kk_trip_requests
CREATE POLICY "Allow anon all on trip_requests" ON public.kk_trip_requests FOR ALL TO anon USING (true) WITH CHECK (true);
