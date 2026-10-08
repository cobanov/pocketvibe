# PocketVibe: devir notu (2026-10-08 gece, sürüm 0.5.0)

Bu dosyayı baştan sona oku, sonra "Kalan işler"den devam et. Önce `docs/plan.md`, `docs/development.md` ve memory'deki `pocketvibe-project.md`, `readme-style.md` dosyalarına bak.

## Durum

- **Sürüm 0.5.0 yayında:** GitHub release `v0.5.0` (`PocketVibe.zip` kurulum, `pocketvibe-app-0.5.0.zip` güncelleme). Cihaz 0.4.0'dan OTA ile 0.5.0'a güncellendi ve test edildi.
- **Site:** https://pocketvibe.cobanov.dev (`site/`, Cloudflare static assets, `cd site && npm run deploy`). Gerçek launcher bir service worker (`site/public/sw.js`) ile tarayıcıda çalışıyor; mağazadaki oyunlar `scripts/prepare.mjs` ile açılıp `public/play/` altında oynanıyor. pocketvibed'in API yanıtları değişirse `sw.js` de güncellenmeli.
- **Mağaza:** Worker güncel ve yayında (`store/worker`, `cf deploy`). 21 oyun.
- **Belgeler:** README'ler İngilizce, herdrchat düzeninde. `docs/getting-started.md` ve `docs/development.md` var.
- **Cihaz:** Anbernic RG34XX SP, `ssh root@192.168.8.197`. Tercihleri test öncesine döndürüldü (Library: Recently played, kartlar; Store: Most downloaded, kartlar).

## Bu gece yapılanlar (özet)

- Launcher hizalaması (tek 24 px kenar, ortada sekmeler, kesik satır yok), Store'da X ile yüklüleri gizleme, yeni detay ekranı.
- Sıfırdan kurulum hiç çalışmıyordu (dialog için terminfo yoktu); düzeltildi ve uygulamanın renklerine çevrildi.
- Cog kapanış çökmesi: Cog artık SIGKILL ile kapanıyor, kayıtların korunduğu test edildi.
- Denetim (iki alt ajan) ve düzeltmeler: yerel API artık `X-PocketVibe` başlığı, Origin ve Host denetimi istiyor; güncelleme açılmazsa `app.old`'a dönüş; daemon ölürse tarayıcıyı kapatan gözcü; kalıcı port kaydı (`ports.json`); dosyaların atomik yazılması; mağazada kimlik sahipliği, zip bombası, sürüm geri alma ve manifest doğrulaması; CLI'ın Windows'ta çalışması.
- Cihazda tam test: her ekran, 11 oyunun hepsi, güncelleme, yedekleme ve geri yükleme, gözcü, geri dönüş, sıfırdan kurulum.

## Güncel iş listesi (2026-10-08 akşam, en günceli bu)

Bitenler (bugün): npm paketleri; dokuz yeni oyun; cihaz sınırları raporu ve `docs/performance.md`; Tailscale; site (Android adımları, `/download/android`, demo 21 oyun); pil göstergesi; `screens` ve `android` dalları main'de; 0.6.0 ve 0.6.1 (yeni kurulum 5 oyunla) yayında; responsive altyapısı ve 20 oyunun hepsi responsive + performans geçişi, 1.1.0 olarak mağazada; template'te kısa basışlar ve CSS düzeltildi.

Sürenler:
1. Ses efektleri ve menü müziği: alt ajan ayrı worktree'de, `audio` dalı (`scratchpad/audio-brief.md`). Efektler WAV, müzik OGG (cihazda ölçüldü). Bitince birleştirme ve cihazda dinleme testi (kullanıcıyla).
2. Runtime 2: `runtime-v2` dalında, yayınlanmadı (bkz. `bench/results/2026-10-08-limits.md`, "Runtime 2 denemesi"). GPU'da 5 kat kazanç, ama kare başına 2-3 ms işlemci kaybı; Turbo Circuit daha kötü. Kare senkronu ek yükü araştırılmalı. Gamepad yok (`padkeys.py` köprüsü), sandbox kapalı. Release `runtime-v2` (pre-release) GitHub'da duruyor, main'in `config.json`'u onu kullanmıyor. Cihazda `/storage/pocketvibe/runtime-2`, `/storage/pocketvibe/profile`, `/storage/pocketvibe/app.v2dev` duruyor; cihaz gerçek 0.6.1'de.

