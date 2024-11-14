// Importación de módulos y configuración inicial
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');
const { LocalStorage } = require('node-localstorage');

const localStorage = new LocalStorage('./scratch');
const app = express();
const port = process.env.PORT || 3000;

// Configuración de middlewares y archivos estáticos
app.use(express.static('views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride('_method'));

// Configuración del motor de plantillas EJS
app.set('view engine', 'ejs');

// Configuración de la sesión
app.use(
  session({
    secret: 'tu_secreto', // Cambia esto a un valor único y secreto
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Cambia a true si usas HTTPS
  })
);

// Configuración de la base de datos
const db = new sqlite3.Database('./movies.db');

// Crear la tabla favoritos si no existe
db.run(
  `
    CREATE TABLE IF NOT EXISTS favoritos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        movie_id INTEGER NOT NULL,
        rating INTEGER CHECK(rating BETWEEN 1 AND 5),
        opinion TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        FOREIGN KEY (movie_id) REFERENCES movie(movie_id)
    )
  `,
  (err) => {
    if (err) {
      console.error('Error al crear la tabla favoritos:', err.message);
    } else {
      console.log('Tabla favoritos creada o ya existe.');

      // Crear índice para user_id en favoritos
      db.run(`CREATE INDEX IF NOT EXISTS idx_favoritos_user_id ON favoritos(user_id)`, (err) => {
        if (err) {
          console.error('Error al crear el índice idx_favoritos_user_id:', err.message);
        } else {
          console.log('Índice idx_favoritos_user_id creado o ya existe.');
        }
      });
    }
  }
);

// ------------------------------------------------------

// Ruta para buscar películas, directores y actores
app.get('/buscar', (req, res) => {
  const searchTerm = req.query.q;
  const tipoBusqueda = req.query.tipoBusqueda;

  const resultados = {
    searchTerm,
    movies: [],
    actors: [],
    directors: [],
    keywords: [],
  };

  if (tipoBusqueda === 'movie') {
    const consultaMovies = `SELECT DISTINCT * FROM movie WHERE title LIKE ? ORDER BY title ASC;`;
    db.all(consultaMovies, [`%${searchTerm}%`], (err, movieRows) => {
      if (!err) {
        resultados.movies = movieRows;
      }
      res.render('resultado', { resultados, tipoBusqueda });
    });
  } else if (tipoBusqueda === 'actor') {
    const consultaActores = `SELECT DISTINCT person_name, p.person_id FROM person p JOIN movie_cast mc ON p.person_id = mc.person_id WHERE person_name LIKE ? ORDER BY person_name ASC;`;
    db.all(consultaActores, [`%${searchTerm}%`], (err, actorRows) => {
      if (!err) {
        resultados.actors = actorRows;
      }
      res.render('resultado', { resultados, tipoBusqueda });
    });
  } else if (tipoBusqueda === 'director') {
    const consultaDirectores = `SELECT DISTINCT person_name, p.person_id FROM person p JOIN movie_crew mc ON p.person_id = mc.person_id WHERE person_name LIKE ? AND mc.job = 'Director' ORDER BY person_name ASC;`;
    db.all(consultaDirectores, [`%${searchTerm}%`], (err, directorRows) => {
      if (!err) {
        resultados.directors = directorRows;
      }
      res.render('resultado', { resultados, tipoBusqueda });
    });
  } else if (tipoBusqueda === 'keyword') {
    const consultaKeywords = `
             SELECT DISTINCT *
             FROM movie
             JOIN movie_keywords mk ON movie.movie_id = mk.movie_id
             JOIN keyword k ON k.keyword_id = mk.keyword_id
             WHERE keyword_name LIKE ?
             ORDER BY title ASC;
        `;
    db.all(consultaKeywords, [`%${searchTerm}%`], (err, movieRows) => {
      if (!err) {
        resultados.movies = movieRows;
      }
      res.render('resultados_keyword', { resultados });
    });
  }
});

// Ruta para la página de datos de una película particular
// Ruta para la página de datos de una película particular
app.get('/pelicula/:id', (req, res) => {
  const movieId = req.params.id;
  const successMessage = req.session.success; // Obtener el mensaje de éxito de la sesión
  req.session.success = null; // Limpiar el mensaje después de obtenerlo

  // Si no se proporciona un id, redirige a la página de inicio
  if (!movieId) {
    return res.redirect('/');
  }

  const query = `
        SELECT DISTINCT
            movie.movie_id, -- Asegúrate de incluir movie_id aquí
            movie.title,
            movie.release_date,
            movie.overview,
            actor.person_name as actor_name,
            actor.person_id as actor_id,
            crew_member.person_name as crew_member_name,
            crew_member.person_id as crew_member_id,
            movie_cast.character_name,
            movie_cast.cast_order,
            department.department_name,
            movie_crew.job,
            genre.genre_name,
            country.country_name,
            production_company.company_name,
            keyword.keyword_name,
            language_role.language_role,
            language.language_name
        FROM movie
            LEFT JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
            LEFT JOIN person as actor ON movie_cast.person_id = actor.person_id
            LEFT JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
            LEFT JOIN department ON movie_crew.department_id = department.department_id
            LEFT JOIN person as crew_member ON crew_member.person_id = movie_crew.person_id
            LEFT JOIN movie_genres ON movie.movie_id = movie_genres.movie_id
            LEFT JOIN genre ON movie_genres.genre_id = genre.genre_id
            LEFT JOIN production_country ON movie.movie_id = production_country.movie_id
            LEFT JOIN country ON production_country.country_id = country.country_id
            LEFT JOIN movie_company ON movie.movie_id = movie_company.movie_id
            LEFT JOIN production_company ON movie_company.company_id = production_company.company_id
            LEFT JOIN movie_keywords ON movie.movie_id = movie_keywords.movie_id
            LEFT JOIN keyword ON movie_keywords.keyword_id = keyword.keyword_id
            LEFT JOIN movie_languages ON movie.movie_id = movie_languages.movie_id
            LEFT JOIN language_role ON movie_languages.language_role_id = language_role.role_id
            LEFT JOIN language ON movie_languages.language_id = language.language_id
        WHERE movie.movie_id = ?
    `;

  db.all(query, [movieId], (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send('Error al cargar los datos de la película.');
    } else if (rows.length === 0) {
      res.status(404).send('Película no encontrada.');
    } else {
      // Inicializar movieData con todos los campos importantes
      const movieData = {
        id: movieId,
        title: rows[0].title,
        release_date: rows[0].release_date,
        overview: rows[0].overview,
        directors: [],
        writers: [],
        cast: [],
        crew: [],
        genres: [],
        companies: [],
        keywords: [],
        languages: [],
      };

      // Recorre cada fila para llenar los detalles
      rows.forEach((row) => {
        // Verificar y agregar directores
        if (row.crew_member_id && row.crew_member_name && row.department_name === 'Directing' && row.job === 'Director') {
          const directorExists = movieData.directors.some((director) => director.crew_member_id === row.crew_member_id);
          if (!directorExists) {
            movieData.directors.push({
              crew_member_id: row.crew_member_id,
              crew_member_name: row.crew_member_name,
              department_name: row.department_name,
              job: row.job,
            });
          }
        }

        // Verificar y agregar actores (reparto)
        if (row.actor_id && row.actor_name && row.character_name) {
          const actorExists = movieData.cast.some((actor) => actor.actor_id === row.actor_id);
          if (!actorExists) {
            movieData.cast.push({
              actor_id: row.actor_id,
              actor_name: row.actor_name,
              character_name: row.character_name,
              cast_order: row.cast_order,
            });
          }
        }

        // Agregar géneros únicos
        if (row.genre_name && !movieData.genres.includes(row.genre_name)) {
          movieData.genres.push(row.genre_name);
        }

        // Agregar empresas de producción sin duplicados
        if (row.company_name && row.country_name) {
          const companyExists = movieData.companies.some(
            (company) => company.company_name === row.company_name && company.country_name === row.country_name
          );
          if (!companyExists) {
            movieData.companies.push({
              company_name: row.company_name,
              country_name: row.country_name,
            });
          }
        }

        // Agregar palabras clave sin duplicados
        if (row.keyword_name && !movieData.keywords.includes(row.keyword_name)) {
          movieData.keywords.push(row.keyword_name);
        }

        // Agregar idiomas sin duplicados
        if (row.language_name && !movieData.languages.includes(row.language_name)) {
          movieData.languages.push(row.language_name);
        }
      });

      // Renderizar la vista de detalles de la película
      res.render('pelicula', { movie: movieData, successMessage });
    }
  });
});

// Ruta para los datos de un actor específico
app.get('/actor/:id', (req, res) => {
  const personId = req.params.id;

  const actorData = {
    actorName: '',
    moviesActed: [],
  };

  const actorQuery = `
        SELECT person_name
        FROM person
        WHERE person_id = ?;
    `;

  const actedQuery = `
        SELECT m.*
        FROM movie_cast mc
        JOIN movie m ON mc.movie_id = m.movie_id
        WHERE mc.person_id = ?;
    `;

  db.all(actedQuery, [personId], (err, actedRows) => {
    if (!err) {
      actorData.moviesActed = actedRows;

      db.get(actorQuery, [personId], (err, actorRow) => {
        if (!err && actorRow) {
          actorData.actorName = actorRow.person_name;
        }

        res.render('actor', actorData);
      });
    } else {
      console.error(err);
      res.status(500).send('Error al cargar las películas en las que actuó el actor.');
    }
  });
});

// Ruta para los datos de un director específico
app.get('/director/:id', (req, res) => {
    const personId = req.params.id;

    const directorData = {
        directorName: '',
        moviesDirected: []
    };

    const directorQuery = `
        SELECT person_name
        FROM person
        WHERE person_id = ?;
    `;

    // Consulta para obtener las películas que dirigió
    const directedQuery = `
        SELECT m.*
        FROM movie_crew mc
        JOIN movie m ON mc.movie_id = m.movie_id
        WHERE mc.person_id = ? AND mc.job = 'Director';
    `;

    // Ejecutar la consulta para las películas que dirigió
    db.all(directedQuery, [personId], (err, directedRows) => {
        if (!err) {
            directorData.moviesDirected = directedRows;

            // Ejecutar la consulta para obtener el nombre del director
            db.get(directorQuery, [personId], (err, directorRow) => {
                if (!err && directorRow) {
                    directorData.directorName = directorRow.person_name; // Asignar el nombre del director
                }

                // Renderizar la página del director y pasar los datos
                res.render('director', directorData);
            });
        } else {
            console.error(err);
            res.status(500).send('Error al cargar las películas dirigidas por el director.');
        }
    });
});

// Ruta para mostrar el formulario de registro
app.get('/register', (req, res) => {
    res.render('register', { message: null });
});

// Ruta para manejar el envío del formulario de registro
app.post('/register', (req, res) => {
    const { user_username, user_name, user_email, user_password } = req.body;

    bcrypt.hash(user_password, 10, (err, hashedPassword) => {
        if (err) {
            console.error("Error al registrar el usuario:", err.message);
            res.render('register', { message: "Error al registrar el usuario. Usuario ya existe." });
            return;
        }

        const query = `
            INSERT INTO users (user_username, user_name, user_email, user_password, role)
            VALUES (?, ?, ?, ?, 'user');
        `;

        db.run(query, [user_username, user_name, user_email, hashedPassword], (err) => {
            if (err) {
                console.error("Error al registrar el usuario:", err.message);
                res.render('register', { message: "Error al registrar el usuario. Usuario ya existe." });
            } else {
                res.render('register', { message: "Usuario registrado con éxito." });
            }
        });
    });
});

// Ruta de login
app.post('/login', (req, res) => {
    const username = req.body.user_username;
    const password = req.body.user_password;

    db.get('SELECT * FROM users WHERE user_username = ?', [username], (err, user) => {
        if (err) {
            console.error(err.message);
            req.session.error = 'Error en el servidor.';
            return res.redirect('/login');
        }

        if (user) {
            bcrypt.compare(password, user.user_password, (err, isMatch) => {
                if (err) {
                    console.error(err);
                    req.session.error = 'Error en el servidor.';
                    return res.redirect('/login');
                }

                if (isMatch) {
                    // Guarda los datos del usuario y su rol en la sesión
                    req.session.user = {
                        user_id: user.user_id,
                        user_name: user.user_name,
                        role: user.role, // Almacena el rol para verificar permisos
                    };
                    console.log('Inicio de sesión exitoso');
                    return res.redirect('/'); // Redirige a la página principal después de iniciar sesión
                } else {
                    // Contraseña incorrecta
                    return res.render('login', { errorMessage: 'Contraseña incorrecta.', showRegisterButton: false });
                }
            });
        } else {
            // Usuario no encontrado, mostrar botón de registro
            return res.render('login', { errorMessage: 'Usuario no existente.', showRegisterButton: true });
        }
    });
});


// Ruta para mostrar el formulario de inicio de sesión (GET /login)
app.get('/login', (req, res) => {
    const errorMessage = req.session.error || '';
    req.session.error = null;
    res.render('login', { errorMessage, showRegisterButton: true });
});

// Ruta para manejar el cierre de sesión
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.redirect('/'); // Redirigir a la página principal en caso de error
        }
        res.redirect('/'); // Redirigir a la página principal después de cerrar sesión
    });
});

