function doGet(e) {
  return ContentService.createTextOutput("GET OK");
}

/**
 * Hujjatni olish (Active yoki ID bo'yicha)
 */
function getSS() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}
  var sheetId = '1RAowRWq5_U4Ve1sedNbn12PZFdfXYrPUT-UGhYugr80';
  return SpreadsheetApp.openById(sheetId);
}

/**
 * Sanani har qanday formatdan YYYY-MM-DD ko'rinishiga o'tkazadi
 */
function normalizeDate(val) {
  if (!val) return '';
  
  if (val instanceof Date) {
    var year = val.getFullYear();
    var month = ('0' + (val.getMonth() + 1)).slice(-2);
    var day = ('0' + val.getDate()).slice(-2);
    return year + '-' + month + '-' + day;
  }
  
  var str = String(val).trim();
  if (str.indexOf('T') !== -1) {
    str = str.split('T')[0];
  }
  
  var parts;
  if (str.indexOf('.') !== -1) {
    parts = str.split('.');
    if (parts.length === 3 && parts[2].length === 4) {
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  if (str.indexOf('/') !== -1) {
    parts = str.split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      return parts[2] + '-' + ('0' + parts[1]).slice(-2) + '-' + ('0' + parts[0]).slice(-2);
    }
  }
  
  return str;
}

/**
 * Hujjat ichidan nomiga qarab mos varaqni topish
 */
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
      if (n.indexOf('jurnal') !== -1 || n.indexOf('kunlik') !== -1 || n.indexOf('davomat') !== -1) {
        return sheets[j];
      }
    }
  }
  if (target.indexOf('dash') !== -1 || target.indexOf('boshqaruv') !== -1) {
    for (var k = 0; k < sheets.length; k++) {
      var n2 = sheets[k].getName().toLowerCase();
      if (n2.indexOf('dash') !== -1 || n2.indexOf('boshqaruv') !== -1) {
        return sheets[k];
      }
    }
  }
  return null;
}

function getRealLastRow(sheet) {
  var data = sheet.getRange("A1:A1000").getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] && String(data[i][0]).trim() !== "") {
      return i + 1;
    }
  }
  return 3;
}

/**
 * Ustunlar tartibini sarlavhalarga qarab dinamik aniqlash
 */
function getColumnMapping(sheet) {
  var headersRow = 3; 
  var maxCols = sheet.getLastColumn() || 10;
  var headers = sheet.getRange(headersRow, 1, 1, maxCols).getValues()[0];
  
  var hasHeaders = headers.some(function(h) { return String(h).trim() !== ''; });
  if (!hasHeaders) {
    headersRow = 1;
    headers = sheet.getRange(headersRow, 1, 1, maxCols).getValues()[0];
  }
  
  var map = {
    dateCol: 1,      // Sana
    nameCol: 2,      // Xodim
    arrivedCol: 3,   // Keldi
    leftCol: 4,      // Ketdi
    statusCol: 5,    // Holat
    noteCol: 6,      // Izoh
    fineCol: 7       // Ushlanma/Jarima
  };

  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h.indexOf('sana') !== -1 || h.indexOf('date') !== -1) map.dateCol = c + 1;
    else if (h.indexOf('xodim') !== -1 || h.indexOf('ism') !== -1 || h.indexOf('f.i.o') !== -1 || h.indexOf('name') !== -1) map.nameCol = c + 1;
    else if (h.indexOf('keldi') !== -1 || h.indexOf('kelgan') !== -1 || h.indexOf('kelish') !== -1 || h.indexOf('arrived') !== -1) map.arrivedCol = c + 1;
    else if (h.indexOf('ketdi') !== -1 || h.indexOf('ketgan') !== -1 || h.indexOf('ketish') !== -1 || h.indexOf('left') !== -1) map.leftCol = c + 1;
    else if (h.indexOf('holat') !== -1 || h.indexOf('status') !== -1) map.statusCol = c + 1;
    else if (h.indexOf('izoh') !== -1 || h.indexOf('sabab') !== -1 || h.indexOf('note') !== -1) map.noteCol = c + 1;
    else if (h.indexOf('ushlanma') !== -1 || h.indexOf('jarima') !== -1 || h.indexOf('fine') !== -1) map.fineCol = c + 1;
  }

  return map;
}

