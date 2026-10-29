import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Cache-Control":"no-store"};
const allowedEvents=new Set(["page_view","product_view","cta_click","lead_click"]);
const maxText=(v:unknown,n=180)=>typeof v==="string"?v.trim().slice(0,n):"";
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...corsHeaders,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 const urlBase=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anonKey=Deno.env.get("SUPABASE_ANON_KEY");
 if(!urlBase||!serviceKey||!anonKey)return json({error:"Tracking backend is not configured."},500);
 const admin=createClient(urlBase,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const url=new URL(req.url),action=url.searchParams.get("action")||"";
 try{
  if(action==="go"){
   if(req.method!=="GET")return json({error:"Method not allowed."},405);
   const code=url.searchParams.get("code")||"";
   const {data:link,error}=await admin.from("sge_tracking_links").select("id,owner_user_id,destination_url,source,medium,campaign").eq("code",code).maybeSingle();
   if(error||!link)return new Response("Link não encontrado ou desativado.",{status:404,headers:{...corsHeaders,"Content-Type":"text/plain; charset=utf-8"}});
   let referrerHost="";try{const r=req.headers.get("referer");if(r)referrerHost=new URL(r).hostname.slice(0,120);}catch{}
   await admin.from("sge_tracking_events").insert({owner_user_id:link.owner_user_id,link_id:link.id,event_type:"outbound_click",referrer_host:referrerHost||null,source:link.source,medium:link.medium,campaign:link.campaign});
   return Response.redirect(link.destination_url,302);
  }
  let payload:Record<string,unknown>={};if(req.method==="POST"){try{payload=await req.json();}catch{return json({error:"Invalid JSON body."},400);}}
  if(action==="track"){
   if(req.method!=="POST")return json({error:"Method not allowed."},405);
   const key=maxText(payload.public_key,80),type=maxText(payload.event_type,40);
   if(!key||!allowedEvents.has(type))return json({error:"Invalid tracking event."},400);
   const {data:w}=await admin.from("sge_tracking_workspaces").select("id,owner_user_id").eq("public_key",key).maybeSingle();
   if(!w)return json({accepted:false},202);
   const visitor=maxText(payload.visitor_id,64);
   if(visitor){const cutoff=new Date(Date.now()-60000).toISOString();const {count}=await admin.from("sge_tracking_events").select("id",{count:"exact",head:true}).eq("workspace_id",w.id).eq("visitor_id",visitor).gte("created_at",cutoff);if((count||0)>=30)return json({accepted:false,reason:"rate_limited"},429);}
   let refHost="";try{const r=maxText(payload.referrer,500);if(r)refHost=new URL(r).hostname.slice(0,120);}catch{}
   const {error}=await admin.from("sge_tracking_events").insert({owner_user_id:w.owner_user_id,workspace_id:w.id,event_type:type,visitor_id:visitor||null,page_path:maxText(payload.page_path,200)||"/",referrer_host:refHost||null,source:maxText(payload.source,80)||null,medium:maxText(payload.medium,80)||null,campaign:maxText(payload.campaign,120)||null,content:maxText(payload.content,120)||null,term:maxText(payload.term,120)||null});
   if(error)return json({error:"Could not record event."},500);return json({accepted:true},202);
  }
  const authHeader=req.headers.get("Authorization")||"",token=authHeader.replace(/^Bearer\\s+/i,"");
  if(!token)return json({error:"Authentication required."},401);
  const auth=createClient(urlBase,anonKey,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:authError}=await auth.auth.getUser(token),user=userData?.user;
  if(authError||!user)return json({error:"Invalid session."},401);
  if(action==="setup"){
   if(req.method!=="POST")return json({error:"Method not allowed."},405);
   let {data:workspace,error}=await admin.from("sge_tracking_workspaces").select("id,public_key,created_at").eq("owner_user_id",user.id).maybeSingle();
   if(error)return json({error:"Could not load tracking workspace."},500);
   if(!workspace){const created=await admin.from("sge_tracking_workspaces").insert({owner_user_id:user.id}).select("id,public_key,created_at").single();workspace=created.data;error=created.error;}
   if(error||!workspace)return json({error:"Could not create tracking workspace."},500);return json({workspace});
  }
  if(action==="create-link"){
   if(req.method!=="POST")return json({error:"Method not allowed."},405);
   const label=maxText(payload.label,120),destination=maxText(payload.destination_url,1600);let parsed:URL;
   try{parsed=new URL(destination);}catch{return json({error:"Informe um link de destino válido."},400);}
   if(parsed.protocol!=="https:")return json({error:"O destino precisa usar HTTPS."},400);if(!label)return json({error:"Informe um nome para o link."},400);
   const {data:link,error}=await admin.from("sge_tracking_links").insert({owner_user_id:user.id,label,destination_url:parsed.toString(),source:maxText(payload.source,80)||"social",medium:maxText(payload.medium,80)||"organic",campaign:maxText(payload.campaign,120)||"fluent-immersion-kits"}).select("id,code,label,destination_url,source,medium,campaign,created_at").single();
   if(error||!link)return json({error:"Não foi possível criar o link rastreável."},500);
   return json({link,tracking_url:urlBase+"/functions/v1/sge-tracking?action=go&code="+link.code},201);
  }
  if(action==="summary"){
   if(req.method!=="GET")return json({error:"Method not allowed."},405);
   const since=new Date(Date.now()-30*86400000).toISOString(),types=["page_view","product_view","cta_click","lead_click","outbound_click"],counts:Record<string,number>={};
   for(const type of types){const {count,error}=await admin.from("sge_tracking_events").select("id",{count:"exact",head:true}).eq("owner_user_id",user.id).eq("event_type",type).gte("created_at",since);if(error)return json({error:"Could not load analytics."},500);counts[type]=count||0;}
   const {data:links,error:le}=await admin.from("sge_tracking_links").select("id,code,label,destination_url,source,medium,campaign,created_at").eq("owner_user_id",user.id).order("created_at",{ascending:false}).limit(50);
   if(le)return json({error:"Could not load tracking links."},500);
   const linkRows=[];for(const link of links||[]){const {count}=await admin.from("sge_tracking_events").select("id",{count:"exact",head:true}).eq("owner_user_id",user.id).eq("link_id",link.id).gte("created_at",since);linkRows.push({...link,clicks_30d:count||0});}
   return json({period_days:30,counts,links:linkRows});
  }
  return json({error:"Unknown action."},404);
 }catch{return json({error:"Unexpected tracking error."},500);}
});