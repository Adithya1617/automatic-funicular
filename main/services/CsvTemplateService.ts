import { toCsv } from '@shared/utils/csv';
import type {
  CsvImportKind,
  CsvTemplateResponse,
} from '@shared/schemas/csvImport';

const HEADERS: Record<CsvImportKind, string[]> = {
  ingredients: ['name', 'category', 'type', 'base_unit', 'low_stock_threshold', 'density_g_per_ml'],
  suppliers: ['name', 'contact_info', 'notes'],
  menu_items: ['name', 'category', 'selling_price', 'variant_group', 'display_order'],
  recipes: ['parent_name', 'parent_type', 'child_ingredient_name', 'quantity', 'unit', 'notes'],
};

const SAMPLE_ROWS: Record<CsvImportKind, Array<(string | number)[]>> = {
  ingredients: [
    ['Basmati Rice', 'Grains', 'raw', 'g', 5000, ''],
    ['Sunflower Oil', 'Oils', 'raw', 'ml', 1000, 0.92],
    ['Biryani Masala', 'Spices', 'prepared', 'g', 200, ''],
  ],
  suppliers: [
    ['Hyderabad Spice Co.', 'orders@hsc.example', 'Calls Mon–Sat'],
    ['Fresh Veggies Mart', '+91 90000 00000', ''],
  ],
  menu_items: [
    ['Chicken Biryani (Half)', 'Mains', 220, 'biryani', 0],
    ['Chicken Biryani (Full)', 'Mains', 380, 'biryani', 1],
    ['Veg Pulao', 'Mains', 160, '', 2],
  ],
  recipes: [
    ['Chicken Biryani (Half)', 'menu_item', 'Basmati Rice', 200, 'g', ''],
    ['Chicken Biryani (Half)', 'menu_item', 'Biryani Masala', 15, 'g', ''],
    ['Biryani Masala', 'ingredient', 'Cardamom', 5, 'g', 'Bruise before grinding'],
  ],
};

export const CsvTemplateService = {
  template(kind: CsvImportKind): CsvTemplateResponse {
    const rows = [HEADERS[kind], ...SAMPLE_ROWS[kind]];
    return {
      kind,
      filename: `laurans_${kind}_template.csv`,
      content: toCsv(rows),
    };
  },
};
