const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const firebaseInit = fs.readFileSync(
  require.resolve("../firebase-init.js"),
  "utf8"
);
const publicHtml = fs.readFileSync(
  require.resolve("../index.html"),
  "utf8"
);
const adminHtml = fs.readFileSync(
  require.resolve("../admin.html"),
  "utf8"
);
const dashboardScript = fs.readFileSync(
  require.resolve("../script.js"),
  "utf8"
);

let initializeCalls = 0;
const firebase = {
  apps: [],
  initializeApp(config) {
    initializeCalls++;
    this.apps.push({ options: config });
  }
};
const context = { window: { firebase } };
vm.runInNewContext(firebaseInit, context);
vm.runInNewContext(firebaseInit, context);
assert.equal(initializeCalls, 1);
assert.equal(
  firebase.apps[0].options.databaseURL,
  "https://safeguard-disaster-system-default-rtdb.asia-southeast1.firebasedatabase.app"
);
console.log("PASS: Firebase initializes once with the existing database configuration");

const publicScriptOrder = [
  "notification-demo.js",
  "firebase-app-compat.js",
  "firebase-database-compat.js",
  "firebase-init.js",
  "notification-state.js",
  "script.js?v=5.0.0"
].map(source => publicHtml.indexOf(source));
assert.ok(publicScriptOrder.every(position => position >= 0));
assert.ok(publicScriptOrder.every((position, index) =>
  index === 0 || position > publicScriptOrder[index - 1]
));
assert.equal((publicHtml.match(/script\.js\?v=5\.0\.0/g) || []).length, 1);
assert.equal((publicHtml.match(/notification-demo\.js/g) || []).length, 1);
assert.ok(publicHtml.includes('id="liveAlertNotice"'));
assert.ok(publicHtml.includes('id="demoAlertNotice"'));
assert.ok(publicHtml.includes('id="runNotificationDemo"'));
assert.ok(publicHtml.includes("DEMO ONLY. No alert is sent, stored, or presented as official."));
assert.ok(!publicHtml.includes('id="alertForm"'));
assert.ok(!publicHtml.includes('id="clearHistory"'));
console.log("PASS: Public page loads dependencies once in order with an accessible live region");

assert.ok(adminHtml.indexOf("notification-state.js") < adminHtml.indexOf("script.js?v=5.0.0"));
assert.equal((adminHtml.match(/firebase\.initializeApp\(/g) || []).length, 1);
const executableScript = dashboardScript.replace(/\/\*[\s\S]*?\*\//g, "");
assert.equal((executableScript.match(/activeAlertsRef\.on\(/g) || []).length, 1);
const requestPermission = dashboardScript.indexOf("Notification.requestPermission");
assert.equal((dashboardScript.match(/Notification\.requestPermission\(/g) || []).length, 1);
assert.ok(requestPermission > dashboardScript.indexOf("async function enableBrowserNotifications"));
assert.ok(dashboardScript.includes("if (!isAdminDashboard) {"));
assert.ok(executableScript.includes("newlyActiveAlerts.forEach(showInPageAlert)"));

const listenerStart = executableScript.indexOf("activeAlertsRef.on(");
const listenerErrorStart = executableScript.indexOf("function (error)", listenerStart);
const primaryListener = executableScript.slice(listenerStart, listenerErrorStart);
const listenerErrorHandler = executableScript.slice(listenerErrorStart, listenerErrorStart + 500);
assert.ok(primaryListener.includes("checkForNewAlerts(alerts)"));
assert.ok(listenerErrorHandler.includes("showAlertListenerError()"));

const expiryStart = dashboardScript.indexOf("async function removeExpiredAlerts");
const expiryWrite = dashboardScript.indexOf("activeAlertsRef.set(", expiryStart);
assert.ok(dashboardScript.indexOf("if (!isAdminDashboard)", expiryStart) < expiryWrite);
const timerStart = dashboardScript.indexOf("setInterval(async function ()");
const timerRead = dashboardScript.indexOf("activeAlertsRef.once(", timerStart);
assert.ok(dashboardScript.indexOf("if (!isAdminDashboard)", timerStart) < timerRead);
const resolveStart = dashboardScript.indexOf("async function resolveAlert(");
assert.ok(dashboardScript.indexOf("if (!isAdminDashboard) return;", resolveStart) <
  dashboardScript.indexOf("activeAlertsRef.set(", resolveStart));
console.log("PASS: Admin keeps one Firebase init; dashboard uses one live listener and explicit permission flow");

console.log("Dashboard notification integration tests passed: 3/3");
