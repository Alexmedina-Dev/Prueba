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

  // Fórmulas: primero busca servicio ABIERTO, si no hay muestra el ÚLTIMO
  const f = {
    fecha: '=IFERROR(TEXT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),\"DD/MM/YYYY\"),IFERROR(TEXT(INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1),\"DD/MM/YYYY\"),\"\"))',
    cliente: '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),\"")',
    repuestos: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),\"\"))',
    servicios: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),\"\"))',
    total: '=IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2)),0))'
  };

  const template = [
    ['MOTOVERSO', ''],                          // 1
    ['Placa:', 'ABC123'],                        // 2
    ['Fecha Salida:', f.fecha],                  // 3
    ['Cliente:', f.cliente],                     // 4
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],  // 5
    ['REPUESTOS:', ''],                          // 6
    [f.repuestos, ''],                           // 7
    ['', ''],                                    // 8
    ['', ''],                                    // 9
    ['', ''],                                    // 10
    ['', ''],                                    // 11
    ['SERVICIO:', ''],                           // 12
    [f.servicios, ''],                           // 13
    ['', ''],                                    // 14
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],  // 15
    ['TOTAL A PAGAR:', f.total]                  // 16
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B16",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // Formato
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)' } },
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { repeatCell: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } },
        { repeatCell: { range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { repeatCell: { range: { sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } },
        { repeatCell: { range: { sheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA - diseño de imagen + fallback último servicio');
}

restoreDesign().catch(e => console.error('Error:', e.message));
