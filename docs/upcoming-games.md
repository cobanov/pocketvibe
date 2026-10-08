# Yapılacak oyunlar

Store için oyun listesi. Durumlar:

- **Bitti:** Oyun yazılmış ve tarayıcıda test edilmiş.
- **Yazılıyor:** Oyun şu an geliştiriliyor.
- **Sırada:** Henüz başlanmadı.

Oyunlar `games/` altında, her biri kendi klasöründe.

## Arcade klasikleri

| # | Oyun | Fikir | Durum | Klasör |
|---|---|---|---|---|
| 1 | Yılan | Klasik Snake, ama 3D ızgarada, kamera üstten eğik bakıyor. | Bitti | `games/snake` |
| 2 | Düşen bloklar | Tetris tarzı. Hafif 3D bloklarla bile çok şık durur. | Bitti | `games/block-drop` |
| 3 | Tuğla kırma | Breakout. Parçacık efektleriyle tatmin edici. | Bitti | `games/brick-breaker` |
| 4 | Uzay istilası | Space Invaders ve Galaga karışımı dikey nişancı. | Bitti | `games/star-defender` |
| 5 | Asteroit avcısı | Asteroids. Dönme, itki, kaydırma fiziği. | Bitti | `games/rock-blaster` |
| 6 | Labirent kovalamaca | Pac-Man tarzı, basit düşman yapay zekası. | Bitti | `games/maze-chase` |
| 7 | Tank savaşı | Battle City tarzı, kırılabilir duvarlar. | Bitti | `games/tank-brigade` |
| 8 | Pinball | L ve R tuşları flipper. Bu cihaza en çok yakışan oyun olabilir. | Bitti | `games/neon-pinball` |

## Tek tuş, mobil hitler

| # | Oyun | Fikir | Durum | Klasör |
|---|---|---|---|---|
| 9 | Kanatlı kuş | Flappy Bird tarzı. | Bitti | `games/sky-hopper` |
| 10 | Jetpack kaçışı | Jetpack Joyride tarzı yatay koşu. | Bitti | `games/jet-rush` |
| 11 | Kule | Stack tarzı, kayan blokları üst üste tam zamanında bırakma. | Bitti | `games/tower-stack` |
| 12 | Ritim zıplayıcı | Geometry Dash tarzı, müziğe senkron engeller. | Bitti | `games/pulse-dash` |
| 13 | Dikey zıplayıcı | Doodle Jump tarzı, platformlardan yukarı tırmanma. | Bitti | `games/cloud-climber` |

## 3D vitrin oyunları

| # | Oyun | Fikir | Durum | Klasör |
|---|---|---|---|---|
| 14 | Üç şeritli koşu | Subway Surfers tarzı sonsuz koşu. | Bitti | `games/runner` |
| 15 | Yol geçme | Crossy Road tarzı, voxel (küp tabanlı) grafiklerle. | Bitti | `games/road-hopper` |
| 16 | Low-poly yarış | Birkaç pistli, yapay zekâlı rakipli basit bir araba yarışı. | Bitti | `games/turbo-circuit` |
| 17 | Kayak inişi | Bayraklar arasından geçilen sonsuz bir slalom. | Bitti | `games/snow-slalom` |
| 18 | Mini golf | Açı ve güç ayarlı, fizik tabanlı. | Bitti | `games/mini-golf` |

## Bulmaca

| # | Oyun | Fikir | Durum | Klasör |
|---|---|---|---|---|
| 19 | 2048 | Kayan sayı karoları. | Bitti | `games/tile-merge` |
| 20 | Kutu itme | Sokoban, 3D'de küçük ve sevimli bir depo görünümüyle. | Bitti | `games/crate-pusher` |

## Komedi

| # | Oyun | Fikir | Durum | Klasör |
|---|---|---|---|---|
| 21 | Direk dansı | Tek tuşlu ritim komedisi: ritimde atılan her $1 bahşiş hype'ı artırıyor, low-poly dansçı Sergio sıkılmış bir yaslanmadan tornadoya kadar figürlerini büyütüyor. Müstehcenlik yok, sanatsal ve komik bir pole fitness gösterisi. | Bitti | `games/pole-star` |

## Notlar

- Store'da marka adları kullanılmıyor. Oyunların adları özgün: Sky Hopper, Jet Rush, Block Drop, Star Defender, Rock Blaster, Road Hopper, Turbo Circuit, Neon Pinball, Brick Breaker, Snake, Lane Runner, Maze Chase, Tank Brigade, Tower Stack, Pulse Dash, Cloud Climber, Snow Slalom, Mini Golf, Tile Merge, Crate Pusher, Pole Star.
- Uzay istilası (4) şu an klasik Space Invaders düzeninde yazılıyor: yana kayan uzaylı filosu ve kalkanlar var. Galaga tarzı dalış saldırıları yok.
- Low-poly yarış (16) şu an tek pistli: 3 tur ve 3 yapay zekâ rakip var. Yeni pistler sonra eklenebilir.
- Ritim zıplayıcı (12) ve direk dansı (21) müziği olan oyunlar: parçalar Web Audio ile oyun başlamadan bir kez render ediliyor ve oyun ses saatine kilitli.
- Kutu itme (20) 30 özgün bölümden oluşuyor; hepsi `tools/solve.mjs` ile çözülebilir olarak doğrulandı ve her bölümün parı en kısa çözüm.
- Her oyunun klasöründe store için bir `pocketvibe.json` (ad, sürüm, açıklama, tür, tuşlar) ve bir `cover.png` (480×270) var.
