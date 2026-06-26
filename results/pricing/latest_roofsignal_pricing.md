# RoofSignal Pricing Engine v1

Generated: 2026-06-26 23:12 CEST
Input: `data/pricing/roofsignal_pricing_examples.csv`

Formula: `250 x weighted score`, rounded to nearest EUR 50, with a EUR 500 minimum quotation.
Weights: complexity 40%, accessibility/location 20%, inspection scope 40%.

## 1. Detached house

- Client type: Vastgoedeigenaar
- Object complexity: 1/5 - Complexity is scored 1/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 1/5 - Accessibility is scored 1/5 based on travel, site access and permission complexity.
- Inspection scope: 1/5 - Scope is scored 1/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 1.00
- Suggested quotation: EUR 500
- Confidence: High

Signals:
- Complexity: detached-house scale
- Accessibility: local Apeldoorn object
- Scope: roof inspection

Assumptions:
- Single simple object used for lower-bound validation.

## 2. Small VvE

- Client type: VvE beheer
- Object complexity: 3/5 - Complexity is scored 3/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 1/5 - Accessibility is scored 1/5 based on travel, site access and permission complexity.
- Inspection scope: 4/5 - Scope is scored 4/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 3.00
- Suggested quotation: EUR 750
- Confidence: High

Signals:
- Complexity: small apartment/VvE scale; small multi-unit size: 650 m2; small managed roof area: 320 m2; moderate height: 10 m; several details or roof elements
- Accessibility: local Apeldoorn object
- Scope: gutters included; maintenance prioritisation included

Assumptions:
- Small VvE with basic prioritisation.

## 3. Large VvE

- Client type: VvE beheer
- Object complexity: 5/5 - Complexity is scored 5/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 3/5 - Accessibility is scored 3/5 based on travel, site access and permission complexity.
- Inspection scope: 4/5 - Scope is scored 4/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 4.20
- Suggested quotation: EUR 1050
- Confidence: High

Signals:
- Complexity: large apartment complex; substantial gross size: 5200 m2; medium roof area: 2100 m2; large facade area: 4800 m2; height requires more planning: 18 m; many roof planes, details, structures or buildings; solar installation adds reporting complexity
- Accessibility: local Apeldoorn object; parking or dense urban setting; multiple locations/buildings: 2
- Scope: building envelope included; structured reporting required; MJOP indication included; maintenance prioritisation included

Assumptions:
- Two connected buildings; no thermography in base case.

## 4. School

- Client type: Schoolbestuur
- Object complexity: 4/5 - Complexity is scored 4/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 4/5 - Accessibility is scored 4/5 based on travel, site access and permission complexity.
- Inspection scope: 4/5 - Scope is scored 4/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 4.00
- Suggested quotation: EUR 1000
- Confidence: High

Signals:
- Complexity: managed commercial or institutional object; medium gross size: 3600 m2; medium roof area: 1600 m2; facade review adds effort: 2400 m2; moderate height: 12 m; multiple roof planes, details, structures or buildings; solar installation adds reporting complexity
- Accessibility: local Apeldoorn object; permissions or flight restriction expected
- Scope: building envelope included; structured reporting required; MJOP indication included; maintenance prioritisation included

Assumptions:
- Inspection planned outside pupil arrival/departure windows.

## 5. Logistics centre

- Client type: Vastgoedbeheer
- Object complexity: 5/5 - Complexity is scored 5/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 2/5 - Accessibility is scored 2/5 based on travel, site access and permission complexity.
- Inspection scope: 5/5 - Scope is scored 5/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 4.40
- Suggested quotation: EUR 1100
- Confidence: High

Signals:
- Complexity: industrial, logistics or solar-site scale; large gross size: 18000 m2; very large roof area: 12000 m2; large facade area: 9000 m2; moderate height: 14 m; many roof planes, details, structures or buildings; solar installation adds reporting complexity
- Accessibility: Stedendriehoek/Veluwe travel distance
- Scope: structured reporting required; full intelligence/planning scope; MJOP indication included; maintenance prioritisation included; cost estimation included

Assumptions:
- Large roof with many installations.

## 6. Agricultural property

- Client type: Agrarisch vastgoed
- Object complexity: 5/5 - Complexity is scored 5/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 5/5 - Accessibility is scored 5/5 based on travel, site access and permission complexity.
- Inspection scope: 4/5 - Scope is scored 4/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 4.60
- Suggested quotation: EUR 1150
- Confidence: High

Signals:
- Complexity: medium gross size: 4200 m2; large roof area: 3100 m2; facade review adds effort: 1800 m2; many roof planes, details, structures or buildings; solar installation adds reporting complexity
- Accessibility: remote or rural access; multiple locations/buildings: 4
- Scope: gutters included; maintenance prioritisation included

Assumptions:
- Multiple sheds and farmhouse treated as one visit.

## 7. Solar park

- Client type: Energie asset
- Object complexity: 5/5 - Complexity is scored 5/5 based on object scale, roof/facade effort and technical details.
- Accessibility & location: 5/5 - Accessibility is scored 5/5 based on travel, site access and permission complexity.
- Inspection scope: 5/5 - Scope is scored 5/5 based on inspection depth and reporting/intelligence deliverables.
- Weighted score: 5.00
- Suggested quotation: EUR 1250
- Confidence: High

Signals:
- Complexity: industrial, logistics or solar-site scale; large gross size: 14000 m2; very large roof area: 12000 m2; many roof planes, details, structures or buildings; solar installation adds reporting complexity
- Accessibility: remote or rural access; permissions or flight restriction expected; multiple locations/buildings: 5
- Scope: structured reporting required; full intelligence/planning scope; thermography included; maintenance prioritisation included; cost estimation included; portfolio comparison included

Assumptions:
- Represents upper-bound validation object.
