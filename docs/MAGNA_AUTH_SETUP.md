# Magna.co.uk auth and editors setup

## 1. Run the migration

In Supabase: **SQL Editor** → run the migration file:

`supabase/migrations/20250314120000_editors_and_public_access.sql`

## 2. Enable Google OAuth in Supabase

1. **Supabase Dashboard** → **Authentication** → **Providers** → **Google** → Enable.
2. In **Google Cloud Console** create OAuth 2.0 credentials (Web application).
3. Set **Authorized redirect URIs** to:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - For local dev: same (Supabase handles it).
4. Copy Client ID and Client Secret into Supabase Google provider.
5. (Optional) In Google OAuth consent screen, restrict to your organisation so only `@magna.co.uk` can sign in.

## 3. Configure redirect URL for your app

In Supabase **Authentication** → **URL Configuration**:

- **Site URL**: your app URL (e.g. `https://your-app.vercel.app` or `http://localhost:3000`)
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` for dev)

## 4. Add editors

Only users in `allowed_editors` can create SOPs and publish. Everyone with `@magna.co.uk` can sign in and view all SOPs.

To add an editor:

1. Have them sign in once (Google or email/password with an `@magna.co.uk` address).
2. In **Supabase** → **Authentication** → **Users**, copy their **User UID**.
3. In **SQL Editor** run:
   ```sql
   insert into allowed_editors (user_id) values ('<paste-user-uid-here>');
   ```

To add multiple editors, run an `insert` for each or use:
```sql
insert into allowed_editors (user_id) values
  ('uuid-1'),
  ('uuid-2');
```

## 5. Domain check

- **Google OAuth**: After callback, the app checks that the email ends with `@magna.co.uk`. If not, the user is signed out and shown an error.
- **Email/password**: Sign-in and sign-up APIs reject non-`@magna.co.uk` addresses.

## Summary

| Role | Can sign in | Can see all SOPs | Can create SOPs | Can edit / publish |
|------|-------------|------------------|------------------|--------------------|
| Anyone @magna.co.uk | Yes (Google or email) | Yes | No | No (view only) |
| Editor (@magna.co.uk + in `allowed_editors`) | Yes | Yes | Yes | Yes (own SOPs) |
