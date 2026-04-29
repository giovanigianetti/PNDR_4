/* Dashboard Objetivo 4 da PNDR
   Versão PNDR_4 ajustada: sem faixas customizadas, média ponderada única,
   mapa com duas visualizações, matriz territorial flexível, Indicador OBJ4
   e rótulo RAIS 2024 Brasil nas abas CNAE/edição.
*/
const state = {
  meta: null,
  munOriginal: [],
  tipOriginal: [],
  munMetrics: [],
  tipMetrics: [],
  cnae: [],
  compact: [],
  cnaeMap: new Map(),
  munMeta: new Map(),
  tipMeta: new Map(),
  cnaeTotals: new Map(),
  activeRows: [],
  groupRows: [],
  activitySort: { key: 'secao', dir: 'asc' },
  map: null,
  geoMunicipios: null,
  geoUfs: null,
  geoLayer: null,
  ufLayer: null,
  legend: null,
  lastLevel: 'municipio',
};

const FILES = {
  meta: 'data/metadata_obj4.json',
  mun: 'data/indicadores_obj4_municipio.csv',
  tip: 'data/indicadores_obj4_tipologia.csv',
  cnae: 'data/tabela_cnae_editavel.csv',
  compactGz: 'data/base_mun_cnae_compact.csv.gz',
  compactCsv: 'data/base_mun_cnae_compact.csv',
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
  municipiosTopojson: 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fjson&intrarregiao=municipio&qualidade=minima',
  ufsTopojson: 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fjson&intrarregiao=UF&qualidade=minima',
};

const GROUP_DIMS = {
  pib: { label: 'PIB 2021', q: 'q_pib_2021', value: 'pib_2021_mil', prefix: 'QPIB' },
  pibpc: { label: 'PIB per capita 2021', q: 'q_pib_pc_2021', value: 'pib_pc_2021', prefix: 'QPIBPC' },
  pop2021: { label: 'População 2021', q: 'q_pop_2021', value: 'pop_2021', prefix: 'QPOP2021_' },
  pop2022: { label: 'População 2022', q: 'q_pop_2022', value: 'pop_2022', prefix: 'QPOP2022_' },
};

const NUM_FIELDS = new Set([
  'pib_2021_mil','pib_pc_2021','pop_2021','pop_2022',
  'massa_total','massa_obj4','massa_com_agr','massa_com_min','massa_com','razao_dependencia_com',
  'q_pib_2021','q_pib_pc_2021','q_pop_2021','q_pop_2022','sem_correspondencia_territorial',
  'n_municipios','n_territorios_grupo','massa_total_grupo','massa_obj4_grupo','massa_com_grupo',
  'razao_referencia','razao_dependencia_grupo_ponderada','razao_dependencia_grupo_media_simples','razao_dependencia_grupo_media_pond',
  'soma_salarios','divisao','grupo','classe','subclasse','vinculos','remuneracao','massa_salarial_rais_2024',
  'salario_relativo','dif_abs','dif_perc','share_vinculos','share_massa','q_salario','q_vinculos','jenks',
  'rank_salario','rank_vinculos','rank_massa','indice',
  'e_obj4_original','com_agr_original','com_min_original','excluir_obj4_original',
  'e_obj4_ajustado','com_agr_ajustado','com_min_ajustado','excluir_obj4',
  'e_obj4','com_agr','com_min'
]);

const $ = (id) => document.getElementById(id);
document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindUi();
  setStatus('Carregando arquivos...');
  try {
    await loadAllData();
    prepareState();
    populateFilters();
    recomputeMetrics();
    updateAll();
    await initMaps();
    setStatus(`Pronto · ${fmtInt(state.munOriginal.length)} municípios · ${fmtInt(state.cnae.length)} CNAEs · ${fmtInt(state.compact.length)} linhas município–CNAE`);
  } catch (err) {
    console.error(err);
    setStatus('Erro ao carregar dados. Verifique o console e os caminhos dos arquivos.');
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
    if (btn.dataset.tab === 'maps' && state.map) setTimeout(() => state.map.invalidateSize(), 120);
  });

  ['applyFilters','levelSelect','referenceMode','meanMethod','indicatorMode','activityMode'].forEach(id => {
    $(id).addEventListener(id === 'applyFilters' ? 'click' : 'change', () => { recomputeMetrics(); updateAll(); });
  });
  ['mapMetric'].forEach(id => $(id).addEventListener('change', updateMap));
  ['groupVarA','groupVarB'].forEach(id => $(id).addEventListener('change', () => { renderGroupCharts(state.activeRows); renderGroupTable(state.activeRows); }));
  $('rankingMetric').addEventListener('change', renderRanking);
  $('tableDataset').addEventListener('change', renderAnalyticTable);
  $('tableSearch').addEventListener('input', renderAnalyticTable);
  $('cnaeSearch').addEventListener('input', renderActivityEditTable);
  $('resetFilters').addEventListener('click', resetFilters);

  $('applyActivityChanges').addEventListener('click', () => {
    setStatus('Recalculando com classificações ajustadas...');
    setTimeout(() => { syncFlagsFromCategories(); recomputeMetrics(); updateAll(); setStatus('Classificações aplicadas.'); }, 50);
  });
  $('restoreActivityChanges').addEventListener('click', restoreActivityFlags);
  $('downloadActivityCsv').addEventListener('click', downloadActivityCsv);
  $('uploadActivityCsv').addEventListener('change', uploadActivityCsv);
  $('excludeByClass').addEventListener('click', excludeByClassificacao);
  $('includeVisibleObj4').addEventListener('click', () => bulkVisibleCategory('OBJ4'));
  $('removeVisibleObj4').addEventListener('click', () => bulkVisibleCategory('EXCLUIR'));
  $('exportTable').addEventListener('click', () => exportRows(currentAnalyticRows(), 'tabela_analitica_obj4.csv'));
  $('exportRanking').addEventListener('click', () => exportRows(getRankingRows(), 'ranking_obj4.csv'));
  $('exportGroups').addEventListener('click', () => exportRows(state.groupRows || [], 'grupos_obj4_filtrados.csv'));
}

