const CMS_CONFIG = {
  owner: "hukukubeserresmi-cmyk",
  repo: "HUKUKU-BESER",
  branch: "ana",
  cacheMinutes: 10,
};

function _cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CMS_CONFIG.cacheMinutes * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}
function _cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fmBlock, body] = match;
  const data = {};
  fmBlock.split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    data[key] = value;
  });
  return { data, body: body.trim() };
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function fetchCollection(folder) {
  const cacheKey = `cms_${folder}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  const listUrl = `https://api.github.com/repos/${CMS_CONFIG.owner}/${CMS_CONFIG.repo}/contents/${encodePath(folder)}?ref=${CMS_CONFIG.branch}`;
  const listRes = await fetch(listUrl);
  if (!listRes.ok) {
    console.error("İçerik klasörü okunamadı:", folder, listRes.status);
    return [];
  }
  const files = await listRes.json();
  const mdFiles = files.filter((f) => f.name.endsWith(".md"));

  const entries = await Promise.all(
    mdFiles.map(async (f) => {
      const rawRes = await fetch(f.download_url);
      const raw = await rawRes.text();
      const { data, body } = parseFrontMatter(raw);
      return { data, body, filename: f.name };
    })
  );

  entries.sort((a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0));
  _cacheSet(cacheKey, entries);
  return entries;
}

async function renderCollection(containerId, folder, renderItem) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<p class="cms-loading">Yükleniyor…</p>';
  try {
    const entries = await fetchCollection(folder);
    if (!entries.length) {
      container.innerHTML = "<p>Henüz içerik eklenmemiş.</p>";
      return;
    }
    container.innerHTML = entries.map(renderItem).join("\n");
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>İçerikler yüklenirken bir hata oluştu.</p>";
  }
}
