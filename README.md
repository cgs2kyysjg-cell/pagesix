# Page 6 Party

A headline-submission site for a party. Guests submit "scoops" via a popup form;
the host reads them via a password-protected admin table.

Stack: static HTML + tiny Express server + Render Postgres.

## Deploy

### 1. Push to GitHub

```bash
cd outputs
git init
git add .
git commit -m "Initial commit"
git branch -M main
# create an empty repo on github.com first, then:
git remote add origin git@github.com:YOUR-USER/page-six-party.git
git push -u origin main
```

### 2. Deploy on Render

1. Go to https://dashboard.render.com/blueprints and click **New Blueprint Instance**.
2. Connect your GitHub repo. Render reads `render.yaml` and proposes a web service plus a free Postgres database.
3. Approve. First deploy takes ~3 minutes.
4. When it's up, click into the web service, open the **Environment** tab, and copy the auto-generated `ADMIN_PASSWORD` value. Keep it somewhere safe — that's the admin login password.

### 3. Use it

- The party site lives at your Render URL, e.g. `https://page-six-party.onrender.com`.
- The admin view is the same URL with `#admin` appended (or click the small "Admin" link in the footer). Enter the password copied above to see the table of submissions.

## Local development

```bash
npm install
ADMIN_PASSWORD=test \
DATABASE_URL=postgres://localhost/page_six \
npm start
# visit http://localhost:10000
```

## Notes

- **Free web service sleeps after 15 min** of inactivity. First request after sleep takes ~30s to wake. Visit the site 5 minutes before guests arrive to pre-warm it.
- **Free Postgres expires after 90 days**. After that, upgrade to the $7/month tier or migrate. Fine for a one-off party.
- All submissions live in the `tips` table. Use `Export CSV` in the admin view to save a backup.
