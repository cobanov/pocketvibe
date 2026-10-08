# PocketVibe: devir notu (2026-10-08 akşam, sürüm 0.6.6)

Bu dosyayı baştan sona oku, sonra "Sıradaki işler"den devam et. Önce `docs/plan.md`, `docs/development.md` ve memory'deki `pocketvibe-project.md`, `readme-style.md`, `handheld-testing.md`, `handheld-tailscale.md` dosyalarına bak. Aşağıdaki eski bölümler tarih için duruyor; çelişirse bu bölüm geçerli.

## Durum (en günceli bu)

- **Sürüm 0.6.6 yayında** (GitHub `v0.6.6`). Kullanıcı bu akşam insanlarla paylaşacak. SP (RG34XX SP) 0.6.6'da, OTA ile güncellendi; RG DS 0.6.3'te kaldı.
- **Kurulum (0.6.4 ve 0.6.5):** `setup.sh` boş alanı (indirme + açılmış ~690 MB) ve interneti baştan denetliyor; indirme kaldığı yerden devam ediyor (Range), 5 deneme; önce `pocketvibe.cobanov.dev/download/runtime-1`, olmazsa doğrudan GitHub. İndirme ekranı MB, hız ve kalan süre; açma adımı ayrı ilerleme çubuğuyla (tar'a python besliyor, başarıyı `.unpacked` işareti söylüyor). SP'de sıfırdan kurulum ölçüldü: zip 5 MB, Ports'tan launcher'a 100 s, 5 hazır oyun ve karşılama mesajı.
- **İndirme adresleri:** `site/scripts/prepare.mjs` `_redirects` yazıyor: `/download/rocknix` (en son `PocketVibe.zip`), `/download/runtime-1`, `/download/android` (en yeni `android-v*` APK). Her şey GitHub Releases'ta; mağaza oyunları R2'de.
- **libmali:** GPU sürücüsü libmali ise launcher bir kez Panfrost'a geçmeyi soruyor (`POST /api/gpu/panfrost`, `set_setting gpu.driver panfrost` ve yeniden başlatma); Settings'te satırı var.
- **Çökme (0.6.6):** 16:31'de launcher'da WPEWebProcess SIGTRAP ile düştü (OOM yok, cgroup sınırı yok, coredump yok; sebep kesin değil). İki önlem: (1) `pocketvibed.watch_browser` Cog günlüğünde `> Crash!: ` görünce Cog'u kapatıyor, `PocketVibe.sh` onu launcher'da yeniden açıyor, launcher `crashed`/`crashed:game` notunu gösteriyor (cihazda `kill -TRAP` ile denendi, ~5 s). (2) `go_home` sayfa süreci 250 MB'ı geçtiyse ya da boş bellek 160 MB'ın altındaysa Cog'u yeniden başlatıyor (`browser_worn`); normal dönüş ~1 s, yeniden başlatmalı ~4 s (3,5 s siyah ekran). Ölçüm: oyun-launcher gidiş-dönüşlerinde sayfa süreci 95 MB'tan 250-360 MB'a çıkıp orada dolaşıyor, boş bellek 100-150 MB'a iniyor; 20 tur boyunca çökme tekrar etmedi.
- **İki ekran:** Turbo Circuit 1.2.0 mağazada (RG DS'de üstte yarış, altta harita ve sıralama).
- **Belgeler:** README, `docs/getting-started.md` ve site kurulum metni güncel boyut ve sürelerle (5 MB zip, ~150 MB indirme, ~1 GB boş alan, ~1,5 dk).
- **Cihazlar:** SP `root@100.86.26.111` (Tailscale), RG DS `root@100.94.150.106`. SP'de kullanıcının eski kayıtları ve 17 oyunluk listesi `/storage/pv-backup-20261008`'de (sıfırdan kurulum testinden önce alındı; kullanıcı isterse geri yüklenecek: `saves/runtime1-storage` -> `runtime/root/.local/share/wpe/storage`, `games.txt`'teki oyunlar mağazadan).

## Sıradaki işler

1. SP'de yedeği geri yüklemek (kullanıcı isterse).
2. Çökmenin asıl sebebi: coredump kaydedilmiyor (`systemd-coredump` "without generating a coredump"); Debian dbgsym ile sembollü yığın almak gerekir. Launcher her yüklemede müziği yeniden çözüyor (~38 MB); bunu küçültmek sayfa belleğini düşürür.
3. Güncelleme denetimi 6 saatte bir (`UPDATE_CHECK_EVERY`); bugün kuranlar 0.6.6'yı Settings'te elle denetleyince görür.
4. Turbo Circuit'in işlemci yükü; `create-pocketvibe` 0.1.1 (kullanıcı onayıyla); Android işleri (güncelleme denetimi, kayıt yedeği, 5 hazır oyun, yeni APK); runtime-v2 ek yükü; iPhone Safari site testi (kullanıcı).
5. Launcher ilk açılışta birkaç saniye boş üst çubukla görünüyor (sekme adları ve içerik sonra geliyor); küçük cila.
6. Cihaz temizliği yapıldı (SP'de `pv-runtime-m25/m26`, `pv-*.sh`, test araçları silindi; `runtime-2`, `profile`, `app.v2dev` de sıfırdan kurulumla gitti).

## Eski: cihazın sınırları (2026-10-08 öğlen)

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

## Eski: kalan işler (2026-10-08 gece)

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