// Ruta para listar usuarios
app.get('/users', (req, res) => {
    const query = `SELECT * FROM users;`;

    db.all(query, [], (err, users) => {
        if (err) {
            console.error("Error al obtener usuarios:", err.message);
            return res.status(500).render('users', { users: [], message: null, errorMessage: 'Error al obtener usuarios.', currentUserRole: null });
        }

        // Define `currentUserRole` en función del usuario actual
        const currentUserRole = req.session.user ? req.session.user.role : null;

        res.render('users', { users: users, message: null, errorMessage: null, currentUserRole: currentUserRole });
    });
});


app.post('/agregar-calificada', (req, res) => {
    const { movieId, rating, opinion } = req.body;
    const userId = req.session.user ? req.session.user.user_id : null;

    if (!userId) {
        req.session.error = 'Debe iniciar sesión para calificar una película.';
        return res.redirect('/login');
    }

    const verificarCalificadaQuery = `SELECT * FROM calificadas WHERE user_id = ? AND movie_id = ?`;
    db.get(verificarCalificadaQuery, [userId, movieId], (err, calificada) => {
        if (err) {
            console.error("Error al verificar la existencia de la película en calificadas:", err.message);
            return res.status(500).send("Error en el servidor.");
        }

        if (calificada) {
            const actualizarCalificadaQuery = `
                UPDATE calificadas SET rating = ?, opinion = ? WHERE user_id = ? AND movie_id = ?
            `;
            db.run(actualizarCalificadaQuery, [rating, opinion, userId, movieId], (err) => {
                if (err) {
                    console.error("Error al actualizar la película en calificadas:", err.message);
                    req.session.error = 'Error al actualizar la película en calificadas.';
                    return res.redirect(`/pelicula/${movieId}`);
                }
                req.session.success = 'Película actualizada en calificados con éxito.';
                res.redirect(`/pelicula/${movieId}`);
            });
        } else {
            const agregarCalificadaQuery = `
                INSERT INTO calificadas (user_id, movie_id, rating, opinion)
                VALUES (?, ?, ?, ?);
            `;
            db.run(agregarCalificadaQuery, [userId, movieId, rating, opinion], (err) => {
                if (err) {
                    console.error("Error al agregar la película a calificados:", err.message);
                    req.session.error = 'Error al agregar la película a calificados.';
                    return res.redirect(`/pelicula/${movieId}`);
                }
                req.session.success = 'Película agregada a calificados con éxito.';
                res.redirect(`/pelicula/${movieId}`);
            });
        }
    });
});


