// ============================================================
// KELB-KET BOT — Google Apps Script (To'liq ishlaydigan versiya)
// ============================================================

var SPREADSHEET_ID = '1RAowRWq5_U4Ve1sedNbn12PZFdfXYrPUT-UGhYugr80';

function doGet(e) {
  try {
    var ss = getSS();
    var sheets = ss.getSheets();
    var names = sheets.map(function(s) { return s.getName(); });
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'OK', message: 'Kelb-Ket Bot Sheets API ishlayapti!', sheets: names }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ERROR', error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getSS() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var year = val.getFullYear();
    var month = ('0' + (val.getMonth() + 1)).slice(-2);
    var day = ('0' + val.getDate()).slice(-2);
    return year + '-' + month + '-' + day;
  }
  var str = String(val).trim();
  if (str === '') return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  if (str.indexOf('.') !== -1) {
    var parts = str.split('.');
    if (parts.length === 3 && parts[2].length === 4)
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
  }
  if (str.indexOf('/') !== -1) {
    var parts2 = str.split('/');
    if (parts2.length === 3 && parts2[2].length === 4)
      return parts2[2] + '-' + ('0' + parts2[1]).slice(-2) + '-' + ('0' + parts2[0]).slice(-2);
  }
  return str;
}

function getSheetFlexible(ss, name) {
  var sheets = ss.getSheets();
  var target = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sName === target) return sheets[i];
  }
  if (target.indexOf('jurnal') !== -1 || target.indexOf('kunlik') !== -1) {
    for (var j = 0; j < sheets.length; j++) {
      var n = sheets[j].getName().toLowerCase();
      if (n.indexOf('jurnal') !== -1 || n.indexOf('kunlik') !== -1 || n.indexOf('davomat') !== -1) return sheets[j];
    }
  }
  if (target.indexOf('dash') !== -1) {
    for (var k = 0; k < sheets.length; k++) {
      var n2 = sheets[k].getName().toLowerCase();
      if (n2.indexOf('dash') !== -1) return sheets[k];
    }
  }
  if (sheets.length > 0) return sheets[0];
  return null;
}

function getRealLastRow(sheet) {
  var data = sheet.getRange('A1:A2000').getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] && String(data[i][0]).trim() !== '') return i + 1;
  }
  return 0;
}

function getColumnMapping(sheet) {
  var headersRow = -1;
  var headers = [];
  for (var row = 1; row <= 5; row++) {
    var maxCols = Math.max(sheet.getLastColumn() || 7, 7);
    var rowData = sheet.getRange(row, 1, 1, maxCols).getValues()[0];
    var hasContent = rowData.some(function(h) {
      var s = String(h).trim().toLowerCase();
      return s.indexOf('sana') !== -1 || s.indexOf('xodim') !== -1 || s.indexOf('ism') !== -1 ||
             s.indexOf('keldi') !== -1 || s.indexOf('date') !== -1 || s.indexOf('name') !== -1 ||
             s.indexOf('f.i.sh') !== -1;
    });
    if (hasContent) { headersRow = row; headers = rowData; break; }
  }
  var map = { headersRow: headersRow > 0 ? headersRow : 1, dateCol: 1, nameCol: 2, arrivedCol: 3, leftCol: 4, statusCol: 5, noteCol: 6, fineCol: 7 };
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (!h) continue;
    if (h.indexOf('sana') !== -1 || h.indexOf('date') !== -1) map.dateCol = c + 1;
    else if (h.indexOf('xodim') !== -1 || h.indexOf('ism') !== -1 || h.indexOf('f.i.o') !== -1 || h.indexOf('f.i.sh') !== -1 || h.indexOf('name') !== -1) map.nameCol = c + 1;
    else if (h.indexOf('keldi') !== -1 || h.indexOf('kelgan') !== -1 || h.indexOf('arrived') !== -1) map.arrivedCol = c + 1;
    else if (h.indexOf('ketdi') !== -1 || h.indexOf('ketgan') !== -1 || h.indexOf('left') !== -1 || h.indexOf('ketish') !== -1) map.leftCol = c + 1;
    else if (h.indexOf('holat') !== -1 || h.indexOf('status') !== -1) map.statusCol = c + 1;
    else if (h.indexOf('izoh') !== -1 || h.indexOf('sabab') !== -1 || h.indexOf('note') !== -1) map.noteCol = c + 1;
    else if (h.indexOf('ushlanma') !== -1 || h.indexOf('jarima') !== -1 || h.indexOf('fine') !== -1 || h.indexOf('so\'m') !== -1 || h.indexOf('som') !== -1) map.fineCol = c + 1;
  }
  return map;
}

