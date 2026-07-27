/**
 * Logger de errores inteligente para MotoVerso
 * Guarda errores en MySQL con clasificación automática de severidad y sugerencias
 */

const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Asegurar que existe la carpeta de logs
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, 'errores.log');

/**
 * Analiza un error y determina su severidad, categoría y sugerencia
 */
function analizarError(tipo, mensaje, ruta, stack) {
  const texto = `${tipo} ${mensaje} ${ruta || ''} ${stack || ''}`.toLowerCase();
  
  // CRÍTICO: Errores que detienen la app o comprometen seguridad
  if (texto.includes('cannot connect') || 
      texto.includes('econnrefused') || 
      texto.includes('connection lost') ||
      texto.includes('access denied') && texto.includes('mysql') ||
      texto.includes('jwt_secret') ||
      texto.includes('password') && texto.includes('plain') ||
      tipo === 'UNCAUGHT_EXCEPTION') {
    return {
      severidad: 'CRITICAL',
      categoria: texto.includes('mysql') || texto.includes('database') ? 'BASE_DE_DATOS' : 
                 texto.includes('jwt') || texto.includes('auth') ? 'SEGURIDAD' : 'SISTEMA',
      sugerencia: texto.includes('mysql') ? 'Verificar conexión MySQL. Revisar variables DB_HOST, DB_USER, DB_PASSWORD en .env' :
                  texto.includes('jwt') ? 'Verificar JWT_SECRET en variables de entorno' :
                  'Reiniciar servidor inmediatamente. Error crítico del sistema.'
    };
  }
  
  // ALTO: Errores que afectan funcionalidad core
  if (texto.includes('er_dup_entry') ||
      texto.includes('foreign key constraint') ||
      texto.includes('cannot read property') ||
      texto.includes('undefined is not') ||
      texto.includes('500') && tipo === 'ERROR_SERVER' ||
      texto.includes('timeout') ||
      texto.includes('quota exceeded') ||
      ruta === '/api/login' && mensaje.includes('401')) {
    return {
      severidad: 'HIGH',
      categoria: texto.includes('dup') || texto.includes('constraint') ? 'BASE_DE_DATOS' :
                 texto.includes('undefined') || texto.includes('cannot read') ? 'CODIGO' :
                 texto.includes('quota') || texto.includes('timeout') ? 'RED' :
                 texto.includes('login') || texto.includes('auth') ? 'AUTENTICACION' : 'API',
      sugerencia: texto.includes('dup') ? 'Verificar que no exista duplicado en base de datos' :
                  texto.includes('undefined') ? 'Revisar variables no definidas en el código' :
                  texto.includes('quota') ? 'Límite de Google Sheets alcanzado. Esperar 1 minuto o usar caché.' :
                  texto.includes('timeout') ? 'Servidor lento. Verificar recursos o consultas pesadas.' :
                  'Revisar endpoint y validaciones de entrada.'
    };
  }
  
  // MEDIO: Errores de cliente o configuración
  if (tipo === 'ERROR_CLIENT' ||
      tipo === 'ERROR_SHEETS' ||
      texto.includes('404') ||
      texto.includes('400') ||
      texto.includes('validation') ||
      texto.includes('required')) {
    return {
      severidad: 'MEDIUM',
      categoria: tipo === 'ERROR_SHEETS' ? 'GOOGLE_SHEETS' :
                 texto.includes('404') ? 'RUTA' :
                 texto.includes('validation') || texto.includes('required') ? 'VALIDACION' : 'CLIENTE',
      sugerencia: tipo === 'ERROR_SHEETS' ? 'Verificar credenciales de Google Cloud y permisos del Sheet' :
                  texto.includes('404') ? 'Verificar que la ruta exista en server.js' :
                  texto.includes('validation') ? 'Revisar validaciones en frontend y backend' :
                  'Error del cliente. Verificar request y headers.'
    };
  }
  
  // BAJO: Errores menores o informativos
  return {
    severidad: 'LOW',
    categoria: 'GENERAL',
    sugerencia: 'Monitorear. Si persiste, revisar logs detallados.'
  };
}

/**
 * Guarda un error en MySQL y en archivo de texto
 */
