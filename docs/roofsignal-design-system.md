# RoofSignal Design System (RSDS) v1.0

## Doel

RSDS is de enige bron van waarheid voor de visuele taal van RoofSignal. Gebruik dit document voor websites, rapporten, offertes, presentaties, softwareviews, AI-afbeeldingen en toekomstige OpenClaw-output.

RoofSignal verkoopt geen drones en geen foto's. RoofSignal verkoopt vertrouwen in onderhoudsbeslissingen.

Iedere pixel moet onzekerheid verminderen. Iedere pagina moet rust uitstralen. Iedere keuze moet objectiviteit ondersteunen.

## Merkpersoonlijkheid

RoofSignal is rustig, analytisch, objectief, deskundig, premium, technisch, modern en betrouwbaar.

RoofSignal is nooit schreeuwerig, hip, startup-achtig, futuristisch, flashy of marketinggedreven.

Als een ontwerp twijfel oproept: kies rust.

## Ontwerpprincipes

### Rust boven spektakel

Geen drukke pagina's. Geen overbodige animaties. Geen visuele chaos. Gebruik negatieve ruimte als bewijs van controle.

### Bewijs boven marketing

Beelden tonen inspectiebewijs, bouwdelen, defecten, rapportage of besluitinformatie. Geen stockfoto's en geen sfeerbeelden zonder functie.

### Functionaliteit boven schoonheid

Mooi is ondergeschikt aan duidelijk. Een gebruiker moet sneller begrijpen, niet langer kijken.

### Premium minimalisme

Referentiegevoel: Apple, Stripe, Linear, Vercel, DJI Enterprise en Arcadis. Niet crypto, neon, cyberpunk, AI-hype of overdreven futurisme.

## Design Tokens

De actuele CSS-bron staat in `assets/styles.css`. Tokens in `:root` zijn leidend.

### Kleur

| Token | Waarde | Gebruik |
| --- | --- | --- |
| `--rs-graphite-950` | `#050908` | Header, footer, donkere hero-overlays |
| `--rs-graphite-900` | `#101312` | Primaire tekst |
| `--rs-graphite-800` | `#1b211f` | Donkere panelen |
| `--rs-graphite-600` | `#4b5350` | Secundaire tekst |
| `--rs-graphite-100` | `#f4f4f2` | Rustige sectieachtergrond |
| `--rs-white` | `#ffffff` | Achtergrond en tekst op donker |
| `--rs-line` | `#e7e7e2` | Dunne lijnen en componentranden |
| `--rs-orange` | `#ff5a14` | CTA, actieve status, inspectie-highlights |
| `--rs-green` | `#2e8b57` | Lage prioriteit / akkoord |
| `--rs-yellow` | `#c99400` | Aandachtspunt |
| `--rs-red` | `#c7432f` | Hoog risico |

Gebruik oranje spaarzaam. Oranje is een signaal, geen achtergrondthema.

### Typografie

Primaire keuze: Inter. Alternatieven: Manrope of SF Pro.

Regels:

- Grote titels, korte tekstblokken.
- Geen tekstmuren.
- Maximaal ongeveer 70 tekens per regel.
- Letterspacing is 0, behalve bij kleine uppercase labels.
- Bodytekst blijft feitelijk en technisch.

### Grid

Gebruik een 8px spacing-systeem.

| Viewport | Grid |
| --- | --- |
| Desktop | 12 kolommen |
| Tablet | 8 kolommen |
| Mobiel | 4 kolommen |

Maximale contentbreedte: `--rs-max`, standaard `1180px`.

### Radius

Componenten gebruiken `--rs-radius: 12px`.

Uitzonderingen:

- Logo-mark mag kleiner zijn.
- Statuspunten en inspectie-pin bullets mogen rond zijn.
- Inspectielabels mogen pill-shaped zijn als ze functioneel naar een defect wijzen.

### Schaduw

Schaduw is subtiel en ondersteunend. Gebruik:

- `--rs-shadow-soft` voor kaarten.
- `--rs-shadow-panel` voor rapport- of inspectiepanelen.

Geen overdreven zwevende elementen.

## Componenten

Alle componenten zijn rustig, herbruikbaar en functioneel.

### Navigatie

- Donkere, vaste of sticky header.
- Logo links.
- Navigatie rechts op desktop.
- Mobiel: inklapbaar menu zonder horizontale scroll.
- Geen marketinglinks die niet bestaan als product.

### Buttons

- Primaire CTA: oranje achtergrond.
- Secundaire CTA: transparant of outline.
- Tekst is concreet: "Plan een gebouwinspectie", "Bekijk voorbeeldrapport".
- Geen vage CTA's zoals "Ontdek meer".

### Cards

- Wit of zeer subtiel donker.
- 12px radius.
- Dunne lijn.
- Beperkte schaduw.
- Alleen gebruiken voor herhaalbare items, rapportkaarten en echte panelen.

### Pricing

- Korte titels.
- Duidelijke scope.
- Geen sales-druk.
- Toon inspectievraag, output en rapportdiepte.

### Forms

- Eenvoudig.
- Weinig velden.
- Duidelijke labels of placeholders.
- Geen decoratieve illustraties.

### Alerts en status

Gebruik statuskleur alleen wanneer status betekenis heeft:

- Groen: akkoord of laag risico.
- Geel: aandachtspunt.
- Oranje: prioriteit.
- Rood: urgent of hoog risico.

## Fotografie

Fotografie is kritisch voor vertrouwen.

Gebruik alleen beelden die geloofwaardig voelen:

- Nederlands of West-Europees gebouw.
- Baksteen, keramische dakpannen, zinken goten, echte kozijnen.
- Realistische slijtage en subtiele imperfecties.
- Bewolkt daglicht.
- Geen overdreven HDR.
- Geen verzadigde kleuren.
- Geen Amerikaanse villa's.
- Geen stockgevoel.
- Geen zichtbare AI-artifacts.

De drone is nooit de held. Het gebouw is de held. De drone is klein, realistisch en professioneel.

## Hero

De hero bestaat uit één sterke foto.

Vereisten:

- Gebouw rechts of centraal.
- Tekst links.
- Voldoende negatieve ruimte links.
- Subtiele donkere overlay.
- Dak en gevel zichtbaar.
- Drone zichtbaar maar klein.
- Inspectielabels verspreid over meerdere bouwdelen.
- Geen dashboard, floating UI, collage of mini-rapporten in de hero.

Inspectielabels:

- Maximaal één label per gebrek.
- Maximaal één dakpan- of nokgerelateerd gebrek.
- Gebruik verschillende disciplines: loodwerk, voegwerk, metselwerk, goot, boeiboord, zonnepanelen, nokvorst.

Goede labels:

- Los loodwerk
- Open voeg
- Scheur metselwerk
- Vervuilde dakgoot
- Houtrot boeiboord
- Hotspot zonnepaneel
- Beschadigde nokvorst

## Rapporten

Het rapport is het product.

Iedere rapportpagina bevat:

- Titel.
- Bewijsfoto.
- Analyse.
- Risico.
- Advies.
- Prioriteit.
- Kostenindicatie.

Rapporten vermijden lange tekstpagina's. Gebruik fotografie, annotaties, diagrammen, prioriteitsblokken en korte conclusies.

Rapporttaal:

- Niet: "Wij ontzorgen."
- Wel: "Los loodwerk aangetroffen."
- Niet: "Fantastische innovatieve oplossing."
- Wel: "Herstel binnen zes maanden aanbevolen."

## Tabellen

Tabellen zijn rustig:

- Veel wit.
- Dunne lijnen.
- Geen Excel-uitstraling.
- Korte labels.
- Duidelijke prioriteiten.

## AI-Afbeeldingen

Verboden:

- Cyberpunk.
- Neon.
- Plastic/glanzend.
- Zwevende dashboards.
- Sciencefiction.
- Te perfecte gebouwen.
- Amerikaanse suburbs.
- Generieke dronefoto's.

Verplicht:

- Realistische architectuurfotografie.
- Nederland of West-Europa.
- Bewolkt daglicht.
- Premium maar natuurlijk.
- Subtiele imperfecties.
- Functionele inspectiepunten.

Basisprompt:

```text
Photorealistic premium architectural inspection photography for RoofSignal, a Dutch property intelligence platform. Modern Dutch apartment building or office building, visible roof and facade, brickwork, zinc gutters, realistic windows, subtle wear, cloudy daylight, natural colors, small professional inspection drone in the scene, building is the hero. Add a limited number of precise inspection callouts connected to real building elements: loose flashing, open joint, masonry crack, dirty gutter, fascia wood rot, solar panel hotspot, damaged ridge tile. Calm composition, negative space on the left for white text, subtle dark overlay area, no dashboard, no floating UI, no sci-fi, no stock-photo feeling, no American house, no villa, no HDR, no neon.
```

## Copywriting

Schrijf kort, objectief en technisch.

Regels:

- Korte zinnen.
- Feitelijke claims.
- Geen buzzwords.
- Geen overdreven superlatieven.
- Benoem bewijs, risico en advies.

Voorbeelden:

- "Inspectie van de gebouwschil."
- "40-80 detailfoto's."
- "Rapport binnen 48 uur."
- "Herstel binnen zes maanden aanbevolen."
- "Vervuilde dakgoot met verhoogd lekkagerisico."

## Website UX

De homepage beantwoordt binnen vijf seconden:

- Wat doet RoofSignal?
- Waarom is dat waardevol?
- Wat is mijn volgende stap?

Volgorde:

1. RoofSignal inspecteert gebouwen.
2. RoofSignal levert bruikbare rapporten.
3. RoofSignal bouwt onderhoudsdata op.
4. RoofSignal groeit richting Property Intelligence.

## Responsive

Desktop-first, daarna tablet en mobiel.

Eisen:

- Geen horizontale scroll.
- Geen afgesneden tekst.
- Geen overlap.
- CTA blijft zichtbaar.
- Hero cropt logisch.
- Mobiel mogen labels verdwijnen of minder dominant worden.
- Navigatie is inklapbaar.

## OpenClaw-regels

Wanneer OpenClaw nieuwe RoofSignal-output maakt:

1. Gebruik dit document als eerste bron.
2. Gebruik `assets/styles.css` tokens voor webwerk.
3. Gebruik bewijsbeelden, geen decoratiebeelden.
4. Houd oranje exclusief.
5. Controleer responsive gedrag.
6. Vermijd generieke startup-copy.
7. Vraag bij twijfel: "verhoogt dit vertrouwen?"

## Acceptatiechecklist

Een ontwerp is RSDS-compliant wanneer:

- Het direct rustig en betrouwbaar voelt.
- Het gebouw of bewijs centraal staat.
- De drone niet de held is.
- Oranje alleen als signaal wordt gebruikt.
- Tekst kort en feitelijk is.
- Componenten 12px radius gebruiken.
- Er geen dashboard in de hero zweeft.
- Fotografie Nederlands/West-Europees voelt.
- Mobiel geen horizontale scroll heeft.
- De gebruiker sneller begrijpt wat de volgende stap is.
