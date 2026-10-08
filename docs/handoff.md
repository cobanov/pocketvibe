# PocketVibe: devir notu (2026-10-09; handheld 0.7.0, Android 0.7.0)

Önce bunu, sonra `docs/plan.md` ve `docs/development.md`'yi oku; memory'de `pocketvibe-project.md`,
`readme-style.md`, `handheld-testing.md`, `handheld-tailscale.md` var. Eski devir notları git
geçmişinde (`git log -- docs/handoff.md`).

## Durum

- **Handheld 0.7.0** (GitHub `v0.7.0`, "Latest", 2026-10-09): oyunlar ROCKNIX'te ses çalabiliyor.
  WebKit sesi gerçek bir tuşa basılmadan başlatmıyor; oyun, oyunun kendi portunda
  `POST /__pocketvibe__/unlock-audio` istiyor, pocketvibed launcher'ın sanal F13 tuşuna basıyor.
  Varsayılan beş oyun yenilendi ve mağazada: Turbo Circuit 1.3.0 (dört pist), Brick Breaker 1.2.0
  (14 bölüm), Jet Rush 1.2.0, Tower Stack 1.2.0, Road Hopper 1.2.0. Hepsinde efekt, müzik, Sound/Music
  seçenekli menüler var. Ses modülü `tools/sfx/sound.js` (oyunlarda `src/sound.js` kopyası), efektler
  `tools/sfx/games/<id>.py`, müzik ACE-Step (hope-wsl) + `make_music_loop.py`; ayrıntı
  `tools/sfx/README.md`. **Cihazda hiç denenmedi** (fps, hoparlörde ses dengesi, kilit açma).
  Mağaza dersi: PR'ları art arda birleştirince `publish.yml`'in bekleyen çalıştırmaları iptal oluyor,
  o oyunlar yayınlanmıyor; birer birer birleştir ya da `gh run rerun`.
  Headless Chrome'u her zaman `--mute-audio` ile aç (gece hoparlörden ses çaldı).
