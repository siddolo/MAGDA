(() => {
  "use strict";

  const grid = document.getElementById("grid");
  const subtitle = document.getElementById("subtitle");
  const pager = document.getElementById("pager");
  const errorBox = document.getElementById("error");
  const statusDot = document.getElementById("status-dot");
  const modeBtn = document.getElementById("mode");
  const autoBtn = document.getElementById("auto");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const directionTabs = document.querySelector(".direction-tabs");
  const brandTitle = document.getElementById("brand-title");
  const brandRoute = document.getElementById("brand-route");
  const statsToggle = document.getElementById("stats-toggle");
  const statsTotal = document.getElementById("stats-total");
  const statsBackdrop = document.getElementById("stats-backdrop");
  const statsPanel = document.getElementById("stats-panel");
  const statsClose = document.getElementById("stats-close");
  const statsBody = document.getElementById("stats-body");
  const statsAttrib = document.getElementById("stats-attrib");
  const privacyToggle = document.getElementById("privacy-toggle");
  const privacyBackdrop = document.getElementById("privacy-backdrop");
  const privacyPanel = document.getElementById("privacy-panel");
  const privacyClose = document.getElementById("privacy-close");

  const routeToggle = document.getElementById("route-toggle");
  const welcomeBg = document.getElementById("welcome-bg");
  const routeBackdrop = document.getElementById("route-backdrop");
  const routePanel = document.getElementById("route-panel");
  const routeClose = document.getElementById("route-close");
  const routeFrom = document.getElementById("route-from");
  const routeTo = document.getElementById("route-to");
  const suggestFrom = document.getElementById("suggest-from");
  const suggestTo = document.getElementById("suggest-to");
  const routeBothDirections = document.getElementById("route-both-directions");
  const routeSubmit = document.getElementById("route-submit");
  const routeStatus = document.getElementById("route-status");

  const DATA_REFRESH_MS = 60_000;
  const SNAPSHOT_REFRESH_MS = 10_000;
  const AUTO_ROTATE_MS = 20_000;
  const SUGGEST_DEBOUNCE_MS = 350;

  const DATA_URL = "./data/webcams.json";
  const WELCOME_GROUP_COUNT = 10;
  const WELCOME_IMAGE_COUNT = 8;
  const DEFAULT_ROAD = "A01";
  const DEFAULT_KM_FROM = 570;
  const DEFAULT_KM_TO = 705;
  const DEFAULT_RADIUS = 1500;
  const MAX_RADIUS = 10_000;
  const PHOTON_URL = "https://photon.komoot.io/api/";
  const PHOTON_BBOX = "6.6,35.5,18.6,47.2";
  const PHOTON_LIMIT = 20;
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
  const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
  const PHOTON_INTERVAL = 250;
  const NOMINATIM_INTERVAL = 1100;
  const GEO_CACHE_TTL = 24 * 60 * 60 * 1000;
  const MOBILE_QUERY =
    "(max-width: 700px), (max-width: 950px) and (max-height: 500px)";
  const compactQuery = window.matchMedia("(max-width: 1000px)");
  const mobileQuery = window.matchMedia(MOBILE_QUERY);

  const DIRECTIONS = {
    nord: { label: "verso Roma", route: "NORD" },
    sud: { label: "verso Napoli", route: "SUD" },
  };

  const CAMERA_DIRECTIONS = {
    nord: { label: "NORD", hint: "carreggiata nord" },
    sud: { label: "SUD", hint: "carreggiata sud" },
    est: { label: "EST", hint: "carreggiata est" },
    ovest: { label: "OVEST", hint: "carreggiata ovest" },
  };

  const STATS_CATEGORIES = [
    ["autostrade", "Autostrade ASPI/gruppo"],
    ["tangenziali", "Tangenziali"],
    ["complanari", "Complanare"],
    ["altre", "Altre strade"],
  ];

  const DIRECTION_SECTORS = {
    nord: new Set(["N", "NE", "NW"]),
    sud: new Set(["S", "SE", "SW"]),
    est: new Set(["E", "NE", "SE"]),
    ovest: new Set(["W", "NW", "SW"]),
  };
  const OPPOSITE_DIRECTION = { nord: "sud", sud: "nord", est: "ovest", ovest: "est" };
  const PLACE_TYPE_RANK = {
    city: 0,
    municipality: 1,
    administrative: 1,
    town: 1,
    village: 2,
    hamlet: 3,
    suburb: 4,
    quarter: 5,
    borough: 5,
    neighbourhood: 6,
  };

  const state = {
    cameras: [],
    allCameras: [],
    stats: null,
    statsFetchedAt: "",
    dataPromise: null,
    geoCache: new Map(),
    photonLast: 0,
    nominatimLast: 0,
    direction: "nord",
    view: "fixed",
    route: null,
    routeFrom: null,
    routeTo: null,
    formFrom: null,
    formTo: null,
    routeDirection: "out",
    routeBothDirections: false,
    welcomeMode: false,
    routeSignature: "",
    pendingRoute: null,
    page: 0,
    cols: 2,
    mode: "video",
    auto: true,
    nonce: 0,
    signature: "",
    dataTimer: null,
    snapshotTimer: null,
    autoTimer: null,
    failed: false,
    suggestionTimers: { from: null, to: null },
    suggestionControllers: { from: null, to: null },
    suggestionSeq: { from: 0, to: 0 },
    suggestions: { from: [], to: [] },
  };

  const isMobile = () => mobileQuery.matches;
  const isCompact = () => compactQuery.matches;
  const effectiveCols = () => {
    if (isMobile()) return 1;
    if (isCompact() && typeof state.cols === "number") {
      return Math.min(state.cols, 3);
    }
    return state.cols;
  };
  const isWall = () => isMobile() || effectiveCols() === "all";
  const perPage = () => {
    const cols = effectiveCols();
    return cols === "all" ? Infinity : cols * cols;
  };

  function filteredCameras() {
    if (state.view === "route") {
      if (!state.route) return [];
      const matchKey = state.routeDirection === "out" ? "matchOut" : "matchIn";
      const progressKey =
        state.routeDirection === "out" ? "progressOut" : "progressIn";
      const list = state.route.cameras.filter((camera) => camera[matchKey]);
      return list
        .slice()
        .sort((a, b) => (a[progressKey] ?? 0) - (b[progressKey] ?? 0));
    }

    return state.cameras
      .filter((camera) => camera.direction === state.direction)
      .sort((a, b) =>
        state.direction === "nord" ? b.km - a.km : a.km - b.km
      );
  }

  function pageCount(list = filteredCameras()) {
    return isWall()
      ? 1
      : Math.max(1, Math.ceil(list.length / perPage()));
  }

  function relativeDirection(direction) {
    if (state.view === "fixed") {
      if (direction === "nord") return { label: "NORD", hint: "verso Roma" };
      if (direction === "sud") return { label: "SUD", hint: "verso Napoli" };
    }
    return CAMERA_DIRECTIONS[direction] || { label: "—", hint: "" };
  }

  function formatCaptured(value) {
    if (!value) return "";
    const parts = value.trim().split(/\s+/);
    if (parts.length < 2) return value;
    const [date, time] = parts;
    const bits = date.split("-");
    if (bits.length === 3) {
      return `${bits[0]}/${bits[1]} ${time.slice(0, 5)}`;
    }
    return value;
  }

  function formatDistance(meters) {
    const km = (Number(meters) || 0) / 1000;
    return km >= 100 ? km.toFixed(0) : km.toFixed(1).replace(".", ",");
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  }

  function showError(message) {
    state.failed = true;
    statusDot.classList.add("is-error");
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  function clearError() {
    state.failed = false;
    statusDot.classList.remove("is-error");
    errorBox.hidden = true;
  }

  function withCacheBuster(base, version) {
    if (!base) return "";
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}t=${encodeURIComponent(version || Date.now())}`;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchJson(url, options = {}) {
    const { timeout = 15_000, ...rest } = options;
    const signal =
      rest.signal ||
      (typeof AbortSignal !== "undefined" && AbortSignal.timeout
        ? AbortSignal.timeout(timeout)
        : undefined);
    const response = await fetch(url, {
      ...rest,
      signal,
      headers: { Accept: "application/json", ...(rest.headers || {}) },
    });
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
    if (!response.ok) {
      throw new Error(
        (data && data.error) || `Errore HTTP ${response.status}`
      );
    }
    if (!data || typeof data !== "object") {
      throw new Error("Risposta non valida");
    }
    return data;
  }

  function defaultCameras(cameras) {
    return cameras
      .filter(
        (camera) =>
          camera.code === DEFAULT_ROAD &&
          Number.isFinite(camera.km) &&
          camera.km >= DEFAULT_KM_FROM &&
          camera.km <= DEFAULT_KM_TO
      )
      .sort((a, b) => b.km - a.km);
  }

  function loadData(force = false) {
    if (force || !state.dataPromise) {
      const url = force ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
      state.dataPromise = fetch(url, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(
                "archivio webcam non trovato: esegui " +
                  "`python3 scripts/update_webcams.py`"
              );
            }
            throw new Error(`errore HTTP ${response.status}`);
          }
          const data = await response.json();
          if (!Array.isArray(data.cameras)) {
            throw new Error("formato dell'archivio webcam non valido");
          }
          state.allCameras = data.cameras;
          state.cameras = defaultCameras(data.cameras);
          state.statsFetchedAt = data.fetchedAt || "";
          return data;
        })
        .catch((error) => {
          state.dataPromise = null;
          throw error;
        });
    }
    return state.dataPromise;
  }

  function compareTuples(a, b) {
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if (a[index] < b[index]) return -1;
      if (a[index] > b[index]) return 1;
    }
    return a.length - b.length;
  }

  function placeLabel(properties, name) {
    const parts = [name];
    const county = (properties.county || "").trim();
    const stateName = (properties.state || "").trim();
    const country = (properties.country || "").trim();
    if (county && county.toLocaleLowerCase("it") !== name.toLocaleLowerCase("it")) {
      parts.push(county);
    }
    if (
      stateName &&
      ![name, county].some(
        (value) =>
          value &&
          value.toLocaleLowerCase("it") === stateName.toLocaleLowerCase("it")
      )
    ) {
      parts.push(stateName);
    }
    if (country) parts.push(country);
    return parts.join(", ");
  }

  function nameMatchScore(name, needle) {
    const full = name.toLocaleLowerCase("it");
    const variants = full
      .split(/\s*[\/\-–—]\s*/)
      .map((variant) => variant.trim())
      .filter(Boolean);
    if (full === needle || variants.includes(needle)) return 0;
    if (full.startsWith(needle) || variants.some((variant) => variant.startsWith(needle))) {
      return 1;
    }
    return 2;
  }

  async function photonThrottle() {
    const wait = PHOTON_INTERVAL - (Date.now() - state.photonLast);
    if (wait > 0) await sleep(wait);
    state.photonLast = Date.now();
  }

  async function nominatimThrottle() {
    const wait = NOMINATIM_INTERVAL - (Date.now() - state.nominatimLast);
    if (wait > 0) await sleep(wait);
    state.nominatimLast = Date.now();
  }

  async function geocodePhoton(query) {
    await photonThrottle();
    const params = new URLSearchParams({
      q: query,
      limit: String(PHOTON_LIMIT),
      bbox: PHOTON_BBOX,
      lang: "default",
    });
    const data = await fetchJson(`${PHOTON_URL}?${params.toString()}`, {
      timeout: 8000,
    });
    const features = Array.isArray(data.features) ? data.features : [];
    const needle = query.toLocaleLowerCase("it");
    const candidates = [];

    features.forEach((item, index) => {
      const properties = item.properties || {};
      if ((properties.countrycode || "").toUpperCase() !== "IT") return;
      if (!["place", "boundary"].includes(properties.osm_key || "")) return;
      const name = (properties.name || "").trim();
      if (!name) return;
      const matchScore = nameMatchScore(name, needle);
      const placeType = (properties.type || "").toLocaleLowerCase("it");
      const osmValue = (properties.osm_value || "").toLocaleLowerCase("it");
      if (matchScore > 0) {
        if (
          ["county", "state", "country", "region", "province"].includes(placeType)
        ) {
          return;
        }
        if (
          ["locality", "neighbourhood", "suburb", "quarter", "borough", "district"].includes(
            placeType
          ) &&
          !["hamlet", "village"].includes(osmValue)
        ) {
          return;
        }
        if (
          ["county", "state", "country", "region", "province", "isolated_dwelling"].includes(
            osmValue
          )
        ) {
          return;
        }
      }
      const coordinates = (item.geometry && item.geometry.coordinates) || [];
      if (coordinates.length < 2) return;
      const lon = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const rank =
        PLACE_TYPE_RANK[osmValue] ?? PLACE_TYPE_RANK[placeType] ?? 9;
      candidates.push([
        matchScore,
        rank,
        name.toLocaleLowerCase("it").length,
        index,
        {
          name,
          label: placeLabel(properties, name),
          lat,
          lon,
          type: placeType || osmValue,
          category: properties.osm_key || "",
          importance: 0,
          dedupe: [
            name.toLocaleLowerCase("it"),
            (properties.state || "").toLocaleLowerCase("it"),
            (properties.countrycode || "").toUpperCase(),
          ],
        },
      ]);
    });

    candidates.sort((a, b) => compareTuples(a.slice(0, 4), b.slice(0, 4)));
    const results = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const result = candidate[4];
      const key = result.dedupe.join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      delete result.dedupe;
      results.push(result);
      if (results.length >= 8) break;
    }

    const prefixed = results.filter(
      (result) => nameMatchScore(result.name, needle) <= 1
    );
    return prefixed.length ? prefixed : results;
  }

  async function geocodeNominatim(query) {
    await nominatimThrottle();
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      countrycodes: "it",
      limit: "8",
      addressdetails: "1",
      "accept-language": "it",
    });
    const data = await fetchJson(`${NOMINATIM_URL}?${params.toString()}`, {
      timeout: 8000,
    });
    const results = [];
    const seen = new Set();
    for (const item of Array.isArray(data) ? data : []) {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const address = item.address || {};
      const displayName = item.display_name || item.name || query;
      const name = item.name || displayName.split(",")[0];
      let label = placeLabel(address, name);
      if (label === name) label = displayName;
      const key = [
        name.toLocaleLowerCase("it"),
        (address.state || "").toLocaleLowerCase("it"),
      ].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        name,
        label,
        lat,
        lon,
        type: item.type || "",
        category: item.category || "",
        importance: item.importance || 0,
      });
    }
    const needle = query.toLocaleLowerCase("it");
    const prefixed = results.filter(
      (result) => nameMatchScore(result.name, needle) <= 1
    );
    return prefixed.length ? prefixed : results;
  }

  async function geocode(query) {
    const q = (query || "").trim();
    if (q.length < 2) return [];
    const key = q.toLocaleLowerCase("it");
    const cached = state.geoCache.get(key);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
      return cached.results;
    }

    let results = [];
    let primaryError = null;
    try {
      results = await geocodePhoton(q);
    } catch (error) {
      primaryError = error;
    }
    if (!results.length) {
      try {
        results = await geocodeNominatim(q);
      } catch (error) {
        if (primaryError) {
          throw new Error("servizio di ricerca non disponibile");
        }
      }
    }

    state.geoCache.set(key, { ts: Date.now(), results });
    return results;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const radius = 6371000;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dp / 2) ** 2 +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(a));
  }

  function bearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x =
      Math.cos(p1) * Math.sin(p2) -
      Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
  }

  function compassSector(bearing) {
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return names[Math.floor((bearing + 22.5) / 45) % 8];
  }

  function prepareSegments(coords, cell = 0.05) {
    const segments = [];
    const gridMap = new Map();
    let total = 0;

    for (let index = 0; index < coords.length - 1; index += 1) {
      const lon1 = coords[index][0];
      const lat1 = coords[index][1];
      const lon2 = coords[index + 1][0];
      const lat2 = coords[index + 1][1];
      const length = haversine(lat1, lon1, lat2, lon2);
      if (length < 1) continue;

      const segment = [
        lat1,
        lon1,
        lat2,
        lon2,
        length,
        bearingDeg(lat1, lon1, lat2, lon2),
        total,
      ];
      segments.push(segment);
      const segIndex = segments.length - 1;

      const minLat = Math.min(lat1, lat2);
      const maxLat = Math.max(lat1, lat2);
      const minLon = Math.min(lon1, lon2);
      const maxLon = Math.max(lon1, lon2);
      const ilat0 = Math.floor(minLat / cell);
      const ilat1 = Math.floor(maxLat / cell);
      const ilon0 = Math.floor(minLon / cell);
      const ilon1 = Math.floor(maxLon / cell);
      for (let ilat = ilat0; ilat <= ilat1; ilat += 1) {
        for (let ilon = ilon0; ilon <= ilon1; ilon += 1) {
          const gridKey = `${ilat}:${ilon}`;
          if (!gridMap.has(gridKey)) gridMap.set(gridKey, []);
          gridMap.get(gridKey).push(segIndex);
        }
      }
      total += length;
    }
    return { segments, gridMap, total };
  }

  function nearestOnRoute(lat, lon, prepared, cell = 0.05, searchCells = 2) {
    const { segments, gridMap, total } = prepared;
    const ilat = Math.floor(lat / cell);
    const ilon = Math.floor(lon / cell);
    const candidates = new Set();
    for (let row = ilat - searchCells; row <= ilat + searchCells; row += 1) {
      for (let col = ilon - searchCells; col <= ilon + searchCells; col += 1) {
        for (const item of gridMap.get(`${row}:${col}`) || []) {
          candidates.add(item);
        }
      }
    }
    if (!candidates.size) return null;

    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110540;
    let bestDistance = Infinity;
    let bestIndex = null;
    let bestT = 0;

    for (const index of candidates) {
      const [lat1, lon1, lat2, lon2, length] = segments[index];
      const ax = (lon1 - lon) * kx;
      const ay = (lat1 - lat) * ky;
      const bx = (lon2 - lon) * kx;
      const by = (lat2 - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const den = dx * dx + dy * dy;
      const t = den === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den));
      const distance = Math.hypot(ax + t * dx, ay + t * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        bestT = t;
      }
    }

    if (bestIndex === null) return null;
    const [, , , , length, bearing, cumulative] = segments[bestIndex];
    const progress = cumulative + bestT * length;
    return {
      distance: bestDistance,
      bearing,
      progress,
      progressIn: total - progress,
    };
  }

  function matchRouteCameras(geometry, radius, cameras) {
    const prepared = prepareSegments(geometry);
    const matched = [];

    for (const camera of cameras) {
      const lat = Number(camera.lat);
      const lon = Number(camera.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const hit = nearestOnRoute(lat, lon, prepared);
      if (!hit || hit.distance > radius) continue;
      matched.push({
        ...camera,
        distanceToRoute: Math.round(hit.distance * 10) / 10,
        bearing: Math.round(hit.bearing * 10) / 10,
        progressOut: Math.round(hit.progress * 10) / 10,
        progressIn: Math.round(hit.progressIn * 10) / 10,
      });
    }

    const groups = new Map();
    for (const camera of matched) {
      const key = camera.code || camera.road;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(camera);
    }

    for (const group of groups.values()) {
      const votesOut = new Map();
      const votesIn = new Map();
      for (const camera of group) {
        const label = camera.direction;
        const sectors = DIRECTION_SECTORS[label];
        if (!sectors) continue;
        if (sectors.has(compassSector(camera.bearing))) {
          votesOut.set(label, (votesOut.get(label) || 0) + 1);
        }
        if (sectors.has(compassSector((camera.bearing + 180) % 360))) {
          votesIn.set(label, (votesIn.get(label) || 0) + 1);
        }
      }

      const topKey = (votes) => {
        let best = null;
        let bestCount = -1;
        for (const [label, count] of votes) {
          if (count > bestCount) {
            best = label;
            bestCount = count;
          }
        }
        return best;
      };

      const outLabel = topKey(votesOut);
      let inLabel = topKey(votesIn);
      if (!inLabel && outLabel) inLabel = OPPOSITE_DIRECTION[outLabel] || null;

      for (const camera of group) {
        const label = camera.direction;
        const sectors = DIRECTION_SECTORS[label];
        if (!label) {
          camera.matchOut = true;
          camera.matchIn = true;
        } else if (outLabel) {
          camera.matchOut = label === outLabel;
          camera.matchIn = label === inLabel;
        } else {
          camera.matchOut =
            !sectors || sectors.has(compassSector(camera.bearing));
          camera.matchIn =
            !sectors ||
            sectors.has(compassSector((camera.bearing + 180) % 360));
        }
      }
    }

    matched.sort((a, b) => a.progressOut - b.progressOut);
    return matched;
  }

  async function getRoute(origin, destination) {
    const url =
      `${OSRM_URL}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}` +
      "?overview=full&geometries=geojson&steps=false&alternatives=false";
    const data = await fetchJson(url, { timeout: 35_000 });
    const route = Array.isArray(data.routes) ? data.routes[0] : null;
    if (!route || data.code !== "Ok") throw new Error("Percorso non trovato");
    const geometry = (route.geometry && route.geometry.coordinates) || [];
    if (geometry.length < 2) {
      throw new Error("Geometria del percorso non disponibile");
    }
    return {
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
      geometry,
    };
  }

  function missingMedia() {
    const div = document.createElement("div");
    div.className = "missing";
    div.textContent = "Segnale non disponibile";
    return div;
  }

  function makeSnapshot(camera) {
    const img = document.createElement("img");
    img.className = "snapshot";
    img.alt = camera.name;
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.base = camera.image || camera.thumb || "";
    img.src = withCacheBuster(img.dataset.base, camera.capturedAt);
    img.addEventListener("error", () => {
      img.replaceWith(missingMedia());
    });
    return img;
  }

  const mediaObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target;
        if (target.tagName === "VIDEO") {
          if (target.dataset.src && !target.src) {
            target.src = target.dataset.src;
            target.play().catch(() => {});
          }
        } else if (target.dataset.thumb) {
          target.style.backgroundImage = `url("${target.dataset.thumb.replace(
            /"/g,
            "%22"
          )}")`;
        }
        observer.unobserve(target);
      }
    },
    { root: grid, rootMargin: "200px" }
  );

  function makeTile(camera) {
    const tile = document.createElement("article");
    tile.className = "tile";
    tile.tabIndex = 0;
    if (camera.thumb) {
      tile.dataset.thumb = camera.thumb;
      mediaObserver.observe(tile);
    }
    tile.setAttribute(
      "aria-label",
      `${camera.name}. Clic per schermo intero.`
    );

    if (state.mode === "video" && camera.video) {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.dataset.src = `${camera.video}?v=${encodeURIComponent(
        camera.capturedAt || ""
      )}-${state.nonce}`;
      video.addEventListener("error", () => {
        video.replaceWith(makeSnapshot(camera));
      });
      tile.append(video);
      mediaObserver.observe(video);
    } else if (camera.image || camera.thumb) {
      tile.append(makeSnapshot(camera));
    } else {
      const missing = document.createElement("div");
      missing.className = "missing";
      missing.textContent = "Nessun media disponibile";
      tile.append(missing);
    }

    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const top = document.createElement("div");
    top.className = "overlay-top";

    const direction = relativeDirection(camera.direction);
    const badge = document.createElement("span");
    badge.className = `badge badge-${camera.direction || "none"}`;
    badge.textContent = direction.label;
    badge.title = direction.hint;

    const km = document.createElement("span");
    km.className = "km";
    km.textContent =
      camera.km != null
        ? `km ${String(camera.km).replace(".", ",")}`
        : "";

    top.append(badge, km);

    const name = document.createElement("h2");
    name.className = "name";
    name.textContent = camera.name;

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = camera.capturedAt
      ? `Aggiornata ${formatCaptured(camera.capturedAt)}`
      : "Orario non disponibile";

    overlay.append(top, name, meta);
    tile.append(overlay);

    const openFullscreen = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (tile.requestFullscreen) {
        tile.requestFullscreen().catch(() => {});
      }
    };

    tile.addEventListener("click", openFullscreen);
    tile.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openFullscreen();
      }
    });

    return tile;
  }

  function updateTabs() {
    const fixedCounts = { nord: 0, sud: 0 };
    for (const camera of state.cameras) {
      if (fixedCounts[camera.direction] != null) {
        fixedCounts[camera.direction] += 1;
      }
    }

    const route = state.route;
    const routeCounts = route
      ? { out: route.counts.out, in: route.counts.in }
      : { out: 0, in: 0 };

    const routeView = state.view === "route";
    directionTabs.classList.toggle("is-route", routeView);
    directionTabs.classList.toggle(
      "is-single",
      routeView && !state.routeBothDirections
    );
    directionTabs.setAttribute(
      "aria-label",
      routeView && state.routeBothDirections
        ? "Andata o ritorno"
        : "Direzione di marcia"
    );

    const routeLabels = [
      { text: "Andata", arrow: "→" },
      { text: "Ritorno", arrow: "←" },
    ];
    const fixedLabels = [
      { text: "Verso Roma", arrow: "↑" },
      { text: "Verso Napoli", arrow: "↓" },
    ];

    document.querySelectorAll(".direction").forEach((button, index) => {
      const isFirst = button.dataset.direction === "nord";
      const active = routeView
        ? state.routeDirection === (isFirst ? "out" : "in")
        : state.direction === button.dataset.direction;
      const labels = routeView ? routeLabels[index] : fixedLabels[index];
      button.querySelector(".dir-label").textContent = labels.text;
      button.querySelector(".dir-arrow").textContent = labels.arrow;
      button.querySelector(".tab-count").textContent = routeView
        ? isFirst
          ? routeCounts.out
          : routeCounts.in
        : fixedCounts[button.dataset.direction] || 0;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function updateSubtitle(list) {
    if (state.view === "route") {
      const route = state.route;
      if (!route) {
        subtitle.textContent = "Calcolo percorso…";
        subtitle.title = "";
        return;
      }
      const from = state.routeFrom?.name || "Partenza";
      const to = state.routeTo?.name || "Arrivo";
      const roads = route.roads?.length ? ` · ${route.roads.join(" · ")}` : "";
      const directionText = state.routeDirection === "out" ? "andata" : "ritorno";
      const directionSuffix = state.routeBothDirections
        ? ""
        : ` · ${directionText}`;
      if (list.length) {
        subtitle.textContent =
          `${from} → ${to} · ${formatDistance(route.distance)} km · ` +
          `${formatDuration(route.duration)} · ${list.length} camere` +
          `${directionSuffix}${roads}`;
      } else {
        subtitle.textContent =
          `Nessuna camera in ${directionText} · ` +
          `${route.count} camere vicine al percorso${roads}`;
      }
      subtitle.title =
        `${route.count} camere sul percorso · ${directionText}` +
        (state.routeBothDirections
          ? " · entrambe le direzioni"
          : " · solo direzione di marcia");
      return;
    }

    if (!list.length) {
      subtitle.textContent = "Nessuna webcam per questa direzione";
      subtitle.title = "";
      return;
    }
    const kms = list.map((camera) => camera.km);
    const min = Math.min(...kms);
    const max = Math.max(...kms);
    subtitle.textContent =
      `${list.length} camere · km ${min.toFixed(0)}–${max.toFixed(0)}`;
    subtitle.title =
      `Webcam ${DIRECTIONS[state.direction].label} · ` +
      "filmati aggiornati dalla centrale Autostrade";
  }

  function render() {
    const list = filteredCameras();
    const total = pageCount(list);

    if (state.page >= total) state.page = 0;
    if (state.page < 0) state.page = total - 1;

    grid.dataset.cols = String(effectiveCols());
    grid.dataset.mode = state.mode;
    grid.replaceChildren();
    mediaObserver.disconnect();

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "grid-empty";
      const message = document.createElement("p");
      message.textContent =
        state.view === "route"
          ? "Nessuna webcam corrisponde a questa direzione."
          : "Nessuna webcam per questa direzione.";
      empty.append(message);
      if (state.view === "route" && !state.routeBothDirections) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Mostra tutte le camere vicine";
        button.addEventListener("click", () => {
          state.routeBothDirections = true;
          routeBothDirections.checked = true;
          state.page = 0;
          updateTabs();
          syncUrl();
          render();
        });
        empty.append(button);
      }
      grid.append(empty);
    } else {
      const visible = isWall()
        ? list
        : list.slice(state.page * perPage(), state.page * perPage() + perPage());

      for (const camera of visible) {
        grid.append(makeTile(camera));
      }

      if (!isWall()) {
        for (let i = visible.length; i < perPage(); i += 1) {
          const empty = document.createElement("div");
          empty.className = "tile tile-empty";
          empty.innerHTML = '<span class="empty-label">—</span>';
          grid.append(empty);
        }
      }
    }

    pager.textContent = isWall()
      ? `${list.length} cam`
      : `${state.page + 1} / ${total} · ${list.length}`;
    prevBtn.disabled = isWall() || total <= 1;
    nextBtn.disabled = isWall() || total <= 1;

    updateSubtitle(list);
    startSnapshotTimer();
  }

  function startSnapshotTimer() {
    if (state.snapshotTimer) {
      clearInterval(state.snapshotTimer);
      state.snapshotTimer = null;
    }
    if (state.mode !== "snapshot") return;

    state.snapshotTimer = setInterval(() => {
      if (document.hidden) return;
      document.querySelectorAll("img.snapshot").forEach((img) => {
        if (!img.dataset.base) return;
        img.src = withCacheBuster(img.dataset.base, Date.now());
      });
    }, SNAPSHOT_REFRESH_MS);
  }

  const numberFormat = new Intl.NumberFormat("it-IT");

  function formatNumber(value) {
    return numberFormat.format(Number(value) || 0);
  }

  function classifyRoad(code, name) {
    const label = (name || "").toUpperCase();
    const normalizedCode = (code || "").toUpperCase();
    if (label.includes("TANGENZIALE")) return "tangenziali";
    if (label.includes("COMPLANARE") || normalizedCode.startsWith("T")) {
      return "complanari";
    }
    if (normalizedCode.startsWith("A")) return "autostrade";
    return "altre";
  }

  function computeStats(cameras) {
    const roads = new Map();
    for (const camera of cameras || []) {
      const code = (camera.code || "?").trim().toUpperCase() || "?";
      let entry = roads.get(code);
      if (!entry) {
        entry = { code, names: new Map(), count: 0 };
        roads.set(code, entry);
      }
      entry.count += 1;
      if (camera.road) {
        entry.names.set(camera.road, (entry.names.get(camera.road) || 0) + 1);
      }
    }

    const categories = new Map(
      STATS_CATEGORIES.map(([key, label]) => [
        key,
        { key, label, count: 0, roads: [] },
      ])
    );
    for (const entry of roads.values()) {
      let name = entry.code;
      let best = 0;
      for (const [candidate, count] of entry.names) {
        if (count > best) {
          best = count;
          name = candidate;
        }
      }
      const category = categories.get(classifyRoad(entry.code, name));
      category.roads.push({
        code: entry.code,
        name,
        count: entry.count,
      });
      category.count += entry.count;
    }

    const result = [];
    for (const [key] of STATS_CATEGORIES) {
      const category = categories.get(key);
      if (!category.count) continue;
      category.roads.sort((a, b) => a.code.localeCompare(b.code));
      result.push(category);
    }

    return {
      fetchedAt: state.statsFetchedAt,
      total: result.reduce((sum, category) => sum + category.count, 0),
      categories: result,
    };
  }

  function renderStats() {
    const stats = state.stats;
    if (!stats) return;

    statsBody.replaceChildren();
    const table = document.createElement("table");
    table.className = "stats-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Tipo", "Codici", "Webcam"]) {
      const th = document.createElement("th");
      th.textContent = label;
      if (label === "Webcam") th.className = "num";
      headRow.append(th);
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const category of stats.categories || []) {
      const row = document.createElement("tr");

      const typeCell = document.createElement("td");
      const typeName = document.createElement("span");
      typeName.className = "stats-type";
      typeName.textContent = category.label;
      const typeNote = document.createElement("span");
      typeNote.className = "stats-type-note";
      const roadCount = (category.roads || []).length;
      typeNote.textContent = `${formatNumber(roadCount)} ${
        roadCount === 1 ? "strada" : "strade"
      }`;
      typeCell.append(typeName, typeNote);

      const codesCell = document.createElement("td");
      const codes = document.createElement("div");
      codes.className = "stats-codes";
      for (const road of category.roads || []) {
        const chip = document.createElement("span");
        chip.className = "stats-code";
        chip.textContent = road.code;
        chip.title = `${road.name} — ${formatNumber(road.count)} webcam`;
        codes.append(chip);
      }
      codesCell.append(codes);

      const countCell = document.createElement("td");
      countCell.className = "num";
      countCell.textContent = formatNumber(category.count);

      row.append(typeCell, codesCell, countCell);
      tbody.append(row);
    }
    table.append(tbody);

    const tfoot = document.createElement("tfoot");
    const totalRow = document.createElement("tr");
    totalRow.className = "stats-total-row";
    const totalLabel = document.createElement("td");
    totalLabel.colSpan = 2;
    totalLabel.textContent = "Totale";
    const totalCount = document.createElement("td");
    totalCount.className = "num";
    totalCount.textContent = formatNumber(stats.total);
    totalRow.append(totalLabel, totalCount);
    tfoot.append(totalRow);
    table.append(tfoot);

    statsBody.append(table);
    const updated = stats.fetchedAt
      ? new Date(stats.fetchedAt).toLocaleString("it-IT")
      : "";
    statsAttrib.textContent = updated
      ? `Fonte: Autostrade per l'Italia · aggiornato ${updated}`
      : "Fonte: Autostrade per l'Italia";
  }

  function updateStats() {
    state.stats = computeStats(state.allCameras);
    statsTotal.textContent = formatNumber(state.stats.total);
    statsToggle.title = `Totale webcam: ${formatNumber(
      state.stats.total
    )} — clicca per il dettaglio`;
    if (!statsPanel.hidden) renderStats();
  }

  async function refreshStats() {
    try {
      await loadData(false);
      updateStats();
    } catch (error) {
      if (!state.stats) {
        statsTotal.textContent = "—";
        if (!statsPanel.hidden) {
          statsBody.textContent = `Statistiche non disponibili: ${error.message}`;
        }
      }
    }
  }

  function openStats() {
    statsBackdrop.hidden = false;
    statsPanel.hidden = false;
    statsToggle.setAttribute("aria-expanded", "true");
    if (!state.stats) {
      statsBody.textContent = "Caricamento…";
      refreshStats();
    } else {
      renderStats();
    }
    statsClose.focus();
  }

  function closeStats() {
    statsBackdrop.hidden = true;
    statsPanel.hidden = true;
    statsToggle.setAttribute("aria-expanded", "false");
    statsToggle.focus();
  }

  function toggleStats() {
    if (statsPanel.hidden) {
      openStats();
    } else {
      closeStats();
    }
  }

  function openPrivacy() {
    if (!statsPanel.hidden) closeStats();
    privacyToggle.setAttribute("aria-expanded", "true");
    privacyBackdrop.hidden = false;
    privacyPanel.hidden = false;
    privacyClose.focus();
  }

  function closePrivacy() {
    privacyToggle.setAttribute("aria-expanded", "false");
    privacyBackdrop.hidden = true;
    privacyPanel.hidden = true;
  }

  function togglePrivacy() {
    if (privacyPanel.hidden) {
      openPrivacy();
    } else {
      closePrivacy();
    }
  }

  async function load(force = false) {
    if (state.pendingRoute) return;
    if (state.view === "route") {
      if (state.route) return refreshRoute(force);
      return;
    }

    if (force) state.nonce += 1;
    try {
      await loadData(true);
      updateStats();
      clearError();

      const signature = state.cameras
        .map((camera) => `${camera.id}:${camera.capturedAt}`)
        .join("|");

      const changed = signature !== state.signature || force;
      state.signature = signature;
      updateTabs();

      if (changed) {
        render();
      } else {
        updateSubtitle(filteredCameras());
      }
    } catch (error) {
      showError(
        `Impossibile leggere le webcam: ${error.message}. ` +
          "Riprovo automaticamente."
      );
    }
  }

  function setPage(delta) {
    if (isWall()) return;
    const total = pageCount();
    state.page = (state.page + delta + total) % total;
    render();
  }

  function setFixedDirection(direction) {
    if (!DIRECTIONS[direction] || state.direction === direction) return;
    state.direction = direction;
    state.page = 0;
    updateTabs();
    syncUrl();
    render();
    startAuto();
  }

  function setRouteDirection(direction) {
    if (
      !state.route ||
      !["out", "in"].includes(direction) ||
      state.routeDirection === direction
    ) {
      return;
    }
    state.routeDirection = direction;
    state.page = 0;
    updateTabs();
    syncUrl();
    render();
    startAuto();
  }

  function syncLayoutButtons() {
    const active = String(effectiveCols());
    document.querySelectorAll(".layout").forEach((button) => {
      button.classList.toggle(
        "is-active",
        button.dataset.layout === active
      );
    });
  }

  function syncModeButton() {
    modeBtn.textContent = state.mode === "video" ? "Video" : "Snapshot";
    modeBtn.classList.toggle("is-active", state.mode === "video");
  }

  function syncBrand() {
    if (state.view === "route" && state.routeFrom && state.routeTo) {
      const from = state.routeFrom.name || "Partenza";
      const to = state.routeTo.name || "Arrivo";
      brandTitle.textContent = "Percorso";
      brandRoute.textContent = `${from} → ${to}`;
      document.title = `MAGDA - Webcam percorso ${from} - ${to}`;
      return;
    }
    brandTitle.textContent = "Webcam";
    brandRoute.textContent = "Italia";
    document.title = "MAGDA · Webcam autostrada";
  }

  function syncUrl() {
    const params = new URLSearchParams();
    params.set("layout", String(state.cols));
    if (state.mode === "snapshot") params.set("mode", "snapshot");

    if (state.view === "route" && state.route && state.routeFrom && state.routeTo) {
      params.set("view", "route");
      params.set(
        "from",
        `${state.routeFrom.lat.toFixed(5)},${state.routeFrom.lon.toFixed(5)}`
      );
      params.set(
        "to",
        `${state.routeTo.lat.toFixed(5)},${state.routeTo.lon.toFixed(5)}`
      );
      params.set("fromName", state.routeFrom.name || "Partenza");
      params.set("toName", state.routeTo.name || "Arrivo");
      params.set("routeDir", state.routeDirection);
      params.set("only", state.routeBothDirections ? "0" : "1");
    } else {
      params.set("dir", state.direction);
    }

    history.replaceState(null, "", `?${params.toString()}`);
  }

  function setLayout(value) {
    const next = value === "all" ? "all" : Number(value);
    state.cols = next;
    state.page = 0;
    syncLayoutButtons();
    syncAutoAvailability();
    syncUrl();
    render();
  }

  function stopAuto() {
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
    }
  }

  function startAuto() {
    stopAuto();
    if (!state.auto || isWall()) return;
    state.autoTimer = setInterval(() => {
      if (document.hidden) return;
      if (pageCount(filteredCameras()) <= 1) return;
      setPage(1);
    }, AUTO_ROTATE_MS);
  }

  function syncAutoAvailability() {
    autoBtn.disabled = isWall();
    autoBtn.classList.toggle("is-active", state.auto && !isWall());
    autoBtn.title = isWall()
      ? "Rotazione non disponibile nella griglia totale"
      : "Rotazione automatica (tasto A)";
    if (isWall()) {
      stopAuto();
    } else {
      startAuto();
    }
  }

  function setMode(mode) {
    state.mode = mode;
    syncModeButton();
    syncUrl();
    render();
  }

  function setAuto(enabled) {
    state.auto = enabled;
    autoBtn.classList.toggle("is-active", enabled);
    autoBtn.textContent = enabled ? "AUTO 20s" : "AUTO OFF";
    if (enabled) {
      startAuto();
    } else {
      stopAuto();
    }
  }

  function handleViewportChange() {
    state.page = 0;
    syncLayoutButtons();
    syncAutoAvailability();
    render();
  }

  function setRouteStatus(message, kind = "") {
    routeStatus.className = "route-status";
    if (kind) routeStatus.classList.add(`is-${kind}`);
    routeStatus.textContent = message;
  }

  function syncRouteForm() {
    routeFrom.value = state.formFrom?.label || "";
    routeTo.value = state.formTo?.label || "";
    routeBothDirections.checked = state.routeBothDirections;
  }

  function loadWelcomeBackground() {
    welcomeBg.replaceChildren();
    const group = String(Math.floor(Math.random() * WELCOME_GROUP_COUNT) + 1).padStart(2, "0");
    for (let index = 1; index <= WELCOME_IMAGE_COUNT; index += 1) {
      const image = String(index).padStart(2, "0");
      const img = document.createElement("img");
      img.src = `./assets/welcome/${group}/${image}.webp`;
      img.alt = "";
      img.decoding = "async";
      welcomeBg.append(img);
    }
  }

  function openRoutePanel({ welcome = false } = {}) {
    if (welcome) {
      state.welcomeMode = true;
      document.body.classList.add("is-welcome");
      routeClose.hidden = true;
      welcomeBg.hidden = false;
      setRouteStatus("");
      loadWelcomeBackground();
    } else {
      routeClose.hidden = false;
    }
    state.formFrom = state.routeFrom ? { ...state.routeFrom } : null;
    state.formTo = state.routeTo ? { ...state.routeTo } : null;
    syncRouteForm();
    routeBackdrop.hidden = false;
    routePanel.hidden = false;
    requestAnimationFrame(() => {
      if (!routeFrom.value) {
        routeFrom.focus();
      } else if (!routeTo.value) {
        routeTo.focus();
      } else {
        routeFrom.focus();
      }
    });
  }

  function closeRoutePanel() {
    const wasWelcome = state.welcomeMode;
    document.body.classList.remove("is-welcome");
    welcomeBg.hidden = true;
    welcomeBg.replaceChildren();
    routeClose.hidden = false;
    routePanel.hidden = true;
    routeBackdrop.hidden = true;
    hideSuggestions("from");
    hideSuggestions("to");
    if (wasWelcome) {
      state.welcomeMode = false;
      syncUrl();
      render();
    }
  }

  function hideSuggestions(field) {
    const list = field === "from" ? suggestFrom : suggestTo;
    state.suggestionSeq[field] += 1;
    list.hidden = true;
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    state.suggestions[field] = [];
  }

  function renderSuggestionsLoading(field) {
    const list = field === "from" ? suggestFrom : suggestTo;
    list.replaceChildren();
    list.setAttribute("aria-busy", "true");
    state.suggestions[field] = [];

    const item = document.createElement("li");
    item.className = "suggestion-loading";

    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = "Ricerca in corso…";

    item.append(spinner, text);
    list.append(item);
    list.hidden = false;
  }

  function renderSuggestionsError(field, message) {
    const list = field === "from" ? suggestFrom : suggestTo;
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    state.suggestions[field] = [];

    const item = document.createElement("li");
    item.className = "suggestion-empty suggestion-error";
    item.textContent = message;
    list.append(item);
    list.hidden = false;
  }

  function renderSuggestions(field, results) {
    const list = field === "from" ? suggestFrom : suggestTo;
    list.replaceChildren();
    list.setAttribute("aria-busy", "false");
    state.suggestions[field] = results;

    if (!results.length) {
      const empty = document.createElement("li");
      empty.className = "suggestion-empty";
      empty.textContent = "Nessun risultato: prova con un nome più specifico.";
      list.append(empty);
      list.hidden = false;
      return;
    }

    for (const result of results) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";

      const name = document.createElement("strong");
      name.textContent = result.name || result.label;

      const label = document.createElement("span");
      label.textContent = result.label;

      button.append(name, label);
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        selectSuggestion(field, result);
      });
      item.append(button);
      list.append(item);
    }

    list.hidden = false;
  }

  function selectSuggestion(field, result) {
    const point = {
      lat: result.lat,
      lon: result.lon,
      label: result.label,
      name: result.name || result.label,
    };
    if (field === "from") {
      state.formFrom = point;
      routeFrom.value = result.label;
    } else {
      state.formTo = point;
      routeTo.value = result.label;
    }
    hideSuggestions("from");
    hideSuggestions("to");
    setRouteStatus("");
    if (field === "from" && !state.formTo) {
      routeTo.focus();
    } else if (field === "to" && !state.formFrom) {
      routeFrom.focus();
    }
  }

  function queueSuggestions(field) {
    const input = field === "from" ? routeFrom : routeTo;
    const query = input.value.trim();

    if (state.suggestionTimers[field]) {
      clearTimeout(state.suggestionTimers[field]);
      state.suggestionTimers[field] = null;
    }
    if (state.suggestionControllers[field]) {
      state.suggestionControllers[field].abort();
      state.suggestionControllers[field] = null;
    }
    if (query.length < 3) {
      hideSuggestions(field);
      return;
    }

    state.suggestionSeq[field] += 1;
    const seq = state.suggestionSeq[field];
    renderSuggestionsLoading(field);
    state.suggestionTimers[field] = setTimeout(() => {
      fetchSuggestions(field, query, seq);
    }, SUGGEST_DEBOUNCE_MS);
  }

  async function fetchSuggestions(field, query, seq) {
    const controller = new AbortController();
    state.suggestionControllers[field] = controller;
    const isCurrent = () =>
      !controller.signal.aborted &&
      seq === state.suggestionSeq[field] &&
      (field === "from" ? routeFrom : routeTo).value.trim() === query;

    try {
      const results = await geocode(query);
      if (!isCurrent() || routePanel.hidden) return;
      renderSuggestions(field, results);
    } catch (error) {
      if (error.name === "AbortError" || !isCurrent() || routePanel.hidden) {
        return;
      }
      renderSuggestionsError(
        field,
        "Ricerca non disponibile in questo momento. Riprova."
      );
    }
  }

  function bindRouteInput(field, input) {
    input.addEventListener("input", () => {
      if (field === "from") {
        state.formFrom = null;
      } else {
        state.formTo = null;
      }
      queueSuggestions(field);
    });

    input.addEventListener("blur", () => {
      setTimeout(() => hideSuggestions(field), 150);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const list = field === "from" ? suggestFrom : suggestTo;
        if (!list.hidden) {
          hideSuggestions(field);
          event.stopPropagation();
        }
        return;
      }
      if (event.key === "Enter") {
        const list = field === "from" ? suggestFrom : suggestTo;
        if (!list.hidden && state.suggestions[field].length) {
          event.preventDefault();
          selectSuggestion(field, state.suggestions[field][0]);
        }
      }
    });
  }

  function routeSignature(data) {
    const cameras = data.cameras
      .map((camera) => `${camera.id}:${camera.capturedAt}`)
      .join("|");
    return `${data.counts.out}:${data.counts.in}|${cameras}`;
  }

  async function requestRoute(from, to, { forceData = false } = {}) {
    if (haversine(from.lat, from.lon, to.lat, to.lon) < 30) {
      throw new Error("partenza e arrivo coincidono");
    }

    const [data, route] = await Promise.all([
      loadData(forceData),
      getRoute(from, to),
    ]);
    const cameras = matchRouteCameras(route.geometry, DEFAULT_RADIUS, data.cameras);
    const roads = [
      ...new Set(cameras.map((camera) => camera.code).filter(Boolean)),
    ].sort();

    return {
      fetchedAt: new Date().toISOString(),
      origin: { lat: from.lat, lon: from.lon },
      destination: { lat: to.lat, lon: to.lon },
      distance: Math.round(route.distance * 10) / 10,
      duration: Math.round(route.duration * 10) / 10,
      radius: DEFAULT_RADIUS,
      roads,
      count: cameras.length,
      counts: {
        out: cameras.filter((camera) => camera.matchOut).length,
        in: cameras.filter((camera) => camera.matchIn).length,
      },
      cameras,
    };
  }

  function adoptRoute(data, { direction = "out", only = true } = {}) {
    state.route = data;
    state.routeDirection = direction;
    state.routeBothDirections = !only;
    if (only) {
      const active = direction === "out" ? data.counts.out : data.counts.in;
      const other = direction === "out" ? "in" : "out";
      const otherCount = other === "out" ? data.counts.out : data.counts.in;
      if (active === 0 && otherCount > 0) {
        state.routeDirection = other;
      }
    }
    state.routeSignature = routeSignature(data);
    state.page = 0;
    state.view = "route";
    syncBrand();
    syncRouteForm();
    updateTabs();
    syncUrl();
    render();
    startAuto();
  }

  async function calculateRoute() {
    if (!state.formFrom || !state.formTo) {
      setRouteStatus(
        "Scegli partenza e arrivo dall'elenco dei suggerimenti.",
        "error"
      );
      return;
    }

    const only = !routeBothDirections.checked;
    routeSubmit.disabled = true;
    routeSubmit.textContent = "Caricamento…";
    setRouteStatus("Geocoding e calcolo del percorso…", "loading");

    try {
      const data = await requestRoute(state.formFrom, state.formTo);
      state.routeFrom = { ...state.formFrom };
      state.routeTo = { ...state.formTo };
      state.formFrom = { ...state.formFrom };
      state.formTo = { ...state.formTo };
      adoptRoute(data, { direction: "out", only });
      setRouteStatus("");
      closeRoutePanel();
    } catch (error) {
      setRouteStatus(`Percorso non disponibile: ${error.message}`, "error");
    } finally {
      routeSubmit.disabled = false;
      routeSubmit.textContent = "Mostra telecamere";
    }
  }

  async function refreshRoute(force = false) {
    if (!state.routeFrom || !state.routeTo) return;
    try {
      const data = await requestRoute(state.routeFrom, state.routeTo, {
        forceData: true,
      });
      const signature = routeSignature(data);
      const changed = signature !== state.routeSignature || force;
      state.route = data;
      state.routeSignature = signature;

      if (!state.routeBothDirections) {
        const activeCount =
          state.routeDirection === "out" ? data.counts.out : data.counts.in;
        const other = state.routeDirection === "out" ? "in" : "out";
        const otherCount = other === "out" ? data.counts.out : data.counts.in;
        if (activeCount === 0 && otherCount > 0) {
          state.routeDirection = other;
        }
      }

      clearError();
      updateTabs();
      if (changed) {
        render();
      } else {
        updateSubtitle(filteredCameras());
      }
    } catch (error) {
      showError(
        `Impossibile aggiornare il percorso: ${error.message}. ` +
          "Riprovo automaticamente."
      );
    }
  }

  function parsePointParam(raw) {
    if (!raw) return null;
    const [latText, lonText] = raw.split(",");
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  async function startPendingRoute() {
    const pending = state.pendingRoute;
    state.pendingRoute = null;
    if (!pending) return;

    state.routeFrom = pending.from;
    state.routeTo = pending.to;
    state.formFrom = { ...pending.from };
    state.formTo = { ...pending.to };
    state.routeBothDirections = !pending.only;
    state.routeDirection = pending.direction;
    state.view = "route";
    state.route = null;
    state.routeSignature = "";
    syncBrand();
    syncRouteForm();
    updateTabs();
    subtitle.textContent = "Calcolo percorso…";
    subtitle.title = "";

    try {
      const data = await requestRoute(state.routeFrom, state.routeTo);
      adoptRoute(data, {
        direction: pending.direction,
        only: pending.only,
      });
      clearError();
    } catch (error) {
      state.view = "fixed";
      state.route = null;
      state.routeFrom = null;
      state.routeTo = null;
      state.formFrom = null;
      state.formTo = null;
      syncBrand();
      syncRouteForm();
      updateTabs();
      showError(`Percorso non disponibile: ${error.message}`);
      syncUrl();
      load(true);
    }
  }

  document.querySelectorAll(".layout").forEach((button) => {
    button.addEventListener("click", () => setLayout(button.dataset.layout));
  });

  document.querySelectorAll(".direction").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.view === "route") {
        setRouteDirection(button.dataset.direction === "nord" ? "out" : "in");
      } else {
        setFixedDirection(button.dataset.direction);
      }
    });
  });

  modeBtn.addEventListener("click", () =>
    setMode(state.mode === "video" ? "snapshot" : "video")
  );
  autoBtn.addEventListener("click", () => setAuto(!state.auto));
  prevBtn.addEventListener("click", () => setPage(-1));
  nextBtn.addEventListener("click", () => setPage(1));
  document
    .getElementById("refresh")
    .addEventListener("click", () => load(true));
  document.getElementById("fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  routeToggle.addEventListener("click", () => openRoutePanel());
  privacyToggle.addEventListener("click", togglePrivacy);
  privacyClose.addEventListener("click", closePrivacy);
  privacyBackdrop.addEventListener("click", closePrivacy);
  statsToggle.addEventListener("click", toggleStats);
  statsClose.addEventListener("click", closeStats);
  statsBackdrop.addEventListener("click", closeStats);
  routeClose.addEventListener("click", () => {
    if (!state.welcomeMode) closeRoutePanel();
  });
  routeBackdrop.addEventListener("click", () => {
    if (!state.welcomeMode) closeRoutePanel();
  });
  routeSubmit.addEventListener("click", calculateRoute);
  routeBothDirections.addEventListener("change", () => {
    if (!state.route) return;
    state.routeBothDirections = routeBothDirections.checked;
    state.page = 0;
    updateTabs();
    syncUrl();
    render();
  });

  bindRouteInput("from", routeFrom);
  bindRouteInput("to", routeTo);

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (!privacyPanel.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePrivacy();
      }
      return;
    }
    if (!statsPanel.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStats();
      }
      return;
    }
    if (!routePanel.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!state.welcomeMode) closeRoutePanel();
      }
      return;
    }
    switch (event.key) {
      case "ArrowLeft":
        setPage(-1);
        break;
      case "ArrowRight":
        setPage(1);
        break;
      case "f":
      case "F":
        document.getElementById("fullscreen").click();
        break;
      case "v":
      case "V":
        setMode(state.mode === "video" ? "snapshot" : "video");
        break;
      case "a":
      case "A":
        if (!autoBtn.disabled) setAuto(!state.auto);
        break;
      case "r":
      case "R":
        load(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  function isFirstLanding() {
    const params = new URLSearchParams(location.search);
    return !["view", "from", "to", "dir", "layout", "mode"].some((key) =>
      params.has(key)
    );
  }

  function applyUrlState() {
    const params = new URLSearchParams(location.search);
    const direction = params.get("dir");
    if (DIRECTIONS[direction]) state.direction = direction;

    const layout = params.get("layout");
    if (["2", "3", "4", "5", "all"].includes(layout)) {
      state.cols = layout === "all" ? "all" : Number(layout);
    }

    if (params.get("mode") === "snapshot") state.mode = "snapshot";

    if (params.get("view") === "route") {
      const from = parsePointParam(params.get("from"));
      const to = parsePointParam(params.get("to"));
      if (from && to) {
        const fromName = params.get("fromName") || "Partenza";
        const toName = params.get("toName") || "Arrivo";
        const only = params.get("only") !== "0";
        const routeDirection = params.get("routeDir") === "in" ? "in" : "out";
        state.pendingRoute = {
          from: { ...from, label: fromName, name: fromName },
          to: { ...to, label: toName, name: toName },
          only,
          direction: routeDirection,
        };
        state.routeFrom = { ...from, label: fromName, name: fromName };
        state.routeTo = { ...to, label: toName, name: toName };
        state.routeBothDirections = !only;
        state.routeDirection = routeDirection;
        state.view = "route";
      }
    }
  }

  mobileQuery.addEventListener("change", handleViewportChange);
  compactQuery.addEventListener("change", handleViewportChange);

  const welcome = isFirstLanding();
  applyUrlState();
  updateTabs();
  syncLayoutButtons();
  syncModeButton();
  syncAutoAvailability();
  syncRouteForm();
  syncBrand();

  if (state.pendingRoute) {
    startPendingRoute();
  } else if (welcome) {
    openRoutePanel({ welcome: true });
  } else {
    syncUrl();
    load(true);
  }
  if (!welcome) setAuto(true);

  refreshStats();

  state.dataTimer = setInterval(() => {
    if (!document.hidden) {
      load(false);
      refreshStats();
    }
  }, DATA_REFRESH_MS);
})();
