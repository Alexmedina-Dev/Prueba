require('dotenv').config();
const { google } = require('googleapis');

async function verifyFactura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;

  // Check what's in the GENERAR FACTURA sheet now
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'GENERAR FACTURA'!A1:B17"
  });

  console.log('=== GENERAR FACTURA - DATOS ACTUALES ===');
  result.data.values.forEach((row, i) => {
    console.log('Fila', i+1, ':', JSON.stringify(row));
  });
}

verifyFactura();