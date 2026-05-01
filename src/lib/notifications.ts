type NotificationLike = {
  id: string;
  type: string;
  message: string;
  reference_id: string | null;
  created_at: string;
  read: boolean;
};

const DUPLICATE_WINDOW_MS = 60 * 1000;

export function dedupeNotifications<T extends NotificationLike>(items: T[]): T[] {
  const seenByKey = new Map<string, number>();
  const deduped: T[] = [];

  for (const item of items) {
    const timestamp = new Date(item.created_at).getTime();
    const key = `${item.type}|${item.reference_id ?? "none"}|${item.message.trim().toLowerCase()}`;
    const seenAt = seenByKey.get(key);

    if (seenAt !== undefined && Math.abs(seenAt - timestamp) <= DUPLICATE_WINDOW_MS) {
      continue;
    }

    seenByKey.set(key, timestamp);
    deduped.push(item);
  }

  return deduped;
}
