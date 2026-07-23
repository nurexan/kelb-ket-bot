function doGet(e) {
  return ContentService.createTextOutput("GET OK");
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+5", "yyyy-MM-dd");
  }
  var str = String(val).trim();
  if (str.indexOf('T') !== -1) {
    str = str.split('T')[0];
  }
  return str;
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

function fixDashboardFormulas() {
  var sheetId = '1RAowRWq5_U4Ve1sedNbn12PZFdfXYrPUT-UGhYugr80';
  var ss = SpreadsheetApp.openById(sheetId);
  var dashSheet = ss.getSheetByName('Dashboard');
  if (!dashSheet) return;
  
  for (var r = 11; r <= 100; r++) {
    // Vaqtida (C)
    dashSheet.getRange(r, 3).setFormula('=IF($B' + r + '="", "", COUNTIFS(Kunlik_jurnal!$B:$B, $B' + r + ', Kunlik_jurnal!$E:$E, "Vaqtida"))');
    // Kechikdi (D)
    dashSheet.getRange(r, 4).setFormula('=IF($B' + r + '="", "", COUNTIFS(Kunlik_jurnal!$B:$B, $B' + r + ', Kunlik_jurnal!$E:$E, "Kech qoldi"))');
    // Sababli (E)
    dashSheet.getRange(r, 5).setFormula('=IF($B' + r + '="", "", COUNTIFS(Kunlik_jurnal!$B:$B, $B' + r + ', Kunlik_jurnal!$E:$E, "Sababli"))');
    // Kelmagan (F)
    dashSheet.getRange(r, 6).setFormula('=IF($B' + r + '="", "", COUNTIFS(Kunlik_jurnal!$B:$B, $B' + r + ', Kunlik_jurnal!$E:$E, "Kelmadi"))');
    // Intizom % (G)
    dashSheet.getRange(r, 7).setFormula('=IF(OR($B' + r + '="", SUM(C' + r + ':F' + r + ')=0), "", C' + r + ' / SUM(C' + r + ':F' + r + '))');
    // Ushlanma (H)
    dashSheet.getRange(r, 8).setFormula('=IF($B' + r + '="", "", SUMIFS(Kunlik_jurnal!$G:$G, Kunlik_jurnal!$B:$B, $B' + r + '))');
  }
  
  // Formatlar
  dashSheet.getRange("G11:G100").setNumberFormat("0%");
  dashSheet.getRange("H11:H100").setNumberFormat('#,##0" so\'m"');
  
  // Kunlik jurnal formati (G ustun - Ushlanma)
  var sheet = ss.getSheetByName('Kunlik_jurnal');
  if (sheet) {
    sheet.getRange("G4:G1000").setNumberFormat('#,##0" so\'m"');
  }
}

