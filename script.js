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

                        ⚠️
                        ${escapeHTML(
                            alertData.severity
                        )}

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


        displayAdminActiveAlerts(
            alerts
        );


        displayUserActiveAlerts(
            alerts
        );

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
    // GEOCODE EACH CURRENT ALERT
    // -----------------------------------------

    for (
        const alertData of alerts
    ) {

        // If Firebase changed while
        // geocoding was happening,
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


        const coordinates =
            await geocodeLocation(
                location
            );


        // VERY IMPORTANT:
        // Ignore old map requests.
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
                        item.lat,
                        item.lng
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