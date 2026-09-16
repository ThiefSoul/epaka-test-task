# epaka.pl - zadanie testowe

## Architektura

- PostgreSQL jest źródłem prawdy dla metadanych plików i ich aktualnej lokalizacji.
- Redis przechowuje wyłącznie indeks plików znajdujących się w warstwie HOT.
  Brak wpisu w Redisie nie oznacza braku pliku. Aplikacja odczytuje PostgreSQL i odbudowuje wpis dla pliku gorącego.
- S3 przechowuje zawartość plików. Lokalnie API S3 zapewnia LocalStack.

Nowe pliki trafiają do gorącego bucketu. Scheduler uruchamiany co minutę wybiera z PostgreSQL najstarsze gorące pliki
spełniające limit wieku i przetwarza je partiami. Plik jest kopiowany do archiwum, weryfikowany, usuwany z Redisa,
oznaczany w PostgreSQL jako zarchiwizowany, a następnie usuwany z bucketu gorącego. Awaria pojedynczego pliku nie
zatrzymuje całej partii.

W środowisku produkcyjnym obie warstwy mogłyby korzystać z klas storage AWS, np. S3 Standard dla plików gorących
i S3 Glacier Instant Retrieval dla zarchiwizowanych plików. Zakładając, że zarchiwizowane pliki są rzadko pobierane,
zredukuje to koszt przechowywania plików.

## Założenia projektowe

W miejscach, których treść zadania nie precyzuje, przyjąłem następujące założenia:

- komunikacja z mikroserwisem odbywa się synchronicznie przez HTTP REST API,
- plik jest identyfikowany przez parę `fileType + fileId`, a `fileId` musi być unikalne w ramach danego typu,
- dodanie istniejącej pary `fileType + fileId` kończy się konfliktem i nie nadpisuje pliku,
- każdy nowy plik trafia do warstwy gorącej,
- czas do archiwizacji jest liczony od momentu dodania pliku,
- pliki gorące i archiwalne są pobierane przez to samo API, więc klient nie zna ich fizycznej lokalizacji,
- usunięcie pliku usuwa jego zawartość, metadane oraz wpis w pamięci podręcznej,
- lista plików danego typu zawiera wszystkie identyfikatory, niezależnie od warstwy storage.

## Decyzje techniczne

### PostgreSQL i Redis

PostgreSQL przechowuje kompletne metadane i pozostaje źródłem prawdy. Dzięki temu lista plików jest kompletna,
a wpisy w cache mogą być odtwarzane podczas kolejnych odczytów.

Redis służy jako cache plików HOT podczas pobierania pliku i sprawdzania statusu. Lista plików zawsze pochodzi
z PostgreSQL. W przypadku braku wpisu aplikacja odczytuje PostgreSQL, a plik HOT ponownie trafia do cache.

### Storage

`StorageService` ukrywa szczegóły AWS SDK i wybór bucketu przed modułem plików. Nie dodałem interfejsu, tokenów DI
ani dodatkowej warstwy adapterów, ponieważ projekt ma jedną implementację storage i taka abstrakcja nie
upraszczałaby obecnego rozwiązania.

### Spójność operacji

PostgreSQL, Redis i S3 nie uczestniczą we wspólnej transakcji. Spójność jest utrzymywana przez kolejność operacji oraz
proste kroki kompensujące. Przykładowo nieudany upload do S3 usuwa wcześniej zapisane metadane, a archiwizacja nie usuwa
źródła HOT, dopóki kopia ARCHIVE nie zostanie zapisana i zweryfikowana.

### Scheduler

Scheduler działa w tym samym procesie NestJS i przetwarza ograniczoną partię plików sekwencyjnie. `waitForCompletion`
zapobiega nałożeniu się kolejnych uruchomień w obrębie jednej instancji. Nie dodałem osobnego workera ani blokady
rozproszonej, ponieważ aplikacja jest uruchamiana lokalnie jako jedna instancja. Przy skalowaniu horyzontalnym należałoby
wydzielić archiwizację lub zapewnić blokadę rozproszoną.

## Uruchomienie

Wymagania:

- Docker oraz Docker Compose.
- Node.js 24 i npm są potrzebne do uruchamiania testów i skryptów bezpośrednio z hosta.

```shell
cp .env.example .env
npm ci
docker compose up -d
docker compose exec app npx typeorm-ts-node-esm migration:run -d src/database/data-source.ts
```

Aplikacja jest dostępna pod `http://localhost:3000`. Kod źródłowy jest montowany do kontenera, a `npm run start:dev`
zapewnia hot reload.

Zatrzymanie środowiska:

```shell
docker compose down
```

## Migracje

Migracje nie są uruchamiane automatycznie przy starcie aplikacji.

```shell
# uruchomienie oczekujących migracji
docker compose exec app npx typeorm-ts-node-esm migration:run -d src/database/data-source.ts

# cofnięcie ostatniej migracji
docker compose exec app npx typeorm-ts-node-esm migration:revert -d src/database/data-source.ts
```

## Konfiguracja

