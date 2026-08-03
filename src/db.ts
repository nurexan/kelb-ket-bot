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
  status: 'on_time' | 'late' | 'absent' | 'late_notified' | 'late_notified_advance' | 'trip' | 'trip_approved';
  late_minutes: number;
  left_at: string | null;
  left_early: boolean;
  early_leave_reason: string | null;
  late_reason: string | null;
  fine_percent: number;
  fine_amount: number;
  expected_leave_at: string | null;
  leave_reminder_sent: boolean;
}

export interface TripRequest {
  id: string;
  employee_id: string;
  request_date: string;
  target_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface GroupChat {
  id: string;
  chat_id: number;
  chat_title: string;
  added_by: number;
  created_at: string;
}

// ─── Employee ────────────────────────────────────────────────────────────────



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


export async function bindEmployeeTgIdAndName(employeeId: string, tgId: number, fullName: string): Promise<void> {
  // Eski xodimlarning tgId sini tozalaymiz
  await supabase.from('kk_employees').update({ telegram_id: null }).eq('telegram_id', tgId);

  const { error } = await supabase
    .from('kk_employees')
    .update({ telegram_id: tgId, full_name: fullName.trim() })
    .eq('id', employeeId);
  if (error) throw error;
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

export async function findEmployeeById(id: string): Promise<Employee | null> {
  const { data } = await supabase.from('kk_employees').select('*').eq('id', id).single();
  return data ?? null;
}

export async function deactivateEmployee(id: string): Promise<void> {
  await supabase.from('kk_employees').update({ is_active: false, telegram_id: null }).eq('id', id);
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
  if (tgId === 7832781255) {
    return {
      id: 'super-admin-nurexan',
      unique_code: 'ADM-NUREXAN',
      full_name: 'Nurexan',
      telegram_id: 7832781255,
      created_at: new Date().toISOString()
    };
  }

  try {
    const { data, error } = await supabase
      .from('kk_admins')
      .select('*')
      .eq('telegram_id', tgId)
      .single();
    if (error && error.code !== 'PGRST116') console.error('findAdminByTgId error:', error);
    if (data) return data;
  } catch (err) {}

  return null;
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
    throw new Error(error.message || 'Baza xatosi');
  }
  return data;
}

export async function getAllAdmins(): Promise<Admin[]> {
  try {
    const { data } = await supabase.from('kk_admins').select('*').order('full_name');
    const list = data ?? [];
    if (!list.some(a => a.telegram_id === 7832781255)) {
      list.push({
        id: 'super-admin-nurexan',
        unique_code: 'ADM-NUREXAN',
        full_name: 'Nurexan',
        telegram_id: 7832781255,
        created_at: new Date().toISOString()
      });
    }
    return list;
  } catch {
    return [{
      id: 'super-admin-nurexan',
      unique_code: 'ADM-NUREXAN',
      full_name: 'Nurexan',
      telegram_id: 7832781255,
      created_at: new Date().toISOString()
    }];
  }
}

export async function getAllAdminTgIds(): Promise<number[]> {
  const admins = await getAllAdmins();
  const ids = admins.filter(a => a.telegram_id !== null).map(a => a.telegram_id as number);
  if (!ids.includes(7832781255)) ids.push(7832781255);
  return ids;
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
    if (error.code === '42501' || error.message?.includes('row-level security')) {
      console.error('❌ RLS XATO: Supabase Dashboard -> SQL Editor da RLS o\'chiring yoki service_role key ishlating!');
      console.error('   SQL: ALTER TABLE public.kk_attendance DISABLE ROW LEVEL SECURITY;');
    }
    if (error.message?.includes('fine_amount') || error.details?.includes('fine_amount') || error.code === 'PGRST204') {
      console.warn('⚠️ fine_amount ustuni bazada topilmadi. Usiz saqlashga qayta urinilmoqda...');
      const fallbackUpdates = { ...updates };
      delete fallbackUpdates.fine_amount;
      const { error: err2 } = await supabase
        .from('kk_attendance')
        .upsert({ employee_id: employeeId, date, ...fallbackUpdates }, { onConflict: 'employee_id,date' });
      if (err2) {
        console.error('upsertAttendance fallback error:', JSON.stringify(err2));
      }
      return;
    }
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
    .in('employee_id', empIds.map(e => e.employee_id));

  // O'sha xodimlar ro'yxatini qaytarish (ism-familiyasi kerak)
  const { data: employees } = await supabase
    .from('kk_employees')
    .select('*')
    .in('id', empIds.map(e => e.employee_id));

  return employees ?? [];
}

export async function getPendingLeaveReminders(date: string, currentTime: string): Promise<Attendance[]> {
  try {
    const { data, error } = await supabase
      .from('kk_attendance')
      .select('*')
      .eq('date', date)
      .is('left_at', null)
      .not('arrived_at', 'is', null)
      .eq('leave_reminder_sent', false)
      .lte('expected_leave_at', currentTime);
    
    if (error) {
      if (error.code !== '42703' && !error.message?.includes('leave_reminder_sent')) {
        console.error('getPendingLeaveReminders error:', error);
      }
      return [];
    }
    return data ?? [];
  } catch (err) {
    return [];
  }
}

export async function markLeaveReminderSent(attendanceId: string): Promise<void> {
  try {
    const { error } = await supabase.from('kk_attendance').update({ leave_reminder_sent: true }).eq('id', attendanceId);
    if (error && error.code !== '42703' && !error.message?.includes('leave_reminder_sent')) {
      console.error('markLeaveReminderSent error:', error);
    }
  } catch (e) {}
}

export async function updateExpectedLeaveTime(attendanceId: string, time: string): Promise<void> {
  try {
    const { error } = await supabase.from('kk_attendance').update({ expected_leave_at: time, leave_reminder_sent: false }).eq('id', attendanceId);
    if (error && (error.code === '42703' || error.message?.includes('leave_reminder_sent'))) {
      await supabase.from('kk_attendance').update({ expected_leave_at: time }).eq('id', attendanceId);
    }
  } catch (e) {}
}

export async function getLateCountForMonth(employeeId: string, year: number, month: number, includeAdvanceNotified: boolean): Promise<number> {
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let query = supabase
    .from('kk_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate);

  if (includeAdvanceNotified) {
    query = query.eq('status', 'late_notified_advance');
  } else {
    // Normal lates (notified same day or unnotified)
    query = query.in('status', ['late', 'late_notified']);
  }

  const { count } = await query;
  return count ?? 0;
}

// ─── Trips (Bozorga borish) ──────────────────────────────────────────────────

export async function requestTrip(employeeId: string, targetDate: string, reason: string): Promise<TripRequest> {
  const { data, error } = await supabase
    .from('kk_trip_requests')
    .insert({
      employee_id: employeeId,
      request_date: new Date().toISOString().split('T')[0],
      target_date: targetDate,
      reason,
      status: 'pending'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingTrip(tripId: string): Promise<TripRequest | null> {
  const { data } = await supabase.from('kk_trip_requests').select('*').eq('id', tripId).single();
  return data ?? null;
}

export async function approveTrip(tripId: string, employeeId: string, targetDate: string): Promise<void> {
  await supabase.from('kk_trip_requests').update({ status: 'approved' }).eq('id', tripId);
  // Bo'lajak kunga 'trip_approved' statusi bilan qator qo'shamiz
  await upsertAttendance(employeeId, targetDate, { status: 'trip_approved' });
}

export async function rejectTrip(tripId: string): Promise<void> {
  await supabase.from('kk_trip_requests').update({ status: 'rejected' }).eq('id', tripId);
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

export async function createEmployeeFromRequest(tgId: number): Promise<Employee> {
  // Clear any existing employee with this tgId to avoid unique key violation
  const { error: clearErr } = await supabase.from('kk_employees').update({ telegram_id: null }).eq('telegram_id', tgId);
  if (clearErr && clearErr.code === '42501') {
    console.error('❌ RLS XATO: kk_employees jadvalida yozish mumkin emas!');
    console.error('   Supabase Dashboard -> SQL Editor da bajaring:');
    console.error('   ALTER TABLE public.kk_employees DISABLE ROW LEVEL SECURITY;');
    throw new Error('Baza xavfsizlik siyosati (RLS) yozishga ruxsat bermayapti. Admin Supabase Dashboard\'da RLS o\'chirishi kerak.');
  }

  // Generate unique code: EMP- + random 6 digits
  const code = 'EMP-' + Math.floor(100000 + Math.random() * 900000);
  
  // Check if an inactive or existing employee with this tgId already exists
  const { data: existing } = await supabase
    .from('kk_employees')
    .select('*')
    .eq('telegram_id', tgId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('kk_employees')
      .update({
        is_active: true,
        full_name: 'Ism kiritilmoqda',
        unique_code: code
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) {
      if (error.code === '42501') throw new Error('RLS xato: Supabase Dashboard -> SQL Editor da RLS o\'chiring!');
      throw error;
    }
    return data;
  }

  const { data, error } = await supabase
    .from('kk_employees')
    .insert({
      unique_code: code,
      full_name: 'Ism kiritilmoqda',
      telegram_id: tgId,
      is_active: true
    })
    .select()
    .single();
  if (error) {
    if (error.code === '42501') throw new Error('RLS xato: Supabase Dashboard -> SQL Editor da RLS o\'chiring!');
    throw error;
  }
  return data;
}
