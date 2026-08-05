const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const syncSheets = require('../utils/sync-sheets');
const { encolarSync } = require('../utils/sheets-queue');

// POST /api/cierres/generar
router.post('/generar', auth, async (req, res) => {
  try {
    const { fecha, tecnico } = req.body;

    if (!fecha || !tecnico) {
      return res.status(400).json({ error: 'Fecha y técnico requeridos' });
    }

    // Buscar servicios cerrados por fecha_salida y técnico
    // Fallback: si fecha_salida es NULL, usar fecha (ingreso)
    const [servicios] = await pool.execute(`
      SELECT idServicio, fecha_salida, fecha
      FROM servicios
      WHERE estado = 'Cerrado'
        AND tecnico = ?
        AND DATE(COALESCE(fecha_salida, fecha)) = ?
    `, [tecnico, fecha]);

    if (servicios.length === 0) {
      return res.status(404).json({ error: 'No hay servicios cerrados para ese técnico y fecha' });
    }

    const idsServicio = servicios.map(s => s.idServicio);
    const placeholders = idsServicio.map(() => '?').join(',');

    // Sumar MO pura desde detalle_servicios, excluyendo tipo 'Terceros'
    const [totales] = await pool.execute(`
      SELECT COALESCE(SUM(subtotal), 0) AS total_mano_obra
      FROM detalle_servicios
      WHERE idServicio IN (${placeholders})
        AND tipo = 'Mano de Obra'
    `, idsServicio);

    const totalFacturado = totales[0].total_mano_obra;

    // Generar idCierre con formato original (CIE-timestamp)
    const idCierre = `CIE-${Date.now()}`;

    // Upsert en cierres_diarios usando fecha+tecnico como clave única
    await pool.execute(`
      INSERT INTO cierres_diarios
        (idCierre, fecha, tecnico, cantidad_servicios, total_facturado)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        idCierre = VALUES(idCierre),
        cantidad_servicios = VALUES(cantidad_servicios),
        total_facturado = VALUES(total_facturado)
    `, [idCierre, fecha, tecnico, servicios.length, totalFacturado]);

    // Sync Cierres Diarios a Google Sheets (ANTES de cierre_servicios para que siempre sincronice)
    encolarSync(syncSheets, {
      idCierre, 
      fecha, 
      tecnico, 
      cantidad_servicios: servicios.length, 
      total_facturado: totalFacturado 
    }, 'CierreDiario');

    // Insertar relación cierre-servicios en cierre_servicios
    for (const idSrv of idsServicio) {
      await pool.execute(`
        INSERT INTO cierre_servicios (idCierre, idServicio)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE idServicio = idServicio
      `, [idCierre, idSrv]);
    }

    res.json({
      ok: true,
      idCierre,
      fecha,
      tecnico,
      cantidad_servicios: servicios.length,
      total_facturado: totalFacturado,
      servicios: idsServicio
    });
  } catch (e) {
    console.error('POST /cierres/generar error:', e.message);
    res.status(500).json({ error: 'Error al generar cierre: ' + e.message });
  }
});

module.exports = router;