app.post('/agregar-favorito', (req, res) => {
    const { movieId } = req.body;
    const userId = req.session.user ? req.session.user.user_id : null;

    if (!userId) {
        req.session.error = 'Debe iniciar sesión para agregar una película a favoritos.';
        return res.redirect('/login');
    }

    const verificarFavoritoQuery = `SELECT * FROM favoritos WHERE user_id = ? AND movie_id = ?`;
    db.get(verificarFavoritoQuery, [userId, movieId], (err, favorito) => {
        if (err) {
            console.error("Error al verificar la existencia de la película en favoritos:", err.message);
            return res.status(500).send("Error en el servidor.");
        }

        if (!favorito) {
            const agregarFavoritoQuery = `
                INSERT INTO favoritos (user_id, movie_id)
                VALUES (?, ?);
            `;
            db.run(agregarFavoritoQuery, [userId, movieId], (err) => {
                if (err) {
                    console.error("Error al agregar la película a favoritos:", err.message);
                    req.session.error = 'Error al agregar la película a favoritos.';
                    return res.redirect(`/pelicula/${movieId}`);
                }
                req.session.success = 'Película agregada a favoritos con éxito.';
                res.redirect(`/pelicula/${movieId}`);
            });
        } else {
            req.session.success = 'Esta película ya está en favoritos.';
            res.redirect(`/pelicula/${movieId}`);
        }
    });
});

