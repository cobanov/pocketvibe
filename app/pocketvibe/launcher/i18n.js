// Launcher strings. Add a language by adding a column to every entry and its
// name to LANGUAGES. Missing strings fall back to English.

export const LANGUAGES = { en: 'English', tr: 'Türkçe' };

const STRINGS = {
  library: { en: 'Library', tr: 'Kütüphane' },
  store: { en: 'Store', tr: 'Mağaza' },
  settings: { en: 'Settings', tr: 'Ayarlar' },

  play: { en: 'Play', tr: 'Oyna' },
  open: { en: 'Open', tr: 'Aç' },
  info: { en: 'Info', tr: 'Bilgi' },
  remove: { en: 'Remove', tr: 'Sil' },
  hideInstalled: { en: 'Hide installed', tr: 'Yüklüleri gizle' },
  showInstalled: { en: 'Show installed', tr: 'Yüklüleri göster' },
  quit: { en: 'Quit', tr: 'Çık' },
  back: { en: 'Back', tr: 'Geri' },
  yes: { en: 'Yes', tr: 'Evet' },
  no: { en: 'No', tr: 'Hayır' },
  list: { en: 'List', tr: 'Liste' },
  cards: { en: 'Cards', tr: 'Kartlar' },
  download: { en: 'Download', tr: 'İndir' },
  update: { en: 'Update', tr: 'Güncelle' },
  select: { en: 'Select', tr: 'Seç' },
  change: { en: 'Change', tr: 'Değiştir' },

  installed: { en: 'Installed', tr: 'Yüklü' },
  updateAvailable: { en: 'Update available', tr: 'Güncelleme var' },
  failed: { en: 'Failed', tr: 'Başarısız' },
  downloading: { en: 'Downloading', tr: 'İndiriliyor' },
  installing: { en: 'Installing', tr: 'Kuruluyor' },
  get: { en: 'Get', tr: 'Al' },

  noGames: { en: 'No games yet.<br>Press R to open the Store.', tr: 'Henüz oyun yok.<br>Mağazayı açmak için R tuşuna bas.' },
  loadingStore: { en: 'Loading the store...', tr: 'Mağaza yükleniyor...' },
  storeEmpty: { en: 'The store is empty.', tr: 'Mağaza boş.' },
  allInstalled: { en: 'You have every game in the store.<br>Press X to show them.', tr: 'Mağazadaki bütün oyunlar yüklü.<br>Göstermek için X tuşuna bas.' },
  storeOffline: { en: 'Cannot reach the store.<br>Check the Wi-Fi connection.', tr: 'Mağazaya ulaşılamıyor.<br>Wi-Fi bağlantısını kontrol et.' },
  noWifi: { en: 'No Wi-Fi', tr: 'Wi-Fi yok' },

  quitConfirm: { en: 'Quit PocketVibe?', tr: "PocketVibe'dan çıkılsın mı?" },
  removeConfirm: { en: 'Remove {title}?', tr: '{title} silinsin mi?' },
  readyToPlay: { en: '{title} is ready to play.', tr: '{title} oynamaya hazır.' },
  readyHeading: { en: 'Ready to play', tr: 'Oynamaya hazır' },
  updatedHeading: { en: 'Updated', tr: 'Güncellendi' },
  playNow: { en: 'Play now', tr: 'Hemen oyna' },
  later: { en: 'Later', tr: 'Sonra' },
  downloadFailed: { en: 'Download failed: {error}', tr: 'İndirme başarısız: {error}' },
  cannotStart: { en: 'Cannot start: {error}', tr: 'Başlatılamadı: {error}' },
  cannotDownload: { en: 'Cannot download: {error}', tr: 'İndirilemedi: {error}' },

  recent: { en: 'Recently played', tr: 'Son oynanan' },
  latest: { en: 'Latest', tr: 'En yeni' },
  popular: { en: 'Most downloaded', tr: 'En çok indirilen' },
  az: { en: 'A to Z', tr: 'A-Z' },
  categories: { en: 'Categories', tr: 'Kategoriler' },

  Arcade: { en: 'Arcade', tr: 'Arcade' },
  Shooter: { en: 'Shooter', tr: 'Nişancı' },
  Racing: { en: 'Racing', tr: 'Yarış' },
  Puzzle: { en: 'Puzzle', tr: 'Bulmaca' },
  Platformer: { en: 'Platformer', tr: 'Platform' },
  Sports: { en: 'Sports', tr: 'Spor' },
  Other: { en: 'Other', tr: 'Diğer' },

  // Settings
  sound: { en: 'Sound', tr: 'Ses' },
  backgroundMusic: { en: 'Background music', tr: 'Arka plan müziği' },
  musicVolume: { en: 'Music volume', tr: 'Müzik sesi' },
  soundEffects: { en: 'Sound effects', tr: 'Ses efektleri' },
  effectsVolume: { en: 'Effects volume', tr: 'Efekt sesi' },
  on: { en: 'On', tr: 'Açık' },
  off: { en: 'Off', tr: 'Kapalı' },
  stores: { en: 'Stores', tr: 'Mağazalar' },
  addStore: { en: 'Add a store', tr: 'Mağaza ekle' },
  storeGames: { en: '{count} games', tr: '{count} oyun' },
  storeOfflineShort: { en: 'offline', tr: 'çevrimdışı' },
  removeStoreConfirm: { en: 'Remove this store?', tr: 'Bu mağaza silinsin mi?' },
  storeAdded: { en: 'Store added.', tr: 'Mağaza eklendi.' },
  badUrl: { en: 'The address must start with http:// or https://', tr: 'Adres http:// ya da https:// ile başlamalı' },
  language: { en: 'Language', tr: 'Dil' },
  general: { en: 'General', tr: 'Genel' },
  saveData: { en: 'Save data', tr: 'Kayıtlar' },
  backupSaves: { en: 'Back up all saves', tr: 'Tüm kayıtları yedekle' },
  restoreSaves: { en: 'Restore from a backup', tr: 'Yedekten geri yükle' },
  noBackups: { en: 'No backups yet', tr: 'Henüz yedek yok' },
  backupDone: { en: 'Saves backed up to {name}', tr: 'Kayıtlar yedeklendi: {name}' },
  restoreConfirm: { en: 'Restore {name}? Current saves are replaced.', tr: '{name} geri yüklensin mi? Şu anki kayıtların yerine geçer.' },
  restored: { en: 'Saves restored.', tr: 'Kayıtlar geri yüklendi.' },
  restoreFailed: { en: 'Restore failed: {error}', tr: 'Geri yükleme başarısız: {error}' },
  backupsWhere: { en: 'Backups are kept in /storage/pocketvibe/backups', tr: 'Yedekler /storage/pocketvibe/backups klasöründe' },
  developer: { en: 'Developer', tr: 'Geliştirici' },
  showFps: { en: 'Show FPS in games', tr: 'Oyunlarda FPS göster' },
  device: { en: 'Device', tr: 'Cihaz' },
  storage: { en: 'Storage', tr: 'Depolama' },
  storageValue: { en: 'Games {games} · {free} free', tr: 'Oyunlar {games} · {free} boş' },
  ipAddress: { en: 'IP address', tr: 'IP adresi' },
  gpuDriver: { en: 'GPU driver', tr: 'GPU sürücüsü' },
  gpuSlow: { en: 'libmali: games run slowly', tr: 'libmali: oyunlar yavaş çalışır' },
  webviewOld: {
    en: 'Games need a newer Android System WebView (94 or later). Update it from the Play Store.',
    tr: "Oyunlar daha yeni bir Android System WebView istiyor (94 ya da sonrası). Play Store'dan güncelle.",
  },
  gpuToast: {
    en: 'Games run slowly with the libmali GPU driver. Choose Panfrost in the ROCKNIX system settings and restart.',
    tr: "libmali GPU sürücüsüyle oyunlar yavaş çalışır. ROCKNIX sistem ayarlarından Panfrost'u seçip yeniden başlat.",
  },
  about: { en: 'About', tr: 'Hakkında' },
  version: { en: 'Version', tr: 'Sürüm' },
  madeBy: { en: 'Made by', tr: 'Yapan' },
  appUpdate: { en: 'App update', tr: 'Uygulama güncellemesi' },
  upToDate: { en: 'Up to date', tr: 'Güncel' },
  versionAvailable: { en: '{version} available', tr: '{version} çıktı' },
  updateCheckFailed: { en: 'Could not check', tr: 'Kontrol edilemedi' },
  check: { en: 'Check', tr: 'Kontrol et' },
  updateAvailableToast: { en: 'PocketVibe {version} is available. Update it in Settings.', tr: "PocketVibe {version} çıktı. Ayarlar'dan güncelleyebilirsin." },
  updateConfirm: { en: 'Update to {version}? PocketVibe restarts.', tr: '{version} sürümüne güncellensin mi? PocketVibe yeniden başlar.' },
  updatedTo: { en: 'PocketVibe is now {version}.', tr: 'PocketVibe artık {version}.' },
  updateFailed: { en: 'Update failed: {error}', tr: 'Güncelleme başarısız: {error}' },

  // On-screen keyboard
  storeAddress: { en: 'Store address', tr: 'Mağaza adresi' },
  type: { en: 'Type', tr: 'Yaz' },
  delete: { en: 'Delete', tr: 'Sil' },
  done: { en: 'Done', tr: 'Tamam' },
  cancel: { en: 'Cancel', tr: 'Vazgeç' },

  // Game shell, on the second screen
  controls: { en: 'Controls', tr: 'Kontroller' },
  holdToLeave: { en: 'Hold to go back to PocketVibe', tr: "PocketVibe'a dönmek için basılı tut" },
};

let language = 'en';

export function setLanguage(code) {
  language = LANGUAGES[code] ? code : 'en';
  document.documentElement.lang = language;
}

export function getLanguage() {
  return language;
}

// t('removeConfirm', { title: 'Snake' }) -> "Remove Snake?"
export function t(key, values = {}) {
  const entry = STRINGS[key];
  const text = entry ? (entry[language] ?? entry.en) : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}
