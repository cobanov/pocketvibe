# ADR-0010: Render arka ucu: yazılımsal render ve fizibilite kapısı

- Durum: Yerini aldı (ADR-0014)
- Tarih: 2026-10-08

## Bağlam

PSP ve 3DS'in 3D gücü özel GPU'larından geliyordu. Pi 4'ün GPU'su (VideoCore VI / V3D) onlardan güçlü, ama bare-metal'den kullanılamıyor: yayımlanmış belge yok, çalışan bir bare-metal sürücü yok ve shader'ların QPU denen GPU çekirdekleri için derlenmesi gerekiyor. Tek referans Mesa ve Linux'un `v3d` sürücüsü.

İşlemci tarafı güçlü: 4 adet Cortex-A72 ve NEON. Kaba hesap: 480×270 çözünürlükte, 2.5 overdraw ile 60 fps için saniyede yaklaşık 20 milyon piksel gerekir. 3 çekirdekte bu, piksel başına yaklaşık 225 çevrim bütçe demek. İyi optimize edilmiş dokulu bir pikselin maliyeti tahminen 20-60 çevrim.

Üç yol var:

- A. Yazılımsal render: işlemcide, 3 çekirdek ve NEON ile.
- B. Bare-metal V3D sürücüsü.
- C. Minimal Linux + Mesa (OpenGL ES / Vulkan).

## Karar

- Birincil arka uç A: yazılımsal render. Simülatörde ve cihazda aynı kod çalışır.
- Fizibilite kapısı: ciddi yatırımdan önce Pi 4'te (Raspberry Pi OS altında) üç test sahnesi ölçülür:
  1. Yarış: 480×270, 60 fps; pist, 8 araç, sis, uzak mesafede LOD.
  2. Futbol: 22 skinned oyuncu ve stadyum, 30-60 fps.
  3. İç mekan aksiyon (Metroid tarzı): dinamik köşe ışıkları, parçacıklar, alfa karışımı, 60 fps.

  Aynı testte `wasmi` üzerinde 3D oyun mantığı (fizik, çarpışma) da ölçülür.
- Kapıdan geçilirse A kesinleşir. Geçilemezse B ve C ölçüm sonuçlarıyla yeniden tartılır.
- B (V3D) uzun vadeli bir araştırma hattıdır ve kernel temelleri bittikten sonra paralel ilerleyebilir. İlk hedef GPU'ya güç verip tek bir QPU programı çalıştırmak. Başarılı olursa sanal GPU'nun ikinci arka ucu olur; oyunlar değişmez.

## Sonuçlar

- Fizibilite testi yol haritasının en başına, Faz 1 ile paralele alınır.
- Test sahneleri sonrasında performans regresyon testleri olarak kalır.