// Ruta para mostrar el perfil del usuario con secciones de calificadas y favoritas
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.user_id;

    const queryCalificadas = `
        SELECT movie.movie_id, movie.title, calificadas.rating, calificadas.opinion
        FROM calificadas
        JOIN movie ON calificadas.movie_id = movie.movie_id
        WHERE calificadas.user_id = ?;
    `;

    const queryFavoritos = `
        SELECT movie.movie_id, movie.title
        FROM favoritos
        JOIN movie ON favoritos.movie_id = movie.movie_id
        WHERE favoritos.user_id = ?;
    `;

    db.all(queryCalificadas, [userId], (err, calificadas) => {
        if (err) {
            console.error('Error al obtener las películas calificadas:', err);
            return res.status(500).send('Error al obtener las películas calificadas.');
        }

        db.all(queryFavoritos, [userId], (err, favoritos) => {
            if (err) {
                console.error('Error al obtener las películas favoritas:', err);
                return res.status(500).send('Error al obtener las películas favoritas.');
            }

            res.render('profile', {
                username: req.session.user.user_name,
                calificadas,
                favoritos,
            });
        });
    });
});

// Ruta para ver las películas calificadas de un usuario
app.get('/usuario/:id/peliculas-calificadas', (req, res) => {
    const userId = req.params.id;
    const userQuery = `SELECT user_name FROM users WHERE user_id = ?`;
    db.get(userQuery, [userId], (err, user) => {
        if (err || !user) {
            console.error(err || "Usuario no encontrado");
            return res.status(404).send("Usuario no encontrado.");
        }

        const calificadasQuery = `
            SELECT movie.movie_id, movie.title, calificadas.rating, calificadas.opinion
            FROM calificadas
            JOIN movie ON calificadas.movie_id = movie.movie_id
            WHERE calificadas.user_id = ?;
        `;

        db.all(calificadasQuery, [userId], (err, calificadas) => {
            if (err) {
                console.error("Error al obtener las películas calificadas:", err);
                return res.status(500).send("Error al obtener las películas calificadas.");
            }

            res.render('peliculas-calificadas', {
                username: user.user_name,
                calificadas
            });
        });
    });
});

