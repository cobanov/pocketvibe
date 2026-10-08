# PocketVibe

AI ile (vibe coding) three.js oyunu yazan insanların, ROCKNIX kurulu el konsollarına oyun yazabilmesi için bir geliştirici kiti ve cihazda oyunları emülatörler gibi menüden açan bir uygulama. İlk hedef cihaz: Anbernic RG SP.

## Durum

Fizibilite tamam: three.js oyunları RG SP üzerinde WPE ile 60 fps çalışıyor. Sıradaki adım ROCKNIX menü entegrasyonu ve WPE paketleme.

## Klasörler

| Klasör | İçerik |
|---|---|
| `template/` | Oyun yazacakların başlangıç projesi: Vite + three.js, `handheld.js` (ekran, tuşlar, döngü, kayıt, performans göstergesi), AI kural dosyası `AGENTS.md` / `CLAUDE.md`, örnek oyun |
| `games/runner/` | Lane Runner: şablon üzerine kurulu ilk örnek oyun (sonsuz koşucu) |
| `bench/` | Fizibilite ölçümü: üç oyun sahnesi, AI'ın varsayılan kodu (`naive`) ile kurallara uyan kod (`lean`) karşılaştırması |
| `device/` | Cihaz tarafı: `inventory.sh` (envanter), `debian-chroot.sh` (WPE ortamı), `run-game.sh` ve `play.sh` (oyunu cihazda çalıştırma), `input-test/` (tuş testi) |
| `docs/` | [Plan](docs/plan.md), [yapılacak oyunlar](docs/upcoming-games.md) ve [önceki tasarım denemelerinin arşivi](docs/archive/README.md) |
