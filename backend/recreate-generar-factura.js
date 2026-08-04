require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function recreateGenerarFactura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Eliminar hoja existente
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = spreadsheet.data.sheets.find(s => s.properties.title === 'GENERAR FACTURA');
  
  if (exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ deleteSheet: { sheetId: exists.properties.sheetId } }]
      }
    });
  }

  // 2. Crear nueva hoja
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

  // 3. Plantilla con fórmulas robustas (INDEX/MATCH en vez de QUERY)
  const template = [
    ['═══════════════════════════════════════════════════════'],
    ['              M O T O V E R S O   -   F A C T U R A'],
    ['═══════════════════════════════════════════════════════'],
    [''],
    ['PLACA:', 'ABC123'],
    ['FECHA:', '=TODAY()'],
    [''],
    ['────────────────── CLIENTE ──────────────────'],
    ['NOMBRE:', '=IFERROR(INDEX(Clientes!C:C, MATCH(INDEX(Vehículos!C:C, MATCH(B5, Vehículos!B:B, 0)), Clientes!B:B, 0)), "No encontrado")'],
    ['CÉDULA:', '=IFERROR(INDEX(Vehículos!C:C, MATCH(B5, Vehículos!B:B, 0)), "No encontrado")'],
    ['MODELO:', '=IFERROR(INDEX(Vehículos!D:D, MATCH(B5, Vehículos!B:B, 0)), "No encontrado")'],
    [''],
    ['────────────────── SERVICIOS ──────────────────'],
    ['ÚLTIMO INGRESO:', '=IFERROR(INDEX(Servicios!B:B, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), "Sin servicios abiertos")'],
    ['DIAGNÓSTICO:', '=IFERROR(INDEX(Servicios!E:E, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), "")'],
    [''],
    ['REPUESTOS USADOS:', '=IFERROR(INDEX(Servicios!F:F, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), "Sin repuestos")'],
    ['SERVICIOS REALIZADOS:', '=IFERROR(INDEX(Servicios!G:G, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), "Sin servicios")'],
    [''],
    ['────────────────── TOTALES ──────────────────'],
    ['TOTAL REPUESTOS:', '=IFERROR(INDEX(Servicios!I:I, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), 0)'],
    ['MANO DE OBRA:', '=IFERROR(INDEX(Servicios!J:J, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), 0)'],
    ['────────────────────────────────────────────'],
    ['TOTAL A PAGAR:', '=IFERROR(INDEX(Servicios!K:K, MATCH(1, (Servicios!C:C = B5) * (Servicios!L:L = "Abierto"), 0)), 0)']
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!A1:B24",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: template }
  });

  // 4. Formato: título centrado y grande
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // Título centrado
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 14 },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
          }
        },
        // Bordes decorativos
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 },
            top: { style: 'SOLID', width: 2, color: { red: 0.8, green: 0.6, blue: 0.2 } },
            bottom: { style: 'SOLID', width: 2, color: { red: 0.8, green: 0.6, blue: 0.2 } }
          }
        },
        // PLACA en negrita
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat'
          }
        },
        // TOTAL en negrita y color
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 2 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 13 },
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.9 }
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)'
          }
        }
      ]
    }
  });

  console.log('✅ GENERAR FACTURA recreado con diseño mejorado');
  console.log('');
  console.log('INSTRUCCIONES:');
  console.log('1. Abrí la pestaña "GENERAR FACTURA"');
  console.log('2. Cambiá la celda B5 (PLACA) por cualquier placa registrada');
  console.log('3. Los datos del cliente y totales aparecerán automáticamente');
  console.log('');
  console.log('⚠️ Nota: Las fórmulas usan MATCH con array, pueden mostrar');
  console.log('   #N/A si la placa no tiene servicios abiertos. Esto es normal.');
}

recreateGenerarFactura().catch(err => {
  console.error('Error:', err.message);
});
