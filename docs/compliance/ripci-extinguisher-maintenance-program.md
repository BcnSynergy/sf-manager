# RIPCI — Extinguisher Maintenance Program (verified excerpt)

Source: [RD 513/2017 (RIPCI)](https://www.boe.es/buscar/act.php?id=BOE-A-2017-6606),
Anexo II, "Mantenimiento mínimo de las instalaciones de protección contra
incendios", Tabla I (p. 34-36) and Tabla II (p. 37-38). Full text saved locally
as `RD-513-2017-RIPCI-consolidado.pdf` / `ripci.txt` in this folder. Retrieved
2026-08-20 from the BOE consolidated text.

## Who can perform each tier

- **Tabla I (trimestral)**: fabricante's specialized staff, an empresa
  mantenedora, **or** the usuario/titular of the installation's own staff.
  The law does not reserve this tier exclusively to the community — our
  policy of "3 quarters by the community representative, 1 by a technician"
  is an operational choice made *within* what the law permits, not a legal
  mandate.
- **Tabla II (anual and quinquenal)**: exclusively fabricante's specialized
  staff or empresa mantenedora staff. Never the titular/usuario. Matches
  [ADR-005](../adr/ADR-005-authorization-model-scoped-rbac.md)'s
  `MAINTENANCE_TECHNICIAN`-only assumption for `ANNUAL`-frequency reviews.

## Trimestral (Tabla I, "cada tres meses") — extintores de incendio

The law groups extintores/BIE/hidrantes/columnas secas/sistemas fijos in one
shared block of checks; the following are the extinguisher-relevant items
(exact per-equipment split isn't always textually separable in the source
table layout, noted where uncertain):

1. Que los extintores estén en su lugar asignado y no presenten muestras
   aparentes de daños.
2. Que son adecuados conforme al riesgo a proteger.
3. Que no tienen el acceso obstruido, son visibles o están señalizados y
   tienen sus instrucciones de manejo en la parte delantera.
4. Que las instrucciones de manejo son legibles.
5. Que el indicador de presión se encuentra en la zona de operación.
6. Que las partes metálicas (boquilla, válvula, manguera...) están en buen
   estado.
7. Que no faltan ni están rotos los precintos o los tapones indicadores de
   uso.
8. Que no han sido descargados total o parcialmente.
9. Comprobación de la señalización de los extintores.
10. Comprobación de la buena accesibilidad de los equipos.
11. Comprobación, por lectura del manómetro, de la presión.

> Equivalent alternative per the law: this requirement is also considered met
> if the checks from UNE 23120's "Programa de Mantenimiento Trimestral" are
> performed instead.

This maps directly to `ChecklistQuestion` records with
`elementType: EXTINGUISHER`, `frequencies: [QUARTERLY]` (or `[QUARTERLY,
ANNUAL]` for any that also apply to the annual visit — see below).

## Anual (Tabla II, "cada año") — extintores de incendio

> "Realizar las operaciones de mantenimiento según lo establecido en el
> 'Programa de Mantenimiento Anual' de la norma UNE 23120. En extintores
> móviles, se comprobará, adicionalmente, el buen estado del sistema de
> traslado."

**Resolved**: RIPCI itself does not enumerate the annual checklist — it
defers entirely to **UNE 23120**, a paid AENOR standard not publicly
accessible. Per the user (who runs this process in practice): the empresa
mantenedora provides the actual question set their technician needs
answered for the review to be valid and certifiable by them. So the
`ANNUAL` `ChecklistQuestion` set for `EXTINGUISHER` is sourced from the
community's actual maintenance company, entered through question management
(FR-005) — not seeded from public regulation text.

## Quinquenal (Tabla II, "cinco años") — retimbrado

> "A partir de la fecha de timbrado del extintor (y por tres veces) se
> procederá al retimbrado del mismo de acuerdo a lo establecido en el anexo
> III del Reglamento de Equipos a Presión, aprobado por Real Decreto
> 809/2021."

Confirms retimbrado is **not** a community-scheduled, in-situ checklist like
`ReviewSession`:
- The clock is **per physical extinguisher** (from its own timbrado/stamp
  date), not per community or calendar quarter.
- It repeats up to **3 times** at 5-year intervals, governed by a *different*
  regulation (Reglamento de Equipos a Presión, RD 809/2021), not RIPCI's
  Anexo II checklist format.
- It's a pressure test, typically performed off-site.

**Decision**: kept explicitly out of scope for the `ReviewSession` /
`ChecklistQuestion` model. If tracked at all later, it belongs on
`InspectableElement` as its own concern (e.g. a `stampedAt` date +
retimbrado history), not as a `ReviewFrequency` value — revisit when/if it's
prioritized.

## Related but out of scope: 10-year control-body inspection

RD 164/2025 (amending RIPCI's article 22) requires periodic inspection by an
accredited external control body at least every 10 years — **but explicitly
exempts "uso residencial vivienda"** (residential use). A comunidad de
vecinos is exempt. Confirmed not applicable to this app's scope. Full text
saved locally as `RD-164-2025-modificaciones-RIPCI-consolidado.pdf` /
`rd164.txt`.

## Open items

- [x] Source the real `ANNUAL` extintor questionnaire — resolved: sourced
  from the community's maintenance company, entered via question management.
- [x] Decide whether/how to track retimbrado — resolved:
  `InspectableElement.lastRetimbradoAt` + `retimbradoCount`, see domain
  model doc.
