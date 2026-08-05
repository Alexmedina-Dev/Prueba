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

  const f = {
    fecha: '=IFERROR(TEXT(DATEVALUE(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1)),"DD/MM/YYYY"),IFERROR(TEXT(DATEVALUE(INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1)),"DD/MM/YYYY"),""))',
    cliente: '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),"")',
    repuestos: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),""))',
    servicios: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),""))',
    total: '=IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2)),0))'
  };

  // SIN relleno fijo — SERVICIO va justo después de REPUESTOS
  const template = [
    ['MOTOVERSO', ''],               // 0 -> fila 1
    ['Placa:', 'ABC123'],             // 1 -> fila 2
    ['Fecha Salida:', f.fecha],       // 2 -> fila 3
    ['Cliente:', f.cliente],          // 3 -> fila 4
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''], // 4 -> fila 5
    ['REPUESTOS:', ''],               // 5 -> fila 6
    [f.repuestos, ''],                // 6 -> fila 7 (auto-alto)
    ['SERVICIO:', ''],                // 7 -> fila 8 (pegado debajo)
    [f.servicios, ''],                // 8 -> fila 9 (auto-alto)
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''], // 9 -> fila 10
    ['TOTAL A PAGAR:', f.total]       // 10 -> fila 11
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B11",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Título merge + bold
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)' } },
        // Labels bold
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Borde verde B2:B4
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        // REPUESTOS header bold
        { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Wrap repuestos
        { repeatCell: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        // SERVICIO header bold
        { repeatCell: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Wrap servicios
        { repeatCell: { range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        // TOTAL bold + borde verde
        { repeatCell: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 0, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        // Columnas anchas
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 450 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA - sin relleno fijo, espaciado dinámico');
}

restoreDesign().catch(e => console.error('Error:', e.message));
