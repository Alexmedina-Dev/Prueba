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

  // First, check the actual structure of Servicios sheet
  const serviciosCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Servicios!A1:J5"
  });
  console.log('=== SERVICIOS STRUCTURE ===');
  serviciosCheck.data.values.forEach((row, i) => {
    console.log('Row', i+1, ':', JSON.stringify(row));
  });

  // Delete and recreate the sheet
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  
  if (exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteSheet: {
            sheetId: exists.properties.sheetId
          }
        }]
      }
    });
  }

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

  const sheetId = addRes.data.replies[0].addSheet.properties.sheetId;

  // Create the invoice template with WORKING formulas
  // The key insight: Use QUERY to find the LAST service for the placa
  const template = [
    // Row 1
    ['MOTOVERSO - FACTURA'],
    // Row 2 - empty
    [''],
    // Row 3 - Placa input
    ['PLACA:', 'QHR72E'],
    // Row 4 - Fecha
    ['FECHA:', '=TODAY()'],
    // Row 5 - Cliente (look up from Vehiculos -> Clientes)
    ['CLIENTE:', '=IFERROR(INDEX(Clientes!C:C, MATCH(INDEX(Vehículos!C:C, MATCH(B3, Vehículos!B:B, 0)), Clientes!B:B, 0)), "No encontrado")'],
    // Row 6 - Cedula
    ['CÉDULA:', '=IFERROR(INDEX(Vehículos!C:C, MATCH(B3, Vehículos!B:B, 0)), "No encontrado")'],
    // Row 7 - Modelo
    ['MODELO:', '=IFERROR(INDEX(Vehículos!D:D, MATCH(B3, Vehículos!B:B, 0)), "No encontrado")'],
    // Row 8 - empty
    [''],
    // Row 9 - separator
    ['───────────────────────────────────────────'],
    // Row 10 - Repuestos header
    ['REPUESTOS:'],
    // Row 11 - Repuestos content (get from last service for this placa)
    ['', '=IFERROR(QUERY(Servicios!A:J, "SELECT G WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), "Sin repuestos")'],
    // Row 12 - empty
    [''],
    // Row 13 - Servicios header
    ['SERVICIOS:'],
    // Row 14 - Servicios content
    ['', '=IFERROR(QUERY(Servicios!A:J, "SELECT H WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), "Sin servicios")'],
    // Row 15 - empty
    [''],
    // Row 16 - separator
    ['───────────────────────────────────────────'],
    // Row 17 - Total
    ['TOTAL A PAGAR:', '=IFERROR(QUERY(Servicios!A:K, "SELECT K WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), 0)']
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B17",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // Format: make title bold, larger
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                fontSize: 16
              }
            }
          },
          fields: 'userEnteredFormat.textFormat'
        }
      }]
    }
  });

  console.log('✅ GENERAR FACTURA creado con fórmulas funcionales');
  console.log('');
  console.log('INSTRUCCIONES:');
  console.log('1. Abrí la pestaña "GENERAR FACTURA"');
  console.log('2. Cambiá la celda B3 (PLACA) por cualquier placa');
  console.log('3. Los datos aparecerán automáticamente');
  console.log('');
  console.log('Ejemplo: Escribí "QHR72E" en la celda B3');
}

fixGenerarFactura().catch(err => {
  console.error('Error:', err.message);
  console.error(err);
});