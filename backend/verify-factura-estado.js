require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function verifyFactura() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Leer fórmulas actuales en GENERAR FACTURA
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!A1:B15',
    valueRenderOption: 'FORMULA'
  });

  console.log('=== ESTADO ACTUAL DE GENERAR FACTURA ===\n');
  const rows = res.data.values || [];
  rows.forEach((r, i) => {
    const rowNum = i + 1;
    const a = r[0] || '';
    const b = r[1] || '';
    const bDisplay = b.startsWith('=') ? b.substring(0, 80) + '...' : b;
    console.log(`Fila ${rowNum}: A="${a.substring(0, 40)}" | B="${bDisplay}"`);
  });

  // Leer valores evaluados
  const valRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!A1:B15'
  });

  console.log('\n=== VALORES EVALUADOS ===\n');
  const valRows = valRes.data.values || [];
  valRows.forEach((r, i) => {
    const rowNum = i + 1;
    const a = r[0] || '';
    const b = r[1] || '';
    console.log(`Fila ${rowNum}: A="${a.substring(0, 40)}" | B="${b.substring(0, 60)}"`);
  });
}

verifyFactura().catch(e => console.error('Error:', e.message));
