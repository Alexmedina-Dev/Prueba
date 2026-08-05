require('dotenv').config();
const { google } = require('googleapis');

async function checkDuplicates() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEET_ID;
  
  // Check Vehiculos - first 200 rows
  const vehiculos = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Vehículos!A1:D200"
  });
  
  const rows = vehiculos.data.values || [];
  console.log('=== PRIMERAS 10 FILAS VEHICULOS ===');
  rows.slice(0, 10).forEach((r, i) => {
    console.log('Fila', i+1, ':', JSON.stringify(r));
  });
  
  // Find duplicates
  const placaCount = {};
  rows.forEach(r => {
    if (r[1]) {
      placaCount[r[1]] = (placaCount[r[1]] || 0) + 1;
    }
  });
  
  const dups = Object.entries(placaCount).filter(([k,v]) => v > 1);
  console.log('\n=== DUPLICADOS ENCONTRADOS (primeros 200) ===');
  dups.slice(0, 10).forEach(([placa, count]) => {
    console.log(placa, ':', count, 'veces');
  });
  console.log('Total duplicados encontrados:', dups.length);
}

checkDuplicates();