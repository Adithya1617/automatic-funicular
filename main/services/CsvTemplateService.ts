import { toCsv } from '@shared/utils/csv';
import type {
  CsvImportKind,
  CsvTemplateResponse,
} from '@shared/schemas/csvImport';

const HEADERS: Record<CsvImportKind, string[]> = {
  parts: ['name', 'category', 'base_unit', 'low_stock_threshold', 'density_g_per_ml'],
  suppliers: ['name', 'contact_info', 'notes'],
  bikes: ['bike_number', 'engine_cc', 'bike_type', 'license_plate', 'odometer_km', 'notes'],
  service_templates: [
    'template_name',
    'engine_cc',
    'bike_type',
    'part_name',
    'quantity',
    'unit',
    'display_order',
    'notes',
  ],
};

const SAMPLE_ROWS: Record<CsvImportKind, Array<(string | number)[]>> = {
  parts: [
    ['Engine oil', 'Oil', 'ml', 500, 0.87],
    ['Brake pad', 'Brake', 'each', 4, ''],
    ['Air filter', 'Filter', 'each', 2, ''],
  ],
  suppliers: [
    ['Bosch Spares', 'orders@bosch-spares.example', 'Calls Mon–Sat'],
    ['Castrol Distributor', '+91 90000 00000', ''],
  ],
  bikes: [
    [1, 125, 'Ntorq', 'TG08T0481', '', ''],
    [2, 110, 'Activa', 'TS08UL8345', '', ''],
    [3, 160, 'Apache', 'TG08X0014', '', ''],
  ],
  service_templates: [
    ['Standard service', 125, 'Ntorq', 'Engine oil', 800, 'ml', 0, ''],
    ['Standard service', 125, 'Ntorq', 'Air filter', 1, 'each', 1, ''],
    ['Brake job', 125, 'Ntorq', 'Brake pad', 2, 'each', 0, 'Front + rear'],
  ],
};

export const CsvTemplateService = {
  template(kind: CsvImportKind): CsvTemplateResponse {
    const rows = [HEADERS[kind], ...SAMPLE_ROWS[kind]];
    return {
      kind,
      filename: `hyprride_${kind}_template.csv`,
      content: toCsv(rows),
    };
  },
};
