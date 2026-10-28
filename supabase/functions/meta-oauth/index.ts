import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200, origin = "*") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin },
  });
}
function redirect(url: URL) {
  return Response.redirect(url.toString(), 302);
}
function appRedirect(result: string) {
  const base = Deno.env.get("APP_BASE_URL");
  if (!base) throw new Error("APP_BASE_URL is not configured");
  const url = new URL(base);
  url.searchParams.set("meta", result);
  return redirect(url);
}
function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
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
async function encryptToken(token: string) {
  const keyBytes = Uint8Array.from(atob(required("META_TOKEN_ENCRYPTION_KEY")), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { ciphertext: base64(new Uint8Array(encrypted)), iv: base64(iv) };
}

async function decryptToken(ciphertext: string, ivText: string) {
  const keyBytes = Uint8Array.from(atob(required("META_TOKEN_ENCRYPTION_KEY")), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 random bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivText), c => c.charCodeAt(0));
  const bytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes);
  return new TextDecoder().decode(plain);
}
async function authenticatedUser(req: Request) {
  const bearer = req.headers.get("authorization") ?? "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return null;
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  return error || !user ? null : user;
}

Deno.serve(async (req: Request) => {
  const appBase = Deno.env.get("APP_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = appBase ? new URL(appBase).origin : "";
  const corsOrigin = origin && origin === allowedOrigin ? origin : allowedOrigin;

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Origin": corsOrigin || "null" } });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const db = adminClient();

  // Read-only account and media endpoints. Every request is tied to the authenticated SGE user.
  if ((action === "accounts" || action === "posts") && req.method === "GET") {
    if (origin && origin !== allowedOrigin) return json({ error: "Origin not allowed" }, 403, corsOrigin);
    const user = await authenticatedUser(req);
    if (!user) return json({ error: "Entre no Social Growth Engine antes de consultar as contas." }, 401, corsOrigin);

    if (action === "accounts") {
      const { data, error } = await db.from("sge_meta_connections")
        .select("instagram_user_id,instagram_username,connected_at,token_expires_at,scopes")
        .eq("user_id", user.id)
        .order("connected_at", { ascending: false });
      if (error) return json({ error: "Não foi possível carregar as contas conectadas." }, 500, corsOrigin);
      return json({ accounts: data ?? [] }, 200, corsOrigin);
    }

    const accountId = url.searchParams.get("account_id") ?? "";
    if (!accountId) return json({ error: "Informe account_id." }, 400, corsOrigin);
    const { data: connection, error: connectionError } = await db.from("sge_meta_connections")
      .select("instagram_user_id,instagram_username,access_token_ciphertext,access_token_iv,token_expires_at")
      .eq("user_id", user.id)
      .eq("instagram_user_id", accountId)
      .maybeSingle();
    if (connectionError || !connection) return json({ error: "Conta não encontrada para este usuário." }, 404, corsOrigin);
    if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now()) {
      return json({ error: "O token expirou. Reconecte a conta do Instagram." }, 401, corsOrigin);
    }
    try {
      const token = await decryptToken(connection.access_token_ciphertext, connection.access_token_iv);
      const mediaUrl = new URL(`https://graph.instagram.com/${encodeURIComponent(connection.instagram_user_id)}/media`);
      mediaUrl.searchParams.set("fields", "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count");
      mediaUrl.searchParams.set("limit", "25");
      mediaUrl.searchParams.set("access_token", token);
      const mediaResponse = await fetch(mediaUrl);
      const mediaPayload = await mediaResponse.json();
      if (!mediaResponse.ok) return json({ error: mediaPayload?.error?.message || "A API do Instagram não conseguiu retornar as publicações." }, 502, corsOrigin);
      return json({ account: { instagram_user_id: connection.instagram_user_id, instagram_username: connection.instagram_username }, posts: mediaPayload.data ?? [], paging: mediaPayload.paging ?? null }, 200, corsOrigin);
    } catch {
      return json({ error: "Falha segura ao consultar publicações. Verifique os secrets e as permissões da Meta." }, 500, corsOrigin);
    }
  }

  if (action === "start" && req.method === "POST") {
    if (origin && origin !== allowedOrigin) return json({ error: "Origin not allowed" }, 403, corsOrigin);
    const bearer = req.headers.get("authorization") ?? "";
    const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!accessToken) return json({ error: "Sign in to Social Growth Engine first." }, 401, corsOrigin);

    const authClient = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(accessToken);
    if (authError || !user) return json({ error: "Your session is invalid or expired." }, 401, corsOrigin);

    const appId = required("META_APP_ID");
    const redirectUri = required("META_REDIRECT_URI");
    const state = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await db.from("sge_oauth_states").insert({ state, user_id: user.id, expires_at: expiresAt });
    if (error) return json({ error: "Could not create secure OAuth state." }, 500, corsOrigin);

    const authorize = new URL("https://www.instagram.com/oauth/authorize");
    authorize.searchParams.set("client_id", appId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments");
    authorize.searchParams.set("state", state);
    return json({ authorization_url: authorize.toString() }, 200, corsOrigin);
  }

  if (action === "callback" && req.method === "GET") {
    if (url.searchParams.has("error")) return appRedirect("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return appRedirect("error");

    const now = new Date().toISOString();
    const { data: stateRow, error: stateError } = await db
      .from("sge_oauth_states")
      .update({ used_at: now })
      .eq("state", state)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("user_id")
      .maybeSingle();
    if (stateError || !stateRow?.user_id) return appRedirect("error");

    const clientId = required("META_APP_ID");
    const clientSecret = required("META_APP_SECRET");
    const redirectUri = required("META_REDIRECT_URI");
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const shortResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!shortResponse.ok) return appRedirect("error");
    const shortToken = await shortResponse.json();
    if (!shortToken.access_token) return appRedirect("error");

    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", clientSecret);
    longUrl.searchParams.set("access_token", shortToken.access_token);
    const longResponse = await fetch(longUrl);
    if (!longResponse.ok) return appRedirect("error");
    const longToken = await longResponse.json();
    const token = longToken.access_token ?? shortToken.access_token;
    const expiresIn = Number(longToken.expires_in ?? shortToken.expires_in ?? 0);

    const meUrl = new URL("https://graph.instagram.com/me");
    meUrl.searchParams.set("fields", "user_id,username");
    meUrl.searchParams.set("access_token", token);
    const meResponse = await fetch(meUrl);
    if (!meResponse.ok) return appRedirect("error");
    const me = await meResponse.json();
    const instagramUserId = me.user_id ?? me.id;
    if (!instagramUserId) return appRedirect("error");
    const encrypted = await encryptToken(token);
    const { error: saveError } = await db.from("sge_meta_connections").upsert({
      user_id: stateRow.user_id,
      instagram_user_id: String(instagramUserId),
      instagram_username: String(me.username ?? ""),
      access_token_ciphertext: encrypted.ciphertext,
      access_token_iv: encrypted.iv,
      token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights", "instagram_business_manage_comments"],
      connected_at: now,
      updated_at: now,
    }, { onConflict: "user_id,instagram_user_id" });
    if (saveError) return appRedirect("error");
    return appRedirect("connected");
  }

  return json({ error: "Use POST ?action=start or GET ?action=callback." }, 405, corsOrigin);
});
