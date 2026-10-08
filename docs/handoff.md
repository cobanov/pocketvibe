# PocketVibe: devir notu (2026-10-08)

Bu dosyayı baştan sona oku, sonra "Kalan işler" listesinden devam et. Önce `docs/plan.md` ve memory'deki `pocketvibe-project.md`, `readme-style.md` dosyalarına bak.

## Proje

PocketVibe: ROCKNIX kurulu el konsollarında (ilk cihaz Anbernic RG SP) web oyunları (three.js / Wasm) çalıştıran uygulama, geliştirici kiti ve mağaza. Hedef kitle AI ile three.js oyunu yazanlar.

- Repo: `~/Developer/openboy`, GitHub `cobanov/pocketvibe` (public, main).
- `app/`: cihaz uygulaması. Bölümleri:
  - `PocketVibe.sh`: Ports betiği.
  - `pocketvibe/pocketvibed.py`: 8730 portunda yerel servis.
  - `runtime.py`: WPE'yi pivot_root ile çalıştırır, WebKit sandbox'ı çalışır.
  - `setup.sh`: ilk açılışta runtime'ı GitHub'dan indirir.
  - `launcher/`: Library, Store, Settings ekranları.
- `store/worker/`: Cloudflare Worker mağaza (cf CLI, `cloudflare.config.ts`). Yayınlamak için bu klasörde `cf deploy`.
  - D1 `pocketvibe-store` (`7833ebfe-fb8b-48b4-8fe0-ad73287dc3b1`), R2 `pocketvibe-store`. Şema: `migrations/0001_init.sql`.
  - Adres: https://pocketvibe-store.mertcobanov.workers.dev (`/catalog.json`, `/files/...`).
  - API: `POST /api/publish` (GitHub token), `GET /api/me`, `GET /api/admin/pending`, `POST /api/admin/review`. Admin `cobanov`; diğer geliştiricilerin yüklemeleri onay bekler.
- `packages/pocketvibe/cli.js`: `publish [dir]`, `status`, `pending`, `approve <id> <ver>`, `reject <id> <ver> [neden]`. Token `gh auth token` ile alınır.
- `packages/create-pocketvibe`: oyun şablonu oluşturucu. `template/`: Vite + three.js başlangıç projesi, `AGENTS.md` kuralları.
- `store/publish.mjs` ve `store/public/` eski yerel test mağazası, artık kullanılmıyor. Mac'te arka planda `python3 -m http.server 8800` çalışıyor olabilir; gerek yok.
- `tools/ui-shots.mjs`: başlatıcıyı headless Chrome'da tuşlarla gezip ekran görüntüsü alır. Kullanım: `node tools/ui-shots.mjs http://127.0.0.1:8730/ <klasör> wait:1500 key:KeyW shot:ad ...`. Tuşlar: X=A, Z=B, W=R, Q=L, A=Y.
  - Yerel servis için: `POCKETVIBE_HOME=<geçici klasör> python3 app/pocketvibe/pocketvibed.py`. Klasörde `settings.json` ve `games/` olur.

## Cihaz

- `ssh root@192.168.8.197` (anahtar kurulu). ROCKNIX next, Sway, 720×480.
- Kurulum yerleri:
  - Uygulama: `/storage/pocketvibe/app`
  - Runtime: `/storage/pocketvibe/runtime` (Debian trixie, WPE 2.48 + Cog)
  - Ports betiği: `/storage/roms/ports/PocketVibe.sh`
  - Ayarlar: `/storage/pocketvibe/settings.json`. Mağaza listesi gerçek mağazaya çevrildi.
- Mac'ten kurmak için: `sh device/install-app.sh`.
- Menüdeki gibi başlatmak için: `ssh root@192.168.8.197 'curl -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch'`.
- Log: `/tmp/pocketvibe-cog.log`. Uygulama şu an 0.4.0.
- Dikkat: SSH komut satırıyla eşleşen `pkill -f` kalıbı kendi SSH oturumunu öldürür. PID ile öldür.

## Bu oturumda bitenler (commit 25ecb12, a0def4b, push edildi)

