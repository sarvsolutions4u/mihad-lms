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

**Yes — MongoDB works.** The whole system is built on MongoDB with Mongoose, and the
Atlas free tier is enough for several thousand students, years of attendance and marks.
Uploaded files (notes, papers, receipts) are kept in the same database, capped at 4 MB each —
roughly 1,000+ typical PDFs fit comfortably. For videos, paste a YouTube / Drive link instead.

---

## Who can do what

| | Admin | Teacher | Student | Parent |
|---|---|---|---|---|
| Create accounts | everyone | students only | — | — |
| Enrol a student in subjects | yes | — | — | — |
| Subject page (students, attendance, plans, work) | every subject | own subjects | enrolled subjects (own progress) | children's subjects |
| Student page (attendance, marks, work, parents) | everyone | students in own subjects | self | own children (+ fees) |
| Attendance | mark any subject or a whole-day register | mark own subjects | view own | view child's |
| Lesson planner (dated classes, work, tests) | full | own subjects | view & download | view & download |
| Marks | full | own subjects | view own | view child's |
| Assignments, worksheets | full | own subjects, see & grade submissions | view, upload work | view |
| Notes, question papers, resources | full | own subjects | enrolled subjects | view |
| Fees, payments, receipts | full + overdue alerts | — | — | **view & download receipts** |
| Remove a student | yes | — | — | — |
| Activity logs (sign-ins, active time, uploads, files opened) | everyone | own students only | — | — |
| Announcements | post to any audience | receive | receive | receive |

### Subject enrolment

