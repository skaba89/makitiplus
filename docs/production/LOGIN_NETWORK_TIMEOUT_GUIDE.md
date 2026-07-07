# Login network timeout guide

## Observed error

The browser console can show a timeout when calling Supabase Auth.

This means the browser cannot reach Supabase Auth. It is not a password, role, or RLS error.

Common causes:

1. unstable local internet connection;
2. VPN, proxy, firewall, DNS, or corporate network blocking Supabase;
3. browser service worker or cache still serving stale files;
4. temporary Supabase network availability issue.

## Immediate validation

1. Open the Supabase project URL directly in the browser.
2. Try another network, for example mobile hotspot.
3. Disable VPN or proxy temporarily.
4. Clear browser site data and unregister service worker.
5. Retry in a fresh private window.

## Related browser crash

Chrome Translate can mutate the DOM managed by React and trigger node removal errors.

The app disables browser translation in `index.html` with `translate="no"` and `notranslate` to reduce this risk.
