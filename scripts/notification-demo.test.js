const assert = require("node:assert/strict");
const demo = require("../notification-demo");

function makeDocument() {
  const button = { dataset: {}, addEventListener(event, handler) {
    assert.equal(event, "click");
    this.handler = handler;
  } };
  const notice = {
    dataset: {},
    hidden: true,
    children: [],
    replaceChildren(...children) {
      this.children = children;
      this.textContent = children.map(child => child.textContent).join("");
    }
  };
  return {
    button,
    notice,
    getElementById(id) {
      if (id === "runNotificationDemo") return button;
      if (id === "demoAlertNotice") return notice;
      return null;
    },
    createElement(tag) {
      return { tag, textContent: "" };
    }
  };
}

let firebaseCalls = 0;
const previousFirebase = globalThis.firebase;
globalThis.firebase = {
  database() {
    firebaseCalls++;
    return {
      ref() {
        firebaseCalls++;
        return {
          set() { firebaseCalls++; },
          push() { firebaseCalls++; },
          update() { firebaseCalls++; },
          remove() { firebaseCalls++; }
        };
      }
    };
  }
};

try {
  const permissionRequests = { count: 0 };
  const deniedNotifications = [];
  class DeniedNotification {
    static permission = "default";
    static requestPermission() { permissionRequests.count++; }
    constructor(title, options) { deniedNotifications.push({ title, options }); }
  }

  const deniedPage = makeDocument();
  assert.equal(demo.attach(deniedPage, DeniedNotification), true);
  deniedPage.button.handler();
  assert.equal(deniedPage.notice.hidden, false);
  assert.ok(deniedPage.notice.textContent.includes(demo.DEMO_LABEL));
  assert.ok(deniedPage.notice.textContent.includes("no real event or location"));
  assert.equal(deniedNotifications.length, 0);
  assert.equal(permissionRequests.count, 0);
  assert.equal(firebaseCalls, 0);

  const grantedNotifications = [];
  class GrantedNotification {
    static permission = "granted";
    static requestPermission() { permissionRequests.count++; }
    constructor(title, options) { grantedNotifications.push({ title, options }); }
  }

  const grantedPage = makeDocument();
  demo.attach(grantedPage, GrantedNotification);
  demo.attach(grantedPage, GrantedNotification);
  grantedPage.button.handler();
  assert.equal(grantedNotifications.length, 1);
  assert.equal(grantedNotifications[0].title, demo.DEMO_LABEL);
  assert.ok(grantedNotifications[0].options.body.includes("not an official warning"));
  assert.equal(permissionRequests.count, 0);
  assert.equal(firebaseCalls, 0);

  console.log("PASS: Demo button alone displays a clearly labelled local alert");
  console.log("PASS: Browser notification is created only when permission is already granted");
  console.log("PASS: Demo never requests permission or calls Firebase");
  console.log("PASS: Repeated attachment does not add duplicate click handlers");
  console.log("Notification demo tests passed: 4/4");
} finally {
  if (previousFirebase === undefined) delete globalThis.firebase;
  else globalThis.firebase = previousFirebase;
}
