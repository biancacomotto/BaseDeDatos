// Importa la conexión a la base de datos
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./movies.db'); // Asegúrate de que el archivo db_connection.js esté correctamente configurado y apunta a tu base de datos

// Función para obtener los favoritos de un usuario
async function obtenerFavoritosDelUsuario(userId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM favoritos WHERE user_id = ?`;
        db.all(query, [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Exportar funciones necesarias para el resto del proyecto
module.exports = { obtenerFavoritosDelUsuario };
