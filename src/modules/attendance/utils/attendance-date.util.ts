export function getDatePartsInTimezone(
  date: Date,
  timezone: string,
) {
  const formatter = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  );

  const parts = formatter.formatToParts(date);

  const year = Number(
    parts.find((part) => part.type === 'year')
      ?.value,
  );

  const month = Number(
    parts.find((part) => part.type === 'month')
      ?.value,
  );

  const day = Number(
    parts.find((part) => part.type === 'day')
      ?.value,
  );

  return {
    year,
    month,
    day,
  };
}

export function getNormalizedWorkDate(
  date: Date,
  timezone: string,
): Date {
  const { year, month, day } =
    getDatePartsInTimezone(
      date,
      timezone,
    );

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0,
    ),
  );
}

export function getWeekdayInTimezone(
  date: Date,
  timezone: string,
): string {
  return new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: timezone,
      weekday: 'long',
    },
  )
    .format(date)
    .toUpperCase();
}

export function getTimeInTimezone(
  date: Date,
  timezone: string,
) {
  const formatter = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    },
  );

  const parts = formatter.formatToParts(date);

  const hour = Number(
    parts.find((part) => part.type === 'hour')
      ?.value,
  );

  const minute = Number(
    parts.find((part) => part.type === 'minute')
      ?.value,
  );

  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
  };
}

export function timeStringToMinutes(
  time: string,
): number {
  const [hours, minutes] =
    time.split(':').map(Number);

  return hours * 60 + minutes;
}