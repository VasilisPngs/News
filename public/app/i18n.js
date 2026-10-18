import { readLocal, writeLocal } from "./storage.js";

const STORAGE_KEY = "news.lang";
const LANGUAGES = ["en", "el"];

const STRINGS = {
  tabForYou: ["For You", "Για εσάς"],
  tabSources: ["Following", "Ακολουθείτε"],
  tabSaved: ["Saved", "Αποθηκευμένα"],
  tabSettings: ["Settings", "Ρυθμίσεις"],

  statusSignIn: ["Sign in", "Σύνδεση"],
  sessionExpired: ["Your Cloudflare Access session expired.", "Η σύνδεση στο Cloudflare Access έληξε."],
  actionFailed: ["That didn't go through. Try again.", "Δεν ολοκληρώθηκε. Δοκίμασε ξανά."],

  delete: ["Delete", "Διαγραφή"],
  rename: ["Rename", "Μετονομασία"],
  cancel: ["Cancel", "Ακύρωση"],
  add: ["Add", "Προσθήκη"],
  save: ["Save", "Αποθήκευση"],
  namePlaceholder: ["Name", "Όνομα"],
  all: ["All", "Όλες"],

  forYouTitle: ["For You", "Για εσάς"],
  newTopic: ["New topic", "Νέο θέμα"],
  topicLabel: ["Topic", "Θέμα"],
  topicPlaceholder: ["Barcelona, AI, iPhone", "Μπαρτσελόνα, AI, iPhone"],
  topicExists: ["You already have this topic.", "Αυτό το θέμα υπάρχει ήδη."],
  noTopics: ["Nothing here yet", "Τίποτα ακόμα"],
  noTopicsHint: ["Pick categories or add your own topics, and the AI finds sites and articles for you.", "Διάλεξε κατηγορίες ή πρόσθεσε δικά σου θέματα και το AI θα βρει sites και άρθρα για σένα."],
  searching: ["Finding articles", "Ψάχνω άρθρα"],
  searchingHint: ["The AI is finding sites for your topics. The first articles arrive in a few minutes.", "Το AI βρίσκει sites για τα θέματά σου. Τα πρώτα άρθρα έρχονται σε λίγα λεπτά."],
  categories: ["Categories", "Κατηγορίες"],

  sourcesTitle: ["Following", "Ακολουθείτε"],
  newSource: ["New source", "Νέα πηγή"],
  sourceLabel: ["Site address", "Διεύθυνση site"],
  sourcePlaceholder: ["e.g. theverge.com", "π.χ. gazzetta.gr"],
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

  lessDone: ["You'll see fewer stories like this.", "Θα βλέπεις λιγότερα τέτοια."],

  settingsTitle: ["Settings", "Ρυθμίσεις"],
  content: ["Content", "Περιεχόμενο"],
  topics: ["Topics", "Θέματα"],
  sources: ["Following", "Ακολουθείτε"],
  deleteTopic: ["Delete topic", "Διαγραφή θέματος"],
  deleteTopicBody: ["The sites the AI found for it go too. Saved articles stay.", "Φεύγουν και τα sites που βρήκε το AI γι' αυτό. Τα αποθηκευμένα μένουν."],
  deleteSource: ["Delete source", "Διαγραφή πηγής"],
  deleteSourceBody: ["Its articles leave Following and For You. Saved ones stay.", "Τα άρθρα της φεύγουν από το «Ακολουθείτε» και το «Για εσάς». Τα αποθηκευμένα μένουν."],
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

const CATEGORIES = [
  ["Health", "Υγεία"],
  ["Fitness", "Άσκηση"],
  ["Nutrition", "Διατροφή"],
  ["Gaming", "Gaming"],
  ["Gadgets", "Gadgets"],
  ["Smartphones", "Κινητά"],
  ["AI", "AI"],
  ["Technology", "Τεχνολογία"],
  ["Science", "Επιστήμη"],
  ["Space", "Διάστημα"],
  ["Music", "Μουσική"],
  ["Movies", "Σινεμά"],
  ["TV series", "Σειρές"],
  ["Football", "Ποδόσφαιρο"],
  ["Basketball", "Μπάσκετ"],
  ["Cars", "Αυτοκίνητα"],
  ["Economy", "Οικονομία"],
  ["Travel", "Ταξίδια"]
];

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
const locale = () => (current === "el" ? "el-GR" : "en-GB");

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

export const categories = () => CATEGORIES.map((names) => names[index]);

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
