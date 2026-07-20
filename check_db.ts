import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkTables() {
  console.log("Checking if tables exist...");
  const { data, error } = await supabase.from('kk_admins').select('*').limit(1);
  if (error) {
    console.error("Error/Tables missing:", error.message);
  } else {
    console.log("Tables exist! Data:", data);
  }
}

checkTables();
