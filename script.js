// =====================================================
// SAFEGUARD DISASTER ALERT SYSTEM
// FINAL SCRIPT.JS
// =====================================================


// =====================================================
// FIREBASE
// =====================================================

const db = firebase.database();

const activeAlertsRef =
    db.ref("activeDisasterAlerts");

const historyRef =
    db.ref("alertHistory");


// =====================================================
// GLOBAL VARIABLES
// =====================================================

let disasterMap = null;

let disasterMarkers = [];

let mapUpdateVersion = 0;


// =====================================================
// HELPERS
// =====================================================

function toArray(data) {

    if (!data) {
        return [];
    }

    if (Array.isArray(data)) {
        return data;
    }

    return Object.values(data);
}


function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value == null ? "" : String(value);

    return div.innerHTML;
}


function getDisasterIcon(disaster) {

    const icons = {

        Flood: "🌊",
        Cyclone: "🌪️",
        Earthquake: "🌍",
        Fire: "🔥",
        Landslide: "⛰️",
        Tsunami: "🌊"

    };

    return icons[disaster] || "⚠️";
}

// =====================================================
// ADMIN - DASHBOARD STATISTICS
// =====================================================

async function updateDashboardStatistics() {

    const activeElement =
        document.getElementById(
            "statActiveAlerts"
        );

    const resolvedElement =
        document.getElementById(
            "statResolvedAlerts"
        );

    const totalElement =
        document.getElementById(
            "statTotalAlerts"
        );

    const highElement =
        document.getElementById(
            "statHighSeverity"
        );


    // Statistics exist only on the Admin page.
    if (
        !activeElement ||
        !resolvedElement ||
        !totalElement ||
        !highElement
    ) {
        return;
    }


    try {

        // Get current active alerts
        const activeSnapshot =
            await activeAlertsRef.once(
                "value"
            );

        // Get complete alert history
        const historySnapshot =
            await historyRef.once(
                "value"
            );


        const activeAlerts =
            toArray(
                activeSnapshot.val()
            );

        const history =
            toArray(
                historySnapshot.val()
            );


        // -------------------------------------------------
        // ACTIVE ALERTS
        // -------------------------------------------------

        const activeCount =
            activeAlerts.length;


        // -------------------------------------------------
        // RESOLVED ALERTS
        // -------------------------------------------------

        const resolvedCount =
            history.filter(
                function (alertData) {

                    return (
                        String(
                            alertData.status || ""
                        ).toLowerCase() ===
                        "resolved"
                    );

                }
            ).length;


        // -------------------------------------------------
        // TOTAL ALERTS
        // -------------------------------------------------

        const totalCount =
            history.length;


        // -------------------------------------------------
        // HIGH-SEVERITY ACTIVE ALERTS
        // -------------------------------------------------

        const highSeverityCount =
            activeAlerts.filter(
                function (alertData) {

                    return (
                        String(
                            alertData.severity || ""
                        ).toLowerCase() ===
                        "high"
                    );

                }
            ).length;


        // -------------------------------------------------
        // UPDATE THE CARDS
        // -------------------------------------------------

        activeElement.textContent =
            activeCount;

        resolvedElement.textContent =
            resolvedCount;

        totalElement.textContent =
            totalCount;

        highElement.textContent =
            highSeverityCount;


    } catch (error) {

        console.error(
            "Dashboard statistics error:",
            error
        );

    }

}

// =====================================================
// ALERT SEARCH & FILTER
// =====================================================

let currentActiveAlerts = [];

let alertSearchText = "";

let selectedDisaster =
    "all";

let selectedSeverity =
    "all";


// -----------------------------------------------------
// FILTER ACTIVE ALERTS
// -----------------------------------------------------

function filterActiveAlerts() {

    const filteredAlerts =
        currentActiveAlerts.filter(
            function (alertData) {

                const searchText =
                    alertSearchText
                        .toLowerCase()
                        .trim();


                const location =
                    String(
                        alertData.location || ""
                    ).toLowerCase();


                const message =
                    String(
                        alertData.message || ""
                    ).toLowerCase();


                const disaster =
                    String(
                        alertData.disaster || ""
                    );


                const severity =
                    String(
                        alertData.severity || ""
                    );


                // Search
                const matchesSearch =
                    !searchText ||
                    location.includes(
                        searchText
                    ) ||
                    message.includes(
                        searchText
                    );


                // Disaster filter
                const matchesDisaster =
                    selectedDisaster === "all" ||
                    disaster === selectedDisaster;


                // Severity filter
                const matchesSeverity =
                    selectedSeverity === "all" ||
                    severity === selectedSeverity;


                return (
                    matchesSearch &&
                    matchesDisaster &&
                    matchesSeverity
                );

            }
        );


    displayAdminActiveAlerts(
        filteredAlerts
    );

}


