import type {
  DevAssignment,
  DevDataset,
  DevElement,
  DevSession,
  DevUser,
} from './dev-dataset';

// demo-seed-data: the public demo's fictitious dataset, approved by the user
// (draft v1, 2026-11-27; odd/tasks/demo-instance.md S7-S11). The nightly
// reset seeds exactly this, so the demo always shows the same data and the
// same QR codes (S8, S9). Every name, address, tax id and phone is made up.

// Public: shown on the demo login page. Like the dev password, it goes
// through CreateUser, so the shared password policy validates it.
export const DEMO_SEED_PASSWORD = 'sf-manager-demo-1';

export type DemoDataset = DevDataset & {
  // The organization logo, uploaded through the logo use case.
  logoSvg: string;
};

const DOMAIN = '@demo.sf-manager.example';
const user = (local: string) => `${local}${DOMAIN}`;

const C1 = 'B99100001';
const C2 = 'B99100002';
const C3 = 'B99100003';

const TECNICO_1A = user('tecnico1a');
const TECNICO_1B = user('tecnico1b');
const TECNICO_2 = user('tecnico2');
const TECNICO_3 = user('tecnico3');
const PRESIDENTE_1 = user('presidente1');
const PRESIDENTE_2 = user('presidente2');
const PRESIDENTE_3 = user('presidente3');

const MA = 'Comunidad de Propietarios Mar Azul';
const JA = 'Comunitat de Propietaris Jardins Augusta';
const SE = 'Comunitat de Propietaris Sant Elm';
const PR = 'Comunidad de Propietarios Parc Rambla';
const VD = 'Comunitat de Propietaris Vista Daurada';
const TR = 'Comunidad de Propietarios Torre Roja';

const users: DevUser[] = [
  {
    email: user('gestor'),
    role: 'MANAGER',
    managerCapabilities: ['VIEW_ALL_REVIEWS'],
  },
  {
    email: user('empresa1'),
    role: 'MAINTENANCE_COMPANY_MANAGER',
    companyTaxId: C1,
  },
  {
    email: user('empresa2'),
    role: 'MAINTENANCE_COMPANY_MANAGER',
    companyTaxId: C2,
  },
  {
    email: user('empresa3'),
    role: 'MAINTENANCE_COMPANY_MANAGER',
    companyTaxId: C3,
  },
  {
    email: TECNICO_1A,
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: C1,
    signatureVariant: 1,
  },
  {
    email: TECNICO_1B,
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: C1,
    signatureVariant: 2,
  },
  {
    email: TECNICO_2,
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: C2,
    signatureVariant: 3,
  },
  {
    email: TECNICO_3,
    role: 'MAINTENANCE_TECHNICIAN',
    companyTaxId: C3,
    signatureVariant: 4,
  },
  {
    email: PRESIDENTE_1,
    role: 'COMMUNITY_REPRESENTATIVE',
    signatureVariant: 5,
  },
  {
    email: PRESIDENTE_2,
    role: 'COMMUNITY_REPRESENTATIVE',
    signatureVariant: 6,
  },
  {
    email: PRESIDENTE_3,
    role: 'COMMUNITY_REPRESENTATIVE',
    signatureVariant: 7,
  },
];

const technician = (
  communityName: string,
  userEmail: string,
): DevAssignment => ({
  communityName,
  userEmail,
  as: 'TECHNICIAN',
});
const representative = (
  communityName: string,
  userEmail: string,
): DevAssignment => ({
  communityName,
  userEmail,
  as: 'REPRESENTATIVE',
});

const assignments: DevAssignment[] = [
  technician(MA, TECNICO_1A),
  technician(JA, TECNICO_1A),
  technician(JA, TECNICO_1B),
  technician(SE, TECNICO_1B),
  technician(PR, TECNICO_2),
  technician(TR, TECNICO_2),
  technician(VD, TECNICO_3),
  representative(MA, PRESIDENTE_1),
  representative(JA, PRESIDENTE_1),
  representative(SE, PRESIDENTE_2),
  representative(PR, PRESIDENTE_2),
  representative(VD, PRESIDENTE_3),
  representative(TR, PRESIDENTE_3),
];

