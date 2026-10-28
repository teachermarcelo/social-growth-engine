/* Social Growth Engine — ferramentas locais complementares.
   Não publica, não chama APIs externas e não ativa anúncios. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const addStyle = () => {
    if ($("growthToolsStyle")) return;
    const style = document.createElement("style");
    style.id = "growthToolsStyle";
    style.textContent = `
      .gt-panel{border:1px solid var(--line);border-radius:13px;background:var(--surface);padding:17px;margin-top:14px}
      .gt-panel h3{margin:0 0 5px;font-size:14px}.gt-muted{color:var(--muted);font-size:11px;line-height:1.6}
      .gt-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:13px 0}
      .gt-check{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:10px;font-size:11px}
      .gt-check i{font-style:normal;font-weight:900;color:#a0a5b4}.gt-check.ok i{color:var(--green)}
      .gt-banner{background:#fff6e8;color:#7a5318;border-radius:9px;padding:11px;font-size:11px;line-height:1.6}
      .gt-kit{display:grid;gap:10px;margin-top:12px}.gt-kit-block{border:1px solid var(--line);border-radius:10px;padding:12px}
      .gt-kit-block h4{font-size:11px;margin:0 0 7px;color:var(--primary)}.gt-kit-block p,.gt-kit-block pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:0;line-height:1.65;font-family:inherit}
      .gt-kit-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px}
      .gt-kit-head button{border:0;border-radius:7px;background:#eeecff;color:#6252d8;padding:6px 9px;font-size:10px;font-weight:750}
      .gt-btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .gt-status{font-size:12px;font-weight:750;margin-top:9px}.gt-status.good{color:var(--green)}.gt-status.warn{color:#a36a12}
      @media(max-width:760px){.gt-checks{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  };
  const notify = message => {
    const toast = $("toast");
    if (toast) { toast.textContent = message; toast.classList.add("show"); }
  };
  const copyText = async text => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard indisponível");
      await navigator.clipboard.writeText(text);
      notify("Texto copiado.");
    } catch {
      const area = document.createElement("textarea");
      area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      const copied = document.execCommand("copy"); area.remove();
      notify(copied ? "Texto copiado." : "Não foi possível copiar automaticamente; selecione o texto.");
    }
  };

  function installContentKit() {
    const form = $("contentForm"), anchor = $("ideaSuggestions");
    if (!form || !anchor || $("growthContentKit")) return;
    const panel = document.createElement("section");
    panel.id = "growthContentKit";
    panel.className = "gt-panel";
    panel.innerHTML = `
      <h3>Complete Content Kit</h3>
      <p class="gt-muted">Gera um primeiro rascunho editável a partir dos campos preenchidos. Revise fatos, promessas, tom de voz e adequação ao público antes de publicar.</p>
      <div class="gt-btn-row"><button class="btn btn-primary" type="button" id="gtGenerateKit">Gerar kit completo</button></div>
      <div id="gtKitOutput" class="gt-kit" aria-live="polite"><p class="gt-muted">Preencha o tema, o público e o objetivo; depois gere o kit.</p></div>`;
    anchor.insertAdjacentElement("afterend", panel);
    $("gtGenerateKit").addEventListener("click", generateKit);
  }

  function generateKit() {
    const topic = $("contentTitle")?.value.trim();
    if (!topic) { notify("Digite o tema antes de gerar o kit."); $("contentTitle")?.focus(); return; }
    const platform = $("contentPlatform")?.value || "Instagram";
    const format = $("contentFormat")?.value || "Reels / Shorts";
    const audience = $("contentAudience")?.value.trim() || "pessoas interessadas no tema";
    const goal = $("contentGoal")?.value || "Gerar compartilhamentos";
    const topicLower = topic.charAt(0).toLowerCase() + topic.slice(1);
    const cta = goal === "Gerar comentários" ? "Qual é a sua maior dúvida sobre esse tema? Conte nos comentários."
      : goal === "Atrair seguidores" ? "Siga o perfil para acompanhar mais conteúdos práticos sobre esse tema."
      : goal === "Levar tráfego" ? "Acesse o link do perfil para conhecer o material complementar."
      : goal === "Reter atenção" ? "Salve este conteúdo para consultar novamente e acompanhe o exemplo até o final."
      : "Compartilhe com alguém que pode aproveitar esta explicação.";
    const hook = "Você quer entender " + topicLower + " sem complicar? Comece por este ponto.";
    const caption = hook + "\n\nNeste conteúdo, vamos organizar a ideia em passos simples, mostrar um exemplo e destacar um erro comum para evitar. Use esta explicação como ponto de partida e adapte os exemplos à sua realidade.\n\n" + cta;
    const tags = topic.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(Boolean).slice(0,3);
    const hashtags = [...new Set(["#"+tags.join(""), "#DicasPraticas", "#Aprendizado", platform === "YouTube" ? "#YouTubeShorts" : "#ConteudoDigital"])].join(" ");
    const script = [
      "0–3s · GANCHO: " + hook,
      "3–8s · CONTEXTO: explique por que " + topicLower + " importa para " + audience + ".",
      "8–22s · VALOR: apresente 2 ou 3 pontos claros e um exemplo real que você possa confirmar.",
      "22–27s · RESUMO: repita a ideia principal em uma frase.",
      "27–30s · CTA: " + cta
    ].join("\n");
    const slides = [
      "1. Capa: " + topic + " — guia prático",
      "2. O problema: qual dúvida ou dificuldade o público encontra?",
      "3. Ponto-chave 1: explique em uma frase e dê um exemplo.",
      "4. Ponto-chave 2: mostre uma aplicação prática.",
      "5. Erro comum: explique o que evitar e por quê.",
      "6. Resumo + CTA: " + cta
    ].join("\n");
    const outline = [
      "ABERTURA — " + hook,
      "PONTO 1 — definição simples de " + topicLower + ".",
      "PONTO 2 — exemplo adequado para " + audience + ".",
      "PONTO 3 — erro comum, nuance ou exceção a mencionar.",
      "ENCERRAMENTO — resumo e convite: " + cta
    ].join("\n");
    const blocks = [
      ["Gancho",hook],["Legenda sugerida",caption],["Roteiro curto (Reels/Shorts)",script],
      ["Estrutura de carrossel (6 telas)",slides],["Estrutura de vídeo ou post",outline],["Hashtags iniciais",hashtags]
    ];
    const output = $("gtKitOutput");
    output.innerHTML = blocks.map((item,index)=>`
      <div class="gt-kit-block"><div class="gt-kit-head"><h4>${esc(item[0])}</h4><button type="button" data-gt-copy="${index}">Copiar</button></div><pre>${esc(item[1])}</pre></div>`).join("")
      + '<div class="gt-btn-row"><button class="btn btn-secondary" type="button" id="gtUseKit">Usar kit no rascunho</button></div>'
      + '<p class="gt-muted">Modelo inicial criado sem IA externa. Verifique afirmações, hashtags, direitos autorais e regras da plataforma.</p>';
    output.querySelectorAll("[data-gt-copy]").forEach(button => button.addEventListener("click", () => copyText(blocks[Number(button.dataset.gtCopy)][1])));
    $("gtUseKit").addEventListener("click", () => {
      const context = $("contentAudience");
      const existing = context.value.trim();
      const kitText = blocks.map(([title,body]) => title.toUpperCase() + "\n" + body).join("\n\n");
      context.value = (existing ? existing + "\n\n" : "") + "COMPLETE CONTENT KIT\n" + kitText;
      context.focus();
      notify("Kit inserido no campo de contexto. Salve o rascunho para mantê-lo no planejamento.");
    });
  }

  function installCampaignChecklist() {
    const form = $("campaignForm");
    if (!form || $("growthCampaignChecklist")) return;
    const panel = document.createElement("section");
    panel.id = "growthCampaignChecklist";
    panel.className = "gt-panel";
    panel.innerHTML = `
      <h3>Pré-verificação da campanha</h3>
      <p class="gt-muted">A checklist ajuda a encontrar informações faltantes antes da revisão humana. Ela não envia anúncios para a Meta.</p>
      <div id="gtCampaignChecks" class="gt-checks"></div>
      <div id="gtCampaignStatus" class="gt-status warn" role="status">Preencha os campos para verificar a preparação.</div>
      <div class="gt-banner">Segurança: esta versão não cria nem ativa anúncios. Orçamento, segmentação e links são apenas um plano salvo. A publicação de campanhas exigirá integração oficial, permissões e confirmação explícita.</div>`;
    const submitButton = form.querySelector("button[type=submit]");
    if (submitButton) form.insertBefore(panel, submitButton); else form.appendChild(panel);
    const ids = ["campaignName","campaignStrategy","campaignBudget","campaignDestination","campaignRegion","campaignAge","campaignAudience","campaignStart","campaignEnd","campaignPostUrl"];
    ids.forEach(id => $(id)?.addEventListener("input", refreshCampaignChecklist));
    ids.forEach(id => $(id)?.addEventListener("change", refreshCampaignChecklist));
    refreshCampaignChecklist();
  }

  function refreshCampaignChecklist() {
    const checks = $("gtCampaignChecks"), status = $("gtCampaignStatus");
    if (!checks || !status) return;
    const value = id => $(id)?.value?.trim() || "";
    const paid = ["paid","both"].includes(value("campaignStrategy"));
    const start = value("campaignStart"), end = value("campaignEnd");
    const budgetOk = !paid || (value("campaignBudget") !== "" && Number(value("campaignBudget")) > 0);
    const dateOk = !start || !end || end >= start;
    const urlOk = !value("campaignDestination") || /^https?:\/\//i.test(value("campaignDestination"));
    const list = [
      ["Nome e objetivo definidos",Boolean(value("campaignName") && value("campaignGoal"))],
      ["Público descrito",Boolean(value("campaignAudience"))],
      ["Região definida",Boolean(value("campaignRegion"))],
      ["Faixa etária revisada",Boolean(value("campaignAge"))],
      ["Orçamento definido para campanha paga",budgetOk],
      ["Link de destino válido (se usado)",urlOk],
      ["Datas coerentes",dateOk],
      ["Publicação vinculada (recomendado)",Boolean(value("campaignPostUrl"))]
    ];
    checks.innerHTML = list.map(([label,ok])=>'<div class="gt-check '+(ok?"ok":"")+'"><i>'+(ok?"✓":"○")+'</i><span>'+esc(label)+'</span></div>').join("");
    const required = list.slice(0,4).every(x=>x[1]) && budgetOk && dateOk && urlOk;
    status.className = "gt-status " + (required ? "good" : "warn");
    status.textContent = required
      ? "Informações básicas preenchidas — campanha pronta para revisão humana, não para ativação automática."
      : "Ainda faltam informações para uma revisão consistente. Complete os itens acima.";
  }

  function init() {
    addStyle();
    installContentKit();
    installCampaignChecklist();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();