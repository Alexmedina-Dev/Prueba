require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function restoreDesign() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  let sheetId;
  if (exists) {
    sheetId = exists.properties.sheetId;
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: "'GENERAR FACTURA'!A1:Z50" });
  } else {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'GENERAR FACTURA', gridProperties: { rowCount: 50, columnCount: 10 } } } }] }
    });
    sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
  }

  // Helper: fórmulas
  const f = {
    fecha: '=IFERROR(LEFT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),FIND(",",INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1))-1),IFERROR(LEFT(INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1),FIND(",",INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1))-1),""))',
    cliente: '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),"")',
    hayRep: '=IF(COUNTIFS(Servicios!C:C,B2,Servicios!F:F,CHAR(60)&CHAR(62))>0,INDEX(Servicios!F:F,MAX(FILTER(ROW(Servicios!C2:C5000),Servicios!C2:C5000=B2))),"")',
    haySrv: '=IF(COUNTIFS(Servicios!C:C,B2,Servicios!G:G,CHAR(60)&CHAR(62))>0,INDEX(Servicios!G:G,MAX(FILTER(ROW(Servicios!C2:C5000),Servicios!C2:C5000=B2))),"")',
    total: '=IF(COUNTIFS(Servicios!C:C,B2,Servicios!J:J,CHAR(60)&CHAR(62)&"0")>0,INDEX(Servicios!J:J,MAX(FILTER(ROW(Servicios!C2:C5000),Servicios!C2:C5000=B2))),0)'
  };

  // Paso 1: Escriir datos estáticos
  const template = [
    ['MOTOVERSO', ''],
    ['Placa:', 'ABC123'],
    ['Fecha Salida:', f.fecha],
    ['Cliente:', f.cliente],
    ['REPUESTOS:', ''],
    ['', ''],  // B6 se llena después
    ['SERVICIO:', ''],
    ['', ''],  // B8 se llena después
    ['', ''],
    ['TOTAL A PAGAR:', '']  // B10 se llena después
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B10",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // Paso 2: Escriir fórmulas por separado (una por una)
  const formulaCells = [
    { cell: 'GENERAR FACTURA!B3', formula: f.fecha },
    { cell: 'GENERAR FACTURA!B4', formula: f.cliente },
    { cell: 'GENERAR FACTURA!B6', formula: f.hayRep },
    { cell: 'GENERAR FACTURA!B8', formula: f.haySrv },
    { cell: 'GENERAR FACTURA!B10', formula: f.total }
  ];

  for (const { cell, formula } of formulaCells) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: cell,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[formula]] }
    });
  }

  // Paso 3: Formato
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)' } },
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        { repeatCell: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { repeatCell: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        { repeatCell: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA');
}

restoreDesign().catch(e => console.error('Error:', e.message));
