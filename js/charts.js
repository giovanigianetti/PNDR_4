const Charts = (() => {
  const COLORS = {blue:'#176b93', teal:'#16a6a3', sky:'#9dd5ea', gray:'#d7e1e7', orange:'#d97706', red:'#b91c1c', navy:'#0b2f4a'};
  const config = {responsive:true,displayModeBar:false};
  const baseFont = {family:'Inter, Segoe UI, Arial',size:12,color:'#17212b'};
  const layoutBase = {
    autosize:true,
    margin:{l:64,r:24,t:46,b:74},
    paper_bgcolor:'rgba(0,0,0,0)',
    plot_bgcolor:'rgba(0,0,0,0)',
    font:baseFont,
    hovermode:'closest',
    separators:',.',
    uniformtext:{mode:'hide',minsize:10}
  };
  function el(id){ return document.getElementById(id); }
  function truncate(text, max=34){
    const s = String(text ?? '');
    return s.length > max ? s.slice(0, Math.max(0,max-1)) + '…' : s;
  }
  function hasData(values){ return Array.isArray(values) && values.some(v => v !== null && v !== undefined && !Number.isNaN(v)); }
  function clear(id, msg='Não há dados disponíveis para a seleção atual'){
    const node=el(id); if(!node) return;
    if(window.Plotly){ try{ Plotly.purge(node); }catch(e){} }
    node.innerHTML = `<div class="no-data">${msg}</div>`;
  }
  function commonLayout(title, extra={}){
    return {
      ...layoutBase,
      title:{text:title,font:{size:14,color:'#20313d'},x:0,xanchor:'left'},
      ...extra
    };
  }
  function bar(id, x, y, title, opts={}){
    if(!hasData(y)){ clear(id); return; }
    const labels = x.map(v=>truncate(v, opts.maxLabel||28));
    const hoverLabels = x.map(v=>String(v ?? ''));
    Plotly.react(id, [{
      type:'bar',x:labels,y,orientation:opts.orientation||'v',customdata:hoverLabels,
      marker:{color:opts.color||COLORS.blue},text:opts.text,textposition:opts.textposition||'auto',cliponaxis:false,
      hovertemplate:opts.hovertemplate || '%{customdata}<br>%{y}<extra></extra>'
    }], commonLayout(title, {
      xaxis:{automargin:true,tickangle:opts.tickangle ?? -35,tickfont:{size:11}},
      yaxis:{automargin:true,tickformat:opts.tickformat||'',rangemode:'tozero'},
      margin:opts.margin || layoutBase.margin
    }), config);
  }
  function hbar(id, labels, values, title, opts={}){
    if(!hasData(values)){ clear(id); return; }
    const y = labels.map(v=>truncate(v, opts.maxLabel||46));
    const custom = labels.map(v=>String(v ?? ''));
    Plotly.react(id, [{
      type:'bar',x:values,y,orientation:'h',customdata:custom,
      marker:{color:opts.color||COLORS.blue},text:opts.text,textposition:opts.textposition||'auto',cliponaxis:false,
      hovertemplate:opts.hovertemplate || '%{customdata}<br>%{x}<extra></extra>'
    }], commonLayout(title, {
      margin:opts.margin || {l:190,r:26,t:46,b:52},
      xaxis:{automargin:true,tickformat:opts.tickformat||'',rangemode:'tozero'},
      yaxis:{automargin:true,categoryorder:'array',categoryarray:y,tickfont:{size:11}},
    }), config);
  }
  function line(id, traces, title, opts={}){
    const valid = (traces||[]).filter(t=>hasData(t.y));
    if(!valid.length){ clear(id); return; }
    Plotly.react(id, valid.map(t=>({
      type:'scatter',mode:'lines+markers',line:{width:2,...(t.line||{})},marker:{size:6,...(t.marker||{})},...t
    })), commonLayout(title, {
      xaxis:{automargin:true,tickfont:{size:11}},
      yaxis:{automargin:true,tickformat:opts.tickformat||'',rangemode:opts.rangemode||'normal'},
      legend:{orientation:'h',x:0,y:-.24,xanchor:'left',font:{size:11}},
      margin:opts.margin || {l:64,r:20,t:46,b:82}
    }), config);
  }
  function groupedBar(id, labels, series, title, opts={}){
    const valid = (series||[]).filter(s=>hasData(s.values));
    if(!valid.length){ clear(id); return; }
    const x = labels.map(v=>truncate(v, opts.maxLabel||30));
    const custom = labels.map(v=>String(v ?? ''));
    Plotly.react(id, valid.map(s=>({type:'bar',x,y:s.values,name:s.name,customdata:custom,marker:{color:s.color||COLORS.blue},text:s.text,textposition:s.textposition||'auto',cliponaxis:false,hovertemplate:s.hovertemplate || opts.hovertemplate || ('%{customdata}<br>'+s.name+': %{y}<extra></extra>')})), commonLayout(title, {
      barmode:'group',
      xaxis:{automargin:true,tickangle:opts.tickangle ?? -35,tickfont:{size:11}},
      yaxis:{automargin:true,tickformat:opts.tickformat||'',rangemode:'tozero'},
      legend:{orientation:'h',x:0,y:-.25,xanchor:'left',font:{size:11}},
      margin:opts.margin || {l:64,r:24,t:46,b:90}
    }), config);
  }
  function stackedPercent(id, labels, azulShares, title, opts={}){
    if(!hasData(azulShares)){ clear(id); return; }
    const y = labels.map(v=>truncate(v, opts.maxLabel||34));
    const azul = azulShares.map(v => v===null||v===undefined||Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, v)));
    const nao = azul.map(v => Math.max(0, 1-v));
    const textAzul = azul.map(v => Utils.formatPercent(v));
    Plotly.react(id, [
      {type:'bar',orientation:'h',x:azul,y,name:'Vinculada à Amazônia Azul',marker:{color:COLORS.blue},text:textAzul,textposition:'inside',insidetextanchor:'middle',hovertemplate:'%{y}<br>Amazônia Azul: %{x:.1%}<extra></extra>'},
      {type:'bar',orientation:'h',x:nao,y,name:'Não vinculada',marker:{color:'#d7e1e7'},text:nao.map(v=>Utils.formatPercent(v)),textposition:'inside',insidetextanchor:'middle',hovertemplate:'%{y}<br>Não vinculada: %{x:.1%}<extra></extra>'}
    ], commonLayout(title, {
      barmode:'stack',
      margin:opts.margin || {l:150,r:30,t:46,b:82},
      xaxis:{automargin:true,tickformat:'.0%',range:[0,1],fixedrange:true},
      yaxis:{automargin:true,categoryorder:'array',categoryarray:y},
      legend:{orientation:'h',x:0,y:-.24,xanchor:'left',font:{size:11}}
    }), config);
  }
  function dotPlot(id, labels, values, title, opts={}){
    if(!hasData(values)){ clear(id); return; }
    const y = labels.map(v=>truncate(v, opts.maxLabel||46));
    const custom = labels.map(v=>String(v ?? ''));
    const text = opts.text || values.map(v => opts.formatter ? opts.formatter(v) : String(v));
    const colors = opts.colors || values.map(v => v > 0 ? COLORS.blue : v < 0 ? COLORS.red : COLORS.gray);
    Plotly.react(id, [{
      type:'scatter',mode:'markers+text',x:values,y,customdata:custom,text,
      textposition:opts.textposition||'middle right',textfont:{size:11},
      marker:{size:10,color:colors,line:{color:'white',width:1}},
      hovertemplate:opts.hovertemplate || '%{customdata}<br>Variação: %{x}<extra></extra>'
    }], commonLayout(title, {
      margin:opts.margin || {l:230,r:80,t:46,b:64},
      xaxis:{automargin:true,tickformat:opts.tickformat||'',zeroline:true,zerolinecolor:'#8fa1ad'},
      yaxis:{automargin:true,categoryorder:'array',categoryarray:y,tickfont:{size:11}},
      showlegend:false
    }), config);
  }
  function resizeAll(root=document){
    if(!window.Plotly) return;
    root.querySelectorAll('.js-plotly-plot').forEach(node=>{ try{ Plotly.Plots.resize(node); }catch(e){} });
  }
  return {bar,hbar,line,groupedBar,stackedPercent,dotPlot,clear,resizeAll,truncate,COLORS};
})();
