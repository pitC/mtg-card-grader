const FIREBASE_VERSION = '12.17.1';
const firebaseConfig = {
  apiKey: 'AIzaSyAUReVkoQ1fSSztd8cQXHmtyMNFUQS2hk0',
  authDomain: 'mtg-card-grader.firebaseapp.com',
  projectId: 'mtg-card-grader',
  storageBucket: 'mtg-card-grader.firebasestorage.app',
  messagingSenderId: '479390474930',
  appId: '1:479390474930:web:297c0047064abdc1031fab',
};

let firestoreApiPromise = null;

export function getFirestoreApi() {
  if (!firestoreApiPromise) {
    firestoreApiPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]).then(([firebaseApp, firestore]) => ({
      db: firestore.getFirestore(firebaseApp.initializeApp(firebaseConfig)),
      doc: firestore.doc,
      getDoc: firestore.getDoc,
      setDoc: firestore.setDoc,
    }));
  }
  return firestoreApiPromise;
}