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

  // Helper: si hay datos muestra el contenido, si no devuelve vacío
  const f = {
    fecha: '=IFERROR(LEFT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),FIND(",",INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1))-1),IFERROR(LEFT(INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1),FIND(",",INDEX(SORT(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2),1,FALSE),1))-1),""))',
    cliente: '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),"")',
    // Headers y contenido condicionales: solo aparecen si hay datos
    repHeader: '=IF(IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),0))>0,"REPUESTOS:","")',
    repContent: '=IF(IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),0))>0,IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),"")),"")',
    srvHeader: '=IF(IFERROR(COUNTA(FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(COUNTA(FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),0))>0,"SERVICIO:","")',
    srvContent: '=IF(IFERROR(COUNTA(FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(COUNTA(FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),0))>0,IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2)),"")),"")',
    total: '=IF(IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(COUNTA(FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2)),0))>0,IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2)),0)),"")'
  };

  // Compacto: solo filas necesarias, headers condicionales
  const template = [
    ['MOTOVERSO', ''],               // 0 -> fila 1
    ['Placa:', 'ABC123'],             // 1 -> fila 2
    ['Fecha Salida:', f.fecha],       // 2 -> fila 3
    ['Cliente:', f.cliente],          // 3 -> fila 4
    [f.repHeader, ''],                // 4 -> fila 5 (vacía si no hay repuestos)
    [f.repContent, ''],               // 5 -> fila 6 (vacía si no hay repuestos)
    [f.srvHeader, ''],                // 6 -> fila 7 (vacía si no hay servicios)
    [f.srvContent, ''],               // 7 -> fila 8 (vacía si no hay servicios)
    ['', ''],                          // 8 -> fila 9 (respiro mínimo)
    ['TOTAL A PAGAR:', f.total]       // 9 -> fila 10
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B10",
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
        // Labels bold (Placa, Fecha, Cliente)
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Borde verde B2:B4
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        // REPUESTOS header bold
        { repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Wrap repuestos
        { repeatCell: { range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        // SERVICIO header bold
        { repeatCell: { range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        // Wrap servicios
        { repeatCell: { range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)' } },
        // TOTAL bold + borde verde
        { repeatCell: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
        { updateBorders: { range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 2 }, top: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, bottom: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, left: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } }, right: { style: 'SOLID', width: 1, color: { red: 0.3, green: 0.6, blue: 0.3 } } } },
        // Columnas compactas para imprimir
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA - compacto, sin espacio muerto');
}

restoreDesign().catch(e => console.error('Error:', e.message));
