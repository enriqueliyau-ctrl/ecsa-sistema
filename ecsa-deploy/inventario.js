/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Modulo de Inventario
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  var FB = null; // se asigna en init()

  // ---- Constantes ----
  var COLLECTION = 'productos';
  var MOVEMENTS_COLLECTION = 'movimientos_inventario';

  var DEPARTAMENTOS = [
    'PVC Interiores',
    'Construccion y Materiales',
    'Herramientas y Ferreteria',
    'Ventanas y Puertas',
    'Pisos y Revestimientos',
    'Electrico y Plomeria',
    'Pintura',
    'Cabinas de Ducha'
  ];

  var UNIDADES = [
    'unidad',
    'metro',
    'galon',
    'caja',
    'rollo',
    'bolsa',
    'par',
    'juego',
    'libra',
    'pie',
    'litro',
    'pulgada'
  ];

  // Estado local
  var _productos = [];
  var _unsubscribe = null;
  var _listeners = [];

  // =====================================================
  // Estructura de producto
  // =====================================================
  function crearProducto(data) {
    return {
      name:        data.name        || '',
      department:  data.department  || DEPARTAMENTOS[0],
      description: data.description || '',
      price:       parseFloat(data.price)   || 0,
      cost:        parseFloat(data.cost)    || 0,
      stock:       parseInt(data.stock, 10) || 0,
      minStock:    parseInt(data.minStock, 10) || 5,
      sku:         data.sku         || '',
      images:      data.images      || [],
      unit:        data.unit        || 'unidad',
      featured:    !!data.featured,
      active:      data.active !== undefined ? !!data.active : true
    };
  }

  // =====================================================
  // Inicializar modulo
  // =====================================================
  function init() {
    FB = window.ECSA.Firebase;
    if (!FB) {
      console.error('ECSA Inventario: Firebase no esta inicializado.');
      return;
    }
    _startRealTimeSync();
  }

  // =====================================================
  // Sincronizacion en tiempo real
  // =====================================================
  function _startRealTimeSync() {
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = FB.onSnapshotListener(COLLECTION, function (docs) {
      _productos = docs;
      _notifyListeners();
    }, { orderBy: 'name' });
  }

  function onChange(callback) {
    _listeners.push(callback);
    if (_productos.length) callback(_productos);
    return function () {
      var idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  function _notifyListeners() {
    _listeners.forEach(function (cb) { cb(_productos); });
  }

  // =====================================================
  // CRUD
  // =====================================================

  /**
   * Agregar producto.
   * @param {Object} data
   * @returns {Promise<string>}
   */
  async function agregarProducto(data) {
    var producto = crearProducto(data);

    if (!producto.name) throw new Error('El nombre del producto es requerido.');
    if (!producto.sku) {
      producto.sku = _generarSKU(producto.department, producto.name);
    }

    // Verificar SKU unico
    var existente = await buscarPorSKU(producto.sku);
    if (existente) throw new Error('Ya existe un producto con el SKU: ' + producto.sku);

    var id = await FB.addDocument(COLLECTION, producto);

    // Registrar movimiento inicial de stock
    if (producto.stock > 0) {
      await _registrarMovimiento(id, 'entrada', producto.stock, 'Stock inicial');
    }

    return id;
  }

  /**
   * Editar producto.
   * @param {string} id
   * @param {Object} data - campos a actualizar
   * @returns {Promise<void>}
   */
  async function editarProducto(id, data) {
    var current = await FB.getDocument(COLLECTION, id);
    if (!current) throw new Error('Producto no encontrado.');

    var updates = {};
    var campos = ['name','department','description','price','cost','minStock','sku','images','unit','featured','active'];
    campos.forEach(function (key) {
      if (data[key] !== undefined) updates[key] = data[key];
    });

    // Si cambia el stock, registrar movimiento
    if (data.stock !== undefined && data.stock !== current.stock) {
      var diff = data.stock - current.stock;
      var tipo = diff > 0 ? 'entrada' : 'salida';
      updates.stock = parseInt(data.stock, 10);
      await _registrarMovimiento(id, tipo, Math.abs(diff), data.motivo || 'Ajuste manual');
    }

    await FB.updateDocument(COLLECTION, id, updates);
  }

  /**
   * Eliminar producto (soft delete: marca como inactivo).
   * @param {string} id
   * @param {boolean} [hardDelete=false]
   * @returns {Promise<void>}
   */
  async function eliminarProducto(id, hardDelete) {
    if (hardDelete) {
      await FB.deleteDocument(COLLECTION, id);
    } else {
      await FB.updateDocument(COLLECTION, id, { active: false });
    }
  }

  /**
   * Obtener producto por ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function obtenerProducto(id) {
    return await FB.getDocument(COLLECTION, id);
  }

  /**
   * Obtener todos los productos (cache local).
   * @param {boolean} [soloActivos=true]
   * @returns {Array}
   */
  function obtenerTodos(soloActivos) {
    if (soloActivos === undefined) soloActivos = true;
    if (soloActivos) {
      return _productos.filter(function (p) { return p.active !== false; });
    }
    return _productos.slice();
  }

  // =====================================================
  // Busqueda y filtros
  // =====================================================

  /**
   * Buscar productos por texto.
   * @param {string} query
   * @returns {Array}
   */
  function buscar(query) {
    if (!query) return obtenerTodos();
    var q = query.toLowerCase().trim();
    return obtenerTodos().filter(function (p) {
      return (p.name && p.name.toLowerCase().indexOf(q) !== -1) ||
             (p.sku && p.sku.toLowerCase().indexOf(q) !== -1) ||
             (p.description && p.description.toLowerCase().indexOf(q) !== -1);
    });
  }

  /**
   * Filtrar por departamento.
   * @param {string} departamento
   * @returns {Array}
   */
  function filtrarPorDepartamento(departamento) {
    if (!departamento || departamento === 'todos') return obtenerTodos();
    return obtenerTodos().filter(function (p) {
      return p.department === departamento;
    });
  }

  /**
   * Buscar por SKU (exacto).
   * @param {string} sku
   * @returns {Promise<Object|null>}
   */
  async function buscarPorSKU(sku) {
    // Primero buscar en cache local
    var local = _productos.find(function (p) { return p.sku === sku; });
    if (local) return local;

    // Si no esta en cache, buscar en Firestore
    var snap = await FB.db.collection(COLLECTION).where('sku', '==', sku).limit(1).get();
    if (snap.empty) return null;
    var doc = snap.docs[0];
    return Object.assign({ id: doc.id }, doc.data());
  }

  /**
   * Buscar por codigo de barras (alias de SKU).
   * @param {string} barcode
   * @returns {Promise<Object|null>}
   */
  async function buscarPorBarcode(barcode) {
    return await buscarPorSKU(barcode);
  }

  // =====================================================
  // Control de stock
  // =====================================================

  /**
   * Ajustar stock (sumar o restar).
   * @param {string} productoId
   * @param {number} cantidad - positivo para entrada, negativo para salida
   * @param {string} motivo
   * @returns {Promise<void>}
   */
  async function ajustarStock(productoId, cantidad, motivo) {
    var producto = await FB.getDocument(COLLECTION, productoId);
    if (!producto) throw new Error('Producto no encontrado.');

    var nuevoStock = producto.stock + cantidad;
    if (nuevoStock < 0) throw new Error('Stock insuficiente. Disponible: ' + producto.stock);

    await FB.updateDocument(COLLECTION, productoId, { stock: nuevoStock });

    var tipo = cantidad > 0 ? 'entrada' : 'salida';
    await _registrarMovimiento(productoId, tipo, Math.abs(cantidad), motivo || 'Ajuste de inventario');
  }

  /**
   * Descontar stock por venta.
   * @param {string} productoId
   * @param {number} cantidad
   * @param {string} orderId
   * @returns {Promise<void>}
   */
  async function descontarPorVenta(productoId, cantidad, orderId) {
    await ajustarStock(productoId, -cantidad, 'Venta - Orden: ' + (orderId || 'N/A'));
  }

  /**
   * Obtener productos con stock bajo.
   * @returns {Array}
   */
  function obtenerStockBajo() {
    return obtenerTodos().filter(function (p) {
      return p.stock <= (p.minStock || 5);
    });
  }

  /**
   * Obtener productos sin stock.
   * @returns {Array}
   */
  function obtenerSinStock() {
    return obtenerTodos().filter(function (p) {
      return p.stock <= 0;
    });
  }

  // =====================================================
  // Movimientos de inventario
  // =====================================================

  async function _registrarMovimiento(productoId, tipo, cantidad, motivo) {
    await FB.addDocument(MOVEMENTS_COLLECTION, {
      productoId: productoId,
      tipo:       tipo,       // 'entrada' | 'salida'
      cantidad:   cantidad,
      motivo:     motivo || '',
      fecha:      new Date().toISOString()
    });
  }

  /**
   * Obtener historial de movimientos de un producto.
   * @param {string} productoId
   * @returns {Promise<Array>}
   */
  async function obtenerMovimientos(productoId) {
    var snap = await FB.db.collection(MOVEMENTS_COLLECTION)
      .where('productoId', '==', productoId)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
  }

  // =====================================================
  // Importar / Exportar CSV
  // =====================================================

  /**
   * Exportar productos a CSV y descargar.
   * @param {Array} [productos] - si no se pasa, exporta todos
   */
  function exportarCSV(productos) {
    var data = productos || obtenerTodos(false);
    var headers = ['id','name','department','description','price','cost','stock','minStock','sku','unit','featured','active'];
    var rows = [headers.join(',')];

    data.forEach(function (p) {
      var row = headers.map(function (h) {
        var val = p[h] !== undefined ? p[h] : '';
        // Escapar comas y comillas
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
    a.download = 'inventario_ecsa_' + _fechaArchivo() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Importar productos desde archivo CSV.
   * @param {File} file
   * @returns {Promise<{imported: number, errors: Array}>}
   */
  async function importarCSV(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = async function (e) {
        try {
          var text = e.target.result;
          var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
          if (lines.length < 2) {
            return resolve({ imported: 0, errors: ['Archivo vacio o sin datos.'] });
          }

          var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
          var imported = 0;
          var errors = [];

          for (var i = 1; i < lines.length; i++) {
            try {
              var values = _parseCSVLine(lines[i]);
              var obj = {};
              headers.forEach(function (h, idx) {
                obj[h] = values[idx] || '';
              });

              // Convertir tipos
              obj.price    = parseFloat(obj.price) || 0;
              obj.cost     = parseFloat(obj.cost) || 0;
              obj.stock    = parseInt(obj.stock, 10) || 0;
              obj.minStock = parseInt(obj.minStock, 10) || 5;
              obj.featured = obj.featured === 'true' || obj.featured === '1';
              obj.active   = obj.active !== 'false' && obj.active !== '0';

              await agregarProducto(obj);
              imported++;
            } catch (err) {
              errors.push('Fila ' + (i + 1) + ': ' + err.message);
            }
          }

          resolve({ imported: imported, errors: errors });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Error al leer el archivo.')); };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function _parseCSVLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  // =====================================================
  // Utilidades
  // =====================================================

  function _generarSKU(department, name) {
    var depCode = {
      'PVC Interiores':          'PVC',
      'Construccion y Materiales': 'CON',
      'Herramientas y Ferreteria': 'HER',
      'Ventanas y Puertas':      'VYP',
      'Pisos y Revestimientos':  'PIR',
      'Electrico y Plomeria':    'ELP',
      'Pintura':                 'PIN',
      'Cabinas de Ducha':        'CAB'
    };
    var prefix = depCode[department] || 'GEN';
    var suffix = Date.now().toString(36).toUpperCase().slice(-5);
    return prefix + '-' + suffix;
  }

  function _fechaArchivo() {
    var d = new Date();
    return d.getFullYear() + '' +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
  }

  /**
   * Subir imagen de producto.
   * @param {string} productoId
   * @param {File} file
   * @returns {Promise<string>} URL de la imagen
   */
  async function subirImagen(productoId, file) {
    var path = 'productos/' + productoId + '/' + Date.now() + '_' + file.name;
    var url = await FB.uploadFile(file, path);

    var producto = await FB.getDocument(COLLECTION, productoId);
    var images = producto.images || [];
    images.push(url);
    await FB.updateDocument(COLLECTION, productoId, { images: images });

    return url;
  }

  function destroy() {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    _listeners = [];
    _productos = [];
  }

  // ---- Exportar modulo ----
  window.ECSA.Inventario = {
    DEPARTAMENTOS:        DEPARTAMENTOS,
    UNIDADES:             UNIDADES,
    init:                 init,
    destroy:              destroy,
    onChange:              onChange,
    agregarProducto:      agregarProducto,
    editarProducto:       editarProducto,
    eliminarProducto:     eliminarProducto,
    obtenerProducto:      obtenerProducto,
    obtenerTodos:         obtenerTodos,
    buscar:               buscar,
    filtrarPorDepartamento: filtrarPorDepartamento,
    buscarPorSKU:         buscarPorSKU,
    buscarPorBarcode:     buscarPorBarcode,
    ajustarStock:         ajustarStock,
    descontarPorVenta:    descontarPorVenta,
    obtenerStockBajo:     obtenerStockBajo,
    obtenerSinStock:      obtenerSinStock,
    obtenerMovimientos:   obtenerMovimientos,
    subirImagen:          subirImagen,
    exportarCSV:          exportarCSV,
    importarCSV:          importarCSV
  };

  console.log('ECSA Inventario cargado.');
})();