// -----------------------------------------------------
// CONNECT FILTER CONTROLS
// -----------------------------------------------------

function setupAlertFilters() {

    const searchInput =
        document.getElementById(
            "alertSearch"
        );

    const disasterFilter =
        document.getElementById(
            "filterDisaster"
        );

    const severityFilter =
        document.getElementById(
            "filterSeverity"
        );

    const clearButton =
        document.getElementById(
            "clearAlertFilters"
        );


    // If this page doesn't contain
    // the filters, stop safely.
    if (
        !searchInput ||
        !disasterFilter ||
        !severityFilter ||
        !clearButton
    ) {
        return;
    }


    // Search
    searchInput.addEventListener(
        "input",
        function () {

            alertSearchText =
                searchInput.value;

            filterActiveAlerts();

        }
    );


    // Disaster
    disasterFilter.addEventListener(
        "change",
        function () {

            selectedDisaster =
                disasterFilter.value;

            filterActiveAlerts();

        }
    );


    // Severity
    severityFilter.addEventListener(
        "change",
        function () {

            selectedSeverity =
                severityFilter.value;

            filterActiveAlerts();

        }
    );


    // Clear
    clearButton.addEventListener(
        "click",
        function () {

            searchInput.value =
                "";

            disasterFilter.value =
                "all";

            severityFilter.value =
                "all";


            alertSearchText =
                "";

            selectedDisaster =
                "all";

            selectedSeverity =
                "all";


            filterActiveAlerts();

        }
    );

}


// =====================================================
// SAFETY INSTRUCTIONS
// =====================================================

function getSafetyInstructions(disaster) {

    const instructions = {

        Flood: [
            "Move to higher ground immediately.",
            "Avoid flooded roads and bridges.",
            "Never walk or drive through moving water.",
            "Keep your phone charged and follow official updates."
        ],

        Cyclone: [
            "Stay indoors and away from windows.",
            "Secure loose objects around your home.",
            "Follow official evacuation instructions.",
            "Keep emergency supplies and drinking water ready."
        ],

        Earthquake: [
            "Drop, Cover and Hold On.",
            "Stay away from windows and falling objects.",
            "Do not use elevators during an earthquake.",
            "After shaking stops, follow official instructions."
        ],

        Fire: [
            "Move away from the affected area.",
            "Stay low if there is smoke.",
            "Do not use elevators during a fire.",
            "Call emergency services and follow evacuation instructions."
        ],

        Landslide: [
            "Move away from steep slopes and unstable areas.",
            "Avoid roads or paths affected by falling rocks.",
            "Move to a safe area if you notice cracks or unusual ground movement.",
            "Follow official evacuation instructions."
        ],

        Tsunami: [
            "Move quickly to higher ground and away from the coast.",
            "Do not go to the shore to watch the waves.",
            "Follow official tsunami warnings and evacuation orders.",
            "Stay away from coastal areas until authorities give an all-clear."
        ]

    };

    return instructions[disaster] || [
        "Move to a safe location.",
        "Follow official emergency instructions.",
        "Keep your phone charged.",
        "Avoid dangerous areas."
    ];
}


// =====================================================
// ADMIN - SEND ALERT
// =====================================================

const alertForm =
    document.getElementById("alertForm");