Bekleyenler:
3. Turbo Circuit'in işlemci yükü (araba dururken çekirdeğin %81'i; gerçek yarışta 48-60 fps): oyunu profille ve hafiflet. Her iki runtime'a yarar.
4. `create-pocketvibe` 0.1.1 (template değişti; kullanıcı onayıyla).
5. Android: uygulama içi güncelleme kontrolü, kayıt yedekleme, 5 hazır oyun, yeni APK; RP3+ testi.
6. RG DS: A/B ters (cihaz açık olmalı). Runtime 1'de libmanette eşlemesiyle çözülmeli (bkz. önceki devir notu, `gamecontrollerdb`).
7. Site: iPhone Safari testi (kullanıcı).
8. Küçükler: oyunlar arası bellek birikmesi, güncellemeden sonra "Restarting..." metni, `run-game.sh` ilk istekte uygulama yeni açılmışsa beklesin (runtime-v2 dalında).
9. Eski denetim maddeleri: bekleyen yüklemeyi inceleme, yükleme kotası, sayısal GitHub kimliği, OAuth device flow, demo oyunları ayrı origin.
10. Cihaz temizliği: `/storage/pv-runtime-m25`, `/storage/pv-runtime-m26`, `/storage/pv-*.sh`, `/tmp/handheld-pad.py`, `/storage/pocketvibe/app.v2dev`; runtime 2 kararına göre `runtime-2` ve `profile`.

## Yarım kalan: cihazın sınırları (2026-10-08 öğlen)

Kullanıcı oyun optimizasyonu için yeni bir ajan başlatmadan önce cihazın gerçek sınırlarını istedi. Yapılanlar:

