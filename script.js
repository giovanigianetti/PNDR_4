/* Dashboard Objetivo 4 da PNDR
   Static GitHub Pages version. All calculations run in-browser.
*/
const state = {
  meta: null,
  munOriginal: [],
  tipOriginal: [],
  munMetrics: [],
  tipMetrics: [],
  cnae: [],
  compact: [],
  groupsMun: [],
  groupsTip: [],
  cnaeMap: new Map(),
  munMeta: new Map(),
  tipMeta: new Map(),
  cnaeTotals: new Map(),
  activeRows: [],
  groupRows: [],
  map: null,
  geoMunicipios: null,
  geoUfs: null,
  geoTipologias: null,
  geoLayer: null,
  ufLayer: null,
  lastLevel: 'municipio',
};

const FILES = {
  meta: 'data/metadata_obj4.json',
  mun: 'data/indicadores_obj4_municipio.csv',
  tip: 'data/indicadores_obj4_tipologia.csv',
  cnae: 'data/tabela_cnae_editavel.csv',
  compact: 'data/base_mun_cnae_compact.csv.gz',
  groupsMun: 'data/grupos_obj4_municipio.csv',
  groupsTip: 'data/grupos_obj4_tipologia.csv',
};

const MAP_FILES = {
  municipiosGeojson: 'maps/municipios.geojson',
  ufsGeojson: 'maps/ufs.geojson',
  municipiosTopojson: 'maps/municipios_ibge_topo.json',
  ufsTopojson: 'maps/ufs_ibge_topo.json',
};

const REMOTE_MAPS = {
  municipiosTopojson: 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&qualidade=minima&formato=application/json',
  ufsTopojson: 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=UF&qualidade=minima&formato=application/json',
};

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindUi();
  setStatus('Carregando arquivos...');
  try {
    await loadAllData();
    prepareState();
    populateFilters();
    setDefaultRanges();
    recomputeMetrics();
    updateAll();
    await initMaps();
    setStatus(`Pronto · ${fmtInt(state.munOriginal.length)} municípios · ${fmtInt(state.cnae.length)} CNAEs · ${fmtInt(state.compact.length)} linhas município–CNAE`);
  } catch (err) {
    console.error(err);
    setStatus('Erro ao carregar dados. Verifique console e caminhos dos arquivos.');
    alert('Erro ao carregar o dashboard: ' + err.message);
  }
}

function bindUi() {
  $('tabs').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-tab]');
    if (!btn) return;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'maps' && state.map) setTimeout(() => state.map.invalidateSize(), 100);
  });
  $('applyFilters').addEventListener('click', updateAll);
  $('resetFilters').addEventListener('click', resetFilters);
  $('levelSelect').addEventListener('change', () => { updateAll(); updateMap(); });
  $('referenceMode').addEventListener('change', updateAll);
  $('meanMethod').addEventListener('change', updateAll);
  $('mapMetric').addEventListener('change', updateMap);
  $('rankingMetric').addEventListener('change', renderRanking);
  $('tableDataset').addEventListener('change', renderAnalyticTable);
  $('tableSearch').addEventListener('input', renderAnalyticTable);
  $('cnaeSearch').addEventListener('input', renderActivityEditTable);

  $('applyActivityChanges').addEventListener('click', () => {
    setStatus('Recalculando com classificações ajustadas...');
    setTimeout(() => { recomputeMetrics(); updateAll(); setStatus('Classificações aplicadas.'); }, 50);
  });
  $('restoreActivityChanges').addEventListener('click', restoreActivityFlags);
  $('downloadActivityCsv').addEventListener('click', downloadActivityCsv);
  $('uploadActivityCsv').addEventListener('change', uploadActivityCsv);
  $('excludeByClass').addEventListener('click', excludeByClassificacao);
  $('includeVisibleObj4').addEventListener('click', () => bulkVisibleObj4(1));
  $('removeVisibleObj4').addEventListener('click', () => bulkVisibleObj4(0));
  $('exportTable').addEventListener('click', () => exportRows(currentAnalyticRows(), 'tabela_analitica_obj4.csv'));
  $('exportRanking').addEventListener('click', () => exportRows(getRankingRows(), 'ranking_obj4.csv'));
  $('exportGroups').addEventListener('click', () => exportRows(state.groupRows || [], 'grupos_obj4_filtrados.csv'));
}

