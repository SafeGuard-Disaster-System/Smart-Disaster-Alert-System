(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.SafeGuardNotificationState = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  function getAlertId(alert) {
    if (!alert || alert.id === undefined || alert.id === null) return null;
    const id = String(alert.id).trim();
    return id || null;
  }

  function isActiveAlert(alert, now = Date.now()) {
    if (!alert || typeof alert !== "object" || Array.isArray(alert)) return false;
    if (!getAlertId(alert)) return false;

    const status = String(alert.status || "").trim().toLowerCase();
    if (status !== "active") return false;

    if (
      alert.cancelled === true ||
      alert.canceled === true ||
      alert.isCancelled === true ||
      alert.isCanceled === true
    ) {
      return false;
    }

    const messageType = String(alert.msgType || alert.messageType || "")
      .trim()
      .toLowerCase();
    if (messageType === "cancel" || messageType === "cancelled" || messageType === "canceled") {
      return false;
    }

    const expiresAt = alert.expiresAt;
    if (expiresAt !== null && expiresAt !== undefined && expiresAt !== "") {
      const expiry = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
      if (!Number.isFinite(expiry) || expiry <= now) return false;
    }

    return true;
  }

  function getActiveAlerts(alerts, now = Date.now()) {
    if (!Array.isArray(alerts)) return [];
    return alerts.filter(alert => isActiveAlert(alert, now));
  }

  function createTracker() {
    let initialized = false;
    const seenIds = new Set();

    return {
      observe(alerts, now = Date.now()) {
        const activeAlerts = getActiveAlerts(alerts, now);
        if (!initialized) {
          for (const alert of activeAlerts) seenIds.add(getAlertId(alert));
          initialized = true;
          return [];
        }

        const newAlerts = [];
        for (const alert of activeAlerts) {
          const id = getAlertId(alert);
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          newAlerts.push(alert);
        }
        return newAlerts;
      }
    };
  }

  return { createTracker, getActiveAlerts, getAlertId, isActiveAlert };
});