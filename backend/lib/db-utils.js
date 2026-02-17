/**
 * Database Utilities
 * Convierte queries de callback a promesas para usar async/await
 */

/**
 * Wrapper para ejecutar queries con promesas
 * @param {Object} db - Conexión de MySQL
 * @param {string} sql - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise<Array>} - Resultados de la query
 */
function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
}

/**
 * Ejecuta una transacción con múltiples queries
 * @param {Object} db - Conexión de MySQL
 * @param {Function} callback - Función async que recibe (db) y ejecuta queries
 * @returns {Promise<any>} - Resultado de la transacción
 */
function transaction(db, callback) {
    return new Promise((resolve, reject) => {
        db.beginTransaction(async (err) => {
            if (err) {
                return reject(err);
            }

            try {
                const result = await callback(db);

                db.commit((commitErr) => {
                    if (commitErr) {
                        return db.rollback(() => {
                            reject(commitErr);
                        });
                    }
                    resolve(result);
                });
            } catch (error) {
                db.rollback(() => {
                    reject(error);
                });
            }
        });
    });
}

module.exports = {
    query,
    transaction
};