if (alertForm) {

    alertForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const disaster =
                document
                    .getElementById("disaster")
                    .value
                    .trim();


            const location =
                document
                    .getElementById("location")
                    .value
                    .trim();


            const severity =
                document
                    .getElementById("severity")
                    .value
                    .trim();


            const message =
                document
                    .getElementById("message")
                    .value
                    .trim();


            if (
                !disaster ||
                !location ||
                !severity ||
                !message
            ) {

                alert(
                    "Please fill in all fields."
                );

                return;
            }


            const now =
                new Date();


            const alertData = {

                id:
                    Date.now().toString(),

                disaster:
                    disaster,

                location:
                    location,

                latitude:
                    locationInput?.dataset.lat || null,

                longitude:
                    locationInput?.dataset.lng || null,

                locationDisplayName:
                    locationInput?.dataset.displayName || location,

                severity:
                    severity,

                message:
                    message,

                time:
                    now.toLocaleTimeString(),

                date:
                    now.toLocaleDateString(),

                status:
                    "Active"

            };


            try {

                const activeSnapshot =
                    await activeAlertsRef.once(
                        "value"
                    );


                const activeAlerts =
                    toArray(
                        activeSnapshot.val()
                    );


                activeAlerts.push(
                    alertData
                );


                await activeAlertsRef.set(
                    activeAlerts
                );


                const historySnapshot =
                    await historyRef.once(
                        "value"
                    );


                const history =
                    toArray(
                        historySnapshot.val()
                    );


                history.unshift(
                    alertData
                );


                await historyRef.set(
                    history
                );


                alertForm.reset();


                alert(
                    "🚨 Disaster alert sent successfully!"
                );


            } catch (error) {

                console.error(
                    "Send alert error:",
                    error
                );


                alert(
                    "❌ Could not send the alert."
                );

            }

        }
    );

}


// =====================================================
// ADMIN - ACTIVE ALERTS
// =====================================================

const adminActiveAlerts =
    document.getElementById(
        "adminActiveAlerts"
    );


function displayAdminActiveAlerts(
    alerts
) {

    if (!adminActiveAlerts) {
        return;
    }


    if (alerts.length === 0) {

        adminActiveAlerts.innerHTML = `
            <p class="empty-history">
                No active alerts.
            </p>
        `;

        return;
    }


    adminActiveAlerts.innerHTML = "";


    alerts.forEach(
        function (alertData) {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "admin-alert-item";


            item.innerHTML = `

                <div class="admin-alert-icon">

                    ${getDisasterIcon(
                        alertData.disaster
                    )}

                </div>


                <div class="admin-alert-details">

                    <h3>
                        ${escapeHTML(
                            alertData.disaster
                        )}
                        Alert
                    </h3>


                    <p>

                        📍
                        ${escapeHTML(
                            alertData.location
                        )}

                        &nbsp; • &nbsp;

                        <span class="severity-badge severity-${String(alertData.severity).toLowerCase()}">
                            ${escapeHTML(alertData.severity)}
                        </span>

                        &nbsp; • &nbsp;

                        🕐
                        ${escapeHTML(
                            alertData.time
                        )}

                    </p>


                    <p>
                        ${escapeHTML(
                            alertData.message
                        )}
                    </p>

                </div>


                <button
                    type="button"
                    class="admin-resolve-button"
                >
                    ✅ Resolve
                </button>

            `;


            const button =
                item.querySelector(
                    ".admin-resolve-button"
                );


            button.addEventListener(
                "click",
                function () {

                    resolveAlert(
                        alertData.id
                    );

                }
            );


            adminActiveAlerts.appendChild(
                item
            );

        }
    );

}

// =====================================================
// ADMIN - RESOLVE ALERT
// =====================================================

async function resolveAlert(
    alertId
) {

    const confirmed =
        confirm(
            "Are you sure you want to resolve this alert?"
        );


    if (!confirmed) {
        return;
    }


    try {

        const snapshot =
            await activeAlertsRef.once(
                "value"
            );


        const alerts =
            toArray(
                snapshot.val()
            );


        const remaining =
            alerts.filter(
                function (item) {

                    return String(item.id) !==
                        String(alertId);

                }
            );


        await activeAlertsRef.set(
            remaining
        );


        const historySnapshot =
            await historyRef.once(
                "value"
            );


        const history =
            toArray(
                historySnapshot.val()
            );


        const updatedHistory =
            history.map(
                function (item) {

                    if (
                        String(item.id) ===
                        String(alertId)
                    ) {

                        return {
                            ...item,
                            status: "Resolved"
                        };

                    }

                    return item;

                }
            );


        await historyRef.set(
            updatedHistory
        );


        alert(
            "✅ Alert resolved successfully."
        );


    } catch (error) {

        console.error(
            "Resolve error:",
            error
        );


        alert(
            "❌ Could not resolve the alert."
        );

    }

}


// =====================================================
// ADMIN - HISTORY
// =====================================================

const alertHistoryElement =
    document.getElementById(
        "alertHistory"
    );


