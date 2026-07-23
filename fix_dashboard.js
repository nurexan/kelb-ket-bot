const dotenv = require('dotenv');
dotenv.config();

const url = process.env.SHEETS_WEBHOOK_URL;
if (!url) {
  console.error("No SHEETS_WEBHOOK_URL found in .env");
  process.exit(1);
}

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'fix_dashboard' })
})
.then(res => res.text())
.then(text => {
  console.log("Response:", text);
})
.catch(err => {
  console.error("Error:", err);
});
