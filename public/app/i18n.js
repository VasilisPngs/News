import { readLocal, writeLocal } from "./storage.js";

const STORAGE_KEY = "news.lang";
const LANGUAGES = ["en", "el"];

const STRINGS = {
  tabForYou: ["For You", "Για εσάς"],
  tabSources: ["Sources", "Πηγές"],
  tabSaved: ["Saved", "Αποθηκευμένα"],
  tabSettings: ["Settings", "Ρυθμίσεις"],

  statusSignIn: ["Sign in", "Σύνδεση"],
  sessionExpired: ["Your Cloudflare Access session expired.", "Η σύνδεση στο Cloudflare Access έληξε."],
  loadFailed: ["Couldn't refresh. Showing what was loaded last.", "Δεν έγινε ανανέωση. Βλέπεις ό,τι φορτώθηκε τελευταία."],
  actionFailed: ["That didn't go through. Try again.", "Δεν ολοκληρώθηκε. Δοκίμασε ξανά."],

  delete: ["Delete", "Διαγραφή"],
  rename: ["Rename", "Μετονομασία"],
  edit: ["Edit", "Αλλαγές"],
  namePlaceholder: ["Name", "Όνομα"],
  all: ["All", "Όλες"],

  forYouTitle: ["For You", "Για εσάς"],
  newTopic: ["New topic", "Νέο θέμα"],
  topicPlaceholder: ["Barcelona, AI, iPhone", "Μπαρτσελόνα, AI, iPhone"],
  topicExists: ["You already have this topic.", "Αυτό το θέμα υπάρχει ήδη."],
  noTopics: ["Nothing here yet", "Τίποτα ακόμα"],
  noTopicsHint: ["Add topics you care about and the articles from your sources that match them show up here.", "Πρόσθεσε θέματα που σε ενδιαφέρουν και εδώ θα εμφανίζονται τα άρθρα των πηγών σου που τους ταιριάζουν."],
  forYouNoSources: ["No sources yet", "Καμία πηγή ακόμα"],
  forYouNoSourcesHint: ["Add the sites you read and the articles that suit you are picked from them here.", "Πρόσθεσε τα sites που διαβάζεις και εδώ θα διαλέγονται από αυτά τα άρθρα που σου ταιριάζουν."],
  searching: ["Finding articles", "Ψάχνω άρθρα"],
  searchingHint: ["Picking from your sources what matches your topics.", "Διαλέγω από τις πηγές σου ό,τι ταιριάζει στα θέματά σου."],

  sourcesTitle: ["Sources", "Πηγές"],
  newSource: ["New source", "Νέα πηγή"],
  sourcePlaceholder: ["Site address, e.g. theverge.com", "Διεύθυνση site, π.χ. gazzetta.gr"],
  sourceSearching: ["Looking for the site's articles…", "Ψάχνω τα άρθρα του site…"],
  sourceAdded: ["Source added", "Η πηγή προστέθηκε"],
  noFeed: ["No article feed was found on this site.", "Δεν βρέθηκε ροή άρθρων σε αυτό το site."],
  noSources: ["No sources yet", "Καμία πηγή ακόμα"],
  noSourcesHint: ["Add the sites you read and their articles show up here.", "Πρόσθεσε τα sites που διαβάζεις και εδώ θα εμφανίζονται τα άρθρα τους."],
  noArticles: ["No articles yet", "Κανένα άρθρο ακόμα"],
  noArticlesHint: ["New articles show up here as they come out.", "Τα νέα άρθρα εμφανίζονται εδώ μόλις βγαίνουν."],

  savedTitle: ["Saved", "Αποθηκευμένα"],
  noSaved: ["Nothing saved", "Κανένα αποθηκευμένο"],
  noSavedHint: ["Tap the bookmark on an article to keep it for later.", "Πάτα το σημάδι αποθήκευσης σε ένα άρθρο για να το κρατήσεις για αργότερα."],

  remove: ["Remove", "Αφαίρεση"],
  less: ["Suggest Less", "Λιγότερα τέτοια"],
  lessDone: ["You'll see fewer stories like this.", "Θα βλέπεις λιγότερα τέτοια."],

  settingsTitle: ["Settings", "Ρυθμίσεις"],
  content: ["Content", "Περιεχόμενο"],
  topics: ["Topics", "Θέματα"],
  sources: ["Sources", "Πηγές"],
  deleteTopic: ["Delete topic", "Διαγραφή θέματος"],
  deleteTopicBody: ["For You stops picking articles for it.", "Το «Για εσάς» σταματά να διαλέγει άρθρα γι' αυτό."],
  deleteSource: ["Delete source", "Διαγραφή πηγής"],
  deleteSourceBody: ["Its articles leave Sources and For You. Saved ones stay.", "Τα άρθρα της φεύγουν από τις Πηγές και το «Για εσάς». Τα αποθηκευμένα μένουν."],
  notifications: ["Notifications", "Ειδοποιήσεις"],
  importantNews: ["Important news", "Σημαντικές ειδήσεις"],
  importantNewsNote: ["Up to 3 a day, only when many of your sources cover something in your topics.", "Έως 3 την ημέρα, μόνο όταν πολλές από τις πηγές σου γράφουν για κάτι στα θέματά σου."],
  notificationsBlocked: ["Notifications for News are off in iPhone Settings.", "Οι ειδοποιήσεις του News είναι κλειστές στις Ρυθμίσεις του iPhone."],
  notificationsFailed: ["Notifications could not be turned on.", "Δεν ενεργοποιήθηκαν οι ειδοποιήσεις."],
  preferences: ["Preferences", "Προτιμήσεις"],
  language: ["Language", "Γλώσσα"],
  theme: ["Theme", "Θέμα"],
  themeSystem: ["System", "Σύστημα"],
  themeLight: ["Light", "Φωτεινό"],
  themeDark: ["Dark", "Σκούρο"]
};

