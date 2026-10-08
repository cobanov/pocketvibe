# ADR-0009: Kartuş formatı

- Durum: Yerini aldı (ADR-0013)
- Tarih: 2026-10-08

## Bağlam

İlk taslakta kartuş tek bir `.wasm` dosyasıydı ve varlıklar içine gömülüyordu. Bu yaklaşım, yüzlerce MB müzik ve görsel varlığı olan indie oyunlara ölçeklenmez: her şeyin oyunun belleğine yüklenmesi gerekir.

## Karar

- Kartuş, uzantısı `.obx` olan sıkıştırmasız (stored) bir ZIP dosyasıdır. İçeriği:
  - `game.wasm`: oyun kodu,
  - `meta`: kimlik, başlık, yazar, sürüm, hedef ABI sürümü, ekran modu, ikon (kodlaması uygulamada belirlenecek),
  - `assets/`: platform formatlarına önceden çevrilmiş varlıklar.
- Sıkıştırmasız olduğu için cihaz varlıkları doğrudan akış halinde okuyabilir; her işletim sistemi ve araç ZIP'i tanır.
- Kayıtlar kartuştan ayrı tutulur (`saves/<oyun-id>/`).
- Dağıtım DRM'sizdir; geliştirici `.obx` dosyasını istediği yerde (ör. itch.io) satabilir.

## Sonuçlar

- Cihazda salt okunur bir ZIP okuyucu gerekir (merkez dizini okumak yeterli).
- Kayıt, güç kesintisine dayanıklı olmalıdır: iki yuvalı kayıt ve sağlama toplamı.
- İleride USB-C üzerinden cihazın bilgisayara disk olarak bağlanması, kartuş kopyalamayı kolaylaştırır.
