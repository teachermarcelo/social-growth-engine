import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const GRAPH_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";
const CONFIRM_PHRASE = "CRIAR CAMPANHA PAUSADA";
const MAX_LIFETIME_BUDGET_BRL = 10000;

function json(body: unknown, status = 200, origin = "*") {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, "Access-Control-Allow-Origin": origin } });
}
function redirect(url: URL) { return Response.redirect(url.toString(), 302); }
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}
function appRedirect(result: string) {
  const base = new URL(required("APP_BASE_URL"));
  base.searchParams.set("meta_ads", result);
  return redirect(base);
}
function adminClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64Url(bytes: Uint8Array) {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function encryptToken(token: string) {
  const raw = Uint8Array.from(atob(required("META_TOKEN_ENCRYPTION_KEY")), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { ciphertext: base64(new Uint8Array(encrypted)), iv: base64(iv) };
}
async function decryptToken(ciphertext: string, ivText: string) {
  const raw = Uint8Array.from(atob(required("META_TOKEN_ENCRYPTION_KEY")), c => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivText), c => c.charCodeAt(0));
  const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes));
}
async function authenticatedUser(req: Request) {
  const bearer = req.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return null;
  const auth = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await auth.auth.getUser(token);
  return error || !user ? null : user;
}
async function graphGet(path: string, token: string) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Meta Graph API request failed");
  return payload;
}
async function graphPost(path: string, token: string, values: Record<string, string>) {
  const body = new URLSearchParams({ ...values, access_token: token });
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.error_user_msg || payload?.error?.message || "Meta rejected the request");
  }
  return payload;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T12:00:00Z"));
}
function parseAgeRange(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { min: 18, max: 65 };
  const match = text.match(/^(\d{1,2})\s*[–-]\s*(\d{1,2})$/);
  if (!match) throw new Error("Informe a faixa etária no formato 18-44, ou deixe em branco para usar 18-65+.");
  const min = Number(match[1]), max = Number(match[2]);
  if (min < 18 || max > 65 || min > max) throw new Error("Para esta primeira versão, use uma faixa entre 18 e 65 anos.");
  return { min, max };
}
function isoDate(value: string, end = false) {
  return new Date(`${value}T${end ? "23:59:00" : "00:00:00"}-03:00`).toISOString();
}

