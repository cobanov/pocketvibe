# ADR-0011: Girdi

- Durum: Yerini aldı (ADR-0013)
- Tarih: 2026-10-08

## Bağlam

3D oyunlar (yarış, futbol, Metroid tarzı) analog girdi ister: hareket için bir çubuk, kamera için ikinci bir çubuk. Yarışta gaz ve fren için analog tetikler faydalıdır. Pi 4'te ADC (analog-dijital çevirici) yoktur.

## Karar

- Dijital tuşlar: D-pad, A, B, X, Y, L, R, Start, Select ve oyunun göremediği bir Menü tuşu.
- Analog: iki çubuk (X/Y) ve iki tetik (L2/R2). Tetikler donanımda dijital olabilir; o durumda değer 0 ya da 1 gelir.
- Spec değerleri normalize eder: çubuklar -1..1, tetikler 0..1. Ölü bölgeyi (deadzone) platform uygular.
- Donanımda analog değerler harici bir ADC'den (I2C), dijital tuşlar GPIO'dan ya da bir I2C genişleticiden okunur.
- Geliştirmede: simülatörde klavye ve USB gamepad, QEMU'da UART üzerinden gelen tuşlar.

## Sonuçlar

- Girdi kare başına bir kez okunur ve oyuna sanal bir register bloğu olarak sunulur; bu, deterministik replay'i mümkün kılar.
- El konsolu kartı bir ADC ve tuş genişletici içerir.