- **Handheld 0.6.9** (GitHub `v0.6.9`): 0.6.9, iki ekran kullanan bir oyunda ana ekran alttaysa
  (EmulationStation RG DS'in alt ekranında) oyunun üst ekranı kendi ilk ekranı olarak almasını sağlıyor;
  bir oyuncu bildirdi. 0.6.8'den beri: her oyun her cihazda kabukta (`play.html`)
  açılıyor; kabuk oyun ilk karelerini çizene kadar kapak, ad ve yükleme çubuğu gösteriyor.
  Turbo Circuit RG34XX'te doğrudan 58, kabukta 57 fps; kayıtlar iki yolda da aynı (denendi).
- **Android 0.7.0** (`android-v0.7.0`, latest değil, 2026-10-09): yalnızca yeni sürüm oyunları APK'da;
  Android WebView sesi tuşsuz çalıyor, kilit açma gerekmiyor.
- **Android 0.6.7** (`android-v0.6.7`): APK'da 5 hazır oyun, Ayarlar > Uygulama
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
- **Mağaza F-Droid modelinde (2026-10-09):** `github.com/cobanov/pocketvibe-store` (yerelde
  `~/Developer/pocketvibe-store`). Her oyun `games/<id>.json`: `owner` (GitHub kullanıcısı) ve
  `source` (`repo`, oyunun klasörüne dokunan son `commit`, `path`). 21 oyun ana repodaki
  `games/<klasör>`'e sabitli. `scripts/build-game.mjs` oyunu kaynaktan derleyip kontrol ediyor
  (id, sürüm mağazadakinden yüksek mi, commit değiştiyse sürüm de değişmeli, kapak, boyut, sahiplik,
  LICENSE yoksa uyarı). `check.yml` her PR'da derleyip zip'i artifact olarak ekliyor (sır yok);
  `publish.yml` main'e push'ta derleyip `scripts/publish-games.mjs` ile mağazanın
  `POST /api/ci/publish` adresine gönderiyor (repo sırrı `POCKETVIBE_STORE_TOKEN`, sunucu sırrı
  `CI_TOKEN`, Mac mini Anahtar Zinciri'nde `pocketvibe-store-ci`). Aynı sürüm "Already published".
- **CLI (npm'de):** `pocketvibe` 0.3.0: `publish` oyunun derlendiğini, kapağı, commit/push'u ve
  reponun herkese açık olduğunu denetleyip mağaza reposuna PR açar (bakımcı değilse fork'tan),
  `review <PR numarası>` PR'ın derlediği zip'i el konsoluna sunar, `serve`, `status`.
  `create-pocketvibe` 0.1.2. Eski `/api/publish` (onay bekleyen yükleme) hâlâ çalışıyor ama
  belgelerde yok. Mac mini'de npm oturumu açık (`cobanov`); yayın 2FA web onayı istiyor:
  `expect` ile sanal terminalde çalıştır, çıkan `npmjs.com/auth/cli/...` bağlantısını `open` ile aç.
- **Alan adı:** site `pocketvibe.dev` ve `www.pocketvibe.dev`'de de yayında (park kayıtları
  silindi). `pocketvibe.cobanov.dev` kalıcı: paylaşılan linkler ve uygulamanın motor indirmesi
  ona bağlı. Geçiş yavaş yavaş yapılacak.

## Sıradaki işler

Teknik işler GitHub issue'larında (#1-#20): https://github.com/cobanov/pocketvibe/issues.

1. **Android, cihaz gerekli (Retroid Pocket 3+ USB ile bağlanıyor):**
   - #20 eski WebView'de boş ekran: `MainActivity`'de WebView sürümü 94'ün altındaysa yerel bir
     ekranla Play Store'a yönlendir.
   - #18 Start + Select bazen çalışmıyor (GammaOS'ta Select başka bir tuş kodu olabilir; tuş
     eşlemesini `dumpsys input` ile oku).
   - #19 iki ekranlı Android (AYN Thor, GammaOS'lu RG DS): ilk adım ikinci ekranda Presentation
     ile kontrol kartı ve launcher detayı; iki ekranlı oyunlar (tek WebGL bağlamı) ayrı iş.
     Retroid'de Geliştirici seçenekleri > "İkincil ekranları simüle et" ile denenebilir.
   - #17: 21 oyunun 19'unda hiç ses yok; Pole Star ve Pulse Dash'in Android'de ses çaldığı
     doğrulanmalı. Starter projeye bir ses yardımcısı düşünülebilir.
2. `serve`'ü ve yeni `publish` akışını gerçek bir kullanıcı gibi baştan sona denemek (yeni bir
   oyun reposuyla).
3. İnceleme ölçütlerini kullanıcı onaylamadı (sitede, rehberde ve mağaza README'sinde).
4. Kurulum pürüzleri belgelerde: yeni ROCKNIX'te Samba kapalı; tek kartta `roms` ext4.

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

- Tweet (TR ve EN) atıldı. Reddit: r/handheldsTR ve r/SBCGaming gönderiyi kaldırdı (SBCGaming: önce
  subreddit'te katılım, sonra AI beyanıyla tekrar). Moderatör istisna vermedi: yaklaşık bir aylık
  yorum ya da gönderi geçmişi şart; 8-10 Kasım 2026 civarında AI beyanıyla tekrar atılacak.
  r/vibecoding ve r/threejs ayakta, r/ANBERNIC'e atılacak (AI yasağı yok). r/SideProject gönderisi
  Reddit'in spam filtresine takıldı (kısa sürede çok yerde aynı linkler); modmail ile onay istendi.
  Bundan sonra günde en fazla bir iki yer, aralarda yorum.
- r/linux_gaming: AI destekli projeler için 2 ay geliştirme geçmişi şartı var; Aralık'tan önce ya da
  yalnızca teknik bir yazıyla.
- Sırada (2026-10-09 ve sonrası, günde bir iki yer): r/aigamedev, r/ANBERNIC, three.js forumu (Showcase), Show HN (metinler sohbette hazırlandı), ROCKNIX ve Retro
  Handhelds Discord'ları.
- Tanıtım videosu MacBook'ta `~/workspace/pocketvibe/` (sessiz kopya `pocketvibe_promo_sessiz.mp4`).
- GitHub: açıklama ve 18 etiket ayarlandı, README ve CONTRIBUTING.md yenilendi. Reponun paylaşım
  görseli (Settings > Social preview) kullanıcı tarafından yüklenecek; dosya Mac mini'de
  `~/Desktop/pocketvibe-github-preview.png` (1280x640).
