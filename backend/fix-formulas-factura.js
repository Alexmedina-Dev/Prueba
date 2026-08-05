require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function fixFormulas() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  // Fix formulas: columns in Servicios are:
  // A=ID_Servicio, B=Fecha, C=Placa, D=Tecnico, E=Detalle_Repuestos, F=Detalle_Servicios, G=Total_Repuestos, H=Total_Mano_Obra, I=Gran_Total, J=Estado
  
  const correctedFormulas = [
    ['', '=IFERROR(QUERY(Servicios!A:J, "SELECT E WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), "Sin repuestos")'],
    ['', '=IFERROR(QUERY(Servicios!A:J, "SELECT F WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), "Sin servicios")'],
    ['', '=IFERROR(QUERY(Servicios!A:J, "SELECT I WHERE C = \'" & B3 & "\' ORDER BY B DESC LIMIT 1", 0), 0)']
  ];

  // Update rows 11, 14, 17 (B column only)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!B11",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[correctedFormulas[0][1]]] }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!B14",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[correctedFormulas[1][1]]] }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "'GENERAR FACTURA'!B17",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[correctedFormulas[2][1]]] }
  });

  console.log('✅ Fórmulas corregidas');
}

fixFormulas();