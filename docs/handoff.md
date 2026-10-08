# PocketVibe: devir notu (2026-10-08 gece, sürüm 0.5.0)

Bu dosyayı baştan sona oku, sonra "Kalan işler"den devam et. Önce `docs/plan.md`, `docs/development.md` ve memory'deki `pocketvibe-project.md`, `readme-style.md` dosyalarına bak.

## Durum

- **Sürüm 0.5.0 yayında:** GitHub release `v0.5.0` (`PocketVibe.zip` kurulum, `pocketvibe-app-0.5.0.zip` güncelleme). Cihaz 0.4.0'dan OTA ile 0.5.0'a güncellendi ve test edildi.
- **Site:** https://pocketvibe.cobanov.dev (`site/`, Cloudflare static assets, `cd site && npm run deploy`). Gerçek launcher bir service worker (`site/public/sw.js`) ile tarayıcıda çalışıyor; mağazadaki oyunlar `scripts/prepare.mjs` ile açılıp `public/play/` altında oynanıyor. pocketvibed'in API yanıtları değişirse `sw.js` de güncellenmeli.
- **Mağaza:** Worker güncel ve yayında (`store/worker`, `cf deploy`). 12 oyun.
- **Belgeler:** README'ler İngilizce, herdrchat düzeninde. `docs/getting-started.md` ve `docs/development.md` var.
- **Cihaz:** Anbernic RG34XX SP, `ssh root@192.168.8.197`. Tercihleri test öncesine döndürüldü (Library: Recently played, kartlar; Store: Most downloaded, kartlar).

## Bu gece yapılanlar (özet)

- Launcher hizalaması (tek 24 px kenar, ortada sekmeler, kesik satır yok), Store'da X ile yüklüleri gizleme, yeni detay ekranı.
- Sıfırdan kurulum hiç çalışmıyordu (dialog için terminfo yoktu); düzeltildi ve uygulamanın renklerine çevrildi.
- Cog kapanış çökmesi: Cog artık SIGKILL ile kapanıyor, kayıtların korunduğu test edildi.
- Denetim (iki alt ajan) ve düzeltmeler: yerel API artık `X-PocketVibe` başlığı, Origin ve Host denetimi istiyor; güncelleme açılmazsa `app.old`'a dönüş; daemon ölürse tarayıcıyı kapatan gözcü; kalıcı port kaydı (`ports.json`); dosyaların atomik yazılması; mağazada kimlik sahipliği, zip bombası, sürüm geri alma ve manifest doğrulaması; CLI'ın Windows'ta çalışması.
- Cihazda tam test: her ekran, 11 oyunun hepsi, güncelleme, yedekleme ve geri yükleme, gözcü, geri dönüş, sıfırdan kurulum.

## Kalan işler (sırayla)

1. **Yeni oyunlar:** Oyun ajanı (`openboy-9a` oturumu) dokuz yeni oyun yapıyor: maze-chase, tank-brigade, tower-stack, pulse-dash, cloud-climber, snow-slalom, mini-golf, tile-merge, crate-pusher. Kullanıcı onları görmeden commit etmiyor; kullanıcı baktıktan sonra commit edip haber verecek. O zaman:
   - Her biri için `node packages/pocketvibe/cli.js publish games/<klasör>`. Sürümler 1.0.0, kimlikler mağazada boş.
   - Sonra `cd site && npm run deploy`, böylece demo da onları içerir.
   - `games/` ve `docs/upcoming-games.md` o ajanın. Dokunma.
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
