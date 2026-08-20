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

            time: new Date().toLocaleTimeString()

        };


        // Save alert in browser

        localStorage.setItem(
            "activeDisasterAlert",
            JSON.stringify(alertData)
        );


        alert(
            "🚨 Disaster alert sent successfully!"
        );


        // Clear form

        alertForm.reset();

    });

}



// USER DASHBOARD
// Display active alert

const alertBox =
    document.getElementById("alertBox");


if (alertBox) {

    const savedAlert =
        localStorage.getItem("activeDisasterAlert");


    if (savedAlert) {
        const systemAlertStatus =

        document.getElementById("systemAlertStatus");

        if (systemAlertStatus) {
            systemAlertStatus.textContent =
                "🔴 Active Emergency";

            systemAlertStatus.style.color = "#d9363e";
        }

        const alertData =
            JSON.parse(savedAlert);

            // Disaster-specific safety instructions
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
            ]

        };

        const safetyBox =
        document.getElementById("safetyInstructions");

        const safetyList =
        document.getElementById("safetyList");


        if (
            safetyBox &&
            safetyList &&
            safetyInstructions[alertData.disaster]
        ) {

            safetyList.innerHTML = "";

        safetyInstructions[alertData.disaster].forEach(
                function (instruction) {

                    const listItem =
                        document.createElement("li");
                
                    listItem.textContent =
                        instruction;

                    safetyList.appendChild(listItem);

                }
            );

            safetyBox.style.display = "block";
        }


        alertBox.innerHTML = `

            <div class="alert-icon">
                ⚠️
            </div>

            <div class="alert-content">

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

    }

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