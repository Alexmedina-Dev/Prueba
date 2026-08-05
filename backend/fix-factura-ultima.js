require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

async function test() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Set plate
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B2',
    valueInputOption: 'RAW',
    requestBody: { values: [['QHR72E']] }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Test 1: QUERY with hardcoded plate
  const q1 = "=QUERY(Servicios!A2:G5000,\"SELECT F WHERE C = 'QHR72E' LIMIT 1\",0)";
  console.log('Test 1 (hardcoded):', q1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B5',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[q1]] }
  });
  await new Promise(r => setTimeout(r, 5000));
  let res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'GENERAR FACTURA!B5' });
  console.log('  Result:', JSON.stringify((res.data.values || [])[0]));

  // Test 2: QUERY with B2 reference
  const q2 = "=QUERY(Servicios!A2:G5000,\"SELECT F WHERE C = '\"&B2&\"' LIMIT 1\",0)";
  console.log('\nTest 2 (B2 ref):', q2);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B6',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[q2]] }
  });
  await new Promise(r => setTimeout(r, 5000));
  res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'GENERAR FACTURA!B6' });
  console.log('  Result:', JSON.stringify((res.data.values || [])[0]));

  // Test 3: QUERY with B2 ref + ORDER BY A DESC
  const q3 = "=QUERY(Servicios!A2:G5000,\"SELECT F WHERE C = '\"&B2&\"' ORDER BY A DESC LIMIT 1\",0)";
  console.log('\nTest 3 (ORDER BY A DESC):', q3);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B7',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[q3]] }
  });
  await new Promise(r => setTimeout(r, 5000));
  res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'GENERAR FACTURA!B7' });
  console.log('  Result:', JSON.stringify((res.data.values || [])[0]));

  // Test 4: LOOKUP with hardcoded plate (no array formula needed)
  const l1 = "=LOOKUP(2,1/((Servicios!C2:C5000=\"QHR72E\")*(Servicios!F2:F5000<>\"\")),Servicios!F2:F5000)";
  console.log('\nTest 4 (LOOKUP hardcoded):', l1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'GENERAR FACTURA!B8',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[l1]] }
  });
  await new Promise(r => setTimeout(r, 5000));
  res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'GENERAR FACTURA!B8' });
  console.log('  Result:', JSON.stringify((res.data.values || [])[0]));

  // Read all formulas
  res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'GENERAR FACTURA!B5:B8', valueRenderOption: 'FORMULA' });
  console.log('\nFormulas:');
  (res.data.values || []).forEach((r, i) => console.log('  B' + (5+i) + ':', JSON.stringify(r[0] || '')));
}

test().catch(e => console.error(e.message));
