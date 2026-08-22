// ================================
// SAFEGUARD DISASTER ALERT SYSTEM
// ================================


// ADMIN PANEL
// Send an alert

const alertForm = document.getElementById("alertForm");

if (alertForm) {

    alertForm.addEventListener("submit", function (event) {

        event.preventDefault();

        const disaster =
            document.getElementById("disaster").value;

        const location =
            document.getElementById("location").value;

        const severity =
            document.getElementById("severity").value;

        const message =
            document.getElementById("message").value;


        const alertData = {

            disaster: disaster,
            location: location,
            severity: severity,
            message: message,
            time: new 
        Date().toLocaleTimeString(),
            date: new 
        Date().toLocaleDateString(),
            status: "Active"

        };


        // Get existing active alerts

        let activeAlerts =
            JSON.parse(
                localStorage.getItem("activeDisasterAlerts")
            ) || [];


        // Give this alert a unique ID

        alertData.id =
            Date.now().toString();


        // Add the new alert

        activeAlerts.push(alertData);


        // Save all active alerts

        localStorage.setItem(
            "activeDisasterAlerts",
            JSON.stringify(activeAlerts)
        );

        // Save alert to history

        let alertHistory =
            JSON.parse(
                localStorage.getItem("alertHistory")
            ) || [];

        alertHistory.unshift(alertData);

        localStorage.setItem(
            "alertHistory",
            JSON.stringify(alertHistory)
        );


        alert(
            "🚨 Disaster alert sent successfully!"
        );


        // Clear form

        alertForm.reset();

    });

}



// ================================
// USER DASHBOARD
// DISPLAY MULTIPLE ACTIVE ALERTS
// ================================

const alertBox =
    document.getElementById("alertBox");

const systemAlertStatus =
    document.getElementById("systemAlertStatus");


// Get all active alerts

const activeAlerts =
    JSON.parse(
        localStorage.getItem("activeDisasterAlerts")
    ) || [];


// ------------------------------------------------
// NO ACTIVE ALERTS
// ------------------------------------------------

if (activeAlerts.length === 0) {

    if (alertBox) {

        alertBox.innerHTML = `

            <div class="alert-icon">
                ✓
            </div>

            <div class="alert-content">

                <h3>No Active Emergency</h3>

                <p>
                    There are currently no active disaster
                    warnings reported in your area.
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
    }


    if (systemAlertStatus) {

        systemAlertStatus.textContent =
            "● No Active Emergency";

        systemAlertStatus.style.color =
            "#2e9b59";
    }

}


// ------------------------------------------------
// ACTIVE ALERTS
// ------------------------------------------------

else {

    // Update system status

    if (systemAlertStatus) {

        systemAlertStatus.textContent =
            "🔴 " +
            activeAlerts.length +
            " Active Emergency" +
            (activeAlerts.length > 1 ? "ies" : "");

        systemAlertStatus.style.color =
            "#d9363e";
    }


    // Display all alerts

    if (alertBox) {

        alertBox.innerHTML = "";


        activeAlerts.forEach(function (alertData) {

            const alertItem =
                document.createElement("div");

            alertItem.className =
                "multiple-alert";


            // Select icon

            let icon = "⚠️";

            if (alertData.disaster === "Flood") {
                icon = "🌊";
            }

            else if (alertData.disaster === "Cyclone") {
                icon = "🌪️";
            }

            else if (alertData.disaster === "Earthquake") {
                icon = "🌍";
            }

            else if (alertData.disaster === "Fire") {
                icon = "🔥";
            }

            else if (alertData.disaster === "Landslide") {
                icon = "⛰️";
            }

            else if (alertData.disaster === "Tsunami") {
                icon = "🌊";
            }


            // Create alert

            alertItem.innerHTML = `

            <div class="multiple-alert-icon">
                ${icon}
            </div>

            <div class="multiple-alert-content">

                <h3>
                    ${alertData.disaster} Alert
                </h3>

                <p>
                    ${alertData.message}
                </p>

                <div class="alert-info">

                    <span>
                        📍 ${alertData.location}
                    </span>

                    <span>
                        ⚠️ ${alertData.severity} Severity
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

        });

    }

}


