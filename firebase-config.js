// Configurazione Firebase — progetto "viaggio-in-islanda"
// Queste chiavi non sono segrete: sono pensate per stare nel codice pubblico dell'app
// (la vera protezione dei dati sta nelle regole di sicurezza di Firestore, non qui).
const firebaseConfig = {
  apiKey: "AIzaSyDmt9QsHfPU4Ng5Yy2svhwPSxrCf8HSLmw",
  authDomain: "viaggio-in-islanda.firebaseapp.com",
  projectId: "viaggio-in-islanda",
  storageBucket: "viaggio-in-islanda.firebasestorage.app",
  messagingSenderId: "507417242938",
  appId: "1:507417242938:web:6479387416cb9ac6f27403"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// consente di continuare a usare l'app offline: le modifiche fatte senza
// connessione si sincronizzano da sole non appena torna internet
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn('Persistenza offline Firestore non disponibile:', err.code);
});