- `bench/limits.html` ve `bench/src/limits/` (her etkeni adım adım artıran testler), cihazda çalışan `bench/tools/collector.py`, tablolar için `bench/tools/limits-report.mjs`. Ham veriler `bench/results/limits-2026-10-08/` (hangi dosyanın geçerli olduğu `NOTES.md`'de).
- Ana bulgular (60 fps): ekranda görünen ~10k üçgen (eski 60k bütçesi yanlış; eski bench'te üçgenlerin çoğu ekran dışındaydı), ekran dışı üçgenler neredeyse bedava, ~300 draw call (ayrı materyalle ~100), büyük indexed mesh her karede üçgen başına ~0,6 µs CPU (`toNonIndexed()` ile yok), yarım çözünürlük (360×240) 20k üçgenli sahneyi 27'den 60 fps'e çıkarıyor, Standard 37 fps, her point light ~5-8 fps, gölge en ucuzu 36 fps, ilk kullanımda shader derleme 86-295 ms, canvas'tan doku yüklemek çok yavaş (1024 px 312 ms), PNG 1024 px 99 ms, oyun ~300 MB JS ya da doku belleği kullanabiliyor.
- WebKit sayfa değişiminde GPU belleğini bırakmıyor (`forceContextLoss` da yetmedi); testler bu yüzden her biri ayrı tarayıcıda koşuldu (cihazda `/storage/pv-each.sh`, `/storage/pv-one.sh`, `/storage/pv-fresh-one.sh`, `/storage/pv-limits.sh`, `/storage/pv-limits-collector.py`).

Sıradakiler:

1. Ses testi düğmeye basılarak yeniden (AudioContext basış olmadan `suspended` kaldı).
2. Mesa denemesi: runtime'ın kopyasına (`/storage/pv-runtime-m26`) trixie-backports'tan Mesa 26.1.6 kurup aynı testler. Host'ta Mesa 26.2.4 var ama glibc 2.43 istiyor, runtime'da 2.41 var; backports paketi uyumlu.
3. Uygulamada: oyundan oyuna geçince web sürecinin GPU belleği birikiyor mu (`/proc/<WPEWebProcess>/fdinfo` `drm-total-memory`).
4. Yapıldı: rapor `bench/results/2026-10-08-limits.md`; `template/AGENTS.md` yeni bütçe ve "Loading" bölümü; `template/src/handheld.js` ölçülen bütçe, `resolution: 0.5` seçeneği ve `?perflog` (PERF satırları); `device/run-game.sh <id> "&perflog"`; oyun optimizasyon ajanı için `docs/optimize-prompt.md`. Template değiştiği için `create-pocketvibe` için yeni bir npm sürümü (0.1.1) gerekiyor (kullanıcının onayıyla, `script -q /dev/null npm publish --access public --browser=false`).
5. Cihaz artık Tailscale'de: `root@100.86.26.111` (`rg34xx-sp`), her ağdan erişilebiliyor.
6. Sürücü bulgusu (`bench/results/2026-10-08-limits.md`, "Sürücü" bölümü): Mesa 25.2+ geometride 10-18 kat hızlı ama Cog 0.18/WPEBackend-fdo ile çalışmıyor. Cihazda iki test kopyası var: `/storage/pv-runtime-m25` (Mesa 25.1.7, glmark2, mesa-utils) ve `/storage/pv-runtime-m26` (Mesa 26.1.6, fdo 1.16.1, Cog 0.18.5, forky kaynağı). `/storage/pv-swap.sh <dizin>` bir kopyayı uygulamanın altına koyar, `/storage/pv-swap.sh back` geri alır. Runtime-v2 kararı kullanıcıda.
7. Geliştiriciler için rehber: `docs/performance.md` (README, template README ve getting-started bağlantı veriyor). `create-pocketvibe` 0.1.1 yayını bekliyor (template değişti).

## Kalan işler (sırayla)

1. **Yeni oyunlar yayında:** maze-chase, tank-brigade, tower-stack, pulse-dash, cloud-climber, snow-slalom, mini-golf, tile-merge, crate-pusher 1.0.0 olarak mağazada (2026-10-08), site de onlarla yeniden yayınlandı. Commit'lemek oyun ajanının işi (`games/`, `docs/upcoming-games.md`). Cihazda henüz denenmediler.
2. **npm paketleri yayında:** `create-pocketvibe` ve `pocketvibe` 0.1.0 (2026-10-08). npm hesabında 2FA güvenlik anahtarıyla açık. Yeni sürüm için `script -q /dev/null npm publish --access public --browser=false` arka planda çalıştırılıp çıkan `npmjs.com/auth/cli/...` bağlantısı kullanıcıya verilir; onaydan sonra birkaç dakika ikinci yayın onay istemez.
3. **Oyunların FPS'i:** Turbo Circuit (başlangıç çizgisi, 26.8k üçgen) ve Star Defender cihazda 48 fps, Sky Hopper 56 fps. Oyun ajanına iletilmeli.
4. **Denetimden kalanlar (bilerek ertelendi):**
   - Mağaza: yönetici bekleyen bir yüklemenin zip'ini ve kapağını göremiyor (`pocketvibe review <id> <sürüm>` gibi bir komut gerekli); yükleme kotası ve hız sınırı yok; kimlikler GitHub kullanıcı adına bağlı (sayısal `user.id` olmalı); CLI geniş yetkili `gh` jetonunu gönderiyor (PocketVibe'a özel bir OAuth uygulaması ve device flow daha güvenli).
   - Site: demo oyunları sitenin kendi origin'inde çalışıyor; kötü niyetli ama onaylanmış bir oyun sayfayı değiştirebilir. Oyunlar ayrı bir origin'den sunulmalı.
   - Uygulama: runtime güncelleme yolu yok (`config.json` `runtime.version` okunmuyor) ve oyun kayıtları runtime klasörünün içinde. Runtime değişirse kayıtlar taşınmalı.
   - Runtime arşivini yeniden üreten bir betik yok (`docs/development.md`, "The runtime").
5. **Küçük cila:** güncelleme indikten sonra uygulama yeniden başlayana kadar Settings satırında birkaç saniye yine "0.5.0 available" yazıyor; "Restarting..." gibi bir metin gösterilmeli (`launcher.js` `updateValue`).

## Cihazda çalışma

- Kurulum yerleri: uygulama `/storage/pocketvibe/app` (önceki sürüm `app.old`), runtime `/storage/pocketvibe/runtime`, Ports betiği `/storage/roms/ports/PocketVibe.sh`. Günlükler `/tmp/pocketvibed.log`, `/tmp/pocketvibe-cog.log`.
- Mac'ten kurmak için `sh device/install-app.sh`. Menüdeki gibi başlatmak için `curl -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch`. `install-app.sh`'in istediği oyun listesi yenilemesi bitmeden gelen başlatma isteğini ES yok sayıyor; birkaç saniye bekle.
- Yerel API'yi elle çağırırken `-H 'X-PocketVibe: 1'` gerekli.
- Dokunmadan test için `tools/handheld-pad.py` ve `tools/handheld-run.sh` var (`docs/development.md`). Yeni bir sayfada ilk basış 200-300 ms tutulmalı.
- Dikkat: SSH komut satırıyla eşleşen `pkill -f` kalıbı kendi oturumunu öldürür. PID kullan ya da kalıbı `serve[r]` gibi yaz. Arka plana atılan bir işlemde `</dev/null` kullan, yoksa SSH kapanmaz.

## Kurallar

- Kullanıcıyla Türkçe konuş. Hiçbir yerde uzun tire (U+2014) ve en tire kullanma.
- README'ler her zaman İngilizce ve herdrchat biçiminde.
- Promptları sohbete yazma; dosyaya yaz ve yolunu ver.
- `games/` ve `docs/upcoming-games.md` oyun ajanının; dokunma.
- `~/Developer/vibeg` reposuna dokunma.
- Cloudflare işleri için cf CLI (`cf deploy`).
- Commit sonuna `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ekle.
- Değişiklik yapan her işten sonra `~/bin/daily-done "[pocketvibe] Tek cümle."` çalıştır.
- Yön değiştirmeyi önerme; kullanıcının vizyonuna sadık kal.