// =================================================
// DISASTER SAFETY INSTRUCTIONS
// =================================================

const safetyInstructions = {

    Flood: [
        "Move to higher ground immediately.",
        "Avoid flooded roads and bridges.",
        "Never walk or drive through moving water.",
        "Keep your phone charged and follow official updates."
    ],

    Fire: [
        "Move away from the affected area.",
        "Stay low if there is smoke.",
        "Do not use elevators during a fire.",
        "Call emergency services and follow evacuation instructions."
    ],

    Cyclone: [
        "Stay indoors and away from windows.",
        "Keep your phone and emergency devices charged.",
        "Secure loose objects around your home.",
        "Follow official evacuation instructions."
    ],

    Earthquake: [
        "Drop, Cover and Hold On.",
        "Stay away from windows and heavy objects.",
        "Do not use elevators.",
        "After the shaking stops, move carefully to a safe area."
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


// =================================================
// DISPLAY SAFETY INSTRUCTIONS
// =================================================

const safetyBox =
    document.getElementById("safetyInstructions");

const safetyList =
    document.getElementById("safetyList");


if (
    safetyBox &&
    safetyList &&
    activeAlerts.length > 0
) {

    safetyBox.style.display =
        "block";

    safetyList.innerHTML = "";


    activeAlerts.forEach(function (alertData) {

        const instructions =
            safetyInstructions[
                alertData.disaster
            ];


        if (instructions) {

            const heading =
                document.createElement("h4");

            heading.textContent =
                `${alertData.disaster} — ${alertData.location}`;

            safetyList.appendChild(
                heading
            );


            instructions.forEach(
                function (instruction) {

                    const listItem =
                        document.createElement("li");

                    listItem.textContent =
                        instruction;

                    safetyList.appendChild(
                        listItem
                    );

                }
            );

        }

    });

}


// =================================================
// AFFECTED LOCATION
// =================================================

const affectedLocation =
    document.getElementById("affectedLocation");


if (affectedLocation) {

    if (activeAlerts.length > 0) {

        affectedLocation.textContent =
            activeAlerts
                .map(function (alertData) {
                    return alertData.location;
                })
                .join(" • ");

    }

    else {

        affectedLocation.textContent =
            "No affected location";

    }

}


// =================================================
// ACCURATE MULTIPLE DISASTER MAP
// =================================================

const mapElement =
    document.getElementById("map");

if (
    mapElement &&
    typeof L !== "undefined"
) {

    // Create map
    const map = L.map("map");


    // OpenStreetMap tiles
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                '&copy; OpenStreetMap contributors'
        }
    ).addTo(map);


    // Default starting view: Navi Mumbai area
    map.setView(
        [19.0326, 73.1033],
        11
    );


    // Store all successfully located markers
    const markers = [];


    // Process every active alert
    activeAlerts.forEach(
        function (alertData) {

            const searchLocation =
                encodeURIComponent(
                    alertData.location +
                    ", Maharashtra, India"
                );


            fetch(
                `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${searchLocation}`,
                {
                    headers: {
                        "Accept": "application/json"
                    }
                }
            )

            .then(function (response) {

                if (!response.ok) {

                    throw new Error(
                        "Location service unavailable"
                    );

                }

                return response.json();

            })

            .then(function (results) {

                // Location could not be found
                if (results.length === 0) {

                    console.log(
                        "Location not found:",
                        alertData.location
                    );

                    return;

                }


                const latitude =
                    parseFloat(
                        results[0].lat
                    );

                const longitude =
                    parseFloat(
                        results[0].lon
                    );


                const displayName =
                    results[0].display_name;


                // Create marker
                const marker =
                    L.marker([
                        latitude,
                        longitude
                    ]).addTo(map);


                // Popup
                marker.bindPopup(`

                    <div style="min-width: 200px;">

                        <strong>
                            🚨 ${alertData.disaster} Alert
                        </strong>

                        <br><br>

                        📍
                        <strong>
                            ${alertData.location}
                        </strong>

                        <br>

                        ⚠️
                        ${alertData.severity} Severity

                        <br><br>

                        ${alertData.message}

                        <hr>

                        <small>
                            📌 ${displayName}
                        </small>

                    </div>

                `);


                // Store marker
                markers.push(marker);


                // If we have markers, fit map to all of them
                if (markers.length > 0) {

                    const markerGroup =
                        L.featureGroup(
                            markers
                        );

                    map.fitBounds(
                        markerGroup.getBounds(),
                        {
                            padding: [40, 40],
                            maxZoom: 13
                        }
                    );

                }

            })

            .catch(function (error) {

                console.log(
                    "Map location error:",
                    error
                );

            });

        }
    );

}
// ================================
// RESOLVE ALERT
// ================================

