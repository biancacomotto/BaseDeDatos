// utils.js
const bcrypt = require('bcrypt');
const db = require('./db_connection');

// Función para verificar credenciales
async function verificarCredenciales(username, password) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE user_username = ?`;
        db.get(query, [username], (err, user) => {
            if (err) return reject(err);

            if (user) {
                // Compara la contraseña ingresada con la almacenada en la base de datos
                bcrypt.compare(password, user.user_password, (err, isMatch) => {
                    if (err) return reject(err);
                    if (isMatch) resolve(user); // Si coinciden, devuelve el usuario
                    else resolve(null); // Si no coinciden, devuelve null
                });
            } else {
                resolve(null); // Usuario no encontrado
            }
        });
    });
}

module.exports = { verificarCredenciales };
