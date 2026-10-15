import asyncio
import pathlib
from playwright.async_api import async_playwright

async def run():
    repo_root = pathlib.Path(__file__).parent.parent.resolve()
    index_path = repo_root / "index.html"
    index_url = index_path.as_uri()

    js_errors = []
    blocked_external_requests = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Catch uncaught runtime JS errors
        page.on("pageerror", lambda err: js_errors.append(str(err)))

        async def route_handler(route):
            request = route.request
            url = request.url
            if url.startswith("file://"):
                await route.continue_()
            else:
                blocked_external_requests.append(url)
                await route.abort("blockedbyclient")

        await page.route("**/*", route_handler)

        await page.goto(index_url, wait_until="domcontentloaded")

        demo_button = page.locator("#runNotificationDemo")
        demo_notice = page.locator("#demoAlertNotice")

        button_visible = await demo_button.is_visible()
        notice_hidden_before = await demo_notice.is_hidden()

        # Wrap Notification.requestPermission to detect if requested
        await page.evaluate("""() => {
            window.__permissionRequested = false;
            if (window.Notification) {
                const orig = window.Notification.requestPermission;
                window.Notification.requestPermission = function(...args) {
                    window.__permissionRequested = true;
                    return orig ? orig.apply(this, args) : Promise.resolve("default");
                };
            }
        }""")

        # Get alert state before demo button click
        cards_before = await page.locator("#active-alerts-container .alert-card, #alerts-history-container .alert-card").count()

        # Click the notification demo button
        await demo_button.click()

        notice_visible_after = await demo_notice.is_visible()
        notice_text = await demo_notice.text_content()

        # Check permission request flag
        permission_requested = await page.evaluate("() => window.__permissionRequested")

        # Get alert state after demo button click
        cards_after = await page.locator("#active-alerts-container .alert-card, #alerts-history-container .alert-card").count()

        # Check if demo notice contains mandatory notice text
        contains_demo_label = "DEMO — NOT A REAL DISASTER ALERT" in notice_text
        contains_simulated_info = "Simulated alert for interface demonstration only; no real event or location." in notice_text

        await browser.close()

        print("\n================ BROWSER AUTOMATION TEST RESULTS ================")
        print(f"1. Network Isolation: Successfully blocked {len(blocked_external_requests)} external requests (e.g. Firebase CDN).")
        print(f"2. Demo Button Visibility: {button_visible}")
        print(f"3. Demo Notice Hidden Initially: {notice_hidden_before}")
        print(f"4. Demo Notice Visible After Click: {notice_visible_after}")
        print(f"5. Demo Notice Contains Required Demo Label: {contains_demo_label}")
        print(f"6. Demo Notice Contains Explanation Text: {contains_simulated_info}")
        print(f"7. Browser Notification Permission Requested: {permission_requested}")
        print(f"8. Alert Card Count Before: {cards_before}, After: {cards_after} (Unchanged)")
        print(f"9. Offline JS Errors (Expected due to blocked Firebase CDN): {js_errors}")
        print("=================================================================\n")

        assert button_visible, "Demo button not visible"
        assert notice_visible_after, "Demo notice not visible after clicking"
        assert contains_demo_label, "Demo label missing from notice text"
        assert contains_simulated_info, "Simulated info text missing from notice"
        assert not permission_requested, "Browser notification permission was unexpectedly requested"
        assert cards_before == cards_after, "Real alert list or history was modified by demo button"

        print("BROWSER AUTOMATION DEMO TEST PASSED ALL ASSERTIONS!")

if __name__ == "__main__":
    asyncio.run(run())
