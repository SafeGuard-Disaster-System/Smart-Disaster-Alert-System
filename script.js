// =====================================================
// SAFEGUARD DISASTER ALERT SYSTEM
// Firebase Realtime Database Version
// =====================================================


// =====================================================
// FIREBASE
// =====================================================

const db = firebase.database();

const activeAlertsRef = db.ref("activeDisasterAlerts");
const historyRef = db.ref("alertHistory");


// =====================================================
// HELPER FUNCTIONS
// =====================================================

// Firebase may return an array OR an object.
// This converts either format into a clean array.
function toArray(data) {

    if (!data) {
        return [];
    }

    if (Array.isArray(data)) {
        return data;
    }

    return Object.values(data);
}


// Get disaster icon
function getDisasterIcon(disaster) {

    switch (disaster) {

        case "Flood":
            return "🌊";

        case "Cyclone":
            return "🌪️";

        case "Earthquake":
            return "🌍";

        case "Fire":
            return "🔥";

        case "Landslide":
            return "⛰️";

        case "Tsunami":
            return "🌊";

        default:
            return "⚠️";
    }
}


// =====================================================
// ADMIN PANEL
// SEND ALERT
// =====================================================

const alertForm =
    document.getElementById("alertForm");


if (alertForm) {

    alertForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const disaster =
                document.getElementById("disaster").value;

            const location =
                document.getElementById("location").value.trim();

            const severity =
                document.getElementById("severity").value;

            const message =
                document.getElementById("message").value.trim();


            // Check fields
            if (
                !disaster ||
                !location ||
                !severity ||
                !message
            ) {

                alert(
                    "Please fill all fields before sending the alert."
                );

                return;
            }


            // Create alert
            const now = new Date();

            const alertData = {

                id: Date.now().toString(),

                disaster: disaster,

                location: location,

                severity: severity,

                message: message,

                time: now.toLocaleTimeString(),

                date: now.toLocaleDateString(),

                status: "Active"

            };


            try {

                // -----------------------------------------
                // GET CURRENT ALERTS FROM FIREBASE
                // -----------------------------------------

                const snapshot =
                    await activeAlertsRef.once("value");


                let activeAlerts =
                    toArray(snapshot.val());


                // -----------------------------------------
                // ADD NEW ALERT
                // -----------------------------------------

                activeAlerts.push(alertData);


                // -----------------------------------------
                // SAVE DIRECTLY TO FIREBASE
                // -----------------------------------------

                await activeAlertsRef.set(
                    activeAlerts
                );


                // -----------------------------------------
                // SAVE TO HISTORY
                // -----------------------------------------

                const historySnapshot =
                    await historyRef.once("value");


                let alertHistory =
                    toArray(historySnapshot.val());


                alertHistory.unshift(alertData);


                await historyRef.set(
                    alertHistory
                );


                // -----------------------------------------
                // SUCCESS
                // -----------------------------------------

                alert(
                    "🚨 Disaster alert sent successfully!"
                );


                alertForm.reset();


            } catch (error) {

                console.error(
                    "Error sending alert:",
                    error
                );


                alert(
                    "❌ Failed to send alert.\n\nPlease check your Firebase connection."
                );
            }

        }
    );

}


// =====================================================
// ADMIN PANEL
// DISPLAY ACTIVE ALERTS
// =====================================================

const adminActiveAlerts =
    document.getElementById(
        "adminActiveAlerts"
    );


