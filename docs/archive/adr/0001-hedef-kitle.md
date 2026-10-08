# ADR-0001: Hedef kitle: indie geliştiriciler

- Durum: Kabul edildi
- Tarih: 2026-10-08

## Bağlam

Büyük bütçeli oyunlara ilgi azalırken el konsolları ve indie oyunlar güçleniyor. Super Meat Boy, Shovel Knight, Undertale ve Katana Zero gibi oyunlar az donanım ister ve Raspberry Pi 4'ün rahatça kaldırabileceği ölçektedir. Bu oyunların bir kısmı çok daha zayıf cihazlarda da yayımlandı (Shovel Knight 3DS'te, Undertale PS Vita'da).

## Karar

OpenBoy'un birincil kullanıcısı, doğrudan bu konsol için oyun yapan indie geliştiricilerdir. Platform kararları önce onların ihtiyacına göre verilir:

- kararlı 60 fps ve düşük girdi gecikmesi,
- cihaz olmadan geliştirmeyi sağlayan, cihazla birebir aynı davranan bir simülatör,
- tanıdık araçlarla çalışma (Aseprite, LDtk, Tiled; WAV, OGG, MP3),
- gerçek müzik ve kayıt desteği,
- oyunu satabilecekleri basit bir dağıtım yolu.

## Sonuçlar

- Fantasy console tarzı sıkı kısıtlar (küçük bellek, sabit palet) yerine cömert ama net sınırlar konur.
- ~~Örnek hedef oyunların hepsi 2D olduğu için 2D birinci sınıftır; 3D sonraya kalır.~~ **Değişti (ADR-0006):** 3D birinci sınıftır; yarış, futbol ve Metroid tarzı oyunlar da hedeflenir.
- Mevcut motorlar (Unity, Godot, GameMaker) burada çalışmaz; web çıktıları tarayıcı API'lerine bağlıdır. Undertale ve Katana Zero GameMaker ile yapıldı. Bu yüzden SDK'nın kendisi üretken bir 2D çatı sunmalıdır: sahne, animasyon, çarpışma, kamera, tilemap. Playdate bu modelin işlediğini gösteriyor.
- Birçok indie geliştirici sistem programcısı değildir; bir betik dili (Lua) desteği önemlidir (ADR-0005, açık soru).
- Wi-Fi bare-metal'de çok zor olduğundan başlangıçta mağaza, çevrimiçi güncelleme ve bulut kayıt yoktur. Dağıtım DRM'siz kartuş dosyalarıyla yapılır (ADR-0009).
