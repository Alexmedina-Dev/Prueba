 /*=========================================
          CLOCK LOGIC
        =========================================*/
        const currentTime = document.getElementById("currentTime");
        const currentDate = document.getElementById("currentDate");

        function updateClock() {
            if (!currentTime || !currentDate) return;
            const now = new Date();
            const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
            const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

            const day = days[now.getDay()];
            const date = now.getDate();
            const month = months[now.getMonth()];
            const year = now.getFullYear();

            let hours = now.getHours().toString().padStart(2, "0");
            let minutes = now.getMinutes().toString().padStart(2, "0");

            currentDate.textContent = `${day}, ${date} ${month} ${year}`;
            currentTime.textContent = `${hours}:${minutes}`;
        }
        setInterval(updateClock, 1000);
        updateClock();

        /*=========================================
          FOOTER YEAR
        =========================================*/
        const yearEl = document.getElementById("currentYear");
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        /*=========================================
          FORM & PASSWORD LOGIC
        =========================================*/
        const togglePassword = document.getElementById("togglePassword");
        const passwordInput = document.getElementById("password");
        const eyeIcon = document.getElementById("eyeIcon");
        const loginForm = document.getElementById("loginForm");
        const loginBtn = document.getElementById("loginBtn");
        const btnText = loginBtn ? loginBtn.querySelector(".text") : null;
        const emailInput = document.getElementById("email");
        const errorMsg = document.getElementById("errorMsg");

        // Credenciales de prueba
        const TEST_USER = {
            email: "admin@gmail.com",
            password: "admin1234"
        };

        if (togglePassword && passwordInput && eyeIcon) {
            togglePassword.addEventListener("click", () => {
                if (passwordInput.type === "password") {
                    passwordInput.type = "text";
                    eyeIcon.classList.replace("fa-eye", "fa-eye-slash");
                } else {
                    passwordInput.type = "password";
                    eyeIcon.classList.replace("fa-eye-slash", "fa-eye");
                }
            });
        }

        if (loginForm) {
            loginForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            loginBtn.disabled = true;
            btnText.textContent = "VERIFICANDO...";

            try {
                const response = await fetch(window.location.origin + '/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok && data.token) {
                    // Login exitoso — guardar token
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));

                    btnText.textContent = "ACCESO CONCEDIDO";
                    loginBtn.style.background = "linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)";

                    setTimeout(() => {
                        window.location.href = "APP/app.html";
                    }, 800);
                } else {
                    // Login falló — mensaje genérico (OWASP)
                    throw new Error(data.error || 'Credenciales incorrectas');
                }
            } catch (err) {
                btnText.textContent = "ERROR";
                loginBtn.style.background = "linear-gradient(135deg, #c0392b 0%, #922b21 100%)";
                errorMsg.classList.add("visible");

                setTimeout(() => {
                    btnText.textContent = "INICIAR SESION";
                    loginBtn.style.background = "";
                    loginBtn.disabled = false;
                    errorMsg.classList.remove("visible");

                    // Limpiar ambos campos por seguridad
                    emailInput.value = "";
                    passwordInput.value = "";
                    emailInput.focus();
                }, 2500);
            }
        });
        }

        /*=========================================
          PARALLAX & INTERACTION
        =========================================*/
        const bikeContainer = document.querySelector(".brand-bike");
        document.addEventListener("mousemove", (e) => {
            if (!bikeContainer || window.innerWidth < 1025) return;
            const x = (window.innerWidth / 2 - e.clientX) / 60;
            const y = (window.innerHeight / 2 - e.clientY) / 60;
            bikeContainer.style.transform = `translate(${x}px, ${y}px)`;
        });

        const inputs = document.querySelectorAll(".input-box input");
        inputs.forEach(input => {
            input.addEventListener("focus", () => {
                input.parentElement.style.transform = "translateY(-4px)";
            });
            input.addEventListener("blur", () => {
                input.parentElement.style.transform = "translateY(0px)";
            });
        });

        /*=========================================
          FORGOT LINK — prevent scroll to top
        =========================================*/
        const forgotLink = document.querySelector(".forgot-link");
        if (forgotLink) {
            forgotLink.addEventListener("click", (e) => {
                e.preventDefault();
            });
        }
