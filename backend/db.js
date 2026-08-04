const mysql = require('mysql2/promise');

// ──────────────────────────────────────────────────────────
// Configuración MySQL: soporta DATABASE_URL (Seenode/Prisma)
// o variables individuales (XAMPP local)
// ──────────────────────────────────────────────────────────

function parseDatabaseUrl(urlString) {
  // Seenode a veces envía db:mysql:// en vez de mysql://
  const cleanUrl = urlString.replace(/^db:/, '');
  try {
    const url = new URL(cleanUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password || ''),
      database: url.pathname.replace('/', '')
    };
  } catch (e) {
    console.error('[DB] ❌ Error parseando DATABASE_URL:', e.message);
    return null;
  }
}

function isRemote(host) {
  return host && host !== 'localhost' && host !== '127.0.0.1';
}

let dbConfig;
let source = '';

if (process.env.DATABASE_URL) {
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  if (parsed) {
    dbConfig = {
      ...parsed,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0
    };
    source = 'DATABASE_URL';
  }
}

// Fallback a variables individuales si DATABASE_URL no existe o falló
if (!dbConfig) {
  dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motoverso',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0
  };
  source = 'variables individuales';
}

// SSL obligatorio para conexiones remotas (Seenode, PlanetScale, etc.)
if (isRemote(dbConfig.host)) {
  dbConfig.ssl = { rejectUnauthorized: false };
}

console.log(`[DB] Usando configuración desde: ${source}`);
console.log(`[DB] host=${dbConfig.host}, port=${dbConfig.port}, db=${dbConfig.database}, ssl=${dbConfig.ssl ? 'SÍ' : 'NO'}`);

const pool = mysql.createPool(dbConfig);

// Verificar conexión al arrancar
pool.execute('SELECT 1 AS conexion_ok')
  .then(() => console.log('[DB] ✅ Conexión a MySQL establecida'))
  .catch(err => {
    console.error('[DB] ❌ Error conectando a MySQL:', err.message, '| Código:', err.code);
    if (err.code === 'ECONNREFUSED') {
      console.error('[DB] 💡 Verifica que el host y puerto sean correctos. Si es Seenode, confirma que DATABASE_URL incluye :11550');
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('[DB] 💡 Usuario o contraseña incorrectos. Revisa DB_USER / DB_PASSWORD o DATABASE_URL');
    }
  });

module.exports = pool;
