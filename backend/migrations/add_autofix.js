require('dotenv').config();
const pool = require('../db');

async function migrate() {
  try {
    await pool.execute('ALTER TABLE logs_errores ADD COLUMN IF NOT EXISTS auto_fix VARCHAR(255)');
    console.log('✅ Columna auto_fix agregada');
    process.exit(0);
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}
migrate();
