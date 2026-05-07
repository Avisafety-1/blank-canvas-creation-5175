import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");
    const PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID");

    if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
      console.log("Facebook not configured, skipping scheduled publish");
      return new Response(JSON.stringify({ skipped: true, reason: "Facebook not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all scheduled drafts whose time has come
    const { data: drafts, error: fetchErr } = await supabase
      .from("marketing_drafts")
      .select("*")
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString());

    if (fetchErr) {
      console.error("Error fetching scheduled drafts:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!drafts || drafts.length === 0) {
      return new Response(JSON.stringify({ published: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    const IG_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN")?.trim();
    const IG_ACCOUNT_ID = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")?.trim();
    const ENCRYPTION_KEY = Deno.env.get("FH2_ENCRYPTION_KEY");

    for (const draft of drafts) {
      try {
        const text = draft.content?.trim();
        if (!text) {
          console.log(`Draft ${draft.id} has no content, skipping`);
          results.push({ id: draft.id, skipped: true, reason: "no content" });
          continue;
        }

        // Check for media
        const { data: media } = await supabase
          .from("marketing_media")
          .select("file_url")
          .eq("draft_id", draft.id)
          .order("created_at", { ascending: false })
          .limit(1);
        const imageUrl = media?.[0]?.file_url;

        const draftPlatform = draft.platform || "facebook";

        if (draftPlatform === "linkedin") {
          // LinkedIn publishing
          if (!ENCRYPTION_KEY) {
            results.push({ id: draft.id, error: "Encryption key not configured" });
            continue;
          }

          const { data: tokenRow, error: tokenErr } = await supabase.rpc("get_linkedin_token", {
            p_company_id: draft.company_id,
            p_encryption_key: ENCRYPTION_KEY,
          });

          if (tokenErr || !tokenRow || tokenRow.length === 0) {
            results.push({ id: draft.id, error: "LinkedIn not connected for this company" });
            continue;
          }

          const liToken = tokenRow[0];
          const LI_API = "https://api.linkedin.com";

          let postPayload: any = {
            author: liToken.member_urn,
            lifecycleState: "PUBLISHED",
            visibility: "PUBLIC",
            commentary: text,
            distribution: {
              feedDistribution: "MAIN_FEED",
              targetEntities: [],
              thirdPartyDistributionChannels: [],
            },
          };

          // Handle image
          if (imageUrl) {
            const initRes = await fetch(`${LI_API}/rest/images?action=initializeUpload`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${liToken.access_token}`,
                "Content-Type": "application/json",
                "LinkedIn-Version": "202401",
                "X-Restli-Protocol-Version": "2.0.0",
              },
              body: JSON.stringify({ initializeUploadRequest: { owner: liToken.member_urn } }),
            });
            const initData = await initRes.json();
            if (!initRes.ok || !initData.value?.uploadUrl) {
              console.error(`LinkedIn image init error for draft ${draft.id}:`, JSON.stringify(initData));
              results.push({ id: draft.id, error: "LinkedIn image upload init failed" });
              continue;
            }
            const imgRes = await fetch(imageUrl);
            const imgBlob = await imgRes.blob();
            const uploadRes = await fetch(initData.value.uploadUrl, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${liToken.access_token}`,
                "Content-Type": imgBlob.type || "image/jpeg",
              },
              body: imgBlob,
            });
            if (!uploadRes.ok) {
              results.push({ id: draft.id, error: "LinkedIn image upload failed" });
              continue;
            }
            postPayload.content = { media: { title: "Image", id: initData.value.image } };
          }

          const postRes = await fetch(`${LI_API}/rest/posts`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${liToken.access_token}`,
              "Content-Type": "application/json",
              "LinkedIn-Version": "202401",
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify(postPayload),
          });

          if (!postRes.ok) {
            const postErr = await postRes.json();
            console.error(`LinkedIn post error for draft ${draft.id}:`, JSON.stringify(postErr));
            results.push({ id: draft.id, error: postErr?.message || "LinkedIn post error" });
            continue;
          }

          const postUrn = postRes.headers.get("x-restli-id") || "";
          const liPostUrl = postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : "";

          await supabase
            .from("marketing_drafts")
            .update({
              status: "published",
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {
                ...(draft.metadata || {}),
                linkedin_post_urn: postUrn,
                linkedin_post_url: liPostUrl,
              },
            })
            .eq("id", draft.id);

          console.log(`Published draft ${draft.id} -> LinkedIn post ${postUrn}`);
          results.push({ id: draft.id, success: true, postUrn, platform: "linkedin" });

        } else if (draftPlatform === "instagram") {
          // Instagram publishing
          if (!IG_ACCESS_TOKEN || !IG_ACCOUNT_ID) {
            results.push({ id: draft.id, error: "Instagram not configured" });
            continue;
          }
          if (!imageUrl) {
            results.push({ id: draft.id, error: "Instagram requires an image" });
            continue;
          }

          // Step 1: Create container (Instagram Login uses graph.instagram.com)
          const IG_API = "https://graph.instagram.com/v22.0";
          const containerRes = await fetch(`${IG_API}/${IG_ACCOUNT_ID}/media`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${IG_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              image_url: imageUrl,
              caption: text,
            }),
          });
          const containerData = await containerRes.json();
          if (!containerRes.ok) {
            console.error(`Instagram container error for draft ${draft.id}:`, JSON.stringify(containerData));
            results.push({ id: draft.id, error: containerData?.error?.message || "Instagram container error" });
            continue;
          }

          // Step 2: Wait for container to be ready
          const MAX_POLLS = 15;
          const POLL_INTERVAL_MS = 2000;
          let containerReady = false;
          for (let p = 0; p < MAX_POLLS; p++) {
            const statusRes = await fetch(`${IG_API}/${containerData.id}?fields=status_code`, {
              headers: { "Authorization": `Bearer ${IG_ACCESS_TOKEN}` },
            });
            const statusData = await statusRes.json();
            console.log(`Draft ${draft.id} poll ${p + 1}/${MAX_POLLS}: status_code=${statusData.status_code}`);
            if (statusData.status_code === "FINISHED") { containerReady = true; break; }
            if (statusData.status_code === "ERROR") { break; }
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }
          if (!containerReady) {
            results.push({ id: draft.id, error: "Instagram media processing timeout or error" });
            continue;
          }

          // Step 3: Publish
          const publishRes = await fetch(`${IG_API}/${IG_ACCOUNT_ID}/media_publish`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${IG_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              creation_id: containerData.id,
            }),
          });
          const publishData = await publishRes.json();
          if (!publishRes.ok) {
            console.error(`Instagram publish error for draft ${draft.id}:`, JSON.stringify(publishData));
            results.push({ id: draft.id, error: publishData?.error?.message || "Instagram publish error" });
            continue;
          }

          const igPostId = publishData.id;
          const igPostUrl = `https://www.instagram.com/p/${igPostId}/`;

          await supabase
            .from("marketing_drafts")
            .update({
              status: "published",
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {
                ...(draft.metadata || {}),
                instagram_post_id: igPostId,
                instagram_post_url: igPostUrl,
              },
            })
            .eq("id", draft.id);

          console.log(`Published draft ${draft.id} -> Instagram post ${igPostId}`);
          results.push({ id: draft.id, success: true, postId: igPostId, platform: "instagram" });

        } else {
          // Facebook publishing (default)
          if (!PAGE_ACCESS_TOKEN || !PAGE_ID) {
            results.push({ id: draft.id, error: "Facebook not configured" });
            continue;
          }

          let fbResponse: Response;
          if (imageUrl) {
            fbResponse = await fetch(`${GRAPH_API}/${PAGE_ID}/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: text,
                url: imageUrl,
                access_token: PAGE_ACCESS_TOKEN,
              }),
            });
          } else {
            fbResponse = await fetch(`${GRAPH_API}/${PAGE_ID}/feed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: text,
                access_token: PAGE_ACCESS_TOKEN,
              }),
            });
          }

          const fbData = await fbResponse.json();

          if (!fbResponse.ok) {
            console.error(`Facebook error for draft ${draft.id}:`, JSON.stringify(fbData));
            results.push({ id: draft.id, error: fbData?.error?.message || "Facebook error" });
            continue;
          }

          const postId = fbData.id || fbData.post_id;
          const postUrl = `https://facebook.com/${postId}`;

          await supabase
            .from("marketing_drafts")
            .update({
              status: "published",
              published_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              metadata: {
                ...(draft.metadata || {}),
                facebook_post_id: postId,
                facebook_post_url: postUrl,
              },
            })
            .eq("id", draft.id);

          console.log(`Published draft ${draft.id} -> Facebook post ${postId}`);
          results.push({ id: draft.id, success: true, postId, platform: "facebook" });
        }
      } catch (err) {
        console.error(`Error publishing draft ${draft.id}:`, err);
        results.push({ id: draft.id, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    return new Response(
      JSON.stringify({ published: results.filter((r) => r.success).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("publish-scheduled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
