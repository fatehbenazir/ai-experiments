import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Set persistence to local to help with mobile session issues
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.error("Could not set persistence:", err);
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  console.log("Attempting Google Sign-in with Popup...");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error("Popup sign-in failed, trying redirect...", error);
    // Fallback to redirect if popup is blocked or fails
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
};

export const signInWithGoogleRedirect = async () => {
  console.log("Attempting Google Sign-in with Redirect...");
  await signInWithRedirect(auth, googleProvider);
};

export const handleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    return result?.user;
  } catch (error) {
    console.error("Error getting redirect result", error);
    throw error;
  }
};
