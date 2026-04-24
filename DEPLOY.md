# Deploy LifeClock For Free

## Recommended Path

Use Render for the web app and Neon for PostgreSQL.

## Important Limitation

Render states that free web services cannot send outbound traffic on SMTP ports `25`, `465`, or `587`, so Gmail/Nodemailer password reset and reminder emails will not work on a free Render web service.

Source: https://render.com/docs/free

The app already disables email features when email credentials are not configured.

## Steps

1. Push this repository to GitHub.
2. Create a Neon Postgres database and copy its connection string.
3. In Render, create a new `Blueprint` or `Web Service` from the GitHub repo.
4. Set these environment variables in Render:
   - `DATABASE_URL` = your Neon connection string
   - `DB_SSL` = `true`
   - `JWT_SECRET` = a strong random value
   - `APP_URL` = your public Render URL, for example `https://lifeclock.onrender.com`
5. If you later enable Google login, also set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL` = `https://your-app.onrender.com/api/auth/google/callback`

## Render Config

This repo already includes `render.yaml`, which defines:

- `npm install` as the build step
- `npm start` as the start command
- `/api/health` as the health check

## Free-Tier Notes

Render documents these important free-tier limits:

- free web services spin down after 15 minutes of inactivity
- free Postgres expires after 30 days unless upgraded

Source: https://render.com/docs/free

Because of the database expiry, Neon is usually the better free Postgres choice for this project.

## After Deploy

Verify:

- `/`
- `/api/health`
- `/calendar.html`
- `/habits.html`
- `/mood.html`

If the frontend looks stale, hard refresh once or unregister the old service worker and reload.
