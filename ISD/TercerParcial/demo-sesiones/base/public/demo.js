// La página solo hace fetch a la API. El navegador manda la cookie solo (misma página, mismo servidor).
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', iniciarDemo);

//ELEMENTOS
//Guardamos los elementos del DOM en un objeto para tenerlos a la mano porque así evitamos buscar por ID a cada rato en cada función
const elementos = {
    estado: document.getElementById('estado'),
    cookie: document.getElementById('cookie-js'),
    botonRefrescar: document.getElementById('btn-refrescar'),

    formulario: document.getElementById('form-login'),
    usuario: document.getElementById('usuario'),
    contrasena: document.getElementById('contrasena'),

    bitacora: document.getElementById('bitacora'),

    donde: document.getElementById('donde'),
    tablaSesiones: document.getElementById('tabla-sesiones'),
    botonSesiones: document.getElementById('btn-sesiones'),

    config: document.getElementById('config')
};

//SOLICITUDES
//Unificamos las peticiones aquí ya que así no repetimos código de fetch en todos lados y regresamos un objeto estándar con el status y los datos por si el servidor se apaga
async function solicitarAPI(url, metodo = 'GET', cuerpo = null) {
    const opciones = {
        method: metodo,
        headers: {}
    };

    //Solo mandamos el encabezado de JSON cuando existe un cuerpo ya que si el contenido está vacío Express puede rechazarlo
    if (cuerpo !== null) {
        opciones.headers['Content-Type'] = 'application/json';
        opciones.body = JSON.stringify(cuerpo);
    }

    try {
        const respuesta = await fetch(url, opciones);

        let datos = null;

        //Intentamos interpretar como JSON pero si el servidor manda texto plano o error extraño usamos null para evitar que truene
        try {
            datos = await respuesta.json();
        } catch {
            datos = null;
        }

        return {
            status: respuesta.status,
            datos: datos
        };

    } catch (error) {
        //Atrapamos cualquier error de red si el servidor está apagado para reportarlo sin dejar la app colgada
        return {
            status: 0,
            datos: {
                error: 'No fue posible comunicarse con el servidor.',
                detalle: error.message
            }
        };
    }
}

//BITÁCORA
//Dejamos un historial visual en pantalla pintando los códigos HTTP porque así vemos de un vistazo qué salió bien o falló
function registrarBitacora(metodo, url, resultado) {
    const li = document.createElement('li');

    const codigo = resultado.status;

    let clase = 'codigo error';

    if (codigo >= 200 && codigo < 300) {
        clase = 'codigo ok';
    } else if (codigo === 401) {
        clase = 'codigo e401';
    } else if (codigo === 403) {
        clase = 'codigo e403';
    }

    const estado = document.createElement('strong');
    estado.className = clase;
    estado.textContent = codigo === 0 ?
        'ERROR DE CONEXIÓN' :
        `HTTP ${codigo}`;

    const detalle = document.createElement('pre');
    detalle.textContent = JSON.stringify(resultado.datos, null, 2);

    const encabezado = document.createElement('span');
    encabezado.textContent = `${metodo} ${url}`;

    li.appendChild(estado);
    li.appendChild(document.createTextNode(' '));
    li.appendChild(encabezado);
    li.appendChild(detalle);

    //Usamos prepend para que la petición más reciente aparezca arriba y no tengamos que bajar en la lista
    elementos.bitacora.prepend(li);
}

//ESTADO
async function actualizarEstado() {
    /*
    - En el app.js que compartiste la ruta está escrita
    - como /api/sesiones (plural) por eso se utiliza esa.
    */

    //Preguntamos al servidor quién somos para refrescar el banner superior y ver si estamos logueados
    const resultado = await solicitarAPI('/api/sesiones', 'GET');

    registrarBitacora('GET', '/api/sesiones', resultado);

    if (resultado.status === 200 && resultado.datos) {
        const datos = resultado.datos;
        const usuario = datos.usuario || {};

        elementos.estado.textContent =
            `Sesión activa | Usuario: ${usuario.nombre || usuario.usuario || 'Sin nombre'} | ` +
            `Rol: ${usuario.rol || 'No especificado'} | ` +
            `ID: ${datos.sesion || 'No disponible'} | ` +
            `Tiempo restante: ${datos.expiraEnSegundos ?? datos.expirraEnSegundos ?? 'No disponible'} segundos`;

        elementos.estado.className = 'estado con-sesion';

    } else if (resultado.status === 401) {
        elementos.estado.textContent = 'Sin sesión. Inicia sesión para identificarte.';
        elementos.estado.className = 'estado sin-sesion';

    } else {
        elementos.estado.textContent =
            'No se pudo consultar la sesión. Revisa la respuesta del servidor.';
        elementos.estado.className = 'estado sin-sesion';
    }

    //Mostramos document.cookie pero si el servidor tiene httpOnly activo JavaScript no la podrá ver por seguridad
    elementos.cookie.textContent = document.cookie || '(vacío)';
}

