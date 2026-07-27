const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

router.use(authMiddleware, adminOnly);

// GET /api/admin/logs?tipo=&ruta=&page=1&limit=50
router.get('/logs', async (req, res, next) => {
  try {
    const { tipo, ruta, page = 1, limit = 50 } = req.query;
    const lim = Math.min(200, parseInt(limit) || 50);
    const offset = (Math.max(1, parseInt(page)) - 1) * lim;

    const where = [];
    const params = [];
    if (tipo) { where.push('tipo = ?'); params.push(tipo); }
    if (ruta) { where.push('ruta LIKE ?'); params.push(`%${ruta}%`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT id, tipo, ruta, metodo, mensaje, usuario, ip_cliente, fecha, severidad, categoria
       FROM logs_errores ${whereSql}
       ORDER BY 
         CASE severidad 
           WHEN 'CRITICAL' THEN 1 
           WHEN 'HIGH' THEN 2 
           WHEN 'MEDIUM' THEN 3 
           ELSE 4 
         END, 
         fecha DESC 
       LIMIT ? OFFSET ?`,
      [...params, lim, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM logs_errores ${whereSql}`, params
    );

    res.json({ data: rows, total, page: parseInt(page), limit: lim });
  } catch (e) { next(e); }
});

// GET /api/admin/logs/:id -> detalle completo (stack trace + datos de la request)
router.get('/logs/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM logs_errores WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Log no encontrado' });
    res.json(row);
  } catch (e) { next(e); }
});

// GET /api/admin/logs-stats -> resumen para el dashboard
router.get('/logs-stats', async (req, res, next) => {
  try {
    const [ultimas24h] = await pool.query(
      `SELECT tipo, COUNT(*) as total FROM logs_errores
       WHERE fecha >= NOW() - INTERVAL 1 DAY GROUP BY tipo`
    );
    const [topRutas7d] = await pool.query(
      `SELECT ruta, COUNT(*) as total FROM logs_errores
       WHERE fecha >= NOW() - INTERVAL 7 DAY
       GROUP BY ruta ORDER BY total DESC LIMIT 10`
    );
    // Errores que requieren revisión humana (CRITICAL/HIGH sin auto_fix en 24h)
    const [pendientesRevision] = await pool.query(
      `SELECT COUNT(*) as total FROM logs_errores
       WHERE fecha >= NOW() - INTERVAL 1 DAY
       AND severidad IN ('CRITICAL', 'HIGH')
       AND (auto_fix IS NULL OR auto_fix = '')`
    );
    // Errores que se auto-resolvieron en 24h
    const [autoResueltos] = await pool.query(
      `SELECT COUNT(*) as total FROM logs_errores
       WHERE fecha >= NOW() - INTERVAL 1 DAY
       AND auto_fix IS NOT NULL AND auto_fix != ''`
    );
    res.json({ ultimas24h, topRutas7d, pendientesRevision: pendientesRevision[0].total, autoResueltos: autoResueltos[0].total });
  } catch (e) { next(e); }
});

module.exports = router;