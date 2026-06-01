# AI API Chat — Rencana Implementasi

Aplikasi klien chat AI bergaya ChatBox, OpenAI-compatible, dark mode, responsif (mobile-first untuk Android), data tersimpan di localStorage. Tidak ada API key di-hardcode.

## Struktur Halaman (routes)
```
src/routes/
  __root.tsx          -> shell + dark mode global
  index.tsx           -> halaman Chat utama (sidebar + chat)
  settings.tsx        -> halaman Settings (kelola provider config)
  api/public/proxy.ts -> proxy server opsional (atasi CORS)
```

## Tata Letak UI (mobile-first, dark mode)
- **Sidebar collapsible** (pakai komponen `sidebar.tsx` / `sheet.tsx` di mobile): daftar percakapan/history, tombol **New Chat**, pindah ke Settings.
- **Area chat**: header (judul chat, pilih provider aktif, tombol Clear Chat), daftar bubble (user kanan, AI kiri), bubble pakai rounded card.
- **Input chat di bawah**: textarea auto-grow + tombol kirim, sticky di bawah, aman untuk keyboard HP.
- **Loading state**: bubble "AI sedang mengetik" (animasi dots) saat menunggu jawaban.
- Render jawaban AI sebagai **markdown** (react-markdown).

## Manajemen Provider Config
Form pengaturan dengan field: Provider name, Base URL, API Path, API Key, Model name, Temperature (slider), Max tokens.
- Bisa simpan **beberapa** konfigurasi (mis. OpenRouter, BluesMinds, Custom OpenAI-compatible).
- Pilih satu provider sebagai **aktif** untuk chat.
- Tombol **Save Settings** dan **Test Connection** (kirim request kecil, tampilkan sukses/gagal).
- Validasi input (URL valid, field wajib, angka temperature 0–2, max tokens > 0) dengan zod + pesan error.

### Contoh default config (otomatis dibuat saat pertama kali)
- Provider: `Custom API`
- Base URL: `https://api.bluesminds.com/v1`
- Path: `/chat/completions`
- Model: kosong (diisi manual user)
- API Key: kosong (diisi user)

## Format Request (OpenAI Chat Completions)
```
POST {baseUrl}{path}
Authorization: Bearer {apiKey}
Content-Type: application/json
{ "model", "messages", "temperature", "max_tokens" }
```

## Penyimpanan (localStorage)
- `aiapichat:providers` — array konfigurasi provider + id provider aktif.
- `aiapichat:conversations` — array percakapan { id, title, messages[], createdAt }.
- Auto-judul percakapan dari pesan pertama user.

## Error Handling
Tangani & tampilkan toast/inline yang ramah untuk:
- 401 → API key salah
- 404 / DNS gagal → Base URL / Path salah
- 400 model error → model tidak tersedia
- 402 / 429 → credit habis / rate limit
- network error / timeout

## Tombol yang diminta
New Chat, Clear Chat, Save Settings, Test Connection.

## Catatan teknis (CORS)
Panggilan langsung dari browser ke sebagian provider sering diblok CORS. Untuk keandalan (terutama di HP), saya tambahkan **proxy server route** `api/public/proxy` yang meneruskan request ke `{baseUrl}{path}`. API key tetap di localStorage dan dikirim per-request (tidak disimpan/di-hardcode di server). Default memakai proxy; bisa diatur untuk panggilan langsung jika provider mengizinkan CORS.

## Design tokens
Tambahkan palet dark modern (oklch) di `src/styles.css`: background gelap, surface card, aksen tunggal, radius besar untuk rounded card. Semua komponen pakai semantic token.

## Dependencies
- `react-markdown` untuk render jawaban AI.
- `zod` untuk validasi form (cek apakah sudah ada; jika belum, tambahkan).

## Verifikasi
Cek build, jalankan Test Connection, kirim 1 pesan uji lewat proxy, dan pastikan layout nyaman di viewport 390px.
