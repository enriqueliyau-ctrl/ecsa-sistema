/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Modulo de Pagos
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  var FB = null;
  var COLLECTION = 'pagos';

  // ---- Datos de la empresa ----
  var EMPRESA = {
    nombre:        'Empresas Centrales SA',
    yappyNumero:   '6090-9890',
    bancoNombre:   'Banco General',
    bancoTipo:     'Cuenta Corriente',
    bancoCuenta:   '03-68-01-147632-5',
    whatsapp:      '60909890'
  };

  // ---- Metodos de pago ----
  var METODOS = {
    yappy:         { id: 'yappy',         label: 'Yappy' },
    transferencia: { id: 'transferencia', label: 'Transferencia Bancaria' },
    tarjeta:       { id: 'tarjeta',       label: 'Tarjeta de Credito/Debito' },
    efectivo:      { id: 'efectivo',      label: 'Efectivo' }
  };

  // ---- Estados de pago ----
  var ESTADOS = {
    pending:   'pending',
    verified:  'verified',
    completed: 'completed',
    refunded:  'refunded'
  };

  // =====================================================
  // Inicializar
  // =====================================================
  function init() {
    FB = window.ECSA.Firebase;
    if (!FB) {
      console.error('ECSA Pagos: Firebase no esta inicializado.');
    }
  }

  // =====================================================
  // Procesamiento de pagos
  // =====================================================

  /**
   * Procesar pago con Yappy.
   * @param {Object} params - { orderId, monto, screenshotFile }
   * @returns {Promise<Object>} registro de pago
   */
  async function procesarYappy(params) {
    var pago = _crearRegistroPago({
      orderId:   params.orderId,
      metodo:    'yappy',
      monto:     params.monto,
      estado:    ESTADOS.pending,
      detalles: {
        numero: EMPRESA.yappyNumero,
        mensaje: 'Envie el pago de $' + params.monto.toFixed(2) + ' a Yappy ' + EMPRESA.yappyNumero
      }
    });

    // Si hay captura de pantalla, subirla
    if (params.screenshotFile) {
      var path = 'comprobantes/' + pago.referencia + '_' + params.screenshotFile.name;
      pago.comprobanteUrl = await FB.uploadFile(params.screenshotFile, path);
    }

    var id = await FB.addDocument(COLLECTION, pago);
    pago.id = id;
    return pago;
  }

  /**
   * Procesar pago por transferencia bancaria.
   * @param {Object} params - { orderId, monto, comprobanteFile }
   * @returns {Promise<Object>}
   */
  async function procesarTransferencia(params) {
    var pago = _crearRegistroPago({
      orderId: params.orderId,
      metodo:  'transferencia',
      monto:   params.monto,
      estado:  ESTADOS.pending,
      detalles: {
        banco:  EMPRESA.bancoNombre,
        tipo:   EMPRESA.bancoTipo,
        cuenta: EMPRESA.bancoCuenta,
        mensaje: 'Transfiera $' + params.monto.toFixed(2) + ' a ' + EMPRESA.bancoNombre +
                 ' Cuenta: ' + EMPRESA.bancoCuenta
      }
    });

    if (params.comprobanteFile) {
      var path = 'comprobantes/' + pago.referencia + '_' + params.comprobanteFile.name;
      pago.comprobanteUrl = await FB.uploadFile(params.comprobanteFile, path);
    }

    var id = await FB.addDocument(COLLECTION, pago);
    pago.id = id;
    return pago;
  }

  /**
   * Procesar pago con tarjeta (validacion frontend solamente).
   * @param {Object} params - { orderId, monto, cardNumber, expiry, cvv, cardName }
   * @returns {Promise<Object>}
   */
  async function procesarTarjeta(params) {
    // Validar datos de tarjeta
    var validacion = validarTarjeta(params);
    if (!validacion.valid) {
      throw new Error('Datos de tarjeta invalidos: ' + validacion.errors.join(', '));
    }

    var last4 = params.cardNumber.replace(/\s/g, '').slice(-4);

    var pago = _crearRegistroPago({
      orderId: params.orderId,
      metodo:  'tarjeta',
      monto:   params.monto,
      estado:  ESTADOS.completed, // Se marca completo tras validacion frontend
      detalles: {
        ultimos4: last4,
        titular:  params.cardName,
        mensaje:  'Pago con tarjeta terminada en ' + last4
      }
    });

    var id = await FB.addDocument(COLLECTION, pago);
    pago.id = id;
    return pago;
  }

  /**
   * Procesar pago en efectivo.
   * @param {Object} params - { orderId, monto, montoRecibido }
   * @returns {Promise<Object>}
   */
  async function procesarEfectivo(params) {
    var montoRecibido = parseFloat(params.montoRecibido) || 0;
    if (montoRecibido < params.monto) {
      throw new Error('El monto recibido ($' + montoRecibido.toFixed(2) +
        ') es menor al total ($' + params.monto.toFixed(2) + ').');
    }

    var cambio = montoRecibido - params.monto;

    var pago = _crearRegistroPago({
      orderId: params.orderId,
      metodo:  'efectivo',
      monto:   params.monto,
      estado:  ESTADOS.completed,
      detalles: {
        montoRecibido: montoRecibido,
        cambio:        parseFloat(cambio.toFixed(2)),
        mensaje:       'Efectivo recibido: $' + montoRecibido.toFixed(2) +
                       ' | Cambio: $' + cambio.toFixed(2)
      }
    });

    var id = await FB.addDocument(COLLECTION, pago);
    pago.id = id;
    return pago;
  }

  /**
   * Calculadora de cambio.
   * @param {number} total
   * @param {number} recibido
   * @returns {Object} { suficiente, cambio, desglose }
   */
  function calcularCambio(total, recibido) {
    var cambio = recibido - total;
    var desglose = {};
    if (cambio >= 0) {
      var billetes = [100, 50, 20, 10, 5, 1];
      var monedas  = [0.50, 0.25, 0.10, 0.05, 0.01];
      var restante = Math.round(cambio * 100) / 100;

      billetes.concat(monedas).forEach(function (denom) {
        if (restante >= denom) {
          var qty = Math.floor(restante / denom);
          desglose[denom >= 1 ? ('$' + denom) : (denom * 100 + 'c')] = qty;
          restante = Math.round((restante - qty * denom) * 100) / 100;
        }
      });
    }
    return {
      suficiente: cambio >= 0,
      cambio:     parseFloat(Math.max(0, cambio).toFixed(2)),
      desglose:   desglose
    };
  }

  // =====================================================
  // Validacion de tarjeta
  // =====================================================

  function validarTarjeta(params) {
    var errors = [];
    var num = (params.cardNumber || '').replace(/\s|-/g, '');

    // Validar numero (Luhn)
    if (!num || num.length < 13 || num.length > 19 || !/^\d+$/.test(num)) {
      errors.push('Numero de tarjeta invalido');
    } else if (!_luhnCheck(num)) {
      errors.push('Numero de tarjeta no pasa verificacion');
    }

    // Validar expiracion
    var exp = (params.expiry || '').replace(/\s/g, '');
    var expMatch = exp.match(/^(\d{2})\/?(\d{2,4})$/);
    if (!expMatch) {
      errors.push('Fecha de expiracion invalida (MM/YY)');
    } else {
      var month = parseInt(expMatch[1], 10);
      var year  = parseInt(expMatch[2], 10);
      if (year < 100) year += 2000;
      if (month < 1 || month > 12) {
        errors.push('Mes de expiracion invalido');
      } else {
        var now = new Date();
        var expDate = new Date(year, month);
        if (expDate <= now) errors.push('La tarjeta esta vencida');
      }
    }

    // Validar CVV
    var cvv = (params.cvv || '').replace(/\s/g, '');
    if (!cvv || cvv.length < 3 || cvv.length > 4 || !/^\d+$/.test(cvv)) {
      errors.push('CVV invalido');
    }

    // Validar nombre
    if (!params.cardName || params.cardName.trim().length < 3) {
      errors.push('Nombre del titular es requerido');
    }

    return { valid: errors.length === 0, errors: errors };
  }

  function _luhnCheck(num) {
    var sum = 0;
    var alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var n = parseInt(num[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  // =====================================================
  // Gestion de pagos
  // =====================================================

  /**
   * Verificar un pago (marcar como verificado).
   * @param {string} pagoId
   * @returns {Promise<void>}
   */
  async function verificarPago(pagoId) {
    await FB.updateDocument(COLLECTION, pagoId, {
      estado:       ESTADOS.verified,
      verificadoAt: new Date().toISOString()
    });
  }

  /**
   * Completar un pago.
   * @param {string} pagoId
   * @returns {Promise<void>}
   */
  async function completarPago(pagoId) {
    await FB.updateDocument(COLLECTION, pagoId, {
      estado:      ESTADOS.completed,
      completadoAt: new Date().toISOString()
    });
  }

  /**
   * Reembolsar un pago.
   * @param {string} pagoId
   * @param {string} motivo
   * @returns {Promise<void>}
   */
  async function reembolsarPago(pagoId, motivo) {
    await FB.updateDocument(COLLECTION, pagoId, {
      estado:        ESTADOS.refunded,
      reembolsadoAt: new Date().toISOString(),
      motivoReembolso: motivo || ''
    });
  }

  /**
   * Obtener pagos de una orden.
   * @param {string} orderId
   * @returns {Promise<Array>}
   */
  async function obtenerPagosOrden(orderId) {
    var snap = await FB.db.collection(COLLECTION)
      .where('orderId', '==', orderId)
      .get();
    return snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
  }

  /**
   * Obtener pago por referencia.
   * @param {string} referencia
   * @returns {Promise<Object|null>}
   */
  async function obtenerPorReferencia(referencia) {
    var snap = await FB.db.collection(COLLECTION)
      .where('referencia', '==', referencia)
      .limit(1)
      .get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    return Object.assign({ id: doc.id }, doc.data());
  }

  /**
   * Subir comprobante para un pago existente.
   * @param {string} pagoId
   * @param {File} file
   * @returns {Promise<string>} URL del comprobante
   */
  async function subirComprobante(pagoId, file) {
    var path = 'comprobantes/' + pagoId + '_' + file.name;
    var url = await FB.uploadFile(file, path);
    await FB.updateDocument(COLLECTION, pagoId, { comprobanteUrl: url });
    return url;
  }

  // =====================================================
  // Recibo en HTML
  // =====================================================

  /**
   * Generar recibo en HTML.
   * @param {Object} params - { pago, orden, items }
   * @returns {string} HTML del recibo
   */
  function generarRecibo(params) {
    var pago  = params.pago;
    var orden = params.orden || {};
    var items = params.items || [];

    var fecha = pago.fecha || new Date().toISOString();
    var fechaStr = new Date(fecha).toLocaleDateString('es-PA', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    var metodoLabel = METODOS[pago.metodo] ? METODOS[pago.metodo].label : pago.metodo;

    var itemsHtml = '';
    items.forEach(function (item) {
      itemsHtml += '<tr>' +
        '<td>' + (item.name || '') + '</td>' +
        '<td style="text-align:center">' + (item.quantity || 1) + '</td>' +
        '<td style="text-align:right">$' + (item.price || 0).toFixed(2) + '</td>' +
        '<td style="text-align:right">$' + ((item.price || 0) * (item.quantity || 1)).toFixed(2) + '</td>' +
        '</tr>';
    });

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<title>Recibo - ' + pago.referencia + '</title>' +
      '<style>' +
        'body{font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:20px;font-size:12px}' +
        '.header{text-align:center;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:15px}' +
        '.header h2{margin:0;font-size:16px}' +
        '.header p{margin:2px 0;color:#666}' +
        'table{width:100%;border-collapse:collapse;margin:10px 0}' +
        'th,td{padding:4px 6px;border-bottom:1px solid #eee;font-size:11px}' +
        'th{background:#f5f5f5;text-align:left}' +
        '.totals{border-top:2px solid #333;margin-top:10px;padding-top:10px}' +
        '.totals div{display:flex;justify-content:space-between;margin:3px 0}' +
        '.totals .total{font-size:16px;font-weight:bold;border-top:1px solid #333;padding-top:5px;margin-top:5px}' +
        '.footer{text-align:center;margin-top:20px;font-size:10px;color:#999;border-top:1px dashed #ccc;padding-top:10px}' +
        '@media print{body{margin:0;padding:10px}}' +
      '</style></head><body>' +
      '<div class="header">' +
        '<h2>EMPRESAS CENTRALES SA</h2>' +
        '<p>Panama</p>' +
        '<p>Tel: 6090-9890</p>' +
      '</div>' +
      '<div>' +
        '<div><strong>Recibo:</strong> ' + pago.referencia + '</div>' +
        '<div><strong>Fecha:</strong> ' + fechaStr + '</div>' +
        '<div><strong>Metodo:</strong> ' + metodoLabel + '</div>' +
        (orden.clienteNombre ? '<div><strong>Cliente:</strong> ' + orden.clienteNombre + '</div>' : '') +
      '</div>' +
      '<table>' +
        '<thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Total</th></tr></thead>' +
        '<tbody>' + itemsHtml + '</tbody>' +
      '</table>' +
      '<div class="totals">' +
        (orden.subtotal !== undefined ? '<div><span>Subtotal:</span><span>$' + orden.subtotal.toFixed(2) + '</span></div>' : '') +
        (orden.descuento ? '<div><span>Descuento:</span><span>-$' + orden.descuento.toFixed(2) + '</span></div>' : '') +
        (orden.impuesto !== undefined ? '<div><span>ITBMS (7%):</span><span>$' + orden.impuesto.toFixed(2) + '</span></div>' : '') +
        '<div class="total"><span>TOTAL:</span><span>$' + pago.monto.toFixed(2) + '</span></div>' +
      '</div>' +
      (pago.detalles && pago.detalles.cambio ? '<div style="margin-top:10px"><strong>Cambio:</strong> $' + pago.detalles.cambio.toFixed(2) + '</div>' : '') +
      '<div class="footer">' +
        '<p>Gracias por su compra</p>' +
        '<p>Empresas Centrales SA</p>' +
      '</div>' +
      '</body></html>';

    return html;
  }

  /**
   * Imprimir recibo.
   * @param {string} html
   */
  function imprimirRecibo(html) {
    var win = window.open('', '_blank', 'width=450,height=600');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // =====================================================
  // Utilidades internas
  // =====================================================

  function _crearRegistroPago(params) {
    return {
      orderId:       params.orderId || '',
      metodo:        params.metodo,
      monto:         parseFloat(params.monto) || 0,
      estado:        params.estado || ESTADOS.pending,
      referencia:    _generarReferencia(),
      fecha:         new Date().toISOString(),
      detalles:      params.detalles || {},
      comprobanteUrl: params.comprobanteUrl || ''
    };
  }

  function _generarReferencia() {
    var now = new Date();
    var date = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    var rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return 'ECSA-' + date + '-' + rand;
  }

  // ---- Obtener info para mostrar en UI ----

  function obtenerInfoYappy() {
    return {
      numero:  EMPRESA.yappyNumero,
      mensaje: 'Envie su pago por Yappy al numero ' + EMPRESA.yappyNumero +
               '. Luego suba la captura de pantalla como comprobante.'
    };
  }

  function obtenerInfoTransferencia() {
    return {
      banco:   EMPRESA.bancoNombre,
      tipo:    EMPRESA.bancoTipo,
      cuenta:  EMPRESA.bancoCuenta,
      mensaje: 'Realice su transferencia a ' + EMPRESA.bancoNombre +
               ', Cuenta ' + EMPRESA.bancoTipo + ': ' + EMPRESA.bancoCuenta +
               '. Luego suba el comprobante.'
    };
  }

  // ---- Exportar modulo ----
  window.ECSA.Pagos = {
    METODOS:                METODOS,
    ESTADOS:                ESTADOS,
    EMPRESA:                EMPRESA,
    init:                   init,
    procesarYappy:          procesarYappy,
    procesarTransferencia:  procesarTransferencia,
    procesarTarjeta:        procesarTarjeta,
    procesarEfectivo:       procesarEfectivo,
    calcularCambio:         calcularCambio,
    validarTarjeta:         validarTarjeta,
    verificarPago:          verificarPago,
    completarPago:          completarPago,
    reembolsarPago:         reembolsarPago,
    obtenerPagosOrden:      obtenerPagosOrden,
    obtenerPorReferencia:   obtenerPorReferencia,
    subirComprobante:       subirComprobante,
    generarRecibo:          generarRecibo,
    imprimirRecibo:         imprimirRecibo,
    obtenerInfoYappy:       obtenerInfoYappy,
    obtenerInfoTransferencia: obtenerInfoTransferencia
  };

  console.log('ECSA Pagos cargado.');
})();
