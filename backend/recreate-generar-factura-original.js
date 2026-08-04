require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function fixGenerarFactura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Get existing sheet
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  
  let sheetId;
  if (exists) {
    sheetId = exists.properties.sheetId;
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: "'GENERAR FACTURA'!A1:Z50"
    });
  } else {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'GENERAR FACTURA',
              gridProperties: { rowCount: 50, columnCount: 10 }
            }
          }
        }]
      }
    });
    sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
  }

  // 2. Plantilla con fórmulas que buscan el servicio ABIERTO
  // Usamos FILTER para encontrar el servicio donde Placa=B2 AND Estado="Abierto"
  // Si no hay abierto, busca el último servicio de esa placa
  
  const template = [
    ['MOTOVERSO', ''],
    ['Placa:', 'ABC123'],
    ['Fecha Salida:',
      '=IFERROR(TEXT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),"DD/MM/YYYY"),"")'],
    ['Cliente:',
      '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),"")'],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['REPUESTOS:', ''],
    ['repuestos_formula', ''],
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
    ['SERVICIO:', ''],
    ['servicios_formula', ''],
    ['', ''],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['TOTAL A PAGAR:', 'total_formula']
  ];

  // Fórmulas con FILTER para servicio abierto
  const repuestosFormula = '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),"Sin repuestos")';
  const serviciosFormula = '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),"Sin servicios")';
  const totalFormula = '=IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),0)';

  // Reemplazar placeholders
  template[6][0] = repuestosFormula;
  template[12][0] = serviciosFormula;
  template[15][1] = totalFormula;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B16",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // 3. Apply formatting
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Título merge + centrado + bold
        {
          mergeCells: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
            mergeType: 'MERGE_ALL'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 14 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
          }
        },
        // Labels bold (Placa, Fecha, Cliente)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // Bordes celda Cliente (B4)
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 2 },
            top: { style: 'SOLID', width: 1 },
            bottom: { style: 'SOLID', width: 1 },
            left: { style: 'SOLID', width: 1 },
            right: { style: 'SOLID', width: 1 }
          }
        },
        // REPUESTOS header bold
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // SERVICIO header bold
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // TOTAL A PAGAR bold
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // Alturas para multi-línea
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA actualizado - busca servicio ABIERTO');
  console.log('');
  console.log('INSTRUCCIONES:');
  console.log('1. Abrí la pestaña "GENERAR FACTURA"');
  console.log('2. Cambiá la celda B2 por cualquier placa');
  console.log('3. Ahora muestra el servicio ABIERTO, no el cerrado');
}

fixGenerarFactura().catch(err => {
  console.error('Error:', err.message);
});
