// Consultas a la tabla usuarios. Siempre con ? (consulta parametrizada).
const bcrypt = require('bcryptjs');

function crearModeloUsuarios(pool) {

    // Regresa el usuario si la contraseña es correcta, o null si no.
    async function verificar(usuario, contrasena) {

        // Evitar consultar si faltan datos.
        if (!usuario || !contrasena) {
            return null;
        }

        // Buscar al usuario mediante una consulta parametrizada.
        const [filas] = await pool.execute(
            `SELECT id, usuario, nombre, rol, contrasena_hash
             FROM usuarios
             WHERE usuario = ?
             LIMIT 1`, [usuario]
        );

        // Si no existe el usuario, no se permite el acceso.
        if (filas.length === 0) {
            return null;
        }

        const datos = filas[0];

        // Verificar que exista el hash.
        if (!datos.contrasena_hash) {
            return null;
        }

        // Comparar la contraseña ingresada con el hash almacenado.
        const coincide = await bcrypt.compare(
            contrasena,
            datos.contrasena_hash
        );

        if (!coincide) {
            return null;
        }

        // Devolver los datos sin incluir el hash.
        return {
            id: datos.id,
            usuario: datos.usuario,
            nombre: datos.nombre,
            rol: datos.rol
        };
    }

    return { verificar };
}

module.exports = { crearModeloUsuarios };