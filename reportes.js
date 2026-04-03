/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Modulo de Reportes
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  var FB = null;
  var ORDERS_COLLECTION = 'ordenes';
  var PAGOS_COLLECTION  = 'pagos';

  // =====================================================
  // Inicializar
  // =====================================================
  function init() {
    FB = window.ECSA.Firebase;
    if (!FB) {
      console.error('ECSA Reportes: Firebase no esta inicializado.');
    }
  }

  // =====================================================
  // Utilidades de fechas
  // =====================================================

  function _inicioDelDia(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _finDelDia(date) {
    var d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function _inicioSemana(date) {
    var d = new Date(date);
    var day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _inicioMes(date) {
    var d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _finMes(date) {
    var d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function _formatearFecha(date) {
    return new Date(date).toLocaleDateString('es-PA', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  // =====================================================
  // Obtener ordenes por rango de fecha
  // =====================================================

  async function _obtenerOrdenesPorRango(inicio, fin) {
    try {
      var snap = await FB.db.collection(ORDERS_COLLECTION)
        .where('fecha', '>=', inicio.toISOString())
        .where('fecha', '<=', fin.toISOString())
        .orderBy('fecha', 'desc')
        .get();
      return snap.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
    } catch (error) {
      console.error('Error al obtener ordenes:', error);
      return [];
    }
  }

  // =====================================================
  // Reporte diario
  // =====================================================

  /**
   * Resumen de ventas del dia.
   * @param {Date} [fecha] - por defecto hoy
   * @returns {Promise<Object>}
   */
  async function reporteDiario(fecha) {
    fecha = fecha || new Date();
    var inicio = _inicioDelDia(fecha);
    var fin    = _finDelDia(fecha);
    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);

    var totalVentas = 0;
    var totalCosto  = 0;
    var totalDescuentos = 0;
    var totalImpuestos  = 0;

    ordenes.forEach(function (o) {
      totalVentas     += o.total || 0;
      totalDescuentos += o.descuento || 0;
      totalImpuestos  += o.impuesto || 0;
      // Calcular costo de items
      if (o.items) {
        o.items.forEach(function (item) {
          totalCosto += (item.cost || 0) * (item.quantity || 1);
        });
      }
    });

    var transacciones = ordenes.length;

    return {
      fecha:           _formatearFecha(fecha),
      fechaISO:        inicio.toISOString(),
      transacciones:   transacciones,
      totalVentas:     parseFloat(totalVentas.toFixed(2)),
      totalCosto:      parseFloat(totalCosto.toFixed(2)),
      ganancia:        parseFloat((totalVentas - totalCosto - totalImpuestos).toFixed(2)),
      totalDescuentos: parseFloat(totalDescuentos.toFixed(2)),
      totalImpuestos:  parseFloat(totalImpuestos.toFixed(2)),
      ticketPromedio:  transacciones > 0 ? parseFloat((totalVentas / transacciones).toFixed(2)) : 0,
      ordenes:         ordenes
    };
  }

  // =====================================================
  // Reporte semanal
  // =====================================================

  /**
   * Reporte semanal con desglose dia por dia.
   * @param {Date} [fecha] - cualquier dia de la semana deseada
   * @returns {Promise<Object>}
   */
  async function reporteSemanal(fecha) {
    fecha = fecha || new Date();
    var inicioSem = _inicioSemana(fecha);
    var finSem = new Date(inicioSem);
    finSem.setDate(finSem.getDate() + 6);
    finSem.setHours(23, 59, 59, 999);

    var ordenes = await _obtenerOrdenesPorRango(inicioSem, finSem);

    var diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    var desgloseDiario = [];

    for (var i = 0; i < 7; i++) {
      var dia = new Date(inicioSem);
      dia.setDate(dia.getDate() + i);
      var diaStr = dia.toISOString().split('T')[0];

      var ordenesDia = ordenes.filter(function (o) {
        return o.fecha && o.fecha.startsWith(diaStr);
      });

      var ventasDia = ordenesDia.reduce(function (s, o) { return s + (o.total || 0); }, 0);

      desgloseDiario.push({
        dia:           diasSemana[i],
        fecha:         _formatearFecha(dia),
        transacciones: ordenesDia.length,
        ventas:        parseFloat(ventasDia.toFixed(2))
      });
    }

    var totalVentas = ordenes.reduce(function (s, o) { return s + (o.total || 0); }, 0);

    return {
      semana:          _formatearFecha(inicioSem) + ' - ' + _formatearFecha(finSem),
      inicio:          inicioSem.toISOString(),
      fin:             finSem.toISOString(),
      totalVentas:     parseFloat(totalVentas.toFixed(2)),
      transacciones:   ordenes.length,
      ticketPromedio:  ordenes.length > 0 ? parseFloat((totalVentas / ordenes.length).toFixed(2)) : 0,
      desgloseDiario:  desgloseDiario,
      ordenes:         ordenes
    };
  }

  // =====================================================
  // Reporte mensual
  // =====================================================

  /**
   * Reporte mensual con tendencias.
   * @param {number} [mes] - 0-11 (por defecto mes actual)
   * @param {number} [anio] - por defecto anio actual
   * @returns {Promise<Object>}
   */
  async function reporteMensual(mes, anio) {
    var ahora = new Date();
    if (mes === undefined) mes = ahora.getMonth();
    if (anio === undefined) anio = ahora.getFullYear();

    var inicio = new Date(anio, mes, 1);
    var fin = _finMes(inicio);
    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);

    // Desglose por dia del mes
    var diasEnMes = fin.getDate();
    var desgloseDiario = [];
    for (var d = 1; d <= diasEnMes; d++) {
      var fechaDia = new Date(anio, mes, d);
      var diaStr = fechaDia.toISOString().split('T')[0];
      var ordenesDia = ordenes.filter(function (o) {
        return o.fecha && o.fecha.startsWith(diaStr);
      });
      var ventasDia = ordenesDia.reduce(function (s, o) { return s + (o.total || 0); }, 0);
      desgloseDiario.push({
        dia:           d,
        fecha:         _formatearFecha(fechaDia),
        transacciones: ordenesDia.length,
        ventas:        parseFloat(ventasDia.toFixed(2))
      });
    }

    var totalVentas = ordenes.reduce(function (s, o) { return s + (o.total || 0); }, 0);
    var totalCosto = 0;
    ordenes.forEach(function (o) {
      if (o.items) {
        o.items.forEach(function (item) {
          totalCosto += (item.cost || 0) * (item.quantity || 1);
        });
      }
    });

    var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    return {
      mes:             meses[mes] + ' ' + anio,
      mesNumero:       mes,
      anio:            anio,
      totalVentas:     parseFloat(totalVentas.toFixed(2)),
      totalCosto:      parseFloat(totalCosto.toFixed(2)),
      ganancia:        parseFloat((totalVentas - totalCosto).toFixed(2)),
      transacciones:   ordenes.length,
      ticketPromedio:  ordenes.length > 0 ? parseFloat((totalVentas / ordenes.length).toFixed(2)) : 0,
      desgloseDiario:  desgloseDiario,
      ordenes:         ordenes
    };
  }

  // =====================================================
  // Ventas por departamento
  // =====================================================

  /**
   * Desglose de ventas por departamento.
   * @param {Date} inicio
   * @param {Date} fin
   * @returns {Promise<Object>}
   */
  async function ventasPorDepartamento(inicio, fin) {
    inicio = inicio || _inicioMes(new Date());
    fin    = fin    || _finMes(new Date());
    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);

    var departamentos = {};
    ordenes.forEach(function (o) {
      if (!o.items) return;
      o.items.forEach(function (item) {
        var dep = item.department || 'Sin departamento';
        if (!departamentos[dep]) {
          departamentos[dep] = { nombre: dep, ventas: 0, cantidad: 0, costo: 0 };
        }
        departamentos[dep].ventas   += (item.price || 0) * (item.quantity || 1);
        departamentos[dep].cantidad += item.quantity || 1;
        departamentos[dep].costo    += (item.cost || 0) * (item.quantity || 1);
      });
    });

    var lista = Object.values(departamentos).map(function (dep) {
      dep.ventas   = parseFloat(dep.ventas.toFixed(2));
      dep.costo    = parseFloat(dep.costo.toFixed(2));
      dep.ganancia = parseFloat((dep.ventas - dep.costo).toFixed(2));
      dep.margen   = dep.ventas > 0 ? parseFloat(((dep.ganancia / dep.ventas) * 100).toFixed(1)) : 0;
      return dep;
    });

    lista.sort(function (a, b) { return b.ventas - a.ventas; });

    return {
      periodo:       _formatearFecha(inicio) + ' - ' + _formatearFecha(fin),
      departamentos: lista
    };
  }

  // =====================================================
  // Ventas por metodo de pago
  // =====================================================

  /**
   * Desglose de ventas por metodo de pago.
   * @param {Date} inicio
   * @param {Date} fin
   * @returns {Promise<Object>}
   */
  async function ventasPorMetodoPago(inicio, fin) {
    inicio = inicio || _inicioMes(new Date());
    fin    = fin    || _finMes(new Date());
    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);

    var metodos = {};
    var etiquetas = {
      yappy:         'Yappy',
      transferencia: 'Transferencia',
      tarjeta:       'Tarjeta',
      efectivo:      'Efectivo'
    };

    ordenes.forEach(function (o) {
      var m = o.pagoMetodo || 'otro';
      if (!metodos[m]) {
        metodos[m] = { metodo: etiquetas[m] || m, transacciones: 0, monto: 0 };
      }
      metodos[m].transacciones++;
      metodos[m].monto += o.total || 0;
    });

    var lista = Object.values(metodos).map(function (m) {
      m.monto = parseFloat(m.monto.toFixed(2));
      return m;
    });
    lista.sort(function (a, b) { return b.monto - a.monto; });

    return {
      periodo: _formatearFecha(inicio) + ' - ' + _formatearFecha(fin),
      metodos: lista
    };
  }

  // =====================================================
  // Productos mas vendidos
  // =====================================================

  /**
   * Top productos mas vendidos.
   * @param {Date} inicio
   * @param {Date} fin
   * @param {number} [limite=10]
   * @returns {Promise<Array>}
   */
  async function topProductos(inicio, fin, limite) {
    inicio = inicio || _inicioMes(new Date());
    fin    = fin    || _finMes(new Date());
    limite = limite || 10;

    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);
    var productos = {};

    ordenes.forEach(function (o) {
      if (!o.items) return;
      o.items.forEach(function (item) {
        var key = item.productoId || item.sku || item.name;
        if (!productos[key]) {
          productos[key] = {
            productoId: item.productoId,
            nombre:     item.name,
            sku:        item.sku || '',
            cantidad:   0,
            ingresos:   0,
            costo:      0
          };
        }
        productos[key].cantidad += item.quantity || 1;
        productos[key].ingresos += (item.price || 0) * (item.quantity || 1);
        productos[key].costo    += (item.cost || 0) * (item.quantity || 1);
      });
    });

    var lista = Object.values(productos).map(function (p) {
      p.ingresos  = parseFloat(p.ingresos.toFixed(2));
      p.costo     = parseFloat(p.costo.toFixed(2));
      p.ganancia  = parseFloat((p.ingresos - p.costo).toFixed(2));
      return p;
    });

    lista.sort(function (a, b) { return b.cantidad - a.cantidad; });
    return lista.slice(0, limite);
  }

  // =====================================================
  // Margenes de ganancia
  // =====================================================

  /**
   * Reporte de ingresos vs costos.
   * @param {Date} inicio
   * @param {Date} fin
   * @returns {Promise<Object>}
   */
  async function reporteGanancias(inicio, fin) {
    inicio = inicio || _inicioMes(new Date());
    fin    = fin    || _finMes(new Date());

    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);

    var totalIngresos   = 0;
    var totalCosto      = 0;
    var totalDescuentos = 0;
    var totalImpuestos  = 0;

    ordenes.forEach(function (o) {
      totalIngresos   += o.total || 0;
      totalDescuentos += o.descuento || 0;
      totalImpuestos  += o.impuesto || 0;
      if (o.items) {
        o.items.forEach(function (item) {
          totalCosto += (item.cost || 0) * (item.quantity || 1);
        });
      }
    });

    var gananciasBrutas = totalIngresos - totalCosto;
    var gananciasNetas  = gananciasBrutas - totalImpuestos;

    return {
      periodo:          _formatearFecha(inicio) + ' - ' + _formatearFecha(fin),
      ingresos:         parseFloat(totalIngresos.toFixed(2)),
      costos:           parseFloat(totalCosto.toFixed(2)),
      descuentos:       parseFloat(totalDescuentos.toFixed(2)),
      impuestos:        parseFloat(totalImpuestos.toFixed(2)),
      gananciasBrutas:  parseFloat(gananciasBrutas.toFixed(2)),
      gananciasNetas:   parseFloat(gananciasNetas.toFixed(2)),
      margenBruto:      totalIngresos > 0 ? parseFloat(((gananciasBrutas / totalIngresos) * 100).toFixed(1)) : 0,
      margenNeto:       totalIngresos > 0 ? parseFloat(((gananciasNetas / totalIngresos) * 100).toFixed(1)) : 0
    };
  }

  // =====================================================
  // Preparacion de datos para Chart.js
  // =====================================================

  /**
   * Datos para grafico de ventas diarias (linea).
   * @param {Array} desgloseDiario - del reporte semanal o mensual
   * @returns {Object} { labels, datasets }
   */
  function chartVentasDiarias(desgloseDiario) {
    return {
      labels: desgloseDiario.map(function (d) { return d.dia || d.fecha; }),
      datasets: [{
        label:           'Ventas ($)',
        data:            desgloseDiario.map(function (d) { return d.ventas; }),
        borderColor:     '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        tension:         0.3,
        fill:            true
      }, {
        label:       'Transacciones',
        data:        desgloseDiario.map(function (d) { return d.transacciones; }),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension:     0.3,
        yAxisID:     'y1'
      }]
    };
  }

  /**
   * Datos para grafico de ventas por departamento (torta/barra).
   * @param {Array} departamentos
   * @returns {Object}
   */
  function chartVentasDepartamento(departamentos) {
    var colores = [
      '#2563eb', '#dc2626', '#16a34a', '#ea580c',
      '#7c3aed', '#0891b2', '#ca8a04', '#db2777'
    ];
    return {
      labels: departamentos.map(function (d) { return d.nombre; }),
      datasets: [{
        label:           'Ventas ($)',
        data:            departamentos.map(function (d) { return d.ventas; }),
        backgroundColor: departamentos.map(function (_, i) { return colores[i % colores.length]; })
      }]
    };
  }

  /**
   * Datos para grafico de metodos de pago (torta).
   * @param {Array} metodos
   * @returns {Object}
   */
  function chartMetodosPago(metodos) {
    var colores = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed'];
    return {
      labels: metodos.map(function (m) { return m.metodo; }),
      datasets: [{
        data:            metodos.map(function (m) { return m.monto; }),
        backgroundColor: metodos.map(function (_, i) { return colores[i % colores.length]; })
      }]
    };
  }

  /**
   * Datos para grafico de ganancias (barras apiladas).
   * @param {Object} ganancias - resultado de reporteGanancias
   * @returns {Object}
   */
  function chartGanancias(ganancias) {
    return {
      labels: ['Ingresos', 'Costos', 'Impuestos', 'Ganancia Neta'],
      datasets: [{
        label: 'Monto ($)',
        data:  [ganancias.ingresos, ganancias.costos, ganancias.impuestos, ganancias.gananciasNetas],
        backgroundColor: ['#2563eb', '#dc2626', '#ea580c', '#16a34a']
      }]
    };
  }

  // =====================================================
  // Dashboard KPIs
  // =====================================================

  /**
   * Calcular KPIs del dashboard.
   * @param {Date} [inicio] - por defecto inicio del mes
   * @param {Date} [fin] - por defecto hoy
   * @returns {Promise<Object>}
   */
  async function calcularKPIs(inicio, fin) {
    inicio = inicio || _inicioMes(new Date());
    fin    = fin    || _finDelDia(new Date());

    var ordenes = await _obtenerOrdenesPorRango(inicio, fin);
    var totalIngresos = 0;
    var totalCosto = 0;
    var depConteo = {};

    ordenes.forEach(function (o) {
      totalIngresos += o.total || 0;
      if (o.items) {
        o.items.forEach(function (item) {
          totalCosto += (item.cost || 0) * (item.quantity || 1);
          var dep = item.department || 'Otro';
          depConteo[dep] = (depConteo[dep] || 0) + ((item.price || 0) * (item.quantity || 1));
        });
      }
    });

    // Top departamento
    var topDepartamento = '';
    var topVentas = 0;
    Object.keys(depConteo).forEach(function (dep) {
      if (depConteo[dep] > topVentas) {
        topVentas = depConteo[dep];
        topDepartamento = dep;
      }
    });

    // Ventas de hoy
    var hoy = await reporteDiario();

    return {
      periodo:            _formatearFecha(inicio) + ' - ' + _formatearFecha(fin),
      totalIngresos:      parseFloat(totalIngresos.toFixed(2)),
      totalOrdenes:       ordenes.length,
      valorPromedioOrden: ordenes.length > 0 ? parseFloat((totalIngresos / ordenes.length).toFixed(2)) : 0,
      topDepartamento:    topDepartamento,
      topDepartamentoVentas: parseFloat(topVentas.toFixed(2)),
      totalCosto:         parseFloat(totalCosto.toFixed(2)),
      ganancia:           parseFloat((totalIngresos - totalCosto).toFixed(2)),
      margen:             totalIngresos > 0 ? parseFloat((((totalIngresos - totalCosto) / totalIngresos) * 100).toFixed(1)) : 0,
      ventasHoy:          hoy.totalVentas,
      transaccionesHoy:   hoy.transacciones
    };
  }

  // =====================================================
  // Exportar a CSV
  // =====================================================

  /**
   * Exportar ordenes a CSV.
   * @param {Array} ordenes
   * @param {string} [nombreArchivo]
   */
  function exportarCSV(ordenes, nombreArchivo) {
    var headers = [
      'Numero Orden', 'Fecha', 'Cliente', 'Telefono', 'Email',
      'Subtotal', 'Descuento', 'ITBMS', 'Total',
      'Metodo Pago', 'Estado', 'Entrega', 'Items'
    ];

    var rows = [headers.join(',')];

    ordenes.forEach(function (o) {
      var itemsList = (o.items || []).map(function (item) {
        return item.quantity + 'x ' + item.name;
      }).join(' | ');

      var row = [
        o.numeroOrden || '',
        o.fecha ? new Date(o.fecha).toLocaleDateString('es-PA') : '',
        '"' + (o.clienteNombre || '').replace(/"/g, '""') + '"',
        o.clienteTelefono || '',
        o.clienteEmail || '',
        (o.subtotal || 0).toFixed(2),
        (o.descuento || 0).toFixed(2),
        (o.impuesto || 0).toFixed(2),
        (o.total || 0).toFixed(2),
        o.pagoMetodo || '',
        o.estado || '',
        o.tipoEntrega || '',
        '"' + itemsList.replace(/"/g, '""') + '"'
      ];
      rows.push(row.join(','));
    });

    var csv = rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (nombreArchivo || 'reporte_ecsa_' + _fechaArchivo()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Exportar cualquier reporte a CSV generico.
   * @param {Array} datos - array de objetos
   * @param {string} [nombreArchivo]
   */
  function exportarDatosCSV(datos, nombreArchivo) {
    if (!datos || !datos.length) return;

    var headers = Object.keys(datos[0]);
    var rows = [headers.join(',')];

    datos.forEach(function (obj) {
      var row = headers.map(function (h) {
        var val = obj[h] !== undefined ? obj[h] : '';
        if (typeof val === 'object') val = JSON.stringify(val);
        if (typeof val === 'string' && (val.indexOf(',') !== -1 || val.indexOf('"') !== -1)) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      });
      rows.push(row.join(','));
    });

    var csv = rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (nombreArchivo || 'datos_ecsa_' + _fechaArchivo()) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _fechaArchivo() {
    var d = new Date();
    return d.getFullYear() + '' +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
  }

  // ---- Exportar modulo ----
  window.ECSA.Reportes = {
    init:                    init,
    reporteDiario:           reporteDiario,
    reporteSemanal:          reporteSemanal,
    reporteMensual:          reporteMensual,
    ventasPorDepartamento:   ventasPorDepartamento,
    ventasPorMetodoPago:     ventasPorMetodoPago,
    topProductos:            topProductos,
    reporteGanancias:        reporteGanancias,
    calcularKPIs:            calcularKPIs,
    chartVentasDiarias:      chartVentasDiarias,
    chartVentasDepartamento: chartVentasDepartamento,
    chartMetodosPago:        chartMetodosPago,
    chartGanancias:          chartGanancias,
    exportarCSV:             exportarCSV,
    exportarDatosCSV:        exportarDatosCSV
  };

  console.log('ECSA Reportes cargado.');
})();
