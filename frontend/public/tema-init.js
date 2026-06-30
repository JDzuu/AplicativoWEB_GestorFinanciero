
// Tema oscuro de incio
(function () {
  try {
    var t = localStorage.getItem("tema") || "oscuro";
    var efectivo = t;
    if (t === "sistema") {
      efectivo = window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
    }
    document.documentElement.setAttribute("data-tema", efectivo);
  } catch (e) {
    document.documentElement.setAttribute("data-tema", "oscuro");
  }
})();
