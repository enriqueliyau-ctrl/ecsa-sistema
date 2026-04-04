/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Modulo de Clientes
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  var FB = null;
  var COLLECTION = 'clientes';
  var ORDERS_COLLECTION = 'ordenes';

  // ---- Tipos de membresia ----
  var MEMBRESIAS = {
    none: {
      id:          'none',
      nombre:      'Sin membresia',
      precio:      0,
      descuento:   0,
      descripcion: 'Sin beneficios de membresia'
    },
    platinium: {
      id:          'platinium',
      nombre:      'Platinium',
      precio:      19.99,
      descuento:   0.02,
      descripcion: '2% de descuento en todas las compras'
    },
    gold: {
      id:          'gold',
      nombre:      'Gold',
      precio:      49.99,
      descuento:   0.05,
      descripcion: '5% de descuento en todas las compras'
    },
    premium: {
      id:          'premium',
      nombre:      'Premium',
      precio:      99.99,
      descuento:   0.10,
      descripcion: '10% de descuento en todas las compras'
    }
  };

  // ---- Estado ----
  var _clienteActual = null;
  var _listeners = [];

  // =====================================================
  // Inicializar
  // =====================================================
  function init() {
    FB = window.ECSA.Firebase;
    if (!FB) {
      console.error('ECSA Clientes: Firebase no esta inicializado.');
      return;
    }
    // Escuchar cambios de autenticacion
    FB.auth.onAuthStateChanged(function (user) {
      if (user) {
        _cargarPerfilCliente(user.uid);
      } else {
        _clienteActual = null;
        _notificar();
      }
    });
  }

  function onChange(callback) {
    _listeners.push(callback);
    callback(_clienteActual);
    return function () {
      var idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  function _notificar() {
    _listeners.forEach(function (cb) { cb(_clienteActual); });
  }

  // =====================================================
  // Autenticacion
  // =====================================================

  /**
   * Registrar nuevo cliente.
   * @param {Object} datos - { nombre, email, password, cedulaRUC, telefono, direccion, membresia }
   * @returns {Promise<Object>} cliente creado
   */
  async function registrar(datos) {
    if (!datos.email || !datos.password) {
      throw new Error('Email y contrasena son requeridos.');
    }
    if (datos.password.length < 6) {
      throw new Error('La contrasena debe tener al menos 6 caracteres.');
    }
    if (!datos.nombre || !datos.nombre.trim()) {
      throw new Error('El nombre es requerido.');
    }

    // Crear usuario en Firebase Auth
    var cred = await FB.auth.createUserWithEmailAndPassword(datos.email, datos.password);
    var uid = cred.user.uid;

    // Actualizar displayName
    await cred.user.updateProfile({ displayName: datos.nombre.trim() });

    // Crear perfil en Firestore
    var perfil = {
      uid:             uid,
      nombre:          datos.nombre.trim(),
      email:           datos.email.trim(),
      cedulaRUC:       (datos.cedulaRUC || '').trim(),
      telefono:        (datos.telefono || '').trim(),
      direccion:       (datos.direccion || '').trim(),
      membresia:       datos.membresia || 'none',
      membresiaInicio: null,
      membresiaFin:    null,
      activo:          true
    };

    // Si selecciono membresia, establecer fechas
    if (perfil.membresia !== 'none') {
      var ahora = new Date();
      perfil.membresiaInicio = ahora.toISOString();
      var fin = new Date(ahora);
      fin.setFullYear(fin.getFullYear() + 1);
      perfil.membresiaFin = fin.toISOString();
    }

    await FB.db.collection(COLLECTION).doc(uid).set(
      Object.assign(perfil, {
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      })
    );

    _clienteActual = Object.assign({ id: uid }, perfil);
    _notificar();

    return _clienteActual;
  }

  /**
   * Iniciar sesion.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} cliente
   */
  async function login(email, password) {
    if (!email || !password) {
      throw new Error('Email y contrasena son requeridos.');
    }

    var cred = await FB.auth.signInWithEmailAndPassword(email, password);
    var cliente = await _cargarPerfilCliente(cred.user.uid);
    return cliente;
  }

  /**
   * Cerrar sesion.
   * @returns {Promise<void>}
   */
  async function logout() {
    await FB.auth.signOut();
    _clienteActual = null;
    _notificar();
  }

  /**
   * Restablecer contrasena.
   * @param {string} email
   * @returns {Promise<void>}
   */
  async function restablecerPassword(email) {
    if (!email) throw new Error('El email es requerido.');
    await FB.auth.sendPasswordResetEmail(email);
  }

  /**
   * Obtener cliente autenticado actual.
   * @returns {Object|null}
   */
  function obtenerClienteActual() {
    return _clienteActual;
  }

  /**
   * Verificar si hay sesion activa.
   * @returns {boolean}
   */
  function estaAutenticado() {
    return _clienteActual !== null && FB.auth.currentUser !== null;
  }

  // =====================================================
  // Perfil de cliente
  // =====================================================

  async function _cargarPerfilCliente(uid) {
    try {
      var doc = await FB.db.collection(COLLECTION).doc(uid).get();
      if (doc.exists) {
        _clienteActual = Object.assign({ id: doc.id }, doc.data());

        // Verificar expiracion de membresia
        _verificarExpiracionMembresia();

        _notificar();
        return _clienteActual;
      }
      return null;
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      return null;
    }
  }

  /**
   * Actualizar perfil del cliente.
   * @param {string} clienteId
   * @param {Object} datos
   * @returns {Promise<void>}
   */
  async function actualizarPerfil(clienteId, datos) {
    var updates = {};
    var camposPermitidos = ['nombre', 'telefono', 'direccion', 'cedulaRUC'];
    camposPermitidos.forEach(function (campo) {
      if (datos[campo] !== undefined) updates[campo] = datos[campo];
    });

    updates.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await FB.db.collection(COLLECTION).doc(clienteId).update(updates);

    if (_clienteActual && _clienteActual.id === clienteId) {
      Object.assign(_clienteActual, updates);
      _notificar();
    }
  }

  /**
   * Obtener cliente por ID.
   * @param {string} clienteId
   * @returns {Promise<Object|null>}
   */
  async function obtenerCliente(clienteId) {
    var doc = await FB.db.collection(COLLECTION).doc(clienteId).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
  }

  /**
   * Eliminar cliente (soft delete).
   * @param {string} clienteId
   * @returns {Promise<void>}
   */
  async function eliminarCliente(clienteId) {
    await FB.db.collection(COLLECTION).doc(clienteId).update({
      activo: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // =====================================================
  // Membresias
  // =====================================================

  /**
   * Activar o cambiar membresia.
   * @param {string} clienteId
   * @param {string} tipoMembresia - platinium, gold, premium
   * @returns {Promise<Object>} datos de membresia
   */
  async function activarMembresia(clienteId, tipoMembresia) {
    var membresia = MEMBRESIAS[tipoMembresia];
    if (!membresia || tipoMembresia === 'none') {
      throw new Error('Tipo de membresia invalido.');
    }

    var ahora = new Date();
    var fin = new Date(ahora);
    fin.setFullYear(fin.getFullYear() + 1);

    var datos = {
      membresia:       tipoMembresia,
      membresiaInicio: ahora.toISOString(),
      membresiaFin:    fin.toISOString(),
      updatedAt:       firebase.firestore.FieldValue.serverTimestamp()
    };

    await FB.db.collection(COLLECTION).doc(clienteId).update(datos);

    if (_clienteActual && _clienteActual.id === clienteId) {
      Object.assign(_clienteActual, datos);
      _notificar();
    }

    return {
      tipo:   tipoMembresia,
      nombre: membresia.nombre,
      precio: membresia.precio,
      inicio: ahora.toISOString(),
      fin:    fin.toISOString()
    };
  }

  /**
   * Cancelar membresia.
   * @param {string} clienteId
   * @returns {Promise<void>}
   */
  async function cancelarMembresia(clienteId) {
    await FB.db.collection(COLLECTION).doc(clienteId).update({
      membresia:       'none',
      membresiaInicio: null,
      membresiaFin:    null,
      updatedAt:       firebase.firestore.FieldValue.serverTimestamp()
    });

    if (_clienteActual && _clienteActual.id === clienteId) {
      _clienteActual.membresia = 'none';
      _clienteActual.membresiaInicio = null;
      _clienteActual.membresiaFin = null;
      _notificar();
    }
  }

  /**
   * Verificar si la membresia esta vigente.
   * @param {Object} [cliente]
   * @returns {boolean}
   */
  function membresiaVigente(cliente) {
    var c = cliente || _clienteActual;
    if (!c || c.membresia === 'none' || !c.membresiaFin) return false;
    return new Date(c.membresiaFin) > new Date();
  }

  function _verificarExpiracionMembresia() {
    if (_clienteActual && _clienteActual.membresia !== 'none') {
      if (!membresiaVigente(_clienteActual)) {
        // Membresia expirada, desactivar
        cancelarMembresia(_clienteActual.id).catch(function (e) {
          console.warn('Error al cancelar membresia expirada:', e);
        });
      }
    }
  }

  /**
   * Obtener dias restantes de membresia.
   * @param {Object} [cliente]
   * @returns {number}
   */
  function diasRestantesMembresia(cliente) {
    var c = cliente || _clienteActual;
    if (!c || c.membresia === 'none' || !c.membresiaFin) return 0;
    var fin = new Date(c.membresiaFin);
    var ahora = new Date();
    var diff = fin - ahora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  // =====================================================
  // Historial de compras
  // =====================================================

  /**
   * Obtener historial de compras de un cliente.
   * @param {string} clienteId - puede ser uid o email
   * @returns {Promise<Array>}
   */
  async function obtenerHistorialCompras(clienteId) {
    try {
      // Intentar buscar por email del cliente
      var cliente = await obtenerCliente(clienteId);
      var email = cliente ? cliente.email : '';

      var snap = await FB.db.collection(ORDERS_COLLECTION)
        .where('clienteEmail', '==', email)
        .orderBy('createdAt', 'desc')
        .get();

      return snap.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
    } catch (error) {
      console.error('Error al obtener historial:', error);
      return [];
    }
  }

  /**
   * Obtener total gastado por un cliente.
   * @param {string} clienteId
   * @returns {Promise<number>}
   */
  async function obtenerTotalGastado(clienteId) {
    var compras = await obtenerHistorialCompras(clienteId);
    return compras.reduce(function (sum, orden) {
      return sum + (orden.total || 0);
    }, 0);
  }

  // =====================================================
  // Busqueda y filtros
  // =====================================================

  /**
   * Buscar clientes por texto.
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async function buscarClientes(query) {
    var todos = await FB.getDocuments(COLLECTION, { orderBy: 'nombre' });
    if (!query) return todos.filter(function (c) { return c.activo !== false; });

    var q = query.toLowerCase().trim();
    return todos.filter(function (c) {
      return c.activo !== false && (
        (c.nombre && c.nombre.toLowerCase().indexOf(q) !== -1) ||
        (c.email && c.email.toLowerCase().indexOf(q) !== -1) ||
        (c.cedulaRUC && c.cedulaRUC.indexOf(q) !== -1) ||
        (c.telefono && c.telefono.indexOf(q) !== -1)
      );
    });
  }

  /**
   * Filtrar clientes por tipo de membresia.
   * @param {string} tipoMembresia
   * @returns {Promise<Array>}
   */
  async function filtrarPorMembresia(tipoMembresia) {
    if (!tipoMembresia || tipoMembresia === 'todos') {
      return await buscarClientes('');
    }
    var snap = await FB.db.collection(COLLECTION)
      .where('membresia', '==', tipoMembresia)
      .where('activo', '==', true)
      .get();
    return snap.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
  }

  /**
   * Obtener clientes con membresia por vencer (proximos 30 dias).
   * @returns {Promise<Array>}
   */
  async function obtenerMembresiasPorVencer() {
    var todos = await buscarClientes('');
    var ahora = new Date();
    var limite = new Date(ahora);
    limite.setDate(limite.getDate() + 30);

    return todos.filter(function (c) {
      if (c.membresia === 'none' || !c.membresiaFin) return false;
      var fin = new Date(c.membresiaFin);
      return fin > ahora && fin <= limite;
    });
  }

  // ---- Exportar modulo ----
  window.ECSA.Clientes = {
    MEMBRESIAS:                MEMBRESIAS,
    init:                      init,
    onChange:                   onChange,
    registrar:                 registrar,
    login:                     login,
    logout:                    logout,
    restablecerPassword:       restablecerPassword,
    obtenerClienteActual:      obtenerClienteActual,
    estaAutenticado:           estaAutenticado,
    actualizarPerfil:          actualizarPerfil,
    obtenerCliente:            obtenerCliente,
    eliminarCliente:           eliminarCliente,
    activarMembresia:          activarMembresia,
    cancelarMembresia:         cancelarMembresia,
    membresiaVigente:          membresiaVigente,
    diasRestantesMembresia:    diasRestantesMembresia,
    obtenerHistorialCompras:   obtenerHistorialCompras,
    obtenerTotalGastado:       obtenerTotalGastado,
    buscarClientes:            buscarClientes,
    filtrarPorMembresia:       filtrarPorMembresia,
    obtenerMembresiasPorVencer: obtenerMembresiasPorVencer
  };

  console.log('ECSA Clientes cargado.');
})();
