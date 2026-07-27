/* ==========================================================================
   HUKUK-U BEŞER — Yönetim Paneli (yonetim.js)
   yazilar-veri.json dosyasını GitHub Contents API üzerinden okur/günceller.
   Token yalnızca bu tarayıcıda (localStorage) tutulur.
   ========================================================================== */
(function () {
  "use strict";

  var VERI_YOLU = "yazilar-veri.json";
  var LS = {
    sahibi: "hb-repo-sahibi",
    ad: "hb-repo-adi",
    dal: "hb-repo-dal",
    token: "hb-repo-token"
  };

  function el(id) { return document.getElementById(id); }

  var girdiSahibi = el("repo-sahibi");
  var girdiAd = el("repo-adi");
  var girdiDal = el("repo-dal");
  var girdiToken = el("repo-token");
  var durumEl = el("durum-mesaji");
  var listeEl = el("mevcut-liste");

  if (!girdiSahibi || !listeEl) return; // bu sayfa yonetim.html değilse dur

  var turAdlari = { siir: "Şiir", makale: "Makale", deneme: "Deneme" };

  function ayarlariYukle() {
    var s = localStorage.getItem(LS.sahibi);
    var a = localStorage.getItem(LS.ad);
    var d = localStorage.getItem(LS.dal);
    var t = localStorage.getItem(LS.token);
    if (s) girdiSahibi.value = s;
    if (a) girdiAd.value = a;
    if (d) girdiDal.value = d;
    if (t) girdiToken.value = t;
  }

  function ayarlariKaydet() {
    localStorage.setItem(LS.sahibi, girdiSahibi.value.trim());
    localStorage.setItem(LS.ad, girdiAd.value.trim());
    localStorage.setItem(LS.dal, girdiDal.value.trim() || "main");
    localStorage.setItem(LS.token, girdiToken.value.trim());
  }

  function ayarlar() {
    return {
      sahibi: girdiSahibi.value.trim(),
      ad: girdiAd.value.trim(),
      dal: girdiDal.value.trim() || "main",
      token: girdiToken.value.trim()
    };
  }

  function durumGoster(tip, mesaj) {
    durumEl.className = "durum-mesaji " + tip;
    durumEl.textContent = mesaj;
  }

  function durumTemizle() {
    durumEl.className = "durum-mesaji";
    durumEl.textContent = "";
  }

  function kacis(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var ikili = "";
    bytes.forEach(function (b) { ikili += String.fromCharCode(b); });
    return btoa(ikili);
  }

  function base64ToUtf8(b64) {
    var ikili = atob(b64.replace(/\n/g, ""));
    var bayt = new Uint8Array(ikili.length);
    for (var i = 0; i < ikili.length; i++) bayt[i] = ikili.charCodeAt(i);
    return new TextDecoder().decode(bayt);
  }

  function icerikApiUrl(a) {
    return "https://api.github.com/repos/" + encodeURIComponent(a.sahibi) + "/" + encodeURIComponent(a.ad) +
      "/contents/" + encodeURIComponent(VERI_YOLU) + "?ref=" + encodeURIComponent(a.dal);
  }

  function dosyaGetir(a) {
    return fetch(icerikApiUrl(a), {
      headers: {
        Authorization: "Bearer " + a.token,
        Accept: "application/vnd.github+json"
      }
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("Dosya okunamadı (HTTP " + res.status + "). Repo adını, dal adını ve token'ı kontrol edin.");
      }
      return res.json();
    }).then(function (veri) {
      return { sha: veri.sha, icerik: JSON.parse(base64ToUtf8(veri.content)) };
    });
  }

  function dosyaGuncelle(a, yeniIcerik, sha, mesaj) {
    var url = "https://api.github.com/repos/" + encodeURIComponent(a.sahibi) + "/" + encodeURIComponent(a.ad) +
      "/contents/" + encodeURIComponent(VERI_YOLU);
    return fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + a.token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: mesaj,
        content: utf8ToBase64(JSON.stringify(yeniIcerik, null, 2)),
        sha: sha,
        branch: a.dal
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (hata) {
          throw new Error("Kaydedilemedi (HTTP " + res.status + "): " + (hata.message || "bilinmeyen hata"));
        });
      }
      return res.json();
    });
  }

  function listeyiCiz(icerik) {
    if (!icerik.length) {
      listeEl.innerHTML = '<p style="color:var(--metin-silik);">Henüz yazı eklenmedi.</p>';
      return;
    }
    listeEl.innerHTML = icerik.map(function (oge) {
      return (
        '<div class="yazi-satiri">' +
          '<div>' +
            '<h4>' + kacis(oge.baslik) + ' <span style="color:var(--altin-soluk); font-size:0.75rem;">— ' + kacis(turAdlari[oge.tur] || oge.tur) + '</span></h4>' +
            '<p>' + kacis(oge.ozet) + '</p>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:14px;">' +
            '<span class="yazi-tarih">' + kacis(oge.tarih) + '</span>' +
            '<button type="button" class="sil-btn" data-id="' + kacis(oge.id) + '">Sil</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    listeEl.querySelectorAll(".sil-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { yaziSil(btn.getAttribute("data-id")); });
    });
  }

  function listeyiYenile() {
    var a = ayarlar();
    if (!a.sahibi || !a.ad || !a.token) {
      listeEl.innerHTML = '<p style="color:var(--metin-silik);">Listeyi görmek için önce bağlantı ayarlarını girip "Kaydet ve Bağlan" butonuna basın.</p>';
      return;
    }
    durumGoster("yukleniyor", "Yazılar yükleniyor…");
    dosyaGetir(a).then(function (r) {
      durumTemizle();
      listeyiCiz(r.icerik);
    }).catch(function (e) {
      durumGoster("hata", e.message);
      listeEl.innerHTML = "";
    });
  }

  function yaziSil(id) {
    if (!window.confirm("Bu yazıyı silmek istediğinize emin misiniz?")) return;
    var a = ayarlar();
    durumGoster("yukleniyor", "Siliniyor…");
    dosyaGetir(a).then(function (r) {
      var yeni = r.icerik.filter(function (o) { return o.id !== id; });
      return dosyaGuncelle(a, yeni, r.sha, "Yazı silindi: " + id).then(function () {
        durumGoster("basarili", "Silindi. Site birkaç dakika içinde güncellenecek.");
        listeyiCiz(yeni);
      });
    }).catch(function (e) {
      durumGoster("hata", e.message);
    });
  }

  function yaziEkle() {
    var a = ayarlar();
    if (!a.sahibi || !a.ad || !a.token) {
      durumGoster("hata", "Önce bağlantı ayarlarını kaydedin.");
      return;
    }
    var tur = el("yeni-tur").value;
    var baslik = el("yeni-baslik").value.trim();
    var ozet = el("yeni-ozet").value.trim();
    var tarih = el("yeni-tarih").value.trim() || "Yakında";

    if (!baslik) {
      durumGoster("hata", "Başlık boş olamaz.");
      return;
    }

    durumGoster("yukleniyor", "Ekleniyor…");
    dosyaGetir(a).then(function (r) {
      var yeniOge = {
        id: tur + "-" + Date.now(),
        tur: tur,
        baslik: baslik,
        ozet: ozet || "—",
        tarih: tarih
      };
      var yeni = r.icerik.concat([yeniOge]);
      return dosyaGuncelle(a, yeni, r.sha, "Yeni yazı eklendi: " + baslik).then(function () {
        durumGoster("basarili", "Eklendi. Site birkaç dakika içinde güncellenecek.");
        listeyiCiz(yeni);
        el("yeni-baslik").value = "";
        el("yeni-ozet").value = "";
        el("yeni-tarih").value = "";
      });
    }).catch(function (e) {
      durumGoster("hata", e.message);
    });
  }

  el("btn-kaydet-ayar").addEventListener("click", function () {
    ayarlariKaydet();
    durumGoster("basarili", "Ayarlar kaydedildi.");
    listeyiYenile();
  });

  el("btn-token-unut").addEventListener("click", function () {
    localStorage.removeItem(LS.token);
    girdiToken.value = "";
    durumGoster("basarili", "Token bu tarayıcıdan silindi.");
  });

  el("btn-ekle").addEventListener("click", yaziEkle);

  ayarlariYukle();
  if (ayarlar().token) listeyiYenile();
})();
