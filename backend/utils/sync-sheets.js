const { google } = require('googleapis');

// Helper: obtener sheetId por nombre de hoja
async function getSheetId(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets.find(s => s.properties.title === sheetName);
  return sheet ? sheet.properties.sheetId : null;
}

async function syncSheets(datos, estado) {
  try {
    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SHEET_ID;

    // ── 1. Sincronizar Cliente en hoja "Clientes" ──
    // UNA fila por cédula: buscar si existe, actualizar o insertar
    if (datos.cedula) {
      const clienteSearch = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Clientes!A:E'
      });
      const clienteRows = clienteSearch.data.values || [];
      const clienteIdx = clienteRows.findIndex(r => r[1] === datos.cedula);

      const clienteData = [
        datos.idServicio,
        datos.cedula,
        datos.cliente || '',
        datos.telefono || '',
        datos.correo || ''
      ];

      if (clienteIdx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Clientes!A${clienteIdx + 1}:E${clienteIdx + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [clienteData] }
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Clientes!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [clienteData] }
        });
      }
    }

    // ── 2. Sincronizar Vehículo en hoja "Vehículos" ──
    // UNA fila por placa: buscar si existe, actualizar o insertar
    if (datos.placa) {
      const vehiculoSearch = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Vehículos!A:D'
      });
      const vehiculoRows = vehiculoSearch.data.values || [];
      const vehiculoIdx = vehiculoRows.findIndex(r => r[1] === datos.placa.toUpperCase());

      const vehiculoData = [
        datos.idServicio,
        datos.placa.toUpperCase(),
        datos.cedula || '',
        datos.modelo || ''
      ];

      if (vehiculoIdx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Vehículos!A${vehiculoIdx + 1}:D${vehiculoIdx + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [vehiculoData] }
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Vehículos!A:D',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [vehiculoData] }
        });
      }
    }

    // ── 3. Sincronizar Servicio principal en hoja "Servicios" ──
    // Formato original del app.js:
    // A=id, B=fecha, C=placa, D=tecnico, E=diagnostico, F=txtRep, G=txtSrv, H=totalRep, I=totalMO, J=granTotal, K=estado, L=comentarios, M=fechaSalida
    
    // Generar texto formateado de repuestos y servicios (como app.js original)
    let txtRep = "";
    let txtSrv = "";
    if (datos.detalle && Array.isArray(datos.detalle)) {
      for (const item of datos.detalle) {
        const precioFmt = Number(item.precio_unitario || 0).toLocaleString('es-CO');
        const prefijo = item.codigo ? `${item.codigo} - ` : "";
        // Si no hay descripción, usar el tipo como descripción por defecto
        const desc = item.descripcion && item.descripcion.trim() ? item.descripcion.trim() : item.tipo;
        if (item.tipo === 'Repuesto') {
          txtRep += `[${item.cantidad}] ${prefijo}${desc} ($${precioFmt})\n`;
        } else if (item.tipo === 'Mano de Obra') {
          txtSrv += `[${item.cantidad}] ${prefijo}${desc} ($${precioFmt})\n`;
        } else if (item.tipo === 'MO Terceros') {
          txtSrv += `[${item.cantidad}] (TERCERO) ${prefijo}${desc} ($${precioFmt})\n`;
        }
      }
    }

    const serviciosSearch = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Servicios!A:A'
    });
    const serviciosRows = serviciosSearch.data.values || [];
    const servicioIdx = serviciosRows.findIndex(r => r[0] === datos.idServicio);

    // Formatear fecha a formato colombiano: DD/MM/YYYY HH:mm:ss
    const fechaColombia = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const servicioData = [
      datos.idServicio,
      fechaColombia,
      datos.placa,
      datos.tecnico,
      datos.diagnostico || '',
      txtRep,
      txtSrv,
      datos.total_repuestos || 0,
      datos.total_mano_obra || 0,
      datos.gran_total || 0,
      datos.estado,
      datos.comentarios || '',
      datos.fecha_salida || ''
    ];

    if (servicioIdx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Servicios!A${servicioIdx + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [servicioData] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Servicios!A:M',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [servicioData] }
      });
    }

    // ── 4. Sincronizar Detalle de Servicios en hoja "Detalle_Servicios" ──
    if (datos.detalle && Array.isArray(datos.detalle) && datos.detalle.length > 0) {
      // Obtener TODAS las filas existentes
      const allDetail = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Detalle_Servicios!A:G'
      });
      const allRows = allDetail.data.values || [];
      
      // Separar: filas de otros servicios vs filas del servicio actual
      const otherRows = [];
      const ownIndices = [];
      allRows.forEach((r, i) => {
        if (r[0] === datos.idServicio) {
          ownIndices.push(i);
        } else {
          otherRows.push(r);
        }
      });

      // Crear nuevas filas del servicio actual
      const newRows = datos.detalle.map(d => [
        datos.idServicio,
        d.tipo,
        d.codigo,
        d.descripcion,
        d.cantidad,
        d.precio_unitario,
        d.subtotal || (d.cantidad * d.precio_unitario)
      ]);

      // Si hay filas viejas del servicio, sobrescribirlas; si sobran, borrarlas; si faltan, append
      if (ownIndices.length > 0) {
        const firstIdx = ownIndices[0]; // primera fila del servicio
        
        if (newRows.length === ownIndices.length) {
          // Misma cantidad: sobrescribir directamente
          for (let i = 0; i < newRows.length; i++) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Detalle_Servicios!A${firstIdx + 1 + i}:G${firstIdx + 1 + i}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [newRows[i]] }
            });
          }
        } else if (newRows.length > ownIndices.length) {
          // Más items nuevos: sobrescribir las que existen, append() las extras
          for (let i = 0; i < ownIndices.length; i++) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Detalle_Servicios!A${firstIdx + 1 + i}:G${firstIdx + 1 + i}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [newRows[i]] }
            });
          }
          // Append las extras
          const extraRows = newRows.slice(ownIndices.length);
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Detalle_Servicios!A:G',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: extraRows }
          });
        } else {
          // Menos items nuevos: sobrescribir las primeras, borrar las sobrantes con batchUpdate
          for (let i = 0; i < newRows.length; i++) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Detalle_Servicios!A${firstIdx + 1 + i}:G${firstIdx + 1 + i}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [newRows[i]] }
            });
          }
          // Borrar las filas sobrantes (de abajo hacia arriba para no afectar índices)
          const rowsToDelete = ownIndices.length - newRows.length;
          for (let i = 0; i < rowsToDelete; i++) {
            const rowNum = firstIdx + 1 + newRows.length + i;
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: {
                requests: [{
                  deleteDimension: {
                    range: {
                      sheetId: await getSheetId(sheets, spreadsheetId, 'Detalle_Servicios'),
                      dimension: 'ROWS',
                      startIndex: rowNum - 1,
                      endIndex: rowNum
                    }
                  }
                }]
              }
            });
          }
        }
      } else {
        // No hay filas previas: append simple
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Detalle_Servicios!A:G',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: newRows }
        });
      }
    }

    // ── 5. Sincronizar Cierre Diario en hoja "Cierres Diarios" ──
    if (estado === 'CierreDiario' && datos.idCierre) {
      // Buscar si ya existe un cierre para esta fecha+tecnico
      const cierreSearch = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Cierres Diarios!A2:E'
      });
      
      let filaExistente = -1;
      const cierreData = cierreSearch.data.values || [];
      
      for (let i = 0; i < cierreData.length; i++) {
        const fechaFila = cierreData[i][1] || '';
        const tecnicoFila = cierreData[i][2] || '';
        if (fechaFila === datos.fecha && tecnicoFila === datos.tecnico) {
          filaExistente = i + 2; // +2 porque empezamos en A2 (fila 1 es header, datos empiezan fila 2)
          break;
        }
      }
      
      const cierreRow = [
        datos.idCierre,
        datos.fecha,
        datos.tecnico,
        datos.cantidad_servicios,
        datos.total_facturado
      ];
      
      if (filaExistente !== -1) {
        // Actualizar fila existente
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Cierres Diarios!A${filaExistente}:E${filaExistente}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [cierreRow] }
        });
        console.log(`✅ Cierre Diarios actualizado fila ${filaExistente}: ${datos.tecnico} - ${datos.fecha}`);
      } else {
        // Agregar nueva fila
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Cierres Diarios!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [cierreRow] }
        });
        console.log(`✅ Cierre Diarios nuevo agregado: ${datos.tecnico} - ${datos.fecha}`);
      }
    }

    const logId = datos.idServicio || datos.idCierre || 'CierreDiario';
    console.log(`✅ Sheets sincronizado: ${logId}`);
  } catch (err) {
    console.error('❌ Error sincronizando con Google Sheets:', err.message);
    const { logError } = require('./logger');
    logError({
      tipo: 'ERROR_SHEETS',
      ruta: 'sync-sheets.js',
      metodo: 'SYNC',
      mensaje: err.message,
      stack: err.stack,
      datos: { idServicio: datos.idServicio, estado }
    });
  }
}

module.exports = syncSheets;
