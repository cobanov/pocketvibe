# ADR-0014: Runtime: kendi runtime'ımız (Rust + V8)

- Durum: Kabul edildi
- Tarih: 2026-10-08
- Not: Bu ADR'nin önceki taslağı WPE WebKit öneriyordu; yerine tarayıcısız, kendi runtime'ımız seçildi.

## Bağlam

three.js tarayıcıdan az şey ister: bir JavaScript motoru, bir WebGL bağlamı, `requestAnimationFrame`, girdi olayları ve ses. Bunları tarayıcı olmadan sağlayan küçük bir program yazılabilir. Örnekler: iOS'ta Ejecta (JavaScriptCore + WebGL + ses) ve tarayıcıyı taklit eden ince bir adaptör katmanıyla three.js ve Phaser oyunlarını tarayıcısız çalıştıran WeChat mini oyunları.

WPE WebKit'i ROCKNIX'e bir uygulama olarak taşımak, WebKit'in büyük bağımlılık yığınını (GLib, GStreamer, libsoup ve diğerleri) da taşımak demekti. Bellek ve açılış maliyeti de yüksekti.

## Karar

- Runtime, Rust ile yazılmış tek bir programdır (`openboy`).
- JavaScript motoru V8'dir; Rust'a Deno'nun çekirdeği olan `deno_core` ile gömülür. Sebep: JIT ile hızlı JavaScript ve WebAssembly aynı motorda gelir. QuickJS küçüktür ama yalnızca yorumlayıcıdır ve WebAssembly desteği yoktur.
- Ekran: DRM/KMS + GBM + EGL ile, masaüstü ortamı olmadan doğrudan ekrana çizilir. `requestAnimationFrame` ekranın dikey senkronuna (vsync) bağlıdır.
- WebGL 2 (ve WebGL 1) çağrıları OpenGL ES 3 çağrılarına çevrilir. GPU sürücüsü ROCKNIX'in Mesa'sıdır (Panfrost).
- Girdi evdev'den okunur; Gamepad API ve klavye olayları olarak sunulur.
- Ses: Web Audio'nun three.js ve yaygın kütüphanelerin kullandığı alt kümesi, ALSA üzerinden.
- Tarayıcı ortamını taklit eden ince bir JavaScript adaptörü (`document`, `window`, `canvas`, `Image`, `fetch`, `Blob` URL'leri) kütüphanelerin değişmeden çalışmasını sağlar.
- Uyumluluk testi olarak three.js örnekleri kullanılır.

## Sonuçlar

- ROCKNIX'e tek bir program ve kendi klasörü olarak kurulur. V8 statik bağlanır, GPU kütüphaneleri ROCKNIX'ten gelir.
- Az bellek, hızlı açılış; kare döngüsü ve girdi gecikmesi üzerinde tam kontrol.
- Tarayıcının hazır verdiği şeyleri (resim çözme, Canvas 2D ile metin çizimi, IndexedDB) kendimiz uygularız; sözleşme kademeli olarak genişler.
- Tarayıcı sandbox'ı yoktur; oyun yalnızca runtime'ın verdiği API'lere erişebilir (dosya yalnızca kartuştan, ağ yok). Güvenlik sınırı runtime'ın kendisidir.
- Geliştirme için masaüstü tarayıcı simülatör olmaya devam eder.