function writeAttendanceRow(sheet, rows, displayRows, record) {
  var targetRow = -1;
  var incomingName = String(record.employee_name).trim().toLowerCase();
  var incomingDate = String(record.date).trim();
  
  for (var i = 1; i < rows.length; i++) {
    var rawDate = rows[i][0];
    var formattedDate = formatDate(rawDate);
    var displayDate = displayRows && displayRows[i] ? String(displayRows[i][0]).trim() : '';
    var rowName = String(rows[i][1]).trim().toLowerCase();

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
    
    sheet.getRange(targetRow, 1).setValue(record.date);
    sheet.getRange(targetRow, 2).setValue(record.employee_name);
  }

  if (record.arrived_at) {
    sheet.getRange(targetRow, 3).setValue(record.arrived_at);
  }
  
  if (record.left_at) {
    sheet.getRange(targetRow, 4).setValue(record.left_at);
  }

  var statusRange = sheet.getRange(targetRow, 5);
  statusRange.setValue(statusStr);
  statusRange.setBackground(statusBg);
  
  var noteText = statusStr;
  if (record.late_minutes > 0) noteText += "\nKechikish: " + record.late_minutes + " daqiqa";
  if (record.late_reason) noteText += "\nSabab: " + record.late_reason;
  if (record.early_leave_reason) noteText += "\nErta ketish sababi: " + record.early_leave_reason;
  statusRange.setNote(noteText);

  var izoh = [];
  if (record.late_minutes > 0) izoh.push("Kech: " + record.late_minutes + " daq.");
  if (record.late_reason) izoh.push(record.late_reason);
  if (record.early_leave_reason) izoh.push("Erta ketish: " + record.early_leave_reason);
  sheet.getRange(targetRow, 6).setValue(izoh.join(" | "));

  if (record.fine_amount) {
    sheet.getRange(targetRow, 7).setValue(record.fine_amount);
  } else if (record.status === 'late') {
    sheet.getRange(targetRow, 7).setValue(30000);
  }

  try {
    var ss = sheet.getParent();
    var dashSheet = ss.getSheetByName('Dashboard');
    if (dashSheet) {
      var dashData = dashSheet.getRange("B11:B1000").getValues();
      var emptyRowIndex = -1;
      for (var d = 0; d < dashData.length; d++) {
        var currentName = String(dashData[d][0]).trim().toLowerCase();
        if (currentName === incomingName) {
          emptyRowIndex = -2;
          break;
        }
        if (currentName === "") {
          emptyRowIndex = d + 11;
          break;
        }
      }
      if (emptyRowIndex > 0) {
        dashSheet.getRange(emptyRowIndex, 1).setFormula("=ROW() - 10");
        dashSheet.getRange(emptyRowIndex, 2).setValue(record.employee_name);
      }
    }
  } catch (err) {}
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetId = '1RAowRWq5_U4Ve1sedNbn12PZFdfXYrPUT-UGhYugr80';
    var ss = SpreadsheetApp.openById(sheetId);
    
    if (data.action === 'fix_dashboard') {
      fixDashboardFormulas();
      return ContentService.createTextOutput("Dashboard Fixed");
    }

    if (data.action === 'sync_attendance') {
      var sheet = ss.getSheetByName('Kunlik_jurnal');
      if (!sheet) return ContentService.createTextOutput("Sheet not found");
      var rows = sheet.getDataRange().getValues();
      var displayRows = sheet.getDataRange().getDisplayValues();
      writeAttendanceRow(sheet, rows, displayRows, data);
      return ContentService.createTextOutput("OK");
    }

    if (data.action === 'full_report') {
      var sheet = ss.getSheetByName('Kunlik_jurnal');
      if (!sheet) return ContentService.createTextOutput("Sheet not found");
      var records = data.records || [];
      for (var k = 0; k < records.length; k++) {
        var rows = sheet.getDataRange().getValues();
        var displayRows = sheet.getDataRange().getDisplayValues();
        writeAttendanceRow(sheet, rows, displayRows, records[k]);
      }
      return ContentService.createTextOutput("Report OK");
    }
    
    if (data.action === 'sync_employee') {
       var sheet = ss.getSheetByName('Kunlik_jurnal');
       if (!sheet) return ContentService.createTextOutput("Sheet not found");
       
       var targetRow = getRealLastRow(sheet) + 1;
       if (targetRow < 4) targetRow = 4;
       
       var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+5", "yyyy-MM-dd");
       
       sheet.getRange(targetRow, 1).setValue(todayStr);
       sheet.getRange(targetRow, 2).setValue(data.employee_name);
       
       var statusRange = sheet.getRange(targetRow, 5);
       statusRange.setValue("Yangi xodim");
       statusRange.setBackground('#E0E0E0');
       
       var dashSheet = ss.getSheetByName('Dashboard');
       if (dashSheet) {
         var dashData = dashSheet.getRange("B11:B1000").getValues();
         var emptyRowIndex = -1;
         var incName = String(data.employee_name).trim().toLowerCase();
         for (var i = 0; i < dashData.length; i++) {
           var currentName = String(dashData[i][0]).trim().toLowerCase();
           if (currentName === incName) {
             emptyRowIndex = -2;
             break;
           }
           if (currentName === "") {
             emptyRowIndex = i + 11;
             break;
           }
         }
         if (emptyRowIndex > 0) {
           dashSheet.getRange(emptyRowIndex, 1).setFormula("=ROW() - 10");
           dashSheet.getRange(emptyRowIndex, 2).setValue(data.employee_name);
           fixDashboardFormulas();
         }
       }
       return ContentService.createTextOutput("Employee OK");
    }
    return ContentService.createTextOutput("Unknown Action");
  } catch(error) {
    return ContentService.createTextOutput("Xato: " + error.toString());
  }
}
