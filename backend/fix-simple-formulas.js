require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function fixSimpleFormulas() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Fórmulas simplificadas
  const fFecha = '=IFERROR(TEXT(INDEX(FILTER(Servicios!B2:B5000,Servicios!C2:C5000=B2),COUNTIF(Servicios!C2:C5000,B2)),"DD/MM/YYYY"),"")';
  const fCliente = '=IFERROR(INDEX(Clientes!C:C,MATCH(INDEX(Vehículos!C:C,MATCH(B2,Vehículos!B:B,0)),Clientes!B:B,0)),"")';

  console.log('📝 Escribiendo fórmulas simplificadas...');

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B3',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[fFecha]] }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B4',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[fCliente]] }
  });

  console.log('⏳ Esperando evaluación...');
  await new Promise(r => setTimeout(r, 8000));

  // Verificar
  const check = async (cell) => {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `GENERAR FACTURA!${cell}` });
    return (r.data.values || [])[0]?.[0] || '(vacío)';
  };

  console.log('\n✅ RESULTADOS:');
  console.log('Fecha (B3):', await check('B3'));
  console.log('Cliente (B4):', await check('B4'));
}

fixSimpleFormulas().catch(e => console.error('Error:', e.message));
