/**
 * ============================================================
 * ECSA - Empresas Centrales SA
 * Firebase Configuration & Database Helpers
 * ============================================================
 * Detecta file:// y usa autenticacion local con localStorage.
 * En servidor web usa Firebase Auth + Firestore real.
 * ============================================================
 */

(function () {
  'use strict';

  window.ECSA = window.ECSA || {};

  // =====================================================
  // DETECTAR MODO: file:// = LOCAL, http(s):// = FIREBASE
  // =====================================================
  var IS_LOCAL = window.location.protocol === 'file:';

  if (IS_LOCAL) {
    console.log('ECSA: Modo LOCAL detectado (file://). Usando autenticacion localStorage.');
  }

  // =====================================================
  // CONFIGURACION DE FIREBASE
  // =====================================================
  var firebaseConfig = {
    apiKey:            "AIzaSyAYcGaicDXyIF3pE6uwyPQmJOxjtVaats",
    authDomain:        "ecsa-sistema.firebaseapp.com",
    projectId:         "ecsa-sistema",
    storageBucket:     "ecsa-sistema.firebasestorage.app",
    messagingSenderId: "957571690992",
    appId:             "1:957571690992:web:95563ddee8de0b8b2aed35"
  };

  // =====================================================
  // USUARIOS DEMO PARA MODO LOCAL
  // =====================================================
  var LOCAL_USERS = [
    {
      uid: 'local-admin-001',
      email: 'admin@ecsa.com',
      password: 'Ecsa2026!',
      displayName: 'Admin ECSA',
      profile: {
        nombre: 'Admin ECSA', email: 'admin@ecsa.com', rol: 'admin', tipo: 'admin',
        sucursal: 'Principal - Arraijan', activo: true,
        permisos: {
          ver_reportes:true, ver_costos:true, descuentos:true, crear_productos:true,
          ver_bodega:true, devoluciones:true, exportar:true, ver_otros:true,
          cobro_yappy:true, cobro_tarjeta:true, cobro_transferencia:true, cobro_efectivo:true,
          historial_cobros:true, cierre_caja:true
        }
      }
    },
    {
      uid: 'local-vendedor-001',
      email: 'vendedor@ecsa.com',
      password: 'Ecsa2026!',
      displayName: 'Carlos Mendez',
      profile: {
        nombre: 'Carlos Mendez', email: 'vendedor@ecsa.com', rol: 'vendedor', tipo: 'vendedor',
        sucursal: 'Principal - Arraijan', activo: true,
        permisos: {
          ver_reportes:true, ver_costos:false, descuentos:false, crear_productos:false,
          ver_bodega:false, devoluciones:false, exportar:false, ver_otros:false,
          cobro_yappy:true, cobro_tarjeta:true, cobro_transferencia:true, cobro_efectivo:true,
          historial_cobros:true, cierre_caja:false
        }
      }
    },
    {
      uid: 'local-cajero-001',
      email: 'cajero@ecsa.com',
      password: 'Ecsa2026!',
      displayName: 'Maria Torres',
      profile: {
        nombre: 'Maria Torres', email: 'cajero@ecsa.com', rol: 'cajero', tipo: 'cajero',
        sucursal: 'Principal - Arraijan', activo: true,
        permisos: {
          ver_reportes:false, ver_costos:false, descuentos:false, crear_productos:false,
          ver_bodega:false, devoluciones:false, exportar:false, ver_otros:false,
          cobro_yappy:true, cobro_tarjeta:true, cobro_transferencia:true, cobro_efectivo:true,
          historial_cobros:true, cierre_caja:true
        }
      }
    },
    {
      uid: 'local-bodeguero-001',
      email: 'bodeguero@ecsa.com',
      password: 'Ecsa2026!',
      displayName: 'Jose Ruiz',
      profile: {
        nombre: 'Jose Ruiz', email: 'bodeguero@ecsa.com', rol: 'bodeguero', tipo: 'bodeguero',
        sucursal: 'Principal - Arraijan', activo: true,
        permisos: {
          ver_reportes:false, ver_costos:true, descuentos:false, crear_productos:true,
          ver_bodega:true, devoluciones:false, exportar:true, ver_otros:false,
          cobro_yappy:false, cobro_tarjeta:false, cobro_transferencia:false, cobro_efectivo:false,
          historial_cobros:false, cierre_caja:false
        }
      }
    }
  ];

  // =====================================================
  // LOCAL AUTH SYSTEM (file:// mode)
  // Mimics Firebase Auth API using localStorage
  // =====================================================

  var _localAuthListeners = [];
  var _localCurrentUser = null;

  function _localGetStoredSession() {
    try {
      var data = localStorage.getItem('ecsa_local_session');
      return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
  }

  function _localSetSession(user) {
    if (user) {
      localStorage.setItem('ecsa_local_session', JSON.stringify({ uid: user.uid, email: user.email, displayName: user.displayName }));
    } else {
      localStorage.removeItem('ecsa_local_session');
    }
  }

  function _localNotifyAuthListeners(user) {
    _localCurrentUser = user;
    _localAuthListeners.forEach(function(cb) {
      try { cb(user); } catch(e) { console.error('Auth listener error:', e); }
    });
  }

  // LocalAuth object mimics firebase.auth()
  var LocalAuth = {
    currentUser: null,

    signInWithEmailAndPassword: function(email, password) {
      return new Promise(function(resolve, reject) {
        // Also check localStorage for users created via admin panel
        var customUsers = [];
        try {
          var stored = localStorage.getItem('ecsa_local_custom_users');
          if (stored) customUsers = JSON.parse(stored);
        } catch(e) {}

        var allUsers = LOCAL_USERS.concat(customUsers);
        var found = allUsers.find(function(u) { return u.email === email && u.password === password; });

        if (!found) {
          var emailExists = allUsers.find(function(u) { return u.email === email; });
          var err = new Error(emailExists ? 'Contrasena incorrecta' : 'Usuario no encontrado');
          err.code = emailExists ? 'auth/wrong-password' : 'auth/user-not-found';
          reject(err);
          return;
        }
        if (found.profile && found.profile.activo === false) {
          var err2 = new Error('Cuenta desactivada');
          err2.code = 'auth/user-disabled';
          reject(err2);
          return;
        }
        var user = { uid: found.uid, email: found.email, displayName: found.displayName || found.profile.nombre };
        LocalAuth.currentUser = user;
        _localSetSession(user);
        _localNotifyAuthListeners(user);
        resolve({ user: user });
      });
    },

    createUserWithEmailAndPassword: function(email, password) {
      return new Promise(function(resolve, reject) {
        var customUsers = [];
        try {
          var stored = localStorage.getItem('ecsa_local_custom_users');
          if (stored) customUsers = JSON.parse(stored);
        } catch(e) {}

        var allUsers = LOCAL_USERS.concat(customUsers);
        if (allUsers.find(function(u) { return u.email === email; })) {
          var err = new Error('El email ya esta en uso');
          err.code = 'auth/email-already-in-use';
          reject(err);
          return;
        }
        var uid = 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        var newUser = { uid: uid, email: email, password: password, displayName: email.split('@')[0], profile: { nombre: email.split('@')[0], email: email, rol: 'vendedor', activo: true, permisos: {} } };
        customUsers.push(newUser);
        localStorage.setItem('ecsa_local_custom_users', JSON.stringify(customUsers));
        var user = { uid: uid, email: email, displayName: newUser.displayName };
        resolve({ user: user });
      });
    },

    signOut: function() {
      return new Promise(function(resolve) {
        LocalAuth.currentUser = null;
        _localSetSession(null);
        _localNotifyAuthListeners(null);
        resolve();
      });
    },

    onAuthStateChanged: function(callback) {
      _localAuthListeners.push(callback);
      // Fire immediately with current state
      var session = _localGetStoredSession();
      if (session) {
        var user = { uid: session.uid, email: session.email, displayName: session.displayName };
        LocalAuth.currentUser = user;
        setTimeout(function() { callback(user); }, 50);
      } else {
        setTimeout(function() { callback(null); }, 50);
      }
      return function() {
        var idx = _localAuthListeners.indexOf(callback);
        if (idx !== -1) _localAuthListeners.splice(idx, 1);
      };
    },

    sendPasswordResetEmail: function() {
      return Promise.resolve();
    }
  };

  // =====================================================
  // LOCAL FIRESTORE MOCK (file:// mode)
  // Uses localStorage as storage backend
  // =====================================================

  var _localDB = {};

  function _lsKey(collection) { return 'ecsa_db_' + collection; }

  function _lsGetCollection(name) {
    try {
      var data = localStorage.getItem(_lsKey(name));
      return data ? JSON.parse(data) : {};
    } catch(e) { return {}; }
  }

  function _lsSaveCollection(name, data) {
    try { localStorage.setItem(_lsKey(name), JSON.stringify(data)); } catch(e) {}
  }

  // Pre-populate usuarios collection with LOCAL_USERS profiles
  (function() {
    if (!IS_LOCAL) return;
    var existing = _lsGetCollection('usuarios');
    var changed = false;
    LOCAL_USERS.forEach(function(u) {
      if (!existing[u.uid]) {
        existing[u.uid] = Object.assign({}, u.profile, { id: u.uid });
        changed = true;
      }
    });
    // Also add custom users
    try {
      var custom = JSON.parse(localStorage.getItem('ecsa_local_custom_users') || '[]');
      custom.forEach(function(u) {
        if (!existing[u.uid]) {
          existing[u.uid] = Object.assign({}, u.profile, { id: u.uid });
          changed = true;
        }
      });
    } catch(e) {}
    if (changed) _lsSaveCollection('usuarios', existing);
  })();

  var LocalDB = {
    collection: function(name) {
      return {
        doc: function(docId) {
          return {
            get: function() {
              return new Promise(function(resolve) {
                var col = _lsGetCollection(name);
                var data = col[docId] || null;
                resolve({
                  exists: !!data,
                  id: docId,
                  data: function() { return data; }
                });
              });
            },
            set: function(data) {
              return new Promise(function(resolve) {
                var col = _lsGetCollection(name);
                col[docId] = Object.assign({}, data, { id: docId });
                _lsSaveCollection(name, col);
                resolve();
              });
            },
            update: function(data) {
              return new Promise(function(resolve) {
                var col = _lsGetCollection(name);
                if (col[docId]) {
                  col[docId] = Object.assign({}, col[docId], data);
                  _lsSaveCollection(name, col);
                }
                resolve();
              });
            },
            delete: function() {
              return new Promise(function(resolve) {
                var col = _lsGetCollection(name);
                delete col[docId];
                _lsSaveCollection(name, col);
                resolve();
              });
            }
          };
        },
        add: function(data) {
          return new Promise(function(resolve) {
            var id = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
            var col = _lsGetCollection(name);
            col[id] = Object.assign({}, data, { id: id });
            _lsSaveCollection(name, col);
            resolve({ id: id });
          });
        },
        get: function() {
          return new Promise(function(resolve) {
            var col = _lsGetCollection(name);
            var docs = Object.keys(col).map(function(key) {
              return { id: key, exists: true, data: function() { return col[key]; } };
            });
            resolve({ docs: docs });
          });
        },
        where: function() { return this; },
        orderBy: function() { return this; },
        limit: function() { return this; },
        onSnapshot: function(callback) {
          var col = _lsGetCollection(name);
          var docs = Object.keys(col).map(function(key) {
            return { id: key, data: function() { return col[key]; } };
          });
          setTimeout(function() { callback({ docs: docs }); }, 50);
          return function() {};
        }
      };
    },
    batch: function() {
      var ops = [];
      return {
        set: function(ref, data) { ops.push({ type: 'set', ref: ref, data: data }); },
        update: function(ref, data) { ops.push({ type: 'update', ref: ref, data: data }); },
        delete: function(ref) { ops.push({ type: 'delete', ref: ref }); },
        commit: function() { return Promise.resolve(); }
      };
    },
    enablePersistence: function() { return Promise.resolve(); }
  };

  // =====================================================
  // SELECT REAL OR LOCAL IMPLEMENTATIONS
  // =====================================================

  var db, auth, storage;

  if (IS_LOCAL) {
    db = LocalDB;
    auth = LocalAuth;
    storage = { ref: function() { return { put: function() { return Promise.resolve({ ref: { getDownloadURL: function() { return Promise.resolve(''); } } }); } }; } };
  } else {
    // Real Firebase
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      auth = firebase.auth();
      storage = firebase.storage();

      db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
        if (err.code === 'failed-precondition') {
          console.warn('ECSA: Persistencia no disponible (multiples pestanas abiertas).');
        } else if (err.code === 'unimplemented') {
          console.warn('ECSA: Persistencia no soportada en este navegador.');
        }
      });
    } else {
      console.error('ECSA: Firebase SDK no cargado. Usando modo local como fallback.');
      db = LocalDB;
      auth = LocalAuth;
      storage = { ref: function() { return { put: function() { return Promise.resolve({ ref: { getDownloadURL: function() { return Promise.resolve(''); } } }); } }; } };
    }
  }

  // ---- Estado de conexion ----
  var _online = !IS_LOCAL && navigator.onLine;
  var _connectionListeners = [];

  function onConnectionChange(callback) {
    _connectionListeners.push(callback);
    callback(_online);
    return function unsubscribe() {
      var idx = _connectionListeners.indexOf(callback);
      if (idx !== -1) _connectionListeners.splice(idx, 1);
    };
  }

  function _notifyConnection(status) {
    _online = status;
    _connectionListeners.forEach(function (cb) { cb(status); });
  }

  window.addEventListener('online',  function () { _notifyConnection(true); });
  window.addEventListener('offline', function () { _notifyConnection(false); });

  // =====================================================
  // Funciones auxiliares de Firestore (CRUD generico)
  // =====================================================

  function getCollection(collectionName) {
    return db.collection(collectionName);
  }

  async function getDocuments(collectionName, options) {
    options = options || {};
    try {
      var ref = db.collection(collectionName);
      if (options.where) {
        if (Array.isArray(options.where[0])) {
          options.where.forEach(function (w) { ref = ref.where(w[0], w[1], w[2]); });
        } else {
          ref = ref.where(options.where[0], options.where[1], options.where[2]);
        }
      }
      if (options.orderBy) {
        ref = ref.orderBy(options.orderBy, options.direction || 'asc');
      }
      if (options.limit) {
        ref = ref.limit(options.limit);
      }
      var snapshot = await ref.get();
      return snapshot.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
    } catch (error) {
      console.error('ECSA getDocuments error:', error);
      throw error;
    }
  }

  async function getDocument(collectionName, docId) {
    try {
      var doc = await db.collection(collectionName).doc(docId).get();
      if (!doc.exists) return null;
      return Object.assign({ id: doc.id }, doc.data());
    } catch (error) {
      console.error('ECSA getDocument error:', error);
      throw error;
    }
  }

  async function addDocument(collectionName, data) {
    try {
      if (!IS_LOCAL && typeof firebase !== 'undefined') {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      } else {
        data.createdAt = new Date().toISOString();
        data.updatedAt = new Date().toISOString();
      }
      var docRef = await db.collection(collectionName).add(data);
      return docRef.id;
    } catch (error) {
      console.error('ECSA addDocument error:', error);
      throw error;
    }
  }

  async function updateDocument(collectionName, docId, data) {
    try {
      if (!IS_LOCAL && typeof firebase !== 'undefined') {
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      } else {
        data.updatedAt = new Date().toISOString();
      }
      await db.collection(collectionName).doc(docId).update(data);
    } catch (error) {
      console.error('ECSA updateDocument error:', error);
      throw error;
    }
  }

  async function deleteDocument(collectionName, docId) {
    try {
      await db.collection(collectionName).doc(docId).delete();
    } catch (error) {
      console.error('ECSA deleteDocument error:', error);
      throw error;
    }
  }

  function onSnapshotListener(collectionName, callback, options) {
    options = options || {};
    var ref = db.collection(collectionName);

    if (options.where) {
      if (Array.isArray(options.where[0])) {
        options.where.forEach(function (w) { ref = ref.where(w[0], w[1], w[2]); });
      } else {
        ref = ref.where(options.where[0], options.where[1], options.where[2]);
      }
    }
    if (options.orderBy) {
      ref = ref.orderBy(options.orderBy, options.direction || 'asc');
    }
    if (options.limit) {
      ref = ref.limit(options.limit);
    }

    return ref.onSnapshot(function (snapshot) {
      var docs = snapshot.docs.map(function (doc) {
        return Object.assign({ id: doc.id }, doc.data());
      });
      callback(docs);
    }, function (error) {
      console.error('ECSA onSnapshot error:', error);
    });
  }

  async function uploadFile(file, path) {
    try {
      var ref = storage.ref(path);
      var snapshot = await ref.put(file);
      return await snapshot.ref.getDownloadURL();
    } catch (error) {
      console.error('ECSA uploadFile error:', error);
      throw error;
    }
  }

  function generateId(collectionName) {
    if (IS_LOCAL) return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    return db.collection(collectionName || '_tmp').doc().id;
  }

  async function runBatch(operations) {
    var batch = db.batch();
    operations(batch, db);
    await batch.commit();
  }

  // =====================================================
  // MODULO DE AUTENTICACION
  // =====================================================

  var Auth = {
    async registrar(email, password, datosUsuario) {
      try {
        var cred = await auth.createUserWithEmailAndPassword(email, password);
        var uid = cred.user.uid;
        var perfil = Object.assign({
          uid: uid, email: email, nombre: '', telefono: '', direccion: '',
          empresa: '', ruc: '', tipo: 'cliente', membresia: 'plata',
          estado: 'activo', totalCompras: 0, creditoDisponible: 0
        }, datosUsuario || {}, {
          createdAt: IS_LOCAL ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: IS_LOCAL ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('clientes').doc(uid).set(perfil);
        return { user: cred.user, perfil: perfil };
      } catch (error) {
        console.error('ECSA Auth.registrar error:', error);
        throw error;
      }
    },

    async login(email, password) {
      try {
        var cred = await auth.signInWithEmailAndPassword(email, password);
        var perfil = await getDocument('usuarios', cred.user.uid);
        if (!perfil) perfil = await getDocument('clientes', cred.user.uid);
        return { user: cred.user, perfil: perfil };
      } catch (error) {
        console.error('ECSA Auth.login error:', error);
        throw error;
      }
    },

    async logout() {
      try { await auth.signOut(); } catch (error) { console.error('ECSA Auth.logout error:', error); throw error; }
    },

    getCurrentUser: function() { return auth.currentUser; },

    async getCurrentProfile() {
      var user = auth.currentUser;
      if (!user) return null;
      var p = await getDocument('usuarios', user.uid);
      if (!p) p = await getDocument('clientes', user.uid);
      return p;
    },

    onAuthStateChanged: function(callback) { return auth.onAuthStateChanged(callback); },

    async resetPassword(email) {
      try { await auth.sendPasswordResetEmail(email); } catch (error) { console.error('ECSA Auth.resetPassword error:', error); throw error; }
    },

    async updateProfile(uid, datos) {
      try {
        if (!IS_LOCAL && typeof firebase !== 'undefined') datos.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        else datos.updatedAt = new Date().toISOString();
        await db.collection('usuarios').doc(uid).update(datos);
      } catch (error) {
        console.error('ECSA Auth.updateProfile error:', error); throw error;
      }
    },

    async isAdmin(uid) {
      var id = uid || (auth.currentUser && auth.currentUser.uid);
      var perfil = await getDocument('usuarios', id);
      if (!perfil) perfil = await getDocument('clientes', id);
      return perfil && (perfil.rol === 'admin' || perfil.tipo === 'admin');
    }
  };

  // =====================================================
  // MODULO DE PRODUCTOS / INVENTARIO
  // =====================================================

  var Productos = {
    COLECCION: 'productos',
    MOVIMIENTOS: 'inventario_movimientos',
    async getAll(options) { return await getDocuments(this.COLECCION, options); },
    async getById(id) { return await getDocument(this.COLECCION, id); },
    async getBySku(sku) { var docs = await getDocuments(this.COLECCION, { where: ['sku', '==', sku], limit: 1 }); return docs.length ? docs[0] : null; },
    async getByDepartment(dept) { return await getDocuments(this.COLECCION, { where: ['departamento', '==', dept] }); },
    async getLowStock() { return await getDocuments(this.COLECCION, { where: ['stockBajo', '==', true] }); },
    async add(producto) { producto.stockBajo = (producto.stock || 0) <= (producto.minStock || 0); return await addDocument(this.COLECCION, producto); },
    async update(id, datos) { if (datos.stock !== undefined && datos.minStock !== undefined) datos.stockBajo = datos.stock <= datos.minStock; return await updateDocument(this.COLECCION, id, datos); },
    async delete(id) { return await deleteDocument(this.COLECCION, id); },
    async ajustarStock(productoId, cantidad, tipo, nota) {
      var producto = await this.getById(productoId);
      if (!producto) throw new Error('Producto no encontrado');
      var nuevoStock = producto.stock + cantidad;
      if (nuevoStock < 0) throw new Error('Stock insuficiente');
      await this.update(productoId, { stock: nuevoStock, stockBajo: nuevoStock <= (producto.minStock || 0) });
      await addDocument(this.MOVIMIENTOS, { productoId: productoId, productoNombre: producto.nombre || producto.name, sku: producto.sku, tipo: tipo, cantidad: cantidad, stockAnterior: producto.stock, stockNuevo: nuevoStock, nota: nota || '', usuario: auth.currentUser ? auth.currentUser.uid : 'sistema' });
      return nuevoStock;
    },
    onChanges(callback, options) { return onSnapshotListener(this.COLECCION, callback, options); }
  };

  // =====================================================
  // MODULO DE PEDIDOS / ORDENES
  // =====================================================

  var Ordenes = {
    COLECCION: 'ordenes',
    async getAll(options) { return await getDocuments(this.COLECCION, Object.assign({ orderBy: 'createdAt', direction: 'desc' }, options)); },
    async getById(id) { return await getDocument(this.COLECCION, id); },
    async getByCliente(clienteId) { return await getDocuments(this.COLECCION, { where: ['clienteId', '==', clienteId], orderBy: 'createdAt', direction: 'desc' }); },
    async getByEstado(estado) { return await getDocuments(this.COLECCION, { where: ['estado', '==', estado], orderBy: 'createdAt', direction: 'desc' }); },
    async crear(orden) { orden.estado = orden.estado || 'pendiente'; orden.numero = 'ORD-' + Date.now(); return await addDocument(this.COLECCION, orden); },
    async actualizarEstado(id, estado) { return await updateDocument(this.COLECCION, id, { estado: estado }); },
    async update(id, datos) { return await updateDocument(this.COLECCION, id, datos); },
    async delete(id) { return await deleteDocument(this.COLECCION, id); },
    onChanges(callback, options) { return onSnapshotListener(this.COLECCION, callback, options); }
  };

  // =====================================================
  // MODULO DE CLIENTES
  // =====================================================

  var Clientes = {
    COLECCION: 'clientes',
    async getAll(options) { return await getDocuments(this.COLECCION, options); },
    async getById(id) { return await getDocument(this.COLECCION, id); },
    async getByEmail(email) { var docs = await getDocuments(this.COLECCION, { where: ['email', '==', email], limit: 1 }); return docs.length ? docs[0] : null; },
    async getByMembresia(tipo) { return await getDocuments(this.COLECCION, { where: ['membresia', '==', tipo] }); },
    async update(id, datos) { return await updateDocument(this.COLECCION, id, datos); },
    async delete(id) { return await deleteDocument(this.COLECCION, id); },
    async registrarCompra(clienteId, monto) {
      var ts = IS_LOCAL ? new Date().toISOString() : firebase.firestore.FieldValue.serverTimestamp();
      var inc = IS_LOCAL ? monto : firebase.firestore.FieldValue.increment(monto);
      return await updateDocument(this.COLECCION, clienteId, { totalCompras: inc, ultimaCompra: ts });
    },
    onChanges(callback, options) { return onSnapshotListener(this.COLECCION, callback, options); }
  };

  // =====================================================
  // MODULO DE PAGOS
  // =====================================================

  var Pagos = {
    COLECCION: 'pagos',
    async getAll(options) { return await getDocuments(this.COLECCION, Object.assign({ orderBy: 'createdAt', direction: 'desc' }, options)); },
    async getById(id) { return await getDocument(this.COLECCION, id); },
    async getByOrden(ordenId) { return await getDocuments(this.COLECCION, { where: ['ordenId', '==', ordenId] }); },
    async registrar(pago) { pago.estado = pago.estado || 'completado'; pago.numero = 'PAG-' + Date.now(); return await addDocument(this.COLECCION, pago); },
    async update(id, datos) { return await updateDocument(this.COLECCION, id, datos); },
    onChanges(callback, options) { return onSnapshotListener(this.COLECCION, callback, options); }
  };

  // =====================================================
  // EXPORTAR TODOS LOS MODULOS
  // =====================================================

  // Provide firebase.firestore reference (or mock for local)
  var firestoreRef = (!IS_LOCAL && typeof firebase !== 'undefined') ? firebase.firestore : {
    FieldValue: {
      serverTimestamp: function() { return new Date().toISOString(); },
      increment: function(n) { return n; },
      delete: function() { return null; }
    }
  };

  window.ECSA.Firebase = {
    db:                 db,
    auth:               auth,
    storage:            storage,
    firestore:          firestoreRef,

    getCollection:      getCollection,
    getDocuments:       getDocuments,
    getDocument:        getDocument,
    addDocument:        addDocument,
    updateDocument:     updateDocument,
    deleteDocument:     deleteDocument,
    onSnapshotListener: onSnapshotListener,
    uploadFile:         uploadFile,
    generateId:         generateId,
    runBatch:           runBatch,

    onConnectionChange: onConnectionChange,
    isOnline:           function () { return _online; },
    isLocal:            function () { return IS_LOCAL; },

    Auth:       Auth,
    Productos:  Productos,
    Ordenes:    Ordenes,
    Clientes:   Clientes,
    Pagos:      Pagos
  };

  console.log('ECSA Firebase configurado correctamente. Modo: ' + (IS_LOCAL ? 'LOCAL (localStorage)' : 'FIREBASE (online)'));
})();