// Ruta para ver las películas favoritas de un usuario
app.get('/usuario/:id/peliculas-favoritas', (req, res) => {
    const userId = req.params.id;
    const userQuery = `SELECT user_name FROM users WHERE user_id = ?`;
    db.get(userQuery, [userId], (err, user) => {
        if (err || !user) {
            console.error(err || "Usuario no encontrado");
            return res.status(404).send("Usuario no encontrado.");
        }

        const favoritosQuery = `
            SELECT movie.movie_id, movie.title
            FROM favoritos
            JOIN movie ON favoritos.movie_id = movie.movie_id
            WHERE favoritos.user_id = ?;
        `;

        db.all(favoritosQuery, [userId], (err, favoritos) => {
            if (err) {
                console.error("Error al obtener las películas favoritas:", err);
                return res.status(500).send("Error al obtener las películas favoritas.");
            }

            res.render('peliculas-favoritas', {
                username: user.user_name,
                favoritos
            });
        });
    });
});




// Ruta para mostrar la página principal
app.get('/', (req, res) => {
    const isLoggedIn = !!req.session.user; // Verifica si el usuario está logeado
    const username = isLoggedIn ? req.session.user.user_name : 'Visitante';

    res.render('index', {
        isLoggedIn,
        username
    });
});

// Ruta para el perfil del usuario logeado
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.user_id;
    const query = `
        SELECT movie.title, favoritos.rating, favoritos.opinion
        FROM favoritos
        JOIN movie ON favoritos.movie_id = movie.movie_id
        WHERE favoritos.user_id = ?;
    `;

    db.all(query, [userId], (err, movies) => {
        if (err) {
            console.error('Error al obtener las películas favoritas:', err);
            return res.status(500).send('Error al obtener las películas favoritas.');
        }

        res.render('profile', { username: req.session.user.user_name, movies });
    });
});

// Ruta para editar un usuario
app.post('/users/:userId/edit', (req, res) => {
    const userId = req.params.userId;
    const { user_username, user_name, user_email } = req.body;

    // Verificar si el usuario logueado es administrador
    if (req.session.user && req.session.user.role === 'admin') {
        const updateQuery = `
            UPDATE users
            SET user_username = ?, user_name = ?, user_email = ?
            WHERE user_id = ?;
        `;
        db.run(updateQuery, [user_username, user_name, user_email, userId], (err) => {
            if (err) {
                console.error('Error al actualizar usuario:', err);
                return res.status(500).send('Error al actualizar usuario.');
            }
            res.redirect('/users');
        });
    } else {
        res.status(403).send('Acceso denegado: solo el administrador puede modificar usuarios.');
    }
});

// Ruta para eliminar un usuario
app.post('/users/:userId/delete', (req, res) => {
    const userId = req.params.userId;

    // Verificar si el usuario logueado es administrador
    if (req.session.user && req.session.user.role === 'admin') {
        const deleteQuery = `DELETE FROM users WHERE user_id = ?;`;
        db.run(deleteQuery, [userId], (err) => {
            if (err) {
                console.error('Error al eliminar usuario:', err);
                return res.status(500).send('Error al eliminar usuario.');
            }
            res.redirect('/users');
        });
    } else {
        res.status(403).send('Acceso denegado: solo el administrador puede eliminar usuarios.');
    }
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor en ejecución en http://localhost:${port}`);
});
