const mysql = require('mysql2/promise');

// Soporte para DATABASE_URL (Seenode) o variables individuales (local XAMPP)
let dbConfig;

if (process.env.DATABASE_URL) {
  // Parsear DATABASE_URL: mysql://user:password@host:port/dbname
  const url = new URL(process.env.DATABASE_URL);
  dbConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: url.password || '',
    database: url.pathname.replace('/', ''),
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    // Seenode requiere SSL para conexiones remotas
    ssl: {
      rejectUnauthorized: false
    }
  };
  console.log(`[DB] DATABASE_URL detectado: host=${url.hostname}, port=${dbConfig.port}, db=${dbConfig.database}`);
} else {
  // Variables individuales para desarrollo local
  dbConfig = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
  };
  console.log(`[DB] Usando variables individuales: host=${dbConfig.host}, port=${dbConfig.port}, db=${dbConfig.database}`);
}

const pool = mysql.createPool(dbConfig);

// Verificar conexión al arrancar (no bloqueante)
pool.execute('SELECT 1 AS conexion_ok')
  .then(() => console.log('[DB] ✅ Conexión a MySQL establecida'))
  .catch(err => console.error('[DB] ❌ Error conectando a MySQL:', err.message, '| Código:', err.code));

module.exports = pool;
