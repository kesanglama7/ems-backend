/** Notification previews are plain text; the full announcement remains in its detail page. */
export function announcementNotificationContent(title: string, body: string) {
  const preview = (value: string, limit: number) => {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
  };
  return { title: preview(title, 160), message: preview(body, 500) };
}
