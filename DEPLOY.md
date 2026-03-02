# Запуск и выкладка Grindly

## Supabase (маркетплейс, инвентарь)

Если используешь маркетплейс и видишь ошибку `relation "user_inventory" does not exist`:

1. Открой **Supabase Dashboard** → **SQL Editor**
2. Выполни содержимое файла `supabase/fix_user_inventory.sql`

Либо выполни миграции по порядку: `migration_inventory.sql`, `migration_gold.sql`, `migration_marketplace.sql`, `migration_marketplace_cancel_expire.sql`.

---

## Запуск у себя (новая версия)

### Режим разработки
```bash
npm install
npm run electron:dev
```
Откроется окно приложения с hot-reload (Vite + Electron).

### Сборка и запуск собранной версии
```bash
npm run electron:build
```
После сборки:
- **Без установки:** запусти `release\win-unpacked\Grindly.exe`
- **Установщик:** в папке `release\` появится `Grindly-Setup-0.1.0.exe` — установи его как обычное приложение

---

## Выкладка на GitHub (Release)

1. **Подними версию** в `package.json`:
   ```json
   "version": "0.1.1"
   ```

2. **Закоммить и запушь:**
   ```bash
   git add package.json
   git commit -m "chore: bump version to 0.1.1"
   git push
   ```

3. **Создай тег и запушь его:**
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. **GitHub Actions** (workflow `.github/workflows/release.yml`) при пуше тега `v*`:
   - соберёт проект на Windows;
   - создаст GitHub Release с этим тегом;
   - загрузит в Release установщик `Grindly-Setup-*.exe`.

Готовый релиз будет в репозитории: **Releases** → тег `v0.1.1` → скачивание `.exe`.