// [code, name, location, description, serial number, installed]
type Row = [string, string, string, string, string, string];

const extinguishers = (communityName: string, rows: Row[]): DevElement[] =>
  rows.map(
    ([code, name, location, description, serialNumber, installedAt]) => ({
      communityName,
      code,
      elementType: 'EXTINGUISHER',
      name,
      location,
      description,
      serialNumber,
      installedAt,
    }),
  );

// Installation dates mix before and after 2018 on purpose: the height
// question has a different range for each.
const elements: DevElement[] = [
  ...extinguishers(MA, [
    [
      'DEMMAEXT22',
      'Extintor 1',
      'Vestíbulo, junto al ascensor',
      'Polvo ABC 6 kg',
      'PA6-100231',
      '2016-03-14',
    ],
    [
      'DEMMAEXT23',
      'Extintor 2',
      'Garaje, plaza 4',
      'Polvo ABC 6 kg',
      'PA6-100232',
      '2016-03-14',
    ],
    [
      'DEMMAEXT24',
      'Extintor 3',
      'Cuarto de contadores',
      'CO₂ 5 kg',
      'CO5-200118',
      '2019-06-03',
    ],
  ]),
  ...extinguishers(JA, [
    [
      'DEMJAEXT22',
      'Extintor 1',
      'Vestíbul principal',
      'Pols ABC 6 kg',
      'PA6-100410',
      '2020-01-20',
    ],
    [
      'DEMJAEXT23',
      'Extintor 2',
      'Escala A, planta 2',
      'Pols ABC 6 kg',
      'PA6-100411',
      '2020-01-20',
    ],
    [
      'DEMJAEXT24',
      'Extintor 3',
      'Escala B, planta 4',
      'Pols ABC 6 kg',
      'PA6-100412',
      '2020-01-20',
    ],
    [
      'DEMJAEXT25',
      'Extintor 4',
      'Aparcament, rampa',
      'Pols ABC 9 kg',
      'PA9-300087',
      '2020-01-20',
    ],
    [
      'DEMJAEXT26',
      'Extintor 5',
      'Sala de calderes',
      'CO₂ 5 kg',
      'CO5-200311',
      '2021-09-08',
    ],
  ]),
  ...extinguishers(SE, [
    [
      'DEMSEEXT22',
      'Extintor 1',
      'Porteria',
      'Pols ABC 6 kg',
      'PA6-100577',
      '2015-11-02',
    ],
    [
      'DEMSEEXT23',
      'Extintor 2',
      'Pàrquing, accés vianants',
      'Pols ABC 6 kg',
      'PA6-100578',
      '2015-11-02',
    ],
    [
      'DEMSEEXT24',
      'Extintor 3',
      'Terrat, sala de màquines',
      'CO₂ 2 kg',
      'CO2-400029',
      '2022-04-11',
    ],
    [
      'DEMSEEXT25',
      'Extintor 4',
      'Local comunitari',
      'Pols ABC 6 kg',
      'PA6-100980',
      '2022-04-11',
    ],
  ]),
  ...extinguishers(PR, [
    [
      'DEMPREXT22',
      'Extintor 1',
      'Portal',
      'Polvo ABC 6 kg',
      'PA6-101102',
      '2018-05-22',
    ],
    [
      'DEMPREXT23',
      'Extintor 2',
      'Rellano planta 3',
      'Polvo ABC 6 kg',
      'PA6-101103',
      '2018-05-22',
    ],
    [
      'DEMPREXT24',
      'Extintor 3',
      'Rellano planta 6',
      'Polvo ABC 6 kg',
      'PA6-101104',
      '2018-05-22',
    ],
    [
      'DEMPREXT25',
      'Extintor 4',
      'Cuarto de basuras',
      'Polvo ABC 3 kg',
      'PA3-500214',
      '2023-02-15',
    ],
  ]),
  ...extinguishers(VD, [
    [
      'DEMVDEXT22',
      'Extintor 1',
      'Vestíbul',
      'Pols ABC 6 kg',
      'PA6-101330',
      '2017-07-01',
    ],
    [
      'DEMVDEXT23',
      'Extintor 2',
      'Piscina, vestidors',
      'Pols ABC 6 kg',
      'PA6-101331',
      '2017-07-01',
    ],
    [
      'DEMVDEXT24',
      'Extintor 3',
      'Garatge, planta -1',
      'Pols ABC 9 kg',
      'PA9-300190',
      '2017-07-01',
    ],
    [
      'DEMVDEXT25',
      'Extintor 4',
      'Garatge, planta -2',
      'Pols ABC 9 kg',
      'PA9-300191',
      '2017-07-01',
    ],
    [
      'DEMVDEXT26',
      'Extintor 5',
      'Sala del grup de pressió',
      'CO₂ 5 kg',
      'CO5-200455',
      '2024-03-19',
    ],
  ]),
  ...extinguishers(TR, [
    [
      'DEMTREXT22',
      'Extintor 1',
      'Vestíbulo',
      'Polvo ABC 6 kg',
      'PA6-101650',
      '2019-10-07',
    ],
    [
      'DEMTREXT23',
      'Extintor 2',
      'Garaje, junto a la rampa',
      'Polvo ABC 9 kg',
      'PA9-300244',
      '2019-10-07',
    ],
    [
      'DEMTREXT24',
      'Extintor 3',
      'Cuarto de ascensores',
      'CO₂ 5 kg',
      'CO5-200502',
      '2019-10-07',
    ],
  ]),
];

