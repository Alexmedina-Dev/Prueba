/**
 * Migración: Agregar columna kilometraje a tabla vehiculos
 * Ejecutar: node backend/migrations/add_kilometraje_vehiculos.js
 */

require('dotenv').config();
const pool = require('../db');

async function migrate() {
  console.log('🔧 Agregando columna kilometraje a vehiculos...');
  
  try {
    // Verificar si la columna ya existe
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'kilometraje' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (cols.length === 0) {
      await pool.execute('ALTER TABLE vehiculos ADD COLUMN kilometraje INT DEFAULT NULL');
      console.log('✅ Columna kilometraje agregada a vehiculos');
    } else {
      console.log('ℹ️  Columna kilometraje ya existe en vehiculos');
    }
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

migrate();