function fixDashboardFormulas() {
  var ss = getSS();
  var dashSheet = getSheetFlexible(ss, 'Dashboard');
  var kjSheet = getSheetFlexible(ss, 'Kunlik_jurnal');
  
  if (!dashSheet || !kjSheet) return;
  var kjName = kjSheet.getName();

  for (var r = 11; r <= 100; r++) {
    dashSheet.getRange(r, 3).setFormula('=IF($B' + r + '="", "", COUNTIFS(' + kjName + '!$B:$B, $B' + r + ', ' + kjName + '!$E:$E, "Vaqtida"))');
    dashSheet.getRange(r, 4).setFormula('=IF($B' + r + '="", "", COUNTIFS(' + kjName + '!$B:$B, $B' + r + ', ' + kjName + '!$E:$E, "Kech qoldi"))');
    dashSheet.getRange(r, 5).setFormula('=IF($B' + r + '="", "", COUNTIFS(' + kjName + '!$B:$B, $B' + r + ', ' + kjName + '!$E:$E, "Sababli"))');
    dashSheet.getRange(r, 6).setFormula('=IF($B' + r + '="", "", COUNTIFS(' + kjName + '!$B:$B, $B' + r + ', ' + kjName + '!$E:$E, "Kelmadi"))');
    dashSheet.getRange(r, 7).setFormula('=IF(OR($B' + r + '="", SUM(C' + r + ':F' + r + ')=0), "", C' + r + ' / SUM(C' + r + ':F' + r + '))');
    dashSheet.getRange(r, 8).setFormula('=IF($B' + r + '="", "", SUMIFS(' + kjName + '!$G:$G, ' + kjName + '!$B:$B, $B' + r + '))');
  }
  
  dashSheet.getRange("G11:G100").setNumberFormat("0%");
  dashSheet.getRange("H11:H100").setNumberFormat('#,##0" so\'m"');
  kjSheet.getRange("G4:G1000").setNumberFormat('#,##0" so\'m"');
}

