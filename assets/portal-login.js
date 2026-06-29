const loginForm = document.querySelector("#portal-login-form");
const resetRequestButton = document.querySelector("[data-password-reset-request]");
const resetPasswordForm = document.querySelector("#password-reset-form");

const fullAccessEmails = new Set([
  "admin@roofsignal.nl",
  "ferry@roofsignal.nl",
]);

function getPortalTarget(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const isRoofSignalUser = normalizedEmail.endsWith("@roofsignal.nl");

  if (!isRoofSignalUser) {
    return "portal-klant.html";
  }

  const params = new URLSearchParams({
    role: fullAccessEmails.has(normalizedEmail) ? "owner-admin" : "support",
    user: normalizedEmail,
  });

  return `portal-beheer.html?${params.toString()}`;
}

function routeForRole(email, profile) {
  const normalizedEmail = email.trim().toLowerCase();
  const role = profile?.role || "";
  const isInternal = normalizedEmail.endsWith("@roofsignal.nl") || ["support", "planning", "finance", "reportage", "owner_admin"].includes(role);
  return isInternal ? "portal-beheer.html" : "portal-klant.html";
}

function setStatus(form, message) {
  const status = form?.querySelector(".portal-route-note");
  if (status) status.textContent = message;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function hasRecoveryMarker() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return searchParams.get("type") === "recovery"
    || hashParams.get("type") === "recovery"
    || searchParams.has("code");
}

async function getRecoverySession(backend) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const session = await backend.getSession();
    if (session) return session;
    await wait(250);
  }

  return null;
}

async function showPasswordResetIfNeeded() {
  if (!hasRecoveryMarker() || !loginForm || !resetPasswordForm) return;

  const backend = window.RoofSignalBackend;
  if (backend?.isConfigured) {
    const session = await getRecoverySession(backend);
    if (!session) {
      setStatus(loginForm, "Resetlink is verlopen of ongeldig. Vraag opnieuw een link aan.");
      return;
    }
  }

  loginForm.hidden = true;
  resetPasswordForm.hidden = false;
  setStatus(resetPasswordForm, "Kies een nieuw wachtwoord voor uw RoofSignal-account.");
}

showPasswordResetIfNeeded();

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const backend = window.RoofSignalBackend;

  if (backend?.isConfigured) {
    const result = await backend.signIn(email, password);
    if (result.ok) {
      const profile = await backend.getProfile();
      window.location.href = routeForRole(email, profile);
      return;
    }

    setStatus(loginForm, result.error?.message || "Inloggen is niet gelukt. Controleer uw gegevens of vraag RoofSignal om toegang.");
    return;
  }

  window.location.href = getPortalTarget(email);
});

resetRequestButton?.addEventListener("click", async () => {
  const emailInput = loginForm?.querySelector("input[name='email']");
  const email = String(emailInput?.value || "").trim();
  const backend = window.RoofSignalBackend;

  emailInput?.setCustomValidity("");

  if (!email || !emailInput?.checkValidity()) {
    emailInput?.setCustomValidity("Vul eerst uw e-mailadres in.");
    emailInput?.reportValidity();
    return;
  }

  if (!backend?.isConfigured) {
    setStatus(loginForm, "Wachtwoordherstel is tijdelijk niet beschikbaar. Mail info@roofsignal.nl voor toegang.");
    return;
  }

  const result = await backend.resetPassword(email);
  setStatus(loginForm, result.ok
    ? "Als dit e-mailadres bekend is, ontvangt u een link om uw wachtwoord opnieuw in te stellen."
    : result.error?.message || "Wachtwoordherstel is niet gelukt. Mail info@roofsignal.nl voor toegang.");
});

resetPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(resetPasswordForm);
  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("password_confirm") || "");
  const backend = window.RoofSignalBackend;

  if (password !== passwordConfirm) {
    setStatus(resetPasswordForm, "De wachtwoorden komen niet overeen.");
    return;
  }

  if (!backend?.isConfigured) {
    setStatus(resetPasswordForm, "Wachtwoord opslaan is tijdelijk niet beschikbaar. Mail info@roofsignal.nl voor toegang.");
    return;
  }

  const result = await backend.updatePassword(password);
  if (!result.ok) {
    setStatus(resetPasswordForm, result.error?.message || "Wachtwoord opslaan is niet gelukt.");
    return;
  }

  await backend.signOut?.();
  resetPasswordForm.reset();
  resetPasswordForm.hidden = true;
  loginForm.hidden = false;
  setStatus(loginForm, "Wachtwoord opgeslagen. U kunt nu opnieuw inloggen.");
});
