# ADR-0013: Oyun teknolojisi: web standartları (three.js ve Wasm)

- Durum: Kabul edildi
- Tarih: 2026-10-08

## Bağlam

Geliştiricilerin yeni bir API öğrenmeden, zaten bildikleri araçlarla oyun yapması isteniyor: three.js gibi JavaScript kütüphaneleri ya da WebAssembly'ye derlenen diller (Rust, C/C++, Zig).

## Karar

- Bir OpenBoy oyunu, web standartlarıyla yazılmış bir uygulamadır. Platform ile geliştirici arasındaki sözleşme, web standartlarının tanımlı bir alt kümesidir.
- Bu alt kümenin v0 taslağı:
  - Grafik: WebGL 2 (ve WebGL 1), Canvas 2D.
  - Kod: JavaScript (ES2022+), WebAssembly (SIMD dahil).
  - Ses: Web Audio.
  - Girdi: Gamepad API (cihaz tuşları standart gamepad düzenine eşlenir) ve klavye olayları.
  - Dosya: `fetch` ile yalnızca kartuşun kendi dosyaları.
  - Kayıt: oyuna özel `localStorage` ve IndexedDB.
  - Zamanlama: `requestAnimationFrame`, 60 Hz.
- Ekran 720×480; oyun tam ekran tek bir tuval (canvas) kullanır.
- Masaüstü tarayıcı simülatör görevi görür. Geliştirici Chrome ya da Firefox'ta geliştirir; SDK cihazın ekranını, tuş eşlemesini ve performans bütçesini taklit eder.
- three.js, Pixi, Phaser gibi kütüphaneler ve Emscripten ya da wasm-bindgen çıktıları değişiklik gerekmeden çalışmalıdır. Uyumluluk bir test paketiyle ölçülür.

## Sonuçlar

- ADR-0005 (yalnız Wasm, wasmi), ADR-0006 (sanal GPU), ADR-0007, ADR-0008, ADR-0009 ve ADR-0011 bu ADR'ye yer bırakır.
- Kartuş formatı: oyunun dosyalarını ve bir `openboy.json` manifest'ini içeren bir ZIP (`.obx`).
- Her oyun ayrı bir köken (origin) olarak çalışır; kayıtlar ve izinler tarayıcının aynı köken kuralıyla birbirinden ayrılır.
- Ağ erişimi varsayılan olarak kapalıdır; gerekiyorsa manifest ile istenir.
- Performans sınırını cihazın GPU'su (Mali-G31 MP2) ve işlemcisi (A53) belirler. SDK basit materyaller, az çizim çağrısı ve fırınlanmış ışık gibi kurallar önerir.