function displayAlertHistory(
    history
) {

    if (!alertHistoryElement) {
        return;
    }


    if (history.length === 0) {

        alertHistoryElement.innerHTML = `
            <p class="empty-history">
                No previous alerts.
            </p>
        `;

        return;
    }


    alertHistoryElement.innerHTML = "";


    history.forEach(
        function (alertData) {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "history-item";


            item.innerHTML = `

                <div>

                    <strong>

                        ${getDisasterIcon(
                            alertData.disaster
                        )}

                        ${escapeHTML(
                            alertData.disaster
                        )}

                        Alert

                    </strong>


                    <p>

                        📍
                        ${escapeHTML(
                            alertData.location
                        )}

                        &nbsp; • &nbsp;

                        ⚠️
                        ${escapeHTML(
                            alertData.severity
                        )}

                    </p>


                    <p>

                        ${escapeHTML(
                            alertData.message
                        )}

                    </p>

                </div>


                <div>

                    <span>
                        ${escapeHTML(
                            alertData.status
                        )}
                    </span>


                    <p>

                        ${escapeHTML(
                            alertData.date
                        )}

                        &nbsp;

                        ${escapeHTML(
                            alertData.time
                        )}

                    </p>

                </div>

            `;


            alertHistoryElement.appendChild(
                item
            );

        }
    );

}


// =====================================================
// ADMIN - CLEAR HISTORY
// =====================================================

const clearHistoryButton =
    document.getElementById(
        "clearHistory"
    );


if (clearHistoryButton) {

    clearHistoryButton.addEventListener(
        "click",
        async function () {

            if (
                !confirm(
                    "Are you sure you want to clear all alert history?"
                )
            ) {
                return;
            }


            try {

                await historyRef.set(
                    []
                );


                alert(
                    "🗑️ Alert history cleared."
                );


            } catch (error) {

                console.error(
                    error
                );


                alert(
                    "❌ Could not clear history."
                );

            }

        }
    );

}


// =====================================================
// USER DASHBOARD ELEMENTS
// =====================================================

const alertBox =
    document.getElementById(
        "alertBox"
    );


const systemAlertStatus =
    document.getElementById(
        "systemAlertStatus"
    );


const affectedLocation =
    document.getElementById(
        "affectedLocation"
    );


const safetyInstructions =
    document.getElementById(
        "safetyInstructions"
    );


const safetyList =
    document.getElementById(
        "safetyList"
    );


// =====================================================
// USER - DISPLAY ALERTS
// =====================================================

function displayUserActiveAlerts(
    alerts
) {

    if (!alertBox) {
        return;
    }


    // =================================================
    // NO ACTIVE ALERTS
    // =================================================

    if (alerts.length === 0) {

        alertBox.innerHTML = `

            <div class="alert-icon">
                ✓
            </div>


            <div class="alert-content">

                <h3>
                    No Active Emergency
                </h3>


                <p>
                    There are currently no active
                    disaster warnings reported
                    in your area.
                </p>


                <div class="alert-info">

                    <span>
                        📍 Your Area
                    </span>

                    <span>
                        🕐 Updated Just Now
                    </span>

                </div>

            </div>

        `;


        if (systemAlertStatus) {

            systemAlertStatus.textContent =
                "● No Active Emergency";

        }


        // FIX LOCATION CARD
        setAffectedLocation(
            "No affected location"
        );


        if (safetyInstructions) {

            safetyInstructions.style.display =
                "none";

        }


        updateDisasterMap(
            []
        );


        return;
    }


    // =================================================
    // ACTIVE ALERT
    // =================================================

    if (systemAlertStatus) {

        systemAlertStatus.textContent =
            "🔴 " +
            alerts.length +
            " Active Alert" +
            (
                alerts.length === 1
                    ? ""
                    : "s"
            );

    }


    alertBox.innerHTML = "";


    alerts.forEach(
        function (alertData) {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "multiple-alert";


            item.innerHTML = `

                <div class="alert-icon">

                    ${getDisasterIcon(
                        alertData.disaster
                    )}

                </div>


                <div class="alert-content">

                    <h3>

                        ${escapeHTML(
                            alertData.disaster
                        )}
                        Alert

                    </h3>


                    <p>

                        ${escapeHTML(
                            alertData.message
                        )}

                    </p>


                    <div class="alert-info">

                        <span>

                            📍
                            ${escapeHTML(
                                alertData.location
                            )}

                        </span>


                        <span>

                            ⚠️
                            ${escapeHTML(
                                alertData.severity
                            )}

                        </span>


                        <span>

                            🕐
                            ${escapeHTML(
                                alertData.time
                            )}

                        </span>

                    </div>

                </div>

            `;


            alertBox.appendChild(
                item
            );

        }
    );


    // =================================================
    // FIX LOCATION CARD
    // =================================================

    const locationText =
        alerts
            .map(
                function (item) {

                    return (
                        item.location || ""
                    ).trim();

                }
            )
            .filter(
                function (location) {

                    return location !== "";

                }
            )
            .join(" • ");


    setAffectedLocation(
        locationText ||
        "No affected location"
    );


    // =================================================
    // SAFETY INSTRUCTIONS
    // =================================================

    if (
        safetyInstructions &&
        safetyList
    ) {

        safetyList.innerHTML = "";


        const used =
            new Set();


        alerts.forEach(
            function (alertData) {

                if (
                    used.has(
                        alertData.disaster
                    )
                ) {
                    return;
                }


                used.add(
                    alertData.disaster
                );


                const heading =
                    document.createElement(
                        "li"
                    );


                heading.innerHTML =
                    `<strong>${escapeHTML(
                        alertData.disaster
                    )}</strong>`;


                safetyList.appendChild(
                    heading
                );


                getSafetyInstructions(
                    alertData.disaster
                ).forEach(
                    function (instruction) {

                        const li =
                            document.createElement(
                                "li"
                            );


                        li.textContent =
                            instruction;


                        safetyList.appendChild(
                            li
                        );

                    }
                );

            }
        );


        safetyInstructions.style.display =
            "block";

    }


    // =================================================
    // MAP
    // =================================================

    updateDisasterMap(
        alerts
    );

}


