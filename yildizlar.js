/* ==========================================================================
   HUKUK-U BEŞER — Gece Göğü Yıldız Simülasyonu (yildizlar.js)
   Hafif, sakin ve saygılı bir arka plan animasyonu.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("yildiz-alani");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var yildizlar = [];
  var azaltilmisHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var genislik = 0;
  var yukseklik = 0;

  function boyutlandir() {
    genislik = window.innerWidth;
    yukseklik = window.innerHeight;
    canvas.width = genislik * DPR;
    canvas.height = yukseklik * DPR;
    canvas.style.width = genislik + "px";
    canvas.style.height = yukseklik + "px";
    yildizOlustur();
  }

  function yildizOlustur() {
    var alan = genislik * yukseklik;
    var sayi = Math.min(220, Math.max(60, Math.round(alan / 8000)));
    yildizlar = [];
    for (var i = 0; i < sayi; i++) {
      var altinMi = Math.random() < 0.12;
      yildizlar.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.1 + 0.4) * DPR,
        temelOpaklik: Math.random() * 0.45 + 0.2,
        faz: Math.random() * Math.PI * 2,
        hiz: Math.random() * 0.0018 + 0.0009,
        dx: (Math.random() - 0.5) * 0.012 * DPR,
        dy: (Math.random() * 0.35 + 0.05) * 0.012 * DPR,
        renk: altinMi ? "212,180,131" : "231,228,220"
      });
    }
  }

  function cizVeAnimasyon(zaman) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < yildizlar.length; i++) {
      var y = yildizlar[i];
      var opaklik = azaltilmisHareket
        ? y.temelOpaklik
        : y.temelOpaklik + Math.sin(zaman * y.hiz + y.faz) * 0.3;
      opaklik = Math.max(0.04, Math.min(1, opaklik));

      if (!azaltilmisHareket) {
        y.x += y.dx;
        y.y += y.dy;
        if (y.x < 0) y.x = canvas.width;
        if (y.x > canvas.width) y.x = 0;
        if (y.y > canvas.height) {
          y.y = 0;
          y.x = Math.random() * canvas.width;
        }
      }

      ctx.beginPath();
      ctx.fillStyle = "rgba(" + y.renk + "," + opaklik + ")";
      ctx.arc(y.x, y.y, y.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(cizVeAnimasyon);
  }

  window.addEventListener("resize", boyutlandir);
  boyutlandir();
  requestAnimationFrame(cizVeAnimasyon);
})();