async function loadAllData() {
  const [meta, mun, tip, cnae, compact] = await Promise.all([
    fetchJson(FILES.meta),
    fetchCsv(FILES.mun),
    fetchCsv(FILES.tip),
    fetchCsv(FILES.cnae),
    fetchCompactCsv(),
  ]);
  state.meta = meta;
  state.munOriginal = mun;
  state.tipOriginal = tip;
  state.cnae = cnae;
  state.compact = compact;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Não foi possível carregar ${path}`);
  return await res.json();
}
async function fetchCsv(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Não foi possível carregar ${path}`);
  const text = await res.text();
  return Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true }).data;
}
async function fetchCompactCsv() {
  try {
    const res = await fetch(FILES.compactGz, { cache: 'no-store' });
    if (!res.ok) throw new Error('gz indisponível');
    if (!window.pako) throw new Error('pako indisponível');
    const buffer = await res.arrayBuffer();
    const text = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
    return Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true }).data;
  } catch (e) {
    console.warn('Falha ao carregar CSV compactado; tentando CSV simples.', e);
    return await fetchCsv(FILES.compactCsv);
  }
}

function prepareState() {
  state.munMeta.clear();
  state.tipMeta.clear();
  state.cnaeMap.clear();

  state.munOriginal.forEach(r => {
    r.cod_mun6 = cleanDigits(r.cod_mun6, 6);
    r.cod_mun7 = cleanDigits(r.cod_mun7 || r.codigo_municipio7, 7);
    r.id_tipologia = cleanTipologia(r.id_tipologia);
    convertNumericFields(r);
    state.munMeta.set(r.cod_mun6, r);
  });

  state.tipOriginal.forEach(r => {
    r.id_tipologia = cleanTipologia(r.id_tipologia);
    convertNumericFields(r);
    state.tipMeta.set(r.id_tipologia, r);
  });

  state.cnae.forEach(r => {
    r.cnae_subclasse_key = cleanDigits(r.cnae_subclasse_key, 7);
    r.secao = normalizeSecao(r.secao);
    convertNumericFields(r);
    if (!r.categoria_original) r.categoria_original = categoryFromFlags(r, 'original');
    if (!r.categoria_ajustada) r.categoria_ajustada = r.categoria_original;
    setFlagsFromCategory(r, r.categoria_ajustada);
    state.cnaeMap.set(r.cnae_subclasse_key, r);
  });

  state.compact.forEach(r => {
    r.cod_mun6 = cleanDigits(r.cod_mun6, 6);
    r.id_tipologia = cleanTipologia(r.id_tipologia);
    r.cnae_subclasse_key = cleanDigits(r.cnae_subclasse_key, 7);
    r.soma_salarios = num(r.soma_salarios);
  });
}

function convertNumericFields(r) {
  Object.keys(r).forEach(k => {
    if (NUM_FIELDS.has(k)) r[k] = num(r[k]);
  });
}
function cleanDigits(v, width) {
  if (v === null || v === undefined || v === '') return '';
  let s = String(v).trim();
  if (/^\d+\.0$/.test(s)) s = s.replace('.0', '');
  s = s.replace(/\D+/g, '');
  if (width && s) s = s.padStart(width, '0');
  return s;
}
function cleanTipologia(v) {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  if (s === 'SEM_TIPO') return s;
  return cleanDigits(s, 6);
}
function normalizeSecao(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return /^[A-Z]$/.test(s) ? s : 'Z';
}
function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function unique(arr) { return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))]; }
function finiteOrBlank(v) { const n = num(v); return Number.isFinite(n) ? String(Math.trunc(n)) : ''; }
function getMulti(id) { return Array.from($(id).selectedOptions).map(o => o.value); }