// =====================================================
// LOCATION CARD - ROBUST UPDATE
// =====================================================

function setAffectedLocation(
    location
) {

    // Try the expected ID
    const element =
        document.getElementById(
            "affectedLocation"
        );


    if (element) {

        element.textContent =
            location;

        return;

    }


    // Compatibility with alternate IDs
    const alternatives = [
        "currentLocation",
        "currentAlertLocation",
        "affectedArea",
        "locationText"
    ];


    for (
        const id of alternatives
    ) {

        const alternate =
            document.getElementById(id);


        if (alternate) {

            alternate.textContent =
                location;

            return;

        }

    }


    console.warn(
        "Affected location element was not found."
    );

}


// =====================================================
// FIREBASE ACTIVE ALERT LISTENER
// =====================================================

activeAlertsRef.on(
    "value",
    function (snapshot) {

        const alerts =
            toArray(
                snapshot.val()
            );


        console.log(
            "Firebase active alerts:",
            alerts
        );


        currentActiveAlerts =
            alerts;

        filterActiveAlerts();


        displayUserActiveAlerts(
            alerts
        );

        updateDashboardStatistics();

    },
    function (error) {

        console.error(
            "Firebase active alerts error:",
            error
        );

    }
);


// =====================================================
// FIREBASE HISTORY LISTENER
// =====================================================

historyRef.on(
    "value",
    function (snapshot) {

        const history =
            toArray(
                snapshot.val()
            );


        displayAlertHistory(
            history
        );

        updateDashboardStatistics();

    }
);


// =====================================================
// MAP INITIALIZATION
// =====================================================

function initializeDisasterMap() {

    const mapElement =
        document.getElementById(
            "map"
        );


    if (!mapElement) {
        return;
    }


    if (
        typeof L ===
        "undefined"
    ) {

        console.error(
            "Leaflet is not loaded."
        );

        return;

    }


    if (disasterMap) {
        return;
    }


    mapElement.innerHTML = "";


    disasterMap =
        L.map(
            "map"
        );


    disasterMap.setView(
        [
            19.0330,
            73.0297
        ],
        11
    );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            maxZoom: 19,

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    ).addTo(
        disasterMap
    );


    setTimeout(
        function () {

            disasterMap.invalidateSize();

        },
        500
    );

}


// =====================================================
// MAP - REMOVE MARKERS
// =====================================================

function removeAllMapMarkers() {

    if (!disasterMap) {
        return;
    }


    disasterMarkers.forEach(
        function (marker) {

            disasterMap.removeLayer(
                marker
            );

        }
    );


    disasterMarkers = [];

}


// =====================================================
// MAP - GEOCODING
// =====================================================

