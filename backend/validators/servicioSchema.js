const Joi = require('joi');

// Schema para guardar servicio
const guardarServicioSchema = Joi.object({
  idServicio: Joi.string().allow('', null).optional(),
  
  cedula: Joi.string()
    .pattern(/^(CLI-[A-Z0-9]{8}|\d{5,10})$/)
    .required()
    .messages({
      'string.pattern.base': 'La cédula debe ser numérica (5-10 dígitos) o formato CLI-XXXXXX'
    }),
  
  nombre_cliente: Joi.string()
    .min(3)
    .max(200)
    .pattern(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .required()
    .messages({
      'string.min': 'El nombre debe tener al menos 3 caracteres',
      'string.pattern.base': 'El nombre solo puede contener letras y espacios'
    }),
  
  telefono: Joi.string()
    .pattern(/^\d{10}$/)
    .allow('', null)
    .optional()
    .messages({
      'string.pattern.base': 'El teléfono debe tener exactamente 10 dígitos'
    }),
  
  correo: Joi.string()
    .email()
    .allow('', null)
    .optional()
    .messages({
      'string.email': 'El correo no tiene un formato válido'
    }),
  
  placa: Joi.string()
    .min(5)
    .max(7)
    .pattern(/^[A-ZÑ0-9]+$/)
    .uppercase()
    .required()
    .messages({
      'string.min': 'La placa debe tener entre 5 y 7 caracteres',
      'string.max': 'La placa debe tener entre 5 y 7 caracteres',
      'string.pattern.base': 'La placa solo puede contener letras y números'
    }),
  
  modelo: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'La marca y modelo debe tener al menos 2 caracteres'
    }),
  
  kilometraje: Joi.number()
    .integer()
    .min(0)
    .allow(null)
    .optional(),
  
  tecnico: Joi.string()
    .min(2)
    .max(100)
    .required(),
  
  diagnostico: Joi.string()
    .max(2000)
    .allow('', null)
    .optional(),
  
  comentarios: Joi.string()
    .max(2000)
    .allow('', null)
    .optional(),
  
  total_repuestos: Joi.number()
    .min(0)
    .required(),
  
  total_mano_obra: Joi.number()
    .min(0)
    .required(),
  
  gran_total: Joi.number()
    .min(0)
    .required(),
  
  estado: Joi.string()
    .valid('Abierto', 'Cerrado')
    .required(),
  
  detalle_servicios: Joi.array()
    .items(
      Joi.object({
        tipo: Joi.string().valid('Repuesto', 'Mano de Obra', 'MO Terceros').required(),
        codigo: Joi.string().max(50).allow('', null).optional(),
        descripcion: Joi.string().max(500).allow('', null).optional(),
        cantidad: Joi.number().min(0).required(),
        precio_unitario: Joi.number().min(0).required()
      })
    )
    .optional(),
  
  detalle_repuestos: Joi.array()
    .items(
      Joi.object({
        codigo: Joi.string().max(50).allow('', null).optional(),
        descripcion: Joi.string().max(500).allow('', null).optional(),
        cantidad: Joi.number().min(0).required(),
        precio_unitario: Joi.number().min(0).required()
      })
    )
    .optional()
});

// Middleware de validación
function validateGuardarServicio(req, res, next) {
  const { error, value } = guardarServicioSchema.validate(req.body, { 
    abortEarly: false,
    stripUnknown: true 
  });
  
  if (error) {
    const errores = error.details.map(d => d.message);
    return res.status(400).json({ 
      error: 'Datos inválidos',
      detalles: errores 
    });
  }
  
  req.body = value; // Usar valores sanitizados
  next();
}

module.exports = { guardarServicioSchema, validateGuardarServicio };
