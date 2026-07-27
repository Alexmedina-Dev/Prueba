require('dotenv').config();
const pool = require('../db');

async function migrate() {
  try {
    // Verificar si columnas existen
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'logs_errores' AND TABLE_SCHEMA = DATABASE()
    `);
    
    const existingColumns = columns.map(c => c.COLUMN_NAME);
    
    if (!existingColumns.includes('severidad')) {
      await pool.execute('ALTER TABLE logs_errores ADD COLUMN severidad VARCHAR(20) DEFAULT "LOW"');
      console.log('✅ Columna severidad agregada');
    }
    
    if (!existingColumns.includes('categoria')) {
      await pool.execute('ALTER TABLE logs_errores ADD COLUMN categoria VARCHAR(50) DEFAULT "GENERAL"');
      console.log('✅ Columna categoria agregada');
    }
    
    if (!existingColumns.includes('sugerencia')) {
      await pool.execute('ALTER TABLE logs_errores ADD COLUMN sugerencia TEXT');
      console.log('✅ Columna sugerencia agregada');
    }
    
    console.log('🎉 Migración completada');
    process.exit(0);
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

migrate();
