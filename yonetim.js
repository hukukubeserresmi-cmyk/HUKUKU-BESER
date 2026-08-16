/* ==========================================================================
   HUKUK-U BEŞER — Yönetim Paneli (yonetim.js)
   Statik HTML/CSS/JSON dosyalarını doğrudan GitHub Contents/Git Data API
   üzerinden okuyup güncelleyen, veritabanı ve sunucu gerektirmeyen panel.
   Token yalnızca bu tarayıcıda (localStorage) tutulur, başka yere gönderilmez.
   ========================================================================== */
(function () {
  "use strict";

  var LS = {
    sahibi: "hb-repo-sahibi",
    ad: "hb-repo-adi",
    dal: "hb-repo-dal",
    token: "hb-repo-token"
  };

  var CEKIRDEK_SAYFALAR = ["index.html", "yazilar.html", "arsiv.html", "hakkimizda.html", "iletisim.html", "yonetim.html"];

  function el(id) { return document.getElementById(id); }

  var girdiSahibi = el("repo-sahibi");
  var girdiAd = el("repo-adi");
  var girdiDal = el("repo-dal");
  var girdiToken = el("repo-token");
  var durumEl = el("durum-mesaji");

  if (!girdiSahibi || !durumEl) return; // bu sayfa yonetim.html değilse dur

  /* ---------------------------------------------------------------------- *
   * Yardımcılar: HTML kaçışı, UTF-8<->Base64
   * ---------------------------------------------------------------------- */

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

  function dosyaBase64Oku(dosya) {
    return new Promise(function (resolve, reject) {
      var okuyucu = new FileReader();
      okuyucu.onload = function () {
        var sonuc = okuyucu.result; // "data:...;base64,XXXX"
        var virgul = sonuc.indexOf(",");
        resolve(sonuc.slice(virgul + 1));
      };
      okuyucu.onerror = function () { reject(new Error("Dosya okunamadı.")); };
      okuyucu.readAsDataURL(dosya);
    });
  }

  function slugOlustur(s) {
    var harfler = { "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "İ": "i", "I": "i" };
    var d = String(s).toLowerCase().split("").map(function (ch) { return harfler[ch] || ch; }).join("");
    if (d.normalize) d = d.normalize("NFD").replace(/[̀-ͯ]/g, "");
    d = d.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return d || ("oge-" + Date.now());
  }

  /* ---------------------------------------------------------------------- *
   * Bağlantı ayarları
   * ---------------------------------------------------------------------- */

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

  function baglantiVarMi() {
    var a = ayarlar();
    return !!(a.sahibi && a.ad && a.token);
  }

  function durumGoster(tip, mesaj) {
    durumEl.className = "durum-mesaji " + tip;
    durumEl.textContent = mesaj;
    durumEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function durumTemizle() {
    durumEl.className = "durum-mesaji";
    durumEl.textContent = "";
  }

  /* ---------------------------------------------------------------------- *
   * GitHub API çekirdek motoru
   *   - dosyaOku: Contents API ile tek dosyanın metnini okur (utf-8 varsayılan)
   *   - commitDosyalar: Git Data API ile bir veya birden çok dosyayı TEK,
   *     atomik bir commit halinde oluşturur / günceller / siler.
   * ---------------------------------------------------------------------- */

  function apiKok(a) {
    return "https://api.github.com/repos/" + encodeURIComponent(a.sahibi) + "/" + encodeURIComponent(a.ad);
  }

  function basliklar(a, ekstra) {
    var h = { Authorization: "Bearer " + a.token, Accept: "application/vnd.github+json" };
    if (ekstra) h["Content-Type"] = "application/json";
    return h;
  }

  function apiCagir(url, secenekler) {
    return fetch(url, secenekler).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (hata) {
          throw new Error("GitHub API hatası (HTTP " + res.status + "): " + (hata.message || "bilinmeyen hata"));
        });
      }
      return res.status === 204 ? {} : res.json();
    });
  }

  function dosyaOku(a, yol) {
    var yolKodlu = yol.split("/").map(encodeURIComponent).join("/");
    var url = apiKok(a) + "/contents/" + yolKodlu + "?ref=" + encodeURIComponent(a.dal);
    return fetch(url, { headers: basliklar(a) }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Dosya okunamadı: " + yol + " (HTTP " + res.status + ")");
      return res.json();
    }).then(function (veri) {
      return veri ? base64ToUtf8(veri.content) : null;
    });
  }

  function jsonOku(a, yol, varsayilan) {
    return dosyaOku(a, yol).then(function (metin) {
      if (metin == null) return varsayilan !== undefined ? varsayilan : null;
      return JSON.parse(metin);
    });
  }

  // dosyalar: [{ yol, icerik, encoding: 'utf-8' | 'base64', sil: true|false }]
  function commitDosyalar(a, dosyalar, mesaj) {
    var refUrl = apiKok(a) + "/git/refs/heads/" + encodeURIComponent(a.dal);
    var baseSha;
    var baseTree;

    return apiCagir(refUrl, { headers: basliklar(a) }).then(function (ref) {
      baseSha = ref.object.sha;
      return apiCagir(apiKok(a) + "/git/commits/" + baseSha, { headers: basliklar(a) });
    }).then(function (commitVeri) {
      baseTree = commitVeri.tree.sha;
      return Promise.all(dosyalar.map(function (d) {
        if (d.sil) return null;
        return apiCagir(apiKok(a) + "/git/blobs", {
          method: "POST",
          headers: basliklar(a, true),
          body: JSON.stringify({ content: d.icerik, encoding: d.encoding === "base64" ? "base64" : "utf-8" })
        }).then(function (blob) { return blob.sha; });
      }));
    }).then(function (shaListesi) {
      var agac = dosyalar.map(function (d, i) {
        return { path: d.yol, mode: "100644", type: "blob", sha: d.sil ? null : shaListesi[i] };
      });
      return apiCagir(apiKok(a) + "/git/trees", {
        method: "POST",
        headers: basliklar(a, true),
        body: JSON.stringify({ base_tree: baseTree, tree: agac })
      });
    }).then(function (yeniAgac) {
      return apiCagir(apiKok(a) + "/git/commits", {
        method: "POST",
        headers: basliklar(a, true),
        body: JSON.stringify({ message: mesaj, tree: yeniAgac.sha, parents: [baseSha] })
      });
    }).then(function (yeniCommit) {
      return apiCagir(refUrl, {
        method: "PATCH",
        headers: basliklar(a, true),
        body: JSON.stringify({ sha: yeniCommit.sha })
      });
    });
  }

  function tekDosyaKaydet(a, yol, icerik, mesaj) {
    return commitDosyalar(a, [{ yol: yol, icerik: icerik, encoding: "utf-8" }], mesaj);
  }

  function tekJsonKaydet(a, yol, obj, mesaj) {
    return tekDosyaKaydet(a, yol, JSON.stringify(obj, null, 2), mesaj);
  }

  /* ---------------------------------------------------------------------- *
   * Sekme geçişleri
   * ---------------------------------------------------------------------- */

  var yuklenenSekmeler = {};

  function sekmeAc(hedefId) {
    document.querySelectorAll(".sekme-btn").forEach(function (b) { b.classList.remove("aktif"); });
    document.querySelectorAll(".sekme-panel").forEach(function (p) { p.classList.remove("gorunur"); });
    var btn = document.querySelector('.sekme-btn[data-hedef="' + hedefId + '"]');
    var panel = el(hedefId);
    if (btn) btn.classList.add("aktif");
    if (panel) panel.classList.add("gorunur");

    if (!baglantiVarMi()) return;
    if (hedefId === "sekme-yazilar") yaziSekmesiYukle();
    if (hedefId === "sekme-tema") temaSekmesiYukle();
    if (hedefId === "sekme-menu") menuSekmesiYukle();
    if (hedefId === "sekme-anasayfa") anasayfaSekmesiYukle();
    if (hedefId === "sekme-medya") medyaSekmesiYukle();
    if (hedefId === "sekme-sayfalar") sayfalarSekmesiYukle();
  }

  document.querySelectorAll(".sekme-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { sekmeAc(btn.getAttribute("data-hedef")); });
  });

  /* ======================================================================== *
   * SEKME: YAZILAR + KATEGORİLER
   * ======================================================================== */

  var YAZI_YOLU = "yazilar-veri.json";
  var KATEGORI_YOLU = "kategoriler-veri.json";

  function yaziListesiCiz(kapId, icerik, kategoriler) {
    var kap = el(kapId);
    if (!kap) return;
    var adSozluk = {};
    kategoriler.forEach(function (k) { adSozluk[k.id] = k.ad; });

    if (!icerik.length) {
      kap.innerHTML = '<p style="color:var(--metin-silik);">Henüz yazı eklenmedi.</p>';
      return;
    }
    kap.innerHTML = icerik.map(function (oge) {
      return (
        '<div class="yazi-satiri">' +
          '<div>' +
            '<h4>' + kacis(oge.baslik) + ' <span style="color:var(--altin-soluk); font-size:0.75rem;">— ' + kacis(adSozluk[oge.tur] || oge.tur) + '</span></h4>' +
            '<p>' + kacis(oge.ozet) + '</p>' +
          '</div>' +
          '<div style="display:flex; align-items:center; gap:14px;">' +
            '<span class="yazi-tarih">' + kacis(oge.tarih) + '</span>' +
            '<button type="button" class="sil-btn" data-id="' + kacis(oge.id) + '">Sil</button>' +
          '</div>' +
        '</div>'
      );
    }).join("");

    kap.querySelectorAll(".sil-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { yaziSil(btn.getAttribute("data-id")); });
    });
  }

  function kategoriListesiCiz(yazilar, kategoriler) {
    var kap = el("kategori-liste");
    var secim = el("yeni-tur");
    if (!kap || !secim) return;

    if (!kategoriler.length) {
      kap.innerHTML = '<p style="color:var(--metin-silik);">Henüz kategori tanımlanmadı.</p>';
      secim.innerHTML = "";
      return;
    }

    kap.innerHTML = kategoriler.map(function (k) {
      var sayi = yazilar.filter(function (y) { return y.tur === k.id; }).length;
      return (
        '<div class="yazi-satiri">' +
          '<div><h4>' + kacis(k.ad) + '</h4><p style="color:var(--metin-silik);">' + sayi + ' yazı · id: ' + kacis(k.id) + '</p></div>' +
          '<button type="button" class="sil-btn" data-kat="' + kacis(k.id) + '">Sil</button>' +
        '</div>'
      );
    }).join("");

    kap.querySelectorAll(".sil-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { kategoriSil(btn.getAttribute("data-kat")); });
    });

    secim.innerHTML = kategoriler.map(function (k) {
      return '<option value="' + kacis(k.id) + '">' + kacis(k.ad) + '</option>';
    }).join("");
  }

  function yaziSekmesiYukle() {
    var a = ayarlar();
    var liste = el("mevcut-liste");
    liste.innerHTML = '<p style="color:var(--metin-silik);">Yükleniyor…</p>';
    Promise.all([jsonOku(a, YAZI_YOLU, []), jsonOku(a, KATEGORI_YOLU, [])]).then(function (r) {
      var yazilar = r[0], kategoriler = r[1];
      yaziListesiCiz("mevcut-liste", yazilar, kategoriler);
      kategoriListesiCiz(yazilar, kategoriler);
    }).catch(function (e) {
      durumGoster("hata", e.message);
      liste.innerHTML = "";
    });
  }

  function yaziSil(id) {
    if (!window.confirm("Bu yazıyı silmek istediğinize emin misiniz?")) return;
    var a = ayarlar();
    durumGoster("yukleniyor", "Siliniyor…");
    jsonOku(a, YAZI_YOLU, []).then(function (yazilar) {
      var yeni = yazilar.filter(function (o) { return o.id !== id; });
      return tekJsonKaydet(a, YAZI_YOLU, yeni, "Yazı silindi: " + id).then(function () {
        durumGoster("basarili", "Silindi. Site birkaç dakika içinde güncellenecek.");
        yaziSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function yaziEkle() {
    var a = ayarlar();
    var tur = el("yeni-tur").value;
    var baslik = el("yeni-baslik").value.trim();
    var ozet = el("yeni-ozet").value.trim();
    var tarih = el("yeni-tarih").value.trim() || "Yakında";

    if (!tur) { durumGoster("hata", "Önce en az bir kategori oluşturun."); return; }
    if (!baslik) { durumGoster("hata", "Başlık boş olamaz."); return; }

    durumGoster("yukleniyor", "Ekleniyor…");
    jsonOku(a, YAZI_YOLU, []).then(function (yazilar) {
      var yeniOge = { id: tur + "-" + Date.now(), tur: tur, baslik: baslik, ozet: ozet || "—", tarih: tarih };
      var yeni = yazilar.concat([yeniOge]);
      return tekJsonKaydet(a, YAZI_YOLU, yeni, "Yeni yazı eklendi: " + baslik).then(function () {
        durumGoster("basarili", "Eklendi. Site birkaç dakika içinde güncellenecek.");
        el("yeni-baslik").value = "";
        el("yeni-ozet").value = "";
        el("yeni-tarih").value = "";
        yaziSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function kategoriEkle() {
    var a = ayarlar();
    var ad = el("yeni-kategori-ad").value.trim();
    if (!ad) { durumGoster("hata", "Kategori adı boş olamaz."); return; }
    var id = slugOlustur(ad);

    durumGoster("yukleniyor", "Kategori ekleniyor…");
    jsonOku(a, KATEGORI_YOLU, []).then(function (kategoriler) {
      if (kategoriler.some(function (k) { return k.id === id; })) {
        throw new Error("Bu isimde (veya çok benzer) bir kategori zaten var.");
      }
      var yeni = kategoriler.concat([{ id: id, ad: ad }]);
      return tekJsonKaydet(a, KATEGORI_YOLU, yeni, "Yeni kategori eklendi: " + ad).then(function () {
        durumGoster("basarili", "Kategori eklendi. Site birkaç dakika içinde güncellenecek.");
        el("yeni-kategori-ad").value = "";
        yaziSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function kategoriSil(id) {
    var a = ayarlar();
    jsonOku(a, YAZI_YOLU, []).then(function (yazilar) {
      var kullanimda = yazilar.filter(function (y) { return y.tur === id; }).length;
      if (kullanimda > 0) {
        durumGoster("hata", "Bu kategoride " + kullanimda + " yazı var. Önce onları silin ya da başka kategoriye taşıyın.");
        return;
      }
      if (!window.confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) return;
      durumGoster("yukleniyor", "Kategori siliniyor…");
      jsonOku(a, KATEGORI_YOLU, []).then(function (kategoriler) {
        var yeni = kategoriler.filter(function (k) { return k.id !== id; });
        return tekJsonKaydet(a, KATEGORI_YOLU, yeni, "Kategori silindi: " + id).then(function () {
          durumGoster("basarili", "Kategori silindi. Site birkaç dakika içinde güncellenecek.");
          yaziSekmesiYukle();
        });
      }).catch(function (e) { durumGoster("hata", e.message); });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  /* ======================================================================== *
   * SEKME: TEMA (RENK + FONT)
   * ======================================================================== */

  var STYLE_YOLU = "style.css";
  var RENK_RE = /(\/\*\s*RENK-BASLA\s*\*\/)([\s\S]*?)(\/\*\s*RENK-BITIS\s*\*\/)/;
  var FONT_RE = /(\/\*\s*FONT-BASLA\s*\*\/)([\s\S]*?)(\/\*\s*FONT-BITIS\s*\*\/)/;
  var DEGISKEN_RE = /--([\w-]+)\s*:\s*([^;]+);(\s*\/\*[^*]*\*\/)?/g;

  function blogudekiDegiskenler(blok) {
    var sonuc = [];
    var m;
    DEGISKEN_RE.lastIndex = 0;
    while ((m = DEGISKEN_RE.exec(blok))) {
      sonuc.push({ ad: m[1], deger: m[2].trim(), yorum: m[3] || "" });
    }
    return sonuc;
  }

  function temaSekmesiYukle() {
    var a = ayarlar();
    var renkKap = el("tema-renkler");
    var fontKap = el("tema-fontlar");
    renkKap.innerHTML = fontKap.innerHTML = '<p style="color:var(--metin-silik);">Yükleniyor…</p>';

    dosyaOku(a, STYLE_YOLU).then(function (metin) {
      var renkEslesme = metin.match(RENK_RE);
      var fontEslesme = metin.match(FONT_RE);
      var renkler = renkEslesme ? blogudekiDegiskenler(renkEslesme[2]) : [];
      var fontlar = fontEslesme ? blogudekiDegiskenler(fontEslesme[2]) : [];

      renkKap.innerHTML = renkler.map(function (d) {
        var hexMi = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(d.deger);
        return (
          '<div class="form-grup tema-satir">' +
            '<label>' + kacis(d.ad) + '</label>' +
            '<div style="display:flex; gap:10px; align-items:center;">' +
              (hexMi ? '<input type="color" data-var="' + kacis(d.ad) + '" class="tema-renk-secici" value="' + kacis(d.deger) + '">' : "") +
              '<input type="text" data-var="' + kacis(d.ad) + '" class="tema-deger-girdi" value="' + kacis(d.deger) + '">' +
            '</div>' +
          '</div>'
        );
      }).join("") || '<p style="color:var(--metin-silik);">Renk değişkeni bulunamadı.</p>';

      fontKap.innerHTML = fontlar.map(function (d) {
        return (
          '<div class="form-grup tema-satir">' +
            '<label>' + kacis(d.ad) + '</label>' +
            '<input type="text" data-var="' + kacis(d.ad) + '" class="tema-deger-girdi" value="' + kacis(d.deger) + '">' +
          '</div>'
        );
      }).join("") || '<p style="color:var(--metin-silik);">Font değişkeni bulunamadı.</p>';

      renkKap.querySelectorAll(".tema-renk-secici").forEach(function (secici) {
        secici.addEventListener("input", function () {
          var eslesenMetin = renkKap.querySelector('.tema-deger-girdi[data-var="' + secici.getAttribute("data-var") + '"]');
          if (eslesenMetin) eslesenMetin.value = secici.value;
        });
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function temaKaydet() {
    var a = ayarlar();
    durumGoster("yukleniyor", "Tema kaydediliyor…");

    dosyaOku(a, STYLE_YOLU).then(function (metin) {
      function bloguYenidenYaz(blok, kapId) {
        var girdiler = document.querySelectorAll("#" + kapId + " .tema-deger-girdi");
        var satirlar = [];
        girdiler.forEach(function (g) {
          satirlar.push("  --" + g.getAttribute("data-var") + ": " + g.value.trim() + ";");
        });
        return "\n" + satirlar.join("\n") + "\n  ";
      }

      var yeniMetin = metin;
      if (RENK_RE.test(yeniMetin)) {
        yeniMetin = yeniMetin.replace(RENK_RE, function (tam, bas, ic, bit) {
          return bas + bloguYenidenYaz(ic, "tema-renkler") + bit;
        });
      }
      if (FONT_RE.test(yeniMetin)) {
        yeniMetin = yeniMetin.replace(FONT_RE, function (tam, bas, ic, bit) {
          return bas + bloguYenidenYaz(ic, "tema-fontlar") + bit;
        });
      }

      return tekDosyaKaydet(a, STYLE_YOLU, yeniMetin, "Tema (renk/font) güncellendi").then(function () {
        durumGoster("basarili", "Tema kaydedildi. Site birkaç dakika içinde güncellenecek.");
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  /* ======================================================================== *
   * SEKME: MENÜ + LOGO
   * ======================================================================== */

  var MENU_LI_RE = /<li><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g;
  var MENU_BLOK_RE = /(<!--\s*MENU-BASLA\s*-->)([\s\S]*?)(<!--\s*MENU-BITIS\s*-->)/g;
  var LOGO_BLOK_RE = /(<!--\s*LOGO-BASLA\s*-->)([\s\S]*?)(<!--\s*LOGO-BITIS\s*-->)/;
  var SITEADI_BLOK_RE = /(<!--\s*SITEADI-BASLA\s*-->)([\s\S]*?)(<!--\s*SITEADI-BITIS\s*-->)/;

  function menuOgeSatirlariCiz(ogeler) {
    var kap = el("menu-ogeleri");
    kap.innerHTML = ogeler.map(function (o, i) {
      return (
        '<div class="form-grup tema-satir" data-index="' + i + '" style="display:flex; gap:10px; align-items:flex-end;">' +
          '<div style="flex:1;"><label>Bağlantı (href)</label><input type="text" class="menu-href-girdi" value="' + kacis(o.href) + '"></div>' +
          '<div style="flex:1;"><label>Etiket</label><input type="text" class="menu-label-girdi" value="' + kacis(o.label) + '"></div>' +
          '<button type="button" class="sil-btn menu-oge-sil" data-index="' + i + '">Sil</button>' +
        '</div>'
      );
    }).join("");

    kap.querySelectorAll(".menu-oge-sil").forEach(function (btn) {
      btn.addEventListener("click", function () {
        btn.closest(".tema-satir").remove();
      });
    });
  }

  function menuOgeleriTopla() {
    var satirlar = document.querySelectorAll("#menu-ogeleri .tema-satir");
    var ogeler = [];
    satirlar.forEach(function (s) {
      var href = s.querySelector(".menu-href-girdi").value.trim();
      var label = s.querySelector(".menu-label-girdi").value.trim();
      if (href && label) ogeler.push({ href: href, label: label });
    });
    return ogeler;
  }

  function menuSekmesiYukle() {
    var a = ayarlar();
    el("menu-ogeleri").innerHTML = '<p style="color:var(--metin-silik);">Yükleniyor…</p>';

    dosyaOku(a, "index.html").then(function (metin) {
      var logoEslesme = metin.match(LOGO_BLOK_RE);
      if (logoEslesme) {
        var spanMetni = logoEslesme[2].match(/<span[^>]*>([^<]*)<\/span>/);
        el("menu-logo-metin").value = spanMetni ? spanMetni[1].trim() : "Hukuk-u Beşer";
      }

      var ilkMenuBlok = metin.match(/<!--\s*MENU-BASLA\s*-->([\s\S]*?)<!--\s*MENU-BITIS\s*-->/);
      var ogeler = [];
      if (ilkMenuBlok) {
        var m;
        var liRe = /<li><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g;
        while ((m = liRe.exec(ilkMenuBlok[1]))) {
          ogeler.push({ href: m[1], label: m[2] });
        }
      }
      menuOgeSatirlariCiz(ogeler);
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function menuOgeEkleSatiri() {
    var kap = el("menu-ogeleri");
    var mevcut = menuOgeleriTopla();
    mevcut.push({ href: "", label: "" });
    menuOgeSatirlariCiz(mevcut);
  }

  function menuLiBloguOlustur(ogeler, aktifHref) {
    return "\n      " + ogeler.map(function (o) {
      var aktifSinif = (aktifHref && o.href === aktifHref) ? ' class="aktif"' : "";
      return '<li><a href="' + kacis(o.href) + '"' + aktifSinif + '>' + kacis(o.label) + '</a></li>';
    }).join("\n      ") + "\n    ";
  }

  function menuVeLogoKaydet() {
    var a = ayarlar();
    var ogeler = menuOgeleriTopla();
    var logoMetni = el("menu-logo-metin").value.trim() || "Hukuk-u Beşer";

    if (!ogeler.length) { durumGoster("hata", "Menüde en az bir bağlantı olmalı."); return; }

    durumGoster("yukleniyor", "Menü ve logo güncelleniyor…");

    jsonOku(a, "sayfalar-veri.json", []).then(function (ekSayfalar) {
      var tumSayfalar = CEKIRDEK_SAYFALAR.concat(ekSayfalar.map(function (s) { return s.dosya; }));

      return Promise.all(tumSayfalar.map(function (dosya) { return dosyaOku(a, dosya).then(function (metin) { return { dosya: dosya, metin: metin }; }); }))
        .then(function (dosyaListesi) {
          var degisenler = [];
          dosyaListesi.forEach(function (d) {
            if (!d.metin) return;
            var sayac = 0;
            var yeni = d.metin.replace(MENU_BLOK_RE, function (tam, bas, ic, bit) {
              var aktifHref = sayac === 0 ? d.dosya : null;
              sayac++;
              return bas + menuLiBloguOlustur(ogeler, aktifHref) + bit;
            });

            yeni = yeni.replace(LOGO_BLOK_RE, function (tam, bas, ic, bit) {
              return bas + '\n      <span class="marka-ad">' + kacis(logoMetni) + '</span>\n      ' + bit;
            });
            yeni = yeni.replace(SITEADI_BLOK_RE, function (tam, bas, ic, bit) {
              return bas + kacis(logoMetni) + bit;
            });

            if (yeni !== d.metin) degisenler.push({ yol: d.dosya, icerik: yeni, encoding: "utf-8" });
          });

          if (!degisenler.length) {
            durumGoster("hata", "Değişiklik bulunamadı.");
            return;
          }

          return commitDosyalar(a, degisenler, "Menü ve logo güncellendi").then(function () {
            durumGoster("basarili", degisenler.length + " sayfa güncellendi. Site birkaç dakika içinde yayına yansıyacak.");
          });
        });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  /* ======================================================================== *
   * SEKME: ANA SAYFA METİNLERİ
   * ======================================================================== */

  var ANASAYFA_ALANLARI = [
    { id: "anasayfa-hero-etiket", basla: "HERO-ETIKET-BASLA", bitis: "HERO-ETIKET-BITIS" },
    { id: "anasayfa-hero-baslik", basla: "HERO-BASLIK-BASLA", bitis: "HERO-BASLIK-BITIS" },
    { id: "anasayfa-hero-metin", basla: "HERO-METIN-BASLA", bitis: "HERO-METIN-BITIS" },
    { id: "anasayfa-manifesto-etiket", basla: "MANIFESTO-ETIKET-BASLA", bitis: "MANIFESTO-ETIKET-BITIS" },
    { id: "anasayfa-manifesto-baslik", basla: "MANIFESTO-BASLIK-BASLA", bitis: "MANIFESTO-BASLIK-BITIS" },
    { id: "anasayfa-manifesto-metin", basla: "MANIFESTO-METIN-BASLA", bitis: "MANIFESTO-METIN-BITIS" }
  ];

  function alanDesenOlustur(basla, bitis) {
    return new RegExp("(<!--\\s*" + basla + "\\s*-->)([\\s\\S]*?)(<!--\\s*" + bitis + "\\s*-->)");
  }

  function anasayfaSekmesiYukle() {
    var a = ayarlar();
    dosyaOku(a, "index.html").then(function (metin) {
      ANASAYFA_ALANLARI.forEach(function (alan) {
        var desen = alanDesenOlustur(alan.basla, alan.bitis);
        var eslesme = metin.match(desen);
        var girdi = el(alan.id);
        if (girdi) girdi.value = eslesme ? eslesme[2].trim() : "";
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function anasayfaKaydet() {
    var a = ayarlar();
    durumGoster("yukleniyor", "Ana sayfa metinleri kaydediliyor…");

    dosyaOku(a, "index.html").then(function (metin) {
      var yeni = metin;
      ANASAYFA_ALANLARI.forEach(function (alan) {
        var desen = alanDesenOlustur(alan.basla, alan.bitis);
        var girdi = el(alan.id);
        if (!girdi) return;
        yeni = yeni.replace(desen, function (tam, bas, ic, bit) {
          return bas + girdi.value.trim() + bit;
        });
      });

      return tekDosyaKaydet(a, "index.html", yeni, "Ana sayfa metinleri güncellendi").then(function () {
        durumGoster("basarili", "Kaydedildi. Site birkaç dakika içinde güncellenecek.");
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  /* ======================================================================== *
   * SEKME: MEDYA
   * ======================================================================== */

  var MEDYA_YOLU = "medya-veri.json";

  function medyaListesiCiz(medya) {
    var kap = el("medya-liste");
    if (!medya.length) {
      kap.innerHTML = '<p style="color:var(--metin-silik);">Henüz medya eklenmedi.</p>';
      return;
    }
    kap.innerHTML = medya.map(function (o) {
      return (
        '<div class="yazi-satiri">' +
          '<div><h4>' + kacis(o.baslik) + ' <span style="color:var(--altin-soluk); font-size:0.75rem;">— ' + (o.tur === "video" ? "Video" : "Fotoğraf") + '</span></h4>' +
          '<p style="color:var(--metin-silik);">' + (o.dosya ? kacis(o.dosya) : "dosya yüklenmedi") + '</p></div>' +
          '<button type="button" class="sil-btn" data-id="' + kacis(o.id) + '">Sil</button>' +
        '</div>'
      );
    }).join("");

    kap.querySelectorAll(".sil-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { medyaSil(btn.getAttribute("data-id")); });
    });
  }

  function medyaSekmesiYukle() {
    var a = ayarlar();
    el("medya-liste").innerHTML = '<p style="color:var(--metin-silik);">Yükleniyor…</p>';
    jsonOku(a, MEDYA_YOLU, []).then(medyaListesiCiz).catch(function (e) { durumGoster("hata", e.message); });
  }

  function medyaSil(id) {
    if (!window.confirm("Bu medyayı silmek istediğinize emin misiniz?")) return;
    var a = ayarlar();
    durumGoster("yukleniyor", "Siliniyor…");
    jsonOku(a, MEDYA_YOLU, []).then(function (medya) {
      var yeni = medya.filter(function (o) { return o.id !== id; });
      return tekJsonKaydet(a, MEDYA_YOLU, yeni, "Medya silindi: " + id).then(function () {
        durumGoster("basarili", "Silindi. Site birkaç dakika içinde güncellenecek.");
        medyaSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function medyaEkle() {
    var a = ayarlar();
    var tur = el("yeni-medya-tur").value;
    var baslik = el("yeni-medya-baslik").value.trim();
    var genis = el("yeni-medya-genis").checked;
    var dosyaGirdisi = el("yeni-medya-dosya");
    var dosya = dosyaGirdisi.files && dosyaGirdisi.files[0];

    if (!baslik) { durumGoster("hata", "Başlık boş olamaz."); return; }

    durumGoster("yukleniyor", "Yükleniyor…");

    var idOnEk = tur + "-" + Date.now();
    var isteklerZinciri = jsonOku(a, MEDYA_YOLU, []);

    if (!dosya) {
      isteklerZinciri.then(function (medya) {
        var yeniOge = { id: idOnEk, tur: tur, baslik: baslik, genis: genis, dosya: null };
        var yeni = medya.concat([yeniOge]);
        return tekJsonKaydet(a, MEDYA_YOLU, yeni, "Yeni medya eklendi (dosyasız): " + baslik).then(function () {
          durumGoster("basarili", "Eklendi. Site birkaç dakika içinde güncellenecek.");
          medyaFormuTemizle();
          medyaSekmesiYukle();
        });
      }).catch(function (e) { durumGoster("hata", e.message); });
      return;
    }

    var uzanti = (dosya.name.split(".").pop() || "dat").toLowerCase();
    var hedefYol = "medya/" + idOnEk + "." + uzanti;

    Promise.all([isteklerZinciri, dosyaBase64Oku(dosya)]).then(function (r) {
      var medya = r[0], base64Icerik = r[1];
      var yeniOge = { id: idOnEk, tur: tur, baslik: baslik, genis: genis, dosya: hedefYol };
      var yeni = medya.concat([yeniOge]);

      return commitDosyalar(a, [
        { yol: hedefYol, icerik: base64Icerik, encoding: "base64" },
        { yol: MEDYA_YOLU, icerik: JSON.stringify(yeni, null, 2), encoding: "utf-8" }
      ], "Yeni medya eklendi: " + baslik).then(function () {
        durumGoster("basarili", "Yüklendi. Site birkaç dakika içinde güncellenecek.");
        medyaFormuTemizle();
        medyaSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function medyaFormuTemizle() {
    el("yeni-medya-baslik").value = "";
    el("yeni-medya-genis").checked = false;
    el("yeni-medya-dosya").value = "";
  }

  /* ======================================================================== *
   * SEKME: SAYFA EKLE/SİL
   * ======================================================================== */

  var SAYFA_YOLU = "sayfalar-veri.json";

  function yeniSayfaSablonu(dosya, baslik) {
    return (
      "<!DOCTYPE html>\n" +
      '<html lang="tr">\n' +
      "<head>\n" +
      "<script>(function(){try{if(localStorage.getItem('hb-isik-modu')==='acik'){document.documentElement.classList.add('aydinlik-mod');}}catch(e){}})();</script>\n" +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      "<title>" + kacis(baslik) + " | Hukuk-u Beşer</title>\n" +
      '<link rel="stylesheet" href="style.css">\n' +
      "</head>\n" +
      "<body>\n" +
      '<canvas id="yildiz-alani" aria-hidden="true"></canvas>\n\n' +
      '<button id="isik-dugmesi" class="isik-dugmesi" type="button" aria-pressed="false" aria-label="Işığı aç/kapat">\n' +
      '  <svg class="ampul-ikon" viewBox="0 0 24 24" aria-hidden="true">\n' +
      '    <path d="M12 2.5a6.5 6.5 0 0 0-3.7 11.83c.55.4.95 1.1.95 1.92V16.5a1 1 0 0 0 1 1h3.5a1 1 0 0 0 1-1v-.25c0-.82.4-1.52.95-1.92A6.5 6.5 0 0 0 12 2.5Z"/>\n' +
      '    <line x1="10" y1="20.25" x2="14" y2="20.25"/>\n' +
      '    <line x1="10.6" y1="18.3" x2="13.4" y2="18.3"/>\n' +
      "  </svg>\n" +
      "</button>\n\n" +
      '<header class="site-header">\n' +
      '  <nav class="nav-cubugu">\n' +
      '    <a href="index.html" class="marka">\n' +
      "      <!-- LOGO-BASLA -->\n" +
      '      <span class="marka-ad">Hukuk-u Beşer</span>\n' +
      "      <!-- LOGO-BITIS -->\n" +
      "    </a>\n" +
      '    <button class="nav-toggle" aria-label="Menüyü aç/kapat" onclick="document.querySelector(\'.nav-menu\').classList.toggle(\'acik\')">\n' +
      "      <span></span><span></span><span></span>\n" +
      "    </button>\n" +
      '    <ul class="nav-menu">\n' +
      "      <!-- MENU-BASLA -->\n" +
      '      <li><a href="index.html">Ana Sayfa</a></li>\n' +
      '      <li><a href="yazilar.html">Yazılar</a></li>\n' +
      '      <li><a href="arsiv.html">Arşiv</a></li>\n' +
      '      <li><a href="hakkimizda.html">Hakkımızda</a></li>\n' +
      '      <li><a href="iletisim.html">İletişim</a></li>\n' +
      "      <!-- MENU-BITIS -->\n" +
      "    </ul>\n" +
      "  </nav>\n" +
      "</header>\n\n" +
      "<main>\n" +
      '  <section class="sayfa-basligi">\n' +
      '    <div class="konteyner">\n' +
      "      <h1>" + kacis(baslik) + "</h1>\n" +
      '      <p class="bolum-aciklama" style="margin:0 auto;">Bu sayfa yönetim panelinden oluşturuldu.</p>\n' +
      "    </div>\n" +
      "  </section>\n" +
      "</main>\n\n" +
      '<footer class="site-footer">\n' +
      '  <div class="konteyner">\n' +
      '    <span class="marka-ad"><!-- SITEADI-BASLA -->Hukuk-u Beşer<!-- SITEADI-BITIS --></span>\n' +
      '    <ul class="footer-menu">\n' +
      "      <!-- MENU-BASLA -->\n" +
      '      <li><a href="index.html">Ana Sayfa</a></li>\n' +
      '      <li><a href="yazilar.html">Yazılar</a></li>\n' +
      '      <li><a href="arsiv.html">Arşiv</a></li>\n' +
      '      <li><a href="hakkimizda.html">Hakkımızda</a></li>\n' +
      '      <li><a href="iletisim.html">İletişim</a></li>\n' +
      "      <!-- MENU-BITIS -->\n" +
      "    </ul>\n" +
      '    <p class="footer-alt"><!-- TELIF-BASLA -->© 2026 Hukuk-u Beşer. Tüm hakları saklıdır.<!-- TELIF-BITIS --></p>\n' +
      "  </div>\n" +
      "</footer>\n\n" +
      '<script src="yildizlar.js"></script>\n' +
      '<script src="isik.js"></script>\n' +
      "</body>\n" +
      "</html>\n"
    );
  }

  function sayfaListesiCiz(sayfalar) {
    var kap = el("sayfa-liste");
    var sabitBilgi = '<p style="color:var(--metin-silik); margin-bottom:14px;">Çekirdek sayfalar (Ana Sayfa, Yazılar, Arşiv, Hakkımızda, İletişim, Yönetim) panelden silinemez.</p>';
    if (!sayfalar.length) {
      kap.innerHTML = sabitBilgi + '<p style="color:var(--metin-silik);">Henüz ek sayfa oluşturulmadı.</p>';
      return;
    }
    kap.innerHTML = sabitBilgi + sayfalar.map(function (s) {
      return (
        '<div class="yazi-satiri">' +
          '<div><h4>' + kacis(s.baslik) + '</h4><p style="color:var(--metin-silik);">' + kacis(s.dosya) + '</p></div>' +
          '<button type="button" class="sil-btn" data-dosya="' + kacis(s.dosya) + '">Sil</button>' +
        '</div>'
      );
    }).join("");

    kap.querySelectorAll(".sil-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { sayfaSil(btn.getAttribute("data-dosya")); });
    });
  }

  function sayfalarSekmesiYukle() {
    var a = ayarlar();
    el("sayfa-liste").innerHTML = '<p style="color:var(--metin-silik);">Yükleniyor…</p>';
    jsonOku(a, SAYFA_YOLU, []).then(sayfaListesiCiz).catch(function (e) { durumGoster("hata", e.message); });
  }

  function sayfaEkle() {
    var a = ayarlar();
    var dosyaAdi = el("yeni-sayfa-dosya").value.trim().toLowerCase();
    var baslik = el("yeni-sayfa-baslik").value.trim();

    if (!/^[a-z0-9-]+\.html$/.test(dosyaAdi)) {
      durumGoster("hata", 'Dosya adı yalnızca küçük harf, rakam ve tire içermeli ve ".html" ile bitmeli. Örn: "duyurular.html"');
      return;
    }
    if (!baslik) { durumGoster("hata", "Sayfa başlığı boş olamaz."); return; }
    if (CEKIRDEK_SAYFALAR.indexOf(dosyaAdi) !== -1) { durumGoster("hata", "Bu isim çekirdek bir sayfaya ait, başka bir isim seçin."); return; }

    durumGoster("yukleniyor", "Sayfa oluşturuluyor…");

    jsonOku(a, SAYFA_YOLU, []).then(function (sayfalar) {
      if (sayfalar.some(function (s) { return s.dosya === dosyaAdi; })) {
        throw new Error("Bu dosya adına sahip bir sayfa zaten var.");
      }
      var yeniSayfalar = sayfalar.concat([{ dosya: dosyaAdi, baslik: baslik }]);
      var html = yeniSayfaSablonu(dosyaAdi, baslik);

      return commitDosyalar(a, [
        { yol: dosyaAdi, icerik: html, encoding: "utf-8" },
        { yol: SAYFA_YOLU, icerik: JSON.stringify(yeniSayfalar, null, 2), encoding: "utf-8" }
      ], "Yeni sayfa oluşturuldu: " + dosyaAdi).then(function () {
        durumGoster("basarili", "Sayfa oluşturuldu. Menüye eklemek isterseniz \"Menü + Logo\" sekmesini kullanın.");
        el("yeni-sayfa-dosya").value = "";
        el("yeni-sayfa-baslik").value = "";
        sayfalarSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  function sayfaSil(dosyaAdi) {
    if (!window.confirm('"' + dosyaAdi + '" sayfasını kalıcı olarak silmek istediğinize emin misiniz?')) return;
    var a = ayarlar();
    durumGoster("yukleniyor", "Sayfa siliniyor…");

    jsonOku(a, SAYFA_YOLU, []).then(function (sayfalar) {
      var yeniSayfalar = sayfalar.filter(function (s) { return s.dosya !== dosyaAdi; });
      return commitDosyalar(a, [
        { yol: dosyaAdi, sil: true },
        { yol: SAYFA_YOLU, icerik: JSON.stringify(yeniSayfalar, null, 2), encoding: "utf-8" }
      ], "Sayfa silindi: " + dosyaAdi).then(function () {
        durumGoster("basarili", "Sayfa silindi. Site birkaç dakika içinde güncellenecek.");
        sayfalarSekmesiYukle();
      });
    }).catch(function (e) { durumGoster("hata", e.message); });
  }

  /* ======================================================================== *
   * Olay bağlamaları
   * ======================================================================== */

  el("btn-kaydet-ayar").addEventListener("click", function () {
    ayarlariKaydet();
    durumGoster("basarili", "Ayarlar kaydedildi.");
    sekmeAc(document.querySelector(".sekme-btn.aktif") ? document.querySelector(".sekme-btn.aktif").getAttribute("data-hedef") : "sekme-yazilar");
  });

  el("btn-token-unut").addEventListener("click", function () {
    localStorage.removeItem(LS.token);
    girdiToken.value = "";
    durumGoster("basarili", "Token bu tarayıcıdan silindi.");
  });

  if (el("btn-ekle")) el("btn-ekle").addEventListener("click", yaziEkle);
  if (el("btn-kategori-ekle")) el("btn-kategori-ekle").addEventListener("click", kategoriEkle);
  if (el("btn-tema-kaydet")) el("btn-tema-kaydet").addEventListener("click", temaKaydet);
  if (el("btn-menu-oge-ekle")) el("btn-menu-oge-ekle").addEventListener("click", menuOgeEkleSatiri);
  if (el("btn-menu-kaydet")) el("btn-menu-kaydet").addEventListener("click", menuVeLogoKaydet);
  if (el("btn-anasayfa-kaydet")) el("btn-anasayfa-kaydet").addEventListener("click", anasayfaKaydet);
  if (el("btn-medya-ekle")) el("btn-medya-ekle").addEventListener("click", medyaEkle);
  if (el("btn-sayfa-ekle")) el("btn-sayfa-ekle").addEventListener("click", sayfaEkle);

  ayarlariYukle();
  if (baglantiVarMi()) sekmeAc("sekme-yazilar");
})();