//DIAGNÓSTICO
async function actualizarTablaSesiones() {
    //Pedimos el diagnóstico general para ver el almacén del servidor y poblar la tablita
    const resultado = await solicitarAPI(
        '/api/diagnostico/sesiones',
        'GET'
    );

    registrarBitacora(
        'GET',
        '/api/diagnostico/sesiones',
        resultado
    );

    //Vaciamos la tabla antes de meter las nuevas filas porque así evitamos duplicar datos al actualizar
    elementos.tablaSesiones.replaceChildren();

    if (resultado.status !== 200 || !resultado.datos) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');

        celda.colSpan = 4;
        celda.textContent =
            (resultado.datos && resultado.datos.error) ?
            resultado.datos.error :
            'No se pudo consultar el diagnóstico.';

        fila.appendChild(celda);
        elementos.tablaSesiones.appendChild(fila);

        elementos.donde.textContent =
            'No se pudo determinar dónde se guardan las sesiones.';

        return;
    }

    const datos = resultado.datos;

    elementos.donde.textContent =
        datos.almacen === 'memoria' ?
        'Almacenamiento actual: MEMORIA del servidor.' :
        'Almacenamiento actual: MySQL (tabla sessions).';

    const sesiones = Array.isArray(datos.sesiones) ?
        datos.sesiones : [];

    if (sesiones.length === 0) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');

        celda.colSpan = 4;
        celda.textContent = '(sin sesiones)';

        fila.appendChild(celda);
        elementos.tablaSesiones.appendChild(fila);

        return;
    }

    sesiones.forEach((sesion) => {
        const fila = document.createElement('tr');

        //Soportamos ambas propiedades por si el backend manda esLaTuya o esLatuta asegurando que se pinte bien
        const esTuya = (sesion.esLaTuya !== undefined) ?
            sesion.esLaTuya :
            sesion.esLatuta;

        if (esTuya) {
            fila.className = 'tuya';
        }

        const vencimiento = sesion.expira ?
            new Date(sesion.expira).toLocaleString() :
            'No disponible';

        const valores = [
            sesion.sesion || 'Sin ID',
            sesion.usuario || '(sin iniciar sesión)',
            sesion.visitas !== undefined ? sesion.visitas : 0,
            vencimiento
        ];

        valores.forEach((valor) => {
            const celda = document.createElement('td');
            celda.textContent = String(valor);
            fila.appendChild(celda);
        });

        elementos.tablaSesiones.appendChild(fila);
    });
}

//CONFIGURACIÓN
async function actualizarConfiguracion() {
    //Consultamos los ajustes iniciales del servidor para mostrarlos en la última tarjeta
    const resultado = await solicitarAPI('/api/config', 'GET');

    registrarBitacora('GET', '/api/config', resultado);

    if (resultado.status === 200) {
        elementos.config.textContent =
            JSON.stringify(resultado.datos, null, 2);
    } else {
        elementos.config.textContent =
            'No fue posible obtener la configuración del servidor.';
    }
}

//ACTUALIZAR
//Agrupamos ambas funciones para llamarlas juntas y mantener la interfaz sincronizada
async function actualizarTodo() {
    await actualizarEstado();
    await actualizarTablaSesiones();
}

//LOGIN
//Interceptamos el submit para mandar credenciales por POST sin recargar y actualizar el estado
elementos.formulario.addEventListener('submit', async(evento) => {
    evento.preventDefault();

    const usuario = elementos.usuario.value;
    const contrasena = elementos.contrasena.value;

    if (!usuario || !contrasena) {
        elementos.estado.textContent =
            'Debes seleccionar un usuario y escribir una contraseña.';
        elementos.estado.className = 'estado sin-sesion';
        return;
    }

    const resultado = await solicitarAPI(
        '/api/login',
        'POST', {
            usuario: usuario,
            password: contrasena
        }
    );

    registrarBitacora('POST', '/api/login', resultado);

    if (resultado.status === 200) {

        var nombreUsuario = usuario;

        if (resultado.datos && resultado.datos.usuario) {
            nombreUsuario =
                resultado.datos.usuario.nombre || usuario;
        }

        elementos.estado.textContent =
            'Inicio de sesión correcto: ' + nombreUsuario;

        elementos.estado.className = 'estado con-sesion';

    } else if (resultado.status === 401) {

        elementos.estado.textContent =
            (resultado.datos && resultado.datos.error) ?
            resultado.datos.error :
            'Usuario o contraseña incorrectos.';

        elementos.estado.className = 'estado sin-sesion';

    } else {

        elementos.estado.textContent =
            (resultado.datos && resultado.datos.error) ?
            resultado.datos.error :
            'No se pudo iniciar sesión. Revisa el servidor.';

        elementos.estado.className = 'estado sin-sesion';
    }

    await actualizarTodo();
});

//BOTONES
//Recorremos los botones de prueba leyendo método y URL directo del HTML para no repetir código
document.querySelectorAll('button[data-url]').forEach((boton) => {
    boton.addEventListener('click', async() => {
        const url = boton.dataset.url;
        const metodo = boton.dataset.metodo || 'GET';

        const resultado = await solicitarAPI(url, metodo);

        registrarBitacora(metodo, url, resultado);

        //reseteamos todo al terminar para que cualquier cambio en las visitas se vea al instante
        await actualizarTodo();
    });
});

//REFRESCAR
//Permite forzar una actualización manual cuando el usuario da click
elementos.botonRefrescar.addEventListener('click', async() => {
    await actualizarTodo();
});

//SESIONES
//Actualiza únicamente la tabla diagnóstica sin tocar lo demás
elementos.botonSesiones.addEventListener('click', async() => {
    await actualizarTablaSesiones();
});

//CONTRASEÑA
//Automatizamos el relleno de la contraseña según el usuario seleccionado ahorrando teclearla
elementos.usuario.addEventListener('change', () => {
    elementos.contrasena.value =
        `${elementos.usuario.value}12345`;
});

//ARRANQUE
//Pedimos la configuración inicial y reseteamos la pantalla apenas carga el DOM
async function iniciarDemo() {
    await actualizarConfiguracion();
    await actualizarTodo();
}