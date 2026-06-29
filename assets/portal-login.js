const loginForm = document.querySelector("#portal-login-form");

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

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const status = loginForm.querySelector(".portal-route-note");
  const backend = window.RoofSignalBackend;

  if (backend?.isConfigured) {
    const result = await backend.signIn(email, password);
    if (result.ok) {
      const profile = await backend.getProfile();
      window.location.href = routeForRole(email, profile);
      return;
    }

    if (status) {
      status.textContent = result.error?.message || "Inloggen is niet gelukt. Controleer uw gegevens of vraag RoofSignal om toegang.";
    }
    return;
  }

  window.location.href = getPortalTarget(email);
});
