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

  // 2. Plantilla compacta — repuestos y servicios en UNA celda con salto de línea
  // Row 1: MOTOVERSO (merge)
  // Row 2: Placa: [B2]
  // Row 3: Fecha Salida: [fórmula]
  // Row 4: Cliente: [fórmula]
  // Row 5: Separador
  // Row 6: REPUESTOS: | [contenido en B6]
  // Row 7: SERVICIO: | [contenido en B7]
  // Row 8: Separador
  // Row 9: TOTAL A PAGAR: | [total en B9]

  // Fórmulas con FILTER para servicio abierto
  const repuestosFormula = '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!F:F,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),"Sin repuestos")';
  const serviciosFormula = '=IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),"Sin servicios")';
  const fechaFormula = '=IFERROR(TEXT(INDEX(FILTER(\'Servicios\'!B:B,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto"),1),"DD/MM/YYYY"),"")';
  const clienteFormula = '=IFERROR(INDEX(\'Clientes\'!C:C,MATCH(INDEX(\'Vehículos\'!C:C,MATCH(B2,\'Vehículos\'!B:B,0)),\'Clientes\'!B:B,0)),"")';
  const totalFormula = '=IFERROR(SUM(FILTER(\'Servicios\'!J:J,\'Servicios\'!C:C=B2,\'Servicios\'!K:K="Abierto")),0)';

  const template = [
    ['MOTOVERSO', ''],
    ['Placa:', 'ABC123'],
    ['Fecha Salida:', fechaFormula],
    ['Cliente:', clienteFormula],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['REPUESTOS:', repuestosFormula],
    ['SERVICIO:', serviciosFormula],
    ['- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', ''],
    ['TOTAL A PAGAR:', totalFormula]
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B9",
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
        // REPUESTOS label bold + wrap text en B6
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
            fields: 'userEnteredFormat.wrapStrategy'
          }
        },
        // SERVICIO label bold + wrap text en B7
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
            fields: 'userEnteredFormat.wrapStrategy'
          }
        },
        // TOTAL A PAGAR bold
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 2 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA actualizado - layout compacto con auto-altura');
  console.log('');
  console.log('ESTRUCTURA:');
  console.log('Fila 1: MOTOVERSO (título centrado)');
  console.log('Fila 2: Placa: [input]');
  console.log('Fila 3: Fecha Salida: [automático]');
  console.log('Fila 4: Cliente: [automático]');
  console.log('Fila 5: Separador');
  console.log('Fila 6: REPUESTOS: [contenido con wrap]');
  console.log('Fila 7: SERVICIO: [contenido con wrap]');
  console.log('Fila 8: Separador');
  console.log('Fila 9: TOTAL A PAGAR: [automático]');
}

fixGenerarFactura().catch(err => {
  console.error('Error:', err.message);
});
