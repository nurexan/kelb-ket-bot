import { Bot, Context, session, SessionFlavor } from 'grammy';
import 'dotenv/config';

// ─── Session ─────────────────────────────────────────────────────────────────

export type BotState =
  | 'idle'
  | 'entering_code'
  | 'entering_late_reason'
  | 'entering_early_leave_reason'
  | 'admin_entering_employee_name'
  | 'admin_entering_admin_name'
  | 'admin_del_waiting'
  | 'employee_entering_name'
  | 'admin_self_entering_name'
  | 'entering_trip_reason'
  | 'entering_advance_late_reason'
  | 'entering_extend_time';

export interface SessionData {
  state: BotState;
  tempCode?: string;
  tempDeleteId?: string;
  tempEmpId?: string;
  tempAdminId?: string;
  tempAttendanceId?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;

function initial(): SessionData {
  return { state: 'idle' };
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
bot.use(session({ initial }));

bot.catch((err) => {
  console.error(`❌ Bot error while handling update ${err.ctx.update.update_id}:`, err.error);
});
