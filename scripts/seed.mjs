/**
 * Seed the database with the first admin and a realistic demo set-up.
 *
 *   npm run seed
 *
 * Safe to run more than once — existing records are left alone.
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Next.js reads .env.local automatically; this script has to be told.
// Both are loaded so either filename works, with .env.local winning.
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

/* --- minimal copies of the schemas (so the script has no build step) --- */
const userS = new Schema({
  name: String, email: { type: String, unique: true }, passwordHash: String, role: String,
  phone: String, active: { type: Boolean, default: true }, classRoom: ObjectId,
  admissionNo: String, subjects: [ObjectId], children: [ObjectId],
}, { timestamps: true });

const classS = new Schema({
  name: String, academicYear: String, onlineClassLink: String, classTeacher: ObjectId,
  description: String, order: Number,
}, { timestamps: true });

const subjectS = new Schema({
  name: String, code: String, classRoom: ObjectId, teacher: ObjectId, onlineClassLink: String,
}, { timestamps: true });

const slotS = new Schema({
  classRoom: ObjectId, subject: ObjectId, teacher: ObjectId, day: String,
  startTime: String, endTime: String, room: String, onlineClassLink: String,
}, { timestamps: true });

const planS = new Schema({
  classRoom: ObjectId, subject: ObjectId, teacher: ObjectId, weekOf: String, title: String,
  portion: String, plannedDate: String, portionCompleted: Boolean, notesGiven: Boolean,
  examDone: Boolean, examTitle: String, examDate: String, maxMarks: Number, teacherRemark: String,
}, { timestamps: true });

