const STRINGS = {
  tabForYou: "Για εσάς",
  tabSources: "Ακολουθείτε",
  tabSaved: "Αποθηκευμένα",
  tabSettings: "Ρυθμίσεις",

  statusSignIn: "Σύνδεση",
  sessionExpired: "Η σύνδεση στο Cloudflare Access έληξε.",
  actionFailed: "Δεν ολοκληρώθηκε. Δοκίμασε ξανά.",

  delete: "Διαγραφή",
  rename: "Μετονομασία",
  cancel: "Ακύρωση",
  add: "Προσθήκη",
  save: "Αποθήκευση",
  namePlaceholder: "Όνομα",
  all: "Όλες",
  back: "Πίσω",
  refresh: "Ανανέωση",
  loading: "Φόρτωση",
  deleteNamed: "Διαγραφή «{name}»",
  moveNamed: "Μετακίνηση «{name}»",
  moveUp: "Μετακίνηση πάνω",
  moveDown: "Μετακίνηση κάτω",

  forYouTitle: "Για εσάς",
  newTopic: "Νέο θέμα",
  topicLabel: "Θέμα",
  topicPlaceholder: "Μπαρτσελόνα, AI, iPhone",
  topicExists: "Αυτό το θέμα υπάρχει ήδη.",
  noTopics: "Τίποτα ακόμα",
  noTopicsHint: "Διάλεξε κατηγορίες ή πρόσθεσε δικά σου θέματα και το AI θα βρει sites και άρθρα για σένα.",
  searching: "Ψάχνω άρθρα",
  searchingHint: "Το AI βρίσκει sites για τα θέματά σου. Τα πρώτα άρθρα έρχονται σε λίγα λεπτά.",
  categories: "Κατηγορίες",

  sourcesTitle: "Ακολουθείτε",
  newSource: "Νέα πηγή",
  sourceLabel: "Διεύθυνση site",
  sourcePlaceholder: "π.χ. gazzetta.gr",
  sourceSearching: "Ψάχνω τα άρθρα του site…",
  sourceAdded: "Η πηγή προστέθηκε",
  noFeed: "Δεν βρέθηκε ροή άρθρων σε αυτό το site.",
  noSources: "Καμία πηγή ακόμα",
  noSourcesHint: "Πρόσθεσε τα sites που διαβάζεις και εδώ θα εμφανίζονται τα άρθρα τους.",
  noArticles: "Κανένα άρθρο ακόμα",
  noArticlesHint: "Τα νέα άρθρα εμφανίζονται εδώ μόλις βγαίνουν.",

  savedTitle: "Αποθηκευμένα",
  noSaved: "Κανένα αποθηκευμένο",
  noSavedHint: "Πάτα το σημάδι αποθήκευσης σε ένα άρθρο για να το κρατήσεις για αργότερα.",

  lessLikeThis: "Λιγότερα σαν αυτό",
  lessDone: "Θα βλέπεις λιγότερα τέτοια.",

  settingsTitle: "Ρυθμίσεις",
  content: "Περιεχόμενο",
  topics: "Θέματα",
  sources: "Ακολουθείτε",
  deleteTopic: "Διαγραφή θέματος",
  deleteTopicBody: "Φεύγουν και τα sites που βρήκε το AI γι' αυτό. Τα αποθηκευμένα μένουν.",
  deleteSource: "Διαγραφή πηγής",
  deleteSourceBody: "Τα άρθρα της φεύγουν από το «Ακολουθείτε» και το «Για εσάς». Τα αποθηκευμένα μένουν.",
  notifications: "Ειδοποιήσεις",
  importantNews: "Σημαντικές ειδήσεις",
  importantNewsNote: "Έως 3 την ημέρα, μόνο όταν πολλές από τις πηγές σου γράφουν για κάτι στα θέματά σου.",
  notificationsBlocked: "Οι ειδοποιήσεις του News είναι κλειστές στις Ρυθμίσεις του iPhone.",
  notificationsFailed: "Δεν ενεργοποιήθηκαν οι ειδοποιήσεις.",
  preferences: "Προτιμήσεις",
  theme: "Θέμα",
  themeSystem: "Προεπιλογή συστήματος",
  themeLight: "Φωτεινό",
  themeDark: "Σκούρο"
};

export const CATEGORIES = [
  "Υγεία",
  "Άσκηση",
  "Διατροφή",
  "Gaming",
  "Gadgets",
  "Κινητά",
  "AI",
  "Τεχνολογία",
  "Επιστήμη",
  "Διάστημα",
  "Μουσική",
  "Σινεμά",
  "Σειρές",
  "Ποδόσφαιρο",
  "Μπάσκετ",
  "Αυτοκίνητα",
  "Οικονομία",
  "Ταξίδια"
];

const PLURALS = {
  source: ["πηγή", "πηγές"]
};

const LOCALE = "el-GR";

const formatters = new Map();

export function formatter(Type, options = {}, locales = LOCALE) {
  const key = `${Type.name}|${locales}|${JSON.stringify(options)}`;
  let instance = formatters.get(key);
  if (!instance) formatters.set(key, (instance = new Type(locales, options)));
  return instance;
}

export function t(key, params) {
  const value = STRINGS[key];
  if (!value) return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
}

const isOne = (count) => formatter(Intl.PluralRules).select(count) === "one";

export const tn = (count, key) => `${formatter(Intl.NumberFormat).format(count)} ${PLURALS[key][isOne(count) ? 0 : 1]}`;

export function dayStart(time) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

const daysBetween = (from, to) => Math.round((dayStart(to) - dayStart(from)) / 86400000);

export function dayLabel(timestamp) {
  const days = daysBetween(timestamp, Date.now());
  if (days <= 1) {
    const text = formatter(Intl.RelativeTimeFormat, { numeric: "auto" }).format(-Math.max(days, 0), "day");
    return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
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
