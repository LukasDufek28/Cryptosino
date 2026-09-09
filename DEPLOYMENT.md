# Unified Vercel deployment

In the cryptosinobydonny project's Settings > Build and Deployment:

1. Set Root Directory to the repository root (leave the field empty), not frontend or backend.
2. Use Framework Preset Other. The root vercel.json supplies npm install, npm run build, and output directory build.
3. Remove any frontend-only Build Command override.
4. Set DATABASE_URL, JWT_SECRET, and SERVER_SEED for Production using the existing backend values. Remove REACT_APP_API_URL so requests use the same domain.
5. Deploy the latest main commit after saving these settings.

Verify /api/ping returns JSON with message "Yes Sir". It must not return HTML.
Verify a POST to /api/login with an empty JSON object returns a JSON validation error, not HTTP 405.
Verify JavaScript and CSS assets load, and refreshing /crash displays the app.

The repository-root api directory must be included in the deployment. Deploying only frontend produces a static site without the backend. Keep the old backend project until the unified deployment is verified.
