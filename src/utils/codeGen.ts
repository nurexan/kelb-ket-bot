/** Admin kodi generatsiyasi: ADM-XXXXXX */
export function generateAdminCode(): string {
  return 'ADM-' + randomSuffix();
}

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
