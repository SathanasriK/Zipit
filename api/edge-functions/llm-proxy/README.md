llm-proxy (Supabase Edge Function)

Purpose
- Securely proxy LLM (OpenAI) requests from the client via a Supabase Edge Function so the OpenAI API key does not live in browser code.

Files
- `index.ts` - Deno-based Edge Function that forwards requests to OpenAI's Chat Completions API.

Setup & Deploy
1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
2. From your project directory run:

   supabase functions new llm-proxy

   Replace the generated function code with the `index.ts` above.

3. Set the required secret in your Supabase project:

   supabase secrets set OPENAI_API_KEY="sk-..."

4. Deploy the function:

   supabase functions deploy llm-proxy --project-ref <your-project-ref>

5. From your client (in this repo we added `callLLMViaSupabase` in `app.js`) invoke the function.

Notes
- The function expects POST JSON with `{ messages: [...], model: 'gpt-3.5-turbo' }`.
- Ensure your Supabase project's RLS / function permissions allow invocation from the client (anon) key, or use authenticated requests.
- Keep `OPENAI_API_KEY` secret; do not expose it in client code.
