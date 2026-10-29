/* Social Growth Engine — semiautomatic prototype. No external API calls. */
(() => {
  const $ = id => document.getElementById(id);
  const STORE = "socialGrowthEngine.v1";
  // Do not silently write to an unverified/legacy Supabase project.
  // Configure the dedicated Social Growth Engine project in Settings.
  const SUPABASE_URL = (localStorage.getItem("socialGrowthEngine.supabaseUrl") || "https://rvgcniaowzmsudzliozf.supabase.co").replace(/\/$/, "");
  const SUPABASE_PUBLISHABLE_KEY = localStorage.getItem("socialGrowthEngine.supabasePublishableKey") || "sb_publishable_N_xCS0lbbTvG7qWTpAw0ag_vlg1lbHb";
  const supabaseClient = window.supabase?.createClient && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;
  let currentUser = null;
  let cloudBusy = false;
  let syncAgain = false;
  let state = loadState();
  let toastTimer;
  function loadState() {
    try { const v = JSON.parse(localStorage.getItem(STORE) || "{}"); return {posts:Array.isArray(v.posts)?v.posts:[],metrics:Array.isArray(v.metrics)?v.metrics:[],segments:Array.isArray(v.segments)?v.segments:[],opportunities:Array.isArray(v.opportunities)?v.opportunities:[],campaigns:Array.isArray(v.campaigns)?v.campaigns:[]}; }
    catch { return {posts:[],metrics:[],segments:[],opportunities:[],campaigns:[]}; }
  }
  function save() {
    localStorage.setItem(STORE, JSON.stringify(state));
    renderAll();
    if (currentUser) syncLocalChanges().catch(err => setCloudStatus("Erro ao sincronizar: " + safeError(err), true));
  }
  function safeError(err) { return String(err?.message || err || "erro desconhecido").slice(0, 220); }
  function setCloudStatus(message, isError=false) {
    const el = $("cloudStatus");
    if (el) { el.textContent = message; el.classList.toggle("error", isError); }
  }
  function setCloudSignedIn(user) {
    currentUser = user || null;
    $("cloudSignOut").hidden = !currentUser;
    $("cloudAuthForm").querySelectorAll("input,button").forEach(el => { el.disabled = !!currentUser; });
    if (currentUser) {
      setCloudStatus("Conectado: " + (currentUser.email || "conta autenticada"));
      $("cloudSignIn").textContent = "Conectado";
      if (typeof loadTrackingWorkspace === "function") loadTrackingWorkspace();
    } else {
      setCloudStatus(supabaseClient ? "Não conectado. Seus dados continuam neste navegador." : "Biblioteca Supabase não carregou. Verifique sua conexão.");
      $("cloudSignIn").textContent = "Entrar e sincronizar";
      $("cloudAuthForm").querySelectorAll("input,button").forEach(el => { el.disabled = false; });
    }
  }
  async function syncLocalChanges() {
    if (!supabaseClient || !currentUser) return;
    if (cloudBusy) { syncAgain = true; return; }
    cloudBusy = true;
    setCloudStatus("Salvando alterações na nuvem…");
    try {
      const records = [["posts", state.posts], ["metrics", state.metrics], ["segments", state.segments], ["opportunities", state.opportunities], ["campaigns", state.campaigns]]
        .flatMap(([record_type, items]) => items.map(item => ({user_id:currentUser.id, record_type, record_id:String(item.id), payload:item, updated_at:new Date().toISOString()})));
      if (records.length) {
        const {error} = await supabaseClient.from("sge_app_records").upsert(records, {onConflict:"user_id,record_type,record_id"});
        if (error) throw error;
      }
      setCloudStatus("Sincronizado com a nuvem · " + new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
    } finally {
      cloudBusy = false;
      if (syncAgain) { syncAgain = false; syncLocalChanges().catch(err => setCloudStatus("Erro ao sincronizar: " + safeError(err), true)); }
    }
  }
  async function deleteCloudRecord(table, id) {
    if (!supabaseClient || !currentUser) return;
    const recordType = String(table).replace(/^sge_/, "");
    const {error} = await supabaseClient.from("sge_app_records").delete().eq("record_type", recordType).eq("record_id", String(id)).eq("user_id", currentUser.id);
    if (error) throw error;
  }
  async function loadAndMergeCloudData() {
    if (!supabaseClient || !currentUser) return;
    setCloudStatus("Carregando e mesclando registros…");
    const {data:remoteRecords,error} = await supabaseClient.from("sge_app_records").select("record_type,record_id,payload").eq("user_id", currentUser.id);
    if (error) throw error;
    const merge = (local, remote) => {
      const byId = new Map(remote.map(row => [row.payload?.id || row.record_id, row.payload]).filter(([id,p]) => id && p));
      local.forEach(item => byId.set(item.id, item));
      return [...byId.values()];
    };
    const records = remoteRecords || [];
    state.posts = merge(state.posts, records.filter(r=>r.record_type==="posts"));
    state.metrics = merge(state.metrics, records.filter(r=>r.record_type==="metrics"));
    state.segments = merge(state.segments, records.filter(r=>r.record_type==="segments"));
    state.opportunities = merge(state.opportunities, records.filter(r=>r.record_type==="opportunities"));
    state.campaigns = merge(state.campaigns, records.filter(r=>r.record_type==="campaigns"));
    localStorage.setItem(STORE, JSON.stringify(state));
    renderAll();
    await syncLocalChanges();
    toast("Dados locais e da nuvem foram mesclados.");
  }
  const supabaseUrlInput = $("supabaseProjectUrl");
  const supabaseKeyInput = $("supabasePublishableKey");
  const saveSupabaseConfigButton = $("saveSupabaseConfig");
  if (supabaseUrlInput && supabaseKeyInput && saveSupabaseConfigButton) {
    supabaseUrlInput.value = SUPABASE_URL;
    supabaseKeyInput.value = SUPABASE_PUBLISHABLE_KEY;
    saveSupabaseConfigButton.addEventListener("click", () => {
      try {
        const projectUrl = new URL(supabaseUrlInput.value.trim());
        const publishableKey = supabaseKeyInput.value.trim();
        if (projectUrl.protocol !== "https:" || !publishableKey.startsWith("sb_publishable_") && !publishableKey.startsWith("eyJ")) {
          throw new Error("Informe a URL HTTPS do projeto dedicado e uma chave publicável (sb_publishable_…). Nunca use service_role.");
        }
        localStorage.setItem("socialGrowthEngine.supabaseUrl", projectUrl.toString().replace(/\/$/, ""));
        localStorage.setItem("socialGrowthEngine.supabasePublishableKey", publishableKey);
        toast("Configuração salva. Recarregando o painel…");
        window.location.reload();
      } catch (err) {
        setCloudStatus(safeError(err), true);
      }
    });
  }
  if (!supabaseClient) {
    setCloudStatus("Configure a URL e a chave publicável do projeto Supabase exclusivo nas configurações. Seus dados locais continuam disponíveis.", true);
  } else {
    $("cloudAuthForm").addEventListener("submit", async e => {
      e.preventDefault();
      const email = $("cloudEmail").value.trim();
      const password = $("cloudPassword").value;
      $("cloudSignIn").disabled = $("cloudSignUp").disabled = true;
      setCloudStatus("Entrando na sua conta…");
      try {
        const {data,error} = await supabaseClient.auth.signInWithPassword({email,password});
        if (error) throw error;
        setCloudSignedIn(data.user);
        await loadAndMergeCloudData();
      } catch (err) { setCloudStatus(safeError(err), true); }
      finally { if (!currentUser) $("cloudSignIn").disabled = $("cloudSignUp").disabled = false; }
    });
    $("cloudSignUp").addEventListener("click", async () => {
      const email = $("cloudEmail").value.trim();
      const password = $("cloudPassword").value;
      if (!email || password.length < 6) { setCloudStatus("Informe um e-mail válido e uma senha com pelo menos 6 caracteres.", true); return; }
      $("cloudSignIn").disabled = $("cloudSignUp").disabled = true;
      setCloudStatus("Criando conta…");
      try {
        const {data,error} = await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:window.location.href.split("#")[0]}});
        if (error) throw error;
        if (data.user && data.session) {
          setCloudSignedIn(data.user);
          await loadAndMergeCloudData();
        } else {
          setCloudStatus("Conta criada. Confira seu e-mail para confirmar a conta e depois entre.");
        }
      } catch (err) { setCloudStatus(safeError(err), true); }
      finally { if (!currentUser) $("cloudSignIn").disabled = $("cloudSignUp").disabled = false; }
    });
    $("cloudSignOut").addEventListener("click", async () => {
      const {error} = await supabaseClient.auth.signOut();
      if (error) { setCloudStatus(safeError(error), true); return; }
      setCloudSignedIn(null);
      toast("Você saiu. Os dados locais foram mantidos.");
    });
    supabaseClient.auth.getSession().then(async ({data,error}) => {
      if (error) { setCloudStatus(safeError(error), true); return; }
      if (data.session?.user) {
        setCloudSignedIn(data.session.user);
        try { await loadAndMergeCloudData(); } catch (err) { setCloudStatus("Erro ao carregar nuvem: " + safeError(err), true); }
      } else setCloudSignedIn(null);
    });
  }
  function uid() { return "sg_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,7); }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function fmt(n) { return new Intl.NumberFormat("pt-BR",{notation:n>=100000?"compact":"standard",maximumFractionDigits:1}).format(n||0); }
  function toast(s) { const el=$("toast"); el.textContent=s; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
  function showView(name) {
    document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
    document.querySelectorAll(".nav-link").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
    const titles={overview:"Visão geral",accounts:"Contas e publicações",discovery:"Descoberta de público",campaigns:"Campanhas e tráfego",planner:"Planejamento",content:"Estúdio de conteúdo",analytics:"Análise de desempenho",settings:"Configurações"};
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
  function deletePost(id){if(!confirm("Excluir este conteúdo do planejamento?"))return;state.posts=state.posts.filter(p=>p.id!==id);save();deleteCloudRecord("sge_posts",id).catch(err=>setCloudStatus("Erro ao excluir na nuvem: "+safeError(err),true));toast("Conteúdo excluído.");}
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

  function buildSearchTerms(segment) {
    const name=segment.name.trim(), audience=(segment.audience||"").trim();
    const seeds=[name,`${name} para iniciantes`,`como aprender ${name}`,`dúvidas sobre ${name}`,`erros comuns em ${name}`,`dicas práticas de ${name}`,audience?`${audience} ${name}`:`${name} passo a passo`,`mitos e verdades sobre ${name}`];
    return [...new Set(seeds.map(s=>s.trim()).filter(Boolean))].slice(0,8);
  }
  function renderDiscovery() {
    const results=$("discoveryResults");
    const current=state.segments.slice().sort((a,b)=>(b.updatedAt||b.createdAt||"").localeCompare(a.updatedAt||a.createdAt||""))[0];
    if(current&&results&&!results.dataset.segmentId)renderSearchTerms(current);
    $("segmentsList").innerHTML=state.segments.length?state.segments.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(s=>`
      <div class="discovery-item"><div><b>${esc(s.name)}</b><p>${esc(s.audience||"Público não detalhado")} · ${esc(s.region||"Região não definida")} · ${esc(s.goal)}</p></div><div class="discovery-actions"><button class="row-action" data-use-segment="${esc(s.id)}">Pesquisar</button><button class="row-action" data-delete-segment="${esc(s.id)}">Excluir</button></div></div>`).join(""):'<div class="list-empty">Nenhum segmento salvo.</div>';
    $("segmentsList").querySelectorAll("[data-use-segment]").forEach(b=>b.addEventListener("click",()=>{const s=state.segments.find(x=>x.id===b.dataset.useSegment);if(s){renderSearchTerms(s);$("segmentName").value=s.name;$("segmentAudience").value=s.audience||"";$("segmentLanguage").value=s.language||"pt-BR";$("segmentRegion").value=s.region||"";$("segmentGoal").value=s.goal||"Ensinar e informar";}}));
    $("segmentsList").querySelectorAll("[data-delete-segment]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("Excluir este segmento salvo?"))return;const id=b.dataset.deleteSegment;state.segments=state.segments.filter(s=>s.id!==id);deleteCloudRecord("sge_segments",id).catch(err=>setCloudStatus("Erro ao excluir segmento na nuvem: "+safeError(err),true));save();}));
    $("opportunitiesList").innerHTML=state.opportunities.length?state.opportunities.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(o=>`
      <div class="discovery-item"><div><b>${esc(o.term)}</b><p>${esc(o.segmentName)} · ${esc(o.platform)} · ${esc(o.note||"Pesquisa ainda não analisada")}</p><small>${esc(o.source||"Pesquisa manual")} · ${o.createdAt?new Date(o.createdAt).toLocaleDateString("pt-BR"):""}</small></div><div class="discovery-actions"><button class="row-action" data-opportunity-content="${esc(o.id)}">Virar conteúdo</button><button class="row-action" data-delete-opportunity="${esc(o.id)}">Excluir</button></div></div>`).join(""):'<div class="list-empty">Ainda não há oportunidades salvas.</div>';
    $("opportunitiesList").querySelectorAll("[data-opportunity-content]").forEach(b=>b.addEventListener("click",()=>{const o=state.opportunities.find(x=>x.id===b.dataset.opportunityContent);if(!o)return;$("contentTitle").value=o.term;$("contentAudience").value=`Público: ${o.segmentName}. Oportunidade pesquisada em ${o.platform}. ${o.note||""}`;$("contentPlatform").value="Ambos";showView("content");toast("Oportunidade enviada ao Estúdio de conteúdo.");}));
    $("opportunitiesList").querySelectorAll("[data-delete-opportunity]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("Excluir esta oportunidade?"))return;const id=b.dataset.deleteOpportunity;state.opportunities=state.opportunities.filter(o=>o.id!==id);deleteCloudRecord("sge_opportunities",id).catch(err=>setCloudStatus("Erro ao excluir oportunidade na nuvem: "+safeError(err),true));save();}));
  }
  function renderSearchTerms(segment) {
    const results=$("discoveryResults");results.dataset.segmentId=segment.id;
    const terms=buildSearchTerms(segment);
    results.innerHTML=terms.map((term,i)=>`
      <div class="term-card"><div class="term-top"><span class="term-number">${String(i+1).padStart(2,"0")}</span><b>${esc(term)}</b></div>
        <div class="term-links"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(term)}" target="_blank" rel="noopener noreferrer">Pesquisar no YouTube ↗</a><a href="https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(term)}" target="_blank" rel="noopener noreferrer">Explorar no Instagram ↗</a></div>
        <button class="btn btn-secondary btn-block" type="button" data-save-opportunity="${i}">Salvar como oportunidade</button></div>`).join("");
    results.querySelectorAll("[data-save-opportunity]").forEach(b=>b.addEventListener("click",()=>{const term=terms[Number(b.dataset.saveOpportunity)];if(state.opportunities.some(o=>o.term===term&&o.segmentId===segment.id)){toast("Esta oportunidade já está salva para o segmento.");return;}state.opportunities.push({id:uid(),term,segmentId:segment.id,segmentName:segment.name,platform:"Ambos",source:"Pesquisa oficial aberta manualmente",note:"Revisar resultados e registrar o que foi observado.",createdAt:new Date().toISOString()});save();toast("Oportunidade salva. Revise os resultados e suas observações.");}));
  }
  $("segmentForm").addEventListener("submit",e=>{e.preventDefault();const segment={id:uid(),name:$("segmentName").value.trim(),audience:$("segmentAudience").value.trim(),language:$("segmentLanguage").value,region:$("segmentRegion").value.trim(),goal:$("segmentGoal").value,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};if(!segment.name)return;state.segments.push(segment);save();renderSearchTerms(segment);toast("Segmento salvo e pesquisas sugeridas.");});

  function renderCampaigns() {
    const select=$("campaignSegment"),selected=select.value;
    select.innerHTML='<option value="">Escolher segmento (opcional)</option>'+state.segments.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
    if(state.segments.some(s=>s.id===selected))select.value=selected;
    const list=$("campaignList");
    list.innerHTML=state.campaigns.length?state.campaigns.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).map(c=>`
      <article class="campaign-card"><div class="campaign-card-head"><div><b>${esc(c.name)}</b><p>${esc(c.platform)} · ${esc(c.strategyLabel)} · ${esc(c.goal)}</p></div><span class="status-tag ${c.status==="Concluída"?"published":c.status==="Em andamento"?"ready":""}">${esc(c.status||"Planejada")}</span></div>
      <div class="campaign-facts"><span>Orçamento: <b>R$ ${Number(c.budget||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</b></span><span>Meta: <b>${c.target?fmt(c.target):"Não definida"}</b></span></div>
      <p class="campaign-notes">${c.destination?`Destino: <a href="${esc(c.destination)}" target="_blank" rel="noopener noreferrer">abrir link ↗</a><br>`:""}${c.region?`Região: ${esc(c.region)} · `:""}${c.age?`Faixa etária: ${esc(c.age)}<br>`:""}${c.postUrl?`Publicação: <a href="${esc(c.postUrl)}" target="_blank" rel="noopener noreferrer">abrir post ↗</a><br>`:""}${c.audience?`${esc(c.audience)}<br>`:""}${esc(c.notes||"Sem observações registradas.")}</p>
      <div class="campaign-actions"><label>Status<select data-campaign-status="${esc(c.id)}"><option ${(c.status||"Planejada")==="Planejada"?"selected":""}>Planejada</option><option ${c.status==="Em andamento"?"selected":""}>Em andamento</option><option ${c.status==="Pausada"?"selected":""}>Pausada</option><option ${c.status==="Concluída"?"selected":""}>Concluída</option></select></label><button class="row-action" data-edit-campaign="${esc(c.id)}">Editar</button><button class="row-action" data-delete-campaign="${esc(c.id)}">Excluir</button></div></article>`).join(""):'<div class="list-empty">Nenhuma campanha criada.</div>';
    list.querySelectorAll("[data-campaign-status]").forEach(el=>el.addEventListener("change",()=>{const c=state.campaigns.find(x=>x.id===el.dataset.campaignStatus);if(c){c.status=el.value;c.updatedAt=new Date().toISOString();save();toast("Status da campanha atualizado.");}}));
    list.querySelectorAll("[data-edit-campaign]").forEach(b=>b.addEventListener("click",()=>{const c=state.campaigns.find(x=>x.id===b.dataset.editCampaign);if(!c)return;$("campaignName").value=c.name;$("campaignSegment").value=c.segmentId||"";$("campaignPlatform").value=c.platform;$("campaignStrategy").value=c.strategy;$("campaignGoal").value=c.goal;$("campaignStart").value=c.startDate||"";$("campaignEnd").value=c.endDate||"";$("campaignBudget").value=c.budget||0;$("campaignTarget").value=c.target||"";$("campaignDestination").value=c.destination||"";$("campaignRegion").value=c.region||"";$("campaignAge").value=c.age||"";$("campaignAudience").value=c.audience||"";$("campaignPostUrl").value=c.postUrl||"";$("campaignNotes").value=c.notes||"";$("campaignForm").dataset.editId=c.id;$("campaignForm").querySelector("button[type=submit]").textContent="Salvar alterações";showView("campaigns");}));
    list.querySelectorAll("[data-delete-campaign]").forEach(b=>b.addEventListener("click",()=>{if(!confirm("Excluir esta campanha?"))return;const id=b.dataset.deleteCampaign;state.campaigns=state.campaigns.filter(c=>c.id!==id);deleteCloudRecord("sge_campaigns",id).catch(err=>setCloudStatus("Erro ao excluir campanha na nuvem: "+safeError(err),true));save();toast("Campanha excluída.");}));
  }
  $("campaignForm").addEventListener("submit",e=>{
    e.preventDefault();
    const form=$("campaignForm"),existing=state.campaigns.find(c=>c.id===form.dataset.editId);
    const segment=state.segments.find(s=>s.id===$("campaignSegment").value);
    const strategy=$("campaignStrategy").value;
    const item={id:existing?.id||uid(),name:$("campaignName").value.trim(),segmentId:segment?.id||"",segmentName:segment?.name||"",platform:$("campaignPlatform").value,strategy,strategyLabel:strategy==="organic"?"Orgânica":strategy==="paid"?"Anúncios pagos":"Orgânica + anúncios",goal:$("campaignGoal").value,startDate:$("campaignStart").value,endDate:$("campaignEnd").value,budget:Number($("campaignBudget").value||0),target:Number($("campaignTarget").value||0),destination:$("campaignDestination").value.trim(),region:$("campaignRegion").value.trim(),age:$("campaignAge").value.trim(),audience:$("campaignAudience").value.trim(),postUrl:$("campaignPostUrl").value.trim(),notes:$("campaignNotes").value.trim(),status:existing?.status||"Planejada",approvalRequired:true,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(item.startDate&&item.endDate&&item.endDate<item.startDate){toast("A data final não pode ser anterior à inicial.");return;}
    if(existing)state.campaigns=state.campaigns.map(c=>c.id===existing.id?item:c);else state.campaigns.push(item);
    delete form.dataset.editId;form.reset();$("campaignBudget").value="0";form.querySelector("button[type=submit]").textContent="Salvar campanha";save();toast(existing?"Campanha atualizada.":"Campanha salva.");
  });
  function metricValues(){return state.metrics.reduce((a,m)=>{a.views+=m.views||0;a.reach+=m.reach||0;a.followers+=m.followers||0;a.likes+=m.likes||0;a.comments+=m.comments||0;a.shares+=m.shares||0;return a;},{views:0,reach:0,followers:0,likes:0,comments:0,shares:0});}
  function renderAnalytics(){
    const m=metricValues(),count=state.metrics.length,eng=(m.views?100*(m.likes+m.comments+m.shares)/m.views:0),avg=count?m.views/count:0;
    $("metricViews").textContent=fmt(m.views);$("metricReach").textContent=fmt(m.reach);$("metricFollowers").textContent=fmt(m.followers);$("metricPlanned").textContent=state.posts.filter(p=>p.status!=="Publicado").length;
    $("engagementRate").textContent=m.views?eng.toLocaleString("pt-BR",{maximumFractionDigits:2})+"%":"—";$("avgViews").textContent=count?fmt(Math.round(avg)):"—";$("metricCount").textContent=count;
    $("metricsList").innerHTML=count?state.metrics.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(m=>`<div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;justify-content:space-between;align-items:center"><div><b style="font-size:12px">${esc(m.title)}</b><div style="font-size:10px;color:var(--muted)">${esc(m.platform)} · ${m.date?new Date(m.date+"T12:00:00").toLocaleDateString("pt-BR"):"Sem data"} · ${fmt(m.views)} views</div></div><button class="row-action" data-metric-delete="${esc(m.id)}">Excluir</button></div>`).join(""):'<div class="list-empty">Ainda não há métricas cadastradas.</div>';
    $("metricsList").querySelectorAll("[data-metric-delete]").forEach(b=>b.addEventListener("click",()=>{if(confirm("Excluir este registro?")){const id=b.dataset.metricDelete;state.metrics=state.metrics.filter(x=>x.id!==id);save();deleteCloudRecord("sge_metrics",id).catch(err=>setCloudStatus("Erro ao excluir na nuvem: "+safeError(err),true));toast("Registro excluído.");}}));
  }
  function renderAll(){renderPlanner();renderAnalytics();renderDiscovery();renderCampaigns();}
  const metricDialog=$("metricDialog");
  $("addMetricBtn").onclick=()=>{ $("metricDate").value=new Date().toISOString().slice(0,10);metricDialog.showModal(); };
  $("closeMetric").onclick=$("cancelMetric").onclick=()=>metricDialog.close();
  $("metricForm").addEventListener("submit",e=>{e.preventDefault();const num=id=>Math.max(0,Number($(id).value)||0);
    state.metrics.push({id:uid(),title:$("metricTitle").value.trim(),platform:$("metricPlatform").value,date:$("metricDate").value,views:num("metricViewsInput"),reach:num("metricReachInput"),likes:num("metricLikes"),comments:num("metricComments"),shares:num("metricShares"),followers:num("metricFollowersInput"),retention:$("metricRetention").value===""?null:num("metricRetention")});
    save();metricDialog.close();$("metricForm").reset();toast("Métricas registradas.");
  });
  function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  $("exportBackup").onclick=()=>download("social-growth-backup.json",JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),...state},null,2),"application/json");
  $("importBackup").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.posts)||!Array.isArray(data.metrics))throw Error("Formato inválido");if(!confirm("Importar este backup substituirá os dados atuais deste navegador. Deseja continuar?"))return;state={posts:data.posts,metrics:data.metrics,segments:Array.isArray(data.segments)?data.segments:[],opportunities:Array.isArray(data.opportunities)?data.opportunities:[],campaigns:Array.isArray(data.campaigns)?data.campaigns:[]};save();toast("Backup importado.");}catch(err){toast("Arquivo inválido. Nenhum dado foi importado.");}finally{e.target.value="";}});
  $("clearData").onclick=()=>{if(confirm("Isso apagará os conteúdos e métricas salvos neste navegador. Exporte um backup antes. Continuar?")){state={posts:[],metrics:[],segments:[],opportunities:[],campaigns:[]};save();toast("Dados locais apagados.");}};
  $("exportCsv").onclick=()=>{if(!state.metrics.length){toast("Não há métricas para exportar.");return;}const cols=["title","platform","date","views","reach","likes","comments","shares","followers","retention"];const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const csv=[cols.join(";"),...state.metrics.map(m=>cols.map(k=>quote(m[k])).join(";"))].join("\r\n");download("social-growth-metricas.csv","\ufeff"+csv,"text/csv;charset=utf-8");};
  const META_ENDPOINT_STORE = "socialGrowthEngine.metaFunctionUrl.v1";
  const metaFunctionInput = $("metaFunctionUrl");
  const metaConnectButton = $("metaConnect");
  const metaStatus = $("metaStatus");
  if (metaFunctionInput && metaConnectButton && metaStatus) {
    metaFunctionInput.value = localStorage.getItem(META_ENDPOINT_STORE) || "https://rvgcniaowzmsudzliozf.supabase.co/functions/v1/meta-oauth";
    const callbackStatus = new URLSearchParams(window.location.search).get("meta");
    if (callbackStatus === "connected") {
      metaStatus.textContent = "Instagram conectado com sucesso. O token foi salvo criptografado no backend.";
      metaStatus.classList.remove("error");
      toast("Instagram conectado.");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("meta");
      window.history.replaceState({}, "", cleanUrl.toString());
    } else if (callbackStatus === "error") {
      metaStatus.textContent = "Não foi possível concluir a conexão. Confira as permissões, redirect URI e secrets da função.";
      metaStatus.classList.add("error");
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("meta");
      window.history.replaceState({}, "", cleanUrl.toString());
    }
    metaFunctionInput.addEventListener("change", () => {
      localStorage.setItem(META_ENDPOINT_STORE, metaFunctionInput.value.trim());
    });
    metaConnectButton.addEventListener("click", async () => {
      if (!supabaseClient) {
        metaStatus.textContent = "O cliente Supabase não carregou. Verifique a configuração da nuvem.";
        metaStatus.classList.add("error");
        return;
      }
      let endpoint;
      try {
        endpoint = new URL(metaFunctionInput.value.trim());
        if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/functions/v1/meta-oauth")) {
          throw new Error("Informe a URL HTTPS completa da função /functions/v1/meta-oauth.");
        }
      } catch (err) {
        metaStatus.textContent = safeError(err);
        metaStatus.classList.add("error");
        return;
      }
      localStorage.setItem(META_ENDPOINT_STORE, endpoint.toString().replace(/\/$/, ""));
      metaConnectButton.disabled = true;
      metaStatus.classList.remove("error");
      metaStatus.textContent = "Preparando conexão segura com a Meta…";
      try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.access_token) throw new Error("Entre na conta do Social Growth Engine antes de conectar o Instagram.");
        endpoint.searchParams.set("action", "start");
        const response = await fetch(endpoint.toString(), {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + session.access_token,
            "Content-Type": "application/json"
          },
          body: "{}"
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.authorization_url) {
          throw new Error(payload.error || "A função de conexão não respondeu corretamente. Verifique a implantação e os secrets.");
        }
        metaStatus.textContent = "Redirecionando para a autorização oficial do Instagram…";
        window.location.assign(payload.authorization_url);
      } catch (err) {
        metaStatus.textContent = safeError(err);
        metaStatus.classList.add("error");
      } finally {
        metaConnectButton.disabled = false;
      }
    });
  }
  // Instagram account library: browser calls only the authenticated Edge Function.
  const accountsStatus = $("instagramAccountsStatus");
  const accountsList = $("instagramAccountsList");
  const postsStatus = $("instagramPostsStatus");
  const postsGrid = $("instagramPostsGrid");
  const selectedAccountLabel = $("instagramSelectedAccount");
  let instagramAccounts = [];
  let selectedInstagramAccountId = "";
  function metaEndpointFor(action) {
    const saved = localStorage.getItem(META_ENDPOINT_STORE) || "";
    if (!saved) throw new Error("Configure a URL da função Meta em Configurações primeiro.");
    const endpoint = new URL(saved);
    if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/functions/v1/meta-oauth")) throw new Error("A URL da função Meta não parece válida.");
    endpoint.searchParams.set("action", action);
    return endpoint;
  }
  async function callMeta(action, extra = {}) {
    if (!supabaseClient) throw new Error("Configure o Supabase em Configurações primeiro.");
    const {data:{session},error} = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session?.access_token) throw new Error("Entre na sua conta do Social Growth Engine em Configurações.");
    const endpoint = metaEndpointFor(action);
    Object.entries(extra).forEach(([key,value])=>endpoint.searchParams.set(key,String(value)));
    const response = await fetch(endpoint.toString(), {headers:{Authorization:"Bearer "+session.access_token}});
    const payload = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(payload.error || "Falha ao consultar a API Meta.");
    return payload;
  }
  function renderInstagramAccounts() {
    if (!accountsList) return;
    if (!instagramAccounts.length) { accountsList.innerHTML = '<div class="list-empty">Nenhuma conta conectada foi encontrada. Use “Conectar conta” para autorizar uma conta profissional.</div>'; return; }
    accountsList.innerHTML = instagramAccounts.map(a => '<button type="button" class="instagram-account-card '+(a.instagram_user_id===selectedInstagramAccountId?"selected":"")+'" data-select-instagram-account="'+esc(a.instagram_user_id)+'"><span class="account-avatar">◎</span><span class="account-info"><b>@'+esc(a.instagram_username||"Instagram")+'</b><small>Conectada em '+(a.connected_at?new Date(a.connected_at).toLocaleDateString("pt-BR"):"data indisponível")+'</small></span><span class="account-select-mark">→</span></button>').join("");
    accountsList.querySelectorAll("[data-select-instagram-account]").forEach(b=>b.addEventListener("click",()=>loadInstagramPosts(b.dataset.selectInstagramAccount)));
  }
  async function loadInstagramAccounts() {
    if (!accountsStatus) return;
    accountsStatus.classList.remove("error"); accountsStatus.textContent = "Carregando contas autorizadas…";
    if (postsGrid) postsGrid.innerHTML = '<div class="list-empty">Selecione uma conta para carregar as publicações.</div>';
    try {
      const payload = await callMeta("accounts"); instagramAccounts = Array.isArray(payload.accounts)?payload.accounts:[];
      if (!instagramAccounts.some(a=>a.instagram_user_id===selectedInstagramAccountId)) selectedInstagramAccountId = instagramAccounts[0]?.instagram_user_id || "";
      renderInstagramAccounts(); accountsStatus.textContent = instagramAccounts.length ? instagramAccounts.length+" conta(s) autorizada(s)." : "Nenhuma conta conectada. Clique em “Conectar conta”.";
      if (selectedInstagramAccountId) await loadInstagramPosts(selectedInstagramAccountId);
    } catch(err) { accountsStatus.textContent = safeError(err); accountsStatus.classList.add("error"); renderInstagramAccounts(); }
  }
  async function loadInstagramPosts(accountId) {
    selectedInstagramAccountId = accountId;
    const account = instagramAccounts.find(a=>a.instagram_user_id===accountId);
    if (selectedAccountLabel) selectedAccountLabel.textContent = account ? "@"+(account.instagram_username||"Instagram") : "Conta selecionada";
    renderInstagramAccounts(); if (!postsStatus || !postsGrid) return;
    postsStatus.textContent = "Carregando publicações autorizadas…"; postsGrid.innerHTML = '<div class="list-empty">Consultando o Instagram…</div>';
    try {
      const payload = await callMeta("posts",{account_id:accountId}); const posts = Array.isArray(payload.posts)?payload.posts:[];
      postsStatus.textContent = posts.length+" publicação(ões) retornada(s) pela API.";
      postsGrid.innerHTML = posts.length ? posts.map(p=>{
        const image = p.thumbnail_url || p.media_url || ""; const safeImage = /^https?:\/\//i.test(image) ? esc(image) : "";
        const caption = String(p.caption||"").slice(0,220); const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "Data indisponível";
        return '<article class="instagram-post-card">'+(safeImage?'<img loading="lazy" src="'+safeImage+'" alt="Prévia da publicação" referrerpolicy="no-referrer">':'<div class="post-image-placeholder">◎</div>')+
          '<div class="instagram-post-body"><span class="pill">'+esc(p.media_type||"POST")+'</span><small>'+esc(date)+'</small><p>'+esc(caption||"Sem legenda")+(caption.length>=220?"…":"")+'</p><div class="post-stats"><span>♡ '+(p.like_count??"—")+'</span><span>◌ '+(p.comments_count??"—")+'</span></div><div class="button-row"><a class="btn btn-secondary" href="'+esc(p.permalink||"#")+'" target="_blank" rel="noopener noreferrer">Abrir post ↗</a><button class="btn btn-primary" type="button" data-use-post="'+esc(p.id)+'">Usar no tráfego</button></div></div></article>';
      }).join("") : '<div class="list-empty">A API não retornou publicações. Verifique permissões, tipo de conta e disponibilidade dos campos.</div>';
      postsGrid.querySelectorAll("[data-use-post]").forEach(b=>b.addEventListener("click",()=>{
        const post=posts.find(p=>String(p.id)===b.dataset.usePost); if(!post)return;
        $("campaignPostUrl").value=post.permalink||""; if(!$("campaignName").value.trim()) $("campaignName").value="Tráfego · "+(account?.instagram_username||"Instagram");
        $("campaignPlatform").value="Instagram"; showView("campaigns"); toast("Publicação selecionada para o plano de tráfego. Revise público, link e orçamento.");
      }));
    } catch(err) { postsStatus.textContent = safeError(err); postsGrid.innerHTML = '<div class="list-empty">Não foi possível carregar as publicações.</div>'; }
  }
  if ($("refreshInstagramAccounts")) $("refreshInstagramAccounts").addEventListener("click",loadInstagramAccounts);
  if ($("connectInstagramFromAccounts")) $("connectInstagramFromAccounts").addEventListener("click",()=>showView("settings"));
  if (accountsStatus) { const callback = new URLSearchParams(window.location.search).get("meta"); if(callback==="connected"||callback==="error"){showView("accounts");if(callback==="connected")loadInstagramAccounts();} }
  // Meta Marketing API: connect an ad account, create paused scaffolding only.
  const META_ADS_URL_KEY = "socialGrowthEngine.metaAdsFunctionUrl.v1";
  const META_ADS_ACCOUNT_KEY = "socialGrowthEngine.metaAdsAccountId.v1";
  const metaAdsUrlInput = $("metaAdsFunctionUrl");
  const metaAdsConnect = $("metaAdsConnect");
  const metaAdsRefresh = $("metaAdsRefresh");
  const metaAdsStatus = $("metaAdsStatus");
  const metaAdsAccount = $("metaAdsAccount");
  const metaAdsCreatePaused = $("metaAdsCreatePaused");
  const metaAdsJobs = $("metaAdsJobs");

  function metaAdsEndpoint(action) {
    const raw = (metaAdsUrlInput?.value || localStorage.getItem(META_ADS_URL_KEY) || "").trim();
    const endpoint = new URL(raw);
    if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/functions/v1/meta-ads")) {
      throw new Error("Informe a URL HTTPS completa da função /functions/v1/meta-ads.");
    }
    endpoint.searchParams.set("action", action);
    return endpoint;
  }
  async function metaAdsRequest(action, method = "GET", body = null) {
    if (!supabaseClient) throw new Error("Configure o Supabase em Configurações.");
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session?.access_token) throw new Error("Entre na sua conta do Social Growth Engine em Configurações.");
    const endpoint = metaAdsEndpoint(action);
    const options = { method, headers: { Authorization: "Bearer " + session.access_token } };
    if (body !== null) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(endpoint.toString(), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Falha na integração Meta Ads.");
    return payload;
  }
  function setMetaAdsStatus(message, isError = false) {
    if (!metaAdsStatus) return;
    metaAdsStatus.textContent = message;
    metaAdsStatus.classList.toggle("error", isError);
  }
  function renderMetaAdsJobs(jobs) {
    if (!metaAdsJobs) return;
    if (!jobs?.length) {
      metaAdsJobs.innerHTML = '<div class="list-empty">Nenhuma estrutura de campanha registrada pela API.</div>';
      return;
    }
    metaAdsJobs.innerHTML = jobs.map(job => {
      const status = job.review_status === "created_paused" ? "Criada pausada" :
        job.review_status === "failed" ? "Falha parcial/total" :
        job.review_status === "active" ? "Ativa" : job.review_status;
      return '<article class="campaign-card"><div class="campaign-card-head"><div><b>' + esc(job.campaign_name) + '</b><p>Conta act_' + esc(job.ad_account_id) + ' · ' + esc(job.objective) + '</p></div><span class="status-tag">' + esc(status) + '</span></div>' +
        '<div class="campaign-facts"><span>Orçamento vitalício: <b>R$ ' + Number(job.budget_amount || 0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) + '</b></span><span>Datas: <b>' + esc(job.start_date) + ' → ' + esc(job.end_date) + '</b></span></div>' +
        '<p class="campaign-notes">ID campanha: ' + esc(job.campaign_id || "não confirmado") + '<br>ID conjunto: ' + esc(job.adset_id || "não confirmado") + '<br>Estado seguro: nenhum anúncio/criativo criado por este fluxo.</p></article>';
    }).join("");
  }
  async function loadMetaAdsAccounts() {
    if (!metaAdsAccount) return;
    setMetaAdsStatus("Consultando as contas de anúncios autorizadas…");
    try {
      localStorage.setItem(META_ADS_URL_KEY, metaAdsUrlInput.value.trim());
      const payload = await metaAdsRequest("accounts");
      const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
      const saved = localStorage.getItem(META_ADS_ACCOUNT_KEY) || "";
      metaAdsAccount.innerHTML = '<option value="">Selecione uma conta de anúncios</option>' + accounts.map(a => {
        const label = (a.ad_account_name || "Conta Meta") + " · act_" + a.ad_account_id + " · " + (a.currency || "?") + (Number(a.account_status) === 1 ? " · ativa" : " · status " + a.account_status);
        return '<option value="' + esc(a.ad_account_id) + '" data-currency="' + esc(a.currency || "") + '" data-status="' + esc(a.account_status) + '">' + esc(label) + '</option>';
      }).join("");
      if (accounts.some(a => a.ad_account_id === saved)) metaAdsAccount.value = saved;
      setMetaAdsStatus(accounts.length ? accounts.length + " conta(s) de anúncios encontradas. Selecione a conta correta." : "Nenhuma conta de anúncios acessível. Confira se o perfil tem acesso no Gerenciador de Anúncios e se a Meta concedeu as permissões.");
      if (!accounts.length) metaAdsAccount.innerHTML = '<option value="">Nenhuma conta de anúncios acessível</option>';
      const jobs = await metaAdsRequest("jobs");
      renderMetaAdsJobs(jobs.jobs || []);
    } catch (err) {
      setMetaAdsStatus(safeError(err), true);
    }
  }
  if (metaAdsUrlInput && metaAdsConnect && metaAdsRefresh && metaAdsStatus && metaAdsAccount && metaAdsCreatePaused) {
    metaAdsUrlInput.value = localStorage.getItem(META_ADS_URL_KEY) || "https://rvgcniaowzmsudzliozf.supabase.co/functions/v1/meta-ads";
    metaAdsAccount.addEventListener("change", () => localStorage.setItem(META_ADS_ACCOUNT_KEY, metaAdsAccount.value));
    metaAdsUrlInput.addEventListener("change", () => localStorage.setItem(META_ADS_URL_KEY, metaAdsUrlInput.value.trim()));
    metaAdsConnect.addEventListener("click", async () => {
      try {
        localStorage.setItem(META_ADS_URL_KEY, metaAdsUrlInput.value.trim());
        setMetaAdsStatus("Iniciando autorização oficial da Meta…");
        metaAdsConnect.disabled = true;
        const payload = await metaAdsRequest("start", "POST", {});
        if (!payload.authorization_url) throw new Error("A Meta não retornou o endereço de autorização.");
        window.location.assign(payload.authorization_url);
      } catch (err) {
        setMetaAdsStatus(safeError(err), true);
        metaAdsConnect.disabled = false;
      }
    });
    metaAdsRefresh.addEventListener("click", loadMetaAdsAccounts);
    metaAdsCreatePaused.addEventListener("click", async () => {
      try {
        if (!metaAdsAccount.value) throw new Error("Conecte e selecione uma conta de anúncios.");
        const name = $("campaignName").value.trim();
        const destination = $("campaignDestination").value.trim();
        const budget = Number($("campaignBudget").value || 0);
        const startDate = $("campaignStart").value;
        const endDate = $("campaignEnd").value;
        const ageRange = $("campaignAge").value.trim();
        if (!name) throw new Error("Preencha o nome da campanha no formulário à esquerda.");
        if (!/^https:\/\//i.test(destination)) throw new Error("Informe um link HTTPS no campo de destino.");
        if (!Number.isFinite(budget) || budget < 20 || budget > 10000) throw new Error("Nesta primeira versão, o orçamento total deve ficar entre R$ 20 e R$ 10.000.");
        if (!startDate || !endDate) throw new Error("Defina data inicial e final futuras no formulário.");
        if (endDate < startDate) throw new Error("A data final não pode ser anterior à inicial.");
        const typed = prompt('ATENÇÃO: será criada uma campanha e um conjunto de anúncios PAUSADOS. Nenhum anúncio será criado nem ativado. Orçamento total: R$ ' + budget.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}) + '.\n\nPara confirmar a criação pausada, digite exatamente: CRIAR CAMPANHA PAUSADA');
        if (typed !== "CRIAR CAMPANHA PAUSADA") { setMetaAdsStatus("Criação cancelada. Nenhuma solicitação foi enviada à Meta."); return; }
        metaAdsCreatePaused.disabled = true;
        setMetaAdsStatus("Enviando solicitação confirmada à API oficial da Meta…");
        const payload = await metaAdsRequest("create-paused", "POST", {
          confirm: typed,
          ad_account_id: metaAdsAccount.value,
          name,
          objective: "OUTCOME_TRAFFIC",
          destination_url: destination,
          budget_total_brl: budget,
          start_date: startDate,
          end_date: endDate,
          age_range: ageRange,
          region: $("campaignRegion").value.trim(),
          audience: $("campaignAudience").value.trim(),
          notes: $("campaignNotes").value.trim()
        });
        setMetaAdsStatus("Estrutura criada em PAUSED. ID da campanha: " + payload.campaign_id + ". Nenhum anúncio foi criado ou ativado.");
        toast("Estrutura de campanha criada pausada na Meta.");
        await loadMetaAdsAccounts();
      } catch (err) {
        setMetaAdsStatus(safeError(err), true);
      } finally {
        metaAdsCreatePaused.disabled = false;
      }
    });
    const callback = new URLSearchParams(window.location.search).get("meta_ads");
    if (callback) {
      showView("campaigns");
      if (callback === "connected") {
        setMetaAdsStatus("Conta(s) de anúncios conectada(s) à plataforma. Clique em Atualizar contas para conferir.");
        loadMetaAdsAccounts();
      } else if (callback === "no_accounts") {
        setMetaAdsStatus("A autorização foi concluída, mas a Meta não retornou contas de anúncios acessíveis.", true);
      } else {
        setMetaAdsStatus("Não foi possível concluir a autorização. Confira o redirect URI, os secrets e as permissões ads_read / ads_management.", true);
      }
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("meta_ads");
      window.history.replaceState({}, "", cleanUrl.toString());
    }
  }


  const TRACKING_FUNCTION_URL = SUPABASE_URL + "/functions/v1/sge-tracking";
  let trackingWorkspace = null;
  function trackingStatus(message, isError=false) {
    const el = $("trackingStatus");
    if (el) { el.textContent = message; el.classList.toggle("error", isError); }
  }
  async function trackingRequest(action, method="GET", body=null) {
    if (!supabaseClient) throw new Error("A conexão Supabase não está configurada.");
    const { data } = await supabaseClient.auth.getSession();
    const headers = { "apikey": SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
    if (data.session?.access_token) headers.Authorization = "Bearer " + data.session.access_token;
    const response = await fetch(TRACKING_FUNCTION_URL + "?action=" + encodeURIComponent(action), {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a solicitação.");
    return payload;
  }
  function trackingPixelSnippet(publicKey) {
    const endpoint = TRACKING_FUNCTION_URL + "?action=track";
    return `<script>
(()=> {
  const endpoint = ${JSON.stringify(endpoint)};
  const publicKey = ${JSON.stringify(publicKey)};
  const apiKey = ${JSON.stringify(SUPABASE_PUBLISHABLE_KEY)};
  const event = (eventType) => {
    try {
      let visitorId = localStorage.getItem("sge_tracking_visitor");
      if (!visitorId) {
        visitorId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
        localStorage.setItem("sge_tracking_visitor", visitorId);
      }
      const q = new URLSearchParams(location.search);
      const payload = {public_key:publicKey,event_type:eventType,visitor_id:visitorId,page_path:location.pathname,referrer:document.referrer,source:q.get("utm_source"),medium:q.get("utm_medium"),campaign:q.get("utm_campaign"),content:q.get("utm_content"),term:q.get("utm_term")};
      fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","apikey":apiKey},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
    } catch (_) {}
  };
  event("page_view");
  if (document.querySelector("[data-sge-product]")) event("product_view");
  document.addEventListener("click",(e)=>{if(e.target.closest("[data-sge-cta]"))event("cta_click");if(e.target.closest("[data-sge-lead]"))event("lead_click");},{passive:true});
})();
<\/script>`;
  }
  async function loadTrackingWorkspace() {
    if (!currentUser) { trackingStatus("Entre na sua conta na seção Configurações para ativar o rastreamento."); return; }
    trackingStatus("Configurando seu espaço de rastreamento…");
    try {
      const data = await trackingRequest("setup","POST",{});
      trackingWorkspace = data.workspace;
      localStorage.setItem("sgeTrackingPublicKey",trackingWorkspace.public_key);
      $("trackingPixelCode").value = trackingPixelSnippet(trackingWorkspace.public_key);
      trackingStatus("Rastreamento pronto. Crie links rastreáveis ou instale o pixel na página de vendas.");
      await loadTrackingSummary();
    } catch (err) { trackingStatus(safeError(err),true); }
  }
  async function loadTrackingSummary() {
    if (!currentUser) return;
    try {
      const data = await trackingRequest("summary");
      const c = data.counts || {};
      $("trackPageViews").textContent = fmt(c.page_view || 0);
      $("trackProductViews").textContent = fmt(c.product_view || 0);
      $("trackCtaClicks").textContent = fmt(c.cta_click || 0) + (c.lead_click ? " · leads " + fmt(c.lead_click) : "");
      $("trackOutboundClicks").textContent = fmt(c.outbound_click || 0);
      const links = data.links || [];
      $("trackingLinksList").innerHTML = links.length ? links.map(link => {
        const url = TRACKING_FUNCTION_URL + "?action=go&code=" + encodeURIComponent(link.code);
        return `<article class="tracking-link-card"><div class="tracking-link-title"><div><b>${esc(link.label)}</b><small>${esc(link.source)} · ${esc(link.medium)} · ${esc(link.campaign)}</small></div><strong>${fmt(link.clicks_30d || 0)} cliques</strong></div><div class="tracking-link-destination">${esc(link.destination_url)}</div><div class="tracking-link-actions"><input aria-label="Link rastreável" readonly value="${esc(url)}"><button class="btn btn-secondary" type="button" data-copy-tracking="${esc(url)}">Copiar link</button></div></article>`;
      }).join("") : '<div class="list-empty">Ainda não há links. Crie o primeiro acima.</div>';
      $("trackingLinksList").querySelectorAll("[data-copy-tracking]").forEach(button => button.addEventListener("click",async()=>{
        try { await navigator.clipboard.writeText(button.dataset.copyTracking); toast("Link rastreável copiado."); }
        catch { toast("Não foi possível copiar automaticamente; selecione o link e copie."); }
      }));
    } catch (err) { trackingStatus(safeError(err),true); }
  }
  function initTrackingUI() {
    $("trackingEnable").addEventListener("click",loadTrackingWorkspace);
    $("trackingRefresh").addEventListener("click",loadTrackingSummary);
    $("trackingCopyPixel").addEventListener("click",async()=>{
      const code=$("trackingPixelCode").value;
      if(!code){toast("Ative o rastreamento primeiro.");return;}
      try{await navigator.clipboard.writeText(code);toast("Código do pixel copiado.");}
      catch{$("trackingPixelCode").focus();$("trackingPixelCode").select();toast("Código selecionado. Use Ctrl+C para copiar.");}
    });
    $("trackingLinkForm").addEventListener("submit",async e=>{
      e.preventDefault();
      if(!currentUser){trackingStatus("Entre na sua conta em Configurações antes de criar links.",true);return;}
      const button=$("trackingLinkForm").querySelector('button[type="submit"]');button.disabled=true;
      try{
        const data=await trackingRequest("create-link","POST",{label:$("trackingLabel").value.trim(),destination_url:$("trackingDestination").value.trim(),source:$("trackingSource").value,medium:$("trackingMedium").value,campaign:$("trackingCampaign").value.trim()||"fluent-immersion-kits"});
        $("trackingLinkForm").reset();$("trackingCampaign").value="fluent-immersion-kits";
        trackingStatus("Link rastreável criado. Copie-o e use-o na divulgação.");toast("Link rastreável criado.");
        await loadTrackingSummary();
        if(data.tracking_url&&navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(data.tracking_url);toast("Link criado e copiado para a área de transferência.");}catch{}}
      }catch(err){trackingStatus(safeError(err),true);}finally{button.disabled=false;}
    });
  }

  initTrackingUI();
  renderAll();