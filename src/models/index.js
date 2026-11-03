import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;
const ObjectId = Schema.Types.ObjectId;

/* ------------------------------------------------------------------ */
/* Shared constants                                                    */
/* ------------------------------------------------------------------ */

export const ROLES = ['admin', 'teacher', 'student', 'parent'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const ATTENDANCE_STATUS = ['present', 'absent', 'late', 'excused'];
export const RESOURCE_TYPES = ['note', 'pdf', 'doc', 'ppt', 'paper', 'video', 'link', 'image', 'other'];
export const PAYMENT_METHODS = ['cash', 'card', 'bank transfer', 'cheque', 'online', 'other'];
export const TASK_TYPES = ['assignment', 'worksheet'];
export const AUDIENCES = ['all', 'teachers', 'students', 'parents'];
export const FEE_STATUS = ['pending', 'partial', 'paid', 'overdue'];
export const PROGRAM_TYPES = ['academic', 'short_term', 'university'];
export const PROGRAM_LABEL = { academic: 'Academic', short_term: 'Short-term upskilling', university: 'University & Diploma' };
export const SESSION_KINDS = ['class', 'work', 'test', 'revision', 'holiday'];
export const SESSION_STATUS = ['scheduled', 'done', 'missed', 'cancelled'];

/** Monday of the week for a "YYYY-MM-DD" date. */
const mondayOf = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().slice(0, 10);
};
const minutesBetween = (a, b) => {
  const m = (t) => (/^\d{1,2}:\d{2}$/.test(t || '') ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : null);
  const x = m(a);
  const y = m(b);
  return x !== null && y !== null && y > x ? y - x : 0;
};

/** "YYYY-MM-DD" today in Dubai — used to work out overdue fees. */
const dubaiToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );

/** A file stored in the app (/api/files/…) or an outside link. */
const FileRefSchema = new Schema(
  {
    url: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

/* ------------------------------------------------------------------ */
/* 1. User — admin / teacher / student / parent in one collection      */
/* ------------------------------------------------------------------ */

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    phone: { type: String, trim: true },
    active: { type: Boolean, default: true },

    // student-only
    classRoom: { type: ObjectId, ref: 'ClassRoom', index: true },
    admissionNo: { type: String, trim: true },
    // student: the subjects they are enrolled in. Empty = every subject of their class.
    subjects: [{ type: ObjectId, ref: 'Subject', index: true }],
    programType: { type: String, enum: PROGRAM_TYPES, default: 'academic' },

    // short-term / one-to-one courses: total hours and the student's weekly time slots
    courses: [
      {
        subject: { type: ObjectId, ref: 'Subject' },
        totalHours: { type: Number, default: 0, min: 0 },
        startDate: { type: String, default: '' }, // "YYYY-MM-DD"
        slots: [
          {
            day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
            startTime: { type: String, default: '' },
            endTime: { type: String, default: '' },
            _id: false,
          },
        ],
      },
    ],

    // parent-only — one parent may have several children
    children: [{ type: ObjectId, ref: 'User', index: true }],

    lastLoginAt: Date,
    lastSeenAt: Date,
  },
  { timestamps: true }
);

UserSchema.index({ role: 1, classRoom: 1 });

/* ------------------------------------------------------------------ */
/* 2. ClassRoom — a batch, e.g. GED / IGCSE 10                        */
/* ------------------------------------------------------------------ */

const ClassRoomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // "GED Preparation", "IGCSE Grade 10", …
    academicYear: { type: String, trim: true, default: '' },
    // Fixed meeting link for the whole class — no confusion later.
    onlineClassLink: { type: String, trim: true, default: '' },
    classTeacher: { type: ObjectId, ref: 'User' },
    description: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    programType: { type: String, enum: PROGRAM_TYPES, default: 'academic' },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* 3. Subject — created per class, a teacher is assigned               */
/* ------------------------------------------------------------------ */

const SubjectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: '' },
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    teacher: { type: ObjectId, ref: 'User', index: true },
    onlineClassLink: { type: String, trim: true, default: '' }, // optional subject-level override
  },
  { timestamps: true }
);

SubjectSchema.index({ classRoom: 1, name: 1 }, { unique: true });

/* ------------------------------------------------------------------ */
/* 4. TimetableSlot — admin maintained                                 */
/* ------------------------------------------------------------------ */