- Cloudflare mağaza yayında. 11 oyun ve Coin Rush yayınlandı; indirme sayacı çalışıyor.
- CLI ile yükleme ve onay sırası hazır.
- Tek adımlı kurulum hazır: `setup.sh` + `config.json` `runtime` alanı. Runtime GitHub prerelease `runtime-v1`'de (147 MB).
- Güvenlik: `runtime.py` ile WebKit sandbox'ı açık.
- Uygulama her zaman Library'den açılıyor.
- İndirmede ilerleme halkası ve kutlama ekranı var: `launcher/celebrate.js`, `ready` sesi. Mac'te test edildi, cihaza kuruldu ama cihazda denenmedi.
- Python indirmelerine User-Agent eklendi; Cloudflare varsayılan Python UA'sını 403 ile reddediyordu.
- `release.sh` iki zip üretiyor: kurulum için `PocketVibe-<v>.zip`, güncelleme için `pocketvibe-app-<v>.zip`.

## Kalan işler (sırayla)

1. **İndirme animasyonunu cihazda dene.** Bir oyunu sil, mağazadan indir. Halkanın aktığını ve kutlamanın akıcı olduğunu kontrol et. Kullanıcı istedi: indirme sırasında görünür ilerleme, bitince ekranın ortasında abartısız havai fişek ve "oynamaya hazır" görseli.
2. **README'leri yeniden yaz.** İngilizce olacaklar, asla Türkçe değil. Biçim https://github.com/cobanov/herdrchat ile aynı (memory `readme-style.md`).
   - Dosyalar: `README.md` (Türkçe ve eski), `bench/README.md` (Türkçe), `docs/archive/README.md` (Türkçe), `template/README.md` ("Coming soon" kısmını `pocketvibe publish` ile doldur), `packages/pocketvibe/README.md` (CLI'ı anlat), `packages/create-pocketvibe/README.md`.
   - Ekran görüntülerini `tools/ui-shots.mjs` ile al.
   - `games/*/README.md` dosyalarına dokunma.
3. **Sıfırdan kurulumu test et.** Cihazda `runtime` klasörünü geçici olarak `runtime.bak` yap ve uygulamayı başlat. `foot` + `dialog` ile indirme, sha256 kontrolü ve açma adımlarını izle, sonra eski haline getir.
   - `PocketVibe.sh`, `/storage/debian` klasörünü `runtime`'a taşıyor. Eski kurulumlarda chroot bağlantıları açık kalmışsa bu taşıma sorun çıkarabilir; kontrol et.
4. **Cog kapanırken çöküyor.** `pkill` (SIGTERM) gelince segfault veriyor ve coredump bırakıyor (`coredumpctl list`). `quit_app` önce `runtime.py -- cogctl quit` denesin, olmazsa pkill'e düşsün.
5. **`device/run-game.sh` ve `device/play.sh`** hâlâ `debian-chroot.sh` kullanıyor; `runtime.py`'ye geçir.
6. **v0.4.0 sürümünü yayınla:** `NOTES="..." sh app/release.sh --publish`. 0.3.x cihazlar bunu OTA ile alır. Eski güncelleyici `debian-chroot.sh` dosyasını yalnızca varsa kopyalıyor, eksikliği sorun değil.
7. **npm yayını kullanıcıda**, 2FA gerekiyor. Kullanıcıya şunları çalıştırmasını söyle:
   - `! cd ~/Developer/openboy/packages/create-pocketvibe && npm publish --access public`
   - `! cd ~/Developer/openboy/packages/pocketvibe && npm publish --access public` (0.1.0, `fflate` bağımlılığı var)
8. **`docs/plan.md`'yi** mağaza ve kurulum akışına göre güncelle.

## Kurallar

- Kullanıcıyla Türkçe konuş. Hiçbir yerde uzun tire (U+2014) ve en tire kullanma.
- README'ler her zaman İngilizce ve herdrchat biçiminde.
- Promptları sohbete yazma; dosyaya yaz ve yolunu ver.
- **`games/` ve `docs/upcoming-games.md` başka bir ajanın.** Ona dokunma, commit'leme; kullanıcı önce görmek istiyor. O ajanın notu `docs/agent-update.md`.
- `~/Developer/vibeg` reposuna dokunma (oyunların web sürümleri orada).
- Cloudflare işleri için cf CLI kullan.
- Commit sonuna `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ekle.
- Değişiklik yapan her işten sonra `~/bin/daily-done "[pocketvibe] Tek cümle."` çalıştır.
- Yön değiştirmeyi önerme; kullanıcının vizyonuna sadık kal.