const annS = new Schema({
  title: String, body: String, audiences: [String], classRoom: ObjectId,
  attachments: Array, pinned: Boolean, createdBy: ObjectId,
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userS);
const ClassRoom = mongoose.models.ClassRoom || mongoose.model('ClassRoom', classS);
const Subject = mongoose.models.Subject || mongoose.model('Subject', subjectS);
const TimetableSlot = mongoose.models.TimetableSlot || mongoose.model('TimetableSlot', slotS);
const LessonPlan = mongoose.models.LessonPlan || mongoose.model('LessonPlan', planS);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', annS);

/* ---------------------------------------------------------------- */

const weekStart = () => {
  const d = new Date();
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
};

async function upsertUser({ email, ...rest }, password) {
  const found = await User.findOne({ email });
  if (found) return found;
  return User.create({ email, passwordHash: await bcrypt.hash(password, 10), ...rest });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(`
  MONGODB_URI is missing.

  Looked for it in .env.local and .env inside:
    ${process.cwd()}

  Check that:
    1. You are in the folder that contains package.json
    2. The file is named exactly .env.local  (not .env.local.txt)
       Windows hides known extensions — run  dir /a  to see the real name
    3. The file contains a line starting with  MONGODB_URI=
`);
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  /* 1 — administrator */
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@almihadtraining.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  const admin = await upsertUser(
    { name: process.env.SEED_ADMIN_NAME || 'System Administrator', email: adminEmail, role: 'admin' },
    adminPassword
  );
  console.log(`Admin        ${adminEmail} / ${adminPassword}`);

  /* 2 — three demo batches (rename or add your own under Classes & Subjects) */
  const classDefs = [
    { name: 'GED Preparation', order: 1, description: 'GED exam-prep batch' },
    { name: 'IGCSE Grade 10', order: 2, description: 'Cambridge IGCSE' },
    { name: 'NIOS Senior Secondary', order: 3, description: 'NIOS open schooling — Class 12' },
  ];
  const classes = {};
  for (const c of classDefs) {
    let doc = await ClassRoom.findOne({ name: c.name });
    if (!doc) doc = await ClassRoom.create({ ...c, academicYear: '2026–27', onlineClassLink: '' });
    classes[c.name] = doc;
  }
  console.log(`Classes      ${Object.keys(classes).join(', ')}`);

  /* 3 — teachers */
  const teacherDefs = [
    ['Meera Nair', 'meera.nair@almihadtraining.com'],
    ['Arun Thomas', 'arun.thomas@almihadtraining.com'],
    ['Fatima Yusuf', 'fatima.yusuf@almihadtraining.com'],
    ['Rohit Menon', 'rohit.menon@almihadtraining.com'],
    ['Sana Iqbal', 'sana.iqbal@almihadtraining.com'],
  ];
  const teachers = [];
  for (const [name, email] of teacherDefs) {
    teachers.push(await upsertUser({ name, email, role: 'teacher' }, 'Teacher@123'));
  }
  console.log(`Teachers     ${teachers.length} (password Teacher@123)`);

  /* 4 — subjects per batch, one trainer each */
  const subjectsByClass = {
    'GED Preparation': ['Mathematical Reasoning', 'Reasoning Through Language Arts', 'Science', 'Social Studies'],
    'IGCSE Grade 10': ['English', 'Mathematics', 'Physics', 'Chemistry', 'Business Studies'],
    'NIOS Senior Secondary': ['English', 'Mathematics', 'Accountancy', 'Business Studies', 'Economics'],
  };
  const subjects = {};
  for (const [className, names] of Object.entries(subjectsByClass)) {
    subjects[className] = [];
    for (const [i, name] of names.entries()) {
      let doc = await Subject.findOne({ name, classRoom: classes[className]._id });
      if (!doc) {
        doc = await Subject.create({
          name,
          classRoom: classes[className]._id,
          teacher: teachers[i % teachers.length]._id,
        });
      }
      subjects[className].push(doc);
    }
  }
  console.log('Subjects     4–5 per batch, trainers assigned');

  /* 5 — students, each with a parent */
  const studentDefs = [
    ['Aisha Rahman', 'IGCSE Grade 10', 'AMT-1001', 'Rahman Ali'],
    ['Daniel Joseph', 'IGCSE Grade 10', 'AMT-1002', 'Joseph Mathew'],
    ['Zara Khan', 'IGCSE Grade 10', 'AMT-1003', 'Imran Khan'],
    ['Yusuf Abdullah', 'NIOS Senior Secondary', 'AMT-1201', 'Abdullah Salim'],
    ['Nithya Krishnan', 'NIOS Senior Secondary', 'AMT-1202', 'Krishnan Iyer'],
    ['Leo Fernandes', 'GED Preparation', 'AMT-0901', 'Maria Fernandes'],
    ['Hana Siddiqui', 'GED Preparation', 'AMT-0902', 'Siddiqui Rauf'],
  ];

  let studentCount = 0;
  for (const [name, className, adm, parentName] of studentDefs) {
    const slug = name.toLowerCase().replace(/\s+/g, '.');
    const student = await upsertUser(
      {
        name,
        email: `${slug}@student.almihadtraining.com`,
        role: 'student',
        classRoom: classes[className]._id,
        admissionNo: adm,
      },
      'Student@123'
    );
    studentCount += 1;

    const parentEmail = `${parentName.toLowerCase().replace(/\s+/g, '.')}@parent.almihadtraining.com`;
    const parent = await upsertUser({ name: parentName, email: parentEmail, role: 'parent', children: [] }, 'Parent@123');
    if (!parent.children?.some((c) => String(c) === String(student._id))) {
      parent.children = [...(parent.children || []), student._id];
      await parent.save();
    }
  }
  console.log(`Students     ${studentCount} (Student@123) · parents (Parent@123)`);

  /* 6 — a sample timetable for the IGCSE batch */
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const g10 = classes['IGCSE Grade 10'];
  for (const [i, day] of days.entries()) {
    const subj = subjects['IGCSE Grade 10'][i];
    const exists = await TimetableSlot.findOne({ classRoom: g10._id, day, startTime: '16:00' });
    if (!exists) {
      await TimetableSlot.create({
        classRoom: g10._id,
        subject: subj._id,
        teacher: subj.teacher,
        day,
        startTime: '16:00',
        endTime: '17:30',
        room: 'Room 2',
      });
    }
  }
  console.log('Timetable    IGCSE Grade 10, Mon–Fri 16:00');

  /* 7 — this week's lesson plans for the IGCSE batch */
  const monday = weekStart();
  for (const [i, subj] of subjects['IGCSE Grade 10'].entries()) {
    const exists = await LessonPlan.findOne({ subject: subj._id, weekOf: monday });
    if (!exists) {
      await LessonPlan.create({
        classRoom: g10._id,
        subject: subj._id,
        teacher: subj.teacher,
        weekOf: monday,
        title: `Week plan — ${subj.name}`,
        portion: `Chapter ${i + 3}: introduction, worked examples and practice questions.`,
        plannedDate: monday,
        portionCompleted: i < 2,
        notesGiven: i < 2,
        examDone: false,
        examTitle: `${subj.name} weekly test`,
        maxMarks: 25,
      });
    }
  }
  console.log(`Lesson plans week of ${monday}`);

  /* 8 — a welcome announcement */
  if (!(await Announcement.findOne({ title: 'Welcome to the Al Mihad Learning Portal' }))) {
    await Announcement.create({
      title: 'Welcome to the Al Mihad Learning Portal',
      body:
        'Trainers: please upload your weekly lesson plan every Monday and tick off each portion as it is completed.\n' +
        'Parents: attendance, marks and fee details are now visible under your login.',
      audiences: ['all'],
      pinned: true,
      createdBy: admin._id,
    });
  }
  console.log('Announcement posted\n');

  console.log('Seed complete. Sign in with the admin account above.\n');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
