# Al Mihad Training Centre — Learning Portal (LMS)

A complete, dynamic learning management system for **Al Mihad Training Centre, Sharjah**,
in the Al Mihad maroon-and-gold brand, built to run entirely on **free hosting and a free database**.

Same build as the Intellectuals LMS (Next.js + MongoDB Atlas + Vercel) — only the brand,
copy and demo data differ, so fixes made in one codebase can be copied straight across.

| Piece | Service | Free allowance |
|---|---|---|
| Code | **GitHub** | Unlimited private repositories |
| Hosting | **Vercel** (Hobby) | 100 GB bandwidth/month, unlimited deployments, free HTTPS |
| Database | **MongoDB Atlas M0** | 512 MB storage, shared cluster, no credit card |
| File storage *(optional)* | **Cloudinary** | 25 GB storage + 25 GB bandwidth/month |

**Yes — MongoDB works.** The whole system is built on MongoDB with Mongoose, and the
Atlas free tier is enough for several thousand students, years of attendance and marks.
512 MB only becomes a problem if you store the *files themselves* in the database — so
this app never does. Files go to Cloudinary, or you simply paste a Google Drive /
OneDrive / YouTube link, which costs nothing at all.

---

## Who can do what

| | Admin | Teacher | Student | Parent |
|---|---|---|---|---|
| Create accounts | everyone | students only | — | — |
| Classes, subjects, online class links | create & edit | view | view | view |
| Timetable | create & edit | view | view | view |
| Attendance | mark & edit | view class | view own | view child's |
| Lesson plans + tick boxes | full | own subjects | view | view |
| Marks | full | own subjects | view own | view child's |
| Assignments, worksheets, resources | full | own subjects | view & submit | view |
| Fee details | full | — | — | **view only (parents)** |
| Announcements | post to any audience | receive | receive | receive |

Fees are deliberately invisible to teachers and students — exactly as specified.

---

## The weekly teaching loop

1. The teacher uploads the **lesson plan** for the week (class, subject, portion, planned date).
2. Three tick boxes appear on that plan: **Portion completed**, **Notes given**, **Exam done**.
3. **Enter marks** opens the whole class list; marks are typed straight in and saved in one go.
4. Students and parents see the same plan, the ticks and the marks — live, with a progress bar.
5. **Progress Reports** rolls it all up per subject: portions covered, notes, exam average, attendance.

---

## Setting it up — step by step, all free

### 1. Create the database (5 minutes)

1. Go to <https://www.mongodb.com/cloud/atlas/register> and sign up.
2. **Create a deployment → M0 (Free)**. Pick a region near the UAE, such as *Mumbai (ap-south-1)*.
3. Under **Database Access**, add a user — note the username and password.
4. Under **Network Access**, click **Add IP Address → Allow access from anywhere**
   (`0.0.0.0/0`). Vercel's servers do not have fixed IPs, so this is required.
