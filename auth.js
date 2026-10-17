const form = document.querySelector("#auth-form");
const errorMessage = document.querySelector("#auth-error");
const submitButton = document.querySelector("#auth-submit");
const passwordInput = document.querySelector("#auth-password");
const hint = document.querySelector("#auth-hint");
const title = document.querySelector("#auth-title");
let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const selected = button.dataset.authMode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  title.textContent =
    mode === "register"
      ? "Create your Coco & Co. account"
      : "Your Coco & Co. account";
  submitButton.innerHTML =
    mode === "register"
      ? "Create account <span>→</span>"
      : "Sign in <span>→</span>";
  passwordInput.autocomplete =
    mode === "register" ? "new-password" : "current-password";
  passwordInput.minLength = 8;
  passwordInput.placeholder = "At least 8 characters";
  hint.textContent =
    mode === "register"
      ? "Use your email or phone number and choose a password with at least 8 characters."
      : "Sign in with the same email/phone number and password you registered with.";
  errorMessage.textContent = "";
}

function returnToShop() {
  const requested = new URLSearchParams(location.search).get("return") || "/";
  return requested === "/#account" ? requested : "/";
}

async function readApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Authentication server nahi mil raha. Project folder mein `npm start` chalao, phir http://127.0.0.1:4173/auth.html kholo (Live Server ya file:// se nahi).",
    );
  }
  return response.json();
}

async function redirectIfSignedIn() {
  const response = await fetch("/api/session", { credentials: "same-origin" });
  const result = await readApiResponse(response);
  if (!response.ok)
    throw new Error(result.error || "Could not verify your account session.");
  const { user } = result;
  if (user) location.replace(returnToShop());
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  submitButton.disabled = true;
  submitButton.textContent =
    authMode === "register" ? "Creating account…" : "Signing in…";

  try {
    const formData = new FormData(form);
    const response = await fetch(
      `/api/${authMode === "register" ? "register" : "login"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          identifier: formData.get("identifier"),
          password: formData.get("password"),
        }),
      },
    );
    const result = await readApiResponse(response);
    if (!response.ok)
      throw new Error(result.error || "Could not authenticate your account.");
    location.assign(returnToShop());
  } catch (error) {
    errorMessage.textContent =
      error instanceof TypeError
        ? "Could not reach the authentication server. Run npm start and open http://127.0.0.1:4173/."
        : error.message || "Could not authenticate your account.";
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML =
      authMode === "register"
        ? "Create account <span>→</span>"
        : "Sign in <span>→</span>";
  }
});

document.querySelectorAll(".auth-back, .auth-brand").forEach((link) => {
  link.href = returnToShop() === "/#account" ? "/" : returnToShop();
});

redirectIfSignedIn().catch((error) => {
  errorMessage.textContent =
    error instanceof TypeError
      ? "Authentication server se connection nahi ho raha. Project folder mein `npm start` chalao aur http://127.0.0.1:4173/auth.html kholo."
      : error.message;
});
