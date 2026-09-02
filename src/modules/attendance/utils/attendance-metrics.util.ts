export interface AttendanceMetrics {
  isLate: boolean;
  lateMinutes: number;
  earlyMinutes: number;
  afterHoursMinutes: number;
  totalMinutes: number | null;
  overtimeMinutes: number | null;
  scheduledMinutes: number;
}

export interface CalculateAttendanceMetricsParams {
  checkInAt: Date;
  checkOutAt: Date | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  gracePeriodMinutes: number;
}

/**
 * Centralized calculation of all attendance metrics.
 * Reused by employee checkout, admin manual creation, and admin correction.
 */
export function calculateAttendanceMetrics(
  params: CalculateAttendanceMetricsParams,
): AttendanceMetrics {
  const {
    checkInAt,
    checkOutAt,
    scheduledStartAt,
    scheduledEndAt,
    gracePeriodMinutes,
  } = params;

  const scheduledMinutes = Math.floor(
    (scheduledEndAt.getTime() - scheduledStartAt.getTime()) / 60000,
  );

  // Early minutes: how much before scheduled start the employee checked in
  const earlyMinutes =
    checkInAt < scheduledStartAt
      ? Math.floor((scheduledStartAt.getTime() - checkInAt.getTime()) / 60000)
      : 0;

  // Late calculation: allowed start = scheduledStart + grace period
  const allowedStartMs =
    scheduledStartAt.getTime() + gracePeriodMinutes * 60000;
  const isLate = checkInAt.getTime() > allowedStartMs;
  const lateMinutes = isLate
    ? Math.floor((checkInAt.getTime() - allowedStartMs) / 60000)
    : 0;

  // Total and overtime (only when checked out)
  let totalMinutes: number | null = null;
  let overtimeMinutes: number | null = null;
  let afterHoursMinutes = 0;

  if (checkOutAt) {
    totalMinutes = Math.max(
      0,
      Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000),
    );

    overtimeMinutes = Math.max(0, totalMinutes - scheduledMinutes);

    if (checkOutAt > scheduledEndAt) {
      afterHoursMinutes = Math.floor(
        (checkOutAt.getTime() - scheduledEndAt.getTime()) / 60000,
      );
    }
  }

  return {
    isLate,
    lateMinutes,
    earlyMinutes,
    afterHoursMinutes,
    totalMinutes,
    overtimeMinutes,
    scheduledMinutes,
  };
}
