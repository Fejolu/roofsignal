# RoofSignal beheren met Pages CMS

Beheeromgeving: <https://www.roofsignal.nl/beheer>. Meld aan met het GitHub-account van RoofSignal. De snelkoppeling opent **Fejolu / roofsignal**, tak **main**, in Pages CMS.

## Tekst of foto wijzigen

1. Kies **Homepage**, een **Websitepagina** of een **Bestaand kennisartikel**.
2. Open het betreffende onderdeel. Pas de tekst, foto of link aan.
3. Klik op **Save**. Na een geslaagde publicatie staat de wijziging doorgaans binnen enkele minuten online.
4. Controleer de pagina op roofsignal.nl. Bij een mislukte publicatie blijft de vorige versie online.

De vormgeving staat vast. De omschrijving onder **Zoekresultaten en delen** wordt ook gebruikt bij het delen op sociale media.

## Nieuw kennisartikel

- Kies **Nieuwe kennisartikelen** en maak een artikel aan.
- Kies een kort webadres met kleine letters en streepjes, bijvoorbeeld `dakonderhoud-in-de-winter`. De pagina wordt `/kennisbank/dakonderhoud-in-de-winter/`.
- Vul titel, omschrijving, onderwerp, datum en inhoud in. Voeg desgewenst een foto met beschrijving toe.
- Laat **Publiceren** uit om als concept op te slaan. Conceptteksten worden niet meegenomen in de openbare website.
- Zet **Publiceren** aan en sla op. Het artikel verschijnt automatisch in de kennisbank en sitemap. De datum is een zichtbare publicatiedatum, geen publicatieplanning.
- Zet **Publiceren** weer uit om het artikel van de website te halen. De volgende geslaagde bouw verwijdert ook de vermelding in de kennisbank en sitemap.

Wijzig een webadres na publicatie niet; daarvoor is ook een doorverwijzing nodig. Foto’s in de mediabibliotheek zijn openbaar, ook als ze nog bij een concept horen. Gebruik daar alleen afbeeldingen die gepubliceerd mogen worden.

## Afbakening

32 bestaande openbare pagina’s zijn aangesloten. Daaronder vallen diensten, doelgroepen, aanpak, praktijkvoorbeelden en bestaande kennisartikelen. Nieuwe artikelen hebben dezelfde RoofSignal-vormgeving.

De boekingsformulieren, rekenregels, juridische voorwaarden en betaalinstellingen worden apart beheerd. Ze zijn geen vrije CMS-velden. Zo kan een tekstwijziging geen betaling of prijsstaffel veranderen. Bestaande prijsregels in inhoud zijn bewust niet als bewerkbare velden aangeboden. Navigatie en algemene contactinstellingen blijven onderdeel van de vormgeving.

Elke opgeslagen wijziging blijft in de GitHub-versiegeschiedenis terug te vinden en kan worden teruggezet. Pages CMS krijgt alleen toegang tot de repository **Fejolu/roofsignal**; het heeft geen Supabase-, Mollie-, agenda- of CRM-sleutels nodig.

## Technisch beheer

- `.pages.yml` beschrijft de editors; `content/pages/*.json` is de bron voor bestaande pagina-inhoud.
- Gebruik in `.pages.yml` geen YAML-ankers/aliases. De uitgebreide veldconfiguratie overschrijdt anders de aliaslimiet van de YAML-lezer in Pages CMS.
- De oorspronkelijke HTML-bestanden bevatten `data-cms`, `data-cms-image` en `data-cms-link` op vaste posities. Ze blijven het sjabloon voor de vormgeving en bevatten fallbacktekst. Wijzig bij een inhoudelijke codewijziging ook het bijbehorende JSON-veld; anders blijft de CMS-inhoud leidend.
- Nieuwe artikelen staan in `content/articles/*.json`. Alleen `published: true` wordt gebouwd. Een artikelbestand mag niet van webadres veranderen; de bestandsnaam en slug moeten overeenkomen.
- `tools/build_site.py` bouwt statische HTML, werkt metadata bij, ontsluit nieuwe artikelen en controleert links en afbeeldingen. Opgemaakte tekst wordt geschoond tegen scripts, formulieren en embeds.
- Cloudflare Pages: build command `python3 -m pip install -r tools/cms-requirements.txt && python3 tools/build_site.py`; build output `dist`; root leeg; productiebranch `main`.
- De output bevat alleen expliciet geselecteerde publieke bestanden. CMS-bronnen, conceptteksten, tests, interne documenten en backendcode worden niet gepubliceerd.
- `.github/workflows/cms-checks.yml` test iedere wijziging. Lokaal: `python -m pip install -r tools/cms-requirements.txt pytest`, dan `python -m pytest tests/test_cms.py tests/test_seo.py` en `python tools/build_site.py`.
- Bij fouten in CMS-inhoud faalt de Cloudflare-build en blijft de laatste succesvolle deployment actief. Herstel het betreffende veld of draai de contentcommit terug.

Bronnen: [Pages CMS configuratie](https://pagescms.org/docs/configuration/), [HTML-editor](https://pagescms.org/docs/configuration/fields/rich-text/), [media](https://pagescms.org/docs/configuration/media/).
