# Yol haritası

Yön: Anbernic RG SP üzerinde, ROCKNIX'e bir uygulama olarak kurulan ve oyunların three.js ya da Wasm ile yazıldığı bir oyun platformu. Runtime tarayıcısız, Rust + V8 (ADR-0012 ile ADR-0015 arası). Her adımın bir testi var.

## Adım 0: Cihaz envanteri

- RG SP'ye ROCKNIX kur (ayrı bir microSD karta), Wi-Fi ve SSH'ı aç.
- GPU sürücüsü: `/dev/dri` altında Panfrost görünüyor mu?
- Test: Mac'ten SSH ile cihaza bağlanıp `uname -a` ve `ls /dev/dri` çıktılarını görmek.

## Adım 1: Runtime iskeleti ve fizibilite

Her biri cihazda test edilen küçük adımlar:

1. Mac'te arm64 Linux konteynerinde derlenen bir Rust programı, SSH ile cihazda çalışıyor.
2. DRM/KMS + GBM + EGL: ekranı tek renge boya, sonra OpenGL ES ile bir üçgen çiz.
3. evdev: RG SP'nin tuşlarını oku.
4. V8'i (`deno_core`) göm: `console.log` ve ekran senkronuna bağlı `requestAnimationFrame`.
5. WebGL 2 bağlamasının ilk alt kümesi ve DOM adaptörü: three.js ile dönen bir küp.
6. Ölçüm: three.js test sahneleri (basit, çok nesneli, yarış pisti) ve bir Wasm benchmark'ı; 720×480'de fps ve bellek.

## Adım 2: Runtime'ı tamamlama

Resim yükleme ve `fetch` (GLTFLoader için), Gamepad API ve klavye olayları, Web Audio alt kümesi (ALSA), Canvas 2D ile metin, `localStorage`, Emscripten ya da wasm-bindgen ile derlenmiş bir Wasm oyunu.

## Adım 3: ROCKNIX entegrasyonu

- EmulationStation'a "OpenBoy" sistemi; `.obx` oyunları kendi klasöründe listelenir.
- Oyun seçilince `openboy` runtime'ı açılır, Menü tuşuyla arayüze dönülür.
- Test: arayüzden bir oyun seçilip oynanıyor, Menü tuşuyla arayüze dönülüyor.

## Adım 4: Sözleşme v0 ve SDK

- Web API alt kümesi, `openboy.json` manifest'i, tuş eşlemesi, ekran ve performans bütçesi belgesi.
- `npm create openboy`: Vite + three.js şablonu.
- Tarayıcıda simülatör katmanı: 720×480 çerçeve, klavyeden gamepad'e eşleme, bütçe uyarıları.
- `openboy push`: Wi-Fi üzerinden oyunu cihaza gönderme.
- Test: şablondan çıkan oyun tarayıcıda ve cihazda aynı çalışıyor.

## Adım 5: Örnek oyunlar ve dikey dilim

- three.js ile küçük bir 3D yarış oyunu, Rust/Wasm ile bir 2D oyun.
- Kayıt, performans katmanı (fps, bellek), belgeler, oyun dağıtımı (ör. itch.io).

## Sonra

PortMaster formatıyla muOS ve KNULLI desteği, runtime'ın masaüstü sürümü, uyumluluk test paketi, başka cihazlar (RG DS Plus ve çift ekran).
