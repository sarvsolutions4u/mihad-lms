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

    // parent-only — one parent may have several children
    children: [{ type: ObjectId, ref: 'User', index: true }],

    lastLoginAt: Date,
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
    title: { type: String, required: true, trim: true },
    portion: { type: String, trim: true, default: '' }, // what is planned to be covered
    plannedDate: { type: String, default: '' },

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
