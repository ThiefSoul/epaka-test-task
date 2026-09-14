# epaka.pl - Zadanie testowe

## Setup

### Prerequisites

* Docker

### Installation

```shell
docker compose up -d
```

## Założenia i decyzje projektowe

W kilku miejscach treść zadania nie precyzuje dokładnego zachowania serwisu, dlatego przyjmuję poniższe założenia:

* Komunikacja z mikroserwisem odbywa się synchronicznie przez HTTP REST API.
* Plik jest identyfikowany przez parę `type + id`. id musi być unikalne w ramach danego typu.
* Dodanie pliku z istniejącą już parą `type + id` kończy się konfliktem. Istniejący plik nie jest nadpisywany.
* Każdy nowy plik trafia najpierw do warstwy gorącej.
* Czas do archiwizacji liczony jest od momentu dodania pliku.
* Plik archiwalny jest pobierany przez to samo API co plik gorący. Klient nie musi wiedzieć, gdzie fizycznie znajduje się plik.
* Usunięcie pliku usuwa zarówno jego zawartość, jak i powiązane z nim metadane.
* Lista plików dla danego typu zawiera wszystkie identyfikatory, niezależnie od tego, czy plik jest gorący, czy archiwalny.

## Decyzje techniczne

### Redis + S3

Nie dodaję osobnej bazy danych do metadanych plików.
Plik jest identyfikowany przez `type + id`, więc jego lokalizację można wyliczyć bez klasycznej bazy danych.

Redis służy jako szybki indeks/cache i ma włączoną persystencję.
W przypadku całkowitej utraty danych indeks można odbudować na podstawie storage.

Alternatywą byłaby baza metadanych, np. PostgreSQL.
Ułatwiłaby szybkie odbudowanie cache, ale zwiększa koszt infrastruktury i dokłada kolejny punkt, w którym trzeba pilnować spójności danych.

## Uwagi