// The user's list, Spanish only (questions hold one text). T questions are
// asked every quarter and again in the annual review; A questions only in
// the annual one. The pressure question (a T) sits with the other T ones.
const SEAL = '¿Los precintos y/o seguros están intactos?';
const PRESSURE =
  'Comprobación de la presión interior (mediante pesada en los de CO₂ y mediante manómetro en los restantes): ¿es correcta? (En presión permanente)';
const RESTAMPED =
  '¿Está retimbrado conforme al Reglamento de Aparatos a Presión - ITC MIE-AP5?';

const QUARTERLY_TEXTS = [
  '¿Es visible?',
  '¿Es accesible?',
  '¿Su situación es correcta?',
  '¿Su señalización es adecuada?',
  '¿El anclaje y soporte son correctos?',
  '¿La altura desde el suelo es correcta (entre 80 cm y 120 cm a partir de 2018) (0 a 170 cm antes de 2018)?',
  'Aspecto externo: ¿está exento de corrosión, golpes o abolladuras?',
  SEAL,
  'En caso de que haya sido abierto, ¿dispone del sistema indicativo de apertura?',
  'La identificación y etiqueta del extintor, ¿son correctos?',
  'Los extintores de más de 3 kg, ¿tienen manguera?',
  'Inspección visual de manguera y boquilla: ¿están en buen estado?',
  'Inspección visual de válvula: ¿está en buen estado?',
  'Comprobación del estado de la carga mediante pesada: ¿el peso es correcto?',
  PRESSURE,
];

const ANNUAL_TEXTS = [
  'Comprobación del estado del agente: ¿está exento de anomalías aparentes?',
  '¿Tiene marca de conformidad a normas?',
  RESTAMPED,
  'Desmontaje del botellín y pesaje: ¿es correcto el peso de la carga? (En presión adosada)',
  '¿Está retimbrado el botellín conforme al RAP? (En presión adosada)',
];

// Completed sessions only list their NO entries: completion covers every
// other active element with YES. `daysAgo` dates them so the schedule shows
// up-to-date, due and overdue obligations.
const completed = (
  performerEmail: string,
  communityName: string,
  frequency: DevSession['frequency'],
  daysAgo: number,
  entries: DevSession['entries'] = [],
): DevSession => ({
  performerEmail,
  communityName,
  frequency,
  complete: true,
  daysAgo,
  entries,
});

