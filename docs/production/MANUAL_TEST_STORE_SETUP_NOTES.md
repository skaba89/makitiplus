# Manual testing notes

The store creation screen can be tested only after the app deployment and database migration are aligned.

If a tester is already authenticated but store creation returns a 400 error, verify the test account profile, role, organization, and store data in Supabase before continuing.

Use a disposable test store and avoid destructive organization deletion or real payment during this validation.