| Zmienna                       | Domyślna wartość         | Znaczenie                                              |
|-------------------------------|--------------------------|--------------------------------------------------------|
| `PORT`                        | `3000`                   | port HTTP aplikacji                                    |
| `REDIS_HOST`                  | `redis`                  | host Redis                                             |
| `REDIS_PORT`                  | `6379`                   | port Redis                                             |
| `REDIS_DB`                    | `0`                      | logiczna baza Redis (`1` dla e2e)                      |
| `AWS_REGION`                  | `eu-central-1`           | region S3                                              |
| `AWS_ACCESS_KEY_ID`           | `test`                   | lokalny access key                                     |
| `AWS_SECRET_ACCESS_KEY`       | `test`                   | lokalny secret key                                     |
| `AWS_ENDPOINT`                | `http://localstack:4566` | endpoint S3                                            |
| `S3_HOT_BUCKET`               | `epaka-hot`              | bucket warstwy HOT                                     |
| `S3_ARCHIVE_BUCKET`           | `epaka-archive`          | bucket warstwy ARCHIVE                                 |
| `FILES_ARCHIVE_AFTER_SECONDS` | `2592000`                | minimalny wiek pliku przed archiwizacją w sekundach    |
| `FILES_ARCHIVE_BATCH_SIZE`    | `100`                    | maksymalna liczba plików w jednym przebiegu schedulera |
| `DB_HOST`                     | `db`                     | host PostgreSQL                                        |
| `DB_PORT`                     | `5432`                   | port PostgreSQL                                        |
| `DB_NAME`                     | `epaka`                  | nazwa bazy aplikacji                                   |
| `DB_TEST_NAME`                | `epaka_test`             | baza tworzona dla testów e2e                           |
| `DB_USER`                     | `epaka`                  | użytkownik PostgreSQL                                  |
| `DB_PASSWORD`                 | `epaka`                  | hasło PostgreSQL                                       |

LocalStack automatycznie tworzy buckety developerskie `epaka-hot`, `epaka-archive` oraz osobne buckety e2e
`epaka-test-hot`, `epaka-test-archive`.

## Testy

Testy jednostkowe nie wymagają infrastruktury.
Testy integracyjne i e2e korzystają z działającego Docker Compose oraz zasobów testowych z `.env.test`:

- bazy `epaka_test`,
- Redis DB `1`,
- bucketów testowych.

```shell
npm test                 # wszystkie testy, sekwencyjnie
npm run test:unit        # testy jednostkowe
npm run test:integration # integracja np. StorageService z LocalStack
npm run test:e2e         # rzeczywiste flow -> HTTP + PostgreSQL + Redis + LocalStack
```

## Load test

Skrypt można uruchomić bezpośrednio z hosta.

**Uwaga:** Pełny wariant generuje około 30 GB danych i może wymagać zwiększenia zasobów Docker Desktop.
Parametry skryptu pozwalają uruchomić mniejszy wariant w środowisku lokalnym.

Pełny wariant wysyła przez HTTP 10 typów po 30 000 plików o rozmiarze 100 KB:

```shell
npm run --silent load:test
```

Mały lokalny wariant:

```shell
npm run --silent load:test -- --types 1 --files-per-type 10 --file-size 1kb --concurrency 2
```

Dostępne parametry:

- `--api-base-url` - domyślnie `http://localhost:3000`
- `--types` - domyślnie `10`
- `--files-per-type` - domyślnie `30000`
- `--file-size` - domyślnie `100kb`
- `--concurrency` - domyślnie `20`

Skrypt raportuje liczbę prób, sukcesów, błędów, czas wykonania i throughput.
Dane są generowane w pamięci i wysyłane z ograniczoną współbieżnością.

Czyszczenie danych utworzonych przez load test:

```shell
npm run --silent load:cleanup
```

Cleanup działa dla domyślnej lokalnej konfiguracji. Usuwa obiekty `load-type-*` z obu bucketów, odpowiadające metadane
z PostgreSQL i wpisy z Redisa.

## API

`fileType` i `fileId` mogą zawierać litery, cyfry, `_` i `-`.

### Upload

```http
POST /v1/files/:fileType/:fileId
Content-Type: application/octet-stream
```

Surowe bajty pliku są przesyłane w body. Maksymalny rozmiar pliku wynosi 10 MB. Sukces zwraca `201 Created`, puste body
`400 Bad Request`, a istniejąca para `fileType + fileId` zwraca `409 Conflict`.

### Download

```http
GET /v1/files/:fileType/:fileId
```

Zwraca `200 OK` oraz zawartość z `Content-Type: application/octet-stream`. Brak pliku zwraca `404 Not Found`.

### Delete

```http
DELETE /v1/files/:fileType/:fileId
```

Usuwa zawartość, metadane i wpis cache. Sukces zwraca `204 No Content`, a brak pliku `404 Not Found`.

### Lista plików

```http
GET /v1/files/:fileType
```

```json
{
  "ids": [
    "123",
    "456"
  ]
}
```

Lista pochodzi z PostgreSQL i zawiera pliki gorące i archiwalne.

### Status wielu plików

```http
POST /v1/files/:fileType/status
Content-Type: application/json
```

```json
{
  "ids": [
    "123",
    "456",
    "999"
  ]
}
```

```json
{
  "files": [
    {
      "id": "123",
      "exists": true,
      "storageType": "hot"
    },
    {
      "id": "456",
      "exists": true,
      "storageType": "archive"
    },
    {
      "id": "999",
      "exists": false,
      "storageType": null
    }
  ]
}
```

Użyłem `POST` ze względu na szersze i bardziej przewidywalne wsparcie.

Metoda `QUERY` semantycznie pasowałaby do tego przypadku idealnie, bo operacja tylko odczytuje dane i jednocześnie
przyjmuje bardziej złożony payload. Jest jednak stosunkowo świeża i może nie być wspierana we wszystkich klientach
HTTP, proxy czy innych elementach infrastruktury.
Skoro jest to tylko wewnętrzny serwis to prawdopodobnie nie ma problemu z użyciem `QUERY`, ale ewentualna migracja
będzie łatwa i szybka.

`GET` odrzuciłem, bo zakładam, że lista ID mogłaby przekroczyć limity dla URL.
