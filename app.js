const express = require('express');
const sqlite3 = require('sqlite3');
const ejs = require('ejs');
const {Database} = require("sqlite3");

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the "views" directory
app.use(express.static('views'));

// Configuración de la base de datos
const db = new sqlite3.Database('./movies.db'); //path

// Configurar el motor de plantillas EJS
app.set('view engine', 'ejs');

// Ruta para la página de inicio
app.get('/', (req, res) => {
    res.render('index');
});

// Ruta para buscar películas, directores y actores
app.get('/buscar', (req, res) => {
    const searchTerm = req.query.q;

    const resultados = {
        searchTerm,
        movies: [],
        actors: [],
        directors: [],
    };

    // Consulta de películas
    const consultaMovies = `
        SELECT DISTINCT *
        FROM movie
        WHERE title LIKE ?
        ORDER BY title ASC;
    `;

    // Consulta de actores
    const consultaActores = `
        SELECT DISTINCT person_name, p.person_id
        FROM person p
        JOIN movie_cast mc ON p.person_id = mc.person_id
        WHERE person_name LIKE ?
        ORDER BY person_name ASC;
    `;

    // Consulta de directores
    const consultaDirectores = `
        SELECT DISTINCT person_name, p.person_id
        FROM person p
        JOIN movie_crew mc ON p.person_id = mc.person_id
        WHERE person_name LIKE ?
        AND mc.job = 'Director'
        ORDER BY person_name ASC;
    `;


    // Ejecutar la consulta de películas
    db.all(consultaMovies, [`%${searchTerm}%`], (err, movieRows) => {
        if (!err) {
            resultados.movies = movieRows;
        }

        // Ejecutar la consulta de actores
        db.all(consultaActores, [`%${searchTerm}%`], (err, actorRows) => {
            if (!err) {
                resultados.actors = actorRows;
            }

            // Ejecutar la consulta de directores
            db.all(consultaDirectores, [`%${searchTerm}%`], (err, directorRows) => {
                if (!err) {
                    resultados.directors = directorRows;
                }

                // Renderizar la página de resultados
                res.render('resultado', { resultados, searchTerm });
            });
        });
    });
});

// ----- INICIO: Rutas para el Buscador de Palabras Clave -----

// Ruta para mostrar la página de búsqueda
app.get('/search_keyword', (req, res) => {
    // Envía el archivo EJS de la página de búsqueda al cliente
    res.sendFile(path.join(__dirname, 'views', 'search_keyword.ejs'));
});

// Ruta para manejar la búsqueda de palabras clave
app.get('/resultados_keyword', (req, res) => {
    const keyword = req.query.keyword; // Obtiene la palabra clave del parámetro de consulta
    // SQL para seleccionar películas que están relacionadas con la palabra clave
    const sql = `
        SELECT movie.id, movie.title
        FROM movie
                 JOIN movie_keywords ON movie.id = movie_keywords.movie_id
                 JOIN keyword ON movie_keywords.keyword_id = keyword.id
        WHERE keyword.name LIKE ?
        order by title asc;
    `;

    // Ejecuta la consulta a la base de datos
    db.all(sql, [`%${keyword}%`], (err, movies) => {
        if (err) {
            // Manejo de errores
            res.status(500).send('Error en la base de datos');
            return; // Termina la ejecución de la función
        }
        // Renderiza la página de resultados con las películas encontradas y la palabra clave
        res.render('resultados_keyword', { keyword: keyword, movies: movies });
    });
});

// ----- FIN: Rutas para el Buscador de Palabras Clave -----


