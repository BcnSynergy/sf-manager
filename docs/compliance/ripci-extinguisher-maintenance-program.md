# RIPCI — Extinguisher Maintenance Program (verified excerpt)

Source: [RD 513/2017 (RIPCI)](https://www.boe.es/buscar/act.php?id=BOE-A-2017-6606),
Anexo II, "Mantenimiento mínimo de las instalaciones de protección contra
incendios", Tabla I (p. 34-36) and Tabla II (p. 37-38). Full text saved locally
as `RD-513-2017-RIPCI-consolidado.pdf` / `ripci.txt` in this folder. Retrieved
2026-08-20 from the BOE consolidated text.

> **Convention**: every blockquote in this document is a **verbatim
> citation** from the official Spanish text, kept untranslated on purpose
> so it stays checkable word-for-word against the source — each is preceded
> by a short *italic* locator (article/tabla/página). Everything outside a
> blockquote is our own English analysis/summary.

## Who can perform each tier

- **Tabla I (quarterly)**: the manufacturer's specialized staff, a
  maintenance company, **or** the installation's owner/occupant's own
  staff. The law does not reserve this tier exclusively to the community —
  our policy of "3 quarters by the community representative, 1 by a
  technician" is an operational choice made *within* what the law permits,
  not a legal mandate.
- **Tabla II (annual and every five years)**: exclusively the
  manufacturer's specialized staff or a maintenance company's staff. Never
  the owner/occupant. Matches
  [ADR-011](../adr/ADR-011-expanded-roles-and-auth-architecture.md)'s
  `MAINTENANCE_TECHNICIAN`-only assumption for `ANNUAL`-frequency reviews.

## Quarterly (Tabla I, "cada tres meses") — fire extinguishers

The law groups fire extinguishers/BIE/hydrants/dry risers/fixed systems in
one shared block of checks; the following are the extinguisher-relevant
items (exact per-equipment split isn't always textually separable in the
source table layout, noted where uncertain):

*RIPCI, Anexo II, Tabla I, p. 34-36:*
> 1. Que los extintores estén en su lugar asignado y no presenten muestras
>    aparentes de daños.
> 2. Que son adecuados conforme al riesgo a proteger.
> 3. Que no tienen el acceso obstruido, son visibles o están señalizados y
>    tienen sus instrucciones de manejo en la parte delantera.
> 4. Que las instrucciones de manejo son legibles.
> 5. Que el indicador de presión se encuentra en la zona de operación.
> 6. Que las partes metálicas (boquilla, válvula, manguera...) están en
>    buen estado.
> 7. Que no faltan ni están rotos los precintos o los tapones indicadores
>    de uso.
> 8. Que no han sido descargados total o parcialmente.
> 9. Comprobación de la señalización de los extintores.
> 10. Comprobación de la buena accesibilidad de los equipos.
> 11. Comprobación, por lectura del manómetro, de la presión.

Equivalent alternative per the law: this requirement is also considered met
if the checks from UNE 23120's "Programa de Mantenimiento Trimestral" are
performed instead.

This maps directly to `ChecklistQuestion` records with
`elementType: EXTINGUISHER`, `frequencies: [QUARTERLY]` (or `[QUARTERLY,
ANNUAL]` for any that also apply to the annual visit — see below).

## Annual (Tabla II, "cada año") — fire extinguishers

*RIPCI, Anexo II, Tabla II, p. 37-38:*
> "Realizar las operaciones de mantenimiento según lo establecido en el
> 'Programa de Mantenimiento Anual' de la norma UNE 23120. En extintores
> móviles, se comprobará, adicionalmente, el buen estado del sistema de
> traslado."

**Resolved**: RIPCI itself does not enumerate the annual checklist — it
defers entirely to **UNE 23120**, a paid AENOR standard not publicly
accessible. Per the user (who runs this process in practice): the
maintenance company provides the actual question set their technician
needs answered for the review to be valid and certifiable by them. So the
`ANNUAL` `ChecklistQuestion` set for `EXTINGUISHER` is sourced from the
community's actual maintenance company, entered through question management
(FR-005) — not seeded from public regulation text.

## Every five years (Tabla II, "cinco años") — hydrostatic test

*RIPCI, Anexo II, Tabla II, p. 37-38:*
> "A partir de la fecha de timbrado del extintor (y por tres veces) se
> procederá al retimbrado del mismo de acuerdo a lo establecido en el anexo
> III del Reglamento de Equipos a Presión, aprobado por Real Decreto
> 809/2021."

RIPCI's own term is "retimbrado"; the regulation glosses it elsewhere as the
hydraulic/hydrostatic pressure test verifying structural integrity — named
in English per the project's naming convention (see
[domain model doc](../architecture/domain-model-inspections.md)).

Confirms the hydrostatic test is **not** a community-scheduled, in-situ
checklist like `ReviewSession`:
- The clock is **per physical extinguisher** (from its own stamp date, not
  per community or calendar quarter).
- It repeats up to **3 times** at 5-year intervals, governed by a *different*
  regulation (Reglamento de Equipos a Presión, RD 809/2021), not RIPCI's
  Anexo II checklist format.
- It's a pressure test, typically performed off-site.

**Decision**: kept explicitly out of scope for the `ReviewSession` /
`ChecklistQuestion` model.
`InspectableElement.lastHydrostaticTestAt` + `hydrostaticTestCount` track it
directly (see domain model doc) — not modeled as a `ReviewFrequency` value.

## Related but out of scope: 10-year control-body inspection

RD 164/2025 (amending RIPCI's article 22) requires periodic inspection by an
accredited external control body at least every 10 years — **but explicitly
exempts "uso residencial vivienda"** (residential use). A residential
community is exempt. Confirmed not applicable to this app's scope. Full text
saved locally as `RD-164-2025-modificaciones-RIPCI-consolidado.pdf` /
`rd164.txt`.

## Open items

- [x] Source the real `ANNUAL` extinguisher questionnaire — resolved:
  sourced from the community's maintenance company, entered via question
  management.
- [x] Decide whether/how to track the hydrostatic test — resolved:
  `InspectableElement.lastHydrostaticTestAt` + `hydrostaticTestCount`, see
  domain model doc.