function displayAdminActiveAlerts(
    activeAlerts
) {

    if (!adminActiveAlerts) {
        return;
    }


    if (activeAlerts.length === 0) {

        adminActiveAlerts.innerHTML = `

            <p class="empty-history">
                No active alerts.
            </p>

        `;

        return;
    }


    adminActiveAlerts.innerHTML = "";


    activeAlerts.forEach(
        function (alertData) {

            const alertItem =
                document.createElement("div");


            alertItem.className =
                "admin-alert-item";


            alertItem.innerHTML = `

                <div class="admin-alert-icon">

                    ${getDisasterIcon(
                        alertData.disaster
                    )}

                </div>


                <div class="admin-alert-details">

                    <h3>
                        ${alertData.disaster} Alert
                    </h3>


                    <p>

                        📍 ${alertData.location}

                        &nbsp; • &nbsp;

                        ⚠️ ${alertData.severity}

                        &nbsp; • &nbsp;

                        🕐 ${alertData.time}

                    </p>


                    <p>
                        ${alertData.message}
                    </p>

                </div>


                <button
                    class="admin-resolve-button"
                    data-alert-id="${alertData.id}"
                >
                    ✅ Resolve
                </button>

            `;


            adminActiveAlerts.appendChild(
                alertItem
            );


            // -----------------------------------------
            // RESOLVE BUTTON
            // -----------------------------------------

            const resolveButton =
                alertItem.querySelector(
                    ".admin-resolve-button"
                );


            resolveButton.addEventListener(
                "click",
                async function () {

                    const alertId =
                        this.getAttribute(
                            "data-alert-id"
                        );


                    const confirmResolve =
                        confirm(
                            "Resolve this disaster alert?"
                        );


                    if (!confirmResolve) {
                        return;
                    }


                    try {

                        // ---------------------------------
                        // GET LATEST DATA FROM FIREBASE
                        // ---------------------------------

                        const snapshot =
                            await activeAlertsRef.once(
                                "value"
                            );


                        let currentAlerts =
                            toArray(
                                snapshot.val()
                            );


                        // ---------------------------------
                        // FIND ALERT
                        // ---------------------------------

                        const resolvedAlert =
                            currentAlerts.find(
                                function (item) {

                                    return String(
                                        item.id
                                    ) === String(
                                        alertId
                                    );

                                }
                            );


                        if (!resolvedAlert) {

                            alert(
                                "⚠️ This alert is no longer active."
                            );

                            return;
                        }


                        // ---------------------------------
                        // REMOVE ALERT FROM ACTIVE ALERTS
                        // ---------------------------------

                        const updatedAlerts =
                            currentAlerts.filter(
                                function (item) {

                                    return String(
                                        item.id
                                    ) !== String(
                                        alertId
                                    );

                                }
                            );


                        // ---------------------------------
                        // IMPORTANT:
                        // SAVE THE REMOVAL TO FIREBASE
                        // ---------------------------------

                        await activeAlertsRef.set(
                            updatedAlerts
                        );


                        // ---------------------------------
                        // GET HISTORY
                        // ---------------------------------

                        const historySnapshot =
                            await historyRef.once(
                                "value"
                            );


                        let alertHistory =
                            toArray(
                                historySnapshot.val()
                            );


                        // ---------------------------------
                        // MARK ALERT AS RESOLVED
                        // ---------------------------------

                        alertHistory =
                            alertHistory.map(
                                function (item) {

                                    if (
                                        String(item.id) ===
                                        String(resolvedAlert.id)
                                    ) {

                                        return {

                                            ...item,

                                            status:
                                                "Resolved"

                                        };

                                    }


                                    return item;

                                }
                            );


                        // ---------------------------------
                        // SAVE HISTORY TO FIREBASE
                        // ---------------------------------

                        await historyRef.set(
                            alertHistory
                        );


                        // ---------------------------------
                        // SUCCESS
                        // ---------------------------------

                        alert(
                            "✅ Alert resolved successfully."
                        );


                        // Refresh admin display
                        displayAdminActiveAlerts(
                            updatedAlerts
                        );


                        displayAlertHistory(
                            alertHistory
                        );


                    } catch (error) {

                        console.error(
                            "Resolve error:",
                            error
                        );


                        alert(
                            "❌ Could not resolve the alert.\n\nPlease try again."
                        );

                    }

                }
            );

        }
    );

}


// =====================================================
// ADMIN PANEL
// REAL-TIME ACTIVE ALERT LISTENER
// =====================================================

activeAlertsRef.on(
    "value",
    function (snapshot) {

        const activeAlerts =
            toArray(
                snapshot.val()
            );


        displayAdminActiveAlerts(
            activeAlerts
        );


        displayUserActiveAlerts(
            activeAlerts
        );

    }
);


// =====================================================
// USER DASHBOARD
// ELEMENTS
// =====================================================

const alertBox =
    document.getElementById(
        "alertBox"
    );


const systemAlertStatus =
    document.getElementById(
        "systemAlertStatus"
    );


// =====================================================
// USER DASHBOARD
// DISPLAY ACTIVE ALERTS
// =====================================================

