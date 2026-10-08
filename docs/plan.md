# PocketVibe planı

## İlerleme (2026-10-08, sürüm 0.5.0)

- **Cihaz:** Anbernic RG34XX SP (ROCKNIX `next`, Sway, Panfrost, 720×480). Belgelerde eskiden "RG SP" geçiyordu.
- **Motor kararı (Adım 1) geçildi:** WPE WebKit 2.48 + Cog 0.18. Kurallara uyan sahneler 60 fps, AI'ın varsayılan kodu 3.6-5.6 fps ([ölçüm](../bench/results/2026-10-08-rg-sp.md)).
- **Cihazdaki uygulama (Adım 2) hazır ve yayında:** Ports menüsünde PocketVibe. Library, Store, Settings; indirme halkası ve kutlama; kayıt yedekleme; Start + Select ile oyundan dönüş, 3 sn ile çıkış. Runtime (Debian + WPE) ayrı bir köke kurulu ve `runtime.py` ile kendi mount namespace'inde çalışıyor, WebKit sandbox'ı açık.
- **Kurulum:** `PocketVibe.zip` dosyası `roms/ports` klasörüne açılıyor; ilk açılışta runtime GitHub'dan iniyor (147 MB, cihazda yaklaşık 100 sn). Uygulama kendini GitHub sürümlerinden güncelliyor, açılamayan bir güncellemede önceki sürüme dönüyor. 0.5.0 bu yolla cihazda güncellendi.
- **Mağaza:** Cloudflare Worker (D1 + R2). `pocketvibe publish` ile yükleme; yönetici dışındaki yüklemeler onay bekliyor. 12 oyun yayında.
- **Geliştirici kiti (Adım 3):** `npm create pocketvibe`, `AGENTS.md` kuralları, tarayıcıda 720×480 önizleme. `create-pocketvibe` ve `pocketvibe` 0.1.0 npm'de yayında (2026-10-08).
- **Cihaza gönderme (Adım 4):** son kullanıcı için mağaza üzerinden. Geliştirici için `device/play.sh` (SSH ile oyunu Library'ye koyup açıyor). `npm run push` henüz yok.
- **Site:** https://pocketvibe.cobanov.dev gerçek launcher'ı tarayıcıda, oynanabilir bir konsol çiziminde çalıştırıyor; kurulum ve oyun yapma adımları orada.
- **Denetim:** uygulama, mağaza, CLI ve site incelendi; önemli bulgular düzeltildi (yerel API'nin oyunlara kapatılması, mağazada kimlik sahipliği ve zip sınırları dahil). Kalanlar `docs/handoff.md`'de.

Bilinen sorunlar:

- Cog 0.18'in Wayland kodu kapanırken çöküyor; uygulama bu yüzden Cog'u SIGKILL ile kapatıyor (kayıtlar etkilenmiyor).
- Oyun kayıtları runtime klasörünün içinde (`runtime/root/.local/share/wpe`). Runtime güncellerken bunların taşınması gerekecek; runtime güncelleme yolu henüz yok.
- Bazı oyunlar cihazda yer yer 48 fps'e düşüyor (Turbo Circuit başlangıç çizgisi, Star Defender).
- Çizim çağrısı bütçesi (100) henüz ölçülmedi; 60 bin üçgen doğrulandı.

## Ne yapıyoruz

AI ile (vibe coding) three.js oyunu yazmış insanların, ilk kez bir cihaza, ROCKNIX kurulu el konsollarına oyun yazabilmesi. İlk cihaz Anbernic RG SP.

Ürün iki parçadan oluşur:

1. **Cihazdaki uygulama:** Oyunları emülatörler gibi ROCKNIX menüsünden açan, tarayıcı motoru tabanlı bir oynatıcı.
2. **Geliştirici kiti:** Cihaza göre ayarlanmış bir başlangıç projesi, AI kodlama araçlarına cihazı anlatan bir kural dosyası, tarayıcıda önizleme ve cihaza tek adımda gönderme.

Mevcut web oyunlarını değiştirmeden çalıştırmak hedef değil; oyunlar bu cihaz için yazılır.

## Hedef kullanıcı

- three.js oyununu Claude, Cursor gibi araçlarla yazmış; sistem programlama, Linux ya da SSH bilmeyen biri.
- İlk deneyim: başlangıç projesini aç, AI'a oyununu tarif et, tarayıcıda dene, cihaza gönder, el konsolunda oyna. Hedef süre 15 dakika.

## İlkeler

1. Kodu AI yazıyor: cihazın kuralları önce AI'a (kural dosyası), sonra insana (rehber) öğretilir.
2. Kullanıcı terminal, SSH ya da Linux bilmek zorunda değil.
3. Hazır parçaları kullan; yalnızca el konsoluna özgü ince katmanı yaz.
4. Performans kurallarını tahminle değil, cihazda ölçerek koy.

## Hedef cihaz

Anbernic RG SP: Allwinner H700 (4× Cortex-A53, 1.5 GHz), Mali-G31 MP2 GPU, 1 GB RAM, 720×480 ekran. Sistem: ROCKNIX (ana hat Linux çekirdeği, Mesa Panfrost ile OpenGL ES 3.1).

## Mimari

Cihaz tarafı:

```
EmulationStation (ROCKNIX menüsü)
 └─ Ports menüsünde "PocketVibe" (roms/ports/PocketVibe.sh)
     └─ başlatma betiği
         ├─ gptokeyb: çıkış kısayolu
         └─ Cog + WPE WebKit: tam ekran, 720×480, GPU ile
             └─ oyun (three.js)
```

Geliştirici tarafı:

```
başlangıç projesi (Vite + three.js)
 ├─ AGENTS.md / CLAUDE.md: cihaz kuralları ve performans bütçesi (AI için)
 ├─ handheld.js: tuş girişi (gamepad + klavye), 720×480 ekran, fps göstergesi
 ├─ npm run dev: tarayıcıda cihaz çerçevesiyle önizleme
 └─ npm run push: cihaza gönder, cihazda canlı yenile
```

## Teknoloji yığını

| Parça | Seçim | Neden |
|---|---|---|
| Cihazda oyun motoru | WPE WebKit + Cog | AI'ın yazdığı tipik kod (HTML ve CSS ile skor ekranı, menüler) olduğu gibi çalışır. JavaScript JIT, WebGL ve Web Audio hazır; masaüstü ortamı olmadan ekrana çizer |
| GPU sürücüsü | ROCKNIX'in Mesa'sı (Panfrost) | Çekirdekteki sürücüyle uyumlu olan o; pakete koymuyoruz |
| Menü entegrasyonu | EmulationStation sistem tanımı + shell betiği | Emülatörlerin eklendiği yol |
| Çıkış kısayolu | gptokeyb | PortMaster'ın sınanmış aracı |
| Başlangıç projesi | Vite + three.js (npm ile, CDN yok) | Vibe coding'in alıştığı yapı; cihazda internet gerekmez |
| AI kuralları | AGENTS.md (CLAUDE.md aynı içerik) | Claude Code, Cursor ve benzerleri bu dosyayı okur |
| Gönderme | v0: SD kart ya da ağ paylaşımı; v1: `npm run push` + cihazda canlı yenileme | Kullanıcı SSH bilmek zorunda değil |

## AI kural dosyasının içeriği (taslak)

- Ekran 720×480; `renderer.setPixelRatio(1)`, antialias kapalı.
- Girdi yalnızca `handheld.js` üzerinden: D-pad, A, B, X, Y, L, R, Start, Select.
- Materyaller: `MeshBasicMaterial`, `MeshLambertMaterial`, `MeshToonMaterial`. `MeshStandardMaterial` ve gerçek zamanlı gölgeler yok.
- Az çizim çağrısı: tekrar eden nesnelerde `InstancedMesh`, statik geometriyi birleştir.
- Küçük dokular, az ışık.
- Her karede yeni nesne oluşturma; kullanılmayanı `dispose()` et.
- three.js npm'den gelir, CDN'den değil; oyun internetsiz çalışır.
- Bütçe: kare başına en fazla N çizim çağrısı ve M üçgen. Sayılar ölçümden gelecek.

## Bilinçli olarak yapmadıklarımız

- Mevcut web oyunlarını değiştirmeden çalıştırma ve uyumluluk listesi.
- Kendi JavaScript runtime'ımız: ancak WPE ölçümde yetmezse.
- ROCKNIX fork'u, kendi sistem imajı, kendi menüsü.
- Phaser ve diğer kütüphaneler için şablon: three.js oturduktan sonra.

## Adımlar

### 0. Cihazı hazırla

- ROCKNIX'in RG SP derlemesini ayrı bir microSD karta kur, Wi-Fi ve SSH'ı aç.
- Kontrol: `/dev/dri` altında Panfrost var mı; ekranı doğrudan DRM mi sürüyor, Wayland mı?
- Bitti: Mac'ten SSH ile bağlanıyoruz.

### 1. Prototip ve ölçüm (karar kapısı)

- SD karttaki bir Debian arm64 ortamına (chroot) Cog'u kur, ROCKNIX'in GPU'suyla çalıştır.
- AI'a üç tipik oyun yazdır (sonsuz koşu, araba, platform). Hiç değiştirmeden cihazda çalıştır ve ölç.
- Aynı oyunları performans kurallarıyla yeniden yazdır, tekrar ölç.
- Çıktı: WPE'nin yeterli olup olmadığı ve kural dosyasındaki bütçe sayıları.

### 2. Cihazdaki uygulama

- WPE ve Cog'u kendi klasöründe paketle; Mesa ROCKNIX'ten gelir.
- EmulationStation'a "PocketVibe" sistemi, başlatma betiği, çıkış kısayolu, oyun başına kalıcı kayıt (localStorage).
- Bitti: menüden oyunu seç, oyna, kısayolla menüye dön.

### 3. Başlangıç projesi ve AI kuralları

- Vite + three.js şablonu, `handheld.js`, AGENTS.md / CLAUDE.md, tarayıcıda cihaz çerçevesiyle önizleme.
- Bitti: AI'a "bir araba yarışı yap" denince çıkan oyun cihazda bütçe içinde çalışıyor.

### 4. Cihaza gönderme

- v0: oyun klasörünü SD karta ya da ağ paylaşımına kopyala.
- v1: `npm run push` cihazı ağda bulur, oyunu gönderir, cihazda canlı yeniler.

### 5. İlk kullanıcılar

- 3-5 kişiye sıfırdan oyun yazdır; takıldıkları yerleri düzelt.
- 15 dakikalık "ilk oyunun el konsolunda" rehberi ve örnek oyunlar.
- Sonra: Phaser şablonu, PortMaster ile muOS ve KNULLI, RG DS.
