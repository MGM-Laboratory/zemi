import { redirect } from 'next/navigation';
import { adminRoutes } from '@/lib/admin/nav';

/** /admin/scan without an event: pick one from the events list (each Attendance tab links here). */
export default function ScanIndexPage() {
  redirect(adminRoutes.events);
}
