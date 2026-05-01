import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmwzz48YKUn2cp_9kY7xFIOw90KwvCp_g",
  authDomain: "honjaya.firebaseapp.com",
  databaseURL:
    "https://honjaya-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "honjaya",
  storageBucket: "honjaya.firebasestorage.app",
  messagingSenderId: "346879353452",
  appId: "1:346879353452:web:e3ebef65ef26d94b69ae49",
  measurementId: "G-3QZMSPDZQJ",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
