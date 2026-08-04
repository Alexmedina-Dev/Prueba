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

  // Fórmulas
  const f = {
    fecha: '=IFERROR(TEXT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),\"DD/MM/YYYY\"),IFERROR(TEXT(INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1),\"DD/MM/YYYY\"),\"\"))',
    cliente: '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),\"")',
    repuestos: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),\"\"))',
    servicios: '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),\"\"))',
    total: '=IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K=\"Abierto\")),IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2)),0))'
  };

  const template = [
    ['MOTOVERSO', ''],
    ['Placa:', 'ABC123'],
    ['Fecha Salida:', f.fecha],
    ['Cliente:', f.cliente],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['REPUESTOS:', ''],
    [f.repuestos, ''],
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
    ['SERVICIO:', ''],
    [f.servicios, ''],
    ['', ''],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['TOTAL A PAGAR:', f.total]
  ];

  // 1. Escribir datos
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B16",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // 2. Formato base
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
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 450 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } }
      ]
    }
  });

  // 3. Esperar que las fórmulas se calculen
  await new Promise(r => setTimeout(r, 3000));

  // 4. Leer el contenido real y ajustar alturas de filas
  await new Promise(r => setTimeout(r, 5000));
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B16",
    valueRenderOption: 'FORMATTED_VALUE'
  });
  const rows = dataRes.data.values || [];

  // Calcular alturas: cada línea de texto ≈ 21px, base 21px
  const LINE_HEIGHT = 21;
  const heightRequests = [];

  for (let i = 0; i < rows.length; i++) {
    const cellA = rows[i] ? (rows[i][0] || '') : '';
    const cellB = rows[i] ? (rows[i][1] || '') : '';
    const maxLines = Math.max(
      cellA.split('\n').length,
      cellB.split('\n').length,
      1
    );
    const height = Math.max(maxLines * LINE_HEIGHT, 21);

    heightRequests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: height },
        fields: 'pixelSize'
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: heightRequests }
  });

  console.log('✅ GENERAR FACTURA - alturas ajustadas al contenido');
  rows.forEach((row, i) => {
    const lines = Math.max(
      (row[0] || '').split('\n').length,
      (row[1] || '').split('\n').length,
      1
    );
    console.log(`  Fila ${i+1}: ${lines} línea(s) → ${lines * 21}px`);
  });
}

restoreDesign().catch(e => console.error('Error:', e.message));
