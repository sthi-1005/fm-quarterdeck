import { createNotificationService, notificationConfiguration } from "./notifications.js";

// Construct once per gateway with the existing call, outbox and parked owners.
// The gateway still closes this service before its call source and previews.
export function createNotificationRuntime(env, { bearingsSource, syncRevision, inboxBatcher, procrastination, notificationOptions }) {
  return createNotificationService({
    configuration: notificationConfiguration(env), source: bearingsSource, revision: syncRevision,
    initializeEvidence: async () => { await inboxBatcher.initializeEvidence(); await procrastination.initializeEvidence(); },
    evidence: async () => {
      try {
        const [input, pending, parked] = await Promise.all([bearingsSource.notificationEvidence(), inboxBatcher.pending({ strict: true }), procrastination.evidence()]);
        return { ...input, pending, procrastination: parked };
      } catch { return { available: false }; }
    },
    ...notificationOptions,
  });
}