// Ruta para la página de datos de una película particular
app.get('/pelicula/:id', (req, res) => {
    const movieId = req.params.id;

    // Consulta para obtener los datos de la película, elenco y crew ==> Lo necesario
    const query = `
        SELECT DISTINCT
            movie.*,
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
            -- Buscamos cast
                 LEFT JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
                 LEFT JOIN person as actor ON movie_cast.person_id = actor.person_id

            -- Buscamos crew
                 LEFT JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
                 LEFT JOIN department ON movie_crew.department_id = department.department_id
                 LEFT JOIN person as crew_member ON crew_member.person_id = movie_crew.person_id

            -- Buscamos generos
                 left join movie_genres on movie.movie_id = movie_genres.movie_id
                 left join genre on movie_genres.genre_id = genre.genre_id

            -- Buscamos paises
                 left join production_country on movie.movie_id = production_country.movie_id
                 left join country on production_country.country_id = country.country_id

            -- Buscamos productoras
                 left join movie_company on movie.movie_id = movie_company.movie_id
                 left join production_company on movie_company.company_id = production_company.company_id

            --Buscamos keywords
                 left join movie_keywords on movie.movie_id = movie_keywords.movie_id
                 left join keyword on movie_keywords.keyword_id = keyword.keyword_id

            --Buscamos idiomas
                 left join movie_languages on movie.movie_id = movie_languages.movie_id
                 left join language_role on movie_languages.language_role_id = language_role.role_id
                 left join language on movie_languages.language_id = language.language_id
        WHERE movie.movie_id = ?
    `;

    // Ejecutamos la consulta
    db.all(query, [movieId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error al cargar los datos de la película.');
        } else if (rows.length === 0) {
            res.status(404).send('Película no encontrada.');
        } else {
            // Organizamos los datos en un objeto de película
            const movieData = {
                id: rows[0].id,
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

            // Creamos objeto para almacenar directores
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    // Verificamos si ya existen esos datos
                    const isDuplicate = movieData.directors.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );

                    if (!isDuplicate) {
                        // Si no existe, agregamos los datos a la lista de directors
                        if (row.department_name === 'Directing' && row.job === 'Director') {
                            movieData.directors.push({
                                crew_member_id: row.crew_member_id,
                                crew_member_name: row.crew_member_name,
                                department_name: row.department_name,
                                job: row.job,
                            });
                        }
                    }
                }
            });

            // Objeto escritores
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    // Verificacion existencia
                    const isDuplicate = movieData.writers.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );

                    if (!isDuplicate) {
                        // Si no existe, agregamos a la lista de escritores
                        if (row.department_name === 'Writing' && row.job === 'Writer') {
                            movieData.writers.push({
                                crew_member_id: row.crew_member_id,
                                crew_member_name: row.crew_member_name,
                                department_name: row.department_name,
                                job: row.job,
                            });
                        }
                    }
                }
            });

            // Objeto movie casts
            rows.forEach((row) => {
                if (row.actor_id && row.actor_name && row.character_name) {
                    // Verificacion existencia
                    const isDuplicate = movieData.cast.some((actor) =>
                        actor.actor_id === row.actor_id
                    );

                    if (!isDuplicate) {
                        // Si no existe, agregamos los datos
                        movieData.cast.push({
                            actor_id: row.actor_id,
                            actor_name: row.actor_name,
                            character_name: row.character_name,
                            cast_order: row.cast_order,
                        });
                    }
                }
            });

            // Objeto movie crew
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    // Verificacion existencia
                    const isDuplicate = movieData.crew.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );


                    if (!isDuplicate) {
                        // Si no existe, agregamos a la lista crew
                        if (row.department_name !== 'Directing' && row.job !== 'Director'
                            && row.department_name !== 'Writing' && row.job !== 'Writer') {
                            movieData.crew.push({
                                crew_member_id: row.crew_member_id,
                                crew_member_name: row.crew_member_name,
                                department_name: row.department_name,
                                job: row.job,
                            });
                        }
                    }
                }
            });

            rows.forEach((row) => {
                // Agregamos genero
                if (row.genre_name && !movieData.genres.includes(row.genre_name)) {
                    movieData.genres.push(row.genre_name);
                }

                // Agregamos compania y pais
                if (row.company_name && row.country_name) {
                    const companyInfo = {
                        company_name: row.company_name,
                        country_name: row.country_name
                    };

                    if (!movieData.companies.some((company) =>
                        company.company_name === companyInfo.company_name &&
                        company.country_name === companyInfo.country_name)) {
                        movieData.companies.push(companyInfo);
                    }
                }

                // Agregamos keyword
                if (row.keyword_name && !movieData.keywords.includes(row.keyword_name)) {
                    movieData.keywords.push(row.keyword_name);
                }

                // Agregamos lenguaje
                if (row.language_name && !movieData.languages.includes(row.language_name)) {
                    movieData.languages.push(row.language_name);
                }
            });

            res.render('pelicula', { movie: movieData });
        }
    });
});

