# ADR-0015: Dağıtım: ROCKNIX üzerinde bir uygulama

- Durum: Kabul edildi
- Tarih: 2026-10-08
- Not: Runtime ADR-0014 ile WPE yerine kendi runtime'ımız oldu; aşağıda WPE/Cog geçen yerler `openboy` runtime'ı olarak okunmalı.

## Bağlam

RG SP 5 Ağustos 2026'da çıktı. muOS, KNULLI ve ROCKNIX gibi topluluk firmware'leri cihaz için derlemeler yayımladı; bir kısmı henüz test aşamasında. Bu firmware'ler emülatörleri "sistem" olarak tanır: EmulationStation arayüzü her sistem için bir oyun klasörü, dosya uzantıları ve bir başlatma komutu bilir. Bir oyun seçildiğinde komutu oyunun dosya yoluyla çalıştırır; program ekranı ve tuşları devralır, kapanınca arayüz geri gelir.

WPE'nin çalışması için GPU'nun Linux'un standart grafik arayüzüyle (DRM/EGL/GBM) sürülmesi gerekir. ROCKNIX ana hat (mainline) Linux ve Mesa'nın açık Panfrost sürücüsünü kullanır.

## Karar

- OpenBoy, ROCKNIX üzerinde bir emülatör gibi kurulan bir uygulamadır. Cihaz her zamanki gibi ROCKNIX ile açılır.
- OpenBoy, EmulationStation'a yeni bir sistem olarak eklenir. `.obx` oyunları kendi klasörüne konur; oyun seçilince `openboy-run` onu WPE/Cog ile tam ekran açar. Menü tuşu oyunu kapatıp arayüze döndürür.
- Başlangıçta ayrı bir launcher yazılmaz; launcher EmulationStation'dır.
- Runtime ve bağımlılıkları (WPE, Cog ve kütüphaneleri) kendi klasöründe, ROCKNIX'in sistemine dokunmadan taşınır. Mesa ve GPU sürücüsü ROCKNIX'inki kullanılır.
- ROCKNIX fork'u ancak bir uygulama olarak çözülemeyen bir ihtiyaç çıkarsa yapılır (ör. bağımlılıkları imaja gömmek gerekirse).

## Sonuçlar

- İlk iş: ROCKNIX'in RG SP'de çalıştığını ve GPU'nun Panfrost ile sürüldüğünü doğrulamak.
- Kendi sistem imajı ve fork'un bakım yükü ertelenir.
- İleride PortMaster formatıyla muOS ve KNULLI'de de çalışmak mümkün olabilir.
