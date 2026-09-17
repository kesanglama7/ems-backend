export function nextBirthday(dateOfBirth: Date, today: Date) {
  const month = dateOfBirth.getUTCMonth();
  const day = dateOfBirth.getUTCDate();
  const occurrence = (year: number) => {
    // Celebrate Feb 29 birthdays on Feb 28 in non-leap years.
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
  };
  let date = occurrence(today.getUTCFullYear());
  if (date < today) date = occurrence(today.getUTCFullYear() + 1);
  return {
    date,
    daysUntil: Math.round((date.getTime() - today.getTime()) / 86400000),
  };
}
