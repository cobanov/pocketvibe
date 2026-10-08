# Karar kayıtları (ADR)

ADR (Architecture Decision Record), bir mimari kararı bağlamı, kararın kendisi ve sonuçlarıyla birlikte kaydeden kısa bir belgedir. Amaç, "bunu neden böyle yaptık?" sorusunun cevabını aylar sonra da bulabilmek.

Kurallar:

- Her karar ayrı bir dosya, numaralar artarak gider ve yeniden kullanılmaz.
- Durumlar: **Önerildi**, **Kabul edildi**, **Yerini aldı** (yerine geçen ADR belirtilir).
- Kabul edilmiş bir ADR'nin içeriği yeniden yazılmaz. Bir kısmı değişirse yeni bir ADR yazılır ve eskisine yalnızca bir yönlendirme notu eklenir; böylece kararın tarihçesi korunur.

## Geçerli kararlar

| No | Karar | Durum |
|---|---|---|
| [0001](0001-hedef-kitle.md) | Hedef kitle: indie geliştiriciler | Kabul edildi |
| [0003](0003-dil.md) | Dil: Rust (sistem servisi ve araçlar) | Kabul edildi |
| [0012](0012-hedef-cihaz-rg-sp.md) | Yön değişikliği: Anbernic RG SP ve Linux | Kabul edildi |
| [0013](0013-oyun-teknolojisi-web.md) | Oyun teknolojisi: web standartları (three.js ve Wasm) | Kabul edildi |
| [0014](0014-runtime-wpe.md) | Runtime: kendi runtime'ımız (Rust + V8) | Kabul edildi |
| [0015](0015-sistem-imaji.md) | Dağıtım: ROCKNIX üzerinde bir uygulama | Kabul edildi |

## Geçmiş: Raspberry Pi 4 bare-metal tasarımı

İlk tasarım Raspberry Pi 4 üzerinde bare-metal bir sistem içindi. Bu kararlar ADR-0012 ve sonrasıyla yerini yenilerine bıraktı; tarihçe için duruyor.

| No | Karar | Durum |
|---|---|---|
| [0002](0002-donanim.md) | Donanım: BCM2711 (Raspberry Pi 4) | Yerini aldı (ADR-0012) |
| [0004](0004-sistem-mimarisi.md) | Tek uygulamalı bare-metal runtime | Yerini aldı (ADR-0012) |
| [0005](0005-oyun-kodu-wasm.md) | Oyun kodu: WebAssembly | Yerini aldı (ADR-0013) |
| [0006](0006-grafik.md) | Grafik: 3D birinci sınıf, sanal GPU | Yerini aldı (ADR-0013) |
| [0007](0007-ekran-modlari.md) | Ekran modları | Yerini aldı (ADR-0013) |
| [0008](0008-ses.md) | Ses | Yerini aldı (ADR-0013) |
| [0009](0009-kartus-formati.md) | Kartuş formatı | Yerini aldı (ADR-0013) |
| [0010](0010-render-arka-ucu.md) | Render arka ucu: yazılımsal render | Yerini aldı (ADR-0014) |
| [0011](0011-girdi.md) | Girdi | Yerini aldı (ADR-0013) |
