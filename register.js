const mensajeError = document.getElementsByClassName("error")[0];

document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const user_username = e.target.children.user.value;
    const user_email = e.target.children.email.value;
    const user_password = e.target.children.password.value;

    try {
        const res = await fetch("http://localhost:3000/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_username: user_username,
                user_name : user_name,
                user_email: user_email,
                user_password: user_password
            })
        });

        if (!res.ok) {
            // Manejar errores HTTP (4xx o 5xx)
            const errorText = await res.text();
            console.error("Error en el registro:", errorText);
            mensajeError.innerText = "Error al registrar el usuario. Inténtalo de nuevo.";
            mensajeError.classList.toggle("escondido", false);
            return;
        }

        const resJson = await res.json();

        if (resJson.redirect) {
            window.location.href = resJson.redirect;
        }

    } catch (error) {
        // Manejar errores de la red o del cliente
        console.error("Error en la solicitud:", error);
        mensajeError.innerText = "Error en la solicitud. Por favor, inténtalo de nuevo.";
        mensajeError.classList.toggle("escondido", false);
    }
});
