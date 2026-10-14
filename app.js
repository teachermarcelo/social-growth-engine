/* Social Growth Engine — semiautomatic prototype. No external API calls. */
(() => {
  const $ = id => document.getElementById(id);
  const STORE = "socialGrowthEngine.v1";
  let state = loadState();
  let toastTimer;
  function loadState() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || "{}"); return {posts:Array.isArray(v.posts)?v.posts:[],metrics:Array.isArray(v.metrics)?v.metrics:[]}; }
    catch { return {posts:[],metrics:[]}; }
  }
  function save() { localStorage.setItem(STORE, JSON.stringify(state)); renderAll(); }
  function uid() { return "sg_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function fmt(n) { return new Intl.NumberFormat("pt-BR",{notation:n>=100000?"compact":"standard",maximumFractionDigits:1}).format(n||0); }
  function toast(s) { const el=$("toast"); el.textContent=s; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
  function showView(name) {
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
    document.querySelectorAll(".nav-link").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
    const titles={overview:"Visão geral",planner:"Planejamento",content:"Estúdio de conteúdo",analytics:"Análise de desempenho",settings:"Configurações"};
    $("pageTitle").textContent=titles[name]||"Visão geral"; $("sidebar").classList.remove("open"); window.scrollTo({top:0,behavior:"smooth"});
  }
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
  $("menuToggle").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  function openNew() { showView("content"); $("contentTitle").focus(); }
  $("newContentTop").addEventListener("click",openNew); $("newContentPlanner").addEventListener("click",openNew);
  function statusClass(s){return s==="Publicado"?"published":s==="Pronto para revisar"?"ready":"";}
  function renderPlanner() {
    const q=$("plannerSearch").value.toLowerCase(), pf=$("platformFilter").value, sf=$("statusFilter").value;
    const posts=state.posts.filter(p=>(!q||(p.title+" "+(p.notes||"")).toLowerCase().includes(q))&&(!pf||p.platform===pf)&&(!sf||p.status===sf)).sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"));
    $("plannerRows").innerHTML=posts.map(p=>`<tr><td>${esc(p.title)}<br><small style="color:#8b91a3;font-weight:450">${esc(p.format||"Conteúdo")}</small></td><td>${esc(p.platform)}</td><td>${p.date?new Date(p.date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td><span class="status-tag ${statusClass(p.status)}">${esc(p.status)}</span></td><td><button class="row-action" data-edit="${esc(p.id)}">Editar</button><button class="row-action" data-delete="${esc(p.id)}">Excluir</button></td></tr>`).join("");
    $("plannerEmpty").style.display=posts.length?"none":"block";
    $("plannerRows").querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editPost(b.dataset.edit)));
    $("plannerRows").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deletePost(b.dataset.delete)));
    const upcoming=state.posts.filter(p=>p.status!=="Publicado").sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")).slice(0,4);
    $("upcomingList").innerHTML=upcoming.length?upcoming.map(p=>`<div class="upcoming-item" style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)"><div><b style="font-size:12px">${esc(p.title)}</b><div style="font-size:10px;color:var(--muted)">${esc(p.platform)} · ${p.date?new Date(p.date+"T12:00:00").toLocaleDateString("pt-BR"):"Sem data"}</div></div><span class="status-tag">${esc(p.status)}</span></div>`).join(""):'<div class="list-empty">Nenhuma publicação planejada. Adicione uma ideia para começar.</div>';
  }
  ["plannerSearch","platformFilter","statusFilter"].forEach(id=>$(id).addEventListener(id==="plannerSearch"?"input":"change",renderPlanner));
  function editPost(id) {
    const p=state.posts.find(x=>x.id===id); if(!p)return;
    $("editId").value=p.id;$("editTitle").value=p.title;$("editPlatform").value=p.platform;$("editStatus").value=p.status;$("editDate").value=p.date||"";$("editNotes").value=p.notes||"";
    $("editDialog").showModal();
  }
  function deletePost(id){if(!confirm("Excluir este conteúdo do planejamento?"))return;state.posts=state.posts.filter(p=>p.id!==id);save();toast("Conteúdo excluído.");}
  $("closeEdit").onclick=$("cancelEdit").onclick=()=>$("editDialog").close();
  $("editForm").addEventListener("submit",e=>{e.preventDefault();const p=state.posts.find(x=>x.id===$("editId").value);if(p){p.title=$("editTitle").value.trim();p.platform=$("editPlatform").value;p.status=$("editStatus").value;p.date=$("editDate").value;p.notes=$("editNotes").value;save();toast("Alterações salvas.");}$("editDialog").close();});
  $("contentForm").addEventListener("submit",e=>{
    e.preventDefault(); const title=$("contentTitle").value.trim();if(!title)return;
    state.posts.push({id:uid(),title,platform:$("contentPlatform").value,format:$("contentFormat").value,date:$("contentDate").value,status:"Rascunho",notes:$("contentAudience").value,goal:$("contentGoal").value,createdAt:new Date().toISOString()});
    save();toast("Conteúdo salvo no planejamento.");$("contentForm").reset();$("ideaSuggestions").innerHTML="";$("ideaOutput").innerHTML='<div class="placeholder-icon">✓</div><h3>Rascunho salvo</h3><p>Você pode encontrá-lo na aba Planejamento.</p>';showView("planner");
  });
  function generateIdeas() {
    const title=$("contentTitle").value.trim(); if(!title){toast("Digite um tema primeiro.");$("contentTitle").focus();return;}
    const goal=$("contentGoal").value, format=$("contentFormat").value;
    const templates=[
      `O erro que muita gente comete com “${title}” — e como evitar.`,
      `3 coisas que você precisa saber sobre ${title}.`,
      `Antes de tentar ${title}, veja este passo a passo.`,
      `Você já passou por isso? Vamos falar sobre ${title}.`,
      `Um teste rápido: o que você sabe sobre ${title}?`
    ];
    const cta=goal==="Gerar comentários"?"Qual é a sua experiência? Conte nos comentários.":goal==="Atrair seguidores"?"Acompanhe o perfil para ver mais conteúdos práticos.":goal==="Levar tráfego"?"Confira o material complementar no link do perfil.":goal==="Reter atenção"?"Fique até o final para ver o exemplo completo.":"Compartilhe com alguém que pode aproveitar esta dica.";
    $("ideaOutput").innerHTML=`<div class="placeholder-icon">✦</div><h3>Rascunhos para ${esc(format)}</h3><p>Escolha um gancho, adapte à sua experiência e confirme se a promessa é entregue no conteúdo.</p>`;
    $("ideaSuggestions").innerHTML=templates.map((t,i)=>`<div class="suggestion"><span>${i+1}.</span><div style="flex:1">${esc(t)}${i===0?`<small style="display:block;color:var(--muted);margin-top:5px">${esc(cta)}</small>`:""}</div><button type="button" data-copy="${i}">Copiar</button></div>`).join("");
    $("ideaSuggestions").querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",()=>{const text=templates[Number(b.dataset.copy)]+"\n\n"+cta;navigator.clipboard?.writeText(text).then(()=>toast("Texto copiado." )).catch(()=>toast(text));}));
  }
  $("generateIdeas").addEventListener("click",generateIdeas);
  function metricValues(){return state.metrics.reduce((a,m)=>{a.views+=m.views||0;a.reach+=m.reach||0;a.followers+=m.followers||0;a.likes+=m.likes||0;a.comments+=m.comments||0;a.shares+=m.shares||0;return a;},{views:0,reach:0,followers:0,likes:0,comments:0,shares:0});}
  function renderAnalytics(){
    const m=metricValues(),count=state.metrics.length,eng=(m.views?100*(m.likes+m.comments+m.shares)/m.views:0),avg=count?m.views/count:0;
    $("metricViews").textContent=fmt(m.views);$("metricReach").textContent=fmt(m.reach);$("metricFollowers").textContent=fmt(m.followers);$("metricPlanned").textContent=state.posts.filter(p=>p.status!=="Publicado").length;
    $("engagementRate").textContent=m.views?eng.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":"—";$("avgViews").textContent=count?fmt(Math.round(avg)):"—";$("metricCount").textContent=count;
    $("metricsList").innerHTML=count?state.metrics.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(m=>`<div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;align-items:center"><div><b style="font-size:12px">${esc(m.title)}</b><div style="font-size:10px;color:var(--muted)">${esc(m.platform)} · ${m.date?new Date(m.date+"T12:00:00").toLocaleDateString("pt-BR"):"Sem data"} · ${fmt(m.views)} views</div></div><button class="row-action" data-metric-delete="${esc(m.id)}">Excluir</button></div>`).join(""):'<div class="list-empty">Ainda não há métricas cadastradas.</div>';
    $("metricsList").querySelectorAll("[data-metric-delete]").forEach(b=>b.addEventListener("click",()=>{if(confirm("Excluir este registro?")){state.metrics=state.metrics.filter(x=>x.id!==b.dataset.metricDelete);save();toast("Registro excluído.");}}));
  }
  function renderAll(){renderPlanner();renderAnalytics();}
  const metricDialog=$("metricDialog");
  $("addMetricBtn").onclick=()=>{ $("metricDate").value=new Date().toISOString().slice(0,10);metricDialog.showModal(); };
  $("closeMetric").onclick=$("cancelMetric").onclick=()=>metricDialog.close();
  $("metricForm").addEventListener("submit",e=>{e.preventDefault();const num=id=>Math.max(0,Number($(id).value)||0);
    state.metrics.push({id:uid(),title:$("metricTitle").value.trim(),platform:$("metricPlatform").value,date:$("metricDate").value,views:num("metricViewsInput"),reach:num("metricReachInput"),likes:num("metricLikes"),comments:num("metricComments"),shares:num("metricShares"),followers:num("metricFollowersInput"),retention:$("metricRetention").value===""?null:num("metricRetention")});
    save();metricDialog.close();$("metricForm").reset();toast("Métricas registradas.");
  });
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  $("exportBackup").onclick=()=>download("social-growth-backup.json",JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),...state},null,2),"application/json");
  $("importBackup").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.posts)||!Array.isArray(data.metrics))throw Error("Formato inválido");if(!confirm("Importar este backup substituirá os dados atuais deste navegador. Deseja continuar?"))return;state={posts:data.posts,metrics:data.metrics};save();toast("Backup importado.");}catch(err){toast("Arquivo inválido. Nenhum dado foi importado.");}finally{e.target.value="";}});
  $("clearData").onclick=()=>{if(confirm("Isso apagará os conteúdos e métricas salvos neste navegador. Exporte um backup antes. Continuar?")){state={posts:[],metrics:[]};save();toast("Dados locais apagados.");}};
  $("exportCsv").onclick=()=>{if(!state.metrics.length){toast("Não há métricas para exportar.");return;}const cols=["title","platform","date","views","reach","likes","comments","shares","followers","retention"];const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const csv=[cols.join(";"),...state.metrics.map(m=>cols.map(k=>quote(m[k])).join(";"))].join("\r\n");download("social-growth-metricas.csv","\ufeff"+csv,"text/csv;charset=utf-8");};
  renderAll();
})();