const PLURALS = {
  source: [["source", "sources"], ["πηγή", "πηγές"]]
};

export const i18nEvents = new EventTarget();

function detect() {
  const stored = readLocal(STORAGE_KEY);
  if (LANGUAGES.includes(stored)) return stored;
  return (navigator.language || "en").toLowerCase().startsWith("el") ? "el" : "en";
}

let current = detect();
let index = LANGUAGES.indexOf(current);

export const language = () => current;
export const languages = () => [...LANGUAGES];
export const locale = () => (current === "el" ? "el-GR" : "en-GB");

const formatters = new Map();

export function formatter(Type, options = {}, locales = locale()) {
  const key = `${Type.name}|${locales}|${JSON.stringify(options)}`;
  let instance = formatters.get(key);
  if (!instance) formatters.set(key, (instance = new Type(locales, options)));
  return instance;
}

export function setLanguage(next) {
  if (!LANGUAGES.includes(next) || next === current) return;
  current = next;
  index = LANGUAGES.indexOf(next);
  writeLocal(STORAGE_KEY, next);
  document.documentElement.lang = next;
  i18nEvents.dispatchEvent(new CustomEvent("changed"));
}

export function applyLanguage() {
  document.documentElement.lang = current;
}

export function t(key, params) {
  const entry = STRINGS[key];
  if (!entry) return key;
  const value = entry[index] || entry[0];
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

const isOne = (count) => formatter(Intl.PluralRules).select(count) === "one";

export const tn = (count, key) => `${formatter(Intl.NumberFormat).format(count)} ${PLURALS[key][index][isOne(count) ? 0 : 1]}`;

export function dayStart(time, offset = 0) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + offset);
  return day.getTime();
}

const daysBetween = (from, to) => Math.round((dayStart(to) - dayStart(from)) / 86400000);

export function dayLabel(timestamp) {
  const days = daysBetween(timestamp, Date.now());
  if (days <= 1) {
    const text = formatter(Intl.RelativeTimeFormat, { numeric: "auto" }).format(-Math.max(days, 0), "day");
    return text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1);
  }
  return formatter(Intl.DateTimeFormat, { weekday: "long", day: "numeric", month: "long" }).format(timestamp);
}

export function ago(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  const relative = formatter(Intl.RelativeTimeFormat, { numeric: "auto", style: "short" });
  if (minutes < 60) return relative.format(-minutes, "minute");
  if (minutes < 1440) return relative.format(-Math.round(minutes / 60), "hour");
  return formatter(Intl.DateTimeFormat, { day: "numeric", month: "short" }).format(timestamp);
}
