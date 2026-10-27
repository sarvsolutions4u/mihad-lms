import { Fee } from '@/models';
import { todayISO } from '@/lib/api';

/** Mark unpaid fees past their due date as overdue. Cheap; safe to call often. */
export async function refreshOverdueFees(today = todayISO()) {
  await Fee.updateMany(
    { status: { $in: ['pending', 'partial'] }, dueDate: { $ne: '', $lt: today } },
    { $set: { status: 'overdue' } }
  );
}

export const feeBalance = (f) => Math.max(0, (f.amount || 0) - (f.paidAmount || 0));