5. Click **Connect → Drivers** and copy the connection string. It looks like:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<password>`, and insert the database name before the `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mihad_lms?retryWrites=true&w=majority
   ```

### 2. Run it on your own machine first

```bash
npm install
cp .env.example .env.local        # then fill in MONGODB_URI and AUTH_SECRET
npm run seed                      # creates the admin + demo data
npm run dev                       # http://localhost:3000
```

Generate the auth secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Put the code on GitHub

```bash
git init
git add .
git commit -m "Al Mihad LMS"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/mihad-lms.git
git push -u origin main
```

`.env.local` is already in `.gitignore`, so your database password is never pushed.

### 4. Deploy on Vercel

1. Sign in at <https://vercel.com> with your GitHub account.
2. **Add New → Project →** import `mihad-lms`. Vercel detects Next.js on its own.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `MONGODB_URI` — the Atlas string from step 1
   - `AUTH_SECRET` — the long random string
   - *(optional)* the three `CLOUDINARY_*` keys
4. **Deploy.** You get a live HTTPS address such as `mihad-lms.vercel.app`.

Every later `git push` redeploys automatically.

### 5. Add your own domain (optional)

Vercel → **Settings → Domains → Add**, then point the domain's DNS at Vercel.
The SSL certificate is issued free and renews itself.

---

## Bulk upload of students from Excel

**People → Bulk upload students.** Download the template, or use any sheet whose first
row has these headings (spaces and capitals do not matter):

| Name* | Email* | Password | Admission No | Phone | Parent Name | Parent Email | Parent Phone |
|---|---|---|---|---|---|---|---|

\* required. When **Parent Email** is filled in, a parent account is created and linked to
that child automatically. Blank passwords fall back to the default you set on the upload
screen. Rows that are already in the system are skipped and reported back to you, so the
same file can safely be uploaded twice.

---

## Adding your logo

The official Mihad Training logo is already included:

| File | Used on |
|---|---|
| `public/logo-white.png` | maroon sidebar and sign-in panel (white text, gold tagline) |
| `public/logo.png` | light backgrounds — mobile sign-in and mobile header |
| `src/app/icon.png`, `src/app/apple-icon.png` | browser tab and phone home-screen icon |

To update the logo, replace those files with new ones of the same name.

### Brand colours

Defined once in `tailwind.config.js`:

| Token | Hex | Used for |
|---|---|---|
| `maroon` | `#7A121D` | sidebar, login panel, headings, primary buttons |
| `gold` | `#C9A227` | active menu item, highlights, tagline |
| `cream` | `#FBF6E9` | warm panels and the sign-in background |

---

## Demo accounts created by `npm run seed`

| Role | Email | Password |
|---|---|---|
| Admin | `admin@almihadtraining.com` | `Admin@12345` |
| Teacher | `meera.nair@almihadtraining.com` | `Teacher@123` |
| Student | `aisha.rahman@student.almihadtraining.com` | `Student@123` |
| Parent | `rahman.ali@parent.almihadtraining.com` | `Parent@123` |

**Change the admin password immediately after the first sign-in** (Settings → Change password).

---

## Project layout

```
src/
  app/
    login/                sign-in screen
    (dash)/               everything behind the login
      dashboard/ timetable/ attendance/ lesson-plans/
      assignments/ resources/ reports/ announcements/
      fees/ people/ classes/ settings/
    api/
      auth/               login, logout, me, password
      records/[model]/    one generic, role-scoped CRUD API for every collection
      attendance/bulk     mark a whole class at once
      marks/bulk          enter a whole class's marks at once
      users/bulk-upload   Excel import
      users/template      download the Excel template
      upload/             Cloudinary upload (optional)
      dashboard/          role-aware summary
      report/[studentId]/ the progress report
  components/             UI kit, app shell, session provider
  lib/                    db, auth, access rules, helpers
  models/                 all Mongoose schemas
scripts/seed.mjs          first admin + demo data
```

### How the permissions work

Every collection has one entry in `src/lib/access.js` naming who may read it, who may
write it, and a **scope filter** that is merged into every query. A student's query for
marks silently becomes "marks where student = me"; a parent's becomes "where student is
one of my children"; a teacher's becomes "where subject is one I am assigned to". Because
the filter is applied on the server for every request, nothing leaks even if someone edits
the URL by hand.

---

## Staying inside the free tiers

- **Atlas M0 (512 MB)** — text records only. Roughly: 10,000 attendance rows ≈ 2 MB. You
  will not run out for years.
- **Vercel Hobby** — fine for a training centre's traffic. It is for non-commercial use;
  if Vercel ever asks you to move to a paid plan, the same code runs unchanged on
  Render, Netlify or Railway.
- **Cloudinary** — only needed if you want files hosted by the app. Pasting Drive or
  YouTube links keeps you at zero forever.
- Connections are pooled and cached (`src/lib/db.js`) so the serverless functions never
  exhaust the Atlas connection limit.
