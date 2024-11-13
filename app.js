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
app.use(session({
    secret: 'tu_secreto', // Cambia esto a un valor único y secreto
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Cambia a true si usas HTTPS
}));

// Configuración de la base de datos
const db = new sqlite3.Database('./movies.db');

// Crear la tabla favoritos si no existe
db.run(`
    CREATE TABLE IF NOT EXISTS favoritos (
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
        console.error("Error al crear la tabla favoritos:", err.message);
    } else {
        console.log("Tabla favoritos creada o ya existe.");

        // Crear índice para user_id en favoritos
        db.run(`CREATE INDEX IF NOT EXISTS idx_favoritos_user_id ON favoritos(user_id)`, (err) => {
            if (err) {
                console.error("Error al crear el índice idx_favoritos_user_id:", err.message);
            } else {
                console.log("Índice idx_favoritos_user_id creado o ya existe.");
            }
        });
    }
});

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
        keywords: []
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
             select distinct *
             from movie
             join movie_keywords mk on movie.movie_id = mk.movie_id
             join keyword k on k.keyword_id = mk.keyword_id
             where keyword_name like ?
             order by title asc;
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
 app.get('/pelicula/:id', (req, res) => {
     const movieId = req.params.id;

     // Si no se proporciona un id, redirige a la página de inicio
     if (!movieId) {
         return res.redirect('/');
     }

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
            console.log(movieData.id);

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
            res.render('register', { message: "Error al registrar el usuario. Inténtalo de nuevo." });
            return;
        }

        const query = `
            INSERT INTO users (user_username, user_name, user_email, user_password)
            VALUES (?, ?, ?, ?);
        `;

        db.run(query, [user_username, user_name, user_email, hashedPassword], (err) => {
            if (err) {
                console.error("Error al registrar el usuario:", err.message);
                res.render('register', { message: "Error al registrar el usuario. Inténtalo de nuevo." });
            } else {
                res.render('register', { message: "Usuario registrado con éxito." });
            }
        });
    });
});


// Ruta para mostrar el formulario de inicio de sesión
app.get('/login', (req, res) => {
    const errorMessage = req.session.error || '';
    req.session.error = null;
    res.render('login', { errorMessage });
});


// Ruta para manejar el inicio de sesión
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
                    req.session.user = user;
                    console.log('Inicio de sesión exitoso');
                    return res.redirect('/'); // Redirige a la página principal después de iniciar sesión
                } else {
                    // Contraseña incorrecta
                    return res.render('login', { errorMessage: 'Contraseña incorrecta.', showRegisterButton: false });
                }
            });
        } else {
            // Usuario no encontrado
            return res.render('login', { errorMessage: 'Usuario no existente.', showRegisterButton: true });
        }
    });
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
            return res.status(500).send("Error al obtener usuarios.");
        }
        res.render('users', { users: users, message: null });
    });
});

// Ruta para agregar película a favoritos
app.post('/agregar-pelicula', (req, res) => {
    const { movieId, rating, opinion } = req.body;  // Asegúrate de que movieId está en req.body
    const userId = req.session.user ? req.session.user.user_id : null;


    if (!userId) {
        req.session.error = 'Debe iniciar sesión para agregar una película a favoritos.';
        return res.redirect('/login');
    }

    if (!movieId || !rating) {
        req.session.error = 'Faltan datos necesarios para agregar la película a favoritos.';
        return res.redirect(`/pelicula/${movieId}`); // Si falta algún dato, regresa a la página de la película
    }

    // Verificar si la película existe
    const verificarPeliculaQuery = `SELECT * FROM movie WHERE movie_id = ?`;
    db.get(verificarPeliculaQuery, [movieId], (err, movie) => {
        if (err) {
            console.error("Error al verificar la existencia de la película:", err.message);
            return res.status(500).send("Error al verificar la existencia de la película.");
        }

        if (!movie) {
            req.session.error = 'Película no encontrada en la base de datos.';
            return res.redirect(`/pelicula/${movieId}`);
        }

        // Si la película existe, insertarla en favoritos
        const agregarFavoritoQuery = `
            INSERT INTO favoritos (user_id, movie_id, rating, opinion)
            VALUES (?, ?, ?, ?);
        `;

        db.run(agregarFavoritoQuery, [userId, movieId, rating, opinion], (err) => {
            if (err) {
                console.error("Error al agregar la película a favoritos:", err.message);
                req.session.error = 'Error al agregar la película a favoritos.';
                return res.redirect(`/pelicula/${movieId}`);
            }

            req.session.success = 'Película agregada a la lista de favoritos con éxito.';
            res.redirect(`/`);
        });
    });
});

app.get('/usuario/:userId/peliculas', (req, res) => {
const userId = req.params.userId;

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

    res.render('favoritos', { movies });
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

// Ruta para el perfil
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



// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor en ejecución en http://localhost:${port}`);
});
