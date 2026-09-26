import type { Metadata } from 'next';
import { AttendanceBoard } from '@/components/admin/people/attendance/attendance-board';

export const metadata: Metadata = { title: 'Attendance' };

export default function EventAttendancePage() {
  return <AttendanceBoard />;
}