const resolveButton =
    document.getElementById("resolveAlert");

if (resolveButton) {

    resolveButton.addEventListener("click", function () {

        const activeAlert =
            localStorage.getItem("activeDisasterAlert");

        if (!activeAlert) {

            alert("There is no active disaster alert.");

            return;
        }

        const confirmResolve =
            confirm(
                "Are you sure you want to resolve the active alert?"
            );

        if (confirmResolve) {

            // Get the current active alert
            const activeAlert =
                JSON.parse(
                    localStorage.getItem("activeDisasterAlert")
                );

            // Get alert history
            let alertHistory =
                JSON.parse(
                    localStorage.getItem("alertHistory")
                ) || [];


            // Mark the matching alert as resolved
            if (activeAlert) {

                alertHistory =
                    alertHistory.map(function (alertItem) {

                        if (
                            alertItem.time === activeAlert.time &&
                            alertItem.date === activeAlert.date
                        ) {

                            alertItem.status = "Resolved";

                        }

                        return alertItem;

                    });

            }


            // Save updated history
            localStorage.setItem(
                "alertHistory",
                JSON.stringify(alertHistory)
            );


            // Remove active alert
            localStorage.removeItem(
                "activeDisasterAlert"
            );


            alert(
                "✅ Disaster alert has been resolved."
            );


            location.reload();

        }

    });

}

// ================================
// DISPLAY ALERT HISTORY
// ================================

const historyContainer =
    document.getElementById("alertHistory");

if (historyContainer) {

    const alertHistory =
        JSON.parse(
            localStorage.getItem("alertHistory")
        ) || [];

    if (alertHistory.length > 0) {

        historyContainer.innerHTML = "";

        alertHistory.forEach(function (alertData) {

            let icon = "⚠️";

            if (alertData.disaster === "Flood") {
                icon = "🌊";
            }

            else if (alertData.disaster === "Fire") {
                icon = "🔥";
            }

            else if (alertData.disaster === "Cyclone") {
                icon = "🌪️";
            }

            else if (alertData.disaster === "Earthquake") {
                icon = "🌍";
            }

            else if (alertData.disaster === "Landslide") {
                icon = "⛰️";
            }

            else if (alertData.disaster === "Tsunami") {
                icon = "🌊";
            }


            const historyItem =
                document.createElement("div");

            historyItem.className =
                "history-item";


            historyItem.innerHTML = `

                <div class="history-icon">
                    ${icon}
                </div>

                <div class="history-details">

                    <h3>
                        ${alertData.disaster} Alert
                    </h3>

                    <p>
                        📍 ${alertData.location}
                        &nbsp; • &nbsp;
                        ${alertData.date}
                        ${alertData.time}
                    </p>

                </div>

                <div class="history-severity
                    ${alertData.status === "Resolved"
                        ? "history-resolved"
                        : "history-active"}">

                    ${alertData.status}

                </div>

            `;

            historyContainer.appendChild(
                historyItem
            );

        });

    }

}

// ================================
// CLEAR ALERT HISTORY
// ================================

