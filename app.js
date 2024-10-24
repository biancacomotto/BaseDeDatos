const express = require('express');
const sqlite3 = require('sqlite3');
const ejs = require('ejs');
const {Database} = require("sqlite3");

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the "views" directory
app.use(express.static('views'));

// Configuración de la base de datos
const db = new sqlite3.Database('./movies.db');

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

// Buscador de Keywords

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


// Ruta para la página de datos de una película particular
app.get('/pelicula/:id', (req, res) => {
    const movieId = req.params.id;

    const query = `
    SELECT
      movie.*,
      actor.person_name as actor_name,
      actor.person_id as actor_id,
      crew_member.person_name as crew_member_name,
      crew_member.person_id as crew_member_id,
      movie_cast.character_name,
      movie_cast.cast_order,
      department.department_name,
      movie_crew.job
    FROM movie
    LEFT JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    LEFT JOIN person as actor ON movie_cast.person_id = actor.person_id
    LEFT JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    LEFT JOIN department ON movie_crew.department_id = department.department_id
    LEFT JOIN person as crew_member ON crew_member.person_id = movie_crew.person_id
    WHERE movie.movie_id = ?
  `;

    db.all(query, [movieId], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error al cargar los datos de la película.');
        } else if (rows.length === 0) {
            res.status(404).send('Película no encontrada.');
        } else {
            // Organizar los datos en un objeto de película con elenco y crew
            const movieData = {
                id: rows[0].id,
                title: rows[0].title,
                release_date: rows[0].release_date,
                overview: rows[0].overview,
                directors: [],
                writers: [],
                cast: [],
                crew: [],
            };

            // Crear un objeto para almacenar directores
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    const isDuplicate = movieData.directors.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );

                    if (!isDuplicate) {
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

            // Crear un objeto para almacenar writers
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    const isDuplicate = movieData.writers.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );

                    if (!isDuplicate) {
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

            // Crear un objeto para almacenar el elenco
            rows.forEach((row) => {
                if (row.actor_id && row.actor_name && row.character_name) {
                    const isDuplicate = movieData.cast.some((actor) =>
                        actor.actor_id === row.actor_id
                    );

                    if (!isDuplicate) {
                        movieData.cast.push({
                            actor_id: row.actor_id,
                            actor_name: row.actor_name,
                            character_name: row.character_name,
                            cast_order: row.cast_order,
                        });
                    }
                }
            });

            // Crear un objeto para almacenar el crew
            rows.forEach((row) => {
                if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                    const isDuplicate = movieData.crew.some((crew_member) =>
                        crew_member.crew_member_id === row.crew_member_id
                    );

                    if (!isDuplicate) {
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

            res.render('pelicula', { movie: movieData });
        }
    });
});

// Ruta para mostrar la página de un actor específico
app.get('/actor/:id', (req, res) => {
    const actorId = req.params.id;

    const query = `
    SELECT DISTINCT
      person.person_name as actorName,
      movie.*
    FROM movie
    INNER JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    INNER JOIN person ON person.person_id = movie_cast.person_id
    WHERE movie_cast.person_id = ?;
  `;

    db.all(query, [actorId], (err, movies) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error al cargar las películas del actor.');
        } else {
            const actorName = movies.length > 0 ? movies[0].actorName : '';
            res.render('actor', { actorName, movies });
        }
    });
});

// Ruta para mostrar la página de un director específico
app.get('/director/:id', (req, res) => {
    const directorId = req.params.id;

    const query = `
    SELECT DISTINCT
      person.person_name as directorName,
      movie.*
    FROM movie
    INNER JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    INNER JOIN person ON person.person_id = movie_crew.person_id
    WHERE movie_crew.job = 'Director' AND movie_crew.person_id = ?;
  `;

    db.all(query, [directorId], (err, movies) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error al cargar las películas del director.');
        } else {
            const directorName = movies.length > 0 ? movies[0].directorName : '';
            res.render('director', { directorName, movies });
        }
    });
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor en ejecución en http://localhost:${port}`);
});
