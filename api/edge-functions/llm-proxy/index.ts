// Supabase Edge Function (Deno) - llm-proxy
// Deploy this as a Supabase Function and set the `OPENAI_API_KEY` secret in your project.

import { serve } from "https://deno.land/std@0.201.0/http/server.ts";

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const messages = body.messages || body.prompt || [];
    const model = body.model || 'gpt-3.5-turbo';

    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_KEY) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    // Forward to OpenAI Chat Completions
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({ model, messages })
    });

    const data = await r.json();
    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
