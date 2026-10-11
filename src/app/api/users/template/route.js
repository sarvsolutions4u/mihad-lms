import { requireSession } from '@/lib/auth';
import { buildTemplate } from '@/lib/sheet';
import { handleError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Download a ready-made Excel template for the bulk student upload. */
export async function GET() {
  try {
    await requireSession(['admin', 'teacher']);
    const wb = await buildTemplate();
    const buf = await wb.xlsx.writeBuffer();

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="student-upload-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
