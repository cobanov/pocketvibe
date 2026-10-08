# ADR-0006: Grafik: 3D birinci sınıf, sanal GPU

- Durum: Yerini aldı (ADR-0013)
- Tarih: 2026-10-08

## Bağlam

OpenBoy sıfırdan yeni bir konsol ve PSP ile 3DS'in yaptığı türden 3D oyunları desteklemeli: yarış oyunları, Metroid tarzı aksiyon-macera, futbol. 2D bir darboğaz olmamalı, 3D de "sonra gelir" denen bir özellik olmamalı. Bu ADR'nin önceki taslağı 2D'yi öne alıyordu; reddedildi.

Pi 4'ün GPU'su (V3D) için bare-metal sürücü ve belge yok. Hangi arka ucun kullanılacağı ayrı bir karardır (ADR-0010).

## Karar

- 3D birinci sınıf bir özelliktir. Hedef seviye PSP ve 3DS'tir; ölçülebilir hedefler fizibilite testinde tanımlanır (ADR-0010).
- Platform, PSP'nin GE'sinden ilham alan sabit fonksiyonlu bir "sanal GPU" tanımlar. Oyun komut listesini Wasm belleğine yazar ve tek bir çağrıyla gönderir.
- Sanal GPU API'si gerçek bir GPU API'si gibi tasarlanır: dokular ve köşe tamponları bir kez yüklenir, durumlar komutlarla ayarlanır, kare sırasında eşzamanlı geri okuma yoktur. Böylece arka uç (yazılımsal render ya da ileride gerçek GPU) oyunlar değişmeden değiştirilebilir.
- Özellik seti: dönüşüm matrisleri, kırpma, z-buffer, perspektife doğru doku, bilinear filtre, mipmap, paletli ve 16/32-bit doku formatları, köşe ışığı, sis, karışım modları, alfa testi, skinning (kemik animasyonu), dokuya render.
- 2D aynı boru hattından geçer: sprite eksene hizalı dokulu bir dörtgendir ve kendine ait hızlı bir yolu vardır.
- Programlanabilir shader yoktur. Yerine hazır bir efekt menüsü sunulur: palet değişimi, renk matrisi, CRT, kromatik sapma, ekran sarsıntısı, bozulma haritası.
- Determinizm: sabit noktalı rasterleştirme ve her platformda aynı matematik kütüphanesi. Simülatör ile cihaz bit bit aynı görüntüyü üretir.
- Performans sözleşmesi: render yaptığı işi sayar; simülatör, bütçeyi aşan oyunlar için geliştiriciyi uyarır.

## Sonuçlar

- Kernel'de MMU, FP/NEON ve SMP erkenden şarttır.
- 3D oyunların mantığı (araç ve top fiziği, çarpışma, kamera) 2D'den ağırdır. Host native hızda matematik ve çarpışma yardımcıları sunar (toplu matris işlemleri, ışın ve çarpışma sorguları). Wasm AOT araştırması öne alınır.
- 3D oyunlar analog girdi ister (ADR-0011).
- SDK, Blender'dan çıkan glTF model ve animasyonlarını doğrudan içe alır.
- Bellek bütçesi taslağı: oyun belleği 256 MiB, doku ve mesh belleği 128 MiB. Fizibilite testinden sonra kesinleşir.
- ADR-0001'deki "2D birinci sınıf, 3D sonra" maddesinin yerini alır.
