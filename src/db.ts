import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  unique_code: string;
  full_name: string;
  telegram_id: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Admin {
  id: string;
  unique_code: string;
  full_name: string;
  telegram_id: number | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  arrived_at: string | null;
  status: 'on_time' | 'late' | 'absent' | 'late_notified';
  late_minutes: number;
  left_at: string | null;
  left_early: boolean;
  early_leave_reason: string | null;
  late_reason: string | null;
  fine_percent: number;
}

export interface GroupChat {
  id: string;
  chat_id: number;
  chat_title: string;
  added_by: number;
  created_at: string;
}

// ─── Employee ────────────────────────────────────────────────────────────────

export async function findEmployeeByCode(code: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('kk_employees')
    .select('*')
    .eq('unique_code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single();
  if (error && error.code !== 'PGRST116') console.error('findEmployeeByCode error:', error);
  return data ?? null;
}

export async function findEmployeeByTgId(tgId: number): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('kk_employees')
    .select('*')
    .eq('telegram_id', tgId)
    .eq('is_active', true)
    .single();
  if (error && error.code !== 'PGRST116') console.error('findEmployeeByTgId error:', error);
  return data ?? null;
}

export async function bindEmployeeTgId(employeeId: string, tgId: number): Promise<void> {
  const { error } = await supabase
    .from('kk_employees')
    .update({ telegram_id: tgId })
    .eq('id', employeeId);
  if (error) throw error;
}

export async function bindEmployeeTgIdAndName(employeeId: string, tgId: number, fullName: string): Promise<void> {
  const { error } = await supabase
    .from('kk_employees')
    .update({ telegram_id: tgId, full_name: fullName.trim() })
    .eq('id', employeeId);
  if (error) throw error;
}

export async function createEmployee(code: string, fullName: string): Promise<Employee> {
  const upperCode = code.toUpperCase().trim();
  const { data, error } = await supabase
    .from('kk_employees')
    .insert({ unique_code: upperCode, full_name: fullName.trim(), is_active: true })
    .select()
    .single();
  if (error) {
    console.error('createEmployee error:', JSON.stringify(error));
    if (error.code === '23505') throw new Error('Bu kod allaqachon mavjud. Boshqa kod bilan qayta urinib ko\'ring.');
    throw new Error(error.message || 'Ma\'lumotlar bazasida xatolik');
  }
  return data;
}

export async function getAllActiveEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('kk_employees')
    .select('*')
    .eq('is_active', true)
    .order('full_name');
  if (error) console.error('getAllActiveEmployees error:', error);
  return data ?? [];
}