function writeAttendanceRow(sheet, record) {
  var cols = getColumnMapping(sheet);
  var dataRange = sheet.getDataRange();
  var rows = dataRange.getValues();
  var displayRows = dataRange.getDisplayValues();
  
  var targetRow = -1;
  var incomingName = String(record.employee_name).trim().toLowerCase();
  var incomingDate = normalizeDate(record.date);

  for (var i = 1; i < rows.length; i++) {
    var rawDate = rows[i][cols.dateCol - 1];
    var formattedDate = normalizeDate(rawDate);
    var displayDate = displayRows && displayRows[i] ? String(displayRows[i][cols.dateCol - 1]).trim() : '';
    var rowName = String(rows[i][cols.nameCol - 1]).trim().toLowerCase();

    if (rowName === incomingName && (formattedDate === incomingDate || displayDate === incomingDate)) {
      targetRow = i + 1;
      break;
    }
  }

  var statusStr = 'Vaqtida';
  var statusBg = '#C8E6C9'; 
  
  if (record.status === 'late') {
    statusStr = 'Kech qoldi';
    statusBg = '#FFCDD2';
  } else if (record.status === 'absent') {
    statusStr = 'Kelmadi';
    statusBg = '#EF5350';
  } else if (record.status === 'late_notified' || record.status === 'late_notified_advance') {
    statusStr = 'Sababli';
    statusBg = '#FFE0B2';
  } else if (record.status === 'trip' || record.status === 'trip_approved') {
    statusStr = 'Xizmat safari';
    statusBg = '#E1BEE7';
  }

  if (targetRow === -1) {
    targetRow = getRealLastRow(sheet) + 1;
    if (targetRow < 4) targetRow = 4;
    
    var dateCell = sheet.getRange(targetRow, cols.dateCol);
    dateCell.setNumberFormat('@');
    dateCell.setValue(record.date);

    sheet.getRange(targetRow, cols.nameCol).setValue(record.employee_name);
  }

  if (record.arrived_at) {
    var arrCell = sheet.getRange(targetRow, cols.arrivedCol);
    arrCell.setNumberFormat('@');
    arrCell.setValue(record.arrived_at);
  }
  
  if (record.left_at) {
    var leftCell = sheet.getRange(targetRow, cols.leftCol);
    leftCell.setNumberFormat('@');
    leftCell.setValue(record.left_at);
  }

  var statusRange = sheet.getRange(targetRow, cols.statusCol);
  statusRange.setValue(statusStr);
  statusRange.setBackground(statusBg);

  var izoh = [];
  if (record.late_minutes > 0) izoh.push("Kech: " + record.late_minutes + " daq.");
  if (record.late_reason) izoh.push(record.late_reason);
  if (record.early_leave_reason) izoh.push("Erta ketish: " + record.early_leave_reason);
  sheet.getRange(targetRow, cols.noteCol).setValue(izoh.join(" | "));

  if (record.fine_amount) {
    sheet.getRange(targetRow, cols.fineCol).setValue(record.fine_amount);
  } else if (record.status === 'late') {
    sheet.getRange(targetRow, cols.fineCol).setValue(30000);
  }

  // Dashboard'ga xodimni avtomatik qo'shish va formulalarni yangilash
  try {
    var ss = sheet.getParent();
    var dashSheet = getSheetFlexible(ss, 'Dashboard');
    if (dashSheet) {
      var dashData = dashSheet.getRange("B11:B100").getValues();
      var exists = false;
      var emptyRow = -1;
      for (var d = 0; d < dashData.length; d++) {
        var cName = String(dashData[d][0]).trim().toLowerCase();
        if (cName === incomingName) {
          exists = true;
          break;
        }
        if (cName === "" && emptyRow === -1) {
          emptyRow = d + 11;
        }
      }
      if (!exists && emptyRow > 0) {
        dashSheet.getRange(emptyRow, 1).setFormula("=ROW() - 10");
        dashSheet.getRange(emptyRow, 2).setValue(record.employee_name);
      }
    }
    fixDashboardFormulas();
  } catch (err) {}
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = getSS();
    
    if (data.action === 'fix_dashboard') {
      fixDashboardFormulas();
      return ContentService.createTextOutput("Dashboard Fixed");
    }

    if (data.action === 'sync_attendance') {
      var sheet = getSheetFlexible(ss, 'Kunlik_jurnal');
      if (!sheet) return ContentService.createTextOutput("Kunlik_jurnal sheet not found");
      writeAttendanceRow(sheet, data);
      return ContentService.createTextOutput("OK");
    }

    if (data.action === 'full_report') {
      var sheet = getSheetFlexible(ss, 'Kunlik_jurnal');
      if (!sheet) return ContentService.createTextOutput("Kunlik_jurnal sheet not found");
      var records = data.records || [];
      for (var k = 0; k < records.length; k++) {
        writeAttendanceRow(sheet, records[k]);
      }
      return ContentService.createTextOutput("Report OK");
    }
    
    if (data.action === 'sync_employee') {
       var sheet = getSheetFlexible(ss, 'Kunlik_jurnal');
       if (!sheet) return ContentService.createTextOutput("Sheet not found");
       
       var cols = getColumnMapping(sheet);
       var targetRow = getRealLastRow(sheet) + 1;
       if (targetRow < 4) targetRow = 4;
       
       var todayStr = normalizeDate(new Date());
       
       sheet.getRange(targetRow, cols.dateCol).setValue(todayStr);
       sheet.getRange(targetRow, cols.nameCol).setValue(data.employee_name);
       
       var statusRange = sheet.getRange(targetRow, cols.statusCol);
       statusRange.setValue("Yangi xodim");
       statusRange.setBackground('#E0E0E0');
       
       fixDashboardFormulas();
       return ContentService.createTextOutput("Employee OK");
    }
    return ContentService.createTextOutput("Unknown Action");
  } catch(error) {
    return ContentService.createTextOutput("Xato: " + error.toString());
  }
}
