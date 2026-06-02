# Feature Map

Panduan singkat untuk mengetahui file mana yang biasanya perlu diedit.

- Header chat, tombol garis tiga, nama model aktif, menu mode Plain/GitHub/Real Time, pilih model di mobile: `src/routes/index.tsx`
- Kolom pesan, upload file, tombol kirim, posisi input saat keyboard Android muncul: `src/components/chat/ChatInput.tsx`
- Viewport Android dan PWA boot: `src/routes/__root.tsx`
- CSS global, keyboard-safe-input, keyboard-safe-main, scroll Settings: `src/styles.css`
- Settings provider, Base URL, Path, Chat Models, Image API, Video API: `src/routes/settings.tsx`
- Preset provider dan daftar model default: `src/lib/chat/types.ts`
- Request chat, streaming, realtime, memory, error API: `src/lib/chat/api.ts`
- Image dan video helper: `src/lib/chat/media.ts`
- Halaman image: `src/routes/image.tsx`
- Halaman video: `src/routes/video.tsx`

Untuk masalah ganti model di HP, target utama adalah `src/routes/index.tsx`.
Bagian penting di file itu: `activeProvider`, `providers`, `selectedValue`, `providerModelItems`, `handleProviderModelChange`, dan `activeModelLabel`.
