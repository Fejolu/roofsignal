# RoofSignal Pricing Engine v1

Purpose: create consistent, transparent and reproducible inspection quotations.

RoofSignal does not price drone flights. RoofSignal prices expertise, analysis,
prioritisation, reporting and maintenance intelligence. The model therefore
reflects effort, complexity and value delivered instead of flight time or photo
count.

## Formula

Each object receives three scores from 1 to 5:

- Object complexity: 40%
- Accessibility and location: 20%
- Inspection scope: 40%

Weighted score:

```text
0.40 x complexity + 0.20 x accessibility + 0.40 x scope
```

Inspection price:

```text
EUR 250 x weighted score
```

The result is rounded to the nearest EUR 50. A minimum quotation of EUR 500 is
applied so very small objects remain commercially viable.

## Score Definitions

### 1. Object Complexity

Score 1 is a detached house. Score 5 is a logistics centre, solar park or
industrial site.

The engine considers:

- building type;
- building size;
- roof area;
- facade area;
- building height;
- number of roof planes;
- number of technical details;
- roof structures;
- separate buildings;
- solar installations.

### 2. Accessibility and Location

Score 1 is a local Apeldoorn object. Score 5 is an island, restricted site or
special access area.

The engine considers:

- city and region;
- parking and urban density;
- permissions;
- restricted airspace or no-fly indications;
- rural or remote access;
- multiple buildings or locations.

### 3. Inspection Scope

Score 1 is roof only. Score 5 is a full intelligence report with thermography,
planning, cost estimation or portfolio comparison.

The engine considers:

- roof only;
- roof and gutters;
- facade or full building envelope;
- structured reporting;
- solar inspection;
- thermography;
- MJOP indication;
- maintenance prioritisation;
- cost estimation;
- portfolio comparison.

## Confidence

Confidence is based on input completeness and assumptions:

- High: most object, location and scope fields are known.
- Medium: some assumptions are needed.
- Low: the model relies heavily on object type or defaults.

The quotation is still generated at low confidence, but should be qualified
before sending.

## Run

```bash
python3 tools/roofsignal_pricing_engine.py
```

Default input:

```text
data/pricing/roofsignal_pricing_examples.csv
```

Outputs:

```text
results/pricing/latest_roofsignal_pricing.md
results/pricing/latest_roofsignal_pricing.json
results/pricing/latest_roofsignal_pricing.csv
```

Create a blank input template:

```bash
python3 tools/roofsignal_pricing_engine.py --write-template data/pricing/my_quote_input.csv
```

## Validation Set

The default example file tests:

- detached house;
- small VvE;
- large VvE;
- school;
- logistics centre;
- agricultural property;
- solar park.

These cases are meant to keep the model commercially sane. A very small object
should land around the lower end of the scale; high-scope, high-complexity sites
should land around the top of the current v1 range.

## Current Assumptions

- Prices are indicative quotation amounts, excluding VAT unless stated
  otherwise in the offer.
- The user-provided v1 examples are treated as the binding scale:
  weighted score 2.0 -> EUR 500, 3.0 -> EUR 750, 4.0 -> EUR 1000,
  5.0 -> EUR 1250.
- The formula intentionally avoids per-photo or per-flight pricing.
- Travel is represented through the accessibility score. A separate travel
  surcharge can be added in a later version.
- Emergency, storm and out-of-hours inspections are future modifiers, not part
  of v1.
- Portfolio discount, recurring inspections and subscription contracts are
  future modifiers.
- Thermography is included as a scope signal and can later become a structured
  add-on.

## Future Expansion Hooks

The CSV and JSON output are intentionally explicit so these variables can be
added without changing the pricing philosophy:

- thermography add-on;
- portfolio discount;
- recurring inspections;
- subscription contracts;
- travel surcharge;
- emergency inspections;
- storm inspections.
