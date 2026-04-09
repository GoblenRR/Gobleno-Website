Cloudflare Worker setup for Gobleno videos API

1. Install Wrangler if needed:
   npm install -g wrangler

2. Log in:
   wrangler login

3. From this folder, add the YouTube API key as a secret:
   wrangler secret put YOUTUBE_API_KEY

4. Deploy the Worker:
   wrangler deploy

5. Test it:
   https://gobleno.co.uk/api/videos

This Worker serves the site's Videos tab and keeps the YouTube API key out of frontend code.
