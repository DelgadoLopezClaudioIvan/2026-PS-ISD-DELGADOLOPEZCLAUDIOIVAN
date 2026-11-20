// Lista negra de tokens JWT revocados.
// Un jti es único por token. La clave primaria evita registrar dos veces el mismo token.

function crearModeloTokens(pool) {
    // Registra el identificador del token revocado hasta su fecha de expiración.
    async function revocar(jti, usuario, exp) {
        if (!jti || !usuario || !Number.isFinite(Number(exp))) {
            throw new Error('Datos insuficientes para revocar el token');
        }

        // Los registros vencidos ya no son necesarios: JWT también verifica exp.
        await pool.execute(
            'DELETE FROM tokens_revocados WHERE expira <= NOW()'
        );

        await pool.execute(
            'INSERT IGNORE INTO tokens_revocados (jti, usuario, expira) VALUES (?, ?, FROM_UNIXTIME(?))',
            [String(jti), String(usuario), Number(exp)]
        );
    }

    // Comprueba si el identificador aparece en la lista negra y aún está vigente.
    async function estaRevocado(jti) {
        if (!jti) return false;

        const [filas] = await pool.execute(
            'SELECT 1 FROM tokens_revocados WHERE jti = ? AND expira > NOW() LIMIT 1',
            [String(jti)]
        );

        return filas.length > 0;
    }

    // Devuelve los tokens revocados más recientes para diagnóstico.
    async function listar() {
        const [filas] = await pool.execute(
            'SELECT jti, usuario, expira, revocado_en FROM tokens_revocados ORDER BY revocado_en DESC, jti'
        );
        return filas;
    }

    return { revocar, estaRevocado, listar };
}

module.exports = { crearModeloTokens };
