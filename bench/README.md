# Handheld bench

Fizibilite ölçümü (plan, adım 1). Üç tipik oyun sahnesini (sonsuz koşu, yarış, platform) iki şekilde çizer ve 720×480'de fps ile çizim istatistiklerini ölçer:

- **naive:** AI araçlarının varsayılan olarak yazdığı three.js: her nesne ayrı mesh, `MeshStandardMaterial`, gerçek zamanlı gölgeler, nokta ışıklar.
- **lean:** `template/AGENTS.md` kuralları: nesne türü başına bir `InstancedMesh`, paylaşılan Lambert materyal, gölge yok.

İki mod aynı sahne tanımından kurulur; aradaki tek fark çizim yöntemidir.

## Çalıştırma

```sh
npm install
npm run dev      # masaüstünde dene
npm run build    # cihaz için dist/
```

Sayfa açılınca menüden tek bir ölçüm ya da "Run all" seçilir. Doğrudan adres parametreleriyle de çalışır:

- `?suite=all`: altı ölçümün hepsi, her biri ayrı sayfa yüklemesiyle
- `?scene=racing&mode=lean`: tek ölçüm
- `&seconds=20`: ısınmadan sonraki ölçüm süresi

## Çıktı

Her ölçüm konsola `BENCH {...}`, suite sonunda `BENCH_SUMMARY [...]` satırı yazar ve sonuçları ekranda tablo olarak gösterir.

| Alan | Anlamı |
|---|---|
| `avgFps` | Ortalama kare hızı |
| `low1Fps` | En yavaş %1'lik karelerin hızı (takılmaları gösterir) |
| `over33ms` | 30 fps'in altına düşen kare sayısı |
| `avgDrawCalls`, `avgTriangles` | Kare başına ortalama çizim çağrısı ve üçgen |
| `firstFrameMs` | Sayfanın yüklenmeye başlamasından ilk kareye kadar geçen süre |
