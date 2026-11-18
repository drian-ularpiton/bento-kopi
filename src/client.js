import { matches, parseHours, isOpen } from "./shared.js";
const form = document.querySelector("#filters");
if (form) {
  const cafes = JSON.parse(document.querySelector("#cafe-data").textContent);
  const cards = [...document.querySelectorAll("[data-cafe]")];
  const params = new URLSearchParams(location.search);
  for (const key of ["q", "area", "suasana", "fasilitas", "harga"]) {
    if (params.has(key)) form.elements[key].value = params.get(key);
  }
  if (!form.querySelector('input[name="suasana"]:checked'))
    form.elements.suasana.value = "";
  const openField = form.elements.buka;
  openField.checked = params.get("buka") === "1" && !openField.disabled;
  function update() {
    const data = new FormData(form);
    const filters = Object.fromEntries(data);
    const now = new Date();
    let count = 0;
    for (const card of cards) {
      const cafe = cafes.find((c) => c.slug === card.dataset.cafe);
      const visible = matches(cafe, filters, now);
      card.hidden = !visible;
      if (visible) count++;
    }
    document.querySelector("#result-count").textContent =
      `${count} kafe ditemukan`;
    document.querySelector("#empty").hidden = count !== 0;
    const query = new URLSearchParams();
    for (const [key, value] of data) if (value) query.set(key, value);
    history.replaceState(
      null,
      "",
      `${location.pathname}${query.size ? "?" + query : ""}${location.hash}`,
    );
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  // A reset button's default action runs after event listeners and microtasks.
  // Wait one task so filtering reads the restored form values.
  form.addEventListener("reset", () => setTimeout(update, 0));
  document
    .querySelector("#empty-reset")
    .addEventListener("click", () => form.reset());
  update();
  setInterval(update, 60000);
}
const status = document.querySelector("[data-hours]");
if (status) {
  function updateStatus() {
    const open = isOpen(parseHours(status.dataset.hours));
    status.hidden = open === null;
    status.textContent = open
      ? "Buka menurut jadwal · WIB"
      : "Tutup menurut jadwal · WIB";
  }
  updateStatus();
  setInterval(updateStatus, 60000);
}