const TimetableSlotSchema = new Schema(
  {
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    subject: { type: ObjectId, ref: 'Subject', required: true },
    teacher: { type: ObjectId, ref: 'User' },
    day: { type: String, enum: DAYS, required: true },
    startTime: { type: String, required: true }, // "16:00"
    endTime: { type: String, required: true },   // "17:00"
    room: { type: String, trim: true, default: '' },
    onlineClassLink: { type: String, trim: true, default: '' }, // overrides class link if set
  },
  { timestamps: true }
);

TimetableSlotSchema.index({ classRoom: 1, day: 1, startTime: 1 });

/* ------------------------------------------------------------------ */
/* 5. Attendance — admin maintained, one row per student per date      */
/* ------------------------------------------------------------------ */

const AttendanceSchema = new Schema(
  {
    student: { type: ObjectId, ref: 'User', required: true, index: true },
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    subject: { type: ObjectId, ref: 'Subject' },
    date: { type: String, required: true, index: true }, // "YYYY-MM-DD" — simple and timezone-proof
    status: { type: String, enum: ATTENDANCE_STATUS, default: 'present' },
    remark: { type: String, trim: true, default: '' },
    markedBy: { type: ObjectId, ref: 'User' },
    lessonPlan: { type: ObjectId, ref: 'LessonPlan', index: true }, // the session it was marked against
  },
  { timestamps: true }
);

AttendanceSchema.index({ student: 1, date: 1, subject: 1 }, { unique: true });

/* ------------------------------------------------------------------ */
/* 6. Fee — admin maintained, visible to the parent (and admin) only   */
/* ------------------------------------------------------------------ */

const FeeSchema = new Schema(
  {
    student: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true }, // "Term 1 tuition"
    amount: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'AED' },
    dueDate: { type: String, default: '' }, // "YYYY-MM-DD"
    paidDate: { type: String, default: '' },
    status: { type: String, enum: FEE_STATUS, default: 'pending' },
    note: { type: String, trim: true, default: '' },
    receiptNo: { type: String, trim: true, default: '' },

    // every payment received, each with its own receipt file
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        date: { type: String, default: '' }, // "YYYY-MM-DD"
        method: { type: String, trim: true, default: 'cash' },
        receiptNo: { type: String, trim: true, default: '' },
        note: { type: String, trim: true, default: '' },
        receipt: { type: FileRefSchema, default: undefined },
        recordedBy: { type: ObjectId, ref: 'User' },
        recordedAt: { type: Date, default: Date.now },
      },
    ],
    // invoices or other documents for this fee
    attachments: [FileRefSchema],
  },
  { timestamps: true }
);

FeeSchema.index({ status: 1, dueDate: 1 });

/** Work out paid amount and status, so they can never drift out of step. */
export function computeFeeStatus(fee, today = dubaiToday()) {
  const amount = Number(fee.amount) || 0;
  const paid = Number(fee.paidAmount) || 0;
  if (amount > 0 && paid >= amount) return 'paid';
  if (fee.dueDate && fee.dueDate < today) return 'overdue';
  if (paid > 0) return 'partial';
  return 'pending';
}

FeeSchema.pre('save', function feeTotals() {
  if (this.payments?.length) {
    this.paidAmount = this.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const last = [...this.payments].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
    if (last?.date) this.paidDate = last.date;
    if (last?.receiptNo) this.receiptNo = last.receiptNo;
  }
  this.status = computeFeeStatus(this);
});

/* ------------------------------------------------------------------ */
/* 7. LessonPlan — the heart of the weekly reporting loop              */
/*    Teacher uploads the plan; then ticks portion completed /         */
/*    notes given / exam done, and enters marks against it.            */
/* ------------------------------------------------------------------ */

