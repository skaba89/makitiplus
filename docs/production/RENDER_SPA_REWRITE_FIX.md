# Render SPA rewrite fix

## Problem

Direct navigation to `/auth` returned Render's plain `Not Found` page.

This is not a Supabase login problem. It means the static host is not serving `index.html` for React Router routes.

## Repository fix

`render.yaml` must define the static publish path and the SPA fallback route:

```yaml
staticPublishPath: dist
routes:
  - type: rewrite
    source: /*
    destination: /index.html
```

## Important operational note

If the Render service is configured manually in the Render dashboard instead of being managed from `render.yaml`, the dashboard must also contain this rewrite rule:

- Source: `/*`
- Destination: `/index.html`
- Action: `Rewrite`

Without this, `/auth`, `/dashboard`, and other React Router routes can return `Not Found` on direct page load.

## Safe testing

After redeploy:

1. Clear browser site data.
2. Unregister the service worker.
3. Open `/auth` directly.
4. Confirm the login form appears.
5. Login and verify `/dashboard` works.
