# Farm-E Matching Evaluation

## Purpose

This small evaluation checks that recommendation rules behave as expected for quantity tolerance, certification requirements, unit conversion, and crop compatibility. It is a repeatable engineering smoke check for the project demonstration.

## Method

The script `server/scripts/evaluateMatching.js` creates three hand-written synthetic buyer scenarios and a small set of synthetic listings. Each listing is labeled relevant or not relevant before ranking. Listings that fail hard eligibility constraints are removed, and the remaining candidates are ordered by the Farm-E matching score.

Metrics reported:

- **Precision@3:** relevant candidates among the top three eligible results, averaged across scenarios.
- **Mean Reciprocal Rank (MRR):** average reciprocal rank of the first relevant eligible result.

## Results

| Synthetic scenario | Eligible candidates | Precision@3 | Reciprocal rank |
| --- | ---: | ---: | ---: |
| Tomato procurement with ±10% quantity tolerance | 3 | 0.667 | 1.000 |
| Organic certification requirement | 1 | 1.000 | 1.000 |
| Mass conversion and flexible bulk delivery | 2 | 1.000 | 1.000 |
| **Macro average** | **3 scenarios** | **0.889** | **1.000** |

The first scenario deliberately includes an over-budget listing among eligible results. This exposes a current product-design decision: price affects ranking, but it is not yet a strict disqualifier. If buyer maximum price is intended to be a hard constraint, that policy should be changed and covered with another test.

## Interpretation and limitations

The results demonstrate deterministic behavior on these three fixtures only. They are not evidence of real-world recommendation accuracy, user satisfaction, market coverage, fairness, or production performance. The fixture labels are manually authored and the sample is small. A stronger future evaluation should use consented or clearly synthetic representative cases, include edge cases across units and dates, define relevance criteria in advance, and compare ranking changes against a baseline.

Run from the `server/` directory:

```powershell
npm run evaluate:matching
```
