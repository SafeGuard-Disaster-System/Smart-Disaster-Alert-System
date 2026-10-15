(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root && root.document) {
    api.attach(root.document, root.Notification);
  }
})(typeof window === "undefined" ? globalThis : window, function () {
  const DEMO_LABEL = "DEMO — NOT A REAL DISASTER ALERT";

  function attach(documentRef, NotificationApi) {
    const button = documentRef.getElementById("runNotificationDemo");
    const notice = documentRef.getElementById("demoAlertNotice");

    if (!button || !notice) return false;
    if (button.dataset.demoNotificationBound === "true") return true;
    button.dataset.demoNotificationBound = "true";

    button.addEventListener("click", () => {
      const label = documentRef.createElement("strong");
      label.textContent = DEMO_LABEL;
      const details = documentRef.createElement("span");
      details.textContent = " Simulated alert for interface demonstration only; no real event or location.";

      let browserStatus = " Browser notification not shown because permission is not already granted.";
      if (NotificationApi && NotificationApi.permission === "granted") {
        try {
          new NotificationApi(DEMO_LABEL, {
            body: "Simulated alert for demonstration only. This is not an official warning."
          });
          browserStatus = " Browser notification shown.";
        } catch {
          browserStatus = " Browser notification is unavailable in this browser context.";
        }
      }

      const status = documentRef.createElement("span");
      status.textContent = browserStatus;
      notice.replaceChildren(label, details, status);
      notice.hidden = false;
      notice.dataset.demo = "true";
    });

    return true;
  }

  return { attach, DEMO_LABEL };
});
