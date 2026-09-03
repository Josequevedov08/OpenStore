(function () {
  var KEY = "appstore-idioma";
  function getLang() {
    try {
      return localStorage.getItem(KEY) === "es" ? "es" : "en";
    } catch (e) {
      return "en";
    }
  }
  function setLang(lang) {
    try {
      localStorage.setItem(KEY, lang);
    } catch (e) {}
    document.querySelectorAll("[data-lang-block]").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-lang-block") === lang);
    });
    // Textos sueltos (fuera de un bloque completo data-lang-block), p.ej. un
    // enlace de pie de página: <a data-lang-en="FAQ" data-lang-es="Preguntas Frecuentes">
    document.querySelectorAll("[data-lang-en]").forEach(function (el) {
      var txt = el.getAttribute(lang === "es" ? "data-lang-es" : "data-lang-en");
      if (txt) el.textContent = txt;
    });
    document.querySelectorAll(".langswitch button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });
    document.documentElement.setAttribute("lang", lang);
  }
  window.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".langswitch button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setLang(btn.getAttribute("data-lang"));
      });
    });
    setLang(getLang());
  });
})();
