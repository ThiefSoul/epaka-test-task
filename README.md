# epaka.pl - Zadanie testowe

## Setup

```shell
npm ci
npm run start:dev
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

## Uwagi