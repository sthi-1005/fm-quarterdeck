import { deviceId } from "./notification-state.js";

// Called at the notification family's original dispatch position, after the
// gateway's serving-revision check and before preview selection/proxy mediation.
export function createNotificationHandler({ env, notifications, authorized, sendJson, deploymentTier, dev }) {
  const notificationRate = { at: 0, count: 0 };
  return async (request, response, url, preview) => {
    if (url.pathname.startsWith("/api/notifications/")) {
      const pushOrigin = env.FM_QUARTERDECK_PUSH_ORIGIN;
      const permitted = pushOrigin ? request.headers.host === pushOrigin.slice("https://".length) && request.headers.origin === pushOrigin : authorized(request);
      if (!permitted || deploymentTier || dev || preview) { await sendJson(request, response, 403, { error: "Notifications require the stable private origin" }); return true; }
      if (request.method !== "POST" || url.search || !["/api/notifications/status", "/api/notifications/enroll", "/api/notifications/disable"].includes(url.pathname) || !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) { await sendJson(request, response, 400, { error: "Notification JSON operation required" }); return true; }
      const minute = Math.floor(Date.now() / 60000);
      if (minute !== notificationRate.at) { notificationRate.at = minute; notificationRate.count = 0; }
      if (++notificationRate.count > 30) { await sendJson(request, response, 429, { error: "Notification request limit reached" }); return true; }
      let text = "";
      for await (const chunk of request) { text += chunk; if (Buffer.byteLength(text) > 4096) { await sendJson(request, response, 413, { error: "Subscription too large" }); return true; } }
      let body;
      try { body = JSON.parse(text); } catch {}
      const enroll = url.pathname.endsWith("/enroll");
      if (!body || Object.keys(body).sort().join(",") !== (enroll ? "id,subscription" : "id") || !deviceId(body.id)) { await sendJson(request, response, 400, { error: "Exact installation fields required" }); return true; }
      try {
        const value = await (enroll ? notifications.enroll(body.id, body.subscription) : url.pathname.endsWith("/disable") ? notifications.disable(body.id) : notifications.status(body.id));
        await sendJson(request, response, 200, value);
      } catch { await sendJson(request, response, 409, { error: "Notifications unavailable; check configuration or installation state" }); }
      return true;
    }
    if (url.pathname === "/notifications-worker.js") {
      const origin = await notifications.origin();
      if (!origin || deploymentTier || dev || request.headers.host !== origin.slice("https://".length)) { await sendJson(request, response, 403, { error: "Notification worker requires the configured host" }); return true; }
    }
    return false;
  };
}
