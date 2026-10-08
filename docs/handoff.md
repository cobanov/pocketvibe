# PocketVibe: devir notu (2026-10-08 gece; handheld 0.6.8, Android 0.6.7)

Önce bunu, sonra `docs/plan.md` ve `docs/development.md`'yi oku; memory'de `pocketvibe-project.md`,
`readme-style.md`, `handheld-testing.md`, `handheld-tailscale.md` var. Eski devir notları git
geçmişinde (`git log -- docs/handoff.md`).

## Durum

- **Handheld 0.6.8** (GitHub `v0.6.8`, "Latest"): her oyun her cihazda kabukta (`play.html`)
  açılıyor; kabuk oyun ilk karelerini çizene kadar kapak, ad ve yükleme çubuğu gösteriyor.
  Turbo Circuit RG34XX'te doğrudan 58, kabukta 57 fps; kayıtlar iki yolda da aynı (denendi).
- **Android 0.6.7** (`android-v0.6.7`, latest değil): APK'da 5 hazır oyun, Ayarlar > Uygulama
  güncellemesi (GitHub'da en yeni `android-v*`, SHA-256 denetimi, `UpdateProvider` ile Android
  kurucusu), oyun WebView'i düşürünce çökme notu. Kullanıcı RG Rotate'te denedi, sorunsuz.
  Sürüm numarası handheld'le ortak (`app/pocketvibe/config.json`); Android yalnızca `android-v*`
  sürümlerine bakar. Kayıt yedeği Android'de yok.
- **Site** (pocketvibe.cobanov.dev): hero'da logolu Linux/Android indirmeleri (sürüm ve boyut
  `public/releases.json`'dan, `prepare.mjs` yazıyor), "What you need" tablosu, platform başına
  kurulum kartı, `/make/` sayfası (adımlar, ölçülen bütçe, inceleme ölçütleri) ve ajanlara
  verilen `/agents.md` (kaynağı `site/public/agents.md`, `_headers` ile `text/plain`).
- **Mağaza:** Coin Rush kaldırıldı (D1 `games` satırı silindi, sürümü "removed from the store"
  notuyla `rejected`, R2 dosyaları silindi). Yeni `GET /api/admin/files/<key>`: yönetici bekleyen
  yüklemenin zip ve kapağını alabiliyor.
- **CLI ve starter (npm'de yayında):** `pocketvibe` 0.2.0 (`serve`: oyunu bilgisayarda küçük bir
  mağaza olarak sunar, handheld'de Ayarlar > Stores > Add a store; oyun `<id>-dev`, "(dev)" adıyla
  ayrı kayıtlarla kurulur, her değişiklik güncelleme olur. `review <id> <sürüm>`: bekleyen yüklemeyi
  aynı yolla yöneticinin cihazına getirir) ve `create-pocketvibe` 0.1.1 (yeni kurallar, rehber).
  npm'den sıfırdan denendi. Mac mini'de npm oturumu açık (`cobanov`); yayın iki adımlı doğrulama
  için web onayı istiyor: komutu `expect` ile sanal terminalde çalıştır, çıkan
  `npmjs.com/auth/cli/...` bağlantısını kullanıcıya aç (`open <url>`).

## Sıradaki işler

1. `serve`'i gerçek bir handheld'de denemek (Ayarlar > Stores > Add a store, Mac mini'nin
   Tailscale adresi `http://100.70.248.21:8740`).
2. İnceleme ölçütlerini (`/make/#review`, `agents.md` 7. bölüm) kullanıcı onaylamadı; ben yazdım.
3. Çökmenin asıl sebebi (WPEWebProcess SIGTRAP, coredump yok) bilinmiyor; launcher her
   yüklemede müziği yeniden çözüyor (~38 MB).
4. SP'deki eski kayıtlar ve oyun listesi `/storage/pv-backup-20261008`'de; kullanıcı isterse geri
   yüklenecek.
5. Starter projenin örnek oyunu hâlâ Coin Rush (yalnızca mağaza ve siteden kaldırıldı).
6. Kurulum pürüzleri (belgelere yazıldı): yeni ROCKNIX'te Samba kapalı geliyor; tek kartta `roms`
   ext4, Mac ve Windows açamıyor.

## Cihazlar

- `hh-rgsp` 100.86.26.111: RG34XX SP, kullanıcının asıl cihazı, 0.6.8.
- `hh-rg34xx` 100.84.65.82: yeni RG34XX (2026-10-08), sıfırdan kurulum testi yapıldı, geliştirme
  sürümü kurulu. Samba açık, `tailscale.up=1`, ES menü müziği kapalı (`es_settings.cfg`'de
  `audio.bgmusic` false; `system.cfg`'deki ayar ES'yi etkilemiyor). `roms/music`'te kullanıcının
  albümleri var.
- `hh-rgds` 100.94.150.106: RG DS (iki ekran), 0.6.3'te kalmıştı.
- `rg-rotate` 100.109.154.66: Android, ADB yok; APK'yı Taildrop gönderir:
  `/Applications/Tailscale.app/Contents/MacOS/Tailscale file cp <apk> rg-rotate:`.
- ROCKNIX adları `tailscale set --hostname` ile verildi (ROCKNIX `tailscale up` çalıştırmaz).

## Cihazda çalışma

- Yerler: uygulama `/storage/pocketvibe/app`, runtime `/storage/pocketvibe/runtime`, Ports betiği
  `/storage/roms/ports/PocketVibe.sh`; günlükler `/tmp/pocketvibed.log`, `/tmp/pocketvibe-cog.log`.
- Mac'ten kurmak: `HANDHELD=root@<ip> sh device/install-app.sh`. Ardından başlatma isteği ES oyun
  listesini yenilerken yok sayılır; birkaç saniye bekle:
  `curl -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch`.
- Yerel API'yi elle çağırırken `-H 'X-PocketVibe: 1'`. Oyun açmak: `device/run-game.sh <id>`;
  kabuk adresine `&perflog` eklenince oyuna geçer (PERF satırları cog günlüğünde).
- Ekran görüntüsü: `grim` (`XDG_RUNTIME_DIR=/var/run/0-runtime-dir`, `WAYLAND_DISPLAY=wayland-1`).
- Kullanıcı cihazı elindeyken sanal tuş gönderme (`handheld-testing.md`).
- `pkill -f` kalıbı SSH komutunu da eşler; PID kullan ya da `serve[r]` gibi yaz.

## Kurallar

- Kullanıcıyla Türkçe konuş. Hiçbir yerde uzun tire (U+2014) ve en tire kullanma.
- README'ler İngilizce ve herdrchat biçiminde.
- Promptları sohbete yazma; dosyaya yaz ve yolunu ver.
- `games/` ve `docs/upcoming-games.md` oyun ajanının; dokunma. `~/Developer/vibeg`'e dokunma.
- Cloudflare için cf CLI (`cf deploy`, `cf d1 query`, `cf r2 objects delete`).
- Commit sonuna `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Değişiklik yapan her işten sonra `~/bin/daily-done "[pocketvibe] Tek cümle."`.
- Yön değiştirmeyi önerme; kullanıcının vizyonuna sadık kal.

## Tanıtım (2026-10-08)

Tweet (TR ve EN), Reddit (r/handheldsTR, r/SBCGaming, r/vibecoding) atıldı. r/SBCGaming ve
r/handheldsTR gönderiyi kaldırdı (SBCGaming: AI içeriği kuralı, AI beyanı şart); kullanıcı
moderatörlere yazdı. Tanıtım videosu MacBook'ta `~/workspace/pocketvibe/` (sessiz kopya
`pocketvibe_promo_sessiz.mp4`).
