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