async function logError({ tipo = 'ERROR', ruta, metodo, mensaje, stack, datos, usuario, ip }) {
  const fecha = new Date();
  const fechaStr = fecha.toISOString();
  
  // Analizar error automáticamente
  const analisis = analizarError(tipo, mensaje, ruta, stack);

  // 1. Guardar en archivo de texto
  let logBlock = `[${fechaStr}] [${analisis.severidad}] [${tipo}] ${metodo || 'GET'} ${ruta || 'unknown'} | ${mensaje} | IP: ${ip || 'unknown'} | Usuario: ${usuario || 'anonimo'}\n`;
  logBlock += `CATEGORIA: ${analisis.categoria} | SUGERENCIA: ${analisis.sugerencia}\n`;
  if (stack) logBlock += `STACK: ${stack}\n`;
  if (datos) logBlock += `DATOS: ${JSON.stringify(datos).substring(0, 500)}\n`;
  logBlock += '---\n';

  const MAX_LOG_SIZE = 5 * 1024 * 1024;
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      fs.renameSync(LOG_FILE, path.join(LOGS_DIR, `errores-${Date.now()}.log`));
    }
    fs.appendFile(LOG_FILE, logBlock, (err) => {
      if (err) console.error('No se pudo escribir en archivo de log:', err.message);
    });
  } catch (fileErr) {
    console.error('No se pudo escribir en archivo de log:', fileErr.message);
  }

  // 2. Guardar en MySQL
  try {
    await pool.execute(
      `INSERT INTO logs_errores 
       (tipo, ruta, metodo, mensaje, stack_trace, datos_request, usuario, ip_cliente, fecha, severidad, categoria, sugerencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
      [
        tipo,
        ruta || null,
        metodo || null,
        mensaje ? mensaje.substring(0, 1000) : null,
        stack ? stack.substring(0, 2000) : null,
        datos ? JSON.stringify(datos).substring(0, 2000) : null,
        usuario || null,
        ip || null,
        analisis.severidad,
        analisis.categoria,
        analisis.sugerencia
      ]
    );
  } catch (dbErr) {
    console.error('No se pudo guardar error en MySQL:', dbErr.message);
  }
}

/**
 * Middleware de Express para loguear requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Cuando la respuesta termine, loguear el tiempo
  res.on('finish', () => {
    const duration = Date.now() - start;
    const usuario = req.user ? req.user.email : 'anonimo';
    
    // Solo loguear errores (status >= 400) o requests lentas (> 5 segundos)
    if (res.statusCode >= 400 || duration > 5000) {
      logError({
        tipo: res.statusCode >= 500 ? 'ERROR_SERVER' : 'ERROR_CLIENT',
        ruta: req.originalUrl,
        metodo: req.method,
        mensaje: `HTTP ${res.statusCode} - ${duration}ms`,
        datos: { body: req.body, query: req.query, params: req.params },
        usuario: usuario,
        ip: req.ip || req.connection.remoteAddress
      });
    }
  });
  
  next();
}

/**
 * Middleware de Express para capturar errores no manejados
 */
function errorHandler(err, req, res, next) {
  const usuario = req.user ? req.user.email : 'anonimo';
  
  logError({
    tipo: 'ERROR_UNHANDLED',
    ruta: req.originalUrl,
    metodo: req.method,
    mensaje: err.message,
    stack: err.stack,
    datos: { body: req.body },
    usuario: usuario,
    ip: req.ip || req.connection.remoteAddress
  });

  // No exponer detalles del error al cliente en producción
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(isDev && { detalle: err.message })
  });
}

/**
 * Crear tabla de logs si no existe
 */
async function crearTablaLogs() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS logs_errores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        ruta VARCHAR(500),
        metodo VARCHAR(10),
        mensaje TEXT,
        stack_trace TEXT,
        datos_request TEXT,
        usuario VARCHAR(255),
        ip_cliente VARCHAR(50),
        fecha DATETIME DEFAULT NOW(),
        INDEX idx_fecha (fecha),
        INDEX idx_tipo (tipo),
        INDEX idx_ruta (ruta)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log('✅ Tabla logs_errores creada/verificada');
  } catch (e) {
    console.error('❌ Error creando tabla logs_errores:', e.message);
  }
}

module.exports = {
  logError,
  requestLogger,
  errorHandler,
  crearTablaLogs
};