function getStatusInfo(status) {
  var statusMap = {
    'on_time': { text: 'Vaqtida keldi', bg: '#C8E6C9' },
    'late': { text: 'Kechikdi', bg: '#FFCDD2' },
    'late_notified': { text: 'Sababli (kech)', bg: '#FFE0B2' },
    'late_notified_advance': { text: 'Sababli', bg: '#FFE0B2' },
    'absent': { text: 'Kelmadi', bg: '#EF9A9A' },
    'trip': { text: 'Xizmat safari', bg: '#E1BEE7' },
    'trip_approved': { text: 'Xizmat safari', bg: '#E1BEE7' }
  };
  return statusMap[status] || { text: status || "Noma'lum", bg: '#F5F5F5' };
}

function ensureHeaders(sheet) {
  var maxCols = Math.max(sheet.getLastColumn() || 7, 7);
  var firstRow = sheet.getRange(1, 1, 1, maxCols).getValues()[0];
  var hasHeaders = firstRow.some(function(h) { return String(h).trim() !== ''; });
  if (!hasHeaders) {
    var headers = ['Sana', 'Xodim', 'Keldi', 'Ketdi', 'Holat', 'Izoh', 'Ushlanma'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#4285F4').setFontColor('#FFFFFF').setFontWeight('bold');
  }
}

function writeAttendanceRow(sheet, record) {
  ensureHeaders(sheet);
  var cols = getColumnMapping(sheet);
  var dataRange = sheet.getDataRange();
  var allRows = dataRange.getValues();
  var allDisplayRows = dataRange.getDisplayValues();
  var targetRow = -1;
  var incomingName = String(record.employee_name || '').trim().toLowerCase();
  var incomingDate = normalizeDate(record.date);
  var dataStartRow = cols.headersRow + 1;

  for (var i = dataStartRow - 1; i < allRows.length; i++) {
    var rowDate = normalizeDate(allRows[i][cols.dateCol - 1]);
    var rowDateDisp = normalizeDate(allDisplayRows[i] ? allDisplayRows[i][cols.dateCol - 1] : '');
    var rowName = String(allRows[i][cols.nameCol - 1] || '').trim().toLowerCase();
    if (incomingName && rowName === incomingName && (rowDate === incomingDate || rowDateDisp === incomingDate)) {
      targetRow = i + 1;
      break;
    }
  }

  var statusInfo = getStatusInfo(record.status);

  if (targetRow === -1) {
    var lastRow = getRealLastRow(sheet);
    targetRow = Math.max(lastRow + 1, dataStartRow);
    var dateCell = sheet.getRange(targetRow, cols.dateCol);
    dateCell.setNumberFormat('@');
    dateCell.setValue(incomingDate);
    sheet.getRange(targetRow, cols.nameCol).setValue(record.employee_name || '');
  }

  if (record.arrived_at && String(record.arrived_at).trim()) {
    var arrCell = sheet.getRange(targetRow, cols.arrivedCol);
    arrCell.setNumberFormat('@');
    arrCell.setValue(String(record.arrived_at).trim());
  }
  if (record.left_at && String(record.left_at).trim()) {
    var leftCell = sheet.getRange(targetRow, cols.leftCol);
    leftCell.setNumberFormat('@');
    leftCell.setValue(String(record.left_at).trim());
  }

  var statusRange = sheet.getRange(targetRow, cols.statusCol);
  statusRange.setValue(statusInfo.text);
  statusRange.setBackground(statusInfo.bg);

  var notes = [];
  if (record.late_minutes && record.late_minutes > 0) notes.push('Kech: ' + record.late_minutes + ' daq.');
  if (record.late_reason) notes.push(record.late_reason);
  if (record.early_leave_reason) notes.push('Erta ketish: ' + record.early_leave_reason);
  sheet.getRange(targetRow, cols.noteCol).setValue(notes.join(' | '));

  var fineCell = sheet.getRange(targetRow, cols.fineCol);
  if (record.fine_amount && record.fine_amount > 0) fineCell.setValue(record.fine_amount);
  else if (record.status === 'late') fineCell.setValue(30000);
  fineCell.setNumberFormat('#,##0');

  try {
    var ss = sheet.getParent();
    var dashSheet = getSheetFlexible(ss, 'Dashboard');
    if (dashSheet) addEmployeeToDashboard(dashSheet, record.employee_name, sheet.getName());
  } catch (err) {}
}

function addEmployeeToDashboard(dashSheet, employeeName, kjName) {
  if (!employeeName) return;
  var incomingName = String(employeeName).trim().toLowerCase();
  var dashData = dashSheet.getRange('B11:B200').getValues();
  var exists = false;
  var emptyRow = -1;
  for (var d = 0; d < dashData.length; d++) {
    var cName = String(dashData[d][0]).trim().toLowerCase();
    if (cName === incomingName) { exists = true; break; }
    if (cName === '' && emptyRow === -1) emptyRow = d + 11;
  }
  if (!exists && emptyRow > 0) {
    var r = emptyRow;
    var safeKjName = "'" + kjName.replace(/'/g, "''") + "'";
    dashSheet.getRange(r, 1).setFormula('=IF($B'+r+'="";"";ROW()-10)');
    dashSheet.getRange(r, 2).setValue(employeeName);
    dashSheet.getRange(r, 3).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Vaqtida*"));"")');
    dashSheet.getRange(r, 4).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Kechikdi"));"")');
    dashSheet.getRange(r, 5).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Sababli*"));"")');
    dashSheet.getRange(r, 6).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Kelmadi"));"")');
    dashSheet.getRange(r, 7).setFormula('=IFERROR(IF(OR($B'+r+'="";SUM(C'+r+':F'+r+')=0);"";C'+r+'/SUM(C'+r+':F'+r+'));"")');
    dashSheet.getRange(r, 8).setFormula('=IFERROR(IF($B'+r+'="";"";SUMIFS('+safeKjName+'!$G:$G;'+safeKjName+'!$B:$B;$B'+r+'));"")');
    dashSheet.getRange(r, 7).setNumberFormat('0%');
    dashSheet.getRange(r, 8).setNumberFormat('#,##0" so\'m"');
  }
}

function fixDashboardFormulas() {
  var ss = getSS();
  var dashSheet = getSheetFlexible(ss, 'Dashboard');
  var kjSheet = getSheetFlexible(ss, 'Kunlik_jurnal');
  if (!dashSheet || !kjSheet) return 'Dashboard yoki Kunlik_jurnal topilmadi';
  var kjName = kjSheet.getName();
  var safeKjName = "'" + kjName.replace(/'/g, "''") + "'";

  for (var r = 11; r <= 200; r++) {
    dashSheet.getRange(r, 1).setFormula('=IF($B'+r+'="";"";ROW()-10)');
    dashSheet.getRange(r, 3).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Vaqtida*"));"")');
    dashSheet.getRange(r, 4).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Kechikdi"));"")');
    dashSheet.getRange(r, 5).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Sababli*"));"")');
    dashSheet.getRange(r, 6).setFormula('=IFERROR(IF($B'+r+'="";"";COUNTIFS('+safeKjName+'!$B:$B;$B'+r+';'+safeKjName+'!$F:$F;"Kelmadi"));"")');
    dashSheet.getRange(r, 7).setFormula('=IFERROR(IF(OR($B'+r+'="";SUM(C'+r+':F'+r+')=0);"";C'+r+'/SUM(C'+r+':F'+r+'));"")');
    dashSheet.getRange(r, 8).setFormula('=IFERROR(IF($B'+r+'="";"";SUMIFS('+safeKjName+'!$G:$G;'+safeKjName+'!$B:$B;$B'+r+'));"")');
  }

  dashSheet.getRange('G11:G200').setNumberFormat('0%');
  dashSheet.getRange('H11:H200').setNumberFormat('#,##0" so\'m"');

  try {
    dashSheet.getRange('B7').setFormula('=IFERROR(COUNTA(B11:B200); 0)');
    dashSheet.getRange('C7').setFormula('=IFERROR(SUM(C11:C200)/SUM(C11:F200); 0)'); // wait, SUM(C11:F200) not SUM(C11:F11)
    dashSheet.getRange('C7').setNumberFormat('0%');
    dashSheet.getRange('E7').setFormula('=IFERROR(SUM(D11:D200); 0)');
    dashSheet.getRange('E7').setNumberFormat('#,##0');
    dashSheet.getRange('G7').setFormula('=IFERROR(SUM(H11:H200); 0)');
    dashSheet.getRange('G7').setNumberFormat('#,##0" so\'m"');
  } catch (e7) {}

  if (kjSheet.getLastRow() > 0) kjSheet.getRange('G2:G2000').setNumberFormat('#,##0" so\'m"');
  return 'Dashboard formulalari to\'g\'rilandi';
}

function doPost(e) {
  try {
    var output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    if (!e || !e.postData || !e.postData.contents) {
      output.setContent(JSON.stringify({ ok: false, error: "Bo'sh so'rov" }));
      return output;
    }
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      output.setContent(JSON.stringify({ ok: false, error: 'JSON parse xatosi: ' + parseErr.toString() }));
      return output;
    }
    var ss = getSS();

    if (data.action === 'fix_dashboard') {
      output.setContent(JSON.stringify({ ok: true, message: fixDashboardFormulas() }));
      return output;
    }

    if (data.action === 'sync_attendance') {
      var sheet = getSheetFlexible(ss, 'Kunlik_jurnal');
      if (!sheet) { var sh = ss.getSheets(); sheet = sh.length > 0 ? sh[0] : null; }
      if (!sheet) { output.setContent(JSON.stringify({ ok: false, error: 'Varaq topilmadi' })); return output; }
      writeAttendanceRow(sheet, data);
      output.setContent(JSON.stringify({ ok: true, message: 'Saqlandi: ' + (data.employee_name || '') }));
      return output;
    }

    if (data.action === 'full_report') {
      var sheet2 = getSheetFlexible(ss, 'Kunlik_jurnal');
      if (!sheet2) { var sh2 = ss.getSheets(); sheet2 = sh2.length > 0 ? sh2[0] : null; }
      if (!sheet2) { output.setContent(JSON.stringify({ ok: false, error: 'Varaq topilmadi' })); return output; }
      var records = data.records || [];
      var count = 0;
      for (var k = 0; k < records.length; k++) {
        try { writeAttendanceRow(sheet2, records[k]); count++; } catch (rowErr) { Logger.log('Qator xatosi: ' + rowErr); }
      }
      output.setContent(JSON.stringify({ ok: true, message: count + ' ta yozuv saqlandi' }));
      return output;
    }

    if (data.action === 'sync_employee') {
      var sheet3 = getSheetFlexible(ss, 'Kunlik_jurnal');
      if (!sheet3) { var sh3 = ss.getSheets(); sheet3 = sh3.length > 0 ? sh3[0] : null; }
      if (!sheet3) { output.setContent(JSON.stringify({ ok: false, error: 'Varaq topilmadi' })); return output; }
      ensureHeaders(sheet3);
      var cols3 = getColumnMapping(sheet3);
      var dataStartRow3 = cols3.headersRow + 1;
      var lastRow3 = getRealLastRow(sheet3);
      var newRow = Math.max(lastRow3 + 1, dataStartRow3);
      var todayStr = normalizeDate(new Date());
      sheet3.getRange(newRow, cols3.dateCol).setNumberFormat('@').setValue(todayStr);
      sheet3.getRange(newRow, cols3.nameCol).setValue(data.employee_name || '');
      var sr3 = sheet3.getRange(newRow, cols3.statusCol);
      sr3.setValue('Yangi xodim');
      sr3.setBackground('#E0E0E0');
      try {
        var ds3 = getSheetFlexible(ss, 'Dashboard');
        if (ds3) addEmployeeToDashboard(ds3, data.employee_name, sheet3.getName());
      } catch (e3) {}
      output.setContent(JSON.stringify({ ok: true, message: "Xodim qo'shildi: " + (data.employee_name || '') }));
      return output;
    }

    output.setContent(JSON.stringify({ ok: false, error: "Noma'lum action: " + (data.action || 'yo\'q') }));
    return output;
  } catch (error) {
    var errOutput = ContentService.createTextOutput();
    errOutput.setMimeType(ContentService.MimeType.JSON);
    errOutput.setContent(JSON.stringify({ ok: false, error: 'Server xatosi: ' + error.toString() }));
    return errOutput;
  }
}

function testSync() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'sync_attendance',
        employee_name: 'Test Xodim',
        date: Utilities.formatDate(new Date(), 'Asia/Tashkent', 'yyyy-MM-dd'),
        status: 'on_time',
        arrived_at: '09:00',
        left_at: '',
        late_minutes: 0,
        late_reason: '',
        early_leave_reason: '',
        fine_amount: 0
      })
    }
  };
  var result = doPost(mockEvent);
  Logger.log('Test natijasi: ' + result.getContent());
}

function runFixDashboard() {
  Logger.log(fixDashboardFormulas());
}
