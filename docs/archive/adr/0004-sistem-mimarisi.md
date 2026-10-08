# ADR-0004: Tek uygulamalı bare-metal runtime

- Durum: Yerini aldı (ADR-0012)
- Tarih: 2026-10-08

## Bağlam

Aynı anda tek oyun çalışan bir konsolda süreçler, zamanlayıcı, VFS gibi genel amaçlı işletim sistemi parçalarına ihtiyaç yoktur. Eski konsollarda işletim sistemi yoktu; oyun makinenin tamamını kullanırdı. "İşletim sistemi" hedefi kapsamı gereksiz büyütür.

## Karar

- OpenBoy genel amaçlı bir işletim sistemi değil, unikernel benzeri tek uygulamalı bir runtime'dır: boot, bellek, kesmeler, sürücüler ve tek bir ana döngü.
- Katmanlar: oyun (Wasm) → runtime (platformdan bağımsız) → HAL → arka uçlar (Pi 4 kernel'i ve masaüstü simülatörü).
- HAL dar tutulur: kareyi göster, butonları oku, ses örneklerini gönder, dosya oku, zamanı ver, sonraki kareyi bekle. Çizim runtime'da yapılır.
- Çekirdek kullanımı: çekirdek 0 oyun mantığı ve sistem işleri, çekirdek 1-3 render.

## Sonuçlar

- Linux'un açılış süresi, compositor ve sürücü katmanları yoktur; butondan ekrana gecikme çok düşük olabilir. Hassas aksiyon oyunları için bu bir satış argümanıdır.
- USB, Wi-Fi, Bluetooth gibi büyük sürücüler kapsam dışıdır.
- Yeni bir arka uç (farklı ekran, ileride bir Linux portu) yalnızca dar HAL'i uygulayarak eklenebilir.
