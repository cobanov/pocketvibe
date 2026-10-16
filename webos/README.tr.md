# LG webOS TV için PocketVibe

[PocketVibe](https://github.com/cobanov/pocketvibe) (launcher, oyun mağazası ve three.js oyunları) uygulamasının **LG webOS TV** portu.
Magic Remote ile ya da USB/Bluetooth kumandayla oynanır.

> Bu, `cobanov/pocketvibe` fork'u içinde bir topluluk portudur; resmî bir sürüm değildir. Launcher ve oyunlar upstream'inkilerdir,
> bu klasör yalnızca TV için gerekenleri ekler. Depodaki diğer platformlara dokunulmamıştır. English: [README.md](README.md).

## Neler var

- Gerçek PocketVibe launcher'ı ve mağazası (`app/pocketvibe/` klasöründen alınır; upstream'i merge edince yenilikler gelir), TV'de 1080p.
- Oyunlar TV'nin kendi web motorunda (Chromium + WebGL2) çalışır: Debian/WPE ortamı yok, ilk açılışta açılacak paket yok.
- **Magic Remote:** yön tuşları, OK, Geri, renkli tuşlar ve işaretçi (üzerine gelme, tıklama, kaydırma).
- **USB / Bluetooth kumanda:** TV'nin tarayıcıya gösterdiği her kumanda, PocketVibe'ın beklediği düzende; tanınmayanlar için ayar sayfası.
- **Mağaza oyunları çalışır:** mağazadaki oyunlar TV'nin anlamadığı yeni JavaScript kullanır; uygulama bunları kurulumda bir kez dönüştürür.

## Gereksinimler

| | |
|---|---|
| TV | **Chromium 68+ ve WebGL2** olan LG webOS TV (webOS 5 / 2020 modelleri ve sonrası). webOS 4.x (Chromium 53) bu oyunları çalıştıramaz. |
| TV ayarı | [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) açık, TV bilgisayardan erişilebilir |
| Bilgisayar | Node.js + npm, Python 3 (derlemek için); `ares-install` ([`@webos-tools/cli`](https://www.npmjs.com/package/@webos-tools/cli)), derleme bunu kurar |
| Ağ | Mağaza için TV'nin internete ihtiyacı var |

**Denendiği cihaz:** Chromium 68 web motorlu, root erişimi olan bir LG TV (ARMv7, Mali GPU, yaklaşık 1,1 GB RAM). Diğer modeller ve
root'suz TV'ler denenmedi: uygulama küçük bir Node.js servisi çalıştırır ve yerel bir yardımcı ikiliyi açar; Developer Mode bunlara
her modelde izin vermeyebilir. Geri bildirim memnuniyetle karşılanır.

## Kurulum (hazır .ipk)

1. Bu fork'un **Releases** sayfasından `com.pocketvibe.app_<sürüm>_all.ipk` dosyasını indir.
2. TV'yi bir kez tanıt (adı `tv` olsun; parola Developer Mode uygulamasında görünür):

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device --add tv --info "{'host':'<tv-ip>','port':'9922','username':'prisoner'}"
   ares-novacom --device tv --getkey
   ```
3. Kur ve başlat:

   ```sh
   ares-install --device tv com.pocketvibe.app_<sürüm>_all.ipk
   ares-launch  --device tv com.pocketvibe.app
   ```

   Güncelleme: yeni `.ipk`'yı eskisinin üstüne kur; olmazsa önce `ares-install --device tv --remove com.pocketvibe.app`.
   Oyunların ve ayarların TV'de `/media/developer/pocketvibe` içinde durur, yeniden kurulumda silinmez.

İlk açılışta kısa bir tanı ekranı çıkar (Chromium sürümü, WebGL2...), sonra launcher iki oyunla açılır. Gerisi için **Store** sekmesine bak.

## Kendin derle

```sh
./webos/build.sh                      # -> webos/dist/com.pocketvibe.app_<sürüm>_all.ipk
./webos/build.sh --games jet-rush     # başka mağaza oyunlarını pakete koy (virgülle)
./webos/build.sh --games-dir KLASÖR   # oyunları indirmek yerine KLASÖR'deki <id>.zip'lerden al
```

`.ipk` sürümü `app/pocketvibe/config.json` içindeki sürümdür. `webos-v0.7.4` gibi bir etiket atınca
`.github/workflows/webos-build.yml` aynı dosyayı derleyip release'e ekler.

## Kumanda

Ayrıntı: [docs/CONTROLS.md](docs/CONTROLS.md). Özet:

| Kumanda | Görevi |
|---|---|
| Yön tuşları, OK | hareket, A |
| Geri | B (0,5 sn basılı tut: launcher'a dön) |
| Kırmızı / Yeşil | X / Y |
| Sarı / Mavi, Geri sar / İleri sar | L / R |
| Oynat-Duraklat, Stop | START, SELECT |
| INFO | oyunda: launcher'a dön; launcher'da: kumanda ayarı |

Kumanda: Bluetooth kumandayı TV ayarlarından eşleştir (ya da USB'ye tak) ve bir tuşa bas. Oyundan çıkmak için **START + SELECT** basılı tut.

## Handheld uygulamasından farkları

- Kayıt yedekleme/geri yükleme ve uygulama içi güncelleme yok (güncelleme yeni bir `.ipk`'dır).
- Menü müziği kapalı başlar (TV'de boş RAM az); Ayarlar'dan açılır.
- Oyunlar TV'nin tarayıcısında çalışır; performans TV'nin GPU'suna bağlıdır.

Mimari: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Sorun giderme: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
Uygulama TV'de `/media/developer/pocketvibe/log.txt` dosyasına log yazar.

## Upstream'i takip et

```sh
git remote add upstream https://github.com/cobanov/pocketvibe.git   # bir kez
git fetch upstream && git merge upstream/main
./webos/build.sh
```

Upstream launcher'ı portun yamalarının eşleşmeyeceği şekilde değiştirirse derleme, bulamadığı metni söyleyerek durur;
`webos/tools/build.py` içindeki yamayı güncelle.

## Lisans

Upstream gibi MIT (deponun `LICENSE` dosyası). Üçüncü taraf parçalar: [NOTICE.md](NOTICE.md).
