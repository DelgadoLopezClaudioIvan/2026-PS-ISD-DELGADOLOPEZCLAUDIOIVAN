// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
// Lo que dice "(en clase)" lo programamos juntos, paso por paso. Mientras no esté, esa ruta responde 501.
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');


const NOMBRE_COOKIE = 'connect.sid';

//tenemos que determinar donde se deben de almacenar las sesiones para la aplicacion si es LocalStorage, utilizamos MemoryStore (significa que se guarda en navegador) y si la queremos guardar en MySQL debemos de obtenerla y mantenerla durante su clico de vida

function todasLasSesiones(almacen) {
    return new Promise((resolve, reject) => {
        const promesa = almacen.all((err, sesiones) =>
            err ? reject(err) : resolve(sesiones)
        );
        if (promesa && typeof promesa.then === 'function') promesa.then(resolve).catch(reject);
    });
}

//vamos a contectarnos a la aplicacion
function crearApp(config, pool) {
    const app = express();
    app.use(express.json());
    const usuarios = crearModeloUsuarios(pool);

    //necesito crear una sesion a partit del tipo, rol y privilegio del usuaro
    //opcion 1 manejarlo desde myslq, significa que debo de tener una tabla de sesiones
    //opcion 2 manejarlo desde memoria

    const almacen = config.almacen === 'memoria' ?
        new session.MemoryStore() :
        new MySQLStore({ createDatabaseTable: false, clearExpired: false }, pool);
    app.locals.almacen = almacen;

    app.use(
        session({
            //nosotros creamos la cookie para que vaya sobnre todo el elemento de la aplicacion
            name: NOMBRE_COOKIE,
            secret: process.env.SESSION_SECRET || 'secreto-solo-para-la demo',
            store: almacen,
            resave: false,
            saveUninitialized: false, //no crea la sesion ni la cookie
            rolling: config.rolling,
            cookie: {
                maxAge: config.maxAgeMs || 1000 * 60 * 60 * 24,
                httpOnly: config.httpOnly !== false,
                sameSite: config.sameSite || 'lax',
                secure: false
            }
        })
    )

    //conocer el id de la sesion
    const idCorto = (id) => (id ? `${id.slice(0, 8)}...` : null);

    //en el uso de middleware como existe el intercambio de la sesion para tener un seguimiento del usuario, rol, privilegio, etc. Se utiliza el atribuyo roling para poder extender su uso

    //cuando estemos itilizando middlaware verificar la sesion activa a partir ya sea de la consultala servidor o la cookie
    function vencida(sesion) {
        const desde = config.rolling ? sesion.ultimoUso : sesion.creada;

        if (!desde) {
            return true;
        }

        return Date.now() - desde > config.maxAgeMs;
    }

    //tenemos que identidicar quien entro
    function requiereSesion(req, res, next) {
        if (req.session.usuario && vencida(req.session)) {
            return req.session.destroy(() => {
                res.clearCookie(NOMBRE_COOKIE);
                res.status(401).json({ error: '401 Tu sesión ha vencido. Por favor vuelve a ingresar tu usuario' })
            })
        }
        if (!req.session.usuario) {
            return res.status(401).json({ error: 'No has iniciado sesión' });
        }
        req.session.ultimoUso = Date.now();
        next();
    }

    function requiereRol(rol) {
        return (req, res, next) => {
            if (req.session.usuario.rol !== rol) {
                return res.status(403).json({ error: `403 Eres ${req.session.usuario.usuario}, pero esta ruta solo le pertenece a ${rol}` });
            }
            next();
        };
    }


    app.get('/api/config', (req, res) => res.json(config));

    //vamos a generar un contador en la sesion, sirve para saber que la sesion existe antes de entrar
    app.post('/api/visita', (req, res) => {
        if (!req.session) return pendiente(1)(req, res);
        req.session.visitas = (req.session.visitas || 0) + 1;
        res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
    })

    //ruta oara ubucuar sesuib
    app.post('/api/login', async(req, res, next) => {
        try {
            const { usuario } = req.body || {};
            const cuerpo = req.body || {};
            const password = cuerpo.contrasena || cuerpo.password;

            const datos = await usuarios.verificar(usuario, password);

            if (!datos) {
                return res.status(401).json({
                    error: 'Usuario o contraseña incorrectos'
                });
            }

            const antes = req.session.visitas !== undefined ?
                idCorto(req.sessionID) :
                null;

            const visitas = req.session.visitas || 0;

            const guardar = () => {
                req.session.usuario = datos;
                req.session.visitas = visitas;
                req.session.creada = Date.now();
                req.session.ultimoUso = Date.now();

                req.session.save((error) => {
                    if (error) return next(error);

                    res.json({
                        usuario: datos,
                        sesionAntes: antes,
                        sesionDespues: idCorto(req.sessionID)
                    });
                });
            };

            if (config.regenerarAlEntrar) {
                req.session.regenerate((error) =>
                    error ? next(error) : guardar()
                );
            } else {
                guardar();
            }

        } catch (error) {
            next(error);
        }
    });

    //cerror sesion
    app.post('/api/logout', (req, res, next) => {
        req.session.destroy((error) => {
            if (error) return next(error);
            res.clearCookie(NOMBRE_COOKIE);
            res.json({ mensaje: 'Sesion cerrada' });
        })
    })

    function mostrarSesion(req, res) {
        const desde = config.rolling ?
            req.session.ultimoUso :
            req.session.creada;

        res.json({
            usuario: req.session.usuario,
            sesion: idCorto(req.sessionID),
            expiraEnSegundos: Math.max(
                0,
                Math.round((desde + config.maxAgeMs - Date.now()) / 1000)
            )
        });
    }

    app.get('/api/sesion', requiereSesion, mostrarSesion);
    app.get('/api/sesiones', requiereSesion, mostrarSesion);

    app.get('/api/perfil', requiereSesion, (req, res) => {
        req.session.visitas = (req.session.visitas || 0) + 1;
        res.json({ mensaje: `Hola ${req.session.usuario.nombre}`, rol: req.session.usuario.rol, visitas: req.session.visitas });
    });

    app.get(`/api/admin/reporte`, requiereSesion, requiereRol('admin'), (req, res) => {
        res.json({ reporte: `Talleres: 3 · Inscritos: 57 · Cupo libre: 18` });
    });

    //vamos a simular que el servidor guardaer la sesion y la expone, en productivo jamas se expone
    app.get('/api/diagnostico/sesiones', async(req, res, next) => {
        try {
            const sesiones = await todasLasSesiones(almacen);
            const lista = Object.entries(sesiones || {}).map(([id, s]) => ({
                sesion: idCorto(id),
                esLaTuya: id === req.sessionID,
                usuario: s.usuario ? s.usuario.usuario : '(sin iniciar sesion)',
                visitas: s.visitas || 0,
                expira: s.cookie && s.cookie.expires,
            }));
            res.json({ almacen: config.almacen, sesiones: lista });
        } catch (error) {
            next(error);
        }
    });

    app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

    app.use(express.static(path.join(__dirname, 'public')));

    app.use((error, req, res, next) => {
        console.log('Ejercicio de sesiones');
        console.error(error);
        res.status(500).json({ error: 'Error de servidor' });
    });

    return app;
}

module.exports = { crearApp, NOMBRE_COOKIE };