async function geocodeLocation(
    location
) {

    try {

        const cleanLocation =
            String(
                location || ""
            ).trim();


        if (!cleanLocation) {
            return null;
        }


        const query =
            encodeURIComponent(
                cleanLocation +
                ", Maharashtra, India"
            );


        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json" +
            "&q=" +
            query +
            "&limit=1";


        const response =
            await fetch(
                url,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (!response.ok) {
            return null;
        }


        const results =
            await response.json();


        if (
            !results ||
            results.length === 0
        ) {

            return null;

        }


        return {

            lat:
                parseFloat(
                    results[0].lat
                ),

            lng:
                parseFloat(
                    results[0].lon
                )

        };


    } catch (error) {

        console.error(
            "Geocoding error:",
            error
        );


        return null;

    }

}


// =====================================================
// MAP - UPDATE
// =====================================================

async function updateDisasterMap(
    alerts
) {

    if (!disasterMap) {
        return;
    }


    // -----------------------------------------
    // CREATE UNIQUE UPDATE VERSION
    // -----------------------------------------

    const thisUpdate =
        ++mapUpdateVersion;


    // -----------------------------------------
    // REMOVE OLD MARKERS IMMEDIATELY
    // -----------------------------------------

    removeAllMapMarkers();


    // -----------------------------------------
    // NO ACTIVE ALERT
    // -----------------------------------------

    if (
        !alerts ||
        alerts.length === 0
    ) {

        disasterMap.setView(
            [
                19.0330,
                73.0297
            ],
            11
        );


        setTimeout(
            function () {

                disasterMap.invalidateSize();

            },
            100
        );


        return;
    }


    const locations = [];


    // -----------------------------------------
    // GET EXACT COORDINATES FOR EACH ALERT
    // -----------------------------------------

    for (
        const alertData of alerts
    ) {

        // If Firebase changed while
        // processing was happening,
        // stop this old update.
        if (
            thisUpdate !==
            mapUpdateVersion
        ) {
            return;
        }


        const location =
            String(
                alertData.location || ""
            ).trim();


        if (!location) {
            continue;
        }


        let latitude =
            Number(
                alertData.latitude
            );

        let longitude =
            Number(
                alertData.longitude
            );


        // -------------------------------------------------
        // USE SAVED EXACT COORDINATES FIRST
        // -------------------------------------------------

        if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
        ) {

            locations.push({

                alert:
                    alertData,

                lat:
                    latitude,

                lng:
                    longitude

            });


            continue;
        }


        // -------------------------------------------------
        // FALLBACK FOR OLD ALERTS
        // -------------------------------------------------
        // Old alerts created before latitude/longitude
        // were added will still work.

        const coordinates =
            await geocodeLocation(
                location
            );


        // Check again after the
        // asynchronous request.
        if (
            thisUpdate !==
            mapUpdateVersion
        ) {
            return;
        }


        if (!coordinates) {

            console.warn(
                "Could not locate:",
                location
            );

            continue;
        }


        locations.push({

            alert:
                alertData,

            lat:
                coordinates.lat,

            lng:
                coordinates.lng

        });

    }


    // -----------------------------------------
    // CHECK AGAIN
    // -----------------------------------------

    if (
        thisUpdate !==
        mapUpdateVersion
    ) {

        return;

    }


    // -----------------------------------------
    // NO VALID LOCATIONS
    // -----------------------------------------

    if (locations.length === 0) {

        disasterMap.setView(
            [
                19.0330,
                73.0297
            ],
            11
        );

        return;

    }


    // -----------------------------------------
    // CREATE CURRENT MARKERS
    // -----------------------------------------

    locations.forEach(
        function (item) {

            // Ignore if newer update arrived
            if (
                thisUpdate !==
                mapUpdateVersion
            ) {

                return;

            }


            const marker =
                L.marker(
                    [
                        Number(item.lat),
                        Number(item.lng)
                    ]
                ).addTo(
                    disasterMap
                );


            marker.bindPopup(`

                <strong>

                    ${getDisasterIcon(
                        item.alert.disaster
                    )}

                    ${escapeHTML(
                        item.alert.disaster
                    )}
                    Alert

                </strong>

                <br><br>

                📍
                ${escapeHTML(
                    item.alert.location
                )}

                <br>

                ⚠️ Severity:
                ${escapeHTML(
                    item.alert.severity
                )}

                <br>

                🕐
                ${escapeHTML(
                    item.alert.time
                )}

            `);


            disasterMarkers.push(
                marker
            );

        }
    );


    // -----------------------------------------
    // FIT MAP TO CURRENT MARKERS
    // -----------------------------------------

    if (
        disasterMarkers.length === 1
    ) {

        disasterMap.setView(
            disasterMarkers[0].getLatLng(),
            14,
            {
                animate: true
            }
        );

    } else if (
        disasterMarkers.length > 1
    ) {

        const bounds =
            L.latLngBounds([]);


        disasterMarkers.forEach(
            function (marker) {

                bounds.extend(
                    marker.getLatLng()
                );

            }
        );


        disasterMap.fitBounds(
            bounds,
            {

                padding:
                    [
                        40,
                        40
                    ],

                maxZoom:
                    14,

                animate:
                    true

            }
        );

    }


    setTimeout(
        function () {

            if (
                disasterMap &&
                thisUpdate ===
                    mapUpdateVersion
            ) {

                disasterMap.invalidateSize();

            }

        },
        300
    );

}


