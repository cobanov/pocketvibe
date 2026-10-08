# ADR-0005: Oyun kodu: WebAssembly

- Durum: Yerini aldı (ADR-0013)
- Tarih: 2026-10-08

## Bağlam

Seçenekler native ELF, Lua ve WebAssembly idi. Native kod, sandbox için MMU + EL0 + syscall altyapısı ve simülatör için ayrı bir derleme gerektirir. Lua tek bir dile bağlar. Topluluktan indirilen bir oyunun sisteme ya da kayıtlara zarar verememesi gerekir.

## Karar

- Oyun kodu WebAssembly'dir. Aynı `.wasm` dosyası simülatörde ve cihazda çalışır.
- Runtime: `wasmi` (saf Rust, `no_std`, deterministik bir yorumlayıcı; Wasm SIMD desteği var).
- Ağır işler (çizim, ses karıştırma, varlık çözme) host'ta native çalışır; Wasm'da oyun mantığı kalır.
- Birinci sınıf diller: C/C++ (clang), Rust, Zig.
- ABI sürümlüdür; her kartuş hedeflediği ABI sürümünü bildirir.

## Açık sorular

- **Lua:** Wasm'a derlenmiş bir Lua, `wasmi` içinde iki kat yorumlanır. Fizibilite testinde ölçülecek. Yavaşsa seçenekler: AOT derleme ya da host'ta native bir Lua VM.
- **AOT:** Wasmtime'ın runtime'ı `no_std` çalışabiliyor, ancak derleyicisi Cranelift'in cihaz üstünde bare-metal çalışması kanıtlanmadı. Başka bir makinede derlenmiş native kodu kabul etmek sandbox'ı deler. İhtiyaç ölçümle doğarsa araştırılır.