A student with **no subjects chosen** is enrolled in every subject of their batch. Once the office
picks subjects (People → Edit, the student's page → *Change subjects*, or during bulk upload), the
student and their parent see **only those subjects** — their plans, assignments, notes, papers and
timetable — and each subject's teacher sees only the students enrolled in it.

### Trainers are kept separate

A trainer sees **only their own subjects**: their students, lesson plans, assignments and the
submissions to them, notes and files, marks, attendance, timetable slots and progress reports.
They never see another trainer's subjects, files or account — even for a student they share, the
student page shows only the trainer's own subjects. A file uploaded by one trainer cannot be
opened by another (unless it sits in a subject that has been handed over to them). Every item a
trainer posts must belong to one of their subjects. The admin sees everything.

### Activity logs

*Activity Logs* (admin and trainers) shows, per person: online now / last seen, last sign-in,
**active time** today and over 7/30 days, sign-ins, uploads and posts, work submitted and files
opened — plus a day-by-day chart and a full log (sign-in/out with device, uploads, assignments and
notes posted, submissions, files opened). Active time is counted from a once-a-minute signal sent
while a portal tab is open, visible and in use (5 minutes with no input counts as idle). Trainers see
only the students in their subjects, and only what those students did in the trainer's subjects;
the admin sees everyone, including trainers. Students' pages have an *Activity* tab too.
Logs are kept for about 13 months.

### Programmes and the lesson planner

Every batch, and every student, has a **programme**: *Academic*, *Short-term upskilling* or
*University & Diploma*. It is chosen first when enrolling a student, and the batch list then shows
only batches of that programme.

- **Lesson planner** — teachers plan *sessions* by date, any day up to a year ahead, one date at a
  time or repeating on chosen weekdays. Each session is a **Class** (topic), **Work** (what students
  will do), **Test** (topics, max marks), **Revision** or **No class**, with optional start/end time
  and files. Students and parents see the same planner (week or month view).
- **Attendance follows the planner** — pick a subject and date, open that day's session and mark
  each student. If a class happened that was not planned, add it from the attendance screen.
- **Short-term upskilling** — at enrolment the office sets each course's **total hours**, start date
  and **weekly slots** (day + start/end time). Class slots are generated automatically until the hours
  are covered. Topics are not planned ahead — the teacher records what was covered when marking
  attendance. Hours attended (present/late) are deducted; the student and parent see hours left.
- **Push-forward** — for Short-term and University & Diploma, when a session has only one student and
  that student is marked absent, the session and everything after it moves one slot later, a
  "missed" marker stays on the original date, and no hours are deducted. The teacher can untick this.

### Files (uploads and downloads)

Uploaded files go to **Cloudflare R2** (10 GB free, then about $0.015 per GB a month, no download
fees). The browser uploads straight to R2 with a 15-minute signed link, so files never pass through
Vercel — **up to 100 MB per file**. Every download goes through `/api/files/<id>`, which checks who is
signed in and then redirects to a 5-minute signed link. Fee receipts open only for admins and that
student's parents. PDFs and images open in the browser; everything else downloads.

Until the R2 variables below are set, files are stored in MongoDB instead (4 MB per file), and those
older files keep working after R2 is switched on.

**Setting up R2 (once):**
1. Cloudflare dashboard → **R2** → *Create bucket* `mihad-lms-files`.
2. Bucket → *Settings* → *CORS policy* → paste:
   ```json
   [{ "AllowedOrigins": ["https://mihad-lms.vercel.app"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
   ```
3. R2 → *Manage API tokens* → *Create API token* → **Object Read & Write**, limited to that bucket.
4. Vercel → project → *Settings* → *Environment Variables*: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — then redeploy.
5. Sign in as admin → **Settings** → *Test file storage* should say “All good”.

### Recorded classes (Google Drive) and PDF watermarks

- **Videos:** add a Resource of type *Recorded class / video* with the Google Drive link (shared as
  "Anyone with the link · Viewer", with downloading turned off in Drive's share settings). Students
  press **Watch** and the video plays inside the LMS; Drive's "open in new window" button is covered.
  YouTube links play the same way. Other Drive files (PDF, Docs, Slides) open in the same viewer.
- **PDF watermarks:** PDFs a trainer uploads are stamped on every page with a light diagonal
  "AL MIHAD TRAINING" and *Trainer: <name> | Al Mihad Training Centre*. When a student or parent opens
  opens one, they get their own copy that also says *Issued to <name> (<admission no>) | <date>*.
  Password-protected PDFs can't be stamped and are left as they are (the trainer is told).
  Student work and fee receipts are never watermarked. PDFs linked from Google Drive are not stamped.

### Viewing files inside the portal (view-only for students)

Every uploaded file opens in the portal's own viewer instead of a new tab:

| File | Shown as | Students & parents |
|---|---|---|
| PDF | pages drawn in the viewer (pdf.js, `/public/pdfjs`), zoom, page count | view-only, their name on every page |
| Word (.docx) | converted to a readable page | view-only, their name across the page |
| Video / audio (mp4, mp3) | built-in player | view-only, no download button |
| Pictures | in the viewer | view-only |
| PowerPoint, Excel, older .doc, zip | can't be shown in a browser | can download (ask trainers to upload PDFs instead) |

- **View-only** applies to course material from the office and trainers. Students' own submissions
  and fee receipts stay downloadable. Admin and trainers always have a *Download* button.
- No download/print buttons, right-click, Ctrl+S / Ctrl+P and printing are blocked in the viewer,
  and `?download=1` is refused for learners. Old direct links (`/api/files/<id>`) open the viewer page
  `/view/<id>`. This stops casual saving; a screenshot can't be prevented, which is what the name
  stamp is for.
- The viewer loads PDFs straight from R2 with a 5-minute link (needs `GET` in the bucket's CORS
  policy, as above). If the browser blocks that, files up to 4 MB load through the portal instead.
- Server-side writes to R2 (watermarked copies) send an explicit `Content-Length` — R2 refuses
  chunked uploads with **411**.

### Messages & doubts

Menu → **Messages & Doubts** (red badge = unread). Built for doubt-clearing support on the
short-term playbooks, and works for every programme.

**Raising a doubt from the notes (students and parents)**
- In a PDF, **select a sentence** → a *Raise a doubt* button pops up next to it. Or press
  **Snip & ask** and drag over any part of a page (diagrams, equations, scanned pages).
- In a Word (.docx) file, select text the same way. In a video, press *Ask about this moment*
  (the time is attached). Google Drive / YouTube videos have *Raise a doubt* with an optional time.
- The dialog shows the selected text or snip, and **is addressed automatically to the trainer of
  the subject that file belongs to** (the student can change it, or send it to the office).
  They can add a photo of their working.
- Selecting is allowed so students can ask; **copying is still blocked** in the viewer, and the
  name stamps are left out of the selection.

**Who can talk to whom**

| | can start a conversation with | sees |
|---|---|---|
| Student | trainers of their own subjects, the office | their own conversations |
| Parent | trainers of their children's subjects, the office | their own conversations (not the child's) |
| Trainer | students enrolled in their subjects, the office | only conversations they are in — never another trainer's |
| Admin | anyone (writes as *Al Mihad Office*) | **every conversation** (filter by trainer, doubts, unread) and can reply in any |

- Each doubt shows the file and page (click to open the notes at that page), the quoted text or
  snip, and the conversation. Trainers *Mark answered*; a student's follow-up re-opens it.
- Students see office replies as *Al Mihad Office*; staff see which admin wrote.
- Dashboard: trainers get **Doubts waiting for an answer**; students get **My doubts**.
- Every doubt and reply is also in **Activity Logs → Doubts & messages** (trainers see only
  their own subjects there).
- Files sent in messages (snips, photos, attachments — up to 20 MB) can be opened only by the
  people in that conversation and the admin.
- Data: `Thread` (two sides, subject, status, unread) and `Message` (text, `ref` = file / page /
  video time / quote / snip, attachments). APIs under `/api/messages`.

### Fee alerts

Unpaid fees past their due date turn **overdue** automatically. Admins see a red count on *Fees* in
the menu, an alert card on the dashboard, and an alert bar on the Fees page listing overdue fees and
anything due in the next 7 days.

### Online class links

Type links as they come (`zoom.us/j/…`, `meet.google.com/…`, a Teams link) — they are cleaned up to
open in a new tab, which then hands over to the Zoom / Meet / Teams app. A subject's own link takes
priority over the batch link.

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
      upload/             file upload (stored in MongoDB GridFS)
      files/[id]/         access-checked download
      subjects/ students/ subject and student pages
      alerts/             fee alerts for the office
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
- **Files** — keep uploads to PDFs and documents; link videos from YouTube / Drive. Atlas → your
  cluster → *Collections* → `uploads.files` shows what is stored.
- Connections are pooled and cached (`src/lib/db.js`) so the serverless functions never
  exhaust the Atlas connection limit.
