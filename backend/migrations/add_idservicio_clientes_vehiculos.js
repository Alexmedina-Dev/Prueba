require('dotenv').config();
const mysql = require('mysql2/promise');

async function addIdServicio() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motoverso'
  });

  try {
    // Verificar si la columna ya existe en clientes
    const [clientesCols] = await connection.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'clientes' AND COLUMN_NAME = 'idServicio' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (clientesCols.length === 0) {
      await connection.execute('ALTER TABLE clientes ADD COLUMN idServicio VARCHAR(255) FIRST');
      await connection.execute('ALTER TABLE clientes ADD INDEX idx_idServicio (idServicio)');
      console.log('✅ Columna idServicio agregada a clientes');
    } else {
      console.log('ℹ️  idServicio ya existe en clientes');
    }

    // Verificar si la columna ya existe en vehiculos
    const [vehiculosCols] = await connection.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'idServicio' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (vehiculosCols.length === 0) {
      await connection.execute('ALTER TABLE vehiculos ADD COLUMN idServicio VARCHAR(255) FIRST');
      await connection.execute('ALTER TABLE vehiculos ADD INDEX idx_idServicio (idServicio)');
      console.log('✅ Columna idServicio agregada a vehiculos');
    } else {
      console.log('ℹ️  idServicio ya existe en vehiculos');
    }

    console.log('🎉 Migración completada');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  
  await connection.end();
}

addIdServicio();