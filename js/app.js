const App = (() => {
  const state = {
    cube:null, meta:null, bench:null, months:[], activeTab:'methodology', mapLoaded:false, mapRendering:false,
    filterDims:[
      'fundo_origem','macrorregiao_geografica','uf','cod_mun','tipologia_territorial_amazonia_azul','atividade_vinculada_amazonia_azul',
      'setor','programa','linha_financiamento','atividade','cnae','porte','finalidade','natureza_contratante','sexo_padronizado','instituicao',
      'faixa_valor_contratado','faixa_taxa_juros','faixa_contratos','faixa_beneficiarios'
    ],
    munLabel:new Map()
  };

  const labelDims = {
    setor:'Setor', programa:'Programa', linha_financiamento:'Linha de financiamento', atividade:'Atividade', cnae:'CNAE', porte:'Porte', finalidade:'Finalidade',
    uf:'UF', cod_mun:'Município', macrorregiao_geografica:'Macrorregião', tipologia_territorial_amazonia_azul:'Tipologia territorial Amazônia Azul',
    instituicao:'Instituição operadora', natureza_contratante:'Natureza do contratante'
  };
  const rankIndicators = {
    valor:'Valor contratado', beneficiarios:'Beneficiários', contratos:'Contratos',
    share_valor_azul:'Participação das atividades vinculadas no valor', share_beneficiarios_azul:'Participação das atividades vinculadas nos beneficiários', share_contratos_azul:'Participação das atividades vinculadas nos contratos',
    share_mulheres_valor:'Participação feminina no valor', share_mulheres_beneficiarios:'Participação feminina nos beneficiários', share_mulheres_contratos:'Participação feminina nos contratos',
    abs_growth_valor:'Crescimento absoluto do valor', abs_growth_beneficiarios:'Crescimento absoluto dos beneficiários', abs_growth_contratos:'Crescimento absoluto dos contratos',
    pct_growth_valor:'Crescimento percentual do valor', pct_growth_beneficiarios:'Crescimento percentual dos beneficiários', pct_growth_contratos:'Crescimento percentual dos contratos'
  };
  function option(label, value){ const o=document.createElement('option'); o.value=value; o.textContent=label; return o; }
  function fillSelect(id, values, opts={}){
    const el=document.getElementById(id); if(!el) return; el.innerHTML='';
    if(opts.all!==false) el.appendChild(option('Todas', '__all__'));
    values.forEach(v=>el.appendChild(option(opts.labeler?opts.labeler(v):v, v)));
    if(opts.defaultValue!==undefined) el.value=opts.defaultValue;
  }
  function cloneEmpty(){ return Utils.empty(); }
  function agg(filters, months){ return Transforms.aggregateIndices(state, Transforms.indices(state, filters, months)); }
  function windowInfo(){ return Transforms.getWindowMonths(state.months, document.getElementById('f_mes').value, Number(document.getElementById('f_janela').value||1)); }
  function currentFilters(extra={}, opts={}){ return {...Transforms.getActiveFilters(state, opts), ...extra}; }
  function idxFor(filters, months){ return Transforms.indices(state, filters, months); }
  function formatMetric(key, value){
    if(key.includes('share') || key.includes('pct_growth') || key.includes('growth_')) return Utils.formatPercent(value);
    if(key.includes('valor')) return Utils.formatBRLFull(value);
    return Utils.formatNumber(value);
  }
  function sum3(a,b,c){ return (a||0)+(b||0)+(c||0); }
  function aggWhere(filters, months, dim, desired, extra={}){
    if(filters[dim] && filters[dim] !== desired) return cloneEmpty();
    if(filters[dim] === desired) return agg({...filters, ...extra}, months);
    return agg({...filters, ...extra, [dim]:desired}, months);
  }
  function splitAzul(filters, months, extra={}){
    const base = {...filters, ...extra};
    if(filters.atividade_vinculada_amazonia_azul === 'Sim'){
      const azul=agg(base, months); return {azul, nao:cloneEmpty(), total:azul};
    }
    if(filters.atividade_vinculada_amazonia_azul === 'Não'){
      const nao=agg(base, months); return {azul:cloneEmpty(), nao, total:nao};
    }
    const azul = agg({...base, atividade_vinculada_amazonia_azul:'Sim'}, months);
    const nao = agg({...base, atividade_vinculada_amazonia_azul:'Não'}, months);
    const total = agg(base, months);
    return {azul, nao, total};
  }
  const overviewScopes = [
    {name:'Total geral', color:'#0b2f4a', extra:{}},
    {name:'Territórios elegíveis Amazônia Azul', color:'#176b93', extra:{elegivel_amazonia_azul:'Sim'}},
    {name:'Atividades Amazônia Azul nos elegíveis', color:'#16a6a3', extra:{elegivel_amazonia_azul:'Sim', atividade_vinculada_amazonia_azul:'Sim'}}
  ];
  function overviewBaseFilters(opts={}){
    const f = currentFilters({}, opts);
    delete f.atividade_vinculada_amazonia_azul;
    delete f.elegivel_amazonia_azul;
    return f;
  }
  function scopedFilters(base, scope, extra={}){ return {...base, ...extra, ...scope.extra}; }
  function scopedValue(base, scope, months, metric, extra={}){ return Transforms.derived(agg(scopedFilters(base, scope, extra), months), metric); }
  function rollingWindowGrowth(base, scope, refMonth, n, metric, extra={}){
    const win = Transforms.getWindowMonths(state.months, refMonth, n);
    if(!win.complete || !win.previousComplete) return null;
    const cur = scopedValue(base, scope, win.current, metric, extra);
    const prev = scopedValue(base, scope, win.previous, metric, extra);
    return prev ? (cur - prev) / prev : null;
  }
  function chartTick(mode){ return mode==='share' ? '.1%' : ',.1f'; }
  function chartHover(mode){ return mode==='share' ? '%{x}<br>%{fullData.name}: %{y:.1%}<extra></extra>' : '%{x}<br>%{fullData.name}: %{y:,.1f}<extra></extra>'; }
  function hasAny(a){ return (a.valor||0)!==0 || (a.beneficiarios||0)!==0 || (a.contratos||0)!==0; }
  function resizeSoon(){ setTimeout(()=>Charts.resizeAll(document.getElementById(state.activeTab) || document), 60); }

  function initFilters(){
    state.months = state.meta.months.filter(m=>m!=='Não informado').sort();
    fillSelect('f_mes', state.months, {all:false, labeler:Utils.formatMonth, defaultValue:state.months[state.months.length-1]});
    for(const dim of state.filterDims){
      let vals = (state.cube.dicts[dim]||[]).slice().filter(v=>v!==undefined && v!==null && String(v).trim()!=='');
      if(dim==='cod_mun') vals.sort((a,b)=>(state.munLabel.get(a)||a).localeCompare(state.munLabel.get(b)||b,'pt-BR'));
      else vals.sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
      fillSelect('f_'+dim, vals, {labeler: dim==='cod_mun' ? v => state.munLabel.get(v)||v : undefined});
    }
    fillSelect('f_atividade_vinculada_amazonia_azul', ['Sim','Não']);
    fillSelect('rankDimension', Object.keys(labelDims), {all:false, labeler:v=>labelDims[v], defaultValue:'setor'});
    fillSelect('rankIndicator', Object.keys(rankIndicators), {all:false, labeler:v=>rankIndicators[v], defaultValue:'valor'});
    buildBenchmarkOptions();
    document.querySelectorAll('select').forEach(s=>s.addEventListener('change', renderActive));
    document.getElementById('clearFilters').addEventListener('click', () => {
      for(const dim of state.filterDims){ const el=document.getElementById('f_'+dim); if(el) el.value='__all__'; }
      document.getElementById('f_janela').value='1';
      document.getElementById('f_mes').value=state.months[state.months.length-1];
      renderActive();
    });
    document.getElementById('resetMap').addEventListener('click', MapController.reset);
    window.addEventListener('resize', () => { resizeSoon(); if(state.activeTab==='maps') MapController.invalidate(); });
  }

  function renderCards(){
    const {current}=windowInfo(); const base=currentFilters();
    const eleg = agg({...base,elegivel_amazonia_azul:'Sim'}, current);
    const all = agg(base, current);
    const azulEleg = aggWhere({...base,elegivel_amazonia_azul:'Sim'}, current, 'atividade_vinculada_amazonia_azul', 'Sim');
    const fem = aggWhere({...base,elegivel_amazonia_azul:'Sim'}, current, 'sexo_padronizado', 'Mulheres');
    const cards = [
      Utils.makeCard('Valor contratado total nos municípios elegíveis', Utils.formatBRL(eleg.valor), 'Total da janela selecionada'),
      Utils.makeCard('Beneficiários totais nos municípios elegíveis', Utils.formatNumber(eleg.beneficiarios), 'Soma agregada da base pública'),
      Utils.makeCard('Contratos totais nos municípios elegíveis', Utils.formatNumber(eleg.contratos), 'Soma agregada da base pública'),
      Utils.makeCard('Valor contratado em atividades Amazônia Azul', Utils.formatBRL(azulEleg.valor), `${Utils.formatPercent(Utils.pct(azulEleg.valor,eleg.valor))} do total nos municípios elegíveis`),
      Utils.makeCard('Beneficiários em atividades Amazônia Azul', Utils.formatNumber(azulEleg.beneficiarios), `${Utils.formatPercent(Utils.pct(azulEleg.beneficiarios,eleg.beneficiarios))} do total nos municípios elegíveis`),
      Utils.makeCard('Contratos em atividades Amazônia Azul', Utils.formatNumber(azulEleg.contratos), `${Utils.formatPercent(Utils.pct(azulEleg.contratos,eleg.contratos))} do total nos municípios elegíveis`),
      Utils.makeCard('Participação feminina no valor', Utils.formatPercent(Utils.pct(fem.valor,eleg.valor)), 'Pessoas jurídicas e não informados permanecem no denominador'),
      Utils.makeCard('Participação feminina nos beneficiários', Utils.formatPercent(Utils.pct(fem.beneficiarios,eleg.beneficiarios)), 'Numerador: sexo padronizado como Mulheres'),
      Utils.makeCard('Participação feminina nos contratos', Utils.formatPercent(Utils.pct(fem.contratos,eleg.contratos)), 'Numerador: sexo padronizado como Mulheres')
    ];
    document.getElementById('mainCards').innerHTML = cards.join('');

    const azulAll = aggWhere(base, current, 'atividade_vinculada_amazonia_azul', 'Sim');
    document.getElementById('shareCards').innerHTML = [
      Utils.makeCard('Municípios elegíveis no valor total', Utils.formatPercent(Utils.pct(eleg.valor,all.valor)), `${Utils.formatBRL(eleg.valor)} de ${Utils.formatBRL(all.valor)}`),
      Utils.makeCard('Municípios elegíveis nos beneficiários', Utils.formatPercent(Utils.pct(eleg.beneficiarios,all.beneficiarios)), `${Utils.formatNumber(eleg.beneficiarios)} de ${Utils.formatNumber(all.beneficiarios)}`),
      Utils.makeCard('Municípios elegíveis nos contratos', Utils.formatPercent(Utils.pct(eleg.contratos,all.contratos)), `${Utils.formatNumber(eleg.contratos)} de ${Utils.formatNumber(all.contratos)}`),
      Utils.makeCard('Atividades Amazônia Azul no valor total', Utils.formatPercent(Utils.pct(azulAll.valor,all.valor)), `${Utils.formatBRL(azulAll.valor)} do total geral`),
      Utils.makeCard('Atividades Amazônia Azul nos beneficiários', Utils.formatPercent(Utils.pct(azulAll.beneficiarios,all.beneficiarios)), `${Utils.formatNumber(azulAll.beneficiarios)} do total geral`),
      Utils.makeCard('Atividades Amazônia Azul nos contratos', Utils.formatPercent(Utils.pct(azulAll.contratos,all.contratos)), `${Utils.formatNumber(azulAll.contratos)} do total geral`)
    ].join('');

    const mun=document.getElementById('f_cod_mun').value, uf=document.getElementById('f_uf').value, tip=document.getElementById('f_tipologia_territorial_amazonia_azul').value;
    const territory = mun!=='__all__' ? state.munLabel.get(mun) : uf!=='__all__' ? uf : tip!=='__all__' ? `Tipologia ${tip}` : 'seleção atual';
    document.getElementById('selectionNarrative').innerHTML = hasAny(all)
      ? `Na <strong>${territory}</strong>, para a janela encerrada em <strong>${Utils.formatMonth(document.getElementById('f_mes').value)}</strong>, os municípios elegíveis somaram <strong>${Utils.formatBRL(eleg.valor)}</strong>, <strong>${Utils.formatNumber(eleg.beneficiarios)}</strong> beneficiários e <strong>${Utils.formatNumber(eleg.contratos)}</strong> contratos. As atividades vinculadas à Amazônia Azul responderam por <strong>${Utils.formatPercent(Utils.pct(azulEleg.valor,eleg.valor))}</strong> do valor contratado nos municípios elegíveis. Os municípios elegíveis representaram <strong>${Utils.formatPercent(Utils.pct(eleg.valor,all.valor))}</strong> do valor total da base filtrada, enquanto as atividades Amazônia Azul representaram <strong>${Utils.formatPercent(Utils.pct(azulAll.valor,all.valor))}</strong> do total geral. A participação feminina no valor contratado dos municípios elegíveis foi de <strong>${Utils.formatPercent(Utils.pct(fem.valor,eleg.valor))}</strong>.`
      : 'Não há dados disponíveis para a seleção atual.';

    Charts.groupedBar('chart_shares', ['Valor','Beneficiários','Contratos'], [
      {name:'Municípios elegíveis / total geral', values:[Utils.pct(eleg.valor,all.valor),Utils.pct(eleg.beneficiarios,all.beneficiarios),Utils.pct(eleg.contratos,all.contratos)], color:'#176b93'},
      {name:'Atividades Amazônia Azul / total geral', values:[Utils.pct(azulAll.valor,all.valor),Utils.pct(azulAll.beneficiarios,all.beneficiarios),Utils.pct(azulAll.contratos,all.contratos)], color:'#16a6a3'}
    ], 'Participações no total geral da base filtrada', {tickformat:'.0%', maxLabel:18});
  }

  function renderTemporal(){
    const {current}=windowInfo();
    const n=Number(document.getElementById('f_janela').value||1);
    const base=overviewBaseFilters();
    const mode=document.getElementById('temporalMode').value;
    const x=current.map(Utils.formatMonth);
    for(const metric of ['valor','beneficiarios','contratos']){
      const traces = overviewScopes.map(scope => {
        const byMonth = new Map(Transforms.aggregateMonthly(state, scopedFilters(base, scope)).map(d => [d.month, d]));
        const y = mode==='share'
          ? current.map(month => rollingWindowGrowth(base, scope, month, n, metric))
          : current.map(month => Transforms.derived(byMonth.get(month)||Utils.empty(), metric));
        return {x, y, name:scope.name, line:{color:scope.color}, hovertemplate:chartHover(mode)};
      });
      Charts.line('chart_ts_'+metric, traces, `Evolução mensal — ${Utils.metricLabel(metric)}`, {tickformat:chartTick(mode), rangemode:mode==='share'?'normal':'tozero'});
    }
  }
  function renderTerritoryComparison(){
    const {current,previous,previousComplete}=windowInfo();
    const base=overviewBaseFilters({ignoreTerritory:true});
    const mode=document.getElementById('territoryMode').value;
    const territories=[['Brasil',{}],['Norte',{macrorregiao_geografica:'Norte'}],['Nordeste',{macrorregiao_geografica:'Nordeste'}],['Centro-Oeste',{macrorregiao_geografica:'Centro-Oeste'}],['Sudeste',{macrorregiao_geografica:'Sudeste'}],['Sul',{macrorregiao_geografica:'Sul'}]];
    const uf=document.getElementById('f_uf').value, mun=document.getElementById('f_cod_mun').value;
    if(uf!=='__all__') territories.push([uf,{uf}]);
    if(mun!=='__all__') territories.push([state.munLabel.get(mun)||mun,{cod_mun:mun}]);
    for(const metric of ['valor','beneficiarios','contratos']){
      const series = overviewScopes.map(scope => ({
        name:scope.name, color:scope.color,
        values:territories.map(([_,extra]) => {
          const f=scopedFilters(base, scope, extra);
          const cur=Transforms.derived(agg(f,current), metric);
          if(mode!=='share') return cur;
          if(!previousComplete) return null;
          const prev=Transforms.derived(agg(f,previous), metric);
          return prev ? (cur-prev)/prev : null;
        }),
        hovertemplate: mode==='share' ? '%{customdata}<br>%{fullData.name}: %{y:.1%}<extra></extra>' : '%{customdata}<br>%{fullData.name}: %{y:,.1f}<extra></extra>'
      }));
      Charts.groupedBar('chart_terr_'+metric, territories.map(t=>t[0]), series, `Comparação territorial — ${Utils.metricLabel(metric)}`, {tickformat:chartTick(mode), maxLabel:20});
    }
  }
  function renderOverview(){ renderCards(); renderTemporal(); renderTerritoryComparison(); resizeSoon(); }

  function rankValue(ind, cur, prev){
    if(ind.startsWith('abs_growth_')){ const m=ind.replace('abs_growth_',''); return (cur[m]||0)-(prev[m]||0); }
    if(ind.startsWith('pct_growth_')){ const m=ind.replace('pct_growth_',''); return prev[m] ? ((cur[m]||0)-(prev[m]||0))/prev[m] : null; }
    return Transforms.derived(cur, ind);
  }
  function renderRankings(){
    const dim=document.getElementById('rankDimension').value, ind=document.getElementById('rankIndicator').value; const {current,previous}=windowInfo(); const filters=currentFilters();
    const comps=Transforms.comparePeriodsBy(state, filters, dim, current, previous)
      .map(d=>({label: dim==='cod_mun'?(state.munLabel.get(d.key)||d.key):d.key, value:rankValue(ind,d.current,d.previous)}))
      .filter(d=>d.value!==null && d.value!==undefined && !Number.isNaN(d.value) && String(d.label).trim()!=='' && d.label!=='Não informado');
    const top=comps.slice().sort((a,b)=>b.value-a.value).slice(0,10).reverse();
    const tick = ind.includes('share')||ind.includes('pct_growth') ? '.0%' : '';
    Charts.hbar('chart_rank_top', top.map(d=>d.label), top.map(d=>d.value), `Top 10 — ${rankIndicators[ind]}`, {tickformat:tick,color:'#176b93', maxLabel:58, margin:{l:240,r:30,t:46,b:58}});
    resizeSoon();
  }

  function renderIndicatorKeys(){
    const {current}=windowInfo(); const base=currentFilters(); const {azul, nao, total}=splitAzul(base,current);
    const sValor=Utils.pct(azul.valor,total.valor), sCont=Utils.pct(azul.contratos,total.contratos), sBen=Utils.pct(azul.beneficiarios,total.beneficiarios);
    document.getElementById('indicatorCards').innerHTML = [
      Utils.makeCard('Valor contratado', Utils.formatBRL(total.valor), `${Utils.formatPercent(sValor)} vinculado à Amazônia Azul`),
      Utils.makeCard('Contratos', Utils.formatNumber(total.contratos), `${Utils.formatPercent(sCont)} vinculados à Amazônia Azul`),
      Utils.makeCard('Beneficiários', Utils.formatNumber(total.beneficiarios), `${Utils.formatPercent(sBen)} vinculados à Amazônia Azul`)
    ].join('');
    Charts.bar('chart_key_valor', ['Vinculada à Amazônia Azul','Não vinculada'], [azul.valor, nao.valor], 'Valor contratado — composição absoluta', {tickangle:-20, maxLabel:24, hovertemplate:'%{customdata}<br>%{y:,.2f}<extra></extra>'});
    Charts.bar('chart_key_contratos', ['Vinculada à Amazônia Azul','Não vinculada'], [azul.contratos, nao.contratos], 'Contratos — composição absoluta', {tickangle:-20, maxLabel:24});
    Charts.bar('chart_key_beneficiarios', ['Vinculada à Amazônia Azul','Não vinculada'], [azul.beneficiarios, nao.beneficiarios], 'Beneficiários — composição absoluta', {tickangle:-20, maxLabel:24});
  }
  function renderTipologyParticipation(){
    const mode=document.getElementById('tipologyMode').value; const {current}=windowInfo(); const filters=currentFilters(); const map=Transforms.aggregateBy(state, idxFor(filters,current), 'tipologia_territorial_amazonia_azul'); const labels=[...map.keys()].filter(k=>k && k!=='Não elegível').sort(); const total=Transforms.aggregateIndices(state, idxFor(filters,current));
    for(const metric of ['valor','contratos','beneficiarios']){
      const vals=labels.map(l=>{ const a=map.get(l)||Utils.empty(); if(mode==='shareTotal') return Utils.pct(a[metric], total[metric]); if(mode==='shareTip') return Utils.pct(a[metric+'_azul'], a[metric]); return a[metric]; });
      Charts.bar('chart_tip_'+metric, labels, vals, `${Utils.metricLabel(metric)} por tipologia`, {tickformat:mode==='abs'?'':'.0%', maxLabel:18});
    }
  }
  function buildBenchmarkOptions(){
    const opts=[['Brasil|Brasil','Brasil'],['Total dos municípios elegíveis|Municípios elegíveis','Total dos municípios elegíveis']];
    ['Norte','Nordeste','Centro-Oeste','Sudeste','Sul'].forEach(v=>opts.push(['Macrorregião|'+v, 'Macrorregião: '+v]));
    (state.cube.dicts.uf||[]).slice().sort().forEach(v=>opts.push(['UF|'+v, 'UF: '+v]));
    (state.cube.dicts.tipologia_territorial_amazonia_azul||[]).filter(v=>v!=='Não elegível').sort().forEach(v=>opts.push(['Tipologia territorial Amazônia Azul|'+v, 'Tipologia: '+v]));
    state.meta.municipios.filter(m=>m.elegivel_amazonia_azul==='Sim').slice(0,1500).forEach(m=>opts.push(['Município|'+m.cod_mun, 'Município: '+m.nome_mun+' ('+m.uf+')']));
    for(const id of ['benchA','benchB']){ const el=document.getElementById(id); if(!el) continue; el.innerHTML=''; opts.forEach(([v,l])=>el.appendChild(option(l,v))); }
    document.getElementById('benchB').value='Total dos municípios elegíveis|Municípios elegíveis';
  }
  function benchAgg(value){
    const [typ,val]=value.split('|'); const {current}=windowInfo(); const base=currentFilters({}, {ignoreTerritory:true}); const extra={};
    if(typ==='Total dos municípios elegíveis') extra.elegivel_amazonia_azul='Sim';
    if(typ==='Macrorregião') extra.macrorregiao_geografica=val;
    if(typ==='UF') extra.uf=val;
    if(typ==='Tipologia territorial Amazônia Azul') extra.tipologia_territorial_amazonia_azul=val;
    if(typ==='Município') extra.cod_mun=val;
    return agg({...base,...extra},current);
  }
  function renderBenchmark(){
    const a=benchAgg(document.getElementById('benchA').value), b=benchAgg(document.getElementById('benchB').value);
    const rows=[['Valor total','valor',Utils.formatBRLFull],['Valor Amazônia Azul','valor_azul',Utils.formatBRLFull],['Beneficiários totais','beneficiarios',Utils.formatNumber],['Beneficiários Amazônia Azul','beneficiarios_azul',Utils.formatNumber],['Contratos totais','contratos',Utils.formatNumber],['Contratos Amazônia Azul','contratos_azul',Utils.formatNumber],['Part. Amazônia Azul no valor','share_valor_azul',Utils.formatPercent],['Part. Amazônia Azul nos beneficiários','share_beneficiarios_azul',Utils.formatPercent],['Part. Amazônia Azul nos contratos','share_contratos_azul',Utils.formatPercent],['Part. feminina no valor','share_mulheres_valor',Utils.formatPercent],['Part. feminina nos beneficiários','share_mulheres_beneficiarios',Utils.formatPercent],['Part. feminina nos contratos','share_mulheres_contratos',Utils.formatPercent]];
    const body=document.querySelector('#benchTable tbody'); body.innerHTML='';
    rows.forEach(([label,key,fmt])=>{ const va=Transforms.derived(a,key), vb=Transforms.derived(b,key); const abs=(va??0)-(vb??0); const pp=key.includes('share')?abs:null; const rel=vb?abs/vb:null; const tr=document.createElement('tr'); tr.innerHTML=`<td>${label}</td><td>${fmt(va)}</td><td>${fmt(vb)}</td><td>${key.includes('share')?Utils.formatPP(abs):key.includes('valor')?Utils.formatBRLFull(abs):Utils.formatNumber(abs)}</td><td>${pp===null?'—':Utils.formatPP(pp)}</td><td>${Utils.formatPercent(rel)}</td>`; body.appendChild(tr); });
    document.getElementById('benchCards').innerHTML=[
      Utils.makeCard('Valor total — território',Utils.formatBRL(a.valor),'Comparação selecionada'),
      Utils.makeCard('Valor total — benchmark',Utils.formatBRL(b.valor),'Base comparativa'),
      Utils.makeCard('Part. Amazônia Azul — território',Utils.formatPercent(Utils.pct(a.valor_azul,a.valor)),'No valor contratado'),
      Utils.makeCard('Part. feminina — território',Utils.formatPercent(Utils.pct(a.valor_mulheres,a.valor)),'No valor contratado')
    ].join('');
    Charts.groupedBar('chart_benchmark', ['Valor total','Valor Amazônia Azul','Contratos'], [
      {name:'Território',values:[a.valor,a.valor_azul,a.contratos],color:'#176b93'},
      {name:'Benchmark',values:[b.valor,b.valor_azul,b.contratos],color:'#16a6a3'}
    ], 'Comparação sintética');
  }
  const growthLevelLabels = {cod_mun:'Município', uf:'UF', macrorregiao_geografica:'Macrorregião', tipologia_territorial_amazonia_azul:'Tipologia territorial Amazônia Azul'};
  const growthIndicatorLabels = {valor_azul:'Valor contratado em atividades Amazônia Azul', contratos_azul:'Contratos em atividades Amazônia Azul', beneficiarios_azul:'Beneficiários em atividades Amazônia Azul'};
  function renderGrowthLocations(){
    const level=document.getElementById('growthLevel')?.value || 'uf';
    const indicator=document.getElementById('growthIndicator')?.value || 'valor_azul';
    const {current,previous,previousComplete}=windowInfo();
    const filters=currentFilters();
    const rows=Transforms.comparePeriodsBy(state, filters, level, current, previous)
      .map(d=>{
        const label = level==='cod_mun' ? (state.munLabel.get(d.key)||d.key) : d.key;
        const cur=Transforms.derived(d.current, indicator)||0;
        const prev=Transforms.derived(d.previous, indicator)||0;
        let status='Estável', delta=cur-prev;
        if(!previousComplete || (prev===0 && cur!==0)) status='Sem base anterior';
        else if(delta>0) status='Aumentou';
        else if(delta<0) status='Reduziu';
        return {label, cur, prev, delta, status};
      })
      .filter(d=>d.label && String(d.label).trim()!=='' && d.label!=='Não informado');
    const counts = {Aumentou:0, Reduziu:0, Estável:0, 'Sem base anterior':0};
    rows.forEach(r=>{ counts[r.status]=(counts[r.status]||0)+1; });
    document.getElementById('growthCards').innerHTML = [
      Utils.makeCard('Aumentou', Utils.formatNumber(counts.Aumentou), growthIndicatorLabels[indicator]),
      Utils.makeCard('Reduziu', Utils.formatNumber(counts.Reduziu), growthIndicatorLabels[indicator]),
      Utils.makeCard('Estável', Utils.formatNumber(counts.Estável), growthLevelLabels[level]),
      Utils.makeCard('Sem base anterior', Utils.formatNumber(counts['Sem base anterior']), 'Janela anterior insuficiente ou denominador zero')
    ].join('');
    const plotRows = rows
      .filter(r=>r.status!=='Sem base anterior' && r.delta!==null && r.delta!==undefined && !Number.isNaN(r.delta))
      .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))
      .slice(0, level==='cod_mun' ? 40 : 60)
      .reverse();
    const formatter = indicator.includes('valor') ? Utils.formatBRL : Utils.formatNumber;
    Charts.dotPlot('chart_growth_dots', plotRows.map(r=>r.label), plotRows.map(r=>r.delta), `Variação — ${growthIndicatorLabels[indicator]} por ${growthLevelLabels[level]}`, {
      tickformat: indicator.includes('valor') ? ',.1f' : ',.1f',
      formatter,
      maxLabel: level==='cod_mun' ? 54 : 42,
      hovertemplate:'%{customdata}<br>Variação: %{text}<extra></extra>'
    });
  }
  function renderIndicators(){ renderIndicatorKeys(); renderGrowthLocations(); renderTipologyParticipation(); renderBenchmark(); resizeSoon(); }

  async function renderMethodology(){
    const el=document.getElementById('methodologyContent'); if(el.dataset.loaded) return;
    const r=await fetch('metodologia/metodologia.md'); const md=await r.text(); el.innerHTML=marked.parse(md); el.dataset.loaded='1';
  }
  function renderMap(){
    if(state.mapRendering) return;
    state.mapRendering=true;
    MapController.render(state).finally(()=>{ state.mapRendering=false; state.mapLoaded=true; });
  }
  function renderActive(){
    if(!state.cube) return;
    if(state.activeTab==='overview') renderOverview();
    if(state.activeTab==='detail') renderRankings();
    if(state.activeTab==='indicators') renderIndicators();
    if(state.activeTab==='maps') renderMap();
    if(state.activeTab==='methodology') renderMethodology();
  }
  function initTabs(){
    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
      state.activeTab=btn.dataset.tab;
      renderActive();
      resizeSoon();
    }));
  }
  async function init(){
    try{
      const loaded=await DataLoader.loadAll(); state.cube=loaded.cube; state.meta=loaded.meta; state.bench=loaded.bench;
      state.meta.municipios.forEach(m=>state.munLabel.set(m.cod_mun, `${m.nome_mun} (${m.uf})`));
      document.getElementById('source-period').textContent = `${Utils.formatMonth(state.meta.source_summary.mes_inicial)} – ${Utils.formatMonth(state.meta.source_summary.mes_final)}`;
      document.getElementById('source-summary').textContent = `${Utils.formatNumber(state.meta.source_summary.linhas_base_financiamento)} linhas brutas processadas; ${Utils.formatNumber(state.cube.meta.rows_aggregated)} agregações públicas.`;
      initFilters(); initTabs(); renderActive();
    }catch(e){ console.error(e); document.querySelector('.content').innerHTML=`<article class="panel"><h2>Erro ao carregar dashboard</h2><p>${e.message}</p></article>`; }
  }
  return {init, state};
})();
window.addEventListener('DOMContentLoaded', App.init);