Deno.serve(async (req: Request) => {
  const appBase = Deno.env.get("APP_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = appBase ? new URL(appBase).origin : "";
  const corsOrigin = origin && origin === allowedOrigin ? origin : allowedOrigin || "null";
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...HEADERS, "Access-Control-Allow-Origin": corsOrigin } });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const db = adminClient();

  if (action === "callback" && req.method === "GET") {
    if (url.searchParams.has("error")) return appRedirect("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return appRedirect("error");
    const now = new Date().toISOString();
    const { data: stateRow, error: stateError } = await db.from("sge_meta_ads_oauth_states")
      .update({ used_at: now }).eq("state", state).is("used_at", null).gt("expires_at", now)
      .select("user_id").maybeSingle();
    if (stateError || !stateRow?.user_id) return appRedirect("error");

    const appId = required("META_APP_ID");
    const appSecret = required("META_APP_SECRET");
    const redirectUri = required("META_ADS_REDIRECT_URI");
    const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const shortResponse = await fetch(tokenUrl);
    const shortToken = await shortResponse.json().catch(() => ({}));
    if (!shortResponse.ok || !shortToken.access_token) return appRedirect("error");

    const longUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", appId);
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);
    const longResponse = await fetch(longUrl);
    const longPayload = await longResponse.json().catch(() => ({}));
    const token = longResponse.ok ? (longPayload.access_token || shortToken.access_token) : shortToken.access_token;
    const expiresIn = Number(longPayload.expires_in || shortToken.expires_in || 0);

    try {
      const me = await graphGet("me?fields=id,name", token);
      const accounts = await graphGet("me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=100", token);
      const rows = Array.isArray(accounts.data) ? accounts.data : [];
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
      for (const account of rows) {
        if (!account.id) continue;
        const encrypted = await encryptToken(token);
        const { error } = await db.from("sge_meta_ads_connections").upsert({
          user_id: stateRow.user_id,
          meta_user_id: String(me.id || ""),
          ad_account_id: String(account.id).replace(/^act_/, ""),
          ad_account_name: String(account.name || account.id),
          account_status: Number(account.account_status || 0),
          currency: String(account.currency || "BRL"),
          timezone_name: String(account.timezone_name || ""),
          access_token_ciphertext: encrypted.ciphertext,
          access_token_iv: encrypted.iv,
          token_expires_at: expiresAt,
          scopes: ["ads_read", "ads_management"],
          connected_at: now,
          updated_at: now,
        }, { onConflict: "user_id,ad_account_id" });
        if (error) return appRedirect("error");
      }
      return appRedirect(rows.length ? "connected" : "no_accounts");
    } catch {
      return appRedirect("error");
    }
  }

  if (origin && origin !== allowedOrigin) return json({ error: "Origin not allowed" }, 403, corsOrigin);
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Entre no Social Growth Engine antes de continuar." }, 401, corsOrigin);

  if (action === "start" && req.method === "POST") {
    const appId = required("META_APP_ID");
    const redirectUri = required("META_ADS_REDIRECT_URI");
    const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await db.from("sge_meta_ads_oauth_states").insert({ state, user_id: user.id, expires_at: expiresAt });
    if (error) return json({ error: "Não foi possível iniciar a autorização segura." }, 500, corsOrigin);
    const authorize = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    authorize.searchParams.set("client_id", appId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", "ads_read,ads_management");
    authorize.searchParams.set("auth_type", "rerequest");
    return json({ authorization_url: authorize.toString() }, 200, corsOrigin);
  }

  if (action === "accounts" && req.method === "GET") {
    const { data, error } = await db.from("sge_meta_ads_connections")
      .select("ad_account_id,ad_account_name,account_status,currency,timezone_name,connected_at,token_expires_at")
      .eq("user_id", user.id).order("connected_at", { ascending: false });
    if (error) return json({ error: "Não foi possível listar as contas de anúncios." }, 500, corsOrigin);
    return json({ accounts: data || [] }, 200, corsOrigin);
  }

  if (action === "create-paused" && req.method === "POST") {
    let input: Record<string, unknown>;
    try { input = await req.json(); } catch { return json({ error: "Corpo JSON inválido." }, 400, corsOrigin); }
    if (input.confirm !== CONFIRM_PHRASE) return json({ error: "Confirmação explícita ausente. Digite a frase de confirmação no painel." }, 400, corsOrigin);
    const accountId = String(input.ad_account_id || "").replace(/^act_/, "");
    const name = String(input.name || "").trim().slice(0, 120);
    const destination = String(input.destination_url || "").trim();
    const budget = Number(input.budget_total_brl);
    const startDate = input.start_date;
    const endDate = input.end_date;
    const age = parseAgeRange(input.age_range);
    if (!accountId || !/^\d+$/.test(accountId)) return json({ error: "Selecione uma conta de anúncios válida." }, 400, corsOrigin);
    if (!name) return json({ error: "Informe o nome da campanha." }, 400, corsOrigin);
    if (!destination || !/^https:\/\//i.test(destination)) return json({ error: "Informe um link HTTPS válido para o destino." }, 400, corsOrigin);
    if (!Number.isFinite(budget) || budget < 20 || budget > MAX_LIFETIME_BUDGET_BRL) return json({ error: `O orçamento total deve estar entre R$ 20 e R$ ${MAX_LIFETIME_BUDGET_BRL.toLocaleString("pt-BR")} nesta primeira versão.` }, 400, corsOrigin);
    if (!validDate(startDate) || !validDate(endDate)) return json({ error: "Informe as datas inicial e final." }, 400, corsOrigin);
    const start = Date.parse(String(startDate) + "T00:00:00-03:00");
    const end = Date.parse(String(endDate) + "T23:59:00-03:00");
    if (start < Date.now() - 60_000 || end <= start) return json({ error: "As datas devem ser futuras e a data final posterior à inicial." }, 400, corsOrigin);
    const days = Math.ceil((end - start) / 86400000);
    if (days > 90) return json({ error: "A primeira versão aceita períodos de até 90 dias." }, 400, corsOrigin);

    const { data: connection, error: connectionError } = await db.from("sge_meta_ads_connections")
      .select("*").eq("user_id", user.id).eq("ad_account_id", accountId).maybeSingle();
    if (connectionError || !connection) return json({ error: "Conta de anúncios não conectada a este usuário." }, 404, corsOrigin);
    if (connection.account_status !== 1) return json({ error: "A conta de anúncios não está ativa segundo a Meta." }, 400, corsOrigin);
    if (connection.currency !== "BRL") return json({ error: `A conta está em ${connection.currency}; nesta versão só aceitamos contas em BRL para evitar conversão incorreta.` }, 400, corsOrigin);
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now()) return json({ error: "O token expirou. Reconecte a conta de anúncios." }, 401, corsOrigin);

    let campaignId = "";
    let adsetId = "";
    let token = "";
    const now = new Date().toISOString();
    const { data: job, error: jobError } = await db.from("sge_meta_ads_jobs").insert({
      user_id: user.id,
      ad_account_id: accountId,
      campaign_name: name,
      objective: "OUTCOME_TRAFFIC",
      destination_url: destination,
      budget_amount: budget,
      budget_currency: "BRL",
      start_date: startDate,
      end_date: endDate,
      targeting_summary: { countries: ["BR"], age_min: age.min, age_max: age.max, region_note: String(input.region || ""), audience_note: String(input.audience || ""), placements: "Meta automatic placements" },
      review_status: "draft",
      approval_phrase: CONFIRM_PHRASE,
      updated_at: now,
    }).select("id").single();
    if (jobError || !job) return json({ error: "Não foi possível registrar a revisão da campanha." }, 500, corsOrigin);

    try {
      token = await decryptToken(connection.access_token_ciphertext, connection.access_token_iv);
      const campaign = await graphPost(`act_${accountId}/campaigns`, token, {
        name,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: "[]",
        is_adset_budget_sharing_enabled: "false",
      });
      campaignId = String(campaign.id || "");
      if (!campaignId) throw new Error("Meta não retornou o identificador da campanha.");

      const targeting = {
        age_min: age.min,
        age_max: age.max,
        geo_locations: { countries: ["BR"] },
        publisher_platforms: ["facebook", "instagram"],
      };
      const adset = await graphPost(`act_${accountId}/adsets`, token, {
        name: name + " — conjunto pausado",
        campaign_id: campaignId,
        daily_budget: String(Math.round((budget / days) * 100)),
        start_time: isoDate(String(startDate)),
        end_time: isoDate(String(endDate), true),
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        destination_type: "WEBSITE",
        targeting: JSON.stringify(targeting),
        status: "PAUSED",
      });
      adsetId = String(adset.id || "");
      const { error: updateError } = await db.from("sge_meta_ads_jobs").update({
        campaign_id: campaignId,
        adset_id: adsetId || null,
        review_status: "created_paused",
        meta_response: { campaign_id: campaignId, adset_id: adsetId, status: "PAUSED", note: "No creative or ad was created. Nothing can deliver until later steps are completed." },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("user_id", user.id);
      if (updateError) throw new Error("A campanha foi criada pausada na Meta, mas não foi possível atualizar o registro de revisão.");
      return json({
        ok: true,
        job_id: job.id,
        campaign_id: campaignId,
        adset_id: adsetId,
        status: "PAUSED",
        budget_total_brl: budget,
        budget_daily_estimate_brl: Math.round((budget / days) * 100) / 100,
        targeting,
        message: "Campanha e conjunto criados como PAUSED. Nenhum anúncio/criativo foi criado e nada será ativado automaticamente.",
      }, 201, corsOrigin);
    } catch (error) {
      await db.from("sge_meta_ads_jobs").update({
        campaign_id: campaignId || null,
        adset_id: adsetId || null,
        review_status: "failed",
        meta_response: { error: String((error as Error)?.message || "Falha na API Meta"), campaign_id: campaignId || null },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("user_id", user.id);
      return json({
        error: String((error as Error)?.message || "Falha ao criar a estrutura pausada."),
        campaign_id: campaignId || null,
        partial_creation: Boolean(campaignId),
        message: campaignId ? "Uma campanha foi criada pausada; ela permanece pausada. Confira no Gerenciador de Anúncios antes de tentar novamente." : "Nenhum objeto de campanha foi confirmado.",
      }, 502, corsOrigin);
    }
  }

  if (action === "jobs" && req.method === "GET") {
    const { data, error } = await db.from("sge_meta_ads_jobs")
      .select("id,ad_account_id,campaign_id,adset_id,ad_id,campaign_name,objective,destination_url,budget_amount,budget_currency,start_date,end_date,targeting_summary,review_status,approved_at,created_at,updated_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) return json({ error: "Não foi possível carregar o histórico de revisão." }, 500, corsOrigin);
    return json({ jobs: data || [] }, 200, corsOrigin);
  }

  return json({ error: "Ação não suportada. Use start, callback, accounts, create-paused ou jobs." }, 405, corsOrigin);
});
