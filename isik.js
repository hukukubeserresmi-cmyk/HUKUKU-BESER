/* ==========================================================================
   HUKUK-U BEŞER — Işık Düğmesi (isik.js)
   Karanlık / aydınlık mod geçişi; oda ışığı gibi çalışır ve tercih
   sayfalar arasında hatırlanır.
   ========================================================================== */
(function () {
  "use strict";

  var dugme = document.getElementById("isik-dugmesi");
  if (!dugme) return;

  var kok = document.documentElement;
  var ANAHTAR = "hb-isik-modu";

  // Başlangıç durumunu düğmeye yansıt (sınıf, flaşı önlemek için head'de zaten uygulandı)
  dugme.setAttribute("aria-pressed", kok.classList.contains("aydinlik-mod") ? "true" : "false");

  dugme.addEventListener("click", function () {
    var yeniDurum = !kok.classList.contains("aydinlik-mod");
    kok.classList.toggle("aydinlik-mod", yeniDurum);
    dugme.setAttribute("aria-pressed", yeniDurum ? "true" : "false");
    try {
      localStorage.setItem(ANAHTAR, yeniDurum ? "acik" : "kapali");
    } catch (e) {
      /* localStorage erişilemezse sorun değil, sadece hatırlanmaz */
    }
  });
})();
