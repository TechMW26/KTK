/**
 * Manual two-client Firebase smoke script.
 *
 * Creates one real room in the live RTDB so you can point two browsers at it.
 * Not part of the test suite and not imported by the app — it exists purely for
 * hand-testing matchmaking/room flows.
 *
 * Run:  node scripts/mkroom-scratch.mjs
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getDatabase, ref, set, runTransaction, serverTimestamp } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBYC7w0AJOxhQEL3PmCNhQbWjr9ExTOoMI",
    authDomain: "killtheking-94396.firebaseapp.com",
    databaseURL: "https://killtheking-94396-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "killtheking-94396",
};

// ---- Host identity (module A) ----
const appA = initializeApp(firebaseConfig, "hostapp");
const authA = getAuth(appA);
const dbA = getDatabase(appA);
const { user: host } = await signInAnonymously(authA);
const hostUid = host.uid;

const ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function gen() { let s = ''; for (let i = 0; i < 6; i++) s += ALPH[Math.floor(Math.random() * ALPH.length)]; return s; }
const code = gen();
console.log("room code", code);

// createRoom equivalent: whole-room transaction
const now = Date.now();
const roomObj = {
    code, hostId: hostUid, status: "waiting", createdAt: now,
    updatedAt: serverTimestamp(), order: [hostUid], players: { [hostUid]: { name: "HostNode", joinedAt: now, connected: true, seat: 0, isHost: true, presence: now } },
};
const created = await runTransaction(ref(dbA, "rooms/" + code), (raw) => raw ? undefined : roomObj, { applyLocally: false });
console.log("create committed", created.committed);
const emptyGame = { status: "in-progress", level: 0, round: 1, scores: [0, 0], bluffsUsed: [false, false], phase: "dealer-hide", actingSeat: 0, dealerSeat: 0, pendingGuess: null, lastResult: null, awaitingNext: false, winnerSeat: null, seq: 0 };
if (created.committed) await set(ref(dbA, "rooms/" + code + "/game"), emptyGame);
console.log("game set");
process.exit(0);
