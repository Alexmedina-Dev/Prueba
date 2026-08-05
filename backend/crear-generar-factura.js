require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function createGenerarFactura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Crear la hoja "GENERAR FACTURA"
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  
  let sheetId;
  if (exists) {
    sheetId = exists.properties.sheetId;
    // Limpiar hoja existente
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: "'GENERAR FACTURA'!A1:Z100"
    });
  } else {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'GENERAR FACTURA',
              gridProperties: { rowCount: 100, columnCount: 10 }
            }
          }
        }]
      }
    });
    sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
  }

  // 2. Crear la plantilla de factura con fórmulas
  const facturaTemplate = [
    // Fila 1: Título
    ['MOTOVERSO - FACTURA'],
    // Fila 2: vacía
    [''],
    // Fila 3: Placa (ingresar manualmente)
    ['PLACA:', 'ABC123'],
    // Fila 4: Fecha
    ['FECHA:', "=TODAY()"],
    // Fila 5: Cliente (busca automático)
    ['CLIENTE:', '=IFERROR(VLOOKUP(C3,\'Vehículos\'!B:D,3,FALSE),"No encontrado")'],
    // Fila 6: Cédula
    ['CÉDULA:', '=IFERROR(VLOOKUP(C3,\'Vehículos\'!B:C,2,FALSE),"No encontrado")'],
    // Fila 7: Modelo
    ['MODELO:', '=IFERROR(VLOOKUP(C3,\'Vehículos\'!B:D,3,FALSE),"No encontrado")'],
    // Fila 8: vacía
    [''],
    // Fila 9: Separador
    ['───────────────────────────────────────────'],
    // Fila 10: Repuestos
    ['REPUESTOS:', '=IFERROR(JOIN(CHAR(10),FILTER(\'Servicios\'!G:G,\'Servicios\'!C:C=C3)),"Sin repuestos")'],
    // Fila 11: Servicios
    ['SERVICIOS:', '=IFERROR(JOIN(CHAR(10),FILTER(\'Servicios\'!H:H,\'Servicios\'!C:C=C3)),"Sin servicios")'],
    // Fila 12: vacía
    [''],
    // Fila 13: Separador
    ['───────────────────────────────────────────'],
    // Fila 14: Total
    ['TOTAL A PAGAR:', '=IFERROR(VLOOKUP(C3,\'Servicios\'!C:K,9,FALSE),0)']
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B14",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: facturaTemplate }
  });

  console.log('✅ Pestaña GENERAR FACTURA creada');
  console.log('📋 Instrucciones:');
  console.log('   1. Abrí la pestaña "GENERAR FACTURA"');
  console.log('   2. Cambiá la celda C3 (PLACA) por la placa que querés facturar');
  console.log('   3. Los datos del cliente, repuestos y total se cargan automáticamente');
  console.log('');
  console.log('   Ejemplo: Escribí "QHR72E" en la celda C3');
  console.log('   y verás los datos del cliente y el total a facturar.');
}

createGenerarFactura().catch(err => {
  console.error('Error:', err.message);
});