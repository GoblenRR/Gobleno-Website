Cloudflare Worker setup for Gobleno site APIs

1. Install Wrangler if needed:
   npm install -g wrangler

2. Log in:
   wrangler login

3. From this folder, add the YouTube API key as a secret:
   wrangler secret put YOUTUBE_API_KEY

4. Add your Supabase project URL:
   wrangler secret put SUPABASE_URL

5. Add your Supabase service role key:
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY

6. Add the developer password you want to use for the admin modal:
   wrangler secret put DEV_PASSWORD

7. Add a separate signing secret for the dev session cookie:
   wrangler secret put DEV_SESSION_SECRET

8. Optional: if you want a different storage bucket name than `work-images`:
   wrangler secret put SUPABASE_STORAGE_BUCKET

9. In Supabase SQL Editor, run:
   ../supabase/setup.sql

10. Deploy the Worker:
   wrangler deploy

11. Test it:
   https://gobleno.co.uk/api/videos
   https://gobleno.co.uk/api/work-content?section=music
   https://gobleno.co.uk/api/work-content?section=ui
   https://gobleno.co.uk/api/work-content?section=games
   https://gobleno.co.uk/api/work-content?section=extras

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only. It should only live in Worker secrets.
- The developer password is checked by the Worker, not in the browser.
- The top-right user icon opens the dev control modal. After login, you can add entries to Music, UI, Games, and Extras.
- The SQL now also creates a public Supabase Storage bucket named `work-images` for uploaded images.
