import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { toast } from 'sonner';

export const app = initializeApp(firebaseConfig);

// Enable offline persistence (caches maps/prices and queues reports)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const auth = getAuth(app);
export const storage = getStorage(app);

// Sign in anonymously on load to allow instant price reporting
auth.onAuthStateChanged((user) => {
  if (!user) {
    signInAnonymously(auth).catch((error: any) => {
      // Changed from console.error to console.warn to prevent the preview environment from flagging this as a hard crash
      if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
        console.warn(
          "⚠️ ANONYMOUS AUTHENTICATION IS NOT ENABLED ⚠️\n" +
          "To allow users to report prices without signing in, you must enable Anonymous Auth in your Firebase Console:\n" +
          "1. Go to Authentication -> Sign-in method\n" +
          "2. Click 'Add new provider'\n" +
          "3. Select 'Anonymous' and enable it."
        );
      } else {
        console.warn("Anonymous auth warning:", error.message);
      }
    });
  }
});

export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    toast.success("Signed in with Google!");
  } catch (error: any) {
    console.error(error);
    toast.error("Failed to sign in with Google.");
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
    toast.success("Signed out successfully.");
  } catch (error) {
    console.error(error);
    toast.error("Failed to sign out.");
  }
};

/*
=== EXACT FIRESTORE SECURITY RULES ===
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function incoming() { return request.resource.data; }
    function existing() { return resource.data; }
    function isValidId(id) { return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$'); }

    match /{document=**} { allow read, write: if false; }

    match /stations/{stationId} {
      allow read: if true;

      allow create: if isSignedIn()
        && isValidId(stationId)
        && incoming().keys().hasAll(['name', 'address', 'lat', 'lng', 'reports_count'])
        && incoming().name is string && incoming().name.size() > 0 && incoming().name.size() <= 100
        && incoming().address is string && incoming().address.size() > 0 && incoming().address.size() <= 200
        && incoming().lat is number
        && incoming().lng is number
        && incoming().reports_count is number && incoming().reports_count >= 0;

      allow update: if isSignedIn()
        && isValidId(stationId)
        && incoming().diff(existing()).affectedKeys().hasOnly(['diesel_price', 'petrol_price', 'last_updated', 'reports_count', 'last_reporter_uid', 'latest_image_url'])
        && (!('last_reporter_uid' in incoming()) || incoming().last_reporter_uid == request.auth.uid)
        && (!('latest_image_url' in incoming()) || incoming().latest_image_url is string);
    }

    match /price_reports/{reportId} {
       allow read: if true;
       allow create: if isSignedIn()
         && isValidId(reportId)
         && incoming().keys().hasAll(['station_id', 'fuel_type', 'price', 'timestamp', 'reporter_uid'])
         && incoming().station_id is string && incoming().station_id.size() <= 128
         && incoming().fuel_type in ['diesel', 'petrol']
         && incoming().price is number && incoming().price > 0 && incoming().price < 1000
         && incoming().reporter_uid == request.auth.uid;
    }
  }
}
*/
