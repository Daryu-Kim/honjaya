// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