async function loadAllData() {
  const [meta, mun, tip, cnae, gm, gt, compact] = await Promise.all([
    fetchJson(FILES.meta),
    fetchCsv(FILES.mun),
    fetchCsv(FILES.tip),
    fetchCsv(FILES.cnae),
    fetchCsv(FILES.groupsMun),
    fetchCsv(FILES.groupsTip),
    fetchGzipCsv(FILES.compact),
  ]);
  state.meta = meta;
  state.munOriginal = mun;
  state.tipOriginal = tip;
  state.cnae = cnae;
  state.groupsMun = gm;
  state.groupsTip = gt;
  state.compact = compact;
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Não foi possível carregar ${path}`);
  return await res.json();
}
async function fetchCsv(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Não foi possível carregar ${path}`);
  const text = await res.text();
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
}
async function fetchGzipCsv(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Não foi possível carregar ${path}`);
  const buffer = await res.arrayBuffer();
  const text = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
}

function prepareState() {
  state.munOriginal.forEach(r => {
    r.cod_mun6 = cleanId(r.cod_mun6).padStart(6, '0');
    r.id_tipologia = cleanId(r.id_tipologia);
    numerify(r);
    state.munMeta.set(r.cod_mun6, r);
  });
  state.tipOriginal.forEach(r => {
    r.id_tipologia = cleanId(r.id_tipologia);
    numerify(r);
    state.tipMeta.set(r.id_tipologia, r);
  });
  state.cnae.forEach(r => {
    r.cnae_subclasse_key = cleanId(r.cnae_subclasse_key);
    ['e_obj4_original','com_agr_original','com_min_original','e_obj4_ajustado','com_agr_ajustado','com_min_ajustado','excluir_obj4','q_salario','q_vinculos','rank_salario','rank_vinculos','rank_massa','salario_relativo','vinculos','massa_salarial_rais_2024','remuneracao','indice'].forEach(k => r[k] = num(r[k]));
    state.cnaeMap.set(r.cnae_subclasse_key, r);
  });
  state.compact.forEach(r => {
    r.cod_mun6 = cleanId(r.cod_mun6).padStart(6, '0');
    r.id_tipologia = cleanId(r.id_tipologia);
    r.cnae_subclasse_key = cleanId(r.cnae_subclasse_key);
    r.soma_salarios = num(r.soma_salarios);
  });
  [...state.groupsMun, ...state.groupsTip].forEach(numerify);
}

function numerify(r) {
  Object.keys(r).forEach(k => {
    if (['municipio_nome','uf','regiao','tipologia_pndr','rgi_nome','regioes_capitais','cruz_q_pib_pop','cruz_q_pibpc_pop','cruz_j_pib_pop','cruz_j_pibpc_pop','flag_dep_q_pib_pop','flag_dep_q_pibpc_pop','flag_dep_j_pib_pop','flag_dep_j_pibpc_pop','classificacao','descricao','nivel','secao','divisao','grupo','classe','subclasse','nivel_territorial','tipo_grupo','grupo','metodo_media'].includes(k)) return;
    const v = num(r[k]);
    if (Number.isFinite(v)) r[k] = v;
  });
}

function cleanId(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (/^\d+\.0$/.test(s)) return s.replace('.0','');
  return s;
}
function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function populateFilters() {
  fillSelect('ufFilter', unique(state.munOriginal.map(r => r.uf)).sort());
  fillSelect('regiaoFilter', unique([...state.munOriginal, ...state.tipOriginal].map(r => r.regiao)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  fillSelect('tipologiaFilter', unique([...state.munOriginal, ...state.tipOriginal].map(r => r.tipologia_pndr)).sort());
  fillSelect('secaoFilter', unique(state.cnae.map(r => r.secao)).sort());
  fillSelect('divisaoFilter', unique(state.cnae.map(r => r.divisao)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  const classes = unique(state.cnae.map(r => r.classificacao)).sort();
  fillSelect('classificacaoFilter', classes);
  fillSelect('bulkClassificacao', classes);
}

function fillSelect(id, values) {
  const el = $(id);
  el.innerHTML = '';
  values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').forEach(v => {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = String(v);
    el.appendChild(opt);
  });
}

function setDefaultRanges() {
  const combined = state.munOriginal;
  setRangeInput('pib', combined.map(r => r.pib_2021_mil));
  setRangeInput('pibpc', combined.map(r => r.pib_pc_2021));
  setRangeInput('pop', combined.map(r => r.pop_2021));
}
function setRangeInput(prefix, values) {
  const clean = values.map(num).filter(Number.isFinite);
  if (!clean.length) return;
  $(`${prefix}Min`).placeholder = Math.floor(Math.min(...clean));
  $(`${prefix}Max`).placeholder = Math.ceil(Math.max(...clean));
}

function getMulti(id) {
  return Array.from($(id).selectedOptions).map(o => o.value);
}
function unique(arr) {
  return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))];
}

function getCnaeFilterSet() {
  const sec = new Set(getMulti('secaoFilter'));
  const div = new Set(getMulti('divisaoFilter'));
  const cla = new Set(getMulti('classificacaoFilter'));
  const mode = $('activityMode').value;

  const set = new Set();
  state.cnae.forEach(r => {
    if (sec.size && !sec.has(String(r.secao))) return;
    if (div.size && !div.has(String(r.divisao))) return;
    if (cla.size && !cla.has(String(r.classificacao))) return;
    const f = effectiveFlags(r);
    if (mode === 'obj4' && !f.e) return;
    if (mode === 'commodity' && !(f.agr || f.min)) return;
    if (mode === 'agr' && !f.agr) return;
    if (mode === 'min' && !f.min) return;
    set.add(r.cnae_subclasse_key);
  });
  return set;
}

function effectiveFlags(r) {
  const e = Boolean(num(r.e_obj4_ajustado)) && !Boolean(num(r.excluir_obj4));
  return {
    e,
    agr: Boolean(num(r.com_agr_ajustado)),
    min: Boolean(num(r.com_min_ajustado)),
  };
}

function recomputeMetrics() {
  const activeCnae = getCnaeFilterSet();
  const byMun = new Map();
  const byTip = new Map();
  const byCnae = new Map();

  state.munOriginal.forEach(r => byMun.set(r.cod_mun6, initMetric(r, 'municipio')));
  state.tipOriginal.forEach(r => byTip.set(r.id_tipologia, initMetric(r, 'tipologia')));

  for (const row of state.compact) {
    if (!activeCnae.has(row.cnae_subclasse_key)) continue;
    const c = state.cnaeMap.get(row.cnae_subclasse_key);
    if (!c) continue;
    const f = effectiveFlags(c);
    const v = row.soma_salarios || 0;

    const m = byMun.get(row.cod_mun6);
    if (m) addMass(m, v, f);
    const t = byTip.get(row.id_tipologia);
    if (t) addMass(t, v, f);

    const ct = byCnae.get(row.cnae_subclasse_key) || { cnae_subclasse_key: row.cnae_subclasse_key, massa_total: 0, massa_obj4: 0, massa_com: 0, massa_com_agr: 0, massa_com_min: 0 };
    addMass(ct, v, f);
    byCnae.set(row.cnae_subclasse_key, ct);
  }

  state.munMetrics = Array.from(byMun.values()).map(finalizeMetric);
  state.tipMetrics = Array.from(byTip.values()).map(finalizeMetric);
  state.cnaeTotals = byCnae;
}

function initMetric(meta, level) {
  return {
    ...meta,
    nivel_territorial: level,
    massa_total: 0,
    massa_obj4: 0,
    massa_com_agr: 0,
    massa_com_min: 0,
    massa_com: 0,
    razao_dependencia_com: NaN,
  };
}
function addMass(m, v, f) {
  m.massa_total += v;
  if (f.e) m.massa_obj4 += v;
  if (f.agr) m.massa_com_agr += v;
  if (f.min) m.massa_com_min += v;
}
function finalizeMetric(m) {
  m.massa_com = m.massa_com_agr + m.massa_com_min;
  m.razao_dependencia_com = m.massa_obj4 > 0 ? m.massa_com / m.massa_obj4 : NaN;
  return m;
}

function updateAll() {
  const level = $('levelSelect').value;
  state.lastLevel = level;
  const base = level === 'municipio' ? state.munMetrics : state.tipMetrics;
  const filtered = applyTerritoryFilters(base);
  const classified = classifyRows(filtered, base);
  state.activeRows = classified;
  renderCards(classified);
  renderOverviewCharts(classified);
  renderGroupCharts(classified);
  renderGroupTable(classified);
  renderCnaeCharts();
  renderActivityEditTable();
  renderRanking();
  renderAnalyticTable();
  updateMap();
}

function applyTerritoryFilters(rows) {
  const ufs = new Set(getMulti('ufFilter'));
  const regs = new Set(getMulti('regiaoFilter'));
  const tips = new Set(getMulti('tipologiaFilter'));
  const muniSearch = $('municipioSearch').value.trim().toLowerCase();

  const pibMin = inputNum('pibMin'), pibMax = inputNum('pibMax');
  const pibpcMin = inputNum('pibpcMin'), pibpcMax = inputNum('pibpcMax');
  const popMin = inputNum('popMin'), popMax = inputNum('popMax');

  return rows.filter(r => {
    if (ufs.size && !ufs.has(String(r.uf))) return false;
    if (regs.size && !regs.has(String(r.regiao))) return false;
    if (tips.size && !tips.has(String(r.tipologia_pndr))) return false;
    if (muniSearch && !String(r.municipio_nome || '').toLowerCase().includes(muniSearch)) return false;
    if (Number.isFinite(pibMin) && !(num(r.pib_2021_mil) >= pibMin)) return false;
    if (Number.isFinite(pibMax) && !(num(r.pib_2021_mil) <= pibMax)) return false;
    if (Number.isFinite(pibpcMin) && !(num(r.pib_pc_2021) >= pibpcMin)) return false;
    if (Number.isFinite(pibpcMax) && !(num(r.pib_pc_2021) <= pibpcMax)) return false;
    if (Number.isFinite(popMin) && !(num(r.pop_2021) >= popMin)) return false;
    if (Number.isFinite(popMax) && !(num(r.pop_2021) <= popMax)) return false;
    return true;
  });
}
function inputNum(id) {
  const v = $(id).value;
  return v === '' ? NaN : Number(v);
}

function classifyRows(rows, universe) {
  const mode = $('referenceMode').value;
  const method = $('meanMethod').value;
  let groupRef = new Map();
  let defaultRef = NaN;

  if (mode === 'brasil') {
    defaultRef = calcReference(rows, method);
  } else if (mode === 'custom') {
    const custom = applyCustomRange(universe);
    defaultRef = calcReference(custom, method);
  } else {
    const groups = new Map();
    rows.forEach(r => {
      const g = String(r[mode] ?? '');
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    });
    groups.forEach((arr, g) => groupRef.set(g, calcReference(arr, method)));
  }

  return rows.map(r => {
    const ref = (mode === 'brasil' || mode === 'custom') ? defaultRef : groupRef.get(String(r[mode] ?? ''));
    const ratio = r.razao_dependencia_com;
    const dist = Number.isFinite(ratio) && Number.isFinite(ref) && ref !== 0 ? (ratio - ref) / Math.abs(ref) : NaN;
    return {
      ...r,
      referencia_comparacao: ref,
      classificacao_media: !Number.isFinite(ratio) || !Number.isFinite(ref) ? 'Sem classificação' : (ratio >= ref ? 'Acima ou igual' : 'Abaixo'),
      distancia_media: dist,
      potencial_diversificacao: potentialScore(r),
    };
  });
}
function applyCustomRange(rows) {
  return applyTerritoryFilters(rows);
}
function calcReference(arr, method) {
  const clean = arr.filter(r => Number.isFinite(r.razao_dependencia_com));
  if (!clean.length) return NaN;
  if (method === 'simples') return clean.reduce((a,r)=>a+r.razao_dependencia_com,0) / clean.length;
  if (method === 'ponderada_massa_obj4') {
    const denom = clean.reduce((a,r)=>a+(r.massa_obj4||0),0);
    return denom > 0 ? clean.reduce((a,r)=>a+(r.razao_dependencia_com||0)*(r.massa_obj4||0),0)/denom : NaN;
  }
  const obj = clean.reduce((a,r)=>a+(r.massa_obj4||0),0);
  const com = clean.reduce((a,r)=>a+(r.massa_com||0),0);
  return obj > 0 ? com / obj : NaN;
}
function potentialScore(r) {
  const obj = Math.log1p(Math.max(0, r.massa_obj4 || 0));
  const lowDep = Number.isFinite(r.razao_dependencia_com) ? 1 / (1 + r.razao_dependencia_com) : 0;
  const pibpc = Math.log1p(Math.max(0, r.pib_pc_2021 || 0));
  return 100 * normalizeApprox(obj, 10, 24) * 0.45 + 100 * lowDep * 0.35 + 100 * normalizeApprox(pibpc, 8, 12) * 0.20;
}
function normalizeApprox(x, min, max) {
  return Math.max(0, Math.min(1, (x - min) / (max - min)));
}

function renderCards(rows) {
  const sum = (k) => rows.reduce((a,r)=>a+(Number.isFinite(num(r[k]))?num(r[k]):0),0);
  const mt = sum('massa_total'), mo = sum('massa_obj4'), ma = sum('massa_com_agr'), mm = sum('massa_com_min'), mc = ma + mm;
  const ratio = mo > 0 ? mc / mo : NaN;
  const ref = calcReference(rows, $('meanMethod').value);
  const above = rows.filter(r => r.classificacao_media === 'Acima ou igual').length;
  const below = rows.filter(r => r.classificacao_media === 'Abaixo').length;
  const cards = [
    ['Territórios', fmtInt(rows.length), 'unidades selecionadas'],
    ['Massa salarial total', fmtMoney(mt), 'soma das atividades filtradas'],
    ['Massa elegível OBJ4', fmtMoney(mo), fmtPct(mo/mt) + ' da massa total'],
    ['Commodities agrícolas', fmtMoney(ma), fmtPct(ma/mo) + ' da massa OBJ4'],
    ['Commodities minerais', fmtMoney(mm), fmtPct(mm/mo) + ' da massa OBJ4'],
    ['Commodities totais', fmtMoney(mc), 'agrícolas + minerais'],
    ['Razão de dependência', fmtRatio(ratio), 'massa commodity / massa OBJ4'],
    ['Média de referência', fmtRatio(ref), $('referenceMode').selectedOptions[0].textContent],
    ['Acima da média', fmtInt(above), 'territórios'],
    ['Abaixo da média', fmtInt(below), 'territórios'],
    ['Participação OBJ4', fmtPct(mo/mt), 'massa elegível / total'],
    ['Commodities na OBJ4', fmtPct(mc/mo), 'massa commodity / OBJ4'],
  ];
  $('cards').innerHTML = cards.map(c => `<div class="card"><small>${c[0]}</small><strong>${c[1]}</strong><em>${c[2]}</em></div>`).join('');
}

function renderOverviewCharts(rows) {
  const label = (r) => state.lastLevel === 'municipio' ? `${r.municipio_nome || r.cod_mun6} (${r.uf || ''})` : `${r.id_tipologia} · ${r.tipologia_pndr || ''}`;
  const topRatio = rows.filter(r => Number.isFinite(r.razao_dependencia_com)).sort((a,b)=>b.razao_dependencia_com-a.razao_dependencia_com).slice(0,15).reverse();
  Plotly.newPlot('chartTopRatio', [{
    type:'bar', orientation:'h',
    x: topRatio.map(r=>r.razao_dependencia_com),
    y: topRatio.map(label),
    hovertemplate:'Razão: %{x:.3f}<extra></extra>'
  }], plotLayout('Razão de dependência'), {displayModeBar:false, responsive:true});

  const topObj = rows.filter(r => Number.isFinite(r.massa_obj4)).sort((a,b)=>b.massa_obj4-a.massa_obj4).slice(0,15).reverse();
  Plotly.newPlot('chartTopObj4', [{
    type:'bar', orientation:'h',
    x: topObj.map(r=>r.massa_obj4),
    y: topObj.map(label),
    hovertemplate:'Massa OBJ4: R$ %{x:,.0f}<extra></extra>'
  }], plotLayout('Massa elegível'), {displayModeBar:false, responsive:true});

  const scatter = rows.filter(r => Number.isFinite(r.pib_pc_2021) && Number.isFinite(r.razao_dependencia_com));
  Plotly.newPlot('chartScatter', [{
    type:'scatter', mode:'markers',
    x: scatter.map(r=>r.pib_pc_2021),
    y: scatter.map(r=>r.razao_dependencia_com),
    text: scatter.map(label),
    marker: { size: scatter.map(r => Math.max(6, Math.min(38, Math.sqrt((r.massa_obj4 || 0)/1e6)))) },
    hovertemplate:'%{text}<br>PIB pc: %{x:,.0f}<br>Razão: %{y:.3f}<extra></extra>'
  }], plotLayout('PIB per capita × razão'), {displayModeBar:false, responsive:true});

  const mt = rows.reduce((a,r)=>a+(r.massa_total||0),0);
  const mo = rows.reduce((a,r)=>a+(r.massa_obj4||0),0);
  const ma = rows.reduce((a,r)=>a+(r.massa_com_agr||0),0);
  const mm = rows.reduce((a,r)=>a+(r.massa_com_min||0),0);
  const values = [Math.max(0, mo - ma - mm), ma, mm, Math.max(0, mt - mo)];
  Plotly.newPlot('chartComposition', [{
    type:'pie',
    labels:['Elegível não commodity','Commodity agrícola','Commodity mineral','Não elegível'],
    values,
    hole:.45,
    textinfo:'label+percent'
  }], plotLayout('Composição'), {displayModeBar:false, responsive:true});
}

function renderGroupCharts(rows) {
  renderHeat('chartHeatPibPop', rows, 'cruz_q_pib_pop');
  renderHeat('chartHeatPibpcPop', rows, 'cruz_q_pibpc_pop');
}
function renderHeat(id, rows, col) {
  const xs = ['QPOP1','QPOP2','QPOP3','QPOP4'];
  const ys = col.includes('pibpc') ? ['QPIBPC1','QPIBPC2','QPIBPC3','QPIBPC4'] : ['QPIB1','QPIB2','QPIB3','QPIB4'];
  const z = ys.map(y => xs.map(x => {
    const sub = rows.filter(r => String(r[col] || '').includes(y) && String(r[col] || '').includes(x));
    return calcReference(sub, $('meanMethod').value);
  }));
  Plotly.newPlot(id, [{ type:'heatmap', x: xs, y: ys, z, hovertemplate:'%{y} × %{x}<br>Razão: %{z:.3f}<extra></extra>' }], plotLayout('Razão média por grupo'), {displayModeBar:false, responsive:true});
}

function renderGroupTable(rows) {
  const groupCol = $('referenceMode').value === 'custom' ? 'custom' : $('referenceMode').value;
  const method = $('meanMethod').value;
  let out = [];
  if (groupCol === 'brasil' || groupCol === 'custom') {
    out = [{grupo: groupCol === 'brasil' ? 'Brasil/universo filtrado' : 'Grupo customizado', metodo: method, n: rows.length, razao: calcReference(rows, method), massa_obj4: sum(rows,'massa_obj4'), massa_com: sum(rows,'massa_com')}];
  } else {
    const m = new Map();
    rows.forEach(r => {
      const g = String(r[groupCol] ?? '');
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r);
    });
    out = Array.from(m.entries()).map(([g, arr]) => ({grupo:g, metodo:method, n:arr.length, razao:calcReference(arr, method), massa_obj4:sum(arr,'massa_obj4'), massa_com:sum(arr,'massa_com')})).sort((a,b)=>b.razao-a.razao);
  }
  state.groupRows = out;
  renderTable('groupsTable', out, [
    ['grupo','Grupo'], ['metodo','Método'], ['n','N'], ['razao','Razão'], ['massa_obj4','Massa OBJ4'], ['massa_com','Massa commodity']
  ], { limit: 200 });
}

function renderCnaeCharts() {
  const rows = state.cnae.map(r => ({ ...r, ...(state.cnaeTotals.get(r.cnae_subclasse_key) || {}) }));
  const bySec = new Map();
  rows.forEach(r => {
    const k = r.secao || 'Sem seção';
    bySec.set(k, (bySec.get(k) || 0) + (r.massa_total || 0));
  });
  const secRows = Array.from(bySec.entries()).map(([secao, massa])=>({secao,massa})).sort((a,b)=>b.massa-a.massa).slice(0,20).reverse();
  Plotly.newPlot('chartCnaeSecao', [{type:'bar', orientation:'h', y:secRows.map(r=>r.secao), x:secRows.map(r=>r.massa)}], plotLayout('Massa por seção'), {displayModeBar:false, responsive:true});

  const scat = rows.filter(r => Number.isFinite(r.salario_relativo) && Number.isFinite(r.vinculos)).slice(0,2000);
  Plotly.newPlot('chartCnaeScatter', [{
    type:'scatter', mode:'markers',
    x: scat.map(r=>r.vinculos),
    y: scat.map(r=>r.salario_relativo),
    text: scat.map(r=>`${r.cnae_subclasse_key} · ${r.descricao || ''}`),
    marker: { size: scat.map(r=>Math.max(5, Math.min(32, Math.sqrt((r.massa_salarial_rais_2024||0)/1e6)))) },
    hovertemplate:'%{text}<br>Vínculos: %{x:,.0f}<br>Salário relativo: %{y:.2f}<extra></extra>'
  }], plotLayout('Salário relativo × vínculos'), {displayModeBar:false, responsive:true});

  const rank = rows.sort((a,b)=>(b.massa_total||0)-(a.massa_total||0)).slice(0,150);
  renderTable('cnaeRankingTable', rank, [
    ['cnae_subclasse_key','CNAE'], ['descricao','Descrição'], ['secao','Seção'], ['classificacao','Classificação'], ['massa_total','Massa no painel'], ['e_obj4_ajustado','OBJ4'], ['com_agr_ajustado','Agr'], ['com_min_ajustado','Min']
  ], { limit: 150 });
}

function renderActivityEditTable() {
  const q = $('cnaeSearch').value.trim().toLowerCase();
  let rows = state.cnae.filter(r => !q || `${r.cnae_subclasse_key} ${r.descricao} ${r.secao} ${r.divisao}`.toLowerCase().includes(q));
  rows = rows.slice(0, 450);
  const html = `<table><thead><tr>
    <th>CNAE</th><th>Descrição</th><th>Seção</th><th>Classificação</th><th>Q sal.</th><th>Q vínc.</th>
    <th>OBJ4</th><th>Agr.</th><th>Min.</th><th>Excluir OBJ4</th>
  </tr></thead><tbody>${rows.map(r => `
    <tr data-cnae="${r.cnae_subclasse_key}">
      <td>${esc(r.cnae_subclasse_key)}</td>
      <td>${esc(r.descricao || '')}</td>
      <td>${esc(r.secao || '')}</td>
      <td>${esc(r.classificacao || '')}</td>
      <td class="num">${fmt(r.q_salario)}</td>
      <td class="num">${fmt(r.q_vinculos)}</td>
      ${checkboxCell('e_obj4_ajustado', r)}
      ${checkboxCell('com_agr_ajustado', r)}
      ${checkboxCell('com_min_ajustado', r)}
      ${checkboxCell('excluir_obj4', r)}
    </tr>`).join('')}</tbody></table>
    <p class="muted">Exibindo ${fmtInt(rows.length)} de ${fmtInt(state.cnae.length)} CNAEs. Use a busca para localizar atividades específicas.</p>`;
  $('activityEditTable').innerHTML = html;
  $('activityEditTable').querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (ev) => {
      const tr = ev.target.closest('tr');
      const c = state.cnaeMap.get(tr.dataset.cnae);
      c[ev.target.dataset.field] = ev.target.checked ? 1 : 0;
    });
  });
}
function checkboxCell(field, r) {
  return `<td class="checkbox-cell"><input type="checkbox" data-field="${field}" ${num(r[field]) ? 'checked' : ''}></td>`;
}

function restoreActivityFlags() {
  state.cnae.forEach(r => {
    r.e_obj4_ajustado = r.e_obj4_original;
    r.com_agr_ajustado = r.com_agr_original;
    r.com_min_ajustado = r.com_min_original;
    r.excluir_obj4 = 0;
  });
  recomputeMetrics(); updateAll(); setStatus('Classificações originais restauradas.');
}
function excludeByClassificacao() {
  const cls = new Set(getMulti('bulkClassificacao'));
  if (!cls.size) return alert('Selecione uma ou mais classificações.');
  state.cnae.forEach(r => { if (cls.has(String(r.classificacao))) r.excluir_obj4 = 1; });
  renderActivityEditTable();
}
function bulkVisibleObj4(value) {
  const q = $('cnaeSearch').value.trim().toLowerCase();
  state.cnae.forEach(r => {
    if (!q || `${r.cnae_subclasse_key} ${r.descricao} ${r.secao} ${r.divisao}`.toLowerCase().includes(q)) r.e_obj4_ajustado = value;
  });
  renderActivityEditTable();
}
function downloadActivityCsv() {
  exportRows(state.cnae.map(r => ({
    cnae_subclasse_key: r.cnae_subclasse_key,
    e_obj4_ajustado: r.e_obj4_ajustado,
    com_agr_ajustado: r.com_agr_ajustado,
    com_min_ajustado: r.com_min_ajustado,
    excluir_obj4: r.excluir_obj4
  })), 'classificacao_cnae_ajustada.csv');
}
function uploadActivityCsv(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  Papa.parse(file, {header:true, dynamicTyping:true, skipEmptyLines:true, complete: (res) => {
    res.data.forEach(r => {
      const c = state.cnaeMap.get(cleanId(r.cnae_subclasse_key));
      if (!c) return;
      ['e_obj4_ajustado','com_agr_ajustado','com_min_ajustado','excluir_obj4'].forEach(k => {
        if (r[k] !== undefined && r[k] !== '') c[k] = num(r[k]) ? 1 : 0;
      });
    });
    renderActivityEditTable();
    recomputeMetrics(); updateAll();
  }});
}

function renderRanking() {
  renderTable('rankingTable', getRankingRows(), [
    ['nome','Território'], ['uf','UF'], ['tipologia_pndr','Tipologia'], ['razao_dependencia_com','Razão'], ['referencia_comparacao','Referência'], ['distancia_media','Distância'], ['massa_obj4','Massa OBJ4'], ['massa_com','Massa commodity'], ['potencial_diversificacao','Potencial']
  ], { limit: 250 });
}
function getRankingRows() {
  const metric = $('rankingMetric').value;
  return [...state.activeRows].map(r => ({...r, nome: state.lastLevel === 'municipio' ? (r.municipio_nome || r.cod_mun6) : `${r.id_tipologia} · ${r.tipologia_pndr || ''}`}))
    .sort((a,b)=>(num(b[metric])-num(a[metric]))).slice(0,500);
}

function renderAnalyticTable() {
  renderTable('analyticTable', currentAnalyticRows(), currentAnalyticColumns(), { limit: 500, search: $('tableSearch').value });
}
function currentAnalyticRows() {
  const ds = $('tableDataset').value;
  if (ds === 'cnae') return state.cnae.map(r => ({...r, ...(state.cnaeTotals.get(r.cnae_subclasse_key)||{})}));
  if (ds === 'groups') return state.groupRows || [];
  return state.activeRows.map(r => ({...r, nome: state.lastLevel === 'municipio' ? (r.municipio_nome || r.cod_mun6) : `${r.id_tipologia} · ${r.tipologia_pndr || ''}`}));
}
function currentAnalyticColumns() {
  const ds = $('tableDataset').value;
  if (ds === 'cnae') return [['cnae_subclasse_key','CNAE'],['descricao','Descrição'],['secao','Seção'],['divisao','Divisão'],['classificacao','Classificação'],['massa_total','Massa'],['e_obj4_ajustado','OBJ4'],['com_agr_ajustado','Agr'],['com_min_ajustado','Min'],['salario_relativo','Salário rel.'],['vinculos','Vínculos']];
  if (ds === 'groups') return [['grupo','Grupo'],['metodo','Método'],['n','N'],['razao','Razão'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity']];
  return [['nome','Território'],['uf','UF'],['regiao','Região'],['tipologia_pndr','Tipologia'],['pib_2021_mil','PIB 2021 mil'],['pib_pc_2021','PIB pc'],['pop_2021','Pop 2021'],['massa_total','Massa total'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity'],['razao_dependencia_com','Razão'],['classificacao_media','Classificação']];
}

function renderTable(id, rows, cols, opts = {}) {
  const search = (opts.search || '').toLowerCase();
  let data = rows || [];
  if (search) data = data.filter(r => JSON.stringify(r).toLowerCase().includes(search));
  if (opts.limit) data = data.slice(0, opts.limit);
  const thead = `<thead><tr>${cols.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${data.map(r => `<tr>${cols.map(c => cell(r[c[0]], c[0])).join('')}</tr>`).join('')}</tbody>`;
  $(id).innerHTML = `<table>${thead}${tbody}</table><p class="muted">Exibindo ${fmtInt(data.length)} registros.</p>`;
}
function cell(v, key) {
  if (key.includes('classificacao_media')) {
    const cl = v === 'Acima ou igual' ? 'up' : (v === 'Abaixo' ? 'down' : 'na');
    return `<td><span class="badge ${cl}">${esc(v ?? '')}</span></td>`;
  }
  if (typeof v === 'number' || Number.isFinite(num(v))) {
    const n = num(v);
    const val = key.includes('massa') ? fmtMoney(n) : (key.includes('razao') || key.includes('distancia') || key.includes('referencia') ? fmtRatio(n) : fmt(n));
    return `<td class="num">${val}</td>`;
  }
  return `<td>${esc(v ?? '')}</td>`;
}

async function initMaps() {
  if (!window.L) return;
  state.map = L.map('map').setView([-14.2, -51.9], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    attribution: '&copy; OpenStreetMap · Malhas simplificadas: IBGE API de Malhas Geográficas'
  }).addTo(state.map);

  const mapMessages = [];

  try {
    state.geoMunicipios = await loadMunicipalMesh();
    mapMessages.push('Malha municipal carregada.');
  } catch (e) {
    console.error(e);
    mapMessages.push('Malha municipal indisponível. Verifique maps/municipios.geojson, maps/municipios_ibge_topo.json ou conexão com a API do IBGE.');
  }

  try {
    state.geoUfs = await loadUfMesh();
    mapMessages.push('Contorno de UFs carregado.');
  } catch(e) {
    console.warn('Contorno de UFs indisponível:', e);
  }

  $('mapWarning').textContent = mapMessages.join(' ');
  updateMap();
}

async function loadMunicipalMesh() {
  // 1) Preferência: GeoJSON local, para uso offline total.
  try {
    const g = await fetchJson(MAP_FILES.municipiosGeojson);
    return normalizeMunicipalGeojson(g);
  } catch (e) {}

  // 2) Alternativa local: TopoJSON oficial do IBGE já baixado para maps/.
  try {
    const t = await fetchJson(MAP_FILES.municipiosTopojson);
    return normalizeMunicipalGeojson(topoToGeojson(t, ['BRMU', 'municipios', 'municipio']));
  } catch (e) {}

  // 3) Fallback online: API pública de malhas simplificadas do IBGE.
  const t = await fetchJson(REMOTE_MAPS.municipiosTopojson);
  return normalizeMunicipalGeojson(topoToGeojson(t, ['BRMU', 'municipios', 'municipio']));
}

async function loadUfMesh() {
  try {
    return await fetchJson(MAP_FILES.ufsGeojson);
  } catch (e) {}

  try {
    const t = await fetchJson(MAP_FILES.ufsTopojson);
    return topoToGeojson(t, ['BRUF', 'ufs', 'UF']);
  } catch (e) {}

  const t = await fetchJson(REMOTE_MAPS.ufsTopojson);
  return topoToGeojson(t, ['BRUF', 'ufs', 'UF']);
}

function topoToGeojson(topo, preferredKeys = []) {
  if (!window.topojson) throw new Error('Biblioteca topojson-client não carregada.');
  if (!topo || !topo.objects) throw new Error('TopoJSON inválido.');
  const objects = topo.objects;
  const keys = Object.keys(objects);
  let key = preferredKeys.find(k => objects[k]);
  if (!key) key = keys.find(k => /MU|mun/i.test(k)) || keys.find(k => /UF|estado/i.test(k)) || keys[0];
  if (!key) throw new Error('TopoJSON sem objetos geográficos.');
  return topojson.feature(topo, objects[key]);
}

function normalizeMunicipalGeojson(geo) {
  if (!geo || !Array.isArray(geo.features)) return geo;
  geo.features.forEach(f => {
    const p = f.properties || {};
    const raw = p.codarea || p.CD_MUN || p.cd_mun || p.codigo_municipio || p.CD_GEOCMU || p.id || p.code_muni || '';
    const s = cleanId(raw);
    if (s) {
      p.cod_mun7 = s.length >= 7 ? s.slice(0, 7) : s;
      p.cod_mun6 = s.length >= 7 ? s.slice(0, 6) : s.padStart(6, '0');
    }
    f.properties = p;
  });
  return geo;
}

function updateMap() {
  if (!state.map || !state.geoMunicipios) return;
  const metric = $('mapMetric').value;
  const byKey = new Map();
  state.activeRows.forEach(r => {
    const key = state.lastLevel === 'municipio' ? r.cod_mun6 : r.id_tipologia;
    byKey.set(String(key), r);
  });
  const vals = state.activeRows.map(r => num(r[metric])).filter(Number.isFinite);
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;

  if (state.geoLayer) state.geoLayer.remove();
  state.geoLayer = L.geoJSON(state.geoMunicipios, {
    style: (feature) => {
      const id = featureMunId(feature);
      const row = state.lastLevel === 'municipio' ? byKey.get(id) : byKey.get(cleanId((state.munMeta.get(id) || {}).id_tipologia));
      return { color:'#ffffff', weight:.35, fillColor: mapColor(row, metric, min, max), fillOpacity: row ? .78 : .05 };
    },
    onEachFeature: (feature, layer) => {
      const id = featureMunId(feature);
      const row = state.lastLevel === 'municipio' ? byKey.get(id) : byKey.get(cleanId((state.munMeta.get(id) || {}).id_tipologia));
      layer.bindTooltip(row ? tooltipHtml(row) : 'Sem dados', { sticky:true });
      layer.on('mouseover', () => layer.setStyle({weight:1.2, color:'#102a43'}));
      layer.on('mouseout', () => state.geoLayer.resetStyle(layer));
    }
  }).addTo(state.map);

  if (state.geoUfs && !state.ufLayer) {
    state.ufLayer = L.geoJSON(state.geoUfs, { style:{ fillOpacity:0, color:'#102a43', weight:1.4, opacity:.9 } }).addTo(state.map);
  }
}
function featureMunId(feature) {
  const p = feature.properties || {};
  const v = p.cod_mun6 || p.cod_mun7 || p.codarea || p.CD_MUN || p.cd_mun || p.codigo_municipio || p.CD_GEOCMU || p.id || p.code_muni || '';
  const s = cleanId(v);
  return s.length >= 7 ? s.slice(0,6) : s.padStart(6,'0');
}
function mapColor(row, metric, min, max) {
  if (!row) return '#e9eef6';
  if (metric === 'classificacao_media') {
    if (row.classificacao_media === 'Acima ou igual') return '#b42318';
    if (row.classificacao_media === 'Abaixo') return '#1b7f63';
    return '#98a2b3';
  }
  const v = num(row[metric]);
  if (!Number.isFinite(v)) return '#d0d5dd';
  const t = max > min ? Math.max(0, Math.min(1, (v - min)/(max-min))) : .5;
  return interpolate('#e0f2fe', '#083c5f', t);
}
function tooltipHtml(r) {
  return `<strong>${esc(r.municipio_nome || r.id_tipologia || '')}</strong><br>
  UF: ${esc(r.uf || '')}<br>Tipologia: ${esc(r.tipologia_pndr || '')}<br>
  PIB pc: ${fmtMoney(r.pib_pc_2021)}<br>Pop. 2021: ${fmtInt(r.pop_2021)}<br>
  Massa OBJ4: ${fmtMoney(r.massa_obj4)}<br>Massa com.: ${fmtMoney(r.massa_com)}<br>
  Razão: ${fmtRatio(r.razao_dependencia_com)}<br>Ref.: ${fmtRatio(r.referencia_comparacao)}<br>${esc(r.classificacao_media || '')}`;
}

function resetFilters() {
  document.querySelectorAll('select[multiple]').forEach(s => Array.from(s.options).forEach(o => o.selected = false));
  ['municipioSearch','pibMin','pibMax','pibpcMin','pibpcMax','popMin','popMax','tableSearch','cnaeSearch'].forEach(id => $(id).value = '');
  $('activityMode').value = 'all';
  $('referenceMode').value = 'brasil';
  $('meanMethod').value = 'ponderada_refeita';
  updateAll();
}

function sum(rows, key) { return rows.reduce((a,r)=>a+(Number.isFinite(num(r[key]))?num(r[key]):0),0); }
function fmtMoney(v) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return 'R$ ' + (v/1e9).toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' bi';
  if (abs >= 1e6) return 'R$ ' + (v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' mi';
  return 'R$ ' + v.toLocaleString('pt-BR',{maximumFractionDigits:0});
}
function fmtPct(v) { return Number.isFinite(v) ? (100*v).toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%' : '—'; }
function fmtRatio(v) { return Number.isFinite(v) ? v.toLocaleString('pt-BR',{maximumFractionDigits:3}) : '—'; }
function fmt(v) { return Number.isFinite(num(v)) ? num(v).toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—'; }
function fmtInt(v) { return Number.isFinite(num(v)) ? Math.round(num(v)).toLocaleString('pt-BR') : '—'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function setStatus(msg) { $('loadStatus').textContent = msg; }
function plotLayout(title) {
  return { title: { text: title, font:{size:13} }, margin:{l:110,r:20,t:38,b:45}, paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:'Inter, sans-serif', size:12}, xaxis:{automargin:true}, yaxis:{automargin:true} };
}
function interpolate(a, b, t) {
  const ah = parseInt(a.replace('#',''),16), ar=ah>>16, ag=ah>>8&0xff, ab=ah&0xff;
  const bh = parseInt(b.replace('#',''),16), br=bh>>16, bg=bh>>8&0xff, bb=bh&0xff;
  const rr = ar + t*(br-ar), rg = ag + t*(bg-ag), rb = ab + t*(bb-ab);
  return '#' + ((1<<24) + (rr<<16) + (rg<<8) + (rb|0)).toString(16).slice(1);
}

function exportRows(rows, filename) {
  if (!rows || !rows.length) return alert('Não há dados para exportar.');
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