const LessonPlanSchema = new Schema(
  {
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    subject: { type: ObjectId, ref: 'Subject', required: true, index: true },
    teacher: { type: ObjectId, ref: 'User', required: true, index: true },

    weekOf: { type: String, required: true, index: true }, // Monday of the week, "YYYY-MM-DD"
    title: { type: String, required: true, trim: true }, // topic / what the session is about
    portion: { type: String, trim: true, default: '' }, // what students will do
    plannedDate: { type: String, default: '' },

    // dated sessions (the lesson planner)
    date: { type: String, default: '', index: true }, // "YYYY-MM-DD"
    startTime: { type: String, default: '' }, // "16:00"
    endTime: { type: String, default: '' },
    kind: { type: String, enum: SESSION_KINDS, default: 'class' },
    status: { type: String, enum: SESSION_STATUS, default: 'scheduled', index: true },
    durationMins: { type: Number, default: 0 },
    students: [{ type: ObjectId, ref: 'User', index: true }], // one-to-one sessions; empty = everyone enrolled
    pushedFrom: { type: String, default: '' }, // original date if moved forward

    // the tick boxes that appear once the plan is uploaded
    portionCompleted: { type: Boolean, default: false },
    notesGiven: { type: Boolean, default: false },
    examDone: { type: Boolean, default: false },

    examTitle: { type: String, trim: true, default: '' },
    examDate: { type: String, default: '' },
    maxMarks: { type: Number, default: 0 },

    teacherRemark: { type: String, trim: true, default: '' },
    attachments: [FileRefSchema], // plan document, notes, slides…
    completedAt: Date,
  },
  { timestamps: true }
);

LessonPlanSchema.index({ subject: 1, weekOf: 1 });
LessonPlanSchema.index({ subject: 1, date: 1 });

const KIND_TITLE = { class: 'Class', work: 'Work session', test: 'Test', revision: 'Revision', holiday: 'No class' };

LessonPlanSchema.pre('validate', function sessionDefaults() {
  if (!this.date && this.plannedDate) this.date = this.plannedDate;
  if (!this.date && this.weekOf) this.date = this.weekOf;
  if (this.date) {
    this.plannedDate = this.date;
    this.weekOf = mondayOf(this.date);
  }
  if (!this.title || !String(this.title).trim()) this.title = KIND_TITLE[this.kind] || 'Class';
  this.durationMins = minutesBetween(this.startTime, this.endTime);
  if (this.kind === 'test') {
    if (!this.examTitle) this.examTitle = this.title;
    if (!this.examDate && this.date) this.examDate = this.date;
  }
});

/* ------------------------------------------------------------------ */
/* 8. Mark — a score for one student against one lesson plan / exam    */
/* ------------------------------------------------------------------ */

