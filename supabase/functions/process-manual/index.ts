import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChunkInput {
  index: number;
  text: string;
  heading?: string | null;
}

const EMBED_DIM = 1536;

function padOrTrim(vec: number[], dim: number): number[] {
  if (vec.length === dim) return vec;
  if (vec.length > dim) return vec.slice(0, dim);
  return vec.concat(new Array(dim - vec.length).fill(0));
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  // Lovable AI Gateway is OpenAI-compatible. Use a Google embedding model.
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: texts,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Embedding API ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return data.data.map((d: any) => padOrTrim(d.embedding, EMBED_DIM));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { manual_id, chunks } = body as { manual_id: string; chunks: ChunkInput[] };
    if (!manual_id || !Array.isArray(chunks) || chunks.length === 0) {
      return new Response(JSON.stringify({ error: "manual_id and chunks required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify manual belongs to caller's company
    const { data: manual, error: manualErr } = await admin
      .from("manuals")
      .select("id, company_id")
      .eq("id", manual_id)
      .maybeSingle();
    if (manualErr || !manual) {
      return new Response(JSON.stringify({ error: "Manual not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("company_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.company_id !== manual.company_id) {
      // allow if user has visibility (parent/child) — reuse get_user_visible_company_ids
      const { data: visible } = await admin.rpc("get_user_visible_company_ids", { p_user_id: userData.user.id });
      const ok = Array.isArray(visible) && visible.includes(manual.company_id);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Truncate each chunk to a safe size
    const safeChunks = chunks.map((c) => ({
      ...c,
      text: (c.text || "").slice(0, 8000),
    }));

    // Process in batches of 20
    const BATCH = 20;
    let inserted = 0;
    for (let i = 0; i < safeChunks.length; i += BATCH) {
      const batch = safeChunks.slice(i, i + BATCH);
      let embeddings: number[][];
      try {
        embeddings = await embedBatch(batch.map((b) => b.text), LOVABLE_API_KEY);
      } catch (e) {
        console.error("embed batch failed", e);
        // Continue with null embeddings if rate-limited
        embeddings = batch.map(() => []);
      }

      const rows = batch.map((b, idx) => ({
        manual_id,
        chunk_index: b.index,
        chunk_text: b.text,
        section_heading: b.heading || null,
        embedding: embeddings[idx]?.length === EMBED_DIM ? (embeddings[idx] as any) : null,
        token_count: Math.ceil(b.text.length / 4),
      }));

      const { error: insErr } = await admin.from("manual_chunks").insert(rows);
      if (insErr) {
        console.error("insert chunks error", insErr);
        throw insErr;
      }
      inserted += rows.length;
    }

    return new Response(JSON.stringify({ chunk_count: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-manual error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
