(function (root) {
  const firebaseConfig = {
    apiKey: "AIzaSyCNwTeXvNskFtH5sKT4YSjk40PuWyKGoE",
    authDomain: "safeguard-disaster-system.firebaseapp.com",
    databaseURL: "https://safeguard-disaster-system-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "safeguard-disaster-system",
    storageBucket: "safeguard-disaster-system.firebasestorage.app",
    messagingSenderId: "690746267419",
    appId: "1:690746267419:web:3b6c34e2dcd1481ceee5be"
  };

  if (root.firebase.apps.length === 0) {
    root.firebase.initializeApp(firebaseConfig);
  }
})(window);
