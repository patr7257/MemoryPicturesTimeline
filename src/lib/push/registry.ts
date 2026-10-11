// Notification type registry: the single source for the preferences UI, the
// API validation and the dispatcher. A missing notification_prefs row means
// "use defaultEnabled". Adding a type is one entry here, no migration.
export type NotificationTypeDef = {
  label: string;
  description: string;
  defaultEnabled: boolean;
  userCanDisable: boolean;
};

export const NOTIFICATION_TYPES = {
  photos_added: {
    label: "New photos",
    description: "When someone adds photos to a trip.",
    defaultEnabled: true,
    userCanDisable: true,
  },
  trip_created: {
    label: "New trips",
    description: "When someone creates a new trip.",
    defaultEnabled: true,
    userCanDisable: true,
  },
  on_this_day: {
    label: "On this day",
    description: "A daily reminder when a trip happened on today's date in an earlier year.",
    defaultEnabled: true,
    userCanDisable: true,
  },
} as const satisfies Record<string, NotificationTypeDef>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && Object.hasOwn(NOTIFICATION_TYPES, value);
}

export type PrefRow = { type: string; enabled: boolean };

// Effective preference for one type from the user's saved rows.
export function effectivePref(type: NotificationType, rows: PrefRow[]): boolean {
  const def: NotificationTypeDef = NOTIFICATION_TYPES[type];
  if (!def.userCanDisable) return true;
  const row = rows.find((r) => r.type === type);
  return row ? row.enabled : def.defaultEnabled;
}

export function effectivePrefs(rows: PrefRow[]): Record<NotificationType, boolean> {
  const out = {} as Record<NotificationType, boolean>;
  for (const t of NOTIFICATION_TYPE_KEYS) out[t] = effectivePref(t, rows);
  return out;
}
