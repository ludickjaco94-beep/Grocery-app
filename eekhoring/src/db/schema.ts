import { column, Schema, Table } from '@powersync/react-native';

// Booleans are integer 0/1, dates are ISO text, money is integer cents. `id` is added by PowerSync.

const items = new Table({
  name: column.text,
  unit: column.text,
  category: column.text,
  buy_mode: column.text,
  buffer_pct: column.integer,
  max_months_cover: column.real,
  est_monthly_usage: column.real,
  pack_size: column.real,
  sold_by_weight: column.integer,
  active: column.integer,
  created_at: column.text,
});

const stores = new Table({
  name: column.text,
  is_city: column.integer,
  notes: column.text,
});

const purchases = new Table(
  {
    item_id: column.text,
    store_id: column.text,
    date: column.text,
    quantity: column.real,
    total_price_cents: column.integer,
    trip_id: column.text,
    is_emergency: column.integer,
    is_special: column.integer,
    regular_price_cents: column.integer,
    special_note: column.text,
    pack_count: column.integer,
  },
  { indexes: { item: ['item_id'] } }
);

const stock_counts = new Table(
  {
    item_id: column.text,
    date: column.text,
    quantity: column.real,
    source: column.text,
    entered_packs: column.integer,
  },
  { indexes: { item: ['item_id'] } }
);

const trips = new Table({
  date: column.text,
  store_id: column.text,
  fuel_cents: column.integer,
  toll_cents: column.integer,
  parking_cents: column.integer,
  other_cents: column.integer,
  notes: column.text,
});

const settings = new Table({
  currency_symbol: column.text,
  default_buffer_pct: column.integer,
  usage_window_months: column.integer,
});

const list_entries = new Table(
  {
    item_id: column.text,
    quantity: column.real,
    added_manually: column.integer,
    ticked: column.integer,
    ticked_at: column.text,
    ticked_by: column.text,
  },
  { indexes: { item: ['item_id'] } }
);

export const AppSchema = new Schema({ items, stores, purchases, stock_counts, trips, settings, list_entries });

export type Database = (typeof AppSchema)['types'];
export type ItemRecord = Database['items'];
