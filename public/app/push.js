import { appState, post } from "./store.js";

let subscription = null;

export const pushSupported = ("pushManager" in window || ("PushManager" in window && "serviceWorker" in navigator)) && "Notification" in window;

const manager = async () => window.pushManager || (await navigator.serviceWorker.ready).pushManager;

export const pushEnabled = () => Boolean(subscription) && Notification.permission === "granted";

function serverKey() {
  const padded = appState().pushKey.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

export async function loadPush() {
  if (!pushSupported) return;
  try {
    subscription = await (await manager()).getSubscription();
  } catch {
    subscription = null;
  }
}

export async function enablePush() {
  if (!appState().pushKey) throw new Error("no_key");
  subscription = await (await manager()).subscribe({ userVisibleOnly: true, applicationServerKey: serverKey() });
  try {
    await post("/api/push", { action: "subscribe", subscription: subscription.toJSON() });
  } catch (error) {
    await disablePush();
    throw error;
  }
}

export async function disablePush() {
  const current = subscription;
  subscription = null;
  if (!current) return;
  post("/api/push", { action: "unsubscribe", endpoint: current.endpoint }).catch(() => {});
  await current.unsubscribe();
}
