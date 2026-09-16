# epaka.pl - Zadanie testowe

## Setup

### Wymagania

* Docker

### Instalacja

```shell
# start containers
docker compose up -d

# run migrations
docker compose exec app npx typeorm-ts-node-esm migration:run -d src/files/persistance/data-source.ts
```

## Load test

Pełny load test wymagany w zadaniu:

```shell
npm run --silent load:test
```

Mały lokalny test:

```shell
npm run --silent load:test -- --types 1 --files-per-type 10 --file-size 1kb --concurrency 2
```

Dostępne parametry:

- `--api-base-url` - domyślnie `http://localhost:3000`
- `--types` - domyślnie `10`
- `--files-per-type` - domyślnie `30000`
- `--file-size` - domyślnie `100kb`
- `--concurrency` - domyślnie `20`

Przykład z własnymi parametrami:

```shell
npm run --silent load:test -- --types 2 --files-per-type 100 --file-size 50kb --concurrency 8
```

Czyszczenie danych po load teście:

```shell
npm run --silent load:cleanup
```

Skrypt usuwa dane z load testu:

- obiekty `load-type-*` z bucketów `epaka-hot` i `epaka-archive`
- metadane `load-type-*` z PostgreSQL
- klucze `hot-files:load-type-*` z Redis

## Założenia i decyzje projektowe

W kilku miejscach treść zadania nie precyzuje dokładnego zachowania serwisu, dlatego przyjmuję poniższe założenia:

* Komunikacja z mikroserwisem odbywa się synchronicznie przez HTTP REST API.
* Plik jest identyfikowany przez parę `type + id`. id musi być unikalne w ramach danego typu.
* Dodanie pliku z istniejącą już parą `type + id` kończy się konfliktem. Istniejący plik nie jest nadpisywany.
* Każdy nowy plik trafia najpierw do warstwy gorącej.
* Czas do archiwizacji liczony jest od momentu dodania pliku.
* Plik archiwalny jest pobierany przez to samo API co plik gorący. Klient nie musi wiedzieć, gdzie fizycznie znajduje
  się plik.
* Usunięcie pliku usuwa zarówno jego zawartość, jak i powiązane z nim metadane.
* Lista plików dla danego typu zawiera wszystkie identyfikatory, niezależnie od tego, czy plik jest gorący, czy
  archiwalny.

## Decyzje techniczne

### Redis + S3

Nie dodaję osobnej bazy danych do metadanych plików.
Plik jest identyfikowany przez `type + id`, więc jego lokalizację można wyliczyć bez klasycznej bazy danych.

Redis służy jako szybki indeks/cache i ma włączoną persystencję.
W przypadku całkowitej utraty danych indeks można odbudować na podstawie storage.

Alternatywą byłaby baza metadanych, np. PostgreSQL.
Ułatwiłaby szybkie odbudowanie cache, ale zwiększa koszt infrastruktury i dokłada kolejny punkt, w którym trzeba
pilnować spójności danych.

### Storage

Na ten moment używam jednego `StorageService`, który jest odpowiedzialny za komunikację z S3/LocalStack.

Nie dokładam osobnego interfejsu ani kolejnej warstwy abstrakcji, bo obecnie jest tylko jedna implementacja.
Jeśli później pojawi się potrzeba obsługi innego storage, wtedy będzie sens to wydzielić.

Dodatkowo utworzyłem test integracyjny dla `StorageService` zamiast jednostkowego,
ponieważ na potrzeby zadania daje on większą wartość.
Produkcyjnie mimo wszystko raczej pojawiłby się test jednostkowy mockujący S3.

### Sprawdzanie statusu wielu plików

Użyłem `POST` ze względu na szersze i bardziej przewidywalne wsparcie.

Metoda `QUERY` semantycznie pasowałaby do tego przypadku idealnie, bo operacja tylko odczytuje dane i jednocześnie
przyjmuje bardziej złożony payload. Jest jednak nadal stosunkowo świeża i może nie być wspierana we wszystkich klientach
HTTP, proxy czy innych elementach infrastruktury.
Skoro jest to tylko wewnętrzny serwis to prawdopodobnie nie ma problemu z użyciem `QUERY`,
ale ewentualna migracja będzie łatwa i szybka.

`GET` odrzuciłem, bo zakładam, że lista ID mogłaby przekroczyć limity dla URL.

## Uwagi
