# ADR-0002: Donanım: BCM2711 (Raspberry Pi 4)

- Durum: Yerini aldı (ADR-0012)
- Tarih: 2026-10-08

## Bağlam

Pi 5'in çevre birimleri (GPIO, UART vb.) PCIe üzerindeki RP1 çipinin arkasındadır; bare-metal için gereksiz karmaşıklık getirir. BCM2711 (Pi 4) eksiklerine rağmen belgelenmiştir, QEMU 9.0'dan beri `raspi4b` makinesi olarak emüle edilir ve standart ARM GIC-400 kesme denetleyicisine sahiptir.

## Karar

- Tek hedef SoC: BCM2711 (4 adet Cortex-A72, NEON).
- Geliştirme kartı: Raspberry Pi 4 Model B.
- El konsolu: aynı SoC'yi taşıyan Compute Module 4 değerlendirilecek. Pi 4 kartı el konsolu için büyük ve ısınıyor.
- Geliştirmede görüntü HDMI'den, hata ayıklama UART'tan.
- Butonlar GPIO'dan okunur. USB (PCIe + xHCI + USB yığını) kapsam dışıdır.

## Sonuçlar

- Karta özgü kod `bsp/rpi4` altında toplanır.
- QEMU'da PWM, PCIe ve Ethernet yoktur; QEMU affedicidir (baud, pin çoklama, saat ayarı istemez). Her faz gerçek Pi'de doğrulanır.
- Kapalı GPU firmware'i (start4.elf) boot zincirinde kalır.