// =====================================================
// MAP START
// =====================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDisasterMap
    );

} else {

    initializeDisasterMap();

}


// =====================================================
// MAP RESIZE
// =====================================================

window.addEventListener(
    "resize",
    function () {

        if (disasterMap) {

            setTimeout(
                function () {

                    disasterMap.invalidateSize();

                },
                100
            );

        }

    }
);


// =====================================================
// FINAL
// =====================================================

console.log(
    "🛡️ SafeGuard FINAL script.js loaded."
);

// =====================================================
// BROWSER NOTIFICATIONS
// =====================================================

const enableNotificationsButton =
    document.getElementById(
        "enableNotifications"
    );


// Ask the user for notification permission
async function enableBrowserNotifications() {

    if (
        !("Notification" in window)
    ) {

        alert(
            "Your browser does not support notifications."
        );

        return;

    }


    try {

        const permission =
            await Notification.requestPermission();


        if (
            permission === "granted"
        ) {

            if (
                enableNotificationsButton
            ) {

                enableNotificationsButton.textContent =
                    "🔔 Notifications Enabled";

                enableNotificationsButton.disabled =
                    true;

            }


            console.log(
                "🔔 Browser notifications enabled."
            );


        } else {

            alert(
                "Notifications were not enabled. Please allow notifications in your browser settings."
            );

        }


    } catch (error) {

        console.error(
            "Notification permission error:",
            error
        );

    }

}


// Enable button
if (
    enableNotificationsButton
) {

    // If already allowed
    if (
        "Notification" in window &&
        Notification.permission ===
            "granted"
    ) {

        enableNotificationsButton.textContent =
            "🔔 Notifications Enabled";

        enableNotificationsButton.disabled =
            true;

    }


    enableNotificationsButton.addEventListener(
        "click",
        enableBrowserNotifications
    );

}


// =====================================================
// NOTIFY WHEN A NEW ALERT ARRIVES
// =====================================================

let previousAlertIds =
    new Set();


let notificationsInitialized =
    false;


function checkForNewAlerts(
    alerts
) {

    if (
        !Array.isArray(alerts)
    ) {

        return;

    }


    const currentAlertIds =
        new Set(
            alerts.map(
                function (alertData) {

                    return String(
                        alertData.id
                    );

                }
            )
        );


    // First Firebase load:
    // remember existing alerts but
    // DON'T notify the user.
    if (
        !notificationsInitialized
    ) {

        previousAlertIds =
            currentAlertIds;

        notificationsInitialized =
            true;

        return;

    }


    // Find newly-created alerts
    alerts.forEach(
        function (alertData) {

            const alertId =
                String(
                    alertData.id
                );


            if (
                previousAlertIds.has(
                    alertId
                )
            ) {

                return;

            }


            // Remember the new alert
            previousAlertIds.add(
                alertId
            );


            // Only notify if permission
            // has already been granted.
            if (
                !("Notification" in window)
            ) {

                return;

            }


            if (
                Notification.permission !==
                "granted"
            ) {

                return;

            }


            const disaster =
                alertData.disaster ||
                "Emergency";


            const location =
                alertData.location ||
                "Unknown location";


            const severity =
                alertData.severity ||
                "Unknown";


            const message =
                alertData.message ||
                "A new emergency alert has been issued.";


            new Notification(
                "🚨 SafeGuard Emergency Alert",
                {

                    body:
                        getDisasterIcon(
                            disaster
                        ) +
                        " " +
                        disaster +
                        "\n" +
                        "📍 " +
                        location +
                        "\n" +
                        "⚠️ Severity: " +
                        severity +
                        "\n\n" +
                        message,

                    tag:
                        "safeguard-" +
                        alertId

                }
            );

        }
    );


    // Remove IDs that are no longer active
    previousAlertIds =
        new Set(
            currentAlertIds
        );

}