const sessions: DevSession[] = [
  completed(TECNICO_1A, MA, 'ANNUAL', 330),
  completed(PRESIDENTE_1, MA, 'QUARTERLY', 60, [
    { elementName: 'Extintor 2', outcome: 'NO', noOn: SEAL },
  ]),
  completed(PRESIDENTE_1, JA, 'QUARTERLY', 150),
  completed(TECNICO_1A, JA, 'QUARTERLY', 55),
  completed(TECNICO_1B, SE, 'ANNUAL', 395, [
    { elementName: 'Extintor 3', outcome: 'NO', noOn: RESTAMPED },
  ]),
  completed(PRESIDENTE_2, PR, 'QUARTERLY', 30),
  completed(TECNICO_3, VD, 'ANNUAL', 180),
  completed(PRESIDENTE_3, VD, 'QUARTERLY', 120, [
    { elementName: 'Extintor 4', outcome: 'NO', noOn: PRESSURE },
  ]),
  completed(TECNICO_3, VD, 'QUARTERLY', 35),
  completed(PRESIDENTE_3, TR, 'QUARTERLY', 90),
  completed(TECNICO_2, TR, 'ANNUAL', 300),
  // A draft a demo visitor can finish as tecnico1b: two of five recorded.
  {
    performerEmail: TECNICO_1B,
    communityName: JA,
    frequency: 'QUARTERLY',
    complete: false,
    entries: [
      { elementName: 'Extintor 1', outcome: 'YES' },
      { elementName: 'Extintor 2', outcome: 'YES' },
    ],
  },
];

// A plain "FM" monogram (Finques Mediterrània), made for the demo.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="36" fill="#0b4f6c"/>
  <circle cx="120" cy="120" r="88" fill="none" stroke="#f2c14e" stroke-width="8"/>
  <text x="120" y="145" text-anchor="middle" font-family="Georgia, serif" font-size="80" font-weight="bold" fill="#ffffff">FM</text>
</svg>
`;

export const DEMO_DATASET: DemoDataset = {
  password: DEMO_SEED_PASSWORD,
  logoSvg: LOGO_SVG,
  profile: {
    name: 'Finques Mediterrània',
    legalName: 'Finques Mediterrània Administració S.L.',
    taxId: 'B99100000',
    address: 'Carrer del Rosselló 250, 3r 1a, 08008 Barcelona',
    phone: '+34 930 000 100',
    email: `info${DOMAIN}`,
  },
  companies: [
    {
      name: 'Extintores Llobregat S.L.',
      taxId: C1,
      contactInfo: `+34 930 000 201 · llobregat${DOMAIN}`,
    },
    {
      name: 'ProtecFoc Serveis S.L.',
      taxId: C2,
      contactInfo: `+34 930 000 202 · protecfoc${DOMAIN}`,
    },
    {
      name: 'Garraf Seguridad Contra Incendios S.L.',
      taxId: C3,
      contactInfo: `+34 930 000 203 · garraf${DOMAIN}`,
    },
  ],
  users,
  communities: [
    {
      name: MA,
      address: 'Calle de Sardenya 412, 08025 Barcelona',
      locale: 'es',
    },
    { name: JA, address: 'Via Augusta 180, 08021 Barcelona', locale: 'ca' },
    {
      name: SE,
      address: 'Carrer de Sant Elm 14, 08840 Viladecans',
      locale: 'ca',
    },
    {
      name: PR,
      address: 'Rambla de Catalunya 98, 08008 Barcelona',
      locale: 'es',
    },
    {
      name: VD,
      address: 'Passeig Marítim 33, 08860 Castelldefels',
      locale: 'ca',
    },
    {
      name: TR,
      address: 'Avenida Diagonal 520, 08006 Barcelona',
      locale: 'es',
    },
  ],
  assignments,
  elements,
  questions: [
    ...QUARTERLY_TEXTS.map((text) => ({
      elementType: 'EXTINGUISHER' as const,
      frequencies: ['QUARTERLY' as const, 'ANNUAL' as const],
      text,
    })),
    ...ANNUAL_TEXTS.map((text) => ({
      elementType: 'EXTINGUISHER' as const,
      frequencies: ['ANNUAL' as const],
      text,
    })),
  ],
  templates: [
    {
      elementType: 'EXTINGUISHER',
      frequency: 'QUARTERLY',
      name: 'Extintores — Revisión trimestral',
    },
    {
      elementType: 'EXTINGUISHER',
      frequency: 'ANNUAL',
      name: 'Extintores — Revisión anual',
    },
  ],
  sessions,
};