function populateFilters() {
  fillSelect('ufFilter', unique(state.munOriginal.map(r => r.uf)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  fillSelect('regiaoFilter', unique([...state.munOriginal, ...state.tipOriginal].map(r => r.regiao)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  fillSelect('tipologiaFilter', unique([...state.munOriginal, ...state.tipOriginal].map(r => r.tipologia_pndr)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR')));
  fillSelect('secaoFilter', unique(state.cnae.map(r => r.secao)).sort());
  fillSelect('divisaoFilter', unique(state.cnae.map(r => finiteOrBlank(r.divisao))).sort((a,b)=>Number(a)-Number(b)));
  const classes = unique(state.cnae.map(r => r.classificacao)).sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
  fillSelect('classificacaoFilter', classes);
  fillSelect('bulkClassificacao', classes);
}
function fillSelect(id, values) {
  const el = $(id);
  el.innerHTML = '';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = String(v);
    el.appendChild(opt);
  });
}

function getCnaeFilterSet() {
  const sec = new Set(getMulti('secaoFilter'));
  const div = new Set(getMulti('divisaoFilter'));
  const cla = new Set(getMulti('classificacaoFilter'));
  const mode = $('activityMode').value;
  const set = new Set();

  state.cnae.forEach(r => {
    if (sec.size && !sec.has(String(r.secao))) return;
    if (div.size && !div.has(String(finiteOrBlank(r.divisao)))) return;
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
function categoryFromFlags(r, suffix) {
  const e = num(r[`e_obj4_${suffix}`] ?? r.e_obj4);
  const a = num(r[`com_agr_${suffix}`] ?? r.com_agr);
  const m = num(r[`com_min_${suffix}`] ?? r.com_min);
  if (a === 1) return 'AGR';
  if (m === 1) return 'MIN';
  if (e === 1) return 'OBJ4';
  return 'EXCLUIR';
}
function setFlagsFromCategory(r, cat) {
  const clean = ['OBJ4','AGR','MIN','EXCLUIR'].includes(String(cat).toUpperCase()) ? String(cat).toUpperCase() : 'EXCLUIR';
  r.categoria_ajustada = clean;
  r.e_obj4_ajustado = clean === 'OBJ4' ? 1 : 0;
  r.com_agr_ajustado = clean === 'AGR' ? 1 : 0;
  r.com_min_ajustado = clean === 'MIN' ? 1 : 0;
  r.excluir_obj4 = clean === 'EXCLUIR' ? 1 : 0;
}
function syncFlagsFromCategories() { state.cnae.forEach(r => setFlagsFromCategory(r, r.categoria_ajustada || 'EXCLUIR')); }
function effectiveFlags(r) { const cat = r.categoria_ajustada || categoryFromFlags(r, 'ajustado'); return { e: cat === 'OBJ4', agr: cat === 'AGR', min: cat === 'MIN' }; }

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
  assignQuartiles(state.munMetrics);
  assignQuartiles(state.tipMetrics);
  addCrossGroups(state.munMetrics);
  addCrossGroups(state.tipMetrics);
  state.cnaeTotals = byCnae;
}
function initMetric(meta, level) { return { ...meta, nivel_territorial: level, massa_total: 0, massa_obj4: 0, massa_com_agr: 0, massa_com_min: 0, massa_com: 0, razao_dependencia_com: NaN }; }
function addMass(m, v, f) {
  m.massa_total += v;
  if (f.e) m.massa_obj4 += v;
  if (f.agr) m.massa_com_agr += v;
  if (f.min) m.massa_com_min += v;
}
function finalizeMetric(m) { m.massa_com = m.massa_com_agr + m.massa_com_min; m.razao_dependencia_com = m.massa_obj4 > 0 ? m.massa_com / m.massa_obj4 : NaN; return m; }
function assignQuartiles(rows) {
  // Recalcula todos os quartis no navegador a partir das variáveis territoriais
  // e limpa valores antigos/importados. Linhas sem informação territorial completa
  // permanecem sem quartil e são excluídas das matrizes de quartis.
  Object.values(GROUP_DIMS).forEach(dim => {
    rows.forEach(r => { r[dim.q] = NaN; });
    const valid = rows
      .filter(r => Number.isFinite(num(r[dim.value])))
      .sort((a,b)=>num(a[dim.value])-num(b[dim.value]));
    const n = valid.length;
    valid.forEach((r,i) => { r[dim.q] = Math.min(4, Math.floor(i * 4 / n) + 1); });
  });
}
function validQuartileValue(q) {
  const n = num(q);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.trunc(n) : null;
}
function quartileLabel(dim, r) {
  const q = validQuartileValue(r[dim.q]);
  return q ? (dim.prefix + q) : null;
}
function addCrossGroups(rows) {
  rows.forEach(r => {
    const qPib = quartileLabel(GROUP_DIMS.pib, r);
    const qPibPc = quartileLabel(GROUP_DIMS.pibpc, r);
    const qPop = quartileLabel(GROUP_DIMS.pop2021, r);
    r.cruz_q_pib_pop = qPib && qPop ? (qPib + '_' + qPop) : '';
    r.cruz_q_pibpc_pop = qPibPc && qPop ? (qPibPc + '_' + qPop) : '';
  });
}

function updateAll() {
  const level = $('levelSelect').value;
  state.lastLevel = level;
  const base = level === 'municipio' ? state.munMetrics : state.tipMetrics;
  const filtered = applyTerritoryFilters(base);
  const classified = classifyRows(filtered);
  state.activeRows = classified;
  renderCards(classified);
  renderOverviewCharts(classified);
  renderGroupCharts(classified);
  renderGroupTable(classified);
  renderCnaeCharts();
  renderActivityEditTable();
  renderRanking();
  renderIndicatorSummary(classified);
  renderAnalyticTable();
  updateMap();
}
function applyTerritoryFilters(rows) {
  const ufs = new Set(getMulti('ufFilter'));
  const regs = new Set(getMulti('regiaoFilter'));
  const tips = new Set(getMulti('tipologiaFilter'));
  const muniSearch = $('municipioSearch').value.trim().toLowerCase();
  return rows.filter(r => {
    if (ufs.size && !ufs.has(String(r.uf))) return false;
    if (regs.size && !regs.has(String(r.regiao))) return false;
    if (tips.size && !tips.has(String(r.tipologia_pndr))) return false;
    if (muniSearch && !String(r.municipio_nome || '').toLowerCase().includes(muniSearch)) return false;
    return true;
  });
}

function referenceGroupKey(r, mode) {
  if (mode === 'brasil') return 'brasil';
  const v = r[mode];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  const str = String(v).trim();
  if (!str || str === 'NaN' || str.includes('NA') || str.endsWith('_') || str.startsWith('_')) return null;
  return str;
}
function classifyRows(rows) {
  const mode = $('referenceMode').value;
  const method = $('meanMethod').value;
  let groupRef = new Map();
  let defaultRef = NaN;

  if (mode === 'brasil') {
    defaultRef = calcReference(rows, method);
  } else {
    const groups = new Map();
    rows.forEach(r => {
      const g = referenceGroupKey(r, mode);
      if (!g) return;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(r);
    });
    groups.forEach((arr, g) => groupRef.set(g, calcReference(arr, method)));
  }

  const classified = rows.map(r => {
    const key = referenceGroupKey(r, mode);
    const ref = mode === 'brasil' ? defaultRef : (key ? groupRef.get(key) : NaN);
    const ratio = r.razao_dependencia_com;
    const dist = Number.isFinite(ratio) && Number.isFinite(ref) && ref !== 0 ? (ratio - ref) / Math.abs(ref) : NaN;
    return { ...r, grupo_referencia: key || 'Sem informação territorial', referencia_comparacao: ref, classificacao_media: basicClass(ratio, ref), distancia_media: dist, potencial_diversificacao: potentialScore(r) };
  });
  applyIndicatorObj4(classified);
  return classified;
}
function basicClass(ratio, ref) {
  if (!Number.isFinite(ratio) || !Number.isFinite(ref)) return 'Sem classificação';
  return ratio >= ref ? 'Acima ou igual à média' : 'Abaixo da média';
}
function applyIndicatorObj4(rows) {
  const mode = $('indicatorMode').value;
  rows.forEach(r => { r.indicador_obj4 = r.classificacao_media; r.indicador_obj4_ordem = 0; });
  if (mode !== 'percentis') return;
  assignPercentileClasses(rows.filter(r => r.classificacao_media === 'Abaixo da média'), 'Abaixo da média');
  assignPercentileClasses(rows.filter(r => r.classificacao_media === 'Acima ou igual à média'), 'Acima/igual à média');
}
function assignPercentileClasses(arr, prefix) {
  const clean = arr.filter(r => Number.isFinite(r.distancia_media)).sort((a,b)=>a.distancia_media-b.distancia_media);
  const n = clean.length;
  clean.forEach((r,i) => {
    const p = n ? Math.min(4, Math.floor(i * 4 / n) + 1) : 0;
    r.indicador_obj4_ordem = p;
    r.indicador_obj4 = `${prefix} · P${pLabel(p)}`;
  });
}
function pLabel(p) { return p === 1 ? '0–25' : p === 2 ? '25–50' : p === 3 ? '50–75' : p === 4 ? '75–100' : 's/ percentil'; }
function calcReference(arr, method) {
  const clean = arr.filter(r => Number.isFinite(r.razao_dependencia_com));
  if (!clean.length) return NaN;
  if (method === 'simples') return clean.reduce((a,r)=>a+r.razao_dependencia_com,0) / clean.length;
  const denom = clean.reduce((a,r)=>a+(r.massa_obj4||0),0);
  return denom > 0 ? clean.reduce((a,r)=>a+(r.razao_dependencia_com||0)*(r.massa_obj4||0),0)/denom : NaN;
}
function potentialScore(r) {
  const obj = Math.log1p(Math.max(0, r.massa_obj4 || 0));
  const lowDep = Number.isFinite(r.razao_dependencia_com) ? 1 / (1 + r.razao_dependencia_com) : 0;
  const pibpc = Math.log1p(Math.max(0, r.pib_pc_2021 || 0));
  return 100 * normalizeApprox(obj, 10, 24) * 0.45 + 100 * lowDep * 0.35 + 100 * normalizeApprox(pibpc, 8, 12) * 0.20;
}
function normalizeApprox(x, min, max) { return Math.max(0, Math.min(1, (x - min) / (max - min))); }

function renderCards(rows) {
  const mt = sum(rows,'massa_total'), mo = sum(rows,'massa_obj4'), ma = sum(rows,'massa_com_agr'), mm = sum(rows,'massa_com_min'), mc = ma + mm;
  const ratio = mo > 0 ? mc / mo : NaN;
  const ref = calcReference(rows, $('meanMethod').value);
  const above = rows.filter(r => r.classificacao_media === 'Acima ou igual à média').length;
  const below = rows.filter(r => r.classificacao_media === 'Abaixo da média').length;
  const cards = [
    ['Territórios', fmtInt(rows.length), 'unidades selecionadas'],
    ['Massa salarial total', fmtMoney(mt), 'soma das atividades filtradas'],
    ['Massa elegível OBJ4', fmtMoney(mo), fmtPct(mo/mt) + ' da massa total'],
    ['Commodities agrícolas', fmtMoney(ma), fmtPct(ma/mo) + ' da massa OBJ4'],
    ['Commodities minerais', fmtMoney(mm), fmtPct(mm/mo) + ' da massa OBJ4'],
    ['Commodities totais', fmtMoney(mc), 'agrícolas + minerais'],
    ['Razão de dependência', fmtRatio(ratio), 'massa commodity / massa OBJ4'],
    ['Média de referência', fmtRatio(ref), $('referenceMode').selectedOptions[0].textContent],
    ['Acima/igual à média', fmtInt(above), 'territórios'],
    ['Abaixo da média', fmtInt(below), 'territórios'],
    ['Participação OBJ4', fmtPct(mo/mt), 'massa elegível / total'],
    ['Commodities na OBJ4', fmtPct(mc/mo), 'massa commodity / OBJ4'],
  ];
  $('cards').innerHTML = cards.map(c => `<div class="card"><small>${c[0]}</small><strong>${c[1]}</strong><em>${c[2]}</em></div>`).join('');
}
function renderOverviewCharts(rows) {
  const label = (r) => territoryLabel(r);
  const topRatio = rows.filter(r => Number.isFinite(r.razao_dependencia_com)).sort((a,b)=>b.razao_dependencia_com-a.razao_dependencia_com).slice(0,15).reverse();
  Plotly.newPlot('chartTopRatio', [{ type:'bar', orientation:'h', x: topRatio.map(r=>r.razao_dependencia_com), y: topRatio.map(label), hovertemplate:'Razão: %{x:.3f}<extra></extra>' }], plotLayout('Razão de dependência'), plotConfig());

  const topObj = rows.filter(r => Number.isFinite(r.massa_obj4)).sort((a,b)=>b.massa_obj4-a.massa_obj4).slice(0,15).reverse();
  Plotly.newPlot('chartTopObj4', [{ type:'bar', orientation:'h', x: topObj.map(r=>r.massa_obj4), y: topObj.map(label), hovertemplate:'Massa OBJ4: R$ %{x:,.0f}<extra></extra>' }], plotLayout('Massa elegível'), plotConfig());

  const scatter = rows.filter(r => Number.isFinite(r.pib_pc_2021) && Number.isFinite(r.razao_dependencia_com));
  Plotly.newPlot('chartScatter', [{
    type:'scatter', mode:'markers',
    x: scatter.map(r=>r.pib_pc_2021), y: scatter.map(r=>r.razao_dependencia_com), text: scatter.map(label),
    marker: { size: scatter.map(r => Math.max(6, Math.min(38, Math.sqrt((r.massa_obj4 || 0)/1e6)))) },
    hovertemplate:'%{text}<br>PIB pc: %{x:,.0f}<br>Razão: %{y:.3f}<extra></extra>'
  }], plotLayout('PIB per capita × razão'), plotConfig());

  const mt = sum(rows,'massa_total'), mo = sum(rows,'massa_obj4'), ma = sum(rows,'massa_com_agr'), mm = sum(rows,'massa_com_min');
  const otherObj = Math.max(0, mo - ma - mm), nonObj = Math.max(0, mt - mo);
  Plotly.newPlot('chartComposition', [{ type:'pie', labels:['OBJ4 não commodity','Commodity agrícola','Commodity mineral','Não elegível'], values:[otherObj, ma, mm, nonObj], hole:.45 }], plotLayout('Composição'), plotConfig());
}

function selectedGroupConfig() {
  const a = $('groupVarA').value;
  const b = $('groupVarB').value;
  return { a, b: b === a ? 'none' : b, dimA: GROUP_DIMS[a], dimB: GROUP_DIMS[b] };
}
function renderGroupCharts(rows) {
  const cfg = selectedGroupConfig();
  if (!cfg.dimA) return;
  const method = $('meanMethod').value;
  if (cfg.b === 'none' || !cfg.dimB) {
    const groups = makeGroups(rows, [cfg.dimA]);
    const x = groups.map(g => g.label);
    const y = groups.map(g => calcReference(g.rows, method));
    Plotly.newPlot('chartGroupMatrix', [{ type:'bar', x, y, hovertemplate:'Grupo: %{x}<br>Razão média: %{y:.3f}<extra></extra>' }], plotLayout(`Razão média por quartil de ${cfg.dimA.label}`), plotConfig());
  } else {
    const xs = [1,2,3,4].map(q => `${cfg.dimA.prefix}${q}`);
    const ys = [1,2,3,4].map(q => `${cfg.dimB.prefix}${q}`);
    const z = ys.map(y => xs.map(x => {
      const subset = rows.filter(r => quartileLabel(cfg.dimA, r) === x && quartileLabel(cfg.dimB, r) === y);
      return calcReference(subset, method);
    }));
    Plotly.newPlot('chartGroupMatrix', [{ type:'heatmap', x: xs, y: ys, z, hoverongaps:false, colorscale:'Blues', hovertemplate:'%{x} × %{y}<br>Razão média: %{z:.3f}<extra></extra>' }], plotLayout(`${cfg.dimA.label} × ${cfg.dimB.label}`), plotConfig());
  }
}
function makeGroups(rows, dims) {
  const map = new Map();
  rows.forEach(r => {
    const labels = dims.map(d => quartileLabel(d, r));
    if (labels.some(v => !v)) return; // evita grupos 'Quartil NA' quando PIB/população não existe
    const key = labels.join('_');
    if (!map.has(key)) map.set(key, { label:key, rows:[] });
    map.get(key).rows.push(r);
  });
  return Array.from(map.values()).sort((a,b)=>a.label.localeCompare(b.label, 'pt-BR', {numeric:true}));
}
function renderGroupTable(rows) {
  const cfg = selectedGroupConfig();
  const dims = cfg.b === 'none' || !cfg.dimB ? [cfg.dimA] : [cfg.dimA, cfg.dimB];
  const groups = makeGroups(rows, dims);
  const out = groups.map(g => groupStats(g.label, g.rows));
  state.groupRows = out;
  renderTable('groupsTable', out, [['grupo','Grupo'],['n','N'],['razao','Razão média'],['pib_2021_mil','PIB 2021'],['pop_2021','Pop. 2021'],['pop_2022','Pop. 2022'],['massa_total','Massa total'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity']], { limit: 500 });
}
function groupStats(label, rows) {
  return { grupo: label, n: rows.length, razao: calcReference(rows, $('meanMethod').value), pib_2021_mil: sum(rows,'pib_2021_mil'), pop_2021: sum(rows,'pop_2021'), pop_2022: sum(rows,'pop_2022'), massa_total: sum(rows,'massa_total'), massa_obj4: sum(rows,'massa_obj4'), massa_com: sum(rows,'massa_com') };
}

function renderCnaeCharts() {
  const rows = state.cnae.map(r => ({...r, ...(state.cnaeTotals.get(r.cnae_subclasse_key)||{})}));
  const secMap = new Map();
  rows.forEach(r => secMap.set(r.secao, (secMap.get(r.secao)||0) + (r.massa_total||0)));
  const secRows = Array.from(secMap.entries()).map(([secao, massa])=>({secao, massa})).sort((a,b)=>b.massa-a.massa);
  Plotly.newPlot('chartCnaeSecao', [{ type:'bar', x: secRows.map(r=>r.secao), y: secRows.map(r=>r.massa), hovertemplate:'Seção %{x}<br>R$ %{y:,.0f}<extra></extra>' }], plotLayout('Massa por seção'), plotConfig());

  const scat = rows.filter(r => Number.isFinite(r.vinculos) && Number.isFinite(r.salario_relativo)).slice(0,3000);
  Plotly.newPlot('chartCnaeScatter', [{
    type:'scatter', mode:'markers', x: scat.map(r=>r.vinculos), y: scat.map(r=>r.salario_relativo),
    text: scat.map(r=>`${r.cnae_subclasse_key} · ${r.descricao || ''}`),
    marker: { size: scat.map(r=>Math.max(5, Math.min(32, Math.sqrt((r.massa_salarial_rais_2024||0)/1e6)))) },
    hovertemplate:'%{text}<br>Vínculos: %{x:,.0f}<br>Salário relativo: %{y:.2f}<extra></extra>'
  }], plotLayout('Salário relativo × vínculos'), plotConfig());

  const rank = rows.sort((a,b)=>(b.massa_total||0)-(a.massa_total||0)).slice(0,200);
  renderTable('cnaeRankingTable', rank, [['cnae_subclasse_key','CNAE'], ['descricao','Descrição'], ['secao','Seção'], ['classificacao','RAIS 2024 Brasil'], ['categoria_ajustada','Categoria'], ['massa_total','Massa no painel'], ['salario_relativo','Salário rel.']], { limit: 200 });
}

function getVisibleActivityRows() {
  const q = $('cnaeSearch').value.trim().toLowerCase();
  let rows = state.cnae.filter(r => !q || `${r.cnae_subclasse_key} ${r.descricao} ${r.secao} ${r.divisao} ${r.classificacao}`.toLowerCase().includes(q));
  const {key, dir} = state.activitySort;
  rows.sort((a,b) => compareValues(a[key], b[key], dir));
  return rows;
}
function compareValues(a,b,dir='asc') {
  const na = num(a), nb = num(b);
  let res;
  if (Number.isFinite(na) && Number.isFinite(nb)) res = na - nb;
  else res = String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', {numeric:true, sensitivity:'base'});
  return dir === 'asc' ? res : -res;
}
function renderActivityEditTable() {
  const rows = getVisibleActivityRows();
  const headers = [
    ['cnae_subclasse_key','CNAE'], ['descricao','Descrição'], ['secao','Seção'], ['divisao','Divisão'],
    ['classificacao','RAIS 2024 Brasil'], ['q_salario','Q sal.'], ['q_vinculos','Q vínc.'], ['rank_salario','Rank sal.'],
    ['rank_vinculos','Rank vínc.'], ['categoria_original','Original'], ['categoria_ajustada','Categoria ajustada']
  ];
  const headerHtml = headers.map(([key,label]) => {
    const mark = state.activitySort.key === key ? (state.activitySort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="sortable resizable" data-sort="${key}" title="Ordenar por ${esc(label)}">${esc(label)}${mark}</th>`;
  }).join('');

  const html = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rows.map(r => `
    <tr data-cnae="${r.cnae_subclasse_key}">
      <td>${esc(r.cnae_subclasse_key)}</td><td>${esc(r.descricao || '')}</td><td>${esc(r.secao || '')}</td><td class="num">${fmt(r.divisao)}</td>
      <td>${esc(r.classificacao || '')}</td><td class="num">${fmt(r.q_salario)}</td><td class="num">${fmt(r.q_vinculos)}</td>
      <td class="num">${fmt(r.rank_salario)}</td><td class="num">${fmt(r.rank_vinculos)}</td><td>${categoryBadge(r.categoria_original)}</td><td>${categorySelect(r)}</td>
    </tr>`).join('')}</tbody></table>
    <p class="muted">Exibindo ${fmtInt(rows.length)} de ${fmtInt(state.cnae.length)} CNAEs. Clique nos cabeçalhos para ordenar. Arraste a borda direita dos cabeçalhos para alterar a largura das colunas.</p>`;
  $('activityEditTable').innerHTML = html;

  $('activityEditTable').querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', (ev) => {
      if (ev.offsetX > th.clientWidth - 10) return;
      const key = th.dataset.sort;
      if (state.activitySort.key === key) state.activitySort.dir = state.activitySort.dir === 'asc' ? 'desc' : 'asc';
      else state.activitySort = {key, dir:'asc'};
      renderActivityEditTable();
    });
  });
  $('activityEditTable').querySelectorAll('select[data-field="categoria_ajustada"]').forEach(sel => {
    sel.addEventListener('change', (ev) => {
      const tr = ev.target.closest('tr');
      const c = state.cnaeMap.get(tr.dataset.cnae);
      if (c) setFlagsFromCategory(c, ev.target.value);
    });
  });
}
function categorySelect(r) { const opts = [['OBJ4','OBJ4'], ['AGR','Agr.'], ['MIN','Min.'], ['EXCLUIR','Excluir OBJ4']]; return `<select data-field="categoria_ajustada">${opts.map(([v,l]) => `<option value="${v}" ${r.categoria_ajustada===v?'selected':''}>${l}</option>`).join('')}</select>`; }
function categoryBadge(cat) { const cls = cat === 'OBJ4' ? 'up' : (cat === 'AGR' || cat === 'MIN' ? 'warn' : 'na'); const label = cat === 'AGR' ? 'Agr.' : (cat === 'MIN' ? 'Min.' : (cat === 'OBJ4' ? 'OBJ4' : 'Excluir')); return `<span class="badge ${cls}">${label}</span>`; }
function restoreActivityFlags() { state.cnae.forEach(r => setFlagsFromCategory(r, r.categoria_original || 'EXCLUIR')); recomputeMetrics(); updateAll(); setStatus('Classificações originais restauradas.'); }
function excludeByClassificacao() { const cls = new Set(getMulti('bulkClassificacao')); if (!cls.size) return alert('Selecione uma ou mais classificações da RAIS 2024 Brasil.'); state.cnae.forEach(r => { if (cls.has(String(r.classificacao))) setFlagsFromCategory(r, 'EXCLUIR'); }); renderActivityEditTable(); }
function bulkVisibleCategory(value) { getVisibleActivityRows().forEach(r => setFlagsFromCategory(r, value)); renderActivityEditTable(); }
function downloadActivityCsv() { exportRows(state.cnae.map(r => ({ cnae_subclasse_key: r.cnae_subclasse_key, categoria_original: r.categoria_original, categoria_ajustada: r.categoria_ajustada, e_obj4_ajustado: r.e_obj4_ajustado, com_agr_ajustado: r.com_agr_ajustado, com_min_ajustado: r.com_min_ajustado, excluir_obj4: r.excluir_obj4 })), 'classificacao_cnae_ajustada.csv'); }
function uploadActivityCsv(ev) {
  const file = ev.target.files[0]; if (!file) return;
  Papa.parse(file, {header:true, dynamicTyping:false, skipEmptyLines:true, complete: (res) => {
    res.data.forEach(r => { const c = state.cnaeMap.get(cleanDigits(r.cnae_subclasse_key, 7)); if (!c) return; if (r.categoria_ajustada) setFlagsFromCategory(c, r.categoria_ajustada); });
    renderActivityEditTable(); recomputeMetrics(); updateAll();
  }});
}

function renderRanking() { renderTable('rankingTable', getRankingRows(), [['nome','Território'], ['uf','UF'], ['tipologia_pndr','Tipologia'], ['razao_dependencia_com','Razão'], ['referencia_comparacao','Referência'], ['distancia_media','Distância'], ['massa_obj4','Massa OBJ4'], ['massa_com','Massa commodity'], ['potencial_diversificacao','Potencial']], { limit: 250 }); }
function getRankingRows() { const metric = $('rankingMetric').value; return [...state.activeRows].map(r => ({...r, nome: territoryLabel(r)})).sort((a,b)=>(num(b[metric])-num(a[metric]))).slice(0,500); }

function renderIndicatorSummary(rows) {
  const groups = new Map();
  rows.forEach(r => {
    const g = r.indicador_obj4 || 'Sem classificação';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });
  const out = Array.from(groups.entries()).map(([grupo, arr]) => ({ grupo, n: arr.length, pib_2021_mil: sum(arr,'pib_2021_mil'), pop_2021: sum(arr,'pop_2021'), pop_2022: sum(arr,'pop_2022'), massa_total: sum(arr,'massa_total'), massa_obj4: sum(arr,'massa_obj4'), massa_com: sum(arr,'massa_com'), razao: calcReference(arr, $('meanMethod').value) }));
  out.sort((a,b)=>String(a.grupo).localeCompare(String(b.grupo), 'pt-BR', {numeric:true}));
  Plotly.newPlot('chartIndicatorSummary', [{ type:'bar', x: out.map(r=>r.grupo), y: out.map(r=>r.massa_obj4), hovertemplate:'%{x}<br>Massa OBJ4: R$ %{y:,.0f}<extra></extra>' }], plotLayout('Massa OBJ4 por Indicador OBJ4'), plotConfig());
  renderTable('indicatorSummaryTable', out, [['grupo','Indicador OBJ4'],['n','N'],['pib_2021_mil','PIB 2021'],['pop_2021','Pop. 2021'],['pop_2022','Pop. 2022'],['massa_total','Massa total'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity'],['razao','Razão']], { limit: 50 });
}
function renderAnalyticTable() { renderTable('analyticTable', currentAnalyticRows(), currentAnalyticColumns(), { limit: 800, search: $('tableSearch').value }); }
function currentAnalyticRows() {
  const ds = $('tableDataset').value;
  if (ds === 'cnae') return state.cnae.map(r => ({...r, ...(state.cnaeTotals.get(r.cnae_subclasse_key)||{})}));
  if (ds === 'groups') return state.groupRows || [];
  return state.activeRows.map(r => ({...r, nome: territoryLabel(r)}));
}
function currentAnalyticColumns() {
  const ds = $('tableDataset').value;
  if (ds === 'cnae') return [['cnae_subclasse_key','CNAE'],['descricao','Descrição'],['secao','Seção'],['divisao','Divisão'],['classificacao','RAIS 2024 Brasil'],['categoria_ajustada','Categoria'],['massa_total','Massa'],['salario_relativo','Salário rel.'],['vinculos','Vínculos']];
  if (ds === 'groups') return [['grupo','Grupo'],['n','N'],['razao','Razão'],['pib_2021_mil','PIB 2021'],['pop_2021','Pop. 2021'],['pop_2022','Pop. 2022'],['massa_total','Massa total'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity']];
  return [['nome','Território'],['uf','UF'],['regiao','Região'],['tipologia_pndr','Tipologia'],['pib_2021_mil','PIB 2021 mil'],['pib_pc_2021','PIB pc'],['pop_2021','Pop 2021'],['pop_2022','Pop 2022'],['massa_total','Massa total'],['massa_obj4','Massa OBJ4'],['massa_com','Massa commodity'],['razao_dependencia_com','Razão'],['referencia_comparacao','Referência'],['distancia_media','Distância'],['indicador_obj4','Indicador OBJ4']];
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
  if (key.includes('indicador_obj4')) return `<td><span class="badge ${indicatorClass(v)}">${esc(v ?? '')}</span></td>`;
  if (key.includes('categoria')) return `<td>${categoryBadge(String(v || 'EXCLUIR'))}</td>`;
  if (typeof v === 'number' || Number.isFinite(num(v))) {
    const n = num(v);
    const val = key.includes('massa') || key.includes('pib') ? fmtMoney(n) : (key.includes('razao') || key.includes('distancia') || key.includes('referencia') ? fmtRatio(n) : fmt(n));
    return `<td class="num">${val}</td>`;
  }
  return `<td>${esc(v ?? '')}</td>`;
}
function indicatorClass(v) { const s = String(v || ''); if (s.includes('Acima')) return 'up'; if (s.includes('Abaixo')) return 'down'; return 'na'; }

async function initMaps() {
  if (!window.L) return;
  state.map = L.map('map').setView([-14.2, -51.9], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '&copy; OpenStreetMap · Malhas: IBGE API de Malhas Geográficas' }).addTo(state.map);
  const msgs = [];
  try { state.geoMunicipios = await loadMunicipalMesh(); msgs.push('Malha municipal carregada.'); } catch (e) { console.error(e); msgs.push('Malha municipal indisponível. Use maps/municipios.geojson, maps/municipios_ibge_topo.json ou conexão com a API do IBGE.'); }
  try { state.geoUfs = await loadUfMesh(); msgs.push('Contorno de UFs carregado.'); } catch(e) { console.warn('Contorno de UFs indisponível:', e); }
  $('mapWarning').textContent = msgs.join(' ');
  updateMap();
}
async function loadMunicipalMesh() {
  try { return normalizeMunicipalGeojson(await fetchJson(MAP_FILES.municipiosGeojson)); } catch (e) {}
  try { return normalizeMunicipalGeojson(topoToGeojson(await fetchJson(MAP_FILES.municipiosTopojson), ['BR_Municipios_2022','BRMU','municipios','municipio'])); } catch (e) {}
  return normalizeMunicipalGeojson(topoToGeojson(await fetchJson(REMOTE_MAPS.municipiosTopojson), ['BR_Municipios_2022','BRMU','municipios','municipio']));
}
async function loadUfMesh() {
  try { return await fetchJson(MAP_FILES.ufsGeojson); } catch (e) {}
  try { return topoToGeojson(await fetchJson(MAP_FILES.ufsTopojson), ['BR_UF_2022','BRUF','ufs','UF']); } catch (e) {}
  return topoToGeojson(await fetchJson(REMOTE_MAPS.ufsTopojson), ['BR_UF_2022','BRUF','ufs','UF']);
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
    const raw = p.codarea || p.CD_MUN || p.cd_mun || p.codigo_municipio || p.CD_GEOCMU || p.id || p.code_muni || p.CD_MUN_7 || '';
    const s = cleanDigits(raw, null);
    if (s) { p.cod_mun7 = s.length >= 7 ? s.slice(0, 7) : s; p.cod_mun6 = s.length >= 7 ? s.slice(0, 6) : s.padStart(6, '0'); }
    f.properties = p;
  });
  return geo;
}
function updateMap() {
  if (!state.map || !state.geoMunicipios) return;
  const metric = $('mapMetric').value;
  const byKey = new Map();
  state.activeRows.forEach(r => { const key = state.lastLevel === 'municipio' ? r.cod_mun6 : r.id_tipologia; byKey.set(String(key), r); });
  const vals = state.activeRows.map(r => num(r.razao_dependencia_com)).filter(Number.isFinite);
  const deciles = buildDecileScale(vals);

  if (state.geoLayer) state.geoLayer.remove();
  state.geoLayer = L.geoJSON(state.geoMunicipios, {
    style: (feature) => {
      const id = featureMunId(feature);
      const row = state.lastLevel === 'municipio' ? byKey.get(id) : byKey.get(cleanTipologia((state.munMeta.get(id) || {}).id_tipologia));
      return { color:'#ffffff', weight:.35, fillColor: mapColor(row, metric, deciles), fillOpacity: row ? .78 : .05 };
    },
    onEachFeature: (feature, layer) => {
      const id = featureMunId(feature);
      const row = state.lastLevel === 'municipio' ? byKey.get(id) : byKey.get(cleanTipologia((state.munMeta.get(id) || {}).id_tipologia));
      layer.bindTooltip(row ? tooltipHtml(row) : 'Sem dados', { sticky:true });
      layer.on('mouseover', () => layer.setStyle({weight:1.2, color:'#102a43'}));
      layer.on('mouseout', () => state.geoLayer.resetStyle(layer));
    }
  }).addTo(state.map);
  if (state.geoUfs && !state.ufLayer) state.ufLayer = L.geoJSON(state.geoUfs, { style:{ fillOpacity:0, color:'#102a43', weight:1.4, opacity:.9 } }).addTo(state.map);
  updateLegend(metric, deciles);
}
function featureMunId(feature) { const p = feature.properties || {}; const v = p.cod_mun6 || p.cod_mun7 || p.codarea || p.CD_MUN || p.cd_mun || p.codigo_municipio || p.CD_GEOCMU || p.id || p.code_muni || ''; const s = cleanDigits(v, null); return s.length >= 7 ? s.slice(0,6) : s.padStart(6,'0'); }
function mapColor(row, metric, deciles) {
  if (!row) return '#e9eef6';
  if (metric === 'indicador_obj4') return indicatorColor(row.indicador_obj4);
  const v = num(row.razao_dependencia_com);
  if (!Number.isFinite(v)) return '#d0d5dd';
  const bin = decileBin(v, deciles.breaks);
  return decileColor(bin);
}
function buildDecileScale(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  const breaks = [];
  for (let p = 0; p <= 100; p += 10) breaks.push(percentileValue(sorted, p/100));
  return { breaks, labels: decileLabels(breaks) };
}
function percentileValue(sorted, p) {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
function decileBin(value, breaks) {
  if (!breaks || breaks.length < 2 || !Number.isFinite(value)) return -1;
  for (let i = 0; i < 10; i++) {
    const lo = breaks[i], hi = breaks[i+1];
    if (i === 9 && value <= hi) return i;
    if (value >= lo && value <= hi) return i;
  }
  return value > breaks[10] ? 9 : 0;
}
function decileColor(bin) {
  if (bin < 0) return '#d0d5dd';
  const t = bin / 9;
  return interpolate('#e0f2fe', '#083c5f', t);
}
function decileLabels(breaks) {
  if (!breaks || breaks.length < 11 || breaks.some(v => !Number.isFinite(v))) return [];
  const labels = [];
  for (let i = 0; i < 10; i++) labels.push({ p0:i*10, p1:(i+1)*10, lo:breaks[i], hi:breaks[i+1], color:decileColor(i) });
  return labels;
}
function indicatorColor(v) {
  const s = String(v || '');
  if (s.includes('Sem')) return '#98a2b3';
  if (s.includes('Abaixo')) {
    if (s.includes('0–25')) return '#d1fadf'; if (s.includes('25–50')) return '#a6f4c5'; if (s.includes('50–75')) return '#32d583'; if (s.includes('75–100')) return '#039855'; return '#1b7f63';
  }
  if (s.includes('Acima')) {
    if (s.includes('0–25')) return '#fee4e2'; if (s.includes('25–50')) return '#fecdca'; if (s.includes('50–75')) return '#f97066'; if (s.includes('75–100')) return '#b42318'; return '#b42318';
  }
  return '#98a2b3';
}
function updateLegend(metric, deciles) {
  if (!state.map || !window.L) return;
  if (state.legend) state.legend.remove();
  state.legend = L.control({position: 'bottomright'});
  state.legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    if (metric === 'indicador_obj4') {
      div.innerHTML = [
        '<strong>Indicador OBJ4</strong>',
        '<span class="sw" style="background:#d1fadf"></span>Abaixo P0–P25',
        '<span class="sw" style="background:#a6f4c5"></span>Abaixo P25–P50',
        '<span class="sw" style="background:#32d583"></span>Abaixo P50–P75',
        '<span class="sw" style="background:#039855"></span>Abaixo P75–P100',
        '<span class="sw" style="background:#1b7f63"></span>Abaixo da média',
        '<span class="sw" style="background:#fee4e2"></span>Acima P0–P25',
        '<span class="sw" style="background:#fecdca"></span>Acima P25–P50',
        '<span class="sw" style="background:#f97066"></span>Acima P50–P75',
        '<span class="sw" style="background:#b42318"></span>Acima P75–P100',
        '<span class="sw" style="background:#b42318"></span>Acima/igual à média',
        '<span class="sw" style="background:#98a2b3"></span>Sem classificação'
      ].join('<br>');
    } else {
      const rows = (deciles.labels || []).map(d => `<span class="sw" style="background:${d.color}"></span>P${d.p0}–P${d.p1}: ${fmtRatio(d.lo)}–${fmtRatio(d.hi)}`);
      div.innerHTML = ['<strong>Razão de dependência</strong>', '<small>Escala por percentis de 10 em 10</small>', ...rows].join('<br>');
    }
    return div;
  };
  state.legend.addTo(state.map);
}
function tooltipHtml(r) {
  return `<strong>${esc(territoryLabel(r))}</strong><br>UF: ${esc(r.uf || '')}<br>Tipologia: ${esc(r.tipologia_pndr || '')}<br>PIB pc: ${fmtMoney(r.pib_pc_2021)}<br>Pop. 2021: ${fmtInt(r.pop_2021)}<br>Pop. 2022: ${fmtInt(r.pop_2022)}<br>Massa OBJ4: ${fmtMoney(r.massa_obj4)}<br>Massa com.: ${fmtMoney(r.massa_com)}<br>Razão: ${fmtRatio(r.razao_dependencia_com)}<br>Ref.: ${fmtRatio(r.referencia_comparacao)}<br>Indicador OBJ4: ${esc(r.indicador_obj4 || '')}`;
}

function resetFilters() {
  document.querySelectorAll('select[multiple]').forEach(s => Array.from(s.options).forEach(o => o.selected = false));
  ['municipioSearch','tableSearch','cnaeSearch'].forEach(id => $(id).value = '');
  $('activityMode').value = 'all';
  $('referenceMode').value = 'brasil';
  $('meanMethod').value = 'ponderada_massa_obj4';
  $('indicatorMode').value = 'media';
  $('mapMetric').value = 'razao_dependencia_com';
  $('groupVarA').value = 'pib';
  $('groupVarB').value = 'pop2021';
  recomputeMetrics();
  updateAll();
}

function territoryLabel(r) { return state.lastLevel === 'municipio' || r.nivel_territorial === 'municipio' ? `${r.municipio_nome || r.cod_mun6}${r.uf ? ` (${r.uf})` : ''}` : `${r.id_tipologia} · ${r.tipologia_pndr || ''}`; }
function sum(rows, key) { return rows.reduce((a,r)=>a+(Number.isFinite(num(r[key]))?num(r[key]):0),0); }
function fmtMoney(v) { if (!Number.isFinite(num(v))) return '—'; v = num(v); const abs = Math.abs(v); if (abs >= 1e9) return 'R$ ' + (v/1e9).toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' bi'; if (abs >= 1e6) return 'R$ ' + (v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' mi'; return 'R$ ' + v.toLocaleString('pt-BR',{maximumFractionDigits:0}); }
function fmtPct(v) { return Number.isFinite(num(v)) ? (100*num(v)).toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%' : '—'; }
function fmtRatio(v) { return Number.isFinite(num(v)) ? num(v).toLocaleString('pt-BR',{maximumFractionDigits:3}) : '—'; }
function fmt(v) { return Number.isFinite(num(v)) ? num(v).toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—'; }
function fmtInt(v) { return Number.isFinite(num(v)) ? Math.round(num(v)).toLocaleString('pt-BR') : '—'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function setStatus(msg) { $('loadStatus').textContent = msg; }
function plotLayout(title) { return { title: { text: title, font:{size:13} }, margin:{l:115,r:20,t:38,b:45}, paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:'Inter, sans-serif', size:12}, xaxis:{automargin:true}, yaxis:{automargin:true} }; }
function plotConfig() { return {displayModeBar:false, responsive:true}; }
function interpolate(a, b, t) { const ah = parseInt(a.replace('#',''),16), ar=ah>>16, ag=ah>>8&0xff, ab=ah&0xff; const bh = parseInt(b.replace('#',''),16), br=bh>>16, bg=bh>>8&0xff, bb=bh&0xff; const rr = Math.round(ar + t*(br-ar)), rg = Math.round(ag + t*(bg-ag)), rb = Math.round(ab + t*(bb-ab)); return '#' + ((1<<24) + (rr<<16) + (rg<<8) + rb).toString(16).slice(1); }
function exportRows(rows, filename) { if (!rows || !rows.length) return alert('Não há dados para exportar.'); const csv = Papa.unparse(rows); const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