// Ruta para los datos de un actor específico
app.get('/actor/:id', (req, res) => {
    const personId = req.params.id;

    const actorData = {
        actorName: '',
        moviesActed: []
    };

    const actorQuery = `
        SELECT person_name
        FROM person
        WHERE person_id = ?;
    `;

    // Consulta para obtener las películas en las que participó como actor
    const actedQuery = `
        SELECT m.*
        FROM movie_cast mc
        JOIN movie m ON mc.movie_id = m.movie_id
        WHERE mc.person_id = ?;
    `;

    // Ejecutar la consulta para películas en las que actuó
    db.all(actedQuery, [personId], (err, actedRows) => {
        if (!err) {
            actorData.moviesActed = actedRows;

            db.get(actorQuery, [personId], (err, actorRow) => {
                if (!err && actorRow) {
                    actorData.actorName = actorRow.person_name; // Asigna el nombre del actor
                }

                // Renderiza la página del actor y pasa los datos
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

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Crear un nuevo usuario
app.post('/users', (req, res) => {
    const { user_username, user_name, user_email } = req.body;
    const query = `
        INSERT INTO users (user_username, user_name, user_email)
        VALUES (?, ?, ?);
    `;
    db.run(query, [user_username, user_name, user_email], function (err) {
        if (err) {
            res.status(500).send("Error al crear el usuario.");
        } else {
            res.status(201).send({ user_id: this.lastID });
        }
    });
});

// Modificar un usuario existente
app.put('/users/:id', (req, res) => {
    const { id } = req.params;
    const { user_username, user_name, user_email } = req.body;
    const query = `
        UPDATE users
        SET user_username = ?, user_name = ?, user_email = ?
        WHERE user_id = ?;
    `;
    db.run(query, [user_username, user_name, user_email, id], function (err) {
        if (err) {
            res.status(500).send("Error al actualizar el usuario.");
        } else {
            res.send("Usuario actualizado correctamente.");
        }
    });
});

// Eliminar un usuario
app.delete('/users/:id', (req, res) => {
    const { id } = req.params;
    const query = `
        DELETE FROM users WHERE user_id = ?;
    `;
    db.run(query, [id], function (err) {
        if (err) {
            res.status(500).send("Error al eliminar el usuario.");
        } else {
            res.send("Usuario eliminado correctamente.");
        }
    });
});
// PUNTO 6 ////////----------
// creo tablas
//Tabla de Usuarios
// Configuración de la base de datos
//const sqlite3 = require('sqlite3').verbose();
//const db = new sqlite3.Database('./movies.db', (err) => {

        // Crear tablas si no existen
        db.serialize(() => {
            // Crear tabla users
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_username TEXT NOT NULL UNIQUE,
                    user_name TEXT NOT NULL,
                    user_email TEXT NOT NULL UNIQUE
                )
            `, (err) => {
                if (err) {
                    console.error("Error al crear la tabla users:", err.message);
                }
            });

            // Crear tabla movie_user
            db.run(`
                CREATE TABLE IF NOT EXISTS movie_user (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    movie_id INTEGER NOT NULL,
                    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
                    opinion TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(user_id),
                    FOREIGN KEY (movie_id) REFERENCES movie(movie_id)
                )
            `, (err) => {
                if (err) {
                    console.error("Error al crear la tabla movie_user:", err.message);
                }
            });
        });




// Listar todos los usuarios y sus películas con puntuación y opinión
app.get('/users', (req, res) => {
    const query = `
        SELECT u.user_id, u.user_username, u.user_name, u.user_email,
               m.title AS movie_title, mu.rating, mu.opinion
        FROM users u
        LEFT JOIN movie_user mu ON u.user_id = mu.user_id
        LEFT JOIN movie m ON mu.movie_id = m.movie_id
        ORDER BY u.user_id;
    `;
    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).send("Error al listar los usuarios.");
        } else {
            // Estructura los datos en un formato adecuado
            const users = rows.reduce((acc, row) => {
                const user = acc[row.user_id] || {
                    user_id: row.user_id,
                    user_username: row.user_username,
                    user_name: row.user_name,
                    user_email: row.user_email,
                    movies: []
                };
                if (row.movie_title) {
                    user.movies.push({
                        title: row.movie_title,
                        rating: row.rating,
                        opinion: row.opinion
                    });
                }
                acc[row.user_id] = user;
                return acc;
            }, {});
            // Renderizar la vista users.ejs con los datos de usuarios
            res.render('users', { users: Object.values(users) });
        }
    });
});


// Asociar una película a un usuario con puntuación y opinión
app.post('/users/:id/movies', (req, res) => {
    const { id } = req.params;
    const { movie_id, rating, opinion } = req.body;
    const query = `
        INSERT INTO movie_user (user_id, movie_id, rating, opinion)
        VALUES (?, ?, ?, ?);
    `;
    db.run(query, [id, movie_id, rating, opinion], function (err) {
        if (err) {
            res.status(500).send("Error al asociar la película al usuario.");
        } else {
            res.status(201).send("Película asociada al usuario correctamente.");
        }
    });
});

const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Ruta para mostrar el formulario de registro
app.get('/register', (req, res) => {
    res.render('register', { message: null });
});

// Ruta para manejar el envío del formulario de registro
app.post('/register', (req, res) => {
    const { user_username, user_name, user_email } = req.body;

    // SQL para insertar un nuevo usuario
    const query = `
        INSERT INTO users (user_username, user_name, user_email)
        VALUES (?, ?, ?);
    `;

    db.run(query, [user_username, user_name, user_email], (err) => {
        if (err) {
            console.error("Error al registrar el usuario:", err.message);
            res.render('register', { message: "Error al registrar el usuario. Inténtalo de nuevo." });
        } else {
            res.render('register', { message: "Usuario registrado con éxito." });
        }
    });
});

//--------------------------

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor en ejecución en http://localhost:${port}`);
});