function displayUserActiveAlerts(
    activeAlerts
) {

    if (!alertBox) {
        return;
    }


    // -----------------------------------------
    // NO ACTIVE ALERTS
    // -----------------------------------------

    if (activeAlerts.length === 0) {

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
                    disaster warnings.
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

            systemAlertStatus.style.color =
                "#2e9b59";
        }


        return;
    }


    // -----------------------------------------
    // ACTIVE ALERTS EXIST
    // -----------------------------------------

    if (systemAlertStatus) {

        systemAlertStatus.textContent =
            "🔴 " +
            activeAlerts.length +
            " Active Emergency" +
            (
                activeAlerts.length === 1
                    ? ""
                    : "ies"
            );

        systemAlertStatus.style.color =
            "#d9363e";
    }


    alertBox.innerHTML = "";


    activeAlerts.forEach(
        function (alertData) {

            const alertItem =
                document.createElement(
                    "div"
                );


            alertItem.className =
                "multiple-alert";


            alertItem.innerHTML = `

                <div class="alert-icon">

                    ${getDisasterIcon(
                        alertData.disaster
                    )}

                </div>


                <div class="alert-content">

                    <h3>

                        ${alertData.disaster}
                        Alert

                    </h3>


                    <p>

                        ${alertData.message}

                    </p>


                    <div class="alert-info">

                        <span>
                            📍 ${alertData.location}
                        </span>


                        <span>
                            ⚠️ ${alertData.severity}
                        </span>


                        <span>
                            🕐 ${alertData.time}
                        </span>

                    </div>

                </div>

            `;


            alertBox.appendChild(
                alertItem
            );

        }
    );

}


// =====================================================
// ALERT HISTORY
// =====================================================

const alertHistoryElement =
    document.getElementById(
        "alertHistory"
    );


function displayAlertHistory(
    alertHistory
) {

    if (!alertHistoryElement) {
        return;
    }


    if (alertHistory.length === 0) {

        alertHistoryElement.innerHTML = `

            <p class="empty-history">
                No previous alerts.
            </p>

        `;

        return;
    }


    alertHistoryElement.innerHTML = "";


    alertHistory.forEach(
        function (alertData) {

            const historyItem =
                document.createElement(
                    "div"
                );


            historyItem.className =
                "history-item";


            historyItem.innerHTML = `

                <div>

                    <strong>

                        ${getDisasterIcon(
                            alertData.disaster
                        )}

                        ${alertData.disaster}
                        Alert

                    </strong>


                    <p>

                        📍 ${alertData.location}

                        &nbsp; • &nbsp;

                        ⚠️ ${alertData.severity}

                    </p>


                    <p>
                        ${alertData.message}
                    </p>

                </div>


                <div>

                    <span>

                        ${alertData.status}

                    </span>

                    <p>

                        ${alertData.date}
                        &nbsp;
                        ${alertData.time}

                    </p>

                </div>

            `;


            alertHistoryElement.appendChild(
                historyItem
            );

        }
    );

}


// =====================================================
// HISTORY REAL-TIME LISTENER
// =====================================================

historyRef.on(
    "value",
    function (snapshot) {

        const alertHistory =
            toArray(
                snapshot.val()
            );


        displayAlertHistory(
            alertHistory
        );

    }
);


// =====================================================
// CLEAR HISTORY
// =====================================================

const clearHistoryButton =
    document.getElementById(
        "clearHistory"
    );


