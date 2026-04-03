/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Modulo de Carrito de Compras
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  var FB = null;
  var STORAGE_KEY = 'ecsa_carrito';
  var ORDERS_COLLECTION = 'ordenes';

  // ---- Impuesto ITBMS Panama ----
  var ITBMS_RATE = 0.07;

  // ---- Descuentos por membresia ----
  var DESCUENTOS_MEMBRESIA = {
    none:      { nombre: 'Sin membresia', porcentaje: 0 },
    platinium: { nombre: 'Platinium',     porcentaje: 0.02 },
    gold:      { nombre: 'Gold',          porcentaje: 0.05 },
    premium:   { nombre: 'Premium',       porcentaje: 0.10 }
  };

  // ---- WhatsApp ----
  var WHATSAPP_NUMERO = '50760909890';

  // ---- Estado ----
  var _items = [];
  var _cliente = null;
  var _membresia = 'none';
  var _entrega = null;   // { tipo: 'pickup'|'delivery', direccion: '' }
  var _pasoActual = 1;
  var _sidebarAbierto = false;
  var _listeners = [];

  // =====================================================
  // Inicializar
  // =====================================================
  function init() {
    FB = window.ECSA.Firebase;
    _cargarDesdeStorage();
  }

  // =====================================================
  // Persistencia localStorage
  // =====================================================
  function _guardarEnStorage() {
    try {
      var data = {
        items:     _items,
        cliente:   _cliente,
        membresia: _membresia,
        entrega:   _entrega,
        paso:      _pasoActual
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('ECSA Carrito: No se pudo guardar en localStorage.', e);
    }
  }

  function _cargarDesdeStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        _items     = data.items || [];
        _cliente   = data.cliente || null;
        _membresia = data.membresia || 'none';
        _entrega   = data.entrega || null;
        _pasoActual = data.paso || 1;
      }
    } catch (e) {
      console.warn('ECSA Carrito: Error al leer localStorage.', e);
      _items = [];
    }
  }

  // =====================================================
  // Listeners de cambios
  // =====================================================
  function onChange(callback) {
    _listeners.push(callback);
    callback(_getEstado());
    return function () {
      var idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  function _notificar() {
    _guardarEnStorage();
    var estado = _getEstado();
    _listeners.forEach(function (cb) { cb(estado); });
  }

  function _getEstado() {
    var calc = calcularTotales();
    return {
      items:       _items.slice(),
      cantidad:    obtenerCantidadTotal(),
      subtotal:    calc.subtotal,
      descuento:   calc.descuento,
      impuesto:    calc.impuesto,
      total:       calc.total,
      membresia:   _membresia,
      cliente:     _cliente,
      entrega:     _entrega,
      paso:        _pasoActual,
      sidebarAbierto: _sidebarAbierto
    };
  }

  // =====================================================
  // Operaciones del carrito
  // =====================================================

  /**
   * Agregar producto al carrito.
   * @param {Object} producto - debe tener id, name, price, stock
   * @param {number} [cantidad=1]
   */
  function agregarItem(producto, cantidad) {
    cantidad = parseInt(cantidad, 10) || 1;
    if (cantidad < 1) return;

    var existente = _items.find(function (item) { return item.productoId === producto.id; });

    if (existente) {
      var nuevaCant = existente.quantity + cantidad;
      if (producto.stock !== undefined && nuevaCant > producto.stock) {
        throw new Error('Stock insuficiente. Disponible: ' + producto.stock);
      }
      existente.quantity = nuevaCant;
    } else {
      if (producto.stock !== undefined && cantidad > producto.stock) {
        throw new Error('Stock insuficiente. Disponible: ' + producto.stock);
      }
      _items.push({
        productoId:  producto.id,
        name:        producto.name,
        price:       parseFloat(producto.price) || 0,
        cost:        parseFloat(producto.cost) || 0,
        quantity:    cantidad,
        stock:       producto.stock,
        sku:         producto.sku || '',
        image:       (producto.images && producto.images[0]) || '',
        unit:        producto.unit || 'unidad',
        department:  producto.department || ''
      });
    }

    _notificar();
  }

  /**
   * Remover item del carrito.
   * @param {string} productoId
   */
  function removerItem(productoId) {
    _items = _items.filter(function (item) { return item.productoId !== productoId; });
    _notificar();
  }

  /**
   * Actualizar cantidad de un item.
   * @param {string} productoId
   * @param {number} cantidad
   */
  function actualizarCantidad(productoId, cantidad) {
    cantidad = parseInt(cantidad, 10);
    if (cantidad < 1) {
      removerItem(productoId);
      return;
    }

    var item = _items.find(function (i) { return i.productoId === productoId; });
    if (!item) return;

    if (item.stock !== undefined && cantidad > item.stock) {
      throw new Error('Stock insuficiente. Disponible: ' + item.stock);
    }

    item.quantity = cantidad;
    _notificar();
  }

  /**
   * Incrementar cantidad.
   * @param {string} productoId
   */
  function incrementar(productoId) {
    var item = _items.find(function (i) { return i.productoId === productoId; });
    if (item) actualizarCantidad(productoId, item.quantity + 1);
  }

  /**
   * Decrementar cantidad.
   * @param {string} productoId
   */
  function decrementar(productoId) {
    var item = _items.find(function (i) { return i.productoId === productoId; });
    if (item) actualizarCantidad(productoId, item.quantity - 1);
  }

  /**
   * Vaciar carrito.
   */
  function vaciar() {
    _items = [];
    _cliente = null;
    _membresia = 'none';
    _entrega = null;
    _pasoActual = 1;
    _notificar();
  }

  /**
   * Obtener items del carrito.
   * @returns {Array}
   */
  function obtenerItems() {
    return _items.slice();
  }

  /**
   * Obtener cantidad total de items.
   * @returns {number}
   */
  function obtenerCantidadTotal() {
    return _items.reduce(function (sum, item) { return sum + item.quantity; }, 0);
  }

  /**
   * Verificar si el carrito esta vacio.
   * @returns {boolean}
   */
  function estaVacio() {
    return _items.length === 0;
  }

  // =====================================================
  // Calculos
  // =====================================================

  /**
   * Establecer membresia para descuento.
   * @param {string} tipo - none, platinium, gold, premium
   */
  function setMembresia(tipo) {
    _membresia = DESCUENTOS_MEMBRESIA[tipo] ? tipo : 'none';
    _notificar();
  }

  /**
   * Calcular subtotal, descuento, impuesto y total.
   * @returns {Object} { subtotal, descuentoPorcentaje, descuento, subtotalConDescuento, impuesto, total }
   */
  function calcularTotales() {
    var subtotal = _items.reduce(function (sum, item) {
      return sum + (item.price * item.quantity);
    }, 0);

    var descuentoPct = DESCUENTOS_MEMBRESIA[_membresia] ? DESCUENTOS_MEMBRESIA[_membresia].porcentaje : 0;
    var descuento = subtotal * descuentoPct;
    var subtotalConDescuento = subtotal - descuento;
    var impuesto = subtotalConDescuento * ITBMS_RATE;
    var total = subtotalConDescuento + impuesto;

    return {
      subtotal:              parseFloat(subtotal.toFixed(2)),
      descuentoPorcentaje:   descuentoPct,
      descuentoNombre:       DESCUENTOS_MEMBRESIA[_membresia] ? DESCUENTOS_MEMBRESIA[_membresia].nombre : '',
      descuento:             parseFloat(descuento.toFixed(2)),
      subtotalConDescuento:  parseFloat(subtotalConDescuento.toFixed(2)),
      impuesto:              parseFloat(impuesto.toFixed(2)),
      total:                 parseFloat(total.toFixed(2))
    };
  }

  // =====================================================
  // Sidebar toggle
  // =====================================================

  function toggleSidebar() {
    _sidebarAbierto = !_sidebarAbierto;
    _notificar();
    _actualizarSidebarDOM();
  }

  function abrirSidebar() {
    _sidebarAbierto = true;
    _notificar();
    _actualizarSidebarDOM();
  }

  function cerrarSidebar() {
    _sidebarAbierto = false;
    _notificar();
    _actualizarSidebarDOM();
  }

  function _actualizarSidebarDOM() {
    var sidebar = document.getElementById('carrito-sidebar');
    var overlay = document.getElementById('carrito-overlay');
    if (sidebar) {
      sidebar.classList.toggle('abierto', _sidebarAbierto);
    }
    if (overlay) {
      overlay.classList.toggle('activo', _sidebarAbierto);
    }
  }

  /**
   * Actualizar badge del carrito en el header.
   */
  function actualizarBadge() {
    var badge = document.getElementById('carrito-badge');
    if (badge) {
      var cant = obtenerCantidadTotal();
      badge.textContent = cant;
      badge.style.display = cant > 0 ? 'inline-flex' : 'none';
    }
  }

  // =====================================================
  // Checkout: flujo de 4 pasos
  // =====================================================

  /**
   * Ir a un paso del checkout.
   * @param {number} paso - 1 a 4
   */
  function irAPaso(paso) {
    if (paso < 1 || paso > 4) return;
    _pasoActual = paso;
    _notificar();
  }

  function obtenerPaso() {
    return _pasoActual;
  }

  /**
   * Paso 1: Guardar datos del cliente.
   * @param {Object} datos - { nombre, telefono, email, cedulaRUC }
   */
  function setDatosCliente(datos) {
    if (!datos.nombre || !datos.nombre.trim()) {
      throw new Error('El nombre es requerido.');
    }
    if (!datos.telefono || !datos.telefono.trim()) {
      throw new Error('El telefono es requerido.');
    }

    _cliente = {
      nombre:    datos.nombre.trim(),
      telefono:  datos.telefono.trim(),
      email:     (datos.email || '').trim(),
      cedulaRUC: (datos.cedulaRUC || '').trim()
    };

    // Si el cliente esta autenticado y tiene membresia, aplicarla
    if (datos.membresia) {
      setMembresia(datos.membresia);
    }

    _pasoActual = 2;
    _notificar();
  }

  /**
   * Paso 2: Guardar datos de entrega.
   * @param {Object} datos - { tipo: 'pickup'|'delivery', direccion, ciudad, referencia }
   */
  function setEntrega(datos) {
    if (!datos.tipo) {
      throw new Error('Seleccione un tipo de entrega.');
    }
    if (datos.tipo === 'delivery' && (!datos.direccion || !datos.direccion.trim())) {
      throw new Error('La direccion de entrega es requerida.');
    }

    _entrega = {
      tipo:       datos.tipo,
      direccion:  datos.tipo === 'delivery' ? datos.direccion.trim() : 'Retiro en tienda',
      ciudad:     (datos.ciudad || '').trim(),
      referencia: (datos.referencia || '').trim()
    };

    _pasoActual = 3;
    _notificar();
  }

  /**
   * Paso 3: Ya se maneja externamente con el modulo de Pagos.
   * Esta funcion avanza al paso 4 tras el pago exitoso.
   * @param {Object} pagoInfo - resultado del modulo de Pagos
   */
  function confirmarPago(pagoInfo) {
    _pasoActual = 4;
    _notificar();
    return pagoInfo;
  }

  /**
   * Paso 4: Crear orden en Firebase y generar confirmacion.
   * @param {Object} pagoInfo - info del pago procesado
   * @returns {Promise<Object>} orden creada
   */
  async function crearOrden(pagoInfo) {
    if (estaVacio()) throw new Error('El carrito esta vacio.');
    if (!_cliente)   throw new Error('No se han ingresado datos del cliente.');
    if (!_entrega)   throw new Error('No se ha seleccionado tipo de entrega.');

    var totales = calcularTotales();

    var orden = {
      // Cliente
      clienteNombre:    _cliente.nombre,
      clienteTelefono:  _cliente.telefono,
      clienteEmail:     _cliente.email,
      clienteCedulaRUC: _cliente.cedulaRUC,

      // Items
      items: _items.map(function (item) {
        return {
          productoId: item.productoId,
          name:       item.name,
          sku:        item.sku,
          price:      item.price,
          cost:       item.cost,
          quantity:   item.quantity,
          unit:       item.unit,
          department: item.department,
          subtotal:   parseFloat((item.price * item.quantity).toFixed(2))
        };
      }),

      // Totales
      subtotal:    totales.subtotal,
      descuento:   totales.descuento,
      membresia:   _membresia,
      impuesto:    totales.impuesto,
      total:       totales.total,

      // Entrega
      tipoEntrega: _entrega.tipo,
      direccion:   _entrega.direccion,
      ciudad:      _entrega.ciudad || '',
      referencia:  _entrega.referencia || '',

      // Pago
      pagoMetodo:     pagoInfo ? pagoInfo.metodo : '',
      pagoReferencia: pagoInfo ? pagoInfo.referencia : '',
      pagoEstado:     pagoInfo ? pagoInfo.estado : 'pending',

      // Estado
      estado:       'procesando',
      numeroOrden:  _generarNumeroOrden(),
      fecha:        new Date().toISOString()
    };

    // Guardar en Firebase
    if (FB) {
      var id = await FB.addDocument(ORDERS_COLLECTION, orden);
      orden.id = id;

      // Descontar stock
      if (window.ECSA.Inventario) {
        for (var i = 0; i < _items.length; i++) {
          try {
            await window.ECSA.Inventario.descontarPorVenta(
              _items[i].productoId,
              _items[i].quantity,
              id
            );
          } catch (e) {
            console.warn('Error al descontar stock:', e);
          }
        }
      }
    }

    // Limpiar carrito despues de crear orden
    var ordenFinal = Object.assign({}, orden);
    vaciar();

    return ordenFinal;
  }

  // =====================================================
  // WhatsApp
  // =====================================================

  /**
   * Generar enlace de WhatsApp con resumen del pedido.
   * @param {Object} orden
   * @returns {string} URL de WhatsApp
   */
  function generarWhatsAppLink(orden) {
    var msg = 'Hola Empresas Centrales SA!\n\n';
    msg += 'Nuevo pedido #' + orden.numeroOrden + '\n';
    msg += '---\n';

    var items = orden.items || [];
    items.forEach(function (item) {
      msg += item.quantity + 'x ' + item.name + ' - $' + item.subtotal.toFixed(2) + '\n';
    });

    msg += '---\n';
    msg += 'Subtotal: $' + orden.subtotal.toFixed(2) + '\n';
    if (orden.descuento > 0) {
      msg += 'Descuento: -$' + orden.descuento.toFixed(2) + '\n';
    }
    msg += 'ITBMS: $' + orden.impuesto.toFixed(2) + '\n';
    msg += 'TOTAL: $' + orden.total.toFixed(2) + '\n\n';

    msg += 'Cliente: ' + orden.clienteNombre + '\n';
    msg += 'Tel: ' + orden.clienteTelefono + '\n';
    msg += 'Entrega: ' + (orden.tipoEntrega === 'delivery' ? 'Delivery - ' + orden.direccion : 'Retiro en tienda') + '\n';
    msg += 'Pago: ' + (orden.pagoMetodo || 'Por confirmar') + '\n';
    msg += 'Ref: ' + (orden.pagoReferencia || 'N/A') + '\n';

    var encoded = encodeURIComponent(msg);
    return 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encoded;
  }

  /**
   * Enviar notificacion por WhatsApp (abre en nueva ventana).
   * @param {Object} orden
   */
  function enviarWhatsApp(orden) {
    var url = generarWhatsAppLink(orden);
    window.open(url, '_blank');
  }

  // =====================================================
  // Utilidades
  // =====================================================

  function _generarNumeroOrden() {
    var now = new Date();
    var date = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    var seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return 'ORD-' + date + '-' + seq;
  }

  /**
   * Obtener resumen del checkout (para mostrar en paso 4).
   * @param {Object} orden
   * @returns {Object}
   */
  function obtenerResumenCheckout(orden) {
    return {
      numeroOrden:    orden.numeroOrden,
      fecha:          new Date(orden.fecha).toLocaleDateString('es-PA', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      }),
      cliente:        orden.clienteNombre,
      items:          orden.items,
      subtotal:       orden.subtotal,
      descuento:      orden.descuento,
      impuesto:       orden.impuesto,
      total:          orden.total,
      entrega:        orden.tipoEntrega === 'delivery'
                        ? 'Delivery: ' + orden.direccion
                        : 'Retiro en tienda',
      pago:           orden.pagoMetodo,
      pagoReferencia: orden.pagoReferencia,
      whatsappLink:   generarWhatsAppLink(orden)
    };
  }

  // ---- Exportar modulo ----
  window.ECSA.Carrito = {
    ITBMS_RATE:             ITBMS_RATE,
    DESCUENTOS_MEMBRESIA:   DESCUENTOS_MEMBRESIA,
    init:                   init,
    onChange:               onChange,
    agregarItem:            agregarItem,
    removerItem:            removerItem,
    actualizarCantidad:     actualizarCantidad,
    incrementar:            incrementar,
    decrementar:            decrementar,
    vaciar:                 vaciar,
    obtenerItems:           obtenerItems,
    obtenerCantidadTotal:   obtenerCantidadTotal,
    estaVacio:              estaVacio,
    setMembresia:           setMembresia,
    calcularTotales:        calcularTotales,
    toggleSidebar:          toggleSidebar,
    abrirSidebar:           abrirSidebar,
    cerrarSidebar:          cerrarSidebar,
    actualizarBadge:        actualizarBadge,
    irAPaso:                irAPaso,
    obtenerPaso:            obtenerPaso,
    setDatosCliente:        setDatosCliente,
    setEntrega:             setEntrega,
    confirmarPago:          confirmarPago,
    crearOrden:             crearOrden,
    generarWhatsAppLink:    generarWhatsAppLink,
    enviarWhatsApp:         enviarWhatsApp,
    obtenerResumenCheckout: obtenerResumenCheckout
  };

  console.log('ECSA Carrito cargado.');
})();
