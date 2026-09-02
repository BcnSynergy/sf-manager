import type { ElementType } from '@sf-manager/validation';

// Maps an ElementType enum value to its i18n key — same "value in, i18n key
// out" shape as community/locale-labels.ts's mapLocaleToLabelKey, kept as a
// pure function rather than calling useTranslation()'s t() itself so it
// stays independently testable without any i18n runtime/provider.
//
// design.md Decision 1 (the ElementType three-way-declaration seam) /
// "Element Type Label Mapping" spec requirement: `Record<ElementType,
// string>` means adding a new ElementType member without adding it here is
// a compile error, not a runtime raw-string leak. Callers pass the returned
// key to their own t() — the raw enum value MAY only back
// `<option value>` attributes and API payloads.
const ELEMENT_TYPE_LABEL_KEYS: Record<ElementType, string> = {
  EXTINGUISHER: 'inspectableElement.type.extinguisher',
};

export function mapElementTypeToLabelKey(elementType: ElementType): string {
  return ELEMENT_TYPE_LABEL_KEYS[elementType];
}
