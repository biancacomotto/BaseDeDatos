const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const ejs = require('ejs');
const {Database} = require("sqlite3");
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const bcrypt = require('bcrypt');


const app = express();
const port = process.env.PORT || 3000;
//const db = new sqlite3.Database('./movies.db'); //path

// Configuracion


// Serve static files from the "views" directory
app.use(express.static('views'));
app.use(express.static('public'));

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

// Configuración de body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configuración de method-override
app.use(methodOverride('_method'));



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

app.post('/users/:id/edit', (req, res) => {
    const { id } = req.params;
    const { user_username, user_name, user_email } = req.body;

    const query = `UPDATE users SET user_username = ?, user_name = ?, user_email = ? WHERE user_id = ?;`;
    db.run(query, [user_username, user_name, user_email, id], function (err) {
        if (err) {
            console.error(err); // Mostrar el error en la consola para depuración
            return res.status(500).send("Error al actualizar el usuario.");
        } else {
            // Redirigir con un mensaje
            return res.redirect('/users?message=Usuario actualizado correctamente');
        }
    });
});


// Eliminar un usuario
app.post('/users/:id/delete', (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM users WHERE user_id = ?;`;
    db.run(query, [id], function (err) {
        if (err) {
            console.error(err); // Mostrar el error en la consola para depuración
            return res.status(500).send("Error al eliminar el usuario.");
        } else {
            // Redirigir con un mensaje
            return res.redirect('/users?message=Usuario eliminado correctamente');
        }
    });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de la sesión
app.use(session({
    secret: 'tu_secreto', // Cambia esto a un valor único y secreto
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Cambia a true si usas HTTPS
}));

// Ruta para mostrar el formulario de registro
app.get('/register', (req, res) => {
    res.render('register', { message: null });
});

// Ruta para manejar el envío del formulario de registro
app.post('/register', (req, res) => {
    const { user_username, user_name, user_email, user_password } = req.body;

    // Hashear la contraseña
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
    const errorMessage = req.session.error ? req.session.error : '';
    req.session.error = null;

    res.send(`
        <form action="/login" method="POST">
            <label for="user_username">Nombre de usuario:</label>
            <input type="text" name="user_username" id="user_username" required>
            <label for="user_password">Contraseña:</label>
            <input type="password" name="user_password" id="user_password" required>
            <button type="submit">Iniciar sesión</button>
            <div style="color: red;">${errorMessage}</div>
        </form>
    `);
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
                    // Almacena el usuario en la sesión
                    req.session.user = user; // Asegúrate de que esto se esté ejecutando
                    console.log('Usuario autenticado:', req.session.user); // Log de usuario autenticado
                    return res.redirect('/'); // Redirige a la página principal después de iniciar sesión
                } else {
                    req.session.error = 'Contraseña incorrecta.';
                    return res.redirect('/login');
                }
            });
        } else {
            req.session.error = 'Nombre de usuario no encontrado.';
            return res.redirect('/login');
        }
    });
});

// Ruta para mostrar la página principal
app.get('/', (req, res) => {
    console.log('Sesión actual:', req.session); // Log de sesión actual
    const username = req.session.user ? req.session.user.user_name : 'Visitante';

    // Asegúrate de que esta lógica esté bien
    const userLinks = req.session.user ? `
        <a href="/profile">Perfil</a>
        <form action="/logout" method="POST" style="display:inline;">
            <button type="submit">Cerrar sesión</button>
        </form>
    ` : `
        <a href="/login">Iniciar sesión</a>
        <a href="/register">Registrar nuevo usuario</a>
    `;

    // Mensaje de bienvenida para usuarios autenticados
    const welcomeMessage = req.session.user ? `<h1>Bienvenido, ${username}!</h1>` : `<h1>Hola, ${username}!</h1>`;

    res.send(`
        ${welcomeMessage}
        <div>${userLinks}</div>
        <a href="/users">Listar usuarios</a>
    `);
});

// Ruta para mostrar el perfil de usuario
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirige a login si no está autenticado
    }
    console.log('Perfil de usuario:', req.session.user); // Log para verificar los datos del usuario
    res.render('profile', { user: req.session.user }); // Asegúrate de que el render funcione bien
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




//---------------------

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor en ejecución en http://localhost:${port}`);
});