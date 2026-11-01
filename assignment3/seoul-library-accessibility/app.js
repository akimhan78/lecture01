(() => {
  const state = { metric: "reach", order: "low", selected: null, showLibraries: false };
  let dongs = [];
  let libraries = [];
  let summary = {};
  const $ = (selector) => document.querySelector(selector);
  const mapSvg = $("#city-map");
  const mapLayer = $("#map-polygons");
  const libraryLayer = $("#map-libraries");
  const tooltip = $("#tooltip");
  const mapLoading = $("#map-loading");
  const mapWidth = 1000;
  const mapHeight = 800;
  const mapPad = 42;
  const mapTransform = () => {
    const [minX, minY, maxX, maxY] = summary.bbox;
    const scale = Math.min((mapWidth - mapPad * 2) / (maxX - minX), (mapHeight - mapPad * 2) / (maxY - minY));
    const offsetX = (mapWidth - (maxX - minX) * scale) / 2;
    const offsetY = (mapHeight - (maxY - minY) * scale) / 2;
    return { minX, minY, scale, offsetX, offsetY };
  };
  const xScale = (x) => { const t = mapTransform(); return t.offsetX + (x - t.minX) * t.scale; };
  const yScale = (y) => { const t = mapTransform(); return mapHeight - t.offsetY - (y - t.minY) * t.scale; };
  const reachValue = (feature) => Number(feature.properties.population_within_10min_pct || 0);
  const gravityValue = (feature) => Number(feature.properties.population_weighted_gravity || 0);
  const activeValue = (feature) => state.metric === "reach" ? reachValue(feature) : gravityValue(feature);
  const fmt = (value, digits = 1) => Number(value).toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtPop = (value) => `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}명`;

  const palette = stateMetric => {
    if (stateMetric === "reach") return ["#eee9dd", "#d3e5d1", "#99c8a5", "#4f9679", "#286c55", "#173e35"];
    return ["#eee9dd", "#d8e7e3", "#add0ca", "#70a8a3", "#397d80", "#174e55"];
  };
  const colorFor = (value) => {
    const max = state.metric === "reach" ? 100 : 2.8;
    const ratio = Math.max(0, Math.min(.99999, value / max));
    const colors = palette(state.metric);
    return colors[Math.floor(ratio * colors.length)];
  };
  const geometryPath = (geometry) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(polygon => polygon.map(ring => ring.map((point, i) => `${i ? "L" : "M"}${xScale(point[0]).toFixed(1)},${yScale(point[1]).toFixed(1)}`).join(" ") + " Z").join(" ")).join(" ");
  };

  function moveTooltip(event) {
    const pad = 14;
    const width = 190;
    const left = Math.min(window.innerWidth - width - pad, event.clientX + 15);
    const top = Math.min(window.innerHeight - 92, event.clientY + 15);
    tooltip.style.left = `${Math.max(pad, left)}px`;
    tooltip.style.top = `${Math.max(pad, top)}px`;
  }
  function showDongTooltip(feature, event) {
    const p = feature.properties;
    tooltip.innerHTML = `<strong>${p.emdnm}</strong><span>10분 도달률　${fmt(p.population_within_10min_pct, 1)}%</span><br><span>중력형 접근성　${fmt(p.population_weighted_gravity, 3)}</span><br><span>24시간 평균　${fmtPop(p.population_mean)}</span>`;
    tooltip.classList.add("visible");
    moveTooltip(event);
  }
  function showLibraryTooltip(point, event) {
    tooltip.innerHTML = `<strong>공공도서관</strong><span>${point.properties.kind || "도서관"}</span>`;
    tooltip.classList.add("visible");
    moveTooltip(event);
  }
  function hideTooltip() { tooltip.classList.remove("visible"); }

  function renderMap() {
    const metric = state.metric;
    mapLayer.innerHTML = dongs.map(feature => {
      const p = feature.properties;
      const selected = state.selected === String(p.ADM_CD) ? " selected" : "";
      return `<path class="dong-shape${selected}" data-code="${p.ADM_CD}" d="${geometryPath(feature.geometry)}" fill="${colorFor(activeValue(feature))}" fill-rule="evenodd" tabindex="0" role="button" aria-label="${p.emdnm}, 10분 도달률 ${fmt(reachValue(feature))}퍼센트, 중력형 접근성 ${fmt(gravityValue(feature), 3)}"><title>${p.emdnm}</title></path>`;
    }).join("");
    mapLayer.querySelectorAll(".dong-shape").forEach(path => {
      const feature = dongs.find(item => String(item.properties.ADM_CD) === path.dataset.code);
      path.addEventListener("pointermove", event => showDongTooltip(feature, event));
      path.addEventListener("pointerleave", hideTooltip);
      path.addEventListener("focus", event => showDongTooltip(feature, event));
      path.addEventListener("blur", hideTooltip);
      path.addEventListener("click", () => selectDong(feature));
      path.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDong(feature); } });
    });
    const visible = state.showLibraries;
    libraryLayer.innerHTML = visible ? libraries.map(point => {
      const [x, y] = point.geometry.coordinates;
      return `<circle class="library-point" cx="${xScale(x).toFixed(1)}" cy="${yScale(y).toFixed(1)}" r="3.2"/>`;
    }).join("") : "";
    if (visible) libraryLayer.querySelectorAll(".library-point").forEach((dot, i) => {
      dot.style.pointerEvents = "auto";
      dot.addEventListener("pointermove", event => showLibraryTooltip(libraries[i], event));
      dot.addEventListener("pointerleave", hideTooltip);
    });
    $("#map-title").textContent = metric === "reach" ? "10분 이내 도달 생활인구" : "행정동별 인구가중 중력형 접근성";
    $("#legend-title").textContent = metric === "reach" ? "10분 이내 도달 생활인구 비율" : "중력형 접근성 점수";
    $("#legend-ramp").style.background = metric === "reach"
      ? "linear-gradient(90deg, #eee9dd, #d3e5d1, #99c8a5, #4f9679, #286c55, #173e35)"
      : "linear-gradient(90deg, #eee9dd, #d8e7e3, #add0ca, #70a8a3, #397d80, #174e55)";
    $("#legend-ticks").innerHTML = metric === "reach"
      ? "<span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>"
      : "<span>0</span><span>0.7</span><span>1.4</span><span>2.1</span><span>2.8</span>";
    mapLoading.classList.add("hidden");
  }

  function selectDong(feature) {
    state.selected = String(feature.properties.ADM_CD);
    const p = feature.properties;
    $("#selected-name").textContent = p.emdnm;
    $("#selected-sub").textContent = `행정동 코드 ${p.ADM_CD} · 생활인구 자료 기준`;
    $("#selected-reach").textContent = `${fmt(reachValue(feature))}%`;
    $("#selected-gravity").textContent = fmt(gravityValue(feature), 3);
    $("#selected-pop").textContent = fmtPop(p.population_mean);
    renderMap();
    renderRank();
    renderScatter();
  }
  function selectCity() {
    state.selected = null;
    $("#selected-name").textContent = "서울시 전체";
    $("#selected-sub").textContent = "동을 선택하면 해당 지역의 지표를 확인할 수 있습니다.";
    $("#selected-reach").textContent = `${fmt(summary.overall_reach_pct)}%`;
    $("#selected-gravity").textContent = fmt(summary.gravity_mean, 3);
    $("#selected-pop").textContent = "—";
    renderMap(); renderRank(); renderScatter();
  }

  function renderRank() {
    const key = state.metric === "reach" ? "population_within_10min_pct" : "population_weighted_gravity";
    let candidates = [...dongs];
    if (state.metric === "reach" && state.order === "low") candidates = candidates.filter(f => Number(f.properties[key]) > 0);
    candidates.sort((a, b) => state.order === "low"
      ? Number(a.properties[key]) - Number(b.properties[key])
      : Number(b.properties[key]) - Number(a.properties[key]));
    candidates = candidates.slice(0, 8);
    const max = state.metric === "reach" ? 100 : Math.max(...candidates.map(f => Number(f.properties[key]))) || 1;
    $("#rank-title").textContent = state.metric === "reach"
      ? (state.order === "low" ? "도달률이 낮은 동 · 0% 제외" : "도달률이 높은 동")
      : (state.order === "low" ? "중력형 점수가 낮은 동" : "중력형 점수가 높은 동");
    $("#rank-list").innerHTML = candidates.map((feature, index) => {
      const p = feature.properties;
      const value = Number(p[key]);
      const width = Math.max(2, (value / max) * 100);
      const isSelected = state.selected === String(p.ADM_CD);
      return `<div class="rank-item ${state.order === "low" ? "low" : ""} ${isSelected ? "selected" : ""}" data-code="${p.ADM_CD}" role="listitem" tabindex="0" aria-label="${p.emdnm}, ${fmt(value)}${state.metric === "reach" ? "%" : "점"}"><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><span class="rank-name">${p.emdnm}</span><span class="rank-track"><i class="rank-bar" style="width:${width}%"></i></span><span class="rank-value">${state.metric === "reach" ? `${fmt(value)}%` : fmt(value, 2)}</span></div>`;
    }).join("");
    $("#rank-list").querySelectorAll(".rank-item").forEach(item => {
      const feature = dongs.find(f => String(f.properties.ADM_CD) === item.dataset.code);
      item.addEventListener("click", () => selectDong(feature));
      item.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDong(feature); } });
    });
  }

  function renderScatter() {
    const width = 960, height = 420;
    const margin = { top: 20, right: 25, bottom: 54, left: 68 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const sx = value => margin.left + (Number(value) / 100) * innerW;
    const sy = value => margin.top + innerH - (Number(value) / 2.8) * innerH;
    let svg = "";
    [0, 25, 50, 75, 100].forEach(tick => {
      const x = sx(tick);
      svg += `<line class="grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + innerH}"/><text class="axis-label" x="${x}" y="${height - 29}" text-anchor="middle">${tick}%</text>`;
    });
    [0, .7, 1.4, 2.1, 2.8].forEach(tick => {
      const y = sy(tick);
      svg += `<line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/><text class="axis-label" x="${margin.left - 13}" y="${y + 3}" text-anchor="end">${tick.toFixed(1)}</text>`;
    });
    svg += `<line class="axis-line" x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}"/><line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}"/>`;
    svg += `<text class="axis-title" x="${margin.left + innerW / 2}" y="${height - 5}" text-anchor="middle">10분 이내 도달 생활인구 비율</text><text class="axis-title" transform="translate(15 ${margin.top + innerH / 2}) rotate(-90)" text-anchor="middle">인구가중 중력형 접근성</text>`;
    const maxPop = Math.max(...dongs.map(f => Number(f.properties.population_mean) || 0));
    dongs.forEach(feature => {
      const p = feature.properties;
      const radius = 2.3 + 4.1 * Math.sqrt((Number(p.population_mean) || 0) / maxPop);
      const selected = state.selected === String(p.ADM_CD) ? " selected" : "";
      svg += `<circle class="scatter-point${selected}" cx="${sx(reachValue(feature)).toFixed(1)}" cy="${sy(gravityValue(feature)).toFixed(1)}" r="${radius.toFixed(1)}" data-code="${p.ADM_CD}" tabindex="0" role="button" aria-label="${p.emdnm}, 도달률 ${fmt(reachValue(feature))}퍼센트, 중력형 ${fmt(gravityValue(feature), 3)}"><title>${p.emdnm}</title></circle>`;
    });
    $("#scatter").innerHTML = svg;
    $("#scatter").querySelectorAll(".scatter-point").forEach(point => {
      const feature = dongs.find(f => String(f.properties.ADM_CD) === point.dataset.code);
      point.addEventListener("pointermove", event => showDongTooltip(feature, event));
      point.addEventListener("pointerleave", hideTooltip);
      point.addEventListener("focus", event => showDongTooltip(feature, event));
      point.addEventListener("blur", hideTooltip);
      point.addEventListener("click", () => selectDong(feature));
      point.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectDong(feature); } });
    });
  }

  function setMetric(metric) {
    state.metric = metric;
    document.querySelectorAll(".metric-toggle").forEach(button => {
      const active = button.dataset.metric === metric;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderMap(); renderRank();
  }

  async function init() {
    try {
      const [dongResponse, libraryResponse, summaryResponse] = await Promise.all([
        fetch("data/dong_accessibility.geojson"),
        fetch("data/library_locations.geojson"),
        fetch("data/summary.json")
      ]);
      if (![dongResponse, libraryResponse, summaryResponse].every(response => response.ok)) throw new Error("분석 자료를 불러오지 못했습니다.");
      const [dongData, libraryData] = await Promise.all([dongResponse.json(), libraryResponse.json()]);
      summary = await summaryResponse.json();
      dongs = dongData.features;
      libraries = libraryData.features;
      $("#kpi-reach").textContent = fmt(summary.overall_reach_pct);
      $("#kpi-zero").textContent = summary.zero_dong_count;
      $("#kpi-zero-share").textContent = fmt(summary.zero_dong_share_pct);
      $("#kpi-zero-pop").textContent = `${fmt(summary.zero_dong_population_share_pct)}%`;
      $("#kpi-gravity").textContent = fmt(summary.gravity_mean, 3);
      $("#correlation").textContent = fmt(summary.correlation, 3);
      $(".rank-foot span:last-child").textContent = `10분 도달률 0%인 동 ${summary.zero_dong_count}곳을 별도 집계했습니다.`;
      $("#selected-reach").textContent = `${fmt(summary.overall_reach_pct)}%`;
      $("#selected-gravity").textContent = fmt(summary.gravity_mean, 3);
      renderMap(); renderRank(); renderScatter();
    } catch (error) {
      mapLoading.textContent = `자료 로딩 오류: ${error.message}`;
    }
  }

  document.querySelectorAll(".metric-toggle").forEach(button => button.addEventListener("click", () => setMetric(button.dataset.metric)));
  document.querySelectorAll(".rank-toggle").forEach(button => button.addEventListener("click", () => {
    state.order = button.dataset.rank;
    document.querySelectorAll(".rank-toggle").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderRank();
  }));
  $("#library-toggle").addEventListener("change", event => { state.showLibraries = event.target.checked; renderMap(); });
  $(".selected-name").addEventListener("click", selectCity);
  init();
})();