if (clearHistoryButton) {

    clearHistoryButton.addEventListener(
        "click",
        async function () {

            const confirmClear =
                confirm(
                    "Are you sure you want to clear all alert history?"
                );


            if (!confirmClear) {
                return;
            }


            try {

                await historyRef.set([]);


                alert(
                    "🗑️ Alert history cleared."
                );


            } catch (error) {

                console.error(
                    "History clear error:",
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
// COPY EMERGENCY NUMBER
// =====================================================

function copyEmergencyNumber(number) {

    navigator.clipboard
        .writeText(number)

        .then(
            function () {

                alert(
                    "📋 Emergency number copied: " +
                    number
                );

            }
        )

        .catch(
            function () {

                alert(
                    "Emergency number: " +
                    number
                );

            }
        );

}


// =====================================================
// IMPORTANT
// =====================================================
//
// Firebase is now the ONLY source of truth.
//
// We intentionally DO NOT use:
//
// localStorage.setItem(
//     "activeDisasterAlerts"
// )
//
// for alerts.
//
// This prevents a resolved alert from coming back.
//
// =====================================================

console.log(
    "🛡️ SafeGuard Firebase system loaded successfully."
);

// =====================================================
// DISASTER LOCATION MAP
// =====================================================

let disasterMap = null;
let disasterMarker = null;


// Common locations for the project
const locationCoordinates = {

    "Kalamboli": [19.0169, 73.1009],

    "Panvel": [18.9894, 73.1175],

    "Navi Mumbai": [19.0330, 73.0297],

    "Kharghar": [19.0473, 73.0699],

    "Kamothe": [19.0167, 73.0800],

    "New Panvel": [18.9880, 73.1100],

    "Seawoods": [19.0178, 73.0169],

    "Vashi": [19.0771, 72.9980],

    "Belapur": [19.0178, 73.0418],

    "Mumbai": [19.0760, 72.8777]

};


// =====================================================
// CREATE MAP
// =====================================================

function initializeDisasterMap() {

    const mapElement =
        document.getElementById("map");


    if (!mapElement) {
        return;
    }


    // Prevent creating the map more than once
    if (disasterMap) {
        return;
    }


    // Default location: Kalamboli
    disasterMap = L.map("map").setView(
        locationCoordinates["Kalamboli"],
        13
    );


    // OpenStreetMap tiles
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,

            attribution:
                '&copy; OpenStreetMap contributors'
        }
    ).addTo(disasterMap);


    // Default marker
    disasterMarker =
        L.marker(
            locationCoordinates["Kalamboli"]
        )
        .addTo(disasterMap)
        .bindPopup(
            "📍 SafeGuard Disaster Location"
        );


    // Fix map size calculation
    setTimeout(
        function () {

            disasterMap.invalidateSize();

        },
        300
    );

}


// =====================================================
// UPDATE MAP LOCATION
// =====================================================

function updateDisasterMap(activeAlerts) {

    if (!disasterMap) {
        return;
    }


    if (
        !activeAlerts ||
        activeAlerts.length === 0
    ) {

        // No active alert
        disasterMap.setView(
            locationCoordinates["Kalamboli"],
            13
        );


        if (disasterMarker) {

            disasterMarker.setLatLng(
                locationCoordinates["Kalamboli"]
            );

            disasterMarker.setPopupContent(
                "📍 No active disaster alert"
            );

        }

        return;
    }


    // Use the newest active alert
    const latestAlert =
        activeAlerts[
            activeAlerts.length - 1
        ];


    const location =
        latestAlert.location
            ? latestAlert.location.trim()
            : "Kalamboli";


    // Try to find exact known location
    let coordinates =
        locationCoordinates[location];


    // Try case-insensitive matching
    if (!coordinates) {

        const matchingLocation =
            Object.keys(
                locationCoordinates
            ).find(
                function (name) {

                    return name.toLowerCase() ===
                        location.toLowerCase();

                }
            );


        if (matchingLocation) {

            coordinates =
                locationCoordinates[
                    matchingLocation
                ];

        }

    }


    // If location isn't in our list,
    // use Kalamboli as safe fallback.
    if (!coordinates) {

        coordinates =
            locationCoordinates["Kalamboli"];

    }


    // Move map
    disasterMap.setView(
        coordinates,
        14,
        {
            animate: true
        }
    );


    // Move marker
    if (disasterMarker) {

        disasterMarker.setLatLng(
            coordinates
        );


        disasterMarker.setPopupContent(

            "🚨 <strong>" +
            latestAlert.disaster +
            " Alert</strong><br>" +

            "📍 " +
            location +
            "<br>" +

            "⚠️ Severity: " +
            latestAlert.severity

        );

    }

}


// =====================================================
// START MAP
// =====================================================

initializeDisasterMap();


// =====================================================
// CONNECT MAP TO FIREBASE
// =====================================================

activeAlertsRef.on(
    "value",
    function (snapshot) {

        const activeAlerts =
            toArray(
                snapshot.val()
            );


        updateDisasterMap(
            activeAlerts
        );

    }
);