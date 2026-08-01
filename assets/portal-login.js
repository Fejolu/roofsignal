const loginForm = document.querySelector("#portal-login-form");
const resetRequestButton = document.querySelector("[data-password-reset-request]");
const resetPasswordForm = document.querySelector("#password-reset-form");

function routeForRole(email, profile) {
  const normalizedEmail = email.trim().toLowerCase();
  const role = profile?.role || "";
  const isInternal = normalizedEmail.endsWith("@roofsignal.nl") || ["support", "planning", "finance", "reportage", "owner_admin"].includes(role);
  return isInternal ? "portal-beheer.html" : "portal-klant.html";
}

function setStatus(form, message, type = "note") {
  const status = form?.querySelector(".portal-route-note");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("form-status", type !== "note");
  status.classList.toggle("success", type === "success");
  status.classList.toggle("error", type === "error");
}

function setSubmitState(form, isLoading, label) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent.trim();
  }

  button.disabled = isLoading;
  button.textContent = label || button.dataset.defaultLabel;
}

function friendlyAuthError(error, fallback) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return "E-mailadres of wachtwoord is niet juist.";
  if (message.includes("email not confirmed")) return "Dit account is nog niet geactiveerd. Gebruik de ontvangen activatielink.";
  if (message.includes("rate limit") || message.includes("too many requests")) return "Er zijn te veel pogingen gedaan. Wacht enkele minuten en probeer het opnieuw.";
  if (message.includes("expired") || message.includes("invalid token")) return "Deze beveiligde link is verlopen of al gebruikt. Vraag een nieuwe link aan.";
  return fallback;
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
    || hashParams.get("type") === "recovery";
}

async function getRecoverySession(backend) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const session = await backend.getSession();
    if (session) return session;
    await wait(250);
  }

  return null;
}

async function routeExistingSession() {
  if (hasRecoveryMarker()) return;

  const backend = window.RoofSignalBackend;
  if (!backend?.isConfigured) return;

  const session = await backend.getSession();
  const email = session?.user?.email;
  if (!email) return;

  const profile = await backend.getProfile();
  window.location.href = routeForRole(email, profile);
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
routeExistingSession();

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const backend = window.RoofSignalBackend;

  if (backend?.isConfigured) {
    setSubmitState(loginForm, true, password ? "Inloggen..." : "Inloglink versturen...");
    setStatus(loginForm, password
      ? "We controleren uw inloggegevens."
      : "We versturen een beveiligde inloglink naar uw e-mailadres.",
    "info");

    const result = await backend.signIn(email, password);
    if (result.ok) {
      if (!password) {
        setSubmitState(loginForm, false, "Inloglink opnieuw versturen");
        setStatus(loginForm, "Inloglink verstuurd. Check uw mailbox en open de link om het RoofSignal Portaal te gebruiken.", "success");
        return;
      }

      const profile = await backend.getProfile();
      window.location.href = routeForRole(email, profile);
      return;
    }

    setSubmitState(loginForm, false);
    setStatus(loginForm, friendlyAuthError(result.error, "Inloggen is niet gelukt. Controleer uw gegevens of vraag RoofSignal om toegang."), "error");
    return;
  }

  setStatus(loginForm, "Inloggen is tijdelijk niet beschikbaar. Probeer het later opnieuw of neem contact op met RoofSignal.", "error");
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
    setStatus(loginForm, "Wachtwoordherstel is tijdelijk niet beschikbaar. Mail info@roofsignal.nl voor toegang.", "error");
    return;
  }

  resetRequestButton.disabled = true;
  resetRequestButton.textContent = "Resetmail versturen...";
  setStatus(loginForm, "We controleren of dit e-mailadres toegang heeft tot het RoofSignal Portaal.", "info");

  try {
    const result = await backend.resetPassword(email);
    setStatus(loginForm, result.ok
      ? "Als dit e-mailadres bekend is, ontvangt u een link om uw wachtwoord opnieuw in te stellen."
      : friendlyAuthError(result.error, "Wachtwoordherstel is niet gelukt. Mail info@roofsignal.nl voor toegang."),
    result.ok ? "success" : "error");
  } catch (error) {
    setStatus(loginForm, error?.message || "Wachtwoordherstel is niet gelukt. Mail info@roofsignal.nl voor toegang.", "error");
  } finally {
    resetRequestButton.disabled = false;
    resetRequestButton.textContent = "Wachtwoord vergeten?";
  }
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
    setStatus(resetPasswordForm, friendlyAuthError(result.error, "Wachtwoord opslaan is niet gelukt."));
    return;
  }

  await backend.signOut?.();
  resetPasswordForm.reset();
  resetPasswordForm.hidden = true;
  loginForm.hidden = false;
  setStatus(loginForm, "Wachtwoord opgeslagen. U kunt nu opnieuw inloggen.", "success");
});
