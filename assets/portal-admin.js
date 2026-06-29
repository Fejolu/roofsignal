(() => {
  const stateKey = "roofsignal-admin-html";
  const roleRights = {
    "Owner admin": "Alles",
    Support: "Support, meekijken, dossiers",
    Planning: "Agenda, inspecties, toegang",
    Finance: "Facturen, offertes, betaalstatus",
    Rapportage: "Rapporten, objectdata, exports",
  };

  const customersBody = document.querySelector("#klanten tbody");
  const rolesBody = document.querySelector(".role-table tbody");
  const roleBuilder = document.querySelector(".role-builder");

  function saveState() {
    localStorage.setItem(stateKey, JSON.stringify({
      customers: customersBody?.innerHTML || "",
      roles: rolesBody?.innerHTML || "",
    }));
  }

  function loadState() {
    try {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      if (state.customers && customersBody) customersBody.innerHTML = state.customers;
      if (state.roles && rolesBody) rolesBody.innerHTML = state.roles;
    } catch {
      localStorage.removeItem(stateKey);
    }
  }

  function statusCell(label, tone = "green") {
    return `<span class="status-dot ${tone}">${label}</span>`;
  }

  function roleCell(role) {
    const ownerClass = role === "Owner admin" ? " owner" : "";
    return `<span class="role-pill${ownerClass}">${role}</span>`;
  }

  function rowFor(actionTarget) {
    return actionTarget.closest("tr");
  }

  function editCustomer(row) {
    const cells = row.querySelectorAll("td");
    const name = prompt("Klantnaam", cells[0].textContent.trim());
    if (!name) return;
    const segment = prompt("Segment", cells[1].textContent.trim());
    if (!segment) return;
    const objects = prompt("Aantal objecten", cells[2].textContent.trim());
    if (objects === null) return;
    const activity = prompt("Laatste activiteit", cells[3].textContent.trim());
    if (!activity) return;

    cells[0].textContent = name;
    cells[1].textContent = segment;
    cells[2].textContent = objects;
    cells[3].textContent = activity;
    saveState();
  }

  function deleteCustomer(row) {
    const name = row.querySelector("td")?.textContent.trim() || "deze klant";
    if (!confirm(`${name} verwijderen uit dit beheerportaal?`)) return;
    row.remove();
    saveState();
  }

  function editRole(row) {
    const cells = row.querySelectorAll("td");
    const email = prompt("E-mailadres", cells[0].textContent.trim());
    if (!email) return;
    const currentRole = cells[1].textContent.trim();
    const role = prompt("Rol", currentRole);
    if (!role) return;

    cells[0].textContent = email;
    cells[1].innerHTML = roleCell(role);
    cells[2].textContent = roleRights[role] || "Aangepaste rechten";
    cells[3].innerHTML = statusCell("Actief");
    saveState();
  }

  function removeRole(row) {
    const email = row.querySelector("td")?.textContent.trim() || "dit teamlid";
    if (!confirm(`Rol van ${email} intrekken?`)) return;
    row.remove();
    saveState();
  }

  function assignRole() {
    const emailInput = roleBuilder?.querySelector("input");
    const roleSelect = roleBuilder?.querySelector("select");
    const email = emailInput?.value.trim().toLowerCase();
    const role = roleSelect?.value || "Support";

    if (!email || !email.endsWith("@roofsignal.nl")) {
      alert("Gebruik een geldig @roofsignal.nl e-mailadres voor interne rollen.");
      emailInput?.focus();
      return;
    }

    if (!rolesBody) return;

    const existing = [...rolesBody.querySelectorAll("tr")].find((row) => {
      return row.querySelector("td")?.textContent.trim().toLowerCase() === email;
    });
    const row = existing || document.createElement("tr");
    row.innerHTML = `<td>${email}</td><td>${roleCell(role)}</td><td>${roleRights[role] || "Aangepaste rechten"}</td><td>${statusCell("Actief")}</td><td><div class="table-actions"><a href="#rechten" data-admin-action="edit-role">Bewerken</a><a class="text-danger" href="#rechten" data-admin-action="remove-role">Verwijderen</a></div></td>`;
    if (!existing) rolesBody.append(row);
    saveState();
  }

  function editCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const current = heading?.textContent.trim().replace(/\.$/, "") || "VvE Parkzicht";
    const name = prompt("Klantnaam", current);
    if (!name || !heading) return;
    heading.textContent = `${name}.`;
    localStorage.setItem("roofsignal-current-customer", name);
  }

  function loadCurrentCustomer() {
    const name = localStorage.getItem("roofsignal-current-customer");
    const heading = document.querySelector(".portal-topbar h1");
    if (name && heading) heading.textContent = `${name}.`;
  }

  function deleteCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const name = heading?.textContent.trim().replace(/\.$/, "") || "deze klant";
    if (!confirm(`${name} verwijderen uit het klantportaal?`)) return;
    document.querySelector(".admin-toolbar p").textContent = "Deze klant is gemarkeerd voor verwijdering. In de live versie wordt dit doorgevoerd in de database en auditlog.";
    localStorage.removeItem("roofsignal-current-customer");
  }

  loadState();
  loadCurrentCustomer();

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-admin-action]");
    if (!target) return;
    const action = target.dataset.adminAction;
    if (action !== "assign-role") event.preventDefault();

    if (action === "assign-role") assignRole();
    if (action === "edit-customer") editCustomer(rowFor(target));
    if (action === "delete-customer") deleteCustomer(rowFor(target));
    if (action === "edit-role") editRole(rowFor(target));
    if (action === "remove-role") removeRole(rowFor(target));
    if (action === "edit-current-customer") editCurrentCustomer();
    if (action === "delete-current-customer") deleteCurrentCustomer();
  });
})();