const MarkSchema = new Schema(
  {
    student: { type: ObjectId, ref: 'User', required: true, index: true },
    lessonPlan: { type: ObjectId, ref: 'LessonPlan', index: true },
    subject: { type: ObjectId, ref: 'Subject', required: true, index: true },
    classRoom: { type: ObjectId, ref: 'ClassRoom', index: true },
    examTitle: { type: String, trim: true, default: '' },
    date: { type: String, default: '' },
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 100 },
    remark: { type: String, trim: true, default: '' },
    enteredBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

MarkSchema.index({ student: 1, lessonPlan: 1 }, { unique: true, sparse: true });

/* ------------------------------------------------------------------ */
/* 9. Resource — notes, pdf, doc, ppt, video, links per subject        */
/* ------------------------------------------------------------------ */

const ResourceSchema = new Schema(
  {
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    subject: { type: ObjectId, ref: 'Subject', index: true },
    type: { type: String, enum: RESOURCE_TYPES, default: 'note' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    uploadedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* 10. Task — assignments and worksheets, with a deadline              */
/* ------------------------------------------------------------------ */

const TaskSchema = new Schema(
  {
    classRoom: { type: ObjectId, ref: 'ClassRoom', required: true, index: true },
    subject: { type: ObjectId, ref: 'Subject', required: true, index: true },
    type: { type: String, enum: TASK_TYPES, default: 'assignment' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    deadline: { type: String, default: '' }, // "YYYY-MM-DD"
    maxMarks: { type: Number, default: 0 },
    attachmentUrl: { type: String, trim: true, default: '' },
    attachmentName: { type: String, trim: true, default: '' },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* 11. Submission — a student's response to a task (light-weight)      */
/* ------------------------------------------------------------------ */

const SubmissionSchema = new Schema(
  {
    task: { type: ObjectId, ref: 'Task', required: true, index: true },
    student: { type: ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
    submittedAt: { type: Date, default: Date.now },
    score: { type: Number },
    feedback: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

SubmissionSchema.index({ task: 1, student: 1 }, { unique: true });

/* ------------------------------------------------------------------ */
/* 12. Announcement — admin posts to a chosen audience                 */
/* ------------------------------------------------------------------ */

const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: '' },
    audiences: [{ type: String, enum: AUDIENCES }], // ['teachers'] | ['students','parents'] | ['all']
    classRoom: { type: ObjectId, ref: 'ClassRoom' }, // optional — limit to one class
    attachments: [
      {
        type: { type: String, enum: RESOURCE_TYPES, default: 'link' },
        url: String,
        name: String,
      },
    ],
    pinned: { type: Boolean, default: false },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* 13. StoredFile — an uploaded file kept in Cloudflare R2             */
/* ------------------------------------------------------------------ */

const StoredFileSchema = new Schema(
  {
    _id: { type: String }, // random 32-hex id used in /api/files/<id>
    key: { type: String, required: true }, // object key in the bucket
    name: { type: String, required: true, trim: true },
    size: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/octet-stream' },
    purpose: { type: String, default: 'general' }, // general | fee | submission
    student: { type: ObjectId, ref: 'User' }, // for fee files
    uploadedBy: { type: ObjectId, ref: 'User' },
    role: { type: String },
    status: { type: String, enum: ['pending', 'ready'], default: 'pending', index: true },
    // PDF watermark: 'done' | 'protected' (password-protected, left as is) | '' (not a PDF / not needed)
    watermark: { type: String, default: '' },
    uploaderName: { type: String, default: '' },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/* Activity — sign-ins, uploads, downloads, submissions, active time   */
/* ------------------------------------------------------------------ */

export const ACTIVITY_TYPES = ['login', 'logout', 'upload', 'post', 'submit', 'download'];

const ActivitySchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    role: String,
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    at: { type: Date, default: Date.now },
    name: { type: String, default: '' }, // file name or title
    detail: { type: String, default: '' }, // e.g. "Assignment", "Notes", purpose
    fileId: String,
    fileOwner: { type: ObjectId, ref: 'User' }, // who uploaded the file (downloads)
    subject: { type: ObjectId, ref: 'Subject' },
    device: { type: String, default: '' },
  },
  { versionKey: false }
);
ActivitySchema.index({ user: 1, at: -1 });
ActivitySchema.index({ at: -1 });
ActivitySchema.index({ at: 1 }, { expireAfterSeconds: 400 * 24 * 3600, name: 'ttl_400d' }); // keep ~13 months

/** Minutes a person was active on the portal, per day (Dubai date). */
const DailyActiveSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    role: String,
    date: { type: String, required: true },
    minutes: { type: Number, default: 0 },
    first: Date,
    last: Date,
  },
  { versionKey: false }
);
DailyActiveSchema.index({ user: 1, date: 1 }, { unique: true });
DailyActiveSchema.index({ date: 1 });

/* ------------------------------------------------------------------ */

export const User = models.User || model('User', UserSchema);
export const ClassRoom = models.ClassRoom || model('ClassRoom', ClassRoomSchema);
export const Subject = models.Subject || model('Subject', SubjectSchema);
export const TimetableSlot = models.TimetableSlot || model('TimetableSlot', TimetableSlotSchema);
export const Attendance = models.Attendance || model('Attendance', AttendanceSchema);
export const Fee = models.Fee || model('Fee', FeeSchema);
export const LessonPlan = models.LessonPlan || model('LessonPlan', LessonPlanSchema);
export const Mark = models.Mark || model('Mark', MarkSchema);
export const Resource = models.Resource || model('Resource', ResourceSchema);
export const Task = models.Task || model('Task', TaskSchema);
export const Submission = models.Submission || model('Submission', SubmissionSchema);
export const Announcement = models.Announcement || model('Announcement', AnnouncementSchema);
export const StoredFile = models.StoredFile || model('StoredFile', StoredFileSchema);
export const Activity = models.Activity || model('Activity', ActivitySchema);
export const DailyActive = models.DailyActive || model('DailyActive', DailyActiveSchema);

export const MODELS = {
  users: User,
  classrooms: ClassRoom,
  subjects: Subject,
  timetable: TimetableSlot,
  attendance: Attendance,
  fees: Fee,
  lessonplans: LessonPlan,
  marks: Mark,
  resources: Resource,
  tasks: Task,
  submissions: Submission,
  announcements: Announcement,
};
