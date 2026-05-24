const MapController = (() => {
  let map, muniLayer, ufLayer, legend, mapRenderer;
  let cachedMuniGeo=null, cachedUfGeo=null;
  const seq = ['#eaf6fb','#d7eff9','#c3e4f3','#abd9ed','#88c7df','#64b3d2','#4fa4ca','#358bb5','#24779f','#176b93'];
  const neg = ['#fff1df','#fee2c5','#fbd0a2','#f9bd7c','#f59e0b','#ee8428','#dc6b19','#c85514','#b94018','#b91c1c'];
  const MAP_SOURCES = {
    municipios: [
      'data/geo/municipios_ibge_topo.json',
      'maps/municipios_ibge_topo.json',
      'https://raw.githubusercontent.com/giovanigianetti/PNDR_4/main/maps/municipios_ibge_topo.json',
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fjson&intrarregiao=municipio&qualidade=minima'
    ],
    ufs: [
      'data/geo/ufs_ibge_topo.json',
      'maps/ufs_ibge_topo.json',
      'https://raw.githubusercontent.com/giovanigianetti/PNDR_4/main/maps/ufs_ibge_topo.json',
      'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application%2Fjson&intrarregiao=UF&qualidade=minima'
    ]
  };
  function codeFromProps(props){
    const raw = props?.codarea || props?.CD_MUN || props?.CD_GEOCMU || props?.code_muni || props?.id || props?.geocodigo || props?.codigo_ibge || props?.CD_MUNICIP || props?.cod_mun || props?.codigo;
    if(raw===null || raw===undefined || raw==='') return '';
    const s = String(raw).replace(/\D/g,'');
    if(!s) return '';
    return s.length >= 7 ? s.slice(-7) : s;
  }
  function geoFromAny(obj){
    if(obj?.objects){
      const objectName = Object.keys(obj.objects)[0];
      return topojson.feature(obj, obj.objects[objectName]);
    }
    return obj;
  }
  async function fetchJSON(path){
    const res = await fetch(path, {cache:'force-cache'});
    if(!res.ok) throw new Error(`${res.status} ao carregar ${path}`);
    return res.json();
  }
  async function loadGeoJSON(kind){
    if(kind==='municipios' && cachedMuniGeo) return cachedMuniGeo;
    if(kind==='ufs' && cachedUfGeo) return cachedUfGeo;
    const errors=[];
    for(const src of MAP_SOURCES[kind]){
      try{
        const obj = await fetchJSON(src);
        const geo = geoFromAny(obj);
        if(!geo || !geo.features || !geo.features.length) throw new Error('malha sem feições');
        if(kind==='municipios') cachedMuniGeo=geo; else cachedUfGeo=geo;
        return geo;
      }catch(e){ errors.push(`${src}: ${e.message}`); }
    }
    throw new Error(`Falha ao carregar malha de ${kind}. ${errors.join(' | ')}`);
  }
  function init(){
    if(map) return;
    mapRenderer = L.canvas({padding:0.35, tolerance:8});
    map = L.map('map', {preferCanvas:true, zoomControl:true, attributionControl:false, renderer:mapRenderer, minZoom:3, maxZoom:9}).setView([-14.2,-51.9],4);
    L.control.attribution({prefix:false}).addAttribution('Malhas: PNDR_4/IBGE').addTo(map);
    legend = L.control({position:'bottomright'});
    legend.onAdd = () => { const div=L.DomUtil.create('div','legend'); div.innerHTML='Carregando legenda...'; return div; };
    legend.addTo(map);
  }
  function computeMapData(state){
    const ref=document.getElementById('f_mes').value; const n=Number(document.getElementById('f_janela').value||1); const {current,previous,previousComplete}=Transforms.getWindowMonths(state.months, ref, n);
    const filters=Transforms.getActiveFilters(state); const cur=Transforms.aggregateBy(state, Transforms.indices(state,filters,current), 'cod_mun');
    const prev=Transforms.aggregateBy(state, Transforms.indices(state,filters,previous), 'cod_mun');
    const metric=document.getElementById('mapIndicator').value; const data=new Map();
    for(const m of state.meta.municipios){
      const a=cur.get(m.cod_mun)||Utils.empty(); const b=prev.get(m.cod_mun)||Utils.empty(); let val=null;
      if(metric.startsWith('var_')){ val=previousComplete ? ((Transforms.derived(a, metric.replace('var_',''))||0) - (Transforms.derived(b, metric.replace('var_',''))||0)) : null; }
      else if(metric.startsWith('growth_')){ const base=Transforms.derived(b, metric.replace('growth_','')); val=(previousComplete && base) ? (((Transforms.derived(a, metric.replace('growth_',''))||0)-base)/base) : null; }
      else { val=Transforms.derived(a, metric); }
      const rec={value:val, current:a, previous:b, meta:m};
      data.set(String(m.cod_mun), rec);
      data.set(String(m.cod_mun).slice(0,6), rec);
    }
    return {data, metric, previousComplete};
  }
  function cleanValues(values){ return values.filter(x=>x!==null && x!==undefined && Number.isFinite(x)).sort((a,b)=>a-b); }
  function percentileBreaks(values, steps=10){
    const v=cleanValues(values); if(!v.length) return [];
    function q(p){ const pos=(v.length-1)*p, lo=Math.floor(pos), hi=Math.ceil(pos); return lo===hi?v[lo]:v[lo]+(v[hi]-v[lo])*(pos-lo); }
    const out=[];
    for(let i=1;i<steps;i++){
      const val=q(i/steps);
      if(!out.length || Math.abs(val-out[out.length-1])>1e-12) out.push(val);
    }
    return out;
  }
  function binIndex(value, breaks){
    let idx=0;
    while(idx<breaks.length && value>breaks[idx]) idx++;
    return idx;
  }
  function paletteColor(palette, idx, classes){
    if(classes<=1) return palette[Math.floor(palette.length/2)];
    const p=Math.max(0, Math.min(palette.length-1, Math.round(idx*(palette.length-1)/(classes-1))));
    return palette[p];
  }
  function percentileLabel(idx, classes){
    const lo=Math.round(idx*100/classes), hi=Math.round((idx+1)*100/classes);
    return `P${lo}–P${hi}`;
  }
  function classify(metric, data){
    const vals=[]; data.forEach(d=>{ if(d.meta.elegivel_amazonia_azul==='Sim' && Number.isFinite(d.value)) vals.push(d.value); });
    const hasPos=vals.some(v=>v>0), hasNeg=vals.some(v=>v<0);
    const signed = metric.startsWith('var_') || metric.startsWith('growth_') || (hasPos && hasNeg);
    if(!signed){ const breaks=percentileBreaks(vals); return {signed:false, breaks, classes:breaks.length+1}; }
    const pos=vals.filter(v=>v>0), negAbs=vals.filter(v=>v<0).map(v=>Math.abs(v));
    const posBreaks=percentileBreaks(pos), negBreaks=percentileBreaks(negAbs);
    return {signed:true, posBreaks, negBreaks, posClasses:posBreaks.length+1, negClasses:negBreaks.length+1};
  }
  function colorFor(d, cls){
    if(!d) return '#eef2f4';
    if(d.meta.elegivel_amazonia_azul!=='Sim') return '#f1f3f4';
    const v=d.value;
    if(!Number.isFinite(v)) return '#e5e7eb';
    if(!cls.signed){ const idx=binIndex(v, cls.breaks); return paletteColor(seq, idx, cls.classes); }
    if(v===0) return '#cbd5e1';
    if(v>0){ const idx=binIndex(v, cls.posBreaks); return paletteColor(seq, idx, cls.posClasses); }
    const idx=binIndex(Math.abs(v), cls.negBreaks); return paletteColor(neg, idx, cls.negClasses);
  }
  function classLabel(d, cls){
    if(!d) return 'Sem dado'; if(d.meta.elegivel_amazonia_azul!=='Sim') return 'Não elegível';
    const v=d.value; if(!Number.isFinite(v)) return 'Sem dado';
    if(!cls.signed){ const idx=binIndex(v, cls.breaks); return percentileLabel(idx, cls.classes); }
    if(v===0) return 'Estável';
    if(v>0){ const idx=binIndex(v, cls.posBreaks); return `Crescimento ${percentileLabel(idx, cls.posClasses)}`; }
    const idx=binIndex(Math.abs(v), cls.negBreaks); return `Queda ${percentileLabel(idx, cls.negClasses)}`;
  }
  function legendRows(palette, classes, labelPrefix='', reverse=false){
    const idxs = Array.from({length:classes}, (_,i)=>i);
    if(reverse) idxs.reverse();
    return idxs.map(i=>`<i style="background:${paletteColor(palette,i,classes)}"></i>${labelPrefix}${percentileLabel(i,classes)}`).join('<br>');
  }
  function updateLegend(cls){
    const div=document.querySelector('.legend'); if(!div) return;
    if(!cls.signed){
      div.innerHTML = `<strong>Percentis</strong><br>${legendRows(seq, cls.classes)}<br><i style="background:#f1f3f4"></i>Não elegível<br><i style="background:#e5e7eb"></i>Sem dado`;
    } else {
      const negRows = cls.negClasses ? legendRows(neg, cls.negClasses, 'Queda ', true) : '';
      const posRows = cls.posClasses ? legendRows(seq, cls.posClasses, 'Crescimento ') : '';
      div.innerHTML = `<strong>Percentis separados</strong><br>${negRows}${negRows?'<br>':''}<i style="background:#cbd5e1"></i>Estável${posRows?'<br>'+posRows:''}<br><i style="background:#e5e7eb"></i>Sem dado`;
    }
  }
  function metricValueText(metric, v){
    if(metric.includes('share')||metric.includes('growth')) return Utils.formatPercent(v);
    if(metric.includes('valor')) return Utils.formatBRLFull(v);
    return Utils.formatNumber(v);
  }
  function featureStyle(data, cls, feature){
    const d=data.get(codeFromProps(feature.properties));
    return {color:'#9aa7b0',weight:.32,fillColor:colorFor(d,cls),fillOpacity:.86,opacity:1};
  }
  function bindTooltipFactory(data, metric, cls){
    return (feature, layer) => {
      const cod=codeFromProps(feature.properties), d=data.get(cod), m=d?.meta || {}; const a=d?.current || Utils.empty();
      const v=d?.value;
      layer.bindTooltip(`<strong>${m.nome_mun||feature.properties?.nome||feature.properties?.name||feature.properties?.NM_MUN||'Município'}</strong><br>UF: ${m.uf||''}<br>Macrorregião: ${m.macrorregiao_geografica||''}<br>Tipologia territorial: ${m.tipologia_territorial_amazonia_azul||'—'}<br>Elegível ao Programa: ${m.elegivel_amazonia_azul||'—'}<br>Valor contratado: ${Utils.formatBRLFull(a.valor)}<br>Beneficiários: ${Utils.formatNumber(a.beneficiarios)}<br>Contratos: ${Utils.formatNumber(a.contratos)}<br>Participação Amazônia Azul: ${Utils.formatPercent(Utils.pct(a.valor_azul,a.valor))}<br>Participação feminina: ${Utils.formatPercent(Utils.pct(a.valor_mulheres,a.valor))}<br>Indicador do mapa: ${metricValueText(metric,v)}<br>Classe: ${classLabel(d,cls)}`);
    };
  }
  async function render(state){
    init();
    const status=document.getElementById('mapStatus');
    status.textContent='Carregando malhas municipais simplificadas...';
    try{
      const mapData = computeMapData(state);
      const [muniGeo, ufGeo] = await Promise.all([loadGeoJSON('municipios'), loadGeoJSON('ufs')]);
      const {data, metric, previousComplete} = mapData; const cls=classify(metric, data); updateLegend(cls);
      if(muniLayer) muniLayer.remove(); if(ufLayer) ufLayer.remove();
      muniLayer = L.geoJSON(muniGeo, {
        renderer:mapRenderer,
        smoothFactor:1.8,
        style: feature => featureStyle(data, cls, feature),
        onEachFeature: bindTooltipFactory(data, metric, cls)
      }).addTo(map);
      ufLayer = L.geoJSON(ufGeo, {renderer:mapRenderer, smoothFactor:2.2, style:{color:'#1f2937',weight:1.25,fillOpacity:0,opacity:.95,interactive:false}}).addTo(map);
      invalidate();
      try{ map.fitBounds(muniLayer.getBounds(), {padding:[8,8], animate:false}); }catch(e){}
      status.textContent = previousComplete || !(metric.startsWith('var_')||metric.startsWith('growth_')) ? 'Mapa carregado com escala em percentis.' : 'Mapa carregado; variações dependem de janela anterior completa e podem aparecer como sem dado.';
    }catch(e){
      console.error(e);
      status.textContent = `Não foi possível carregar o mapa: ${e.message}`;
    }
  }
  function reset(){ if(map && muniLayer) map.fitBounds(muniLayer.getBounds(), {padding:[8,8], animate:false}); }
  function invalidate(){ if(map) setTimeout(()=>map.invalidateSize(), 80); }
  return {render, reset, invalidate};
})();
