# Manual store test setup

Run the setup from Supabase SQL Editor with an admin/postgres role only.

Do not grant `auth.users` access to `authenticated`.
Do not disable RLS permanently.

Manual objective:

1. Make the test user active.
2. Ensure the test user has the `super_admin` role.
3. Ensure the test user has one organization.
4. Ensure that organization has one test store named `Diallo & Frères`.

Use the authenticated user id seen in browser logs for the test account.

After setup, reconnect to `/auth`, refresh `/dashboard/stores`, and test POS/navigation first.
Do not test destructive organization deletion or real Stripe payment during this manual validation.
