# ADR-0007: Ekran modları

- Durum: Yerini aldı (ADR-0013)
- Tarih: 2026-10-08

## Bağlam

Indie oyunlar farklı dahili çözünürlükler kullanır (ör. Celeste 320×180, Shovel Knight 400×240). Tek bir sabit çözünürlük çoğuna uymaz. Pixel art'ın bozulmaması için ölçek tam sayı olmalıdır.

## Karar

- Çıkış 16:9'dur.
- Oyun aşağıdaki dahili çözünürlüklerden birini seçer; hepsi 1920×1080'e tam sayıyla ölçeklenir:

| Mod | 1080p ölçeği | 720p ölçeği |
|---|---|---|
| 320×180 | 6× | 4× |
| 384×216 | 5× | yok |
| 480×270 | 4× | yok |
| 640×360 | 3× | 2× |

- Kare hızı hedefi 60 fps'tir. 3D'de çözünürlük doğrudan performansı belirler, çünkü her piksel yazılımla çizilir. Önerilen: 480×270'te 60 fps, 640×360'ta 30 fps. Fizibilite testiyle kesinleşir (ADR-0010).
- Ölçekleme mümkünse ekran donanımına (firmware'in HVS ölçekleyicisi, en yakın komşu filtresi) bırakılır, işlemciye maliyeti olmaz. Denenecek.

## Sonuçlar

- El konsolu paneli 16:9 olmalıdır. 1080p panel bütün modları, 720p panel iki modu tam sayıyla gösterir. Panel seçimi donanım fazındadır.
- Bu modlar SPI ekranın taşıyabileceğinden büyüktür; el konsolunda DPI ya da DSI panel gerekir, pin planı buna göre yapılır.