const clearHistoryButton =
    document.getElementById("clearHistory");

if (clearHistoryButton) {

    clearHistoryButton.addEventListener(
        "click",
        function () {

            const confirmClear =
                confirm(
                    "Are you sure you want to delete all alert history?"
                );

            if (confirmClear) {

                localStorage.removeItem(
                    "alertHistory"
                );

                alert(
                    "🗑️ Alert history has been cleared."
                );

                location.reload();
            }

        }
    );

}

// =======================================
// ADMIN ACTIVE ALERTS
// =======================================

const adminActiveAlerts =
    document.getElementById(
        "adminActiveAlerts"
    );


if (adminActiveAlerts) {

    const activeAlerts =
        JSON.parse(
            localStorage.getItem(
                "activeDisasterAlerts"
            )
        ) || [];


    if (activeAlerts.length === 0) {

        adminActiveAlerts.innerHTML = `

            <p class="empty-history">
                No active alerts.
            </p>

        `;

    }

    else {

        adminActiveAlerts.innerHTML = "";


        activeAlerts.forEach(
            function (alertData) {

                let icon = "⚠️";


                if (
                    alertData.disaster ===
                    "Flood"
                ) {

                    icon = "🌊";

                }

                else if (
                    alertData.disaster ===
                    "Cyclone"
                ) {

                    icon = "🌪️";

                }

                else if (
                    alertData.disaster ===
                    "Earthquake"
                ) {

                    icon = "🌍";

                }

                else if (
                    alertData.disaster ===
                    "Fire"
                ) {

                    icon = "🔥";

                }

                else if (
                    alertData.disaster ===
                    "Landslide"
                ) {

                    icon = "⛰️";

                }

                else if (
                    alertData.disaster ===
                    "Tsunami"
                ) {

                    icon = "🌊";

                }


                const alertItem =
                    document.createElement(
                        "div"
                    );


                alertItem.className =
                    "admin-alert-item";


                alertItem.innerHTML = `

                    <div class="admin-alert-icon">
                        ${icon}
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


                // Resolve individual alert

                const resolveButton =
                    alertItem.querySelector(
                        ".admin-resolve-button"
                    );


                resolveButton.addEventListener(
                    "click",
                    function () {

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


                        // Get current active alerts

                        let currentAlerts =
                            JSON.parse(
                                localStorage.getItem(
                                    "activeDisasterAlerts"
                                )
                            ) || [];


                        // Find the alert

                        const resolvedAlert =
                            currentAlerts.find(
                                function (item) {

                                    return (
                                        item.id ===
                                        alertId
                                    );

                                }
                            );


                        // Remove ONLY this alert

                        currentAlerts =
                            currentAlerts.filter(
                                function (item) {

                                    return (
                                        item.id !==
                                        alertId
                                    );

                                }
                            );


                        localStorage.setItem(
                            "activeDisasterAlerts",
                            JSON.stringify(
                                currentAlerts
                            )
                        );


                        // Update history

                        let alertHistory =
                            JSON.parse(
                                localStorage.getItem(
                                    "alertHistory"
                                )
                            ) || [];


                        if (resolvedAlert) {

                            alertHistory =
                                alertHistory.map(
                                    function (item) {

                                        if (
                                            item.id ===
                                            resolvedAlert.id
                                        ) {

                                            item.status =
                                                "Resolved";

                                        }

                                        return item;

                                    }
                                );

                        }


                        localStorage.setItem(
                            "alertHistory",
                            JSON.stringify(
                                alertHistory
                            )
                        );


                        alert(
                            "✅ Alert resolved successfully."
                        );


                        location.reload();

                    }
                );

            }
        );

    }

}

// =======================================
// COPY EMERGENCY NUMBER
// =======================================

function copyEmergencyNumber(number) {

    navigator.clipboard.writeText(number)

        .then(function () {

            alert(
                "📋 Emergency number copied: " +
                number
            );

        })

        .catch(function () {

            alert(
                "Emergency number: " +
                number
            );

        });

}