// =====================================================
// WATCH FIREBASE FOR NEW ALERTS
// =====================================================

activeAlertsRef.on(
    "value",
    function (snapshot) {

        const alerts =
            toArray(
                snapshot.val()
            );


        checkForNewAlerts(
            alerts
        );

    }
);

// =====================================================
// ADMIN LOCATION SEARCH
// =====================================================

const locationInput =
    document.getElementById("location");

const locationSuggestions =
    document.getElementById(
        "locationSuggestions"
    );

let locationSearchTimer = null;


// -----------------------------------------------------
// Search locations using OpenStreetMap
// -----------------------------------------------------

async function searchAdminLocations(query) {

    if (!locationSuggestions) {
        return;
    }

    query = query.trim();

    if (query.length < 3) {

        locationSuggestions.innerHTML = "";

        return;
    }


    locationSuggestions.innerHTML = `
        <div class="location-loading">
            🔍 Searching...
        </div>
    `;


    try {

        const url =
            "https://nominatim.openstreetmap.org/search" +
            "?format=json" +
            "&addressdetails=1" +
            "&limit=5" +
            "&countrycodes=in" +
            "&q=" +
            encodeURIComponent(query);


        const response =
            await fetch(url, {
                headers: {
                    "Accept":
                        "application/json"
                }
            });


        if (!response.ok) {
            throw new Error(
                "Location search failed"
            );
        }


        const results =
            await response.json();


        if (
            !results ||
            results.length === 0
        ) {

            locationSuggestions.innerHTML = `
                <div class="location-no-result">
                    No location found.
                </div>
            `;

            return;
        }


        locationSuggestions.innerHTML = "";


        results.forEach(
            function(result) {

                const option =
                    document.createElement(
                        "button"
                    );


                option.type = "button";

                option.className =
                    "location-suggestion";


                option.innerHTML = `
                    <strong>
                        📍 ${escapeHTML(
                            result.display_name
                        )}
                    </strong>
                `;


                option.addEventListener(
                    "click",
                    function() {

                        /*
                         * Use the actual place name
                         * rather than the entire
                         * OpenStreetMap address.
                         */

                        const address =
                            result.address || {};


                        const selectedLocation =
                            address.city ||
                            address.town ||
                            address.village ||
                            address.suburb ||
                            address.municipality ||
                            result.name ||
                            result.display_name;


                        locationInput.value =
                            selectedLocation;


                        locationSuggestions.innerHTML =
                            "";


                        /*
                         * Save exact coordinates.
                         * The alert can use these later
                         * for accurate map placement.
                         */

                        locationInput.dataset.lat =
                            result.lat;


                        locationInput.dataset.lng =
                            result.lon;


                        locationInput.dataset.displayName =
                            result.display_name;


                        console.log(
                            "📍 Selected location:",
                            selectedLocation
                        );


                        console.log(
                            "Coordinates:",
                            result.lat,
                            result.lon
                        );

                    }
                );


                locationSuggestions.appendChild(
                    option
                );

            }
        );


    } catch (error) {

        console.error(
            "Location search error:",
            error
        );


        locationSuggestions.innerHTML = `
            <div class="location-no-result">
                ❌ Unable to search locations.
            </div>
        `;

    }

}


// -----------------------------------------------------
// Location input
// -----------------------------------------------------

if (locationInput) {

    locationInput.addEventListener(
        "input",
        function() {

            clearTimeout(
                locationSearchTimer
            );


            /*
             * If the user changes the text
             * manually, remove the previously
             * selected coordinates.
             */

            delete locationInput.dataset.lat;
            delete locationInput.dataset.lng;
            delete locationInput.dataset.displayName;


            const query =
                locationInput.value;


            locationSearchTimer =
                setTimeout(
                    function() {

                        searchAdminLocations(
                            query
                        );

                    },
                    500
                );

        }
    );


    /*
     * Close suggestions when the user
     * clicks somewhere else.
     */

    document.addEventListener(
        "click",
        function(event) {

            if (
                !event.target.closest(
                    ".location-picker"
                )
            ) {

                if (
                    locationSuggestions
                ) {

                    locationSuggestions.innerHTML =
                        "";

                }

            }

        }
    );

}

// =====================================================
// INITIALIZE ALERT FILTERS
// =====================================================

setupAlertFilters();