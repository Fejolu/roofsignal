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

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "");

  window.location.href = getPortalTarget(email);
});
