# ADR-0012: Yön değişikliği: Anbernic RG SP ve Linux

- Durum: Kabul edildi
- Tarih: 2026-10-08

## Bağlam

İlk plan, Raspberry Pi 4 üzerinde bare-metal bir sistem ve kendi el konsolu donanımımızdı. Oysa ekranı, tuşları, pili ve kasası hazır; yaygın ve ucuz el konsolları (Anbernic) zaten var ve Linux çalıştırıyor. Kendi donanımımızı yapmak, projenin en riskli ve en uzak kısmıydı.

## Karar

- İlk hedef cihaz Anbernic RG SP: Allwinner H700 (4× Cortex-A53, 1.5 GHz), Mali-G31 MP2 GPU, 1 GB RAM, 3.4" 720×480 ekran, Wi-Fi.
- Platform Linux üzerinde çalışır. Bare-metal ve kendi kernel'imiz kapsam dışıdır.
- Platform, ileride başka Linux el konsollarına (ör. RG DS Plus) taşınabilecek şekilde tasarlanır.

## Sonuçlar

- ADR-0002 (Pi 4) ve ADR-0004 (bare-metal runtime) yerini bu ADR'ye bırakır.
- GPU'ya Linux sürücüsüyle (Mesa Panfrost ya da üretici sürücüsü) erişilir; yazılımsal render gereksizleşir.
- Rust (ADR-0003) sistem servisi ve araçlar için kullanılmaya devam eder.
- Öğrenme odağı bare-metal'den gömülü Linux'a kayar: açılış zinciri, device tree, DRM/KMS, EGL, Mesa, evdev, ALSA, Buildroot.
