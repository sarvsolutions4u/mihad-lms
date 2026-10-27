import { dbConnect } from '@/lib/db';
import { Fee } from '@/models';
import { requireSession } from '@/lib/auth';
import { ok, handleError, todayISO, addDaysISO } from '@/lib/api';
import { refreshOverdueFees, feeBalance } from '@/lib/fees';

export const dynamic = 'force-dynamic';

const balance = feeBalance;

/**
 * Fee alerts for the office.
 *   overdue  — unpaid and past the due date
 *   dueSoon  — unpaid and due within the next 7 days
 */
export async function GET() {
  try {
    await requireSession(['admin']);
    await dbConnect();

    const today = todayISO();
    await refreshOverdueFees(today);

    const populate = { path: 'student', select: 'name admissionNo classRoom', populate: { path: 'classRoom', select: 'name' } };
    const [overdue, dueSoon] = await Promise.all([
      Fee.find({ status: 'overdue' }).sort('dueDate').populate(populate).lean(),
      Fee.find({ status: { $in: ['pending', 'partial'] }, dueDate: { $gte: today, $lte: addDaysISO(today, 7) } })
        .sort('dueDate')
        .populate(populate)
        .lean(),
    ]);

    return ok({
      today,
      overdue: overdue.map((f) => ({ ...f, balance: balance(f) })),
      dueSoon: dueSoon.map((f) => ({ ...f, balance: balance(f) })),
      overdueTotal: overdue.reduce((s, f) => s + balance(f), 0),
      dueSoonTotal: dueSoon.reduce((s, f) => s + balance(f), 0),
      count: overdue.length + dueSoon.length,
    });
  } catch (err) {
    return handleError(err);
  }
}