export async function deactivateEmployee(id: string): Promise<void> {
  await supabase.from('kk_employees').update({ is_active: false }).eq('id', id);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function findAdminByCode(code: string): Promise<Admin | null> {
  const { data, error } = await supabase
    .from('kk_admins')
    .select('*')
    .eq('unique_code', code.toUpperCase().trim())
    .single();
  if (error && error.code !== 'PGRST116') console.error('findAdminByCode error:', error);
  return data ?? null;
}

export async function findAdminByTgId(tgId: number): Promise<Admin | null> {
  const { data, error } = await supabase
    .from('kk_admins')
    .select('*')
    .eq('telegram_id', tgId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('findAdminByTgId error:', error);
  return data ?? null;
}

export async function bindAdminTgId(adminId: string, tgId: number): Promise<void> {
  const { error } = await supabase.from('kk_admins').update({ telegram_id: tgId }).eq('id', adminId);
  if (error) throw error;
}

export async function bindAdminTgIdAndName(adminId: string, tgId: number, fullName: string): Promise<void> {
  const { error } = await supabase.from('kk_admins').update({ telegram_id: tgId, full_name: fullName.trim() }).eq('id', adminId);
  if (error) throw error;
}

export async function createAdmin(code: string, fullName: string): Promise<Admin> {
  const upperCode = code.toUpperCase().trim();
  const { data, error } = await supabase
    .from('kk_admins')
    .insert({ unique_code: upperCode, full_name: fullName.trim() })
    .select()
    .single();
  if (error) {
    console.error('createAdmin error:', JSON.stringify(error));
    if (error.code === '23505') throw new Error('Bu kod allaqachon mavjud.');
    throw new Error(error.message || 'Ma\'lumotlar bazasida xatolik');
  }
  return data;
}

export async function getAllAdmins(): Promise<Admin[]> {
  const { data } = await supabase.from('kk_admins').select('*').order('full_name');
  return data ?? [];
}

export async function getAllAdminTgIds(): Promise<number[]> {
  const admins = await getAllAdmins();
  return admins.filter(a => a.telegram_id !== null).map(a => a.telegram_id as number);
}

// ─── Group Chats ─────────────────────────────────────────────────────────────

export async function saveGroupChat(chatId: number, chatTitle: string, addedBy: number): Promise<void> {
  const { error } = await supabase
    .from('kk_group_chats')
    .upsert(
      { chat_id: chatId, chat_title: chatTitle, added_by: addedBy },
      { onConflict: 'chat_id' }
    );
  if (error) console.error('saveGroupChat error:', error);
}

export async function removeGroupChat(chatId: number): Promise<void> {
  await supabase.from('kk_group_chats').delete().eq('chat_id', chatId);
}

export async function getAllGroupChats(): Promise<GroupChat[]> {
  const { data } = await supabase.from('kk_group_chats').select('*');
  return data ?? [];
}

export async function getAllGroupChatIds(): Promise<number[]> {
  const chats = await getAllGroupChats();
  return chats.map(c => c.chat_id);
}

// ─── Attendance ──────────────────────────────────────────────────────────────

export async function getTodayAttendance(employeeId: string, date: string): Promise<Attendance | null> {
  const { data, error } = await supabase
    .from('kk_attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .single();
  if (error && error.code !== 'PGRST116') console.error('getTodayAttendance error:', error);
  return data ?? null;
}

export async function upsertAttendance(employeeId: string, date: string, updates: Partial<Attendance>): Promise<void> {
  const { error } = await supabase
    .from('kk_attendance')
    .upsert({ employee_id: employeeId, date, ...updates }, { onConflict: 'employee_id,date' });
  if (error) {
    console.error('upsertAttendance error:', JSON.stringify(error));
    throw error;
  }
}

export async function autoCheckoutAll(date: string, leftAt: string): Promise<Employee[]> {
  // Hali ketmagan xodimlarni topish
  const { data: empIds } = await supabase
    .from('kk_attendance')
    .select('employee_id')
    .eq('date', date)
    .not('arrived_at', 'is', null)
    .is('left_at', null);

  if (!empIds || empIds.length === 0) return [];

  // Ularni "ketdi" deb belgilash
  await supabase
    .from('kk_attendance')
    .update({ left_at: leftAt, left_early: false })
    .eq('date', date)
    .not('arrived_at', 'is', null)
    .is('left_at', null);

  // Xodim ma'lumotlarini olish (xabar yuborish uchun)
  const ids = empIds.map((r: any) => r.employee_id);
  const { data: employees } = await supabase
    .from('kk_employees')
    .select('*')
    .in('id', ids)
    .not('telegram_id', 'is', null);

  return employees ?? [];
}

export async function getAttendanceReport(startDate: string, endDate: string): Promise<any[]> {
  // 1. Barcha faol xodimlarni olish
  const { data: employees } = await supabase
    .from('kk_employees')
    .select('*')
    .eq('is_active', true)
    .order('full_name');

  if (!employees || employees.length === 0) return [];

  // 2. Mavjud davomat yozuvlarini olish
  const { data: attendance } = await supabase
    .from('kk_attendance')
    .select(`*, kk_employees(full_name)`)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('employee_id');

  const attendanceMap = new Map<string, any>();
  for (const rec of (attendance ?? [])) {
    attendanceMap.set(`${rec.employee_id}_${rec.date}`, rec);
  }

  // 3. Sana diapazoni generatsiyasi
  const dates: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  // 4. Barcha xodim + sana kombinatsiyasini yaratish
  const result: any[] = [];
  for (const emp of employees) {
    for (const date of dates) {
      const key = `${emp.id}_${date}`;
      const existing = attendanceMap.get(key);
      if (existing) {
        result.push(existing);
      } else {
        // Yozuv yo'q = kelmadi
        result.push({
          id: null,
          employee_id: emp.id,
          date,
          arrived_at: null,
          status: 'absent',
          late_minutes: 0,
          left_at: null,
          left_early: false,
          early_leave_reason: null,
          late_reason: null,
          fine_percent: 0,
          kk_employees: { full_name: emp.full_name },
        });
      }
    }
  }

  return